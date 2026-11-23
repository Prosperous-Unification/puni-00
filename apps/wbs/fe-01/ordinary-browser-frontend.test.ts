// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ordinaryServerDescriptors } from './playwright.ordinary-servers';

it('ordinary frontend selects the fixed Bun build-preview leaf', () => {
  const descriptors = ordinaryServerDescriptors(
    '/private/descriptor-contract',
    1700,
    true,
    '/private/descriptor-contract/run/store.db',
  );
  expect(descriptors[2]?.command).toBe('bun ordinary-browser-frontend.ts');
});

const appRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(appRoot, '../../..');

type FrontendControl =
  | 'failed-build'
  | 'successful-build'
  | 'cancel-build'
  | 'cancel-preview'
  | 'missing-port'
  | 'empty-port';

/** Fixed installed-dependency controls; no command, runtime or environment override exists in the leaf. */
function controlledVite(control: FrontendControl): string {
  return String.raw`
import { appendFileSync, existsSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const control = ${JSON.stringify(control)};
const root = resolve(import.meta.dir, '../../..');
const phase = process.argv[2];
if (phase !== 'build' && phase !== 'preview') throw Error('Unexpected fixed Vite phase');
const emit = (name, extra = {}) => appendFileSync(root + '/events.jsonl', JSON.stringify({ name, phase, ...extra }) + '\n');
process.on('exit', exitCode => emit('exit', { exitCode }));
process.on('SIGTERM', () => { emit('term'); process.exit(0); });
process.on('SIGINT', () => { emit('interrupt'); process.exit(0); });
emit('enter');
const observation = { pid: process.pid, ppid: process.ppid, runtime: process.execPath, cwd: process.cwd(), argv: process.argv.slice(2) };
const marker = root + '/' + phase + '.json';
writeFileSync(marker + '.partial', JSON.stringify(observation));
renameSync(marker + '.partial', marker);
while (!existsSync(root + '/' + phase + '.release')) await Bun.sleep(5);
process.exit(phase === 'build' && control === 'failed-build' ? 7 : 0);
`;
}

const frontendController = String.raw`
import { readFileSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
const request = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { createPerformanceProcessOwner } = await import(request.ownerModule);
const encode = failure => failure instanceof Error
  ? { name: failure.name, message: failure.message, cause: failure.cause === undefined ? null : encode(failure.cause) }
  : { type: typeof failure, value: String(failure) };
const identity = pid => {
  try {
    const source = readFileSync('/proc/' + pid + '/stat', 'utf8');
    const fields = source.slice(source.lastIndexOf(')') + 2).trim().split(/\s+/);
    if (fields.length < 20) throw Error('Incomplete selected process identity');
    return { pid, starttime: fields[19], state: fields[0] };
  } catch (failure) {
    if (failure instanceof Error && 'code' in failure && failure.code === 'ENOENT') return null;
    throw failure;
  }
};
let owner, child, stdout, stderr;
let original = null, originalBeforeCleanup = null;
let primaryOccurred = false, primary;
const cleanupFailures = [];
let stopPromise, stopAttempts = 0, stopSettled = false;
let stdoutClosed = false, stderrClosed = false;
let deadline;
let observing = true;
const selected = {};
const beforeCleanup = {};
let observationsBeforeCleanup = null;
let leafSignalAttempts = 0;
const startedAt = new Date().toISOString();
const stop = () => {
  if (owner === undefined) return Promise.resolve();
  if (stopPromise === undefined) { stopAttempts++; stopPromise = owner.stop(); }
  return stopPromise;
};
const readMarker = async phase => {
  const marker = request.root + '/' + phase + '.json';
  while (true) {
    if (!observing) throw Error('Frontend lifecycle observation stopped');
    try {
      const observation = JSON.parse(readFileSync(marker, 'utf8'));
      const current = identity(observation.pid);
      if (current === null) throw Error('Selected dependency exited before acquisition');
      selected[phase] = { observation, identity: current };
      return observation;
    } catch (failure) {
      if (!(failure instanceof Error && 'code' in failure && failure.code === 'ENOENT')) throw failure;
      if (original !== null) throw Error('Leaf settled before selected dependency entered');
      await Bun.sleep(5);
    }
  }
};
const release = phase => writeFileSync(request.root + '/' + phase + '.release', 'release\n', { flag: 'wx' });
try {
  stdout = await open(request.root + '/leaf.stdout', 'wx', 0o600);
  stderr = await open(request.root + '/leaf.stderr', 'wx', 0o600);
  owner = createPerformanceProcessOwner();
  const environment = { ...process.env, PORT: '4517' };
  if (request.control === 'missing-port') delete environment.PORT;
  if (request.control === 'empty-port') environment.PORT = '';
  child = owner.spawn([process.execPath, request.leaf], request.cwd, environment, { stdout: stdout.fd, stderr: stderr.fd });
  const observed = child.exited.then(exitCode => { original = { exitCode, signalCode: child.signalCode, observedAt: new Date().toISOString() }; });
  const scenario = async () => {
    if (request.control !== 'missing-port' && request.control !== 'empty-port') {
      await readMarker('build');
      if (request.control === 'cancel-build') {
        leafSignalAttempts++;
        child.kill('SIGTERM');
      } else {
        release('build');
        if (request.control === 'successful-build' || request.control === 'cancel-preview') {
          await readMarker('preview');
          beforeCleanup.buildAtPreview = identity(selected.build.identity.pid);
          if (request.control === 'cancel-preview') {
            leafSignalAttempts++;
            child.kill('SIGTERM');
          } else release('preview');
        }
      }
    }
    await observed;
    for (const [phase, entry] of Object.entries(selected)) beforeCleanup[phase] = identity(entry.identity.pid);
  };
  await Promise.race([
    scenario(),
    new Promise((_, reject) => { deadline = setTimeout(() => reject(Error('Selected frontend lifecycle exceeded 10000ms')), 10000); }),
  ]);
} catch (failure) {
  primaryOccurred = true;
  primary = failure;
} finally {
  observing = false;
  if (deadline !== undefined) clearTimeout(deadline);
  originalBeforeCleanup = original;
  try {
    observationsBeforeCleanup = structuredClone({ selected, beforeCleanup, leafSignalAttempts });
  } catch (failure) { cleanupFailures.push(failure); }
  try { await stop(); stopSettled = stopPromise !== undefined; } catch (failure) { cleanupFailures.push(failure); }
  if (stdout !== undefined) try { await stdout.close(); stdoutClosed = true; } catch (failure) { cleanupFailures.push(failure); }
  if (stderr !== undefined) try { await stderr.close(); stderrClosed = true; } catch (failure) { cleanupFailures.push(failure); }
}
const receipt = {
  control: request.control, runtime: process.execPath, cwd: request.cwd,
  startedAt, endedAt: new Date().toISOString(),
  selected: observationsBeforeCleanup === null ? null : observationsBeforeCleanup.selected,
  beforeCleanup: observationsBeforeCleanup === null ? null : observationsBeforeCleanup.beforeCleanup,
  leafSignalAttempts: observationsBeforeCleanup === null ? null : observationsBeforeCleanup.leafSignalAttempts,
  original: originalBeforeCleanup,
  runtimes: observationsBeforeCleanup === null ? null : Object.fromEntries(Object.entries(observationsBeforeCleanup.selected).map(([phase, entry]) => [phase, entry.observation.runtime === process.execPath])),
  afterCleanup: child === undefined ? null : { exitCode: child.exitCode, signalCode: child.signalCode },
  primary: primaryOccurred ? encode(primary) : null, cleanupFailures: cleanupFailures.map(encode),
  owner: { acquired: owner !== undefined, stopAttempts, settled: stopSettled },
  fds: { stdoutAcquired: stdout !== undefined, stderrAcquired: stderr !== undefined, stdoutClosed, stderrClosed },
};
writeFileSync(request.root + '/receipt.json', JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ evidence: request.root, original: originalBeforeCleanup }));
if (primaryOccurred || cleanupFailures.length !== 0 || originalBeforeCleanup === null || !stopSettled || !stdoutClosed || !stderrClosed) process.exitCode = 1;
`;

/** Runs exact production leaf bytes over an owned installed-dependency fixture; retains original and cleanup receipts. */
function runFrontendControl(control: FrontendControl) {
  const root = mkdtempSync(join(tmpdir(), 'wbs-frontend-lifecycle-'));
  console.log('Frontend lifecycle evidence:', root);
  const cwd = join(root, 'apps/wbs/fe-01');
  mkdirSync(cwd, { recursive: true });
  mkdirSync(join(root, 'node_modules/vite/bin'), { recursive: true });
  const leaf = join(cwd, 'ordinary-browser-frontend.ts');
  copyFileSync(join(appRoot, 'ordinary-browser-frontend.ts'), leaf);
  const hash = (source: Buffer): string => createHash('sha256').update(source).digest('hex');
  expect(hash(readFileSync(leaf))).toBe(
    hash(readFileSync(join(appRoot, 'ordinary-browser-frontend.ts'))),
  );
  writeFileSync(join(root, 'node_modules/vite/bin/vite.js'), controlledVite(control), {
    flag: 'wx',
  });
  writeFileSync(join(root, 'controller.ts'), frontendController, { flag: 'wx' });
  writeFileSync(
    join(root, 'request.json'),
    JSON.stringify({
      root,
      cwd,
      leaf,
      control,
      ownerModule: join(repoRoot, 'tools/tool-devsync/src/performance-processes.ts'),
    }),
    { flag: 'wx' },
  );
  let invocation: { failure: unknown } | undefined;
  try {
    execFileSync(
      'bun',
      [
        '--no-env-file',
        '--config=/dev/null',
        join(root, 'controller.ts'),
        join(root, 'request.json'),
      ],
      { cwd, encoding: 'utf8', timeout: 25_000, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (failure) {
    invocation = { failure };
  }
  let receipt: unknown;
  let receiptFailure: { failure: unknown } | undefined;
  try {
    receipt = JSON.parse(readFileSync(join(root, 'receipt.json'), 'utf8'));
  } catch (publicationFailure) {
    receiptFailure = { failure: publicationFailure };
  }
  if (receiptFailure !== undefined) {
    throw new AggregateError(
      invocation === undefined
        ? [receiptFailure.failure]
        : [invocation.failure, receiptFailure.failure],
      'Frontend lifecycle receipt unavailable; private tree retained',
      { cause: invocation === undefined ? receiptFailure.failure : invocation.failure },
    );
  }
  expect(invocation).toBeUndefined();
  expect(receipt).toMatchObject({
    primary: null,
    cleanupFailures: [],
    owner: { acquired: true, stopAttempts: 1, settled: true },
    fds: { stdoutAcquired: true, stderrAcquired: true, stdoutClosed: true, stderrClosed: true },
  });
  return { root, cwd, receipt, stderr: readFileSync(join(root, 'leaf.stderr'), 'utf8') };
}

function readEvents(root: string): unknown[] {
  return readFileSync(join(root, 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line): unknown => JSON.parse(line));
}

describe('ordinary frontend selected child lifecycle', () => {
  it('failed build never starts preview', () => {
    const { root, cwd, receipt } = runFrontendControl('failed-build');
    expect(receipt).toMatchObject({
      original: { exitCode: 7, signalCode: null },
      selected: { build: { observation: { cwd, argv: ['build', '--minify=false'] } } },
      beforeCleanup: { build: null },
      runtimes: { build: true },
      leafSignalAttempts: 0,
    });
    expect(existsSync(join(root, 'preview.json'))).toBe(false);
    expect(readEvents(root)).toEqual([
      { name: 'enter', phase: 'build' },
      { name: 'exit', phase: 'build', exitCode: 7 },
    ]);
  }, 30_000);

  it('successful build precedes preview with fixed Bun argv and cwd', () => {
    const { root, cwd, receipt } = runFrontendControl('successful-build');
    expect(receipt).toMatchObject({
      original: { exitCode: 0, signalCode: null },
      selected: {
        build: { observation: { cwd, argv: ['build', '--minify=false'] } },
        preview: {
          observation: {
            cwd,
            argv: ['preview', '--host', 'localhost', '--port', '4517', '--strictPort'],
          },
        },
      },
      beforeCleanup: { buildAtPreview: null, build: null, preview: null },
      runtimes: { build: true, preview: true },
      leafSignalAttempts: 0,
    });
    expect(readEvents(root)).toEqual([
      { name: 'enter', phase: 'build' },
      { name: 'exit', phase: 'build', exitCode: 0 },
      { name: 'enter', phase: 'preview' },
      { name: 'exit', phase: 'preview', exitCode: 0 },
    ]);
  }, 30_000);

  it('cancellation during build forbids preview even when the build exits zero', () => {
    const { root, receipt } = runFrontendControl('cancel-build');
    expect(receipt).toMatchObject({
      original: { exitCode: 143, signalCode: null },
      beforeCleanup: { build: null },
      leafSignalAttempts: 1,
    });
    expect(existsSync(join(root, 'preview.json'))).toBe(false);
    expect(readEvents(root)).toEqual([
      { name: 'enter', phase: 'build' },
      { name: 'term', phase: 'build' },
      { name: 'exit', phase: 'build', exitCode: 0 },
    ]);
  }, 30_000);

  it('cancellation joins the selected preview before outer cleanup', () => {
    const { root, receipt } = runFrontendControl('cancel-preview');
    expect(receipt).toMatchObject({
      original: { exitCode: 143, signalCode: null },
      beforeCleanup: { buildAtPreview: null, build: null, preview: null },
      leafSignalAttempts: 1,
    });
    expect(readEvents(root)).toEqual([
      { name: 'enter', phase: 'build' },
      { name: 'exit', phase: 'build', exitCode: 0 },
      { name: 'enter', phase: 'preview' },
      { name: 'term', phase: 'preview' },
      { name: 'exit', phase: 'preview', exitCode: 0 },
    ]);
  }, 30_000);

  it.each(['missing-port', 'empty-port'] as const)(
    'refuses %s without entering Vite',
    (control) => {
      const { root, receipt, stderr } = runFrontendControl(control);
      expect(receipt).toMatchObject({
        original: { exitCode: 1, signalCode: null },
        selected: {},
        beforeCleanup: {},
        leafSignalAttempts: 0,
      });
      expect(existsSync(join(root, 'build.json'))).toBe(false);
      expect(existsSync(join(root, 'preview.json'))).toBe(false);
      expect(existsSync(join(root, 'events.jsonl'))).toBe(false);
      expect(stderr).toContain('Ordinary frontend requires PORT');
    },
    30_000,
  );
});
