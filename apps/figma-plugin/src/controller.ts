import {
  LIVE_PROTOCOL_VERSION,
  parseLiveMessage,
} from '@website-to-figma/contracts';
import { createCandidateManager } from './candidate-manager.js';
import { importLiveScene } from './live-importer.js';
declare const __html__: string;
figma.showUI(__html__, { width: 420, height: 330 });
let activeRun: string | undefined;
const ownedRoots = (runId: string, revision: number) =>
  figma.currentPage.findAll(
    (node) =>
      node.getPluginData('candidateRoot') === 'true' &&
      node.getPluginData('runId') === runId &&
      node.getPluginData('candidateRevision') === String(revision),
  );
const manager = createCandidateManager({
  async importCandidate(message) {
    const assets = new Map(
      message.assets.map((asset) => [
        asset.contentHash,
        figma.base64Decode(asset.base64),
      ]),
    );
    return importLiveScene(figma, message, assets);
  },
  removeOwnedRevision(runId, revision) {
    ownedRoots(runId, revision).forEach((node) => {
      node.remove();
    });
  },
  retainOwnedRevision(runId, revision) {
    ownedRoots(runId, revision).forEach((node) => {
      node.setPluginData('candidateState', 'selected');
    });
  },
});
async function handleMessage(input: unknown) {
  try {
    if (
      input &&
      typeof input === 'object' &&
      Reflect.get(input, 'type') === 'destination'
    ) {
      figma.ui.postMessage({
        type: 'destination',
        destination: {
          documentName: figma.root.name,
          pageName: figma.currentPage.name,
          pageId: figma.currentPage.id,
        },
      });
      return;
    }
    const message = parseLiveMessage(input);
    if (activeRun && activeRun !== message.runId)
      throw new Error(
        'Plugin already bound to another run; restart it for a new run',
      );
    activeRun = message.runId;
    if (message.type === 'candidate-request') {
      figma.ui.postMessage(await manager.render(message));
      return;
    }
    if (message.type === 'finalize-request') {
      manager.finalize(message.runId, message.selectedRevision);
      figma.ui.postMessage({
        protocolVersion: LIVE_PROTOCOL_VERSION,
        runId: message.runId,
        type: 'finalize-result',
        selectedRevision: message.selectedRevision,
      });
      return;
    }
    if (message.type === 'cancel-request') {
      figma.ui.postMessage({
        protocolVersion: LIVE_PROTOCOL_VERSION,
        runId: message.runId,
        type: 'cancel-result',
        retainedRevision: manager.cancel(message.runId),
      });
      return;
    }
    throw new Error('Expected candidate lifecycle request');
  } catch (error) {
    figma.ui.postMessage({
      type: 'failure',
      message: error instanceof Error ? error.message : 'Import failed',
    });
  }
}
figma.ui.onmessage = (input: unknown) => {
  void handleMessage(input);
};
