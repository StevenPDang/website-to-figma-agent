import {
  parseLiveMessage,
  type ImportResponse,
} from '@website-to-figma/contracts';
import { importLiveScene } from './live-importer.js';
declare const __html__: string;
figma.showUI(__html__, { width: 420, height: 330 });
let activeRun: string | undefined;
let fingerprint: string | undefined;
let pending: Promise<ImportResponse> | undefined;
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
    if (message.type !== 'import-request')
      throw new Error('Expected import request');
    const serialized = JSON.stringify(message);
    if (
      activeRun &&
      (activeRun !== message.runId || fingerprint !== serialized)
    )
      throw new Error(
        'Plugin already bound to another request; restart it for a new run',
      );
    if (!pending) {
      activeRun = message.runId;
      fingerprint = serialized;
      const assets = new Map(
        message.assets.map((a) => [
          a.contentHash,
          figma.base64Decode(a.base64),
        ]),
      );
      pending = importLiveScene(figma, message, assets);
    }
    figma.ui.postMessage(await pending);
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
