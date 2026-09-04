import { describe, expect, it } from 'vitest';

import { assertNavigableUrl } from './url-policy.js';

describe('assertNavigableUrl', () => {
  it('accepts a public HTTPS URL', () => {
    expect(assertNavigableUrl('https://example.com/path').href).toBe(
      'https://example.com/path',
    );
  });

  it.each([
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://user:password@example.com/',
    'http://127.0.0.1:4173/',
    'http://192.168.1.10/',
  ])('rejects unsafe URL %s', (input) => {
    expect(() => assertNavigableUrl(input)).toThrow();
  });

  it('allows loopback only when explicitly enabled for local fixtures', () => {
    expect(
      assertNavigableUrl('http://127.0.0.1:4173/', { allowLoopback: true })
        .hostname,
    ).toBe('127.0.0.1');
  });
});
