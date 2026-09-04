import { describe, expect, it } from 'vitest';

import { identifyWorkspace } from './index.js';

describe('identifyWorkspace', () => {
  it('identifies the workspace boundary', () => {
    expect(identifyWorkspace()).toBe('@website-to-figma/workspace-smoke');
  });
});
