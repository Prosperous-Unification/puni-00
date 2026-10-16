import { createHash, randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';

import { withLock } from './lib/lock';
import { decodeSolverSupervisorConfig } from './lib/solver-supervisor-config';
import {
  SOLVER_SUPERVISOR_CONFIG,
  SOLVER_SUPERVISOR_SERVICE,
  SOLVER_SUPERVISOR_SOCKET,
} from './lib/solver-supervisor-install-contract';

const SOURCE_ROOT = '/home/puni1/wbs-dev/src';
const CALLER = 'wbs-dev-src';
const CLIENT = '/src/apps/wbs/be-01/scripts/solver-installed-client.ts';
const INSPECT =
  '{"id":{{json .Id}},"name":{{json .Name}},"running":{{json .State.Running}},"image":{{json .Config.Image}},"imageId":{{json .Image}},"pid":{{json .State.Pid}},"labels":{{json .Config.Labels}}}';
const CALLER_INSPECT =
  '{"id":{{json .Id}},"name":{{json .Name}},"running":{{json .State.Running}},"image":{{json .Config.Image}}}';
const COMPATIBILITY_PATHS = ['libs/wbs/adapters/solver-py', 'apps/wbs/be-01/Dockerfile'];

export interface InstalledSolverSession {
  next(timeoutMs: number): Promise<string>;
  send(decision: 'bound' | 'abort'): Promise<void>;
  finish(): Promise<void>;
  stop(): Promise<void>;
}
export interface InstalledSolverIo {
  withLock<T>(path: string, action: () => Promise<T>): Promise<T>;
  readConfig(): Promise<string>;
  requireSocket(path: string): Promise<void>;
  query(argv: readonly string[]): Promise<string>;
  openClient(
    scenario: 'baseline' | 'shared-person',
    token: string,
  ): Promise<InstalledSolverSession>;
  token(): string;
  sleep(ms: number): Promise<void>;
}

function requireEvidence(condition: boolean, reason: string): asserts condition {
  if (!condition) throw new Error(`installed solver acceptance: ${reason}`);
}
function recordOf(value: unknown): Record<string, unknown> {
  // Proof: config-null loses the required evidence-boundary diagnosis when this guard is omitted.
  requireEvidence(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'expected an evidence object',
  );
  // The object boundary above excludes arrays and null; fields remain unknown until checked.
  return value as Record<string, unknown>;
}
function decodeRecord(text: string): Record<string, unknown> {
  return recordOf(JSON.parse(text));
}
async function within<T>(action: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action,
      new Promise<never>((_resolve, reject) => {
        // Proof: the fake-Docker stall fault reaches this production timeout and is refused.
        timer = setTimeout(() => {
          reject(new Error('installed solver acceptance: timed out'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function readService(io: InstalledSolverIo) {
  const serviceText = await io.query([
    'systemctl',
    '--user',
    'show',
    SOLVER_SUPERVISOR_SERVICE,
    '--property=ActiveState,SubState,MainPID,InvocationID',
  ]);
  const service = new Map(
    serviceText
      .trim()
      .split('\n')
      .map((line) => {
        const equals = line.indexOf('=');
        return [line.slice(0, equals), line.slice(equals + 1)] as const;
      }),
  );
  const pid = service.get('MainPID');
  const invocationId = service.get('InvocationID');
  // Proof: inactive-service injection is accepted when this installed service guard is omitted.
  requireEvidence(
    service.get('ActiveState') === 'active' &&
      service.get('SubState') === 'running' &&
      typeof pid === 'string' &&
      /^[1-9][0-9]*$/.test(pid) &&
      typeof invocationId === 'string' &&
      /^[0-9a-f]{32}$/.test(invocationId),
    'installed supervisor service is not running',
  );
  return { name: SOLVER_SUPERVISOR_SERVICE, pid: Number(pid), invocationId };
}

/** Observes installed authority and two sequential attempts while excluding dev and production deploys. */
export async function checkInstalledSolver(
  options: { sourceSha: string; image: string },
  io: InstalledSolverIo = HOST_IO,
) {
  // Proof: nonexplicit-authority cases in check-installed-solver.test.ts refuse before locks or Docker.
  requireEvidence(/^[0-9a-f]{40}$/.test(options.sourceSha), 'expected a full source SHA');
  requireEvidence(
    /^(?:localhost(?::[0-9]+)?|[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z0-9]+(?:[.-][a-z0-9]+)*(?::[0-9]+)?|[a-z0-9]+(?:[.-][a-z0-9]+)*:[0-9]+)\/(?:[a-z0-9]+(?:[._-][a-z0-9]+)*\/)*[a-z0-9]+(?:[._-][a-z0-9]+)*@sha256:[0-9a-f]{64}$/.test(
      options.image,
    ),
    'expected a registry-qualified immutable solver reference',
  );
  // Proof: the happy-path query boundary requires all three locks; lock injection refuses all observation.
  return io.withLock('/home/puni1/wbs-dev/state/poll.lock', () =>
    io.withLock('/home/puni1/wbs-dev/state/devsync.lock', () =>
      io.withLock('/home/puni1/wbs/state/deploy.lock', async () => {
        const rawConfig = await io.readConfig();
        const config = decodeRecord(rawConfig);
        const runtime = decodeSolverSupervisorConfig(config);
        // The complete config decoder above validated this field as a full source SHA.
        const imageSourceSha = config['devSourceSha'] as string;
        const source = (await io.query(['git', '-C', SOURCE_ROOT, 'rev-parse', 'HEAD'])).trim();
        // Proof: source/dirty/mounted-source/health-source injections each refuse before any client bind.
        requireEvidence(source === options.sourceSha, 'current source differs from expected SHA');
        requireEvidence(
          (
            await io.query([
              'git',
              '-C',
              SOURCE_ROOT,
              'status',
              '--porcelain',
              '--untracked-files=no',
            ])
          ).trim() === '',
          'source has tracked changes',
        );
        requireEvidence(
          (
            await io.query([
              'git',
              '-C',
              SOURCE_ROOT,
              'diff',
              '--name-only',
              imageSourceSha,
              options.sourceSha,
              '--',
              ...COMPATIBILITY_PATHS,
            ])
          ).trim() === '',
          'installed image source is incompatible',
        );
        // Proof: mapping/local-image/compatibility-object faults and guard omissions are recorded in verify.md.
        const digest = createHash('sha256');
        for (const path of COMPATIBILITY_PATHS) {
          const objectId = (
            await io.query(['git', '-C', SOURCE_ROOT, 'rev-parse', `${options.sourceSha}:${path}`])
          ).trim();
          requireEvidence(
            /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(objectId),
            'invalid compatibility object id',
          );
          digest.update(`${path}\0${objectId}\n`);
        }
        const compatibilityIdentity = digest.digest('hex');
        const caller = decodeRecord(
          await io.query(['docker', 'inspect', '--format', CALLER_INSPECT, CALLER]),
        );
        requireEvidence(
          typeof caller['id'] === 'string' &&
            /^[0-9a-f]{64}$/.test(caller['id']) &&
            caller['name'] === '/wbs-dev-src' &&
            caller['running'] === true &&
            typeof caller['image'] === 'string',
          'dev caller identity is not running',
        );
        const callerId = caller['id'];
        // Config decoding enforces one exact name rule. Authentication during each attempt verifies the live peer.
        requireEvidence(
          runtime.imageFor({ id: callerId, name: CALLER, image: caller['image'] }) ===
            options.image,
          'installed dev image mapping differs',
        );
        requireEvidence(
          runtime.connection.unix === SOLVER_SUPERVISOR_SOCKET,
          'installed socket differs',
        );
        const image = decodeRecord(
          await io.query([
            'docker',
            'image',
            'inspect',
            '--format',
            '{"id":{{json .Id}},"digests":{{json .RepoDigests}}}',
            options.image,
          ]),
        );
        requireEvidence(
          typeof image['id'] === 'string' &&
            /^sha256:[0-9a-f]{64}$/.test(image['id']) &&
            Array.isArray(image['digests']) &&
            image['digests'].includes(options.image),
          'exact solver digest is not locally available',
        );
        const service = await readService(io);
        await io.requireSocket(runtime.connection.unix);
        requireEvidence(
          (
            await io.query(['docker', 'exec', callerId, 'git', '-C', '/src', 'rev-parse', 'HEAD'])
          ).trim() === options.sourceSha,
          'mounted dev source differs',
        );
        const health = decodeRecord(
          await io.query([
            'docker',
            'exec',
            callerId,
            'bun',
            '-e',
            'const response = await fetch("http://127.0.0.1:3100/health", {signal: AbortSignal.timeout(5000)}); if (!response.ok) throw new Error("backend health HTTP failure"); console.log(JSON.stringify(await response.json()));',
          ]),
        );
        requireEvidence(
          health['status'] === 'ok' && health['commit'] === options.sourceSha,
          'backend health does not prove expected source',
        );
        const attempts: {
          scenario: string;
          attemptToken: string;
          pid: number;
          childId: string;
          status: 'feasible';
          removed: true;
        }[] = [];
        for (const scenario of ['baseline', 'shared-person'] as const) {
          const token = io.token();
          // Proof: invalid/reused token injections must refuse before creating another attempt.
          requireEvidence(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(token) &&
              !attempts.some((attempt) => attempt.attemptToken === token),
            'invalid or reused attempt token',
          );
          const session = await io.openClient(scenario, token);
          try {
            const started = decodeRecord(await session.next(180_000));
            requireEvidence(
              started['type'] === 'started' &&
                started['scenario'] === scenario &&
                started['attemptToken'] === token &&
                started['callerId'] === callerId.slice(0, 12) &&
                typeof started['pid'] === 'number' &&
                Number.isSafeInteger(started['pid']) &&
                started['pid'] > 0,
              'client started identity differs',
            );
            const pid = started['pid'];
            // Complete this inspection below the installed supervisor's five-second bind timeout.
            const child = decodeRecord(
              await within(
                io.query(['docker', 'inspect', '--format', INSPECT, `wbs-solver-${token}`]),
                3_000,
              ),
            );
            const labels = recordOf(child['labels']);
            // Proof: independent child-ref/image/PID/label/token/caller injections refuse before bound.
            requireEvidence(
              typeof child['id'] === 'string' &&
                /^[0-9a-f]{64}$/.test(child['id']) &&
                child['name'] === `/wbs-solver-${token}` &&
                child['running'] === true &&
                child['image'] === options.image &&
                child['imageId'] === image['id'] &&
                child['pid'] === pid &&
                labels['wbs-managed-solver'] === 'true' &&
                labels['wbs-attempt-token'] === token &&
                labels['wbs-caller-id'] === callerId,
              'managed child identity differs',
            );
            await session.send('bound');
            const accepted = decodeRecord(await session.next(180_000));
            requireEvidence(
              accepted['type'] === 'accepted' &&
                accepted['scenario'] === scenario &&
                accepted['attemptToken'] === token &&
                accepted['pid'] === pid &&
                accepted['status'] === 'feasible',
              'client did not accept exact feasible attempt',
            );
            await session.finish();
            attempts.push({
              scenario,
              attemptToken: token,
              pid,
              childId: child['id'],
              status: 'feasible',
              removed: true,
            });
          } finally {
            try {
              await session.stop();
            } finally {
              // Docker ps exit success plus an empty exact-label inventory proves removal; daemon errors throw.
              let removed = false;
              for (let probe = 0; probe < 40; probe++) {
                const surviving = await io.query([
                  'docker',
                  'ps',
                  '--all',
                  '--no-trunc',
                  '--filter',
                  `label=wbs-attempt-token=${token}`,
                  '--format',
                  '{{.ID}}',
                ]);
                if (surviving.trim() === '') {
                  removed = true;
                  break;
                }
                await io.sleep(50);
              }
              // Proof: cleanup injection retains the invocation token through every bounded readback and refuses.
              requireEvidence(removed, `invocation-owned child survived: ${token}`);
            }
          }
        }
        const observedService = await readService(io);
        // Proof: service-restart injects a new PID/InvocationID after both attempts and refuses the receipt.
        requireEvidence(
          observedService.pid === service.pid &&
            observedService.invocationId === service.invocationId,
          'supervisor invocation changed during acceptance',
        );
        return {
          kind: 'installed-dev-supervisor',
          sourceSha: options.sourceSha,
          imageSourceSha,
          compatibilityIdentity,
          solverImage: options.image,
          imageId: image['id'],
          service,
          socket: runtime.connection.unix,
          caller: { id: callerId, name: CALLER, image: caller['image'] },
          attempts,
        };
      }),
    ),
  );
}

/** Requires a successful, bounded observation from a required host tool; spawn and permission errors propagate. */
export async function queryInstalledSolverHost(argv: readonly string[]): Promise<string> {
  const child = Bun.spawn([...argv], { stdout: 'pipe', stderr: 'pipe', timeout: 10_000 });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  // Proof: production subprocess fault tests fail with independent exit-status/output-limit guard omissions.
  requireEvidence(exitCode === 0, `${argv[0]} failed (${String(exitCode)}): ${stderr.trim()}`);
  requireEvidence(stdout.length <= 256 * 1024, 'command output exceeded limit');
  return stdout;
}

/** Runs the client inside the existing authenticated caller, with a private stdin verdict channel. */
export function openInstalledSolverClient(
  scenario: 'baseline' | 'shared-person',
  token: string,
): InstalledSolverSession {
  const child = Bun.spawn(
    [
      'docker',
      'exec',
      '--interactive',
      CALLER,
      'bun',
      CLIENT,
      '/run/wbs-solver/supervisor.sock',
      scenario,
      token,
    ],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', timeout: 190_000 },
  );
  const reader = child.stdout.getReader();
  const stderr = new Response(child.stderr).text();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  const nextLine = async (): Promise<string> => {
    while (!buffer.includes('\n')) {
      const chunk = await reader.read();
      // Proof: fake-Docker EOF and oversize subprocess faults refuse without issuing a receipt.
      requireEvidence(!chunk.done, 'client EOF before receipt');
      buffer += decoder.decode(chunk.value, { stream: true });
      requireEvidence(buffer.length <= 16_384, 'client frame exceeded limit');
    }
    const newline = buffer.indexOf('\n');
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    return line;
  };
  return {
    next: (timeoutMs) => within(nextLine(), timeoutMs),
    send: async (decision) => {
      await child.stdin.write(`${decision}\n`);
    },
    finish: async () => {
      const exitCode = await within(child.exited, 5_000);
      // Proof: production subprocess fault tests fail with independent exit-status/output-limit guard omissions.
      requireEvidence(exitCode === 0, `client failed (${String(exitCode)}): ${await stderr}`);
      // Proof: trailing and nonzero-exit fake-Docker subprocess faults and independent omissions fail acceptance.
      requireEvidence(
        buffer === '' && (await reader.read()).done,
        'client emitted trailing evidence',
      );
    },
    stop: async () => {
      await child.stdin.end();
      if (child.exitCode === null) child.kill('SIGKILL');
      await child.exited;
      await stderr;
      await reader.cancel();
      reader.releaseLock();
    },
  };
}

/** Requires a readable installed socket inode; absence and permission failures retain their native errors. */
export async function requireInstalledSolverSocket(path: string): Promise<void> {
  // Proof: a regular-file socket replacement is rejected by the production filesystem boundary test.
  requireEvidence((await stat(path)).isSocket(), 'installed socket is not a socket');
}

const HOST_IO: InstalledSolverIo = {
  withLock,
  readConfig: () => Bun.file(SOLVER_SUPERVISOR_CONFIG).text(),
  requireSocket: requireInstalledSolverSocket,
  query: queryInstalledSolverHost,
  openClient: (scenario, token) => Promise.resolve(openInstalledSolverClient(scenario, token)),
  token: randomUUID,
  sleep: Bun.sleep,
};

if (import.meta.main) {
  const sourceArg = process.argv.at(2);
  const imageArg = process.argv.at(3);
  const extra = process.argv.slice(4);
  requireEvidence(
    sourceArg !== undefined &&
      sourceArg.startsWith('--source-sha=') &&
      imageArg !== undefined &&
      imageArg.startsWith('--image=') &&
      extra.length === 0,
    'expected --source-sha=<full SHA> --image=<registry/repository@sha256:digest>',
  );
  console.log(
    JSON.stringify(
      await checkInstalledSolver({
        sourceSha: sourceArg.slice('--source-sha='.length),
        image: imageArg.slice('--image='.length),
      }),
    ),
  );
}
