import type {
  FigmaSceneArtifact,
  ImportResultArtifact,
} from '@website-to-figma/contracts';
import { validateArtifact } from '@website-to-figma/contracts';
import type { FigmaAdapter } from './figma-adapter.js';

export function importScene(
  scene: FigmaSceneArtifact,
  adapter: FigmaAdapter,
): ImportResultArtifact {
  const validation = validateArtifact(scene);
  if (!validation.ok)
    throw new Error(
      `Scene validation failed: ${validation.issues.map((issue) => issue.message).join('; ')}`,
    );
  const imported = scene.payload.nodes
    .slice()
    .sort(
      (a, b) =>
        depth(a.parentNodeId, scene.payload.nodes) -
        depth(b.parentNodeId, scene.payload.nodes),
    );
  const nodes = imported.map((node) => {
    const created = adapter.createNode(node);
    for (const [key, value] of Object.entries(node))
      if (
        ![
          'sceneNodeId',
          'sourceNodeId',
          'parentNodeId',
          'childNodeIds',
          'kind',
          'name',
        ].includes(key)
      )
        adapter.setProperty(node.sceneNodeId, key, value);
    return {
      sceneNodeId: node.sceneNodeId,
      figmaNodeId: created.figmaNodeId,
      status: 'created' as const,
    };
  });
  return {
    schemaVersion: scene.schemaVersion,
    artifactKind: 'import-result',
    runId: scene.runId,
    sourceUrl: scene.sourceUrl,
    capturedAt: scene.capturedAt,
    viewport: scene.viewport,
    payload: {
      status: 'success',
      sceneNodeIds: imported.map((node) => node.sceneNodeId),
      nodes,
      diagnostics: [],
    },
  };
}

function depth(
  parentId: string | null,
  nodes: FigmaSceneArtifact['payload']['nodes'],
): number {
  let depth = 0;
  let current = parentId;
  while (current) {
    depth += 1;
    current =
      nodes.find((node) => node.sceneNodeId === current)?.parentNodeId ?? null;
  }
  return depth;
}
