import { describe, expect, it } from 'vitest';

import {
  initialCandidateProtocolState,
  transitionCandidateProtocol,
} from './candidate-protocol-state.js';
import type { LiveMessage } from './live-protocol.js';

const base = { protocolVersion: '1.2.0', runId: 'run:test' } as const;
const candidate = (revision: number) =>
  ({ ...base, type: 'candidate-request', revision }) as LiveMessage;
const result = (revision: number) =>
  ({ ...base, type: 'candidate-result', revision }) as LiveMessage;

describe('candidate protocol state', () => {
  it('accepts monotonic revisions and same-revision retries', () => {
    const initial = initialCandidateProtocolState();
    const started = transitionCandidateProtocol(initial, candidate(0));
    expect(started).toMatchObject({ ok: true, idempotent: false });
    if (!started.ok) throw new Error(started.message);
    expect(
      transitionCandidateProtocol(started.state, candidate(0)),
    ).toMatchObject({ ok: true, idempotent: true });
    const completed = transitionCandidateProtocol(started.state, result(0));
    expect(completed).toMatchObject({
      ok: true,
      state: { phase: 'ready', nextRevision: 1, completeRevisions: [0] },
    });
    if (!completed.ok) throw new Error(completed.message);
    expect(
      transitionCandidateProtocol(completed.state, candidate(0)),
    ).toMatchObject({ ok: true, idempotent: true });
    expect(
      transitionCandidateProtocol(completed.state, candidate(2)),
    ).toMatchObject({ ok: false, code: 'REVISION_CONFLICT' });
  });

  it('finalizes only a complete revision', () => {
    const started = transitionCandidateProtocol(
      initialCandidateProtocolState(),
      candidate(0),
    );
    if (!started.ok) throw new Error(started.message);
    const completed = transitionCandidateProtocol(started.state, result(0));
    if (!completed.ok) throw new Error(completed.message);
    expect(
      transitionCandidateProtocol(completed.state, {
        ...base,
        type: 'finalize-request',
        selectedRevision: 1,
      }),
    ).toMatchObject({ ok: false, code: 'REVISION_NOT_COMPLETE' });
    expect(
      transitionCandidateProtocol(completed.state, {
        ...base,
        type: 'finalize-request',
        selectedRevision: 0,
      }),
    ).toMatchObject({ ok: true, state: { phase: 'finalized' } });
  });

  it('cancellation retains the last complete revision and is idempotent', () => {
    const started = transitionCandidateProtocol(
      initialCandidateProtocolState(),
      candidate(0),
    );
    if (!started.ok) throw new Error(started.message);
    const completed = transitionCandidateProtocol(started.state, result(0));
    if (!completed.ok) throw new Error(completed.message);
    const cancelled = transitionCandidateProtocol(completed.state, {
      ...base,
      type: 'cancel-request',
    });
    expect(cancelled).toMatchObject({
      ok: true,
      state: { phase: 'cancelled', retainedRevision: 0 },
    });
    if (!cancelled.ok) throw new Error(cancelled.message);
    expect(
      transitionCandidateProtocol(cancelled.state, {
        ...base,
        type: 'cancel-request',
      }),
    ).toMatchObject({ ok: true, idempotent: true });
  });
});
