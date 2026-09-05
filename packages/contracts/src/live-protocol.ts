import type { FigmaSceneArtifact, ImportResultArtifact } from './artifacts.js';
import { validateArtifact } from './validation.js';

export const LIVE_PROTOCOL_VERSION = '1.1.0' as const;
export const MAX_WIRE_BYTES = 500 * 1024 * 1024;
export interface Destination {
  documentName: string;
  pageName: string;
  pageId: string;
}
export interface WireAsset {
  contentHash: string;
  base64: string;
}
interface Base {
  protocolVersion: typeof LIVE_PROTOCOL_VERSION;
  runId: string;
}
export type LiveMessage =
  | (Base & {
      type: 'hello';
      authToken: string;
      clientId: string;
      destination: Destination;
    })
  | (Base & { type: 'hello-ack'; accepted: true })
  | (Base & {
      type: 'import-request';
      scene: FigmaSceneArtifact;
      assets: WireAsset[];
      width: number;
      height: number;
      destination: Destination;
    })
  | (Base & {
      type: 'import-result';
      result: ImportResultArtifact;
      png: string;
      destination: Destination;
    })
  | (Base & { type: 'error'; message: string });
export type ImportRequest = Extract<LiveMessage, { type: 'import-request' }>;
export type ImportResponse = Extract<LiveMessage, { type: 'import-result' }>;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected object');
  return value as Record<string, unknown>;
}
function string(value: unknown, max = 4096): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}
function exact(value: Record<string, unknown>, fields: string[]) {
  if (
    Object.keys(value).some((key) => !fields.includes(key)) ||
    fields.some((key) => !(key in value))
  )
    throw new Error('Unexpected message fields');
}
function destination(value: unknown) {
  const d = object(value);
  exact(d, ['documentName', 'pageName', 'pageId']);
  if (!string(d.documentName) || !string(d.pageName) || !string(d.pageId, 128))
    throw new Error('Invalid destination');
}
function base64(value: unknown, allowEmpty = false) {
  if (allowEmpty && value === '') return;
  if (
    !string(value, MAX_WIRE_BYTES) ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new Error('Invalid base64 payload');
}
export function parseLiveMessage(input: unknown): LiveMessage {
  const m = object(input);
  if (
    m.protocolVersion !== LIVE_PROTOCOL_VERSION ||
    !string(m.runId, 128) ||
    !/^run:[\w-]+$/.test(m.runId)
  )
    throw new Error('Incompatible protocol or run ID');
  const base = ['type', 'protocolVersion', 'runId'];
  switch (m.type) {
    case 'hello':
      exact(m, [...base, 'authToken', 'clientId', 'destination']);
      if (
        !string(m.authToken, 64) ||
        !/^[a-f0-9]{64}$/.test(m.authToken) ||
        !string(m.clientId, 128)
      )
        throw new Error('Invalid authentication');
      destination(m.destination);
      break;
    case 'hello-ack':
      exact(m, [...base, 'accepted']);
      if (m.accepted !== true) throw new Error('Invalid acknowledgement');
      break;
    case 'import-request': {
      exact(m, [...base, 'scene', 'assets', 'width', 'height', 'destination']);
      destination(m.destination);
      const v = validateArtifact(m.scene);
      if (
        !v.ok ||
        v.value.artifactKind !== 'figma-scene' ||
        v.value.runId !== m.runId
      )
        throw new Error('Invalid scene artifact');
      if (
        !Number.isInteger(m.width) ||
        !Number.isInteger(m.height) ||
        (m.width as number) <= 0 ||
        (m.height as number) <= 0 ||
        (m.height as number) > 30000 ||
        (m.width as number) * (m.height as number) > 50_000_000
      )
        throw new Error('Invalid render dimensions');
      if (
        !Array.isArray(m.assets) ||
        m.assets.length > 15000 ||
        v.value.payload.nodes.length > 15000
      )
        throw new Error('Scene limits exceeded');
      const hashes = new Set<string>();
      for (const value of m.assets) {
        const asset = object(value);
        exact(asset, ['contentHash', 'base64']);
        if (
          !string(asset.contentHash, 64) ||
          !/^[a-f0-9]{64}$/.test(asset.contentHash) ||
          hashes.has(asset.contentHash)
        )
          throw new Error('Invalid asset identity');
        hashes.add(asset.contentHash);
        base64(asset.base64);
      }
      assertSceneTree(v.value);
      break;
    }
    case 'import-result': {
      exact(m, [...base, 'result', 'png', 'destination']);
      destination(m.destination);
      base64(m.png, true);
      const v = validateArtifact(m.result);
      if (
        !v.ok ||
        v.value.artifactKind !== 'import-result' ||
        v.value.runId !== m.runId
      )
        throw new Error('Invalid import result');
      break;
    }
    case 'error':
      exact(m, [...base, 'message']);
      if (!string(m.message)) throw new Error('Invalid error');
      break;
    default:
      throw new Error('Unknown message type');
  }
  return input as LiveMessage;
}

/** Check hierarchy before any mutation, without recursive traversal of untrusted input. */
export function assertSceneTree(scene: FigmaSceneArtifact) {
  const nodes = new Map(scene.payload.nodes.map((n) => [n.sceneNodeId, n]));
  const roots = scene.payload.nodes
    .filter((n) => n.parentNodeId === null)
    .map((n) => n.sceneNodeId);
  if (
    roots.length === 0 ||
    roots.length !== scene.payload.rootNodeIds.length ||
    roots.some((id) => !scene.payload.rootNodeIds.includes(id))
  )
    throw new Error('Invalid scene roots');
  const seen = new Set<string>();
  const queue = [...roots];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (!id || seen.has(id)) throw new Error('Cyclic or duplicate scene child');
    seen.add(id);
    const n = nodes.get(id);
    if (!n) throw new Error('Missing scene node');
    for (const child of n.childNodeIds) {
      if (nodes.get(child)?.parentNodeId !== id)
        throw new Error('Inconsistent scene hierarchy');
      queue.push(child);
    }
  }
  if (seen.size !== nodes.size) throw new Error('Unreachable scene nodes');
}
