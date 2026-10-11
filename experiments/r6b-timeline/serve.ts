const root = import.meta.dir;
const allowed = new Set([
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/model.js',
  '/fixtures/batch-1.json',
  '/fixtures/ambiguity.json',
]);

/** Serve only this read-only throwaway fixture/renderer; no production routes or writes. */
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 4317,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method !== 'GET' || !allowed.has(path))
      return new Response('Not found', { status: 404 });
    return new Response(Bun.file(`${root}${path === '/' ? '/index.html' : path}`));
  },
});
console.log(`R6b read-only experiment: ${server.url}`);
