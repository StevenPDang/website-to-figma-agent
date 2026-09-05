import type { LiveMessage } from './live-protocol.js';

export type CandidateProtocolState =
  | { phase: 'ready'; nextRevision: 0; completeRevisions: readonly number[] }
  | {
      phase: 'ready' | 'awaiting-render';
      nextRevision: number;
      pendingRevision?: number;
      completeRevisions: readonly number[];
    }
  | {
      phase: 'finalized';
      nextRevision: number;
      selectedRevision: number;
      completeRevisions: readonly number[];
    }
  | {
      phase: 'cancelled';
      nextRevision: number;
      retainedRevision: number | null;
      completeRevisions: readonly number[];
    };

export type CandidateTransitionResult =
  | { ok: true; state: CandidateProtocolState; idempotent: boolean }
  | {
      ok: false;
      code:
        'INVALID_MESSAGE_ORDER' | 'REVISION_CONFLICT' | 'REVISION_NOT_COMPLETE';
      message: string;
    };

export function initialCandidateProtocolState(): CandidateProtocolState {
  return { phase: 'ready', nextRevision: 0, completeRevisions: [] };
}

export function transitionCandidateProtocol(
  state: CandidateProtocolState,
  message: LiveMessage,
): CandidateTransitionResult {
  if (message.type === 'candidate-request') {
    if (state.phase === 'finalized' || state.phase === 'cancelled')
      return invalid('INVALID_MESSAGE_ORDER', 'Candidate run has ended.');
    if (state.completeRevisions.includes(message.revision))
      return { ok: true, state, idempotent: true };
    if (
      state.phase === 'awaiting-render' &&
      state.pendingRevision === message.revision
    )
      return { ok: true, state, idempotent: true };
    if (state.phase !== 'ready' || message.revision !== state.nextRevision)
      return invalid(
        'REVISION_CONFLICT',
        `Expected candidate revision ${state.nextRevision}.`,
      );
    return {
      ok: true,
      idempotent: false,
      state: {
        ...state,
        phase: 'awaiting-render',
        pendingRevision: message.revision,
      },
    };
  }
  if (message.type === 'candidate-result') {
    if (
      state.phase !== 'awaiting-render' ||
      state.pendingRevision !== message.revision
    )
      return invalid(
        'INVALID_MESSAGE_ORDER',
        'No matching candidate is pending.',
      );
    return {
      ok: true,
      idempotent: false,
      state: {
        phase: 'ready',
        nextRevision: message.revision + 1,
        completeRevisions: [...state.completeRevisions, message.revision],
      },
    };
  }
  if (message.type === 'finalize-request') {
    if (state.phase !== 'ready')
      return invalid('INVALID_MESSAGE_ORDER', 'Cannot finalize in this state.');
    if (!state.completeRevisions.includes(message.selectedRevision))
      return invalid(
        'REVISION_NOT_COMPLETE',
        'Selected revision is not complete.',
      );
    return {
      ok: true,
      idempotent: false,
      state: {
        ...state,
        phase: 'finalized',
        selectedRevision: message.selectedRevision,
      },
    };
  }
  if (message.type === 'cancel-request') {
    const retainedRevision = state.completeRevisions.at(-1) ?? null;
    return state.phase === 'cancelled'
      ? { ok: true, state, idempotent: true }
      : {
          ok: true,
          idempotent: false,
          state: { ...state, phase: 'cancelled', retainedRevision },
        };
  }
  return invalid(
    'INVALID_MESSAGE_ORDER',
    `${message.type} does not advance candidate state.`,
  );
}

function invalid(
  code: 'INVALID_MESSAGE_ORDER' | 'REVISION_CONFLICT' | 'REVISION_NOT_COMPLETE',
  message: string,
): CandidateTransitionResult {
  return { ok: false, code, message };
}
