import { file, serve } from 'bun';
import process from 'node:process';
import { URL } from 'node:url';

/** Serves the throwaway work-view prototype on loopback without live integrations. */
const server = serve({
  hostname: '127.0.0.1',
  port: 4387,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/prototype/work-view' || path === '/') {
      return new globalThis.Response(file(new URL('./work-view-prototype.html', import.meta.url)), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    return new globalThis.Response('Not found', { status: 404 });
  },
});
process.stdout.write('Prototype: ' + server.url + 'prototype/work-view?variant=A\n');
