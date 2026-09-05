import type {
  CandidateRequest,
  CandidateResponse,
} from '@website-to-figma/contracts';

export interface CandidateOwnershipAdapter {
  importCandidate(request: CandidateRequest): Promise<CandidateResponse>;
  removeOwnedRevision(runId: string, revision: number): void;
  retainOwnedRevision(runId: string, revision: number): void;
}

export interface CandidateManager {
  render(request: CandidateRequest): Promise<CandidateResponse>;
  finalize(runId: string, selectedRevision: number): void;
  cancel(runId: string): number | null;
  completedRevisions(runId: string): readonly number[];
}

interface RunState {
  nextRevision: number;
  fingerprints: Map<number, string>;
  pending: Map<number, Promise<CandidateResponse>>;
  completed: Map<number, CandidateResponse>;
  ended: boolean;
}

export function createCandidateManager(
  adapter: CandidateOwnershipAdapter,
): CandidateManager {
  const runs = new Map<string, RunState>();
  const stateFor = (runId: string): RunState => {
    const existing = runs.get(runId);
    if (existing !== undefined) return existing;
    const created: RunState = {
      nextRevision: 0,
      fingerprints: new Map(),
      pending: new Map(),
      completed: new Map(),
      ended: false,
    };
    runs.set(runId, created);
    return created;
  };
  return {
    async render(request) {
      const state = stateFor(request.runId);
      if (state.ended) throw new Error('Candidate run has ended');
      const fingerprint = JSON.stringify(request);
      const previousFingerprint = state.fingerprints.get(request.revision);
      if (
        previousFingerprint !== undefined &&
        previousFingerprint !== fingerprint
      )
        throw new Error('Conflicting retry for candidate revision');
      const completed = state.completed.get(request.revision);
      if (completed !== undefined) return completed;
      const pending = state.pending.get(request.revision);
      if (pending !== undefined) return pending;
      if (request.revision !== state.nextRevision)
        throw new Error(`Expected candidate revision ${state.nextRevision}`);
      state.fingerprints.set(request.revision, fingerprint);
      const work = adapter.importCandidate(request).then(
        (response) => {
          state.pending.delete(request.revision);
          state.completed.set(request.revision, response);
          state.nextRevision += 1;
          return response;
        },
        (error: unknown) => {
          state.pending.delete(request.revision);
          state.fingerprints.delete(request.revision);
          adapter.removeOwnedRevision(request.runId, request.revision);
          throw error;
        },
      );
      state.pending.set(request.revision, work);
      return work;
    },
    finalize(runId, selectedRevision) {
      const state = stateFor(runId);
      if (state.ended) throw new Error('Candidate run has ended');
      if (!state.completed.has(selectedRevision))
        throw new Error('Selected candidate revision is not complete');
      for (const revision of state.completed.keys()) {
        if (revision !== selectedRevision)
          adapter.removeOwnedRevision(runId, revision);
      }
      adapter.retainOwnedRevision(runId, selectedRevision);
      state.ended = true;
    },
    cancel(runId) {
      const state = stateFor(runId);
      const retained = [...state.completed.keys()].at(-1) ?? null;
      for (const revision of state.completed.keys()) {
        if (revision !== retained) adapter.removeOwnedRevision(runId, revision);
      }
      if (retained !== null) adapter.retainOwnedRevision(runId, retained);
      state.ended = true;
      return retained;
    },
    completedRevisions(runId) {
      return [...stateFor(runId).completed.keys()];
    },
  };
}
