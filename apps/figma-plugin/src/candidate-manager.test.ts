import type {
  CandidateRequest,
  CandidateResponse,
} from '@website-to-figma/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createCandidateManager } from './candidate-manager.js';

const request = (revision: number): CandidateRequest =>
  ({
    protocolVersion: '1.2.0',
    type: 'candidate-request',
    runId: 'run:test',
    revision,
  }) as CandidateRequest;
const response = (revision: number): CandidateResponse =>
  ({
    protocolVersion: '1.2.0',
    type: 'candidate-result',
    runId: 'run:test',
    revision,
  }) as CandidateResponse;

describe('candidate manager', () => {
  it('exports a complete revision once and returns its cached retry', async () => {
    const importCandidate = vi.fn((value: CandidateRequest) =>
      Promise.resolve(response(value.revision)),
    );
    const manager = createCandidateManager({
      importCandidate,
      removeOwnedRevision: vi.fn(),
      retainOwnedRevision: vi.fn(),
    });
    const first = manager.render(request(0));
    const retry = manager.render(request(0));
    await expect(first).resolves.toEqual(response(0));
    await expect(retry).resolves.toEqual(response(0));
    await expect(manager.render(request(0))).resolves.toEqual(response(0));
    expect(importCandidate).toHaveBeenCalledTimes(1);
  });

  it('rejects conflicting and non-monotonic revisions', async () => {
    const manager = createCandidateManager({
      importCandidate: (value) => Promise.resolve(response(value.revision)),
      removeOwnedRevision: vi.fn(),
      retainOwnedRevision: vi.fn(),
    });
    await manager.render(request(0));
    await expect(manager.render({ ...request(0), width: 99 })).rejects.toThrow(
      'Conflicting retry',
    );
    await expect(manager.render(request(2))).rejects.toThrow(
      'Expected candidate revision 1',
    );
  });

  it('finalizes only the selected complete owned revision', async () => {
    const removeOwnedRevision = vi.fn();
    const retainOwnedRevision = vi.fn();
    const manager = createCandidateManager({
      importCandidate: (value) => Promise.resolve(response(value.revision)),
      removeOwnedRevision,
      retainOwnedRevision,
    });
    await manager.render(request(0));
    await manager.render(request(1));
    manager.finalize('run:test', 0);
    expect(removeOwnedRevision).toHaveBeenCalledWith('run:test', 1);
    expect(retainOwnedRevision).toHaveBeenCalledWith('run:test', 0);
    await expect(manager.render(request(2))).rejects.toThrow('ended');
  });

  it('cancellation retains the last complete candidate after a failed import', async () => {
    const removeOwnedRevision = vi.fn();
    const retainOwnedRevision = vi.fn();
    const manager = createCandidateManager({
      importCandidate: (value) => {
        if (value.revision === 1)
          return Promise.reject(new Error('export failed'));
        return Promise.resolve(response(value.revision));
      },
      removeOwnedRevision,
      retainOwnedRevision,
    });
    await manager.render(request(0));
    await expect(manager.render(request(1))).rejects.toThrow('export failed');
    expect(manager.cancel('run:test')).toBe(0);
    expect(removeOwnedRevision).toHaveBeenCalledWith('run:test', 1);
    expect(retainOwnedRevision).toHaveBeenCalledWith('run:test', 0);
  });
});
