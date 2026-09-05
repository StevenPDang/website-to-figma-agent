import { expect, it } from 'vitest';
import { LIVE_PROTOCOL_VERSION, parseLiveMessage } from './live-protocol.js';
it('rejects incompatible versions, unknown fields, and malformed destination identities', () => {
  expect(() =>
    parseLiveMessage({
      type: 'hello',
      protocolVersion: '1.0.0',
      runId: 'run:a',
      authToken: 'a'.repeat(64),
      clientId: 'client:a',
      destination: { documentName: 'D', pageName: 'P', pageId: '1:2' },
    }),
  ).toThrow();
  expect(() =>
    parseLiveMessage({
      type: 'hello',
      protocolVersion: LIVE_PROTOCOL_VERSION,
      runId: 'run:a',
      authToken: 'a'.repeat(64),
      clientId: 'client:a',
      destination: { documentName: 'D', pageName: 'P', pageId: '1:2' },
      extra: true,
    }),
  ).toThrow();
  expect(() =>
    parseLiveMessage({
      type: 'hello',
      protocolVersion: LIVE_PROTOCOL_VERSION,
      runId: 'run:a',
      authToken: 'a'.repeat(64),
      clientId: 'client:a',
      destination: {},
    }),
  ).toThrow();
});
it('accepts a bounded authenticated greeting', () => {
  expect(
    parseLiveMessage({
      type: 'hello',
      protocolVersion: LIVE_PROTOCOL_VERSION,
      runId: 'run:a',
      authToken: 'a'.repeat(64),
      clientId: 'client:a',
      destination: { documentName: 'D', pageName: 'P', pageId: '1:2' },
    }).type,
  ).toBe('hello');
});

it.each([
  ['candidate-request', -1],
  ['candidate-request', 3],
  ['candidate-result', 1.5],
  ['finalize-request', 8],
])('rejects an invalid revision on %s', (type, value) => {
  const common = {
    protocolVersion: LIVE_PROTOCOL_VERSION,
    runId: 'run:a',
    type,
  };
  const input =
    type === 'finalize-request'
      ? { ...common, selectedRevision: value }
      : type === 'candidate-result'
        ? {
            ...common,
            revision: value,
            result: {},
            png: '',
            destination: { documentName: 'D', pageName: 'P', pageId: '1:2' },
          }
        : {
            ...common,
            revision: value,
            scene: {},
            assets: [],
            width: 100,
            height: 100,
            destination: { documentName: 'D', pageName: 'P', pageId: '1:2' },
          };
  expect(() => parseLiveMessage(input)).toThrow('revision');
});

it('requires explicit compatibility errors', () => {
  expect(
    parseLiveMessage({
      protocolVersion: LIVE_PROTOCOL_VERSION,
      runId: 'run:a',
      type: 'error',
      code: 'PROTOCOL_INCOMPATIBLE',
      message: 'Rebuild and reload the plugin.',
      rebuildRequired: true,
    }),
  ).toMatchObject({ type: 'error', rebuildRequired: true });
});
