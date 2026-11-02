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
/** Optional fixed-roster close telemetry; observing a promise never replaces its return identity. */
function observeCloseBoundaries() {
  const telemetry = { status: 'available', records: 0, boundaries: {} };
  capture.closeDiagnostic = telemetry;
  const labels = ['watcher', 'ws', 'environment-client', 'environment-ssr', 'ssr-runner', 'http'];
  function record(boundary, event) {
    // Proof: S1 escaped this sink catch; generated producer inert close proof
    // close-sink-failure failed at that error, then passed after exact restore.
    // Five non-HTTP boundaries: <=12 records; HTTP: <=3; roster: <=1; total: <=16.
    try {
      telemetry.records++;
      const line = 'SOURCE_FRONTEND_CLOSE: ' + JSON.stringify({ boundary, event }) + '\n';
      if (writeSync(2, line) !== Buffer.byteLength(line)) telemetry.status = 'unavailable';
    } catch { telemetry.status = 'unavailable'; }
  }
  function install(owner, boundary, limit, http = false) {
    if (owner === undefined || owner === null) {
      telemetry.boundaries[boundary] = 'absent';
      if (boundary !== 'ssr-runner') telemetry.status = 'unavailable';
      return;
    }
    const original = owner.close;
    if (typeof original !== 'function') { telemetry.boundaries[boundary] = 'unavailable'; telemetry.status = 'unavailable'; return; }
    let calls = 0;
    owner.close = function (...args) {
      // Proof: L1 bypassed this limiter (39 vs25); L2 suppressed excess delegation.
      // generated producer inert close proof close-caps failed both faults; restores passed.
      const observed = calls++ < limit;
      if (observed) record(boundary, 'entered');
      if (http && observed && typeof args[0] === 'function') {
        const callback = args[0];
        let called = false;
        args[0] = function (...completion) {
          if (!called) { called = true; record(boundary, completion[0] ? 'rejected' : 'fulfilled'); }
          // Proof: C1-C3 broke receiver/arguments/result in generated producer inert close
          // proof close-contract; C4 replaced the throw in close-rejections. Faults failed; restores passed.
          return Reflect.apply(callback, this, completion);
        };
      }
      let completion;
      // Proof: W1/W2 changed receiver/arguments; generated producer inert close proof
      // close-contract failed at the original assertions, then passed after restore.
      try { completion = Reflect.apply(original, this, args); }
      catch (cause) { if (observed) record(boundary, 'threw'); throw cause; }
      if (observed && !http) {
        try {
          if (completion instanceof Promise) {
            // Both handlers return normally even if telemetry fails; the observer promise fulfills.
            // Proof: O1 threw from fulfillment; generated producer inert close proof
            // close-contract failed its unhandled-rejection guard, then restored PASS.
            Promise.prototype.then.call(completion,
              () => { record(boundary, 'fulfilled'); },
              // Proof: W5 mislabeled rejection; W6 substituted its promise. generated producer
              // inert close proof close-rejections failed both faults; exact restores passed.
              () => { record(boundary, 'rejected'); });
          } else record(boundary, 'returned');
        } catch { telemetry.status = 'unavailable'; }
      }
      // Proof: W3/W4 replaced promise/HTTP return identity; generated producer inert
      // close proof close-contract failed both faults, then passed after exact restore.
      return completion;
    };
    telemetry.boundaries[boundary] = 'installed';
  }
  try {
    install(server.watcher, 'watcher', 2);
    install(server.ws, 'ws', 1);
    install(server.environments?.client, 'environment-client', 1);
    install(server.environments?.ssr, 'environment-ssr', 1);
    install(server._ssrCompatModuleRunner, 'ssr-runner', 1);
    install(server.httpServer, 'http', 1, true);
    if (Object.keys(server.environments ?? {}).some((name) => !['client', 'ssr'].includes(name)))
      telemetry.status = 'unavailable';
  } catch { telemetry.status = 'unavailable'; }
  // Only fixed names/status values are serialized, never environment names, errors, or close payloads.
  try {
    const line = 'SOURCE_FRONTEND_CLOSE_ROSTER: ' + JSON.stringify({ status: telemetry.status, boundaries: labels.map((label) => [label, telemetry.boundaries[label] ?? 'unavailable']) }) + '\n';
    telemetry.records++;
    if (writeSync(2, line) !== Buffer.byteLength(line)) telemetry.status = 'unavailable';
  } catch { telemetry.status = 'unavailable'; }
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
    observeCloseBoundaries();
    try { await server.close(); capture.cleanup.closeReturned = true; }
    catch (cause) { cleanupFailures.push(cause); }
    capture.cleanup.httpListening = server.httpServer.listening;
    capture.cleanup.watcherClosedAfterServerClose = server.watcher.closed;
    try { await server.watcher.close(); capture.cleanup.explicitWatcherCloseReturned = true; }
    catch (cause) { cleanupFailures.push(cause); }
    capture.cleanup.watcherClosed = server.watcher.closed;
    capture.cleanup.watchedDirectoryCount = Object.keys(server.watcher.getWatched()).length;
  }
  // Proof: S2 overwrote final status here; generated producer inert close proof
  // close-sink-failure failed available vs unavailable, then restored PASS.
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
