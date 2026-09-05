import { expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  LIVE_PROTOCOL_VERSION,
  parseLiveMessage,
  type FigmaSceneArtifact,
  type CandidateResponse,
} from '@website-to-figma/contracts';
import { createLiveSession } from './live-session.js';
const destination = { documentName: 'Test', pageName: 'Page', pageId: '1:2' };
const scene: FigmaSceneArtifact = {
  schemaVersion: '1.0.0',
  artifactKind: 'figma-scene',
  runId: 'run:test',
  sourceUrl: 'https://example.com/',
  capturedAt: '2026-09-04T00:00:00Z',
  viewport: { width: 100, height: 100, deviceScaleFactor: 1 },
  payload: {
    sourceNodeIds: ['dom:0'],
    rootNodeIds: ['scene:0'],
    assets: [],
    nodes: [
      {
        sceneNodeId: 'scene:0',
        sourceNodeId: 'dom:0',
        parentNodeId: null,
        childNodeIds: [],
        kind: 'frame',
        name: 'Root',
        rect: { x: 0, y: 0, width: 100, height: 100 },
      },
    ],
  },
};
it('waits for an authenticated plugin connection before resolving', async () => {
  const session = await createLiveSession('run:test', 3000);
  let connected = false;
  const waiting = session.waitForConnection().then((value) => {
    connected = true;
    return value;
  });
  try {
    const socket = new WebSocket(session.descriptor.url);
    await new Promise<void>((resolve) => socket.once('open', resolve));
    await Promise.resolve();
    expect(connected).toBe(false);
    socket.send(
      JSON.stringify({
        type: 'hello',
        protocolVersion: LIVE_PROTOCOL_VERSION,
        runId: 'run:test',
        authToken: session.descriptor.authToken,
        clientId: 'waiting-client',
        destination,
      }),
    );
    await expect(waiting).resolves.toEqual(destination);
  } finally {
    await session.close();
  }
});
it('rejects an unauthenticated peer, reconnects the bound client and validates results', async () => {
  const session = await createLiveSession('run:test', 3000);
  try {
    const bad = new WebSocket(session.descriptor.url);
    await new Promise<void>((resolve) => {
      bad.on('open', () => {
        bad.send(
          JSON.stringify({
            type: 'hello',
            protocolVersion: LIVE_PROTOCOL_VERSION,
            runId: 'run:test',
            authToken: '0'.repeat(64),
            clientId: 'bad',
            destination,
          }),
        );
      });
      bad.on('close', () => {
        resolve();
      });
    });
    const result = session.importScene({
      protocolVersion: LIVE_PROTOCOL_VERSION,
      type: 'candidate-request',
      revision: 0,
      runId: 'run:test',
      scene,
      assets: [],
      width: 100,
      height: 100,
    });
    let requests = 0;
    const connect = () => {
      const socket = new WebSocket(session.descriptor.url);
      socket.on('open', () => {
        socket.send(
          JSON.stringify({
            type: 'hello',
            protocolVersion: LIVE_PROTOCOL_VERSION,
            runId: 'run:test',
            authToken: session.descriptor.authToken,
            clientId: 'same-client',
            destination,
          }),
        );
      });
      socket.on('message', (raw) => {
        const message = parseLiveMessage(
          JSON.parse(
            Buffer.isBuffer(raw)
              ? raw.toString('utf8')
              : Array.isArray(raw)
                ? Buffer.concat(raw).toString('utf8')
                : Buffer.from(raw).toString('utf8'),
          ) as unknown,
        );
        if (message.type !== 'candidate-request') return;
        requests++;
        if (requests === 1) {
          socket.close();
          socket.once('close', connect);
          return;
        }
        const response: CandidateResponse = {
          protocolVersion: LIVE_PROTOCOL_VERSION,
          type: 'candidate-result',
          revision: message.revision,
          runId: 'run:test',
          destination,
          png: '',
          result: {
            ...scene,
            artifactKind: 'import-result',
            payload: {
              status: 'partial',
              sceneNodeIds: ['scene:0'],
              nodes: [
                {
                  sceneNodeId: 'scene:0',
                  figmaNodeId: '1:3',
                  status: 'created',
                },
              ],
              diagnostics: [],
            },
          },
        };
        socket.send(JSON.stringify(response));
      });
    };
    connect();
    expect((await result).result.payload.nodes[0]?.figmaNodeId).toBe('1:3');
    expect(requests).toBe(2);
  } finally {
    await session.close();
  }
});
it('bounds waiting when no plugin connects', async () => {
  const session = await createLiveSession('run:test', 20);
  try {
    await expect(session.waitForConnection()).rejects.toThrow(
      'Timed out waiting for Figma plugin connection',
    );
  } finally {
    await session.close();
  }
});

it('exchanges three revisions, caches retry results, and finalizes one connection', async () => {
  const session = await createLiveSession('run:test', 3000);
  const socket = new WebSocket(session.descriptor.url);
  let candidateMessages = 0;
  try {
    socket.on('open', () => {
      socket.send(
        JSON.stringify({
          type: 'hello',
          protocolVersion: LIVE_PROTOCOL_VERSION,
          runId: 'run:test',
          authToken: session.descriptor.authToken,
          clientId: 'multi-client',
          destination,
        }),
      );
    });
    socket.on('message', (raw) => {
      const message = parseLiveMessage(
        JSON.parse(Buffer.from(raw as ArrayBuffer).toString()) as unknown,
      );
      if (message.type === 'candidate-request') {
        candidateMessages += 1;
        const response: CandidateResponse = {
          protocolVersion: LIVE_PROTOCOL_VERSION,
          type: 'candidate-result',
          runId: 'run:test',
          revision: message.revision,
          destination,
          png: '',
          result: {
            ...scene,
            artifactKind: 'import-result',
            payload: {
              status: 'success',
              sceneNodeIds: ['scene:0'],
              nodes: [
                {
                  sceneNodeId: 'scene:0',
                  figmaNodeId: `1:${message.revision + 3}`,
                  status: 'created',
                },
              ],
              diagnostics: [],
            },
          },
        };
        socket.send(JSON.stringify(response));
      }
      if (message.type === 'finalize-request') {
        socket.send(
          JSON.stringify({
            protocolVersion: LIVE_PROTOCOL_VERSION,
            type: 'finalize-result',
            runId: 'run:test',
            selectedRevision: message.selectedRevision,
          }),
        );
      }
    });
    await session.waitForConnection();
    for (let revision = 0; revision < 3; revision += 1) {
      await expect(
        session.renderCandidate({
          protocolVersion: LIVE_PROTOCOL_VERSION,
          type: 'candidate-request',
          runId: 'run:test',
          revision,
          scene,
          assets: [],
          width: 100,
          height: 100,
        }),
      ).resolves.toMatchObject({ revision });
    }
    await session.renderCandidate({
      protocolVersion: LIVE_PROTOCOL_VERSION,
      type: 'candidate-request',
      runId: 'run:test',
      revision: 2,
      scene,
      assets: [],
      width: 100,
      height: 100,
    });
    expect(candidateMessages).toBe(3);
    await expect(session.finalize(1)).resolves.toMatchObject({
      type: 'finalize-result',
      selectedRevision: 1,
    });
    await expect(session.finalize(0)).rejects.toThrow('ended');
  } finally {
    await session.close();
  }
});

it('cancels while retaining the peer-reported last complete revision', async () => {
  const session = await createLiveSession('run:test', 3000);
  const socket = new WebSocket(session.descriptor.url);
  try {
    socket.on('open', () => {
      socket.send(
        JSON.stringify({
          type: 'hello',
          protocolVersion: LIVE_PROTOCOL_VERSION,
          runId: 'run:test',
          authToken: session.descriptor.authToken,
          clientId: 'cancel-client',
          destination,
        }),
      );
    });
    socket.on('message', (raw) => {
      const message = parseLiveMessage(
        JSON.parse(Buffer.from(raw as ArrayBuffer).toString()) as unknown,
      );
      if (message.type === 'cancel-request') {
        socket.send(
          JSON.stringify({
            protocolVersion: LIVE_PROTOCOL_VERSION,
            type: 'cancel-result',
            runId: 'run:test',
            retainedRevision: 0,
          }),
        );
      }
    });
    await session.waitForConnection();
    await expect(session.cancel('Provider failed')).resolves.toMatchObject({
      retainedRevision: 0,
    });
  } finally {
    await session.close();
  }
});
