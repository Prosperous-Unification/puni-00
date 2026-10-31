/** Trusted test-only Node harness for the real Vite producer; never evaluates served JavaScript. */
export const SOURCE_FRONTEND_PRODUCER_PROGRAM = String.raw`import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeSync } from 'node:fs';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { request } from 'node:http';
import { resolve } from 'node:path';
import { createServer, version as viteVersion } from './snapshot/node_modules/vite/dist/node/index.js';

const packet = process.argv[2];
assert.equal(typeof packet, 'string');
const snapshot = resolve(packet, 'snapshot');
const frontend = resolve(snapshot, 'apps/wbs/fe-01');
assert.equal(process.cwd(), frontend);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const capture = { node: process.version, execPath: process.execPath, viteVersion, requestHeaders: { 'accept-encoding': 'identity', connection: 'close' }, requestAudit: [], responses: [], cleanup: {} };
let server;
let requestCount = 0;
let failure;
let phase = 'initial';
function encodeFailureText(value, limit) {
  if (typeof value !== 'string') return null;
  const bytes = Buffer.from(value);
  return { bytes: bytes.length, truncated: bytes.length > limit, base64: bytes.subarray(0, limit).toString('base64') };
}
/** Optional synchronous telemetry cannot change required failure or cleanup behavior. */
function publishPreCleanupDiagnostic() {
  try {
    const diagnostic = {
      phase,
      primary: failure === undefined ? { kind: 'absent' } : { kind: 'present', name: encodeFailureText(capture.failure?.name, 128), message: encodeFailureText(capture.failure?.message, 2048), stack: encodeFailureText(capture.failure?.stack, 6144) },
      requests: requestCount,
      requestAuditCount: capture.requestAudit.length,
      responses: capture.responses.length,
      preListen: { checked: capture.preListenChecked === true, listening: typeof capture.preListenActual?.listening === 'boolean' ? capture.preListenActual.listening : null },
      cleanup: { closeStarted: capture.cleanup.closeStarted === true, closeReturned: capture.cleanup.closeReturned === true },
    };
    const record = 'SOURCE_FRONTEND_PRE_CLEANUP: ' + JSON.stringify(diagnostic) + '\n';
    return { status: writeSync(2, record) === Buffer.byteLength(record) ? 'written' : 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
async function observe(path, filename, port) {
  requestCount++;
  const lifecycle = { requestClosed: false, responseClosed: false };
  let client;
  let incoming;
  let clientClosed;
  let responseClosed;
  try {
    const response = await new Promise((accept, refuse) => {
      client = request({ hostname: '127.0.0.1', port, path, method: 'GET', agent: false, headers: capture.requestHeaders, signal: AbortSignal.timeout(15000) }, (message) => {
        incoming = message;
        responseClosed = new Promise((closed) => message.once('close', () => { lifecycle.responseClosed = true; closed(); }));
        const chunks = [];
        let length = 0;
        message.on('data', (chunk) => {
          length += chunk.length;
          if (length > 256 * 1024) { message.destroy(new Error('probe body exceeded existing participant bound')); return; }
          chunks.push(chunk);
        });
        message.on('error', refuse);
        message.once('end', () => accept({ status: message.statusCode, headers: message.headers, complete: message.complete, body: Buffer.concat(chunks) }));
      });
      clientClosed = new Promise((closed) => client.once('close', () => { lifecycle.requestClosed = true; closed(); }));
      client.on('error', refuse);
      client.end();
    });
    assert.equal(response.status, 200);
    assert.equal(response.complete, true);
    new TextDecoder('utf-8', { fatal: true }).decode(response.body);
    await writeFile(resolve(packet, filename), response.body);
    capture.responses.push({ path, filename, status: response.status, headers: response.headers, bytes: response.body.length, sha256: digest(response.body), complete: response.complete, lifecycle });
  } finally {
    incoming?.destroy();
    client?.destroy();
    await Promise.all([clientClosed, responseClosed].filter((completion) => completion !== undefined));
  }
}
try {
  phase = 'create';
  server = await createServer({
    root: frontend,
    configFile: resolve(frontend, 'vite.config.ts'),
    envDir: frontend,
    cacheDir: resolve(packet, 'vite-cache'),
    server: { host: '127.0.0.1', port: 0, strictPort: true },
  });
  phase = 'config-checks';
  const config = server.config;
  capture.preListenActual = { root: config.root, envDir: config.envDir, host: config.server.host, port: config.server.port, strictPort: config.server.strictPort, hmr: config.server.hmr, ws: config.server.ws, open: config.server.open, env: config.env, listening: server.httpServer.listening };
  assert.equal(config.root, frontend);
  assert.equal(config.envDir, frontend);
  assert.equal(config.server.host, '127.0.0.1');
  assert.equal(config.server.port, 0);
  assert.equal(config.server.strictPort, true);
  assert.equal(config.server.hmr, false);
  assert.equal(config.server.open, false);
  assert.equal(config.env.VITE_BE_URL, 'http://127.0.0.1:9');
  assert.equal(config.env.VITE_GW_URL, 'ws://127.0.0.1:9');
  assert.equal(server.httpServer.listening, false);
  capture.preListenChecked = true;
  capture.config = { root: config.root, configFile: config.configFile, configFileDependencies: config.configFileDependencies, envDir: config.envDir, cacheDir: config.cacheDir, command: config.command, mode: config.mode, base: config.base, appType: config.appType, isProduction: config.isProduction, env: config.env, plugins: config.plugins.map((plugin) => plugin.name), resolveAlias: config.resolve.alias, server: { host: config.server.host, port: config.server.port, strictPort: config.server.strictPort, hmr: config.server.hmr, ws: config.server.ws, open: config.server.open, allowedHosts: config.server.allowedHosts, preTransformRequests: config.server.preTransformRequests, fs: config.server.fs, proxy: config.server.proxy }, optimizeDeps: { include: config.optimizeDeps.include, entries: config.optimizeDeps.entries, noDiscovery: config.optimizeDeps.noDiscovery }, clientDev: config.environments.client.dev };
  server.httpServer.prependListener('request', (request) => capture.requestAudit.push({ method: request.method, path: request.url }));
  phase = 'listen';
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address !== null && typeof address === 'object');
  assert.equal(address.address, '127.0.0.1');
  assert.equal(address.family, 'IPv4');
  assert.ok(Number.isSafeInteger(address.port) && address.port > 0);
  assert.ok(![3100, 3200, 3300, 4200].includes(address.port));
  capture.address = address;
  phase = 'document';
  await observe('/', 'index.response.html', address.port);
  phase = 'entry';
  await observe('/src/main.tsx', 'main.response.js', address.port);
  phase = 'response-checks';
  assert.equal(requestCount, 2);
  assert.deepEqual(capture.requestAudit, [{ method: 'GET', path: '/' }, { method: 'GET', path: '/src/main.tsx' }]);
  phase = 'package-observations';
  capture.packages = {};
  for (const name of ['vite', '@vitejs/plugin-react', '@tailwindcss/vite', 'tailwindcss', 'react', 'react-dom', 'rolldown']) {
    const path = await realpath(resolve(snapshot, 'node_modules', name, 'package.json'));
    const bytes = await readFile(path);
    const metadata = JSON.parse(bytes);
    capture.packages[name] = { path, version: metadata.version, sha256: digest(bytes) };
  }
  phase = 'complete';
} catch (cause) {
  failure = cause;
  capture.failure = { name: cause.name, message: cause.message, stack: cause.stack };
 } finally {
  const cleanupFailures = [];
  if (server !== undefined) capture.cleanup.closeStarted = true;
  capture.diagnostic = publishPreCleanupDiagnostic();
  if (server !== undefined) {
    try { await server.close(); capture.cleanup.closeReturned = true; }
    catch (cause) { cleanupFailures.push(cause); }
    capture.cleanup.httpListening = server.httpServer.listening;
    capture.cleanup.watcherClosedAfterServerClose = server.watcher.closed;
    try { await server.watcher.close(); capture.cleanup.explicitWatcherCloseReturned = true; }
    catch (cause) { cleanupFailures.push(cause); }
    capture.cleanup.watcherClosed = server.watcher.closed;
    capture.cleanup.watchedDirectoryCount = Object.keys(server.watcher.getWatched()).length;
  }
  await writeFile(resolve(packet, 'observation.json'), JSON.stringify(capture, null, 2) + '\n');
  try {
    assert.equal(capture.cleanup.closeReturned, true);
    assert.equal(capture.cleanup.explicitWatcherCloseReturned, true);
    assert.equal(capture.cleanup.httpListening, false);
    assert.equal(capture.cleanup.watcherClosed, true);
    assert.equal(capture.cleanup.watchedDirectoryCount, 0);
  } catch (cause) { cleanupFailures.push(cause); }
  if (cleanupFailures.length > 0)
    failure = new AggregateError(failure === undefined ? cleanupFailures : [failure, ...cleanupFailures], 'producer refusal or cleanup unproved');
  console.log(JSON.stringify({ observations: capture.responses.length, requests: capture.requestAudit, cleanup: capture.cleanup, failed: failure !== undefined }));
}
if (failure !== undefined) throw failure;
`;
