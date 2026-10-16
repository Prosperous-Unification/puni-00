import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';

import { expect, it } from 'bun:test';

import {
  checkInstalledSolver,
  type InstalledSolverIo,
  type InstalledSolverSession,
} from './check-installed-solver';

const SHA = 'a'.repeat(40);
const SOURCE = 'b'.repeat(40);
const IMAGE = `registry.example/backend@sha256:${'c'.repeat(64)}`;
const IMAGE_ID = `sha256:${'d'.repeat(64)}`;
const CALLER = 'e'.repeat(64);
const TOKEN = '11111111-1111-4111-8111-111111111111';
const config = {
  socketPath: '/run/user/1000/wbs-solver/supervisor.sock',
  maxSearchWorkers: 2,
  maxMemoryLimitMb: 512,
  pidsLimit: 128,
  maxManagedContainers: 2,
  devSourceSha: SOURCE,
  images: [{ callerName: 'wbs-dev-src', callerImage: null, solverImage: IMAGE }],
};

function fixture(fault = '') {
  const events: string[] = [];
  let locked = 0;
  let scenarioCount = 0;
  let tokenCount = 0;
  let cleanupReads = 0;
  const io: InstalledSolverIo = {
    withLock: async (path, action) => {
      if (fault === 'lock' || (fault === 'devsync-lock' && path.endsWith('/devsync.lock')))
        throw new Error('held lock');
      events.push(`lock:${path}`);
      locked++;
      try {
        return await action();
      } finally {
        locked--;
        events.push(`unlock:${path}`);
      }
    },
    readConfig: async () => {
      await Promise.resolve();
      if (fault === 'config-missing' || fault === 'config-unreadable') throw new Error(fault);
      if (fault === 'config-null') return 'null';
      return fault === 'config-malformed'
        ? '{}'
        : JSON.stringify({
            ...config,
            ...(fault === 'config-socket'
              ? { socketPath: '/run/user/1001/wbs-solver/supervisor.sock' }
              : {}),
            ...(fault === 'mapping'
              ? {
                  images: [
                    {
                      callerName: 'wbs-dev-src',
                      callerImage: null,
                      solverImage: `registry.example/other@sha256:${'a'.repeat(64)}`,
                    },
                  ],
                }
              : {}),
          });
    },
    requireSocket: async () => {
      await Promise.resolve();
      if (fault === 'socket') throw new Error('socket missing');
    },
    token: () => {
      tokenCount++;
      if (fault === 'token-invalid') return 'invalid';
      if (fault === 'token-reused') return TOKEN;
      return tokenCount === 1 ? TOKEN : '22222222-2222-4222-8222-222222222222';
    },
    sleep: () => Promise.resolve(),
    query: async (argv) => {
      await Promise.resolve();
      expect(locked).toBe(3);
      const command = argv.join(' ');
      events.push(command);
      if (fault === 'daemon' && argv[0] === 'docker') throw new Error('daemon unavailable');
      if (argv[0] === 'git') {
        if (argv.includes('diff'))
          return fault === 'compatibility' ? 'libs/wbs/adapters/solver-py/model.py\n' : '';
        if (argv.includes('status')) return fault === 'dirty' ? ' M tracked.ts' : '';
        if (argv.at(-1) === 'HEAD') return fault === 'source' ? SOURCE : SHA;
        return fault === 'object-id' ? 'broken' : 'f'.repeat(40);
      }
      if (argv[0] === 'systemctl')
        return `ActiveState=${fault === 'service' ? 'inactive' : 'active'}\nSubState=running\nMainPID=${fault === 'service-restart' && scenarioCount === 2 ? '456' : '123'}\nInvocationID=${fault === 'service-restart' && scenarioCount === 2 ? 'b'.repeat(32) : 'a'.repeat(32)}\n`;
      if (argv.includes('image'))
        return JSON.stringify({ id: IMAGE_ID, digests: fault === 'image' ? [] : [IMAGE] });
      if (argv.includes('ps')) {
        cleanupReads++;
        return fault === 'cleanup' ? 'f'.repeat(64) : '';
      }
      if (argv.includes('inspect') && argv.at(-1) === 'wbs-dev-src')
        return JSON.stringify({
          id: CALLER,
          name: '/wbs-dev-src',
          running: fault !== 'caller',
          image: 'wbs-dev-src:1',
        });
      if (argv.includes('inspect'))
        return JSON.stringify({
          id: fault === 'child-id' ? 'short' : 'f'.repeat(64),
          name: fault === 'child-name' ? '/foreign-child' : `/${String(argv.at(-1))}`,
          running: fault !== 'child-stopped',
          image: fault === 'child-ref' ? 'other@sha256:' + '1'.repeat(64) : IMAGE,
          imageId: fault === 'child-image' ? 'sha256:' + '1'.repeat(64) : IMAGE_ID,
          pid: fault === 'child-pid' ? 999 : 321,
          labels: {
            'wbs-managed-solver': fault === 'child-label' ? 'false' : 'true',
            'wbs-attempt-token':
              fault === 'child-token' ? 'foreign-token' : argv.at(-1)?.replace('wbs-solver-', ''),
            'wbs-caller-id': fault === 'child-caller' ? CALLER.slice(0, 12) : CALLER,
          },
        });
      if (argv.includes('exec') && argv.includes('rev-parse'))
        return fault === 'mounted-source' ? SOURCE : SHA;
      if (argv.includes('exec') && command.includes('fetch('))
        return JSON.stringify({
          status: fault === 'health' ? 'error' : 'ok',
          commit: fault === 'health-source' ? SOURCE : SHA,
        });
      throw new Error(`unexpected query ${command}`);
    },
    openClient: async (scenario, token) => {
      await Promise.resolve();
      expect(locked).toBe(3);
      scenarioCount++;
      events.push(`open:${scenario}`);
      let reads = 0;
      const session: InstalledSolverSession = {
        next: async () => {
          await Promise.resolve();
          reads++;
          if (reads === 1)
            return JSON.stringify({
              type: 'started',
              scenario,
              attemptToken: token,
              callerId: fault === 'started-caller' ? '9'.repeat(12) : CALLER.slice(0, 12),
              pid: fault === 'started-pid' ? 0 : 321,
            });
          return JSON.stringify({
            type: 'accepted',
            scenario,
            attemptToken: fault === 'receipt-token' ? 'wrong' : token,
            pid: 321,
            status: fault === 'answer' ? 'unknown' : 'feasible',
          });
        },
        send: async (decision) => {
          await Promise.resolve();
          events.push(decision);
        },
        finish: async () => {
          await Promise.resolve();
          if (fault === 'client-exit') throw new Error('client failed');
        },
        stop: async () => {
          await Promise.resolve();
          events.push('stop');
        },
      };
      return session;
    },
  };
  return { io, events, count: () => scenarioCount, cleanupReads: () => cleanupReads };
}
it('observes both installed attempts under both canonical locks and distinguishes compatible source from backend SHA', async () => {
  const host = fixture();
  const receipt = await checkInstalledSolver({ sourceSha: SHA, image: IMAGE }, host.io);
  expect(receipt.sourceSha).toBe(SHA);
  expect(receipt.imageSourceSha).toBe(SOURCE);
  expect(receipt.attempts.map((attempt) => attempt.scenario)).toEqual([
    'baseline',
    'shared-person',
  ]);
  expect(host.events.filter((event) => event === 'bound')).toHaveLength(2);
  expect(host.events.slice(0, 3)).toEqual([
    'lock:/home/puni1/wbs-dev/state/poll.lock',
    'lock:/home/puni1/wbs-dev/state/devsync.lock',
    'lock:/home/puni1/wbs/state/deploy.lock',
  ]);
  expect(host.cleanupReads()).toBe(2);
  const inspection = host.events.findIndex(
    (event) => event.includes(`inspect --format`) && event.endsWith(`wbs-solver-${TOKEN}`),
  );
  expect(inspection).toBeGreaterThan(0);
  expect(host.events.indexOf('bound')).toBeGreaterThan(inspection);
});
it.each([
  'lock',
  'devsync-lock',
  'config-missing',
  'config-unreadable',
  'config-malformed',
  'config-socket',
  'mapping',
  'object-id',
  'socket',
  'source',
  'dirty',
  'compatibility',
  'service',
  'service-restart',
  'image',
  'daemon',
  'caller',
  'mounted-source',
  'health',
  'health-source',
  'token-invalid',
  'token-reused',
  'started-pid',
  'started-caller',
  'child-id',
  'child-name',
  'child-stopped',
  'child-ref',
  'child-image',
  'child-pid',
  'child-label',
  'child-token',
  'child-caller',
  'receipt-token',
  'answer',
  'client-exit',
  'cleanup',
])('refuses installed acceptance for %s', async (fault) => {
  const host = fixture(fault);
  await expectRefusal(checkInstalledSolver({ sourceSha: SHA, image: IMAGE }, host.io));
});
it.each([
  { sourceSha: 'main', image: IMAGE },
  { sourceSha: SHA, image: 'backend:latest' },
  { sourceSha: SHA, image: `registry:abc/backend@sha256:${'a'.repeat(64)}` },
  { sourceSha: SHA, image: `registry.example/team//backend@sha256:${'a'.repeat(64)}` },
  { sourceSha: SHA, image: `library/backend@sha256:${'a'.repeat(64)}` },
])('refuses nonexplicit authority before observation %j', async (options) => {
  const host = fixture();
  await expectRefusal(checkInstalledSolver(options, host.io));
  expect(host.events).toEqual([]);
});

async function expectRefusal(action: Promise<unknown>, message = ''): Promise<void> {
  let failure: unknown;
  try {
    await action;
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  if (failure instanceof Error) expect(failure.message).toContain(message);
}

it('refuses failed or absent required host tools through the production subprocess boundary', async () => {
  const { queryInstalledSolverHost } = await import('./check-installed-solver');
  expect(await queryInstalledSolverHost([process.execPath, '-e', 'console.log("observed")'])).toBe(
    'observed\n',
  );
  await expectRefusal(
    queryInstalledSolverHost([
      process.execPath,
      '-e',
      'console.error("permission denied"); process.exit(7)',
    ]),
    'permission denied',
  );
  await expectRefusal(queryInstalledSolverHost(['/definitely-absent-installed-solver-tool']));
  await expectRefusal(
    queryInstalledSolverHost([process.execPath, '-e', 'console.log("x".repeat(256 * 1024 + 1))']),
    'exceeded limit',
  );
});

it('refuses incomplete explicit host CLI arguments before touching installed state', async () => {
  const child = Bun.spawn(
    [process.execPath, `${import.meta.dir}/check-installed-solver.ts`, '--source-sha=main'],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(await child.exited).not.toBe(0);
  expect(await new Response(child.stderr).text()).toContain('expected --source-sha=');
});

async function withFakeDocker(
  fault: string,
  action: (executablePath: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp('/tmp/installed-solver-docker-');
  const oldPath = process.env['PATH'];
  const executable = `${directory}/docker`;
  await writeFile(
    executable,
    `#!/bin/bash
set -eu
[ "$1 $2 $3 $4 $5" = 'exec --interactive wbs-dev-src bun /src/apps/wbs/be-01/scripts/solver-installed-client.ts' ]
${fault === 'eof' ? 'exit 0' : ''}
${fault === 'oversize' ? 'head -c 20000 /dev/zero | tr "\\0" x; exit 0' : ''}
printf '%s\\n' '{"type":"started"}'
IFS= read -r decision
[ "$decision" = bound ]
${fault === 'stall' ? 'IFS= read -r ignored' : ''}
printf '%s\\n' '{"type":"accepted"}'
${fault === 'trailing' ? "printf '%s\\n' 'unexpected'" : ''}
${fault === 'exit' ? "echo 'client fault' >&2; exit 7" : 'exit 0'}
`,
  );
  await chmod(executable, 0o755);
  try {
    await action(`${directory}:${oldPath ?? ''}`);
  } finally {
    await rm(directory, { recursive: true });
  }
}

async function runClientBoundary(
  executablePath: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const script = `import { openInstalledSolverClient } from ${JSON.stringify(`${import.meta.dir}/check-installed-solver.ts`)};
const session = openInstalledSolverClient('baseline', '${TOKEN}');
try {
  await session.next(1000); await session.send('bound'); await session.next(1000); await session.finish();
  console.log('accepted');
} finally { await session.stop(); }`;
  const child = Bun.spawn([process.execPath, '-e', script], {
    env: { ...process.env, PATH: executablePath },
    timeout: 4_000,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}
it('uses the existing caller and private verdict stdin through the production Docker exec boundary', async () => {
  await withFakeDocker('', async (executablePath) => {
    const accepted = await runClientBoundary(executablePath);
    expect(accepted.stderr).toBe('');
    expect(accepted.exitCode).toBe(0);
    expect(accepted.stdout).toBe('accepted\n');
  });
});
it.each(['eof', 'oversize', 'trailing', 'exit', 'stall'])(
  'refuses the production client process fault %s',
  async (fault) => {
    await withFakeDocker(fault, async (executablePath) => {
      const refused = await runClientBoundary(executablePath);
      expect(refused.exitCode).not.toBe(0);
      expect(refused.stdout).toBe('');
      const diagnoses: Record<string, string> = {
        eof: 'client EOF before receipt',
        oversize: 'client frame exceeded limit',
        trailing: 'client emitted trailing evidence',
        exit: 'client failed (7): client fault',
        stall: 'timed out',
      };
      expect(refused.stderr).toContain(diagnoses[fault]);
    });
  },
);

it('names a malformed root at the installed evidence boundary', async () => {
  const host = fixture('config-null');
  await expectRefusal(
    checkInstalledSolver({ sourceSha: SHA, image: IMAGE }, host.io),
    'expected an evidence object',
  );
});

it('distinguishes absent, non-socket and unreadable installed socket paths at the filesystem boundary', async () => {
  const { requireInstalledSolverSocket } = await import('./check-installed-solver');
  const directory = await mkdtemp('/tmp/installed-solver-socket-');
  const socketPath = `${directory}/supervisor.sock`;
  await expectRefusal(requireInstalledSolverSocket(socketPath), 'ENOENT');
  await writeFile(socketPath, 'not a socket');
  await expectRefusal(requireInstalledSolverSocket(socketPath), 'not a socket');
  await rm(socketPath);
  const listener = Bun.listen({
    unix: socketPath,
    socket: {
      data: (socket) => {
        socket.end();
      },
    },
  });
  try {
    await requireInstalledSolverSocket(socketPath);
    await chmod(directory, 0o000);
    await expectRefusal(requireInstalledSolverSocket(socketPath), 'EACCES');
  } finally {
    await chmod(directory, 0o700);
    listener.stop(true);
    await rm(directory, { recursive: true });
  }
});
