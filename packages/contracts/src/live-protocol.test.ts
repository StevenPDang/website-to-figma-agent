import { expect, it } from 'vitest';
import { parseLiveMessage } from './live-protocol.js';
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
      protocolVersion: '1.1.0',
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
      protocolVersion: '1.1.0',
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
      protocolVersion: '1.1.0',
      runId: 'run:a',
      authToken: 'a'.repeat(64),
      clientId: 'client:a',
      destination: { documentName: 'D', pageName: 'P', pageId: '1:2' },
    }).type,
  ).toBe('hello');
});
