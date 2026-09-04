import type { FigmaSceneNode } from '@website-to-figma/contracts';

export interface AdapterNode extends FigmaSceneNode {
  figmaNodeId: string;
  properties: Record<string, unknown>;
}
export interface FigmaAdapter {
  createNode: (node: FigmaSceneNode) => AdapterNode;
  setProperty: (sceneNodeId: string, property: string, value: unknown) => void;
  nodes: () => AdapterNode[];
}

export function createMemoryFigmaAdapter(): FigmaAdapter {
  const nodes: AdapterNode[] = [];
  const bySceneId = new Map<string, AdapterNode>();
  return {
    createNode: (node) => {
      const existing = bySceneId.get(node.sceneNodeId);
      if (existing) return existing;
      const created: AdapterNode = {
        ...node,
        figmaNodeId: `figma:${node.sceneNodeId.slice(6)}`,
        properties: {},
      };
      nodes.push(created);
      bySceneId.set(node.sceneNodeId, created);
      return created;
    },
    setProperty: (sceneNodeId, property, value) => {
      const node = bySceneId.get(sceneNodeId);
      if (!node) throw new Error(`Unknown scene node ${sceneNodeId}`);
      node.properties[property] = value;
    },
    nodes: () => [...nodes],
  };
}
