import * as filesystem from 'node:fs';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, spyOn, test } from 'bun:test';

import { hashBytes } from '../evidence/content-manifest';
import {
  type OfflineVerifierInvocation,
  offlineVerifierPolicy,
  type OfflineVerifierProcess,
  runPinnedOfflineGh,
  verifyOfflineReviewBundle,
} from './review-attestation';
import type { ReviewProviderAuthority } from './review-provider';

async function expectFailure(pending: Promise<unknown>, message: string): Promise<void> {
  let failure: unknown;
  try {
    await pending;
  } catch (cause) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(Error);
  if (failure instanceof Error) expect(failure.message).toContain(message);
}

function fixture(): OfflineVerifierInvocation {
  const bundle = { mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json' };
  const manifestBytes = '{"kind":"review-journal-manifest"}';
  return {
    policy: {
      executablePath: '/trusted/gh',
      executableIdentity: 'a'.repeat(64),
      version: '2.98.0',
      runtimeIdentity: 'b'.repeat(64),
      trustedRootPath: '/trusted/root.jsonl',
      trustedRootIdentity: 'c'.repeat(64),
      repository: 'trusted/review',
      certIdentity:
        'https://github.com/trusted/review/.github/workflows/review.yml@refs/heads/main',
      signerDigest: 'd'.repeat(40),
      sourceDigest: 'e'.repeat(40),
      sourceRef: 'refs/heads/main',
      issuer: 'https://token.actions.githubusercontent.com',
      predicateType: 'https://example.org/review-predicate/v1',
    },
    bundleBytes: JSON.stringify(bundle),
    manifestBytes,
    resolveRuntime: () =>
      Promise.resolve({
        executableIdentity: 'a'.repeat(64),
        version: '2.98.0',
        runtimeIdentity: 'b'.repeat(64),
        trustedRootIdentity: 'c'.repeat(64),
      }),
    run: () =>
      Promise.resolve({
        exitCode: 0,
        stdout: JSON.stringify([
          {
            attestation: { bundle },
            verificationResult: {
              signature: {
                certificate: {
                  subjectAlternativeName:
                    'https://github.com/trusted/review/.github/workflows/review.yml@refs/heads/main',
                  issuer: 'https://token.actions.githubusercontent.com',
                },
              },
              verifiedTimestamps: [{ type: 'Tlog', timestamp: '2026-10-08T00:00:00Z' }],
              statement: {
                subject: [
                  {
                    name: 'journal-manifest',
                    digest: { sha256: hashBytes(Buffer.from(manifestBytes)) },
                  },
                ],
                predicateType: 'https://example.org/review-predicate/v1',
                predicate: {},
              },
            },
          },
        ]),
        stderr: '',
      }),
  };
}

test('offline verifier refuses an uninstalled runtime before launching any process', async () => {
  let launched = 0;
  const invocation = fixture();
  await expectFailure(
    verifyOfflineReviewBundle({
      ...invocation,
      resolveRuntime: () => Promise.resolve(undefined),
      run: () => {
        launched += 1;
        return Promise.resolve({ exitCode: 0, stdout: '[]', stderr: '' });
      },
    }),
    'review verifier runtime absent',
  );
  expect(launched).toBe(0);
});

test.each([
  ['empty array', '[]'],
  ['two entries', '[{},{}]'],
  ['malformed JSON', '{'],
  ['missing verification', '[{"attestation":{}}]'],
])('offline verifier refuses %s despite process exit zero', async (_, stdout) => {
  const invocation = fixture();
  await expectFailure(
    verifyOfflineReviewBundle({
      ...invocation,
      run: () => Promise.resolve({ exitCode: 0, stdout, stderr: '' }),
    }),
    'review verifier output malformed',
  );
});

test('offline verifier refuses two otherwise valid records in one process result', async () => {
  const invocation = fixture();
  const original = await invocation.run({} as OfflineVerifierProcess);
  const selected = JSON.parse(original.stdout) as unknown[];
  await expectFailure(
    verifyOfflineReviewBundle({
      ...invocation,
      run: () =>
        Promise.resolve({ ...original, stdout: JSON.stringify([...selected, ...selected]) }),
    }),
    'review verifier output malformed',
  );
});

test('offline verifier refuses a valid but oversized JSON output before parsing', async () => {
  const invocation = fixture();
  const original = await invocation.run({} as OfflineVerifierProcess);
  const output = JSON.parse(original.stdout) as [
    { verificationResult: { statement: { predicate: Record<string, unknown> } } },
  ];
  output[0].verificationResult.statement.predicate['padding'] = 'x'.repeat(262_144);
  await expectFailure(
    verifyOfflineReviewBundle({
      ...invocation,
      run: () => Promise.resolve({ ...original, stdout: JSON.stringify(output) }),
    }),
    'review verifier output too large',
  );
});

test('offline verifier refuses a nonzero process even with valid structured output', async () => {
  const invocation = fixture();
  const original = await invocation.run({} as OfflineVerifierProcess);
  await expectFailure(
    verifyOfflineReviewBundle({
      ...invocation,
      run: () => Promise.resolve({ ...original, exitCode: 1 }),
    }),
    'review verifier process refused',
  );
});

test.each([
  ['manifest', { manifestBytes: `${' '.repeat(65_537)}{}` }],
  ['bundle', { bundleBytes: JSON.stringify({ padding: 'x'.repeat(1_048_576) }) }],
])('offline verifier refuses oversized %s before any process launch', async (_, changed) => {
  const invocation = fixture();
  let launched = 0;
  await expectFailure(
    verifyOfflineReviewBundle({
      ...invocation,
      ...changed,
      run: (process) => {
        launched += 1;
        return invocation.run(process);
      },
    }),
    'review verifier input too large',
  );
  expect(launched).toBe(0);
});

test.each([
  ['unparseable', '{'],
  ['array-shaped', '[]'],
])('offline verifier refuses %s local bundle before process launch', async (_, bundleBytes) => {
  const invocation = fixture();
  let launched = 0;
  await expectFailure(
    verifyOfflineReviewBundle({
      ...invocation,
      bundleBytes,
      run: (process) => {
        launched += 1;
        return invocation.run(process);
      },
    }),
    'review verifier bundle malformed',
  );
  expect(launched).toBe(0);
});

test.each([
  ['zero duration', { maximumDurationMs: 0, maximumOutputBytes: 100 }],
  ['excessive duration', { maximumDurationMs: 30_001, maximumOutputBytes: 100 }],
  ['zero output cap', { maximumDurationMs: 100, maximumOutputBytes: 0 }],
  ['excessive output cap', { maximumDurationMs: 100, maximumOutputBytes: 262_145 }],
])('pinned runner refuses %s before starting its executable', async (_, bounds) => {
  await expectFailure(
    runPinnedOfflineGh({
      executablePath: '/bin/true',
      argv: [],
      env: {},
      manifestBytes: '{}',
      bundleBytes: '{}',
      ...bounds,
    }),
    'review verifier process bounds malformed',
  );
});

test('pinned process runner refuses a noncanonical executable path before launch', async () => {
  await expectFailure(
    runPinnedOfflineGh({
      executablePath: '/bin/../bin/true',
      argv: [],
      env: {},
      manifestBytes: '{}',
      bundleBytes: '{}',
      maximumOutputBytes: 100,
      maximumDurationMs: 100,
    }),
    'review verifier protected path malformed',
  );
});

test('pinned runner rejects monotonic expiry even when the timer has not fired', async () => {
  let reads = 0;
  const clock = spyOn(performance, 'now').mockImplementation(() => {
    reads += 1;
    return reads === 1 ? 0 : 200;
  });
  try {
    await expectFailure(
      runPinnedOfflineGh({
        executablePath: '/bin/true',
        argv: [],
        env: {},
        manifestBytes: '{}',
        bundleBytes: '{}',
        maximumOutputBytes: 100,
        maximumDurationMs: 100,
      }),
      'review verifier process timed out',
    );
  } finally {
    clock.mockRestore();
  }
});

test('pinned runner preserves the primary process failure when cleanup also fails', async () => {
  const original = filesystem.rmSync;
  const cleanup = spyOn(filesystem, 'rmSync').mockImplementation((path, options) => {
    original(path, options);
    throw new Error('harmless cleanup sentinel');
  });
  try {
    let failure: unknown;
    try {
      await runPinnedOfflineGh({
        executablePath: '/bin/does-not-exist',
        argv: [],
        env: {},
        manifestBytes: '{}',
        bundleBytes: '{}',
        maximumOutputBytes: 100,
        maximumDurationMs: 100,
      });
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    if (failure instanceof AggregateError) {
      expect(failure.message).toContain('review verifier process cleanup failed');
      expect(failure.errors).toHaveLength(2);
      expect((failure.errors as Error[])[0]?.message).toContain(
        'review verifier process unavailable',
      );
    }
  } finally {
    cleanup.mockRestore();
  }
});

test('pinned process runner stages only local bytes and removes ambient credentials', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-attestation-runner-test-'));
  try {
    const executablePath = join(directory, 'fake-gh');
    writeFileSync(
      executablePath,
      '#!/bin/sh\n[ -z "${GH_TOKEN+x}" ] && [ -s "$1" ] && [ -s "$2" ] && [ "$(/usr/bin/stat -c %a "$1")" = 600 ] && [ "$(/usr/bin/stat -c %a "$2")" = 600 ] && [ "$(/usr/bin/stat -c %a "$PWD")" = 700 ] && printf clean || printf unsafe\n',
    );
    chmodSync(executablePath, 0o700);
    const originalToken = process.env['GH_TOKEN'];
    process.env['GH_TOKEN'] = 'harmless-sentinel';
    try {
      const exit = await runPinnedOfflineGh({
        executablePath,
        argv: ['@manifest', '@bundle'],
        env: {},
        manifestBytes: '{}',
        bundleBytes: '{}',
        maximumOutputBytes: 100,
        maximumDurationMs: 1000,
      });
      expect(exit).toEqual({ exitCode: 0, stdout: 'clean', stderr: '' });
    } finally {
      if (originalToken === undefined) delete process.env['GH_TOKEN'];
      else process.env['GH_TOKEN'] = originalToken;
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('pinned process runner kills an overlong local process and settles promptly', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-attestation-timeout-test-'));
  try {
    const executablePath = join(directory, 'fake-gh');
    writeFileSync(
      executablePath,
      '#!/bin/bash\nstart=${EPOCHREALTIME/./}\nwhile :; do now=${EPOCHREALTIME/./}; ((now-start >= 500000)) && break; done\n',
    );
    chmodSync(executablePath, 0o700);
    const started = performance.now();
    await expectFailure(
      runPinnedOfflineGh({
        executablePath,
        argv: [],
        env: {},
        manifestBytes: '{}',
        bundleBytes: '{}',
        maximumOutputBytes: 100,
        maximumDurationMs: 30,
      }),
      'review verifier process timed out',
    );
    expect(performance.now() - started).toBeLessThan(200);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('pinned runner settles a descendant-held output pipe within its deadline', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-attestation-descendant-test-'));
  try {
    const executablePath = join(directory, 'fake-gh');
    writeFileSync(executablePath, '#!/bin/sh\n/bin/sleep 1 & wait\n');
    chmodSync(executablePath, 0o700);
    const started = performance.now();
    await expectFailure(
      runPinnedOfflineGh({
        executablePath,
        argv: [],
        env: {},
        manifestBytes: '{}',
        bundleBytes: '{}',
        maximumOutputBytes: 100,
        maximumDurationMs: 30,
      }),
      'review verifier process timed out',
    );
    expect(performance.now() - started).toBeLessThan(250);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('pinned runner terminates the descendant process rather than only cancelling its pipe', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-attestation-tree-test-'));
  try {
    const executablePath = join(directory, 'fake-gh');
    const childPath = join(directory, 'child.pid');
    writeFileSync(executablePath, `#!/bin/sh\n/bin/sleep 1 & echo "$!" > '${childPath}'\nwait\n`);
    chmodSync(executablePath, 0o700);
    await expectFailure(
      runPinnedOfflineGh({
        executablePath,
        argv: [],
        env: {},
        manifestBytes: '{}',
        bundleBytes: '{}',
        maximumOutputBytes: 100,
        maximumDurationMs: 30,
      }),
      'review verifier process timed out',
    );
    const childPid = Number(readFileSync(childPath, 'utf8').trim());
    let state = 'gone';
    try {
      const status = readFileSync(`/proc/${String(childPid)}/stat`, 'utf8');
      state = status.slice(status.lastIndexOf(')') + 2, status.lastIndexOf(')') + 3);
    } catch (cause) {
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
    }
    expect(['gone', 'Z', 'X']).toContain(state);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('pinned runner cancels readers when an escaped harmless child retains the pipe', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-attestation-reader-test-'));
  const childPath = join(directory, 'child.pid');
  try {
    const executablePath = join(directory, 'fake-gh');
    writeFileSync(
      executablePath,
      `#!/bin/sh\n/usr/bin/setsid /bin/sh -c 'echo $$ > "${childPath}"; exec /bin/sleep 1' & wait\n`,
    );
    chmodSync(executablePath, 0o700);
    const started = performance.now();
    await expectFailure(
      runPinnedOfflineGh({
        executablePath,
        argv: [],
        env: {},
        manifestBytes: '{}',
        bundleBytes: '{}',
        maximumOutputBytes: 100,
        maximumDurationMs: 30,
      }),
      'review verifier process timed out',
    );
    expect(performance.now() - started).toBeLessThan(250);
  } finally {
    try {
      const childPid = Number(readFileSync(childPath, 'utf8').trim());
      process.kill(childPid, 9);
    } catch (cause) {
      expect(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH').toBe(true);
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

test('pinned runner retains a stream-cancellation error with the timeout failure', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-attestation-cancel-error-test-'));
  const cancel = spyOn(ReadableStreamDefaultReader.prototype, 'cancel').mockImplementation(() =>
    Promise.reject(new Error('harmless reader-cancel sentinel')),
  );
  try {
    const executablePath = join(directory, 'fake-gh');
    writeFileSync(executablePath, '#!/bin/sh\n/bin/sleep 1 & wait\n');
    chmodSync(executablePath, 0o700);
    let failure: unknown;
    try {
      await runPinnedOfflineGh({
        executablePath,
        argv: [],
        env: {},
        manifestBytes: '{}',
        bundleBytes: '{}',
        maximumOutputBytes: 100,
        maximumDurationMs: 30,
      });
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    if (failure instanceof AggregateError) {
      expect(
        failure.errors.some(
          (cause: unknown) =>
            cause instanceof Error && cause.message === 'harmless reader-cancel sentinel',
        ),
      ).toBe(true);
      expect(
        failure.errors.some(
          (cause: unknown) =>
            cause instanceof Error && cause.message === 'review verifier process timed out',
        ),
      ).toBe(true);
    }
  } finally {
    cancel.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('pinned runner settles both reader cancellations before returning', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-attestation-reader-settle-test-'));
  let settled = 0;
  const cancel = spyOn(ReadableStreamDefaultReader.prototype, 'cancel').mockImplementation(
    async () => {
      await Bun.sleep(60);
      settled += 1;
    },
  );
  try {
    const executablePath = join(directory, 'fake-gh');
    writeFileSync(executablePath, '#!/bin/sh\n/bin/sleep 1 & wait\n');
    chmodSync(executablePath, 0o700);
    await expectFailure(
      runPinnedOfflineGh({
        executablePath,
        argv: [],
        env: {},
        manifestBytes: '{}',
        bundleBytes: '{}',
        maximumOutputBytes: 100,
        maximumDurationMs: 30,
      }),
      'review verifier process timed out',
    );
    expect(settled).toBe(2);
  } finally {
    cancel.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('pinned runner retains delayed sibling cancellation failure after stdout overflow', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-attestation-sibling-test-'));
  let settled = 0;
  const cancel = spyOn(ReadableStreamDefaultReader.prototype, 'cancel').mockImplementation(
    async () => {
      await Bun.sleep(100);
      settled += 1;
      throw new Error('harmless sibling-cancel sentinel');
    },
  );
  try {
    const executablePath = join(directory, 'fake-gh');
    writeFileSync(
      executablePath,
      '#!/bin/sh\ni=0; while [ "$i" -lt 200 ]; do printf x; i=$((i+1)); done\n/bin/sleep 1\n',
    );
    chmodSync(executablePath, 0o700);
    let failure: unknown;
    try {
      await runPinnedOfflineGh({
        executablePath,
        argv: [],
        env: {},
        manifestBytes: '{}',
        bundleBytes: '{}',
        maximumOutputBytes: 100,
        maximumDurationMs: 1000,
      });
    } catch (cause) {
      failure = cause;
    }
    expect(settled).toBeGreaterThan(0);
    expect(failure).toBeInstanceOf(AggregateError);
    if (failure instanceof AggregateError) {
      expect(
        failure.errors.some(
          (cause: unknown) =>
            cause instanceof Error && cause.message === 'review verifier process output too large',
        ),
      ).toBe(true);
      expect(
        failure.errors.some(
          (cause: unknown) =>
            cause instanceof Error && cause.message === 'harmless sibling-cancel sentinel',
        ),
      ).toBe(true);
    }
  } finally {
    cancel.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('pinned runner refuses to spawn after staging consumes its deadline', async () => {
  const originalWrite = filesystem.writeFileSync;
  const write = spyOn(filesystem, 'writeFileSync').mockImplementation((path, contents, options) => {
    originalWrite(path, contents, options);
    const until = performance.now() + 65;
    while (performance.now() < until) continue;
  });
  const spawn = spyOn(Bun, 'spawn');
  try {
    await expectFailure(
      runPinnedOfflineGh({
        executablePath: '/bin/true',
        argv: [],
        env: {},
        manifestBytes: '{}',
        bundleBytes: '{}',
        maximumOutputBytes: 100,
        maximumDurationMs: 30,
      }),
      'review verifier process timed out',
    );
    expect(spawn).not.toHaveBeenCalled();
  } finally {
    spawn.mockRestore();
    write.mockRestore();
  }
});

test('pinned runner reports cleanup overrun instead of returning success', async () => {
  const originalRemove = filesystem.rmSync;
  const remove = spyOn(filesystem, 'rmSync').mockImplementation((path, options) => {
    originalRemove(path, options);
    const until = performance.now() + 75;
    while (performance.now() < until) continue;
  });
  try {
    await expectFailure(
      runPinnedOfflineGh({
        executablePath: '/bin/true',
        argv: [],
        env: {},
        manifestBytes: '{}',
        bundleBytes: '{}',
        maximumOutputBytes: 100,
        maximumDurationMs: 50,
      }),
      'review verifier process timed out',
    );
  } finally {
    remove.mockRestore();
  }
});

test('pinned runner treats cancellation during cleanup as cancellation', async () => {
  const aborter = new AbortController();
  const originalRemove = filesystem.rmSync;
  const remove = spyOn(filesystem, 'rmSync').mockImplementation((path, options) => {
    originalRemove(path, options);
    aborter.abort();
  });
  try {
    await expectFailure(
      runPinnedOfflineGh(
        {
          executablePath: '/bin/true',
          argv: [],
          env: {},
          manifestBytes: '{}',
          bundleBytes: '{}',
          maximumOutputBytes: 100,
          maximumDurationMs: 1000,
        },
        aborter.signal,
      ),
      'review verifier process cancelled',
    );
  } finally {
    remove.mockRestore();
  }
});

test('pinned runner refuses an already-aborted launch before staging or spawn', async () => {
  const aborter = new AbortController();
  aborter.abort();
  const spawn = spyOn(Bun, 'spawn');
  const stage = spyOn(filesystem, 'mkdtempSync');
  try {
    await expectFailure(
      runPinnedOfflineGh(
        {
          executablePath: '/bin/true',
          argv: [],
          env: {},
          manifestBytes: '{}',
          bundleBytes: '{}',
          maximumOutputBytes: 100,
          maximumDurationMs: 1000,
        },
        aborter.signal,
      ),
      'review verifier process cancelled',
    );
    expect(spawn).not.toHaveBeenCalled();
    expect(stage).not.toHaveBeenCalled();
  } finally {
    spawn.mockRestore();
    stage.mockRestore();
  }
});

test.each([
  ['duration', { maximumDurationMs: Number.NaN }],
  ['output', { maximumOutputBytes: Number.NaN }],
])('pinned runner refuses noninteger %s limit before spawn', async (_, changed) => {
  const spawn = spyOn(Bun, 'spawn');
  try {
    await expectFailure(
      runPinnedOfflineGh({
        executablePath: '/bin/true',
        argv: [],
        env: {},
        manifestBytes: '{}',
        bundleBytes: '{}',
        maximumOutputBytes: 100,
        maximumDurationMs: 100,
        ...changed,
      }),
      'review verifier process bounds malformed',
    );
    expect(spawn).not.toHaveBeenCalled();
  } finally {
    spawn.mockRestore();
  }
});

test.each(['stdout', 'stderr'])('pinned runner rejects invalid UTF-8 in %s', async (channel) => {
  const directory = mkdtempSync(join(tmpdir(), 'review-attestation-utf8-test-'));
  try {
    const executablePath = join(directory, 'fake-gh');
    writeFileSync(
      executablePath,
      `#!/bin/sh\nprintf '\\377' ${channel === 'stderr' ? '>&2' : ''}\n`,
    );
    chmodSync(executablePath, 0o700);
    await expectFailure(
      runPinnedOfflineGh({
        executablePath,
        argv: [],
        env: {},
        manifestBytes: '{}',
        bundleBytes: '{}',
        maximumOutputBytes: 100,
        maximumDurationMs: 1000,
      }),
      'review verifier process unavailable',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('pinned runner applies the output cap to stderr independently', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-attestation-stderr-test-'));
  try {
    const executablePath = join(directory, 'fake-gh');
    writeFileSync(
      executablePath,
      '#!/bin/sh\ni=0; while [ "$i" -lt 200 ]; do printf x >&2; i=$((i+1)); done\n',
    );
    chmodSync(executablePath, 0o700);
    await expectFailure(
      runPinnedOfflineGh({
        executablePath,
        argv: [],
        env: {},
        manifestBytes: '{}',
        bundleBytes: '{}',
        maximumOutputBytes: 100,
        maximumDurationMs: 1000,
      }),
      'review verifier process output too large',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('pinned process runner rejects excessive output and kills the process', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-attestation-output-test-'));
  try {
    const executablePath = join(directory, 'fake-gh');
    writeFileSync(
      executablePath,
      '#!/bin/sh\ni=0; while [ "$i" -lt 200 ]; do printf x; i=$((i+1)); done\n',
    );
    chmodSync(executablePath, 0o700);
    await expectFailure(
      runPinnedOfflineGh({
        executablePath,
        argv: [],
        env: {},
        manifestBytes: '{}',
        bundleBytes: '{}',
        maximumOutputBytes: 100,
        maximumDurationMs: 1000,
      }),
      'review verifier process output too large',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('pinned process runner aborts and settles an active local process', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-attestation-abort-test-'));
  try {
    const executablePath = join(directory, 'fake-gh');
    writeFileSync(executablePath, '#!/bin/sh\nwhile :; do :; done\n');
    chmodSync(executablePath, 0o700);
    const aborter = new AbortController();
    const started = performance.now();
    const pending = runPinnedOfflineGh(
      {
        executablePath,
        argv: [],
        env: {},
        manifestBytes: '{}',
        bundleBytes: '{}',
        maximumOutputBytes: 100,
        maximumDurationMs: 1000,
      },
      aborter.signal,
    );
    setTimeout(() => {
      aborter.abort();
    }, 20);
    await expectFailure(pending, 'review verifier process cancelled');
    expect(performance.now() - started).toBeLessThan(1000);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('offline verifier refuses a foreign subject even when the process exits zero', async () => {
  const invocation = fixture();
  const original = await invocation.run({} as OfflineVerifierProcess);
  const output = JSON.parse(original.stdout) as [
    { verificationResult: { statement: { subject: [{ digest: { sha256: string } }] } } },
  ];
  output[0].verificationResult.statement.subject[0].digest.sha256 = 'f'.repeat(64);
  await expectFailure(
    verifyOfflineReviewBundle({
      ...invocation,
      run: () => Promise.resolve({ ...original, stdout: JSON.stringify(output) }),
    }),
    'review verifier subject differs from manifest',
  );
});

test.each([
  [
    'two subjects',
    (entry: Record<string, unknown>) => {
      const verification = entry['verificationResult'] as { statement: { subject: unknown[] } };
      verification.statement.subject.push(verification.statement.subject[0]);
    },
  ],
  [
    'missing predicate',
    (entry: Record<string, unknown>) => {
      const verification = entry['verificationResult'] as { statement: { predicate: unknown } };
      verification.statement.predicate = null;
    },
  ],
])('offline verifier refuses %s in exit-zero statement', async (_, mutate) => {
  const invocation = fixture();
  const original = await invocation.run({} as OfflineVerifierProcess);
  const output = JSON.parse(original.stdout) as [Record<string, unknown>];
  mutate(output[0]);
  await expectFailure(
    verifyOfflineReviewBundle({
      ...invocation,
      run: () => Promise.resolve({ ...original, stdout: JSON.stringify(output) }),
    }),
    'review verifier output malformed',
  );
});

test.each([
  [
    'bundle',
    (entry: Record<string, unknown>) => {
      entry['attestation'] = { bundle: { mediaType: 'foreign' } };
    },
    'review verifier bundle differs from input',
  ],
  [
    'certificate identity',
    (entry: Record<string, unknown>) => {
      const verification = entry['verificationResult'] as {
        signature: { certificate: { subjectAlternativeName: string } };
      };
      verification.signature.certificate.subjectAlternativeName =
        'https://github.com/foreign/review';
    },
    'review verifier output differs from policy',
  ],
  [
    'issuer',
    (entry: Record<string, unknown>) => {
      const verification = entry['verificationResult'] as {
        signature: { certificate: { issuer: string } };
      };
      verification.signature.certificate.issuer = 'https://foreign.example';
    },
    'review verifier output differs from policy',
  ],
  [
    'predicate type',
    (entry: Record<string, unknown>) => {
      const verification = entry['verificationResult'] as { statement: { predicateType: string } };
      verification.statement.predicateType = 'https://foreign.example/predicate';
    },
    'review verifier output differs from policy',
  ],
  [
    'timestamp',
    (entry: Record<string, unknown>) => {
      const verification = entry['verificationResult'] as { verifiedTimestamps: unknown[] };
      verification.verifiedTimestamps = [];
    },
    'review verifier output malformed',
  ],
  [
    'malformed timestamp',
    (entry: Record<string, unknown>) => {
      const verification = entry['verificationResult'] as { verifiedTimestamps: unknown[] };
      verification.verifiedTimestamps = [{}];
    },
    'review verifier output malformed',
  ],
])('offline verifier refuses %s in exit-zero structured output', async (_, mutate, message) => {
  const invocation = fixture();
  const original = await invocation.run({} as OfflineVerifierProcess);
  const output = JSON.parse(original.stdout) as [Record<string, unknown>];
  mutate(output[0]);
  await expectFailure(
    verifyOfflineReviewBundle({
      ...invocation,
      run: () => Promise.resolve({ ...original, stdout: JSON.stringify(output) }),
    }),
    message,
  );
});

test.each([
  ['repository', { repository: '--owner' }],
  ['certificate', { certIdentity: 'https://github.com/review $TOKEN' }],
  ['signer digest', { signerDigest: 'a'.repeat(64) }],
  ['source digest', { sourceDigest: 'a'.repeat(64) }],
  ['source ref', { sourceRef: '--owner' }],
  ['issuer', { issuer: 'http://untrusted' }],
  ['predicate type', { predicateType: 'http://untrusted' }],
])('offline verifier refuses malformed %s switch before launch', async (_, changed) => {
  const invocation = fixture();
  let launched = 0;
  await expectFailure(
    verifyOfflineReviewBundle({
      ...invocation,
      policy: { ...invocation.policy, ...changed },
      run: (process) => {
        launched += 1;
        return invocation.run(process);
      },
    }),
    'review verifier policy malformed',
  );
  expect(launched).toBe(0);
});

test('offline verifier refuses a coherently repinned version outside v2.98.0', async () => {
  const invocation = fixture();
  let launched = 0;
  await expectFailure(
    verifyOfflineReviewBundle({
      ...invocation,
      policy: { ...invocation.policy, version: '2.99.0' },
      resolveRuntime: () =>
        Promise.resolve({
          executableIdentity: invocation.policy.executableIdentity,
          version: '2.99.0',
          runtimeIdentity: invocation.policy.runtimeIdentity,
          trustedRootIdentity: invocation.policy.trustedRootIdentity,
        }),
      run: (process) => {
        launched += 1;
        return invocation.run(process);
      },
    }),
    'review verifier policy malformed',
  );
  expect(launched).toBe(0);
});

test.each(['executableIdentity', 'runtimeIdentity', 'trustedRootIdentity'] as const)(
  'offline verifier refuses coherently repinned malformed %s hash',
  async (field) => {
    const invocation = fixture();
    let launched = 0;
    await expectFailure(
      verifyOfflineReviewBundle({
        ...invocation,
        policy: { ...invocation.policy, [field]: 'malformed' },
        resolveRuntime: () =>
          Promise.resolve({
            executableIdentity: invocation.policy.executableIdentity,
            version: invocation.policy.version,
            runtimeIdentity: invocation.policy.runtimeIdentity,
            trustedRootIdentity: invocation.policy.trustedRootIdentity,
            [field]: 'malformed',
          }),
        run: (process) => {
          launched += 1;
          return invocation.run(process);
        },
      }),
      'review verifier policy malformed',
    );
    expect(launched).toBe(0);
  },
);

test('offline verifier policy maps every protected authority binding into fixed process switches', async () => {
  const invocation = fixture();
  const authority = {
    descriptor: {
      control: {
        owner: 'trusted',
        repository: 'review',
        signerDigest: invocation.policy.signerDigest,
        sourceCommitSha: invocation.policy.sourceDigest,
        dispatchRef: invocation.policy.sourceRef,
      },
      attestation: {
        verifierExecutablePath: invocation.policy.executablePath,
        verifierIdentity: invocation.policy.executableIdentity,
        verifierVersion: invocation.policy.version,
        verifierRuntimeIdentity: invocation.policy.runtimeIdentity,
        trustedRootPath: invocation.policy.trustedRootPath,
        trustedRootIdentity: invocation.policy.trustedRootIdentity,
        signerIdentity: invocation.policy.certIdentity,
        issuer: invocation.policy.issuer,
        predicateType: invocation.policy.predicateType,
      },
    },
  } as ReviewProviderAuthority;
  const policy = offlineVerifierPolicy(authority);
  expect(policy).toEqual(invocation.policy);
  let launched = 0;
  await verifyOfflineReviewBundle({
    ...invocation,
    policy,
    run: (process) => {
      launched += 1;
      expect(process.argv).toContain(policy.trustedRootPath);
      expect(process.argv).toContain(policy.signerDigest);
      return invocation.run(process);
    },
  });
  expect(launched).toBe(1);
});

test.each([
  ['executable', { executablePath: '/trusted/../foreign-gh' }],
  ['trusted root', { trustedRootPath: '/trusted/../foreign-root' }],
])('offline verifier refuses a noncanonical %s path before launch', async (_, changed) => {
  const invocation = fixture();
  let launched = 0;
  await expectFailure(
    verifyOfflineReviewBundle({
      ...invocation,
      policy: { ...invocation.policy, ...changed },
      run: (process) => {
        launched += 1;
        return invocation.run(process);
      },
    }),
    'review verifier protected path malformed',
  );
  expect(launched).toBe(0);
});

test('offline verifier fixes all gh 2.98.0 policy switches and passes no inherited environment', async () => {
  const invocation = fixture();
  let launched: OfflineVerifierProcess | undefined;
  const observation = await verifyOfflineReviewBundle({
    ...invocation,
    run: (process) => {
      launched = process;
      return invocation.run(process);
    },
  });
  expect(launched?.executablePath).toBe('/trusted/gh');
  expect(launched?.env).toEqual({});
  expect(launched?.argv).toEqual([
    'attestation',
    'verify',
    '@manifest',
    '--bundle',
    '@bundle',
    '--repo',
    'trusted/review',
    '--hostname',
    'github.com',
    '--cert-identity',
    invocation.policy.certIdentity,
    '--signer-digest',
    'd'.repeat(40),
    '--source-digest',
    'e'.repeat(40),
    '--source-ref',
    'refs/heads/main',
    '--cert-oidc-issuer',
    invocation.policy.issuer,
    '--predicate-type',
    invocation.policy.predicateType,
    '--custom-trusted-root',
    '/trusted/root.jsonl',
    '--deny-self-hosted-runners',
    '--no-public-good',
    '--format',
    'json',
  ]);
  expect(observation.untrustedCliOutput).toBeDefined();
});

test.each([
  ['wrong executable', { executableIdentity: 'f'.repeat(64) }],
  ['wrong version', { version: '2.99.0' }],
  ['wrong closure', { runtimeIdentity: 'f'.repeat(64) }],
  ['wrong root', { trustedRootIdentity: 'f'.repeat(64) }],
])('offline verifier refuses %s independently before launch', async (_, changed) => {
  const invocation = fixture();
  let launched = 0;
  await expectFailure(
    verifyOfflineReviewBundle({
      ...invocation,
      resolveRuntime: () =>
        Promise.resolve({
          executableIdentity: invocation.policy.executableIdentity,
          version: invocation.policy.version,
          runtimeIdentity: invocation.policy.runtimeIdentity,
          trustedRootIdentity: invocation.policy.trustedRootIdentity,
          ...changed,
        }),
      run: (process) => {
        launched += 1;
        return invocation.run(process);
      },
    }),
    'review verifier runtime differs from pin',
  );
  expect(launched).toBe(0);
});
