import { createServer, type Server } from 'node:http';

export interface FixtureServer {
  url: string;
  close: () => Promise<void>;
}

const defaultFixture = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Website-to-Figma Fixture</title></head>
  <body>
    <main style="min-height: 1200px; padding: 24px;">
      <h1>Fixture page</h1>
      <p>Deterministic browser capture content.</p>
    </main>
  </body>
</html>`;

export async function startFixtureServer(
  html = defaultFixture,
): Promise<FixtureServer> {
  const server: Server = createServer((_request, response) => {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(html);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    await closeServer(server);
    throw new Error('Fixture server did not expose a TCP address');
  }

  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => closeServer(server),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}
