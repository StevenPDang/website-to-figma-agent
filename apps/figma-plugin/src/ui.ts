import {
  parseLiveMessage,
  LIVE_PROTOCOL_VERSION,
  MAX_WIRE_BYTES,
  type Destination,
} from '@website-to-figma/contracts';
const form = document.querySelector('form') as HTMLFormElement;
const input = document.querySelector('textarea') as HTMLTextAreaElement;
const status = document.querySelector('[role=status]') as HTMLElement;
const button = document.querySelector('button') as HTMLButtonElement;
window.onerror = (_message, _source, _line, _column, error) => {
  status.textContent = `Plugin UI error: ${error?.message ?? 'unknown error'}`;
  button.disabled = false;
  return true;
};
window.addEventListener('unhandledrejection', (event) => {
  status.textContent = `Plugin error: ${event.reason instanceof Error ? event.reason.message : 'unexpected failure'}`;
  button.disabled = false;
});
let destination: Destination | undefined;
let socket: WebSocket | undefined;
let descriptor: { url: string; runId: string; authToken: string } | undefined;
let retries = 0;
let authenticated = false;
let finished = false;
const clientId =
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
parent.postMessage({ pluginMessage: { type: 'destination' } }, '*');
function connect() {
  if (!descriptor || !destination) return;
  const current = descriptor;
  socket = new WebSocket(current.url);
  socket.onopen = () =>
    socket?.send(
      JSON.stringify({
        type: 'hello',
        protocolVersion: LIVE_PROTOCOL_VERSION,
        runId: current.runId,
        authToken: current.authToken,
        clientId,
        destination,
      }),
    );
  socket.onmessage = async (event) => {
    try {
      if (typeof event.data !== 'string' || event.data.length > MAX_WIRE_BYTES)
        throw new Error('Invalid message size');
      const message = parseLiveMessage(JSON.parse(event.data) as unknown);
      if (message.runId !== current.runId) throw new Error('Run mismatch');
      if (message.type === 'hello-ack') {
        authenticated = true;
        status.textContent = 'Connected. Waiting for captured page…';
        return;
      }
      if (!authenticated || message.type !== 'import-request')
        throw new Error('Unexpected message');
      if (JSON.stringify(message.destination) !== JSON.stringify(destination))
        throw new Error('Destination mismatch');
      status.textContent = 'Checking assets and importing editable layers…';
      const subtle = Reflect.get(crypto, 'subtle') as SubtleCrypto | undefined;
      if (!subtle)
        throw new Error(
          'This Figma runtime does not provide secure hashing. Reload the plugin.',
        );
      for (const asset of message.assets) {
        const bytes = Uint8Array.from(atob(asset.base64), (c) =>
          c.charCodeAt(0),
        );
        const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
        const hash = Array.from(digest, (b) =>
          b.toString(16).padStart(2, '0'),
        ).join('');
        if (hash !== asset.contentHash) throw new Error('Asset hash mismatch');
      }
      parent.postMessage({ pluginMessage: message }, '*');
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : 'Connection error';
      socket?.close(4008, 'Invalid import message');
      finished = true;
    }
  };
  socket.onerror = () => {
    status.textContent = 'Connection unavailable.';
  };
  socket.onclose = (event) => {
    if (event.code === 1000 && event.reason === 'Import received')
      finished = true;
    authenticated = false;
    if (!finished && retries++ < 3) {
      status.textContent = 'Reconnecting…';
      setTimeout(connect, 1000);
    } else if (!finished)
      status.textContent =
        'Connection ended. Keep existing layers; start a new CLI run and restart the plugin.';
  };
}
form.onsubmit = (event) => {
  event.preventDefault();
  try {
    const value: unknown = parseDescriptorText(input.value);
    if (!value || typeof value !== 'object')
      throw new Error('Paste the CLI connection JSON.');
    const url: unknown = Reflect.get(value, 'url'),
      runId: unknown = Reflect.get(value, 'runId'),
      authToken: unknown = Reflect.get(value, 'authToken');
    if (
      typeof url !== 'string' ||
      !/^ws:\/\/localhost:\d+$/.test(url) ||
      typeof runId !== 'string' ||
      typeof authToken !== 'string'
    )
      throw new Error('Invalid local connection descriptor');
    if (!destination) throw new Error('Waiting for destination document.');
    descriptor = { url, runId, authToken };
    input.value = JSON.stringify(descriptor, null, 2);
    button.disabled = true;
    connect();
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : 'Invalid connection descriptor';
  }
};

function parseDescriptorText(text: string): unknown {
  const normalized = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    // The CLI may have been copied together with its explanatory stderr line.
    const start = normalized.indexOf('{');
    const end = normalized.lastIndexOf('}');
    if (start < 0 || end <= start)
      throw new Error('Paste the CLI connection JSON.');
    return JSON.parse(normalized.slice(start, end + 1)) as unknown;
  }
}
window.onmessage = (event) => {
  const envelope = event.data as { pluginMessage?: unknown };
  const value = envelope.pluginMessage;
  if (!value || typeof value !== 'object') return;
  if (Reflect.get(value, 'type') === 'destination') {
    destination = Reflect.get(value, 'destination') as Destination;
    const label = document.querySelector('#destination');
    if (label)
      label.textContent = `${destination.documentName} / ${destination.pageName}`;
    return;
  }
  if (Reflect.get(value, 'type') === 'failure') {
    const message = String(Reflect.get(value, 'message'));
    status.textContent = message;
    finished = true;
    if (descriptor)
      socket?.send(
        JSON.stringify({
          type: 'error',
          protocolVersion: LIVE_PROTOCOL_VERSION,
          runId: descriptor.runId,
          message,
        }),
      );
    return;
  }
  try {
    const response = parseLiveMessage(value);
    if (response.type !== 'import-result') return;
    socket?.send(JSON.stringify(response));
    status.textContent = `Import ${response.result.payload.status}. See CLI for visual QA and reports.`;
  } catch {
    status.textContent = 'Invalid plugin result';
  }
};
