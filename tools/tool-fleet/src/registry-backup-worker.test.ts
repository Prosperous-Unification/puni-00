import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import * as origins from './registry-backup-attempt';
import { prepareRegistryBackupAttempt } from './registry-backup-attempt';
import { runRegistryBackupWorker } from './registry-backup-worker';
import * as artifacts from './registry-maintenance-installation';
import * as lifetimes from './registry-maintenance-process';
const guardian = {
  pid: process.pid,
  startTicks: '100',
  pidNamespace: 'pid:[4026531836]',
  machineId: 'b'.repeat(32),
  bootId: '22222222-2222-4222-8222-222222222222',
};
const request = {
  operationId: 'owned',
  owner: 'operator',
  token: '11111111-1111-4111-8111-111111111111',
  action: 'backup-preflight' as const,
};
const attempt = prepareRegistryBackupAttempt({
  ...request,
  configurationSha256: 'a'.repeat(64),
  registryId: 'registry',
  guardian,
  journalRevision: 7,
  now: '2026-10-26T00:00:00.000Z',
});
let observed: ReturnType<typeof spyOn<typeof origins, 'readRegistryBackupGuardian'>>;
let verified: ReturnType<typeof spyOn<typeof artifacts, 'verifyRegistryHostArtifact'>>;
let spawned: ReturnType<typeof spyOn<typeof Bun, 'spawn'>>;
let reaped: ReturnType<typeof spyOn<typeof lifetimes, 'awaitRegistryBackupChild'>>;
let written: string[];
let ended: boolean;
let output: unknown;
let writeEffect: (text: string) => number | Promise<number>;
let endEffect: () => number | Promise<number>;
const fixture = () => ({
  request,
  signal: new AbortController().signal,
  descriptor: 37,
  installed: {
    registryId: 'registry',
    backupConfiguration: { path: '/root/.puni/registry/backup.json', sha256: 'a'.repeat(64) },
    backupWorker: {
      path: '/usr/local/libexec/puni-registry-maintenance/backup-worker.js',
      sha256: 'c'.repeat(64),
    },
  },
  journal: {
    revision: 7,
    enrollment: { registryId: 'registry' },
    maintenance: request,
    maintenanceEvidence: { backupAttempts: [structuredClone(attempt)] },
  },
});
beforeEach(() => {
  written = [];
  ended = false;
  output = { kind: 'complete', receipt: 'verified' };
  writeEffect = (text) => text.length;
  endEffect = () => 0;
  observed = spyOn(origins, 'readRegistryBackupGuardian').mockResolvedValue(guardian);
  verified = spyOn(artifacts, 'verifyRegistryHostArtifact').mockResolvedValue(
    Buffer.from('pinned fixture bytes'),
  );
  reaped = spyOn(lifetimes, 'awaitRegistryBackupChild').mockImplementation(() => {
    expect(ended).toBe(false);
    return Promise.resolve();
  });
  spawned = spyOn(Bun, 'spawn').mockImplementation((argv: unknown, options?: unknown) => {
    expect(argv).toEqual([
      '/usr/bin/unshare',
      '--uts',
      '--',
      '/usr/local/libexec/puni-registry-authority/bun',
      '/usr/local/libexec/puni-registry-maintenance/backup-worker.js',
    ]);
    expect(options).toEqual({
      env: { PATH: '/usr/bin:/bin', LANG: 'C' },
      stdio: ['pipe', 'pipe', 'pipe', 37],
      detached: true,
    });
    return {
      pid: 99,
      exitCode: 0,
      exited: Promise.resolve(0),
      stdin: {
        write: (text: string) => {
          written.push(text);
          return writeEffect(text);
        },
        flush: () => Promise.resolve(0),
        end: () => {
          ended = true;
          return endEffect();
        },
      },
      stdout: new Response(JSON.stringify(output) + '\n').body,
      stderr: new Response('').body,
    } as never;
  });
});
afterEach(() => {
  observed.mockRestore();
  verified.mockRestore();
  reaped.mockRestore();
  spawned.mockRestore();
});

test('fixed UTS launcher uses installed artifacts and inherited same lock, never request argv/environment', async () => {
  const receipt: unknown = JSON.parse(await runRegistryBackupWorker(fixture() as never));
  expect(receipt).toEqual({ attemptId: attempt.id, receipt: 'verified' });
  expect(
    verified.mock.calls.map(
      (call: Parameters<typeof artifacts.verifyRegistryHostArtifact>) => call[0].path,
    ),
  ).toEqual([
    '/usr/bin/unshare',
    '/usr/local/libexec/puni-registry-authority/bun',
    '/usr/local/libexec/puni-registry-maintenance/backup-worker.js',
    '/root/.puni/registry/backup.json',
  ]);
  expect(written).toEqual([JSON.stringify(request) + '\n']);
  expect(ended).toBe(true);
  expect(reaped).toHaveBeenCalledTimes(1);
});
for (const fault of [
  'missing',
  'pid',
  'namespace',
  'revision',
  'settled',
  'configuration',
  'token',
  'action',
] as const) {
  test(`fixed worker refuses ${fault} lineage before process effect`, async () => {
    const selected = fixture();
    const current = selected.journal.maintenanceEvidence.backupAttempts[0];
    if (fault === 'missing') selected.journal.maintenanceEvidence.backupAttempts = [];
    if (fault === 'pid') current.guardian.pid++;
    if (fault === 'namespace') current.guardian.pidNamespace = 'pid:[4026532000]';
    if (fault === 'revision') current.journalRevision--;
    if (fault === 'settled') {
      current.state = 'settled';
      current.settlementSha256 = 'd'.repeat(64);
    }
    if (fault === 'configuration') current.configurationSha256 = 'd'.repeat(64);
    if (fault === 'token') current.tokenSha256 = 'd'.repeat(64);
    if (fault === 'action') current.action = 'backup-snapshot';
    await runRegistryBackupWorker(selected as never).then(
      () => {
        throw new Error('Invalid worker lineage unexpectedly succeeded');
      },
      (cause: unknown) => {
        expect(cause).toBeInstanceOf(Error);
      },
    );
    expect(spawned).not.toHaveBeenCalled();
  });
}

test('worker admission refusal retains its fixed code after terminal group cleanup', async () => {
  output = { kind: 'failed', code: 'backup-budget-unavailable' };
  reaped.mockRejectedValue(new Error('Fixed maintenance child failed (exit 1)'));
  await runRegistryBackupWorker(fixture() as never).then(
    () => {
      throw new Error('Worker unexpectedly succeeded');
    },
    (cause: unknown) => {
      expect(cause).toMatchObject({ code: 'backup-budget-unavailable' });
    },
  );
  expect(ended).toBe(true);
});

/** The side observer handles only this known modeled rejected port promise, so a bypass fails the function assertion rather than becoming a global unhandled rejection. */
function rejectPort(cause: unknown) {
  // Boundary: a modeled FileSink can reject with a non-Error; preserve that exact external failure.
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
  const failed = Promise.reject(cause);
  const observed = failed.then(
    () => {
      throw new Error('Modeled rejection unexpectedly fulfilled');
    },
    (rejected: unknown) => {
      expect(rejected).toBe(cause);
    },
  );
  return { failed, observed };
}

for (const failure of [new Error('request pipe rejected'), 42])
  test(
    'worker awaits rejected request write and reaps before control closure: ' + typeof failure,
    async () => {
      const rejected = rejectPort(failure);
      writeEffect = () => rejected.failed;
      const terminalReasons: unknown[] = [];
      reaped.mockImplementation(
        (_child: unknown, signal: AbortSignal) =>
          new Promise<void>((resolve) => {
            const terminal = () => {
              expect(ended).toBe(false);
              terminalReasons.push(signal.reason);
              resolve();
            };
            if (signal.aborted) terminal();
            else signal.addEventListener('abort', terminal, { once: true });
          }),
      );
      const input = fixture();
      input.signal = AbortSignal.timeout(100);
      await runRegistryBackupWorker(input as never).then(
        () => {
          throw new Error('Worker unexpectedly succeeded');
        },
        (cause: unknown) => {
          expect(cause).toBe(failure);
        },
      );
      await rejected.observed;
      expect(terminalReasons).toEqual([failure]);
      expect(ended).toBe(true);
    },
  );

test('worker completion waits for asynchronous control-pipe closure', async () => {
  let finish: ((count: number) => void) | undefined;
  let entered: (() => void) | undefined;
  const closing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  endEffect = () =>
    new Promise<number>((resolve) => {
      finish = resolve;
      entered!();
    });
  const running = runRegistryBackupWorker(fixture() as never);
  let completed = false;
  const observed = running.then(
    () => {
      completed = true;
    },
    () => {
      completed = true;
    },
  );
  await closing;
  try {
    await Promise.resolve();
    await Promise.resolve();
    expect(completed).toBe(false);
  } finally {
    finish!(0);
    await observed;
  }
  expect(JSON.parse(await running)).toEqual({ attemptId: attempt.id, receipt: 'verified' });
});

test('worker refuses success when asynchronous control-pipe closure rejects', async () => {
  const failure = new Error('control pipe close rejected');
  const rejected = rejectPort(failure);
  endEffect = () => rejected.failed;
  await runRegistryBackupWorker(fixture() as never).then(
    () => {
      throw new Error('Worker unexpectedly succeeded');
    },
    (cause: unknown) => {
      expect(cause).toBe(failure);
    },
  );
  await rejected.observed;
});

for (const asynchronous of [false, true])
  test(
    'worker retains primary and control-pipe cleanup failures: ' + String(asynchronous),
    async () => {
      const primary = new Error('request could not be written');
      const cleanup = new Error('control could not be closed');
      const rejected = rejectPort(cleanup);
      writeEffect = () => {
        throw primary;
      };
      endEffect = () => {
        if (asynchronous) return rejected.failed;
        throw cleanup;
      };
      const failure = await runRegistryBackupWorker(fixture() as never).then(
        () => {
          throw new Error('Worker unexpectedly succeeded');
        },
        (cause: unknown) => cause,
      );
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors).toEqual([primary, cleanup]);
      expect((failure as Error).cause).toBe(primary);
      await rejected.observed;
    },
  );

test('worker retains fixed admission refusal when cleanup also fails', async () => {
  const cleanup = new Error('control could not be closed');
  output = { kind: 'failed', code: 'backup-budget-unavailable' };
  endEffect = () => {
    throw cleanup;
  };
  const failure = await runRegistryBackupWorker(fixture() as never).then(
    () => {
      throw new Error('Worker unexpectedly succeeded');
    },
    (cause: unknown) => cause,
  );
  expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors[0]).toMatchObject({
    code: 'backup-budget-unavailable',
  });
  expect((failure as AggregateError).errors[1]).toBe(cleanup);
  expect((failure as Error).cause).toBe((failure as AggregateError).errors[0]);
});
