import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION, validateProtocolMessage } from './protocol.js';
import {
  transitionProtocolState,
  type ProtocolState,
} from './protocol-state.js';

const base = {
  protocolVersion: PROTOCOL_VERSION,
  runId: 'run:fixture',
};

describe('validateProtocolMessage', () => {
  it('accepts an authenticated hello message', () => {
    const message = {
      ...base,
      type: 'hello',
      authToken: 'a'.repeat(32),
    };

    expect(validateProtocolMessage(message)).toEqual({
      ok: true,
      value: message,
    });
  });

  it('rejects a short authentication token before transport handling', () => {
    const result = validateProtocolMessage({
      ...base,
      type: 'hello',
      authToken: 'short',
    });

    expect(result).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({
          code: 'SCHEMA_VALIDATION',
          path: '/authToken',
        }),
      ],
    });
  });

  it('rejects a message using a different protocol version', () => {
    const result = validateProtocolMessage({
      ...base,
      protocolVersion: '2.0.0',
      type: 'hello',
      authToken: 'a'.repeat(32),
    });

    expect(result).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({
          code: 'PROTOCOL_VERSION_MISMATCH',
          path: '/protocolVersion',
        }),
      ],
    });
  });

  it('rejects a non-object message at the schema boundary', () => {
    const result = validateProtocolMessage(null);

    expect(result.ok).toBe(false);
  });
});

describe('transitionProtocolState', () => {
  it('authenticates hello and accepts scene transfer', () => {
    const hello = {
      ...base,
      type: 'hello' as const,
      authToken: 'a'.repeat(32),
    };
    const ack = {
      ...base,
      type: 'hello-ack' as const,
      accepted: true,
      schemaVersion: '1.0.0' as const,
      capabilities: ['create-frame'],
    };
    const begin = {
      ...base,
      type: 'scene-begin' as const,
      sceneId: 'scene:fixture',
      totalOperations: 1,
    };

    const authenticated = transitionProtocolState('awaiting-auth', hello);
    const ready = transitionProtocolState(authenticated.state, ack);
    const importing = transitionProtocolState(ready.state, begin);

    expect(authenticated).toEqual({ state: 'ready' });
    expect(ready).toEqual({ state: 'ready' });
    expect(importing).toEqual({ state: 'importing', sceneId: 'scene:fixture' });
  });

  it('rejects scene transfer before authentication', () => {
    const result = transitionProtocolState('awaiting-auth', {
      ...base,
      type: 'scene-begin',
      sceneId: 'scene:fixture',
      totalOperations: 0,
    });

    expect(result).toEqual({
      state: 'failed',
      issue: {
        code: 'INVALID_STATE_TRANSITION',
        message: 'scene-begin is not valid while awaiting-auth',
      },
    });
  });

  it('rejects an unaccepted hello acknowledgement', () => {
    const result = transitionProtocolState('ready', {
      ...base,
      type: 'hello-ack',
      accepted: false,
      schemaVersion: '1.0.0',
      capabilities: [],
    });

    expect(result.state).toBe('failed');
  });

  it('keeps importing state while receiving chunks and progress', () => {
    const chunk = {
      ...base,
      type: 'scene-chunk' as const,
      sceneId: 'scene:fixture',
      chunkIndex: 0,
      operations: [
        {
          type: 'create-node' as const,
          operationId: 'operation:create',
          sceneNodeId: 'scene:root',
          nodeKind: 'frame',
        },
      ],
    };

    expect(transitionProtocolState('importing', chunk)).toEqual({
      state: 'importing',
    });
    expect(
      transitionProtocolState('importing', {
        ...base,
        type: 'progress',
        completedOperations: 1,
        totalOperations: 1,
      }),
    ).toEqual({ state: 'importing' });
  });

  it('finishes a non-failed import and rejects a failed completion', () => {
    expect(
      transitionProtocolState('importing', {
        ...base,
        type: 'import-complete',
        status: 'partial',
      }),
    ).toEqual({ state: 'completed' });
    expect(
      transitionProtocolState('importing', {
        ...base,
        type: 'import-complete',
        status: 'failed',
      }).state,
    ).toBe('failed');
  });

  it('does not allow operations after completion', () => {
    const result = transitionProtocolState(
      'completed' satisfies ProtocolState,
      {
        ...base,
        type: 'progress',
        completedOperations: 1,
        totalOperations: 1,
      },
    );

    expect(result.state).toBe('failed');
  });
});
