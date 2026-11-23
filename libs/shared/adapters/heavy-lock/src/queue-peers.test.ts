import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

import { holdLock } from './native';
import { createQueueRuntime, runQueuedWork } from './queue';
import { readStatus, renderStatus } from './records';

const roots: string[] = [];
const legacy = resolve(import.meta.dir, '../../../../../bin/heavy-lock-lib.sh');
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni mixed lock peers '));
  roots.push(root);
  return { root, path: join(root, 'mutex') };
}
function runLegacy(script: string, path: string) {
  return Bun.spawnSync(
    ['/bin/bash', '-c', 'source "$1"\n' + script, 'puni legacy fixture', legacy, path],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 5000 },
  );
}
function decode(stdout: Uint8Array) {
  return new TextDecoder().decode(stdout);
}

it('keeps a Bun waiter outside the actual old Bash Perl-flock holder until its native descriptor closes', async () => {
  const f = createFixture();
  const child = Bun.spawn(
    [
      '/bin/bash',
      '-c',
      'source "$1"\nHEAVY_LOCK_LABEL="old lane"\nclaim_heavy_lock "$2.d"\nprintf "ready\\n"\nread -r release\nrm "$2.d/label" "$2.d/holder"\nrmdir "$2.d"\nexec 9>&-',
      'puni old holder fixture',
      legacy,
      f.path,
    ],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', timeout: 10000 },
  );
  try {
    const reader = child.stdout.getReader(),
      first = await reader.read();
    expect(decode(first.value ?? new Uint8Array())).toBe('ready\n');
    reader.releaseLock();
    const controller = new AbortController(),
      runtime = createQueueRuntime(controller.signal);
    expect(readStatus(f.path, BigInt(Math.floor(Date.now() / 1000))).holder).toMatchObject({
      kind: 'recorded',
      pidText: String(child.pid),
      label: { kind: 'named', text: 'old lane' },
    });
    let entered = false;
    expect(
      (
        await runQueuedWork(
          { path: f.path, label: 'new lane', command: 'bun', waitSeconds: 0, pollSeconds: 1 },
          () => {
            entered = true;
            return Promise.resolve(1);
          },
          runtime,
        )
      ).kind,
    ).toBe('refused');
    expect(entered).toBe(false);
    await child.stdin.write('release\n');
    await child.stdin.end();
    expect(await child.exited).toBe(0);
    expect(
      (
        await runQueuedWork(
          { path: f.path, label: 'new lane', command: 'bun', waitSeconds: 0, pollSeconds: 1 },
          () => Promise.resolve(2),
          runtime,
        )
      ).kind,
    ).toBe('completed');
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await child.exited;
    }
  }
});

it('lets the old Bash claimant and status reader observe a Bun native holder without entering it', async () => {
  const f = createFixture(),
    runtime = createQueueRuntime(new AbortController().signal);
  let expectedStatus = '';
  const completion = await runQueuedWork(
    { path: f.path, label: 'Bun lane', command: 'bun', waitSeconds: 0, pollSeconds: 1 },
    () => {
      expectedStatus = renderStatus(readStatus(f.path, BigInt(Math.floor(Date.now() / 1000))));
      const status = runLegacy('report_heavy_lock_status "$2"', f.path);
      expect(status.exitCode).toBe(0);
      expect(decode(status.stdout)).toBe(expectedStatus);
      const contender = runLegacy('claim_heavy_lock "$2.d"', f.path);
      expect(contender.exitCode).toBe(75);
      expect(readFileSync(f.path + '.d/holder', 'utf8')).toBe(String(process.pid) + '\n');
      return Promise.resolve(1);
    },
    runtime,
  );
  expect(completion.kind).toBe('completed');
  const next = runLegacy(
    'HEAVY_LOCK_LABEL="old after Bun"\nclaim_heavy_lock "$2.d"\nrm "$2.d/label" "$2.d/holder"\nrmdir "$2.d"\nexec 9>&-',
    f.path,
  );
  expect(next.exitCode).toBe(0);
  expect(existsSync(f.path + '.d')).toBe(false);
});

it('publishes a Bun ticket readable by old Bash while waiting without exposing a partial body', async () => {
  const f = createFixture(),
    base = createQueueRuntime(new AbortController().signal);
  let observed = false;
  mkdirSync(f.path + '.d');
  writeFileSync(f.path + '.d/holder', String(process.pid) + '\n');
  const active = await runQueuedWork(
    {
      path: f.path,
      label: 'Bun queue lane',
      command: 'bun\nlabel forged\ndeadline 1',
      waitSeconds: 1,
      pollSeconds: 1,
    },
    () => Promise.resolve(1),
    {
      ...base,
      isAlive: () => true,
      wait: () => {
        const entries = readdirSync(f.path + '.queue');
        expect(entries).toHaveLength(1);
        const name = entries.at(0);
        if (name === undefined) throw new Error('missing ticket');
        const child = runLegacy(
          'read_ticket_label "$2.queue/"*\nread_ticket_deadline "$2.queue/"*',
          f.path,
        );
        expect(child.exitCode).toBe(0);
        expect(decode(child.stdout)).toMatch(/^Bun queue lane\n[0-9]+\n$/u);
        observed = true;
        return Promise.resolve('cancelled');
      },
    },
  );
  expect(active.kind).toBe('cancelled');
  expect(observed).toBe(true);
});

it('serves the slower earlier Bun process before the faster later process after a real holder releases', async () => {
  const f = createFixture(),
    order = join(f.root, 'order'),
    entry = join(f.root, 'waiter.ts');
  writeFileSync(
    entry,
    'import{appendFileSync}from"node:fs";import{createQueueRuntime,runQueuedWork}from ' +
      JSON.stringify(join(import.meta.dir, 'queue.ts')) +
      ';const [path,order,label,poll]=process.argv.slice(2);if(path===undefined||order===undefined||label===undefined||poll===undefined)throw new Error("arguments absent");const completion=await runQueuedWork({path,label,command:"fixture",waitSeconds:20,pollSeconds:Number(poll)},async()=>{appendFileSync(order,label+"\\n");await Bun.sleep(50);return label;},createQueueRuntime(new AbortController().signal));if(completion.kind!=="completed")throw new Error(JSON.stringify(completion));process.stdout.write(JSON.stringify(completion));',
  );
  const entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>(),
    holding = holdLock(f.path, async () => {
      entered.resolve(undefined);
      await release.promise;
    });
  await entered.promise;
  const peers: ReturnType<typeof Bun.spawn>[] = [];
  async function waitTicket(pid: number) {
    const end = performance.now() + 5000;
    while (performance.now() < end) {
      if (
        existsSync(f.path + '.queue') &&
        readdirSync(f.path + '.queue').some(
          (name) => !name.startsWith('.') && name.endsWith('-' + String(pid)),
        )
      )
        return;
      await Bun.sleep(10);
    }
    throw new Error('peer did not publish ticket: ' + String(pid));
  }
  try {
    const slow = Bun.spawn(
      [
        process.execPath,
        '--no-env-file',
        '--config=/dev/null',
        entry,
        f.path,
        order,
        'slow-first',
        '2',
      ],
      { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 15000 },
    );
    peers.push(slow);
    await waitTicket(slow.pid);
    const fast = Bun.spawn(
      [
        process.execPath,
        '--no-env-file',
        '--config=/dev/null',
        entry,
        f.path,
        order,
        'fast-second',
        '1',
      ],
      { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 15000 },
    );
    peers.push(fast);
    await waitTicket(fast.pid);
    release.resolve(undefined);
    await holding;
    expect(await slow.exited).toBe(0);
    expect(await fast.exited).toBe(0);
    expect(await new Response(slow.stderr).text()).toBe('');
    expect(await new Response(fast.stderr).text()).toBe('');
    expect(readFileSync(order, 'utf8')).toBe('slow-first\nfast-second\n');
    expect(readdirSync(f.path + '.queue')).toEqual([]);
  } finally {
    release.resolve(undefined);
    await holding;
    for (const peer of peers) {
      if (peer.exitCode === null) peer.kill('SIGKILL');
      await peer.exited;
    }
  }
}, 20000);
