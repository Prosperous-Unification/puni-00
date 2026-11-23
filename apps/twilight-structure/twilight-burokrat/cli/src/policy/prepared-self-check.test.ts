import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { afterEach, expect, it } from 'bun:test';

import { InstalledLintFailure } from '../installed-lint-launcher';
import type { LintInterrupt } from '../lint-interrupts';
import { lintControl } from '../lint-parent-control';
import { checkPreparedActivation, PreparedSelfCheckFailure } from './prepared-self-check';

const certificate = {
  schemaVersion: 1,
  mode: 'enforce',
  trustProvenance: 'ci-preselected',
  accepted: true,
  certified: true,
};
const roots: string[] = [];
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
async function waitPath(path: string) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    if (existsSync(path)) return;
    await Bun.sleep(5);
  }
  throw new Error('self-check marker absent: ' + path);
}
async function readRefusal(pending: Promise<unknown>): Promise<PreparedSelfCheckFailure> {
  const cause: unknown = await pending.then(
    () => {
      throw new Error('expected self-check refusal');
    },
    (cause: unknown) => cause,
  );
  if (!(cause instanceof PreparedSelfCheckFailure))
    throw new Error('wrong self-check refusal', { cause });
  return cause;
}

function createPeer(report: Uint8Array, status = 0, waitForCancel = false, hasFinished = true) {
  const root = mkdtempSync(join(tmpdir(), 'puni-self-check-'));
  roots.push(root);
  const candidate = join(root, 'candidate');
  mkdirSync(candidate);
  mkdirSync(join(root, 'archive'));
  mkdirSync(join(root, 'scratch'));
  const launcher = join(root, 'bootstrap-launcher.mjs'),
    observed = join(root, 'observed.json'),
    ready = join(root, 'ready'),
    pidPath = join(root, 'peer.pid');
  const before = 'before cancellation\n',
    after =
      'process group 123 cleanup is unconfirmed; retained scratch: ' +
      join(root, 'scratch/retained') +
      '\n';
  const program = [
    'import{writeFileSync}from"node:fs";',
    'const controls=' +
      JSON.stringify(lintControl) +
      ';const report=Uint8Array.from(' +
      JSON.stringify([...report]) +
      ');',
    'writeFileSync(' +
      JSON.stringify(pidPath) +
      ',String(process.pid));const done=Promise.withResolvers();let isFinishing=false;',
    'async function finish(){if(isFinishing)return;isFinishing=true;await Bun.write(Bun.stdout,report);await Bun.write(Bun.stderr,' +
      JSON.stringify(after) +
      ');' +
      (hasFinished ? 'process.send(controls.finished);' : '') +
      'process.disconnect();process.exitCode=' +
      String(status) +
      ';done.resolve();}',
    'process.on("message",async message=>{if(message===controls.start){const envelope=JSON.parse(await Bun.stdin.text());writeFileSync(' +
      JSON.stringify(observed) +
      ',JSON.stringify({envelope,environment:process.env}));await Bun.write(Bun.stderr,' +
      JSON.stringify(before) +
      ');writeFileSync(' +
      JSON.stringify(ready) +
      ',"ready");' +
      (waitForCancel ? '' : 'await finish();') +
      '}else if(message===controls.SIGINT||message===controls.SIGTERM){await finish();}});process.send(controls.ready);await done.promise;',
  ].join('\n');
  writeFileSync(launcher, program);
  const listeners = new Set<(signal: LintInterrupt) => void>();
  let first: LintInterrupt | undefined;
  function interrupt(signal: LintInterrupt) {
    first ??= signal;
    for (const listener of listeners) listener(signal);
  }
  const context = {
    launcher,
    callerDirectory: root,
    lookup: { directory: root, path: '/usr/bin:/bin' },
    activationRoot: 'archive',
    scratchDirectory: 'scratch',
    repository: 'candidate',
    revision: 'a'.repeat(40),
    launch: (entrypoint: string) => createLaunch(process.execPath, entrypoint),
    subscribeInterrupts: (listener: (signal: LintInterrupt) => void) => {
      listeners.add(listener);
      if (first !== undefined) listener(first);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  cleanups.push(async () => {
    interrupt('SIGTERM');
    for (let attempt = 0; attempt < 1000 && listeners.size !== 0; attempt++) await Bun.sleep(5);
    if (listeners.size !== 0) throw new Error('self-check subscription not released');
  });
  return { root, launcher, observed, ready, pidPath, before, after, context, interrupt, listeners };
}

it('certifies the real IPC peer only from a complete report with exact captured bytes', async () => {
  const report = bytes({ ...certificate, extra: ['retained'] }),
    fixture = createPeer(report);
  const outcome = await checkPreparedActivation(fixture.context);
  expect(outcome.kind).toBe('certified');
  if (outcome.kind !== 'certified') throw new Error('wrong outcome');
  expect(outcome.report).toEqual(report);
  expect(outcome.diagnostics).toEqual(Buffer.from(fixture.before + fixture.after));
  expect(fixture.listeners.size).toBe(0);
  const observed: unknown = JSON.parse(readFileSync(fixture.observed, 'utf8'));
  expect(observed).toMatchObject({
    envelope: {
      version: 1,
      callerDirectory: fixture.root,
      request: {
        command: 'lint',
        kind: 'committed',
        repository: 'candidate',
        revision: 'a'.repeat(40),
      },
    },
    environment: {
      TOOL_WIKI_ACTIVATION_ROOT: join(fixture.root, 'archive'),
      TOOL_WIKI_REQUIRE_CERTIFIED: '1',
      TMPDIR: join(fixture.root, 'scratch'),
    },
  });
});

for (const field of ['schemaVersion', 'mode', 'trustProvenance', 'accepted', 'certified'] as const)
  it('refuses zero peer status missing certificate ' + field, async () => {
    const report = { ...certificate };
    Reflect.deleteProperty(report, field);
    const raw = bytes(report),
      fixture = createPeer(raw);
    const failure = await readRefusal(checkPreparedActivation(fixture.context));
    expect(failure.code).toBe('R20');
    expect(failure.status).toBe(0);
    expect(failure.report).toEqual({ kind: 'complete', bytes: raw });
    expect(fixture.listeners.size).toBe(0);
  });
for (const [field, value] of [
  ['schemaVersion', 2],
  ['mode', 'observe'],
  ['trustProvenance', 'local'],
  ['accepted', false],
  ['certified', false],
] as const)
  it('refuses zero peer status wrong certificate ' + field, async () => {
    const fixture = createPeer(bytes({ ...certificate, [field]: value }));
    expect((await readRefusal(checkPreparedActivation(fixture.context))).status).toBe(0);
  });
for (const [label, report] of [
  ['empty', Buffer.alloc(0)],
  ['malformed', Buffer.from('not JSON')],
  ['invalid UTF8', Buffer.from([255])],
] as const)
  it('refuses zero peer status with ' + label + ' report', async () => {
    const fixture = createPeer(report);
    expect((await readRefusal(checkPreparedActivation(fixture.context))).report).toEqual({
      kind: 'complete',
      bytes: report,
    });
  });

it('does not interpret an unrequested normal130 peer status as cancellation', async () => {
  const fixture = createPeer(bytes(certificate), 130);
  expect((await readRefusal(checkPreparedActivation(fixture.context))).status).toBe(130);
});

it('returns recorded first cancellation and releases its only controller subscription', async () => {
  const fixture = createPeer(bytes(certificate), 130, true);
  const pending = checkPreparedActivation(fixture.context);
  await waitPath(fixture.ready);
  fixture.interrupt('SIGINT');
  fixture.interrupt('SIGTERM');
  const outcome = await pending;
  expect(outcome).toMatchObject({ kind: 'cancelled', status: 130 });
  expect(fixture.listeners.size).toBe(0);
});

it('refuses a nonzero peer status that does not match the recorded first signal', async () => {
  const fixture = createPeer(bytes(certificate), 143, true);
  const pending = readRefusal(checkPreparedActivation(fixture.context));
  await waitPath(fixture.ready);
  fixture.interrupt('SIGINT');
  const failure = await pending;
  expect(failure.status).toBe(143);
  expect(failure.diagnostics.kind).toBe('prefix');
  expect(fixture.listeners.size).toBe(0);
});

it('retains complete status1 diagnostics after cancellation without manufacturing cleanup success', async () => {
  const fixture = createPeer(bytes(certificate), 1, true);
  const pending = readRefusal(checkPreparedActivation(fixture.context));
  await waitPath(fixture.ready);
  fixture.interrupt('SIGINT');
  const failure = await pending;
  expect(failure.status).toBe(1);
  expect(failure.diagnostics).toEqual({
    kind: 'complete',
    bytes: Buffer.from(fixture.before + fixture.after),
  });
  expect(failure.message).toContain('cleanup is unconfirmed');
  expect(failure.message).toContain('scratch/retained');
  expect(failure.report.kind).toBe('prefix');
  expect(fixture.listeners.size).toBe(0);
});

it('preserves other interrupted verdict diagnostics as a captured prefix', async () => {
  const fixture = createPeer(bytes(certificate), 37, true);
  const pending = readRefusal(checkPreparedActivation(fixture.context));
  await waitPath(fixture.ready);
  fixture.interrupt('SIGINT');
  const failure = await pending;
  expect(failure.status).toBe(37);
  expect(failure.diagnostics.kind).toBe('prefix');
  expect(failure.report.kind).toBe('prefix');
});

it('launches no peer when prior cancellation is replayed and releases the subscription', async () => {
  const fixture = createPeer(bytes(certificate));
  fixture.interrupt('SIGTERM');
  expect(await checkPreparedActivation(fixture.context)).toMatchObject({
    kind: 'cancelled',
    status: 143,
  });
  expect(existsSync(fixture.pidPath)).toBe(false);
  expect(fixture.listeners.size).toBe(0);
});

it('uses the protected launch capability and does not inherit a closure override', async () => {
  const fixture = createPeer(bytes(certificate)),
    poison = join(fixture.root, 'poison.mjs'),
    marker = join(fixture.root, 'poison-ran');
  writeFileSync(poison, 'await Bun.write(' + JSON.stringify(marker) + ',"ran");');
  writeFileSync(join(fixture.root, 'bunfig.toml'), 'preload = [' + JSON.stringify(poison) + ']\n');
  const previous = process.env['TOOL_WIKI_TRUSTED_NODE_MODULES'];
  process.env['TOOL_WIKI_TRUSTED_NODE_MODULES'] = '/operator/unrelated-closure';
  try {
    expect((await checkPreparedActivation(fixture.context)).kind).toBe('certified');
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, 'TOOL_WIKI_TRUSTED_NODE_MODULES');
    else process.env['TOOL_WIKI_TRUSTED_NODE_MODULES'] = previous;
  }
  expect(existsSync(marker)).toBe(false);
  const observed = JSON.parse(readFileSync(fixture.observed, 'utf8')) as {
    environment: Record<string, string>;
  };
  expect(observed.environment['TOOL_WIKI_TRUSTED_NODE_MODULES']).toBeUndefined();
});

it('preserves original controller failures and retained diagnostics rather than certifying a broken transport', async () => {
  const fixture = createPeer(bytes(certificate), 0, false, false);
  const cause: unknown = await checkPreparedActivation(fixture.context).then(
    () => {
      throw new Error('broken peer transport unexpectedly certified');
    },
    (cause: unknown) => cause,
  );
  expect(cause).toBeInstanceOf(InstalledLintFailure);
  expect(cause).not.toBeInstanceOf(PreparedSelfCheckFailure);
  if (!(cause instanceof InstalledLintFailure))
    throw new Error('wrong transport failure', { cause });
  expect(Buffer.from(cause.stderr).toString()).toBe(fixture.before + fixture.after);
  expect(cause.message).toContain('launcher PID');
  expect(cause.message).toContain('cleanup is unconfirmed');
  expect(fixture.listeners.size).toBe(0);
});
