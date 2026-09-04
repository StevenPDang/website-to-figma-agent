import { isIP } from 'node:net';

export interface UrlPolicyOptions {
  allowLoopback?: boolean;
}

export function assertNavigableUrl(
  rawUrl: string,
  options: UrlPolicyOptions = {},
): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('URL is invalid');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL must use HTTP or HTTPS');
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('URLs containing credentials are not allowed');
  }

  const hostname = url.hostname.toLowerCase();
  if (!options.allowLoopback && isPrivateHost(hostname)) {
    throw new Error('Private and loopback hosts are not allowed');
  }
  return url;
}

function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return true;
  }

  const version = isIP(hostname);
  if (version === 4) {
    const octets = hostname.split('.').map(Number);
    const first = octets[0] ?? -1;
    const second = octets[1] ?? -1;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254)
    );
  }

  if (version === 6) {
    return (
      hostname === '::1' ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd') ||
      hostname.startsWith('fe8') ||
      hostname.startsWith('fe9') ||
      hostname.startsWith('fea') ||
      hostname.startsWith('feb')
    );
  }

  return false;
}
