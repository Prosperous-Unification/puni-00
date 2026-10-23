import { createHash, randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { isRetainedEdgeOwnerRefusal } from '../src/lib/edge-admission';
import { withDependencyOwner } from '../src/lib/edge-ownership';
import { initializeOrdinaryEdgePolicy } from '../src/lib/edge-policy';
import { envLayout } from '../src/lib/env';
import { parseSolverContainer, solverInspectArgs } from '../src/lib/solver-cohort';
import { withSolverDrainUnderOwner } from '../src/lib/solver-exclusion';
import {
  captureSolverFile,
  observeSolverCgroup,
  observeSolverProcess,
  type SolverPorts,
} from '../src/lib/solver-host';
import { withSolverPolicyAdmission } from '../src/lib/solver-runtime-admission';
import { parseManagedContainerList } from '../src/lib/solver-supervisor-docker-output';
import {
  SOLVER_SUPERVISOR_BUN,
  SOLVER_SUPERVISOR_BUNDLE,
  SOLVER_SUPERVISOR_CONFIG,
  SOLVER_SUPERVISOR_SERVICE,
  SOLVER_SUPERVISOR_UNIT,
} from '../src/lib/solver-supervisor-install-contract';
import { observeSolverUnit } from '../src/lib/solver-unit-observation';
import {
  assertFixtureContainer,
  assertFixtureStoppedUnit,
  assertFixtureUnitAuthority,
  boundedCommand,
  removeFixtureContainer,
  runFixtureDockerCommand,
  runFixtureEffect,
  scopeDiscovery,
  translateExecution,
} from './solver-drain-transport';

const OWNER = 'wbs-solver-drain-owner';
function requireProof(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

/** Explicit host acceptance only; never pulled/built images, installed service or broad census. */
export async function runSolverDrainAcceptance(): Promise<void> {
  const sha = process.env['SOLVER_DRAIN_SHA'];
  const image = process.env['SOLVER_DRAIN_IMAGE'];
  const receipt = process.env['SOLVER_DRAIN_RECEIPT'];
  requireProof(typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha), 'exact source SHA required');
  requireProof(
    typeof image === 'string' && /^[^\s@]+@sha256:[a-f0-9]{64}$/.test(image),
    'already-installed digest-pinned fixture image required',
  );
  requireProof(
    typeof receipt === 'string' && isAbsolute(receipt) && resolve(receipt) === receipt,
    'canonical absolute external receipt required',
  );
  const deadline = performance.now() + 120000;
  const cancellation = new AbortController();
  const cancel = () => {
    cancellation.abort(new Error('acceptance cancelled'));
  };
  let cleaning = false;
  const command = (argv: string[], signal?: AbortSignal) =>
    boundedCommand(
      argv,
      Math.min(15000, deadline - performance.now()),
      signal === undefined ? cancellation.signal : AbortSignal.any([signal, cancellation.signal]),
    );
  requireProof(
    (await command(['git', 'rev-parse', 'HEAD'])).trim() === sha,
    'source SHA differs from HEAD',
  );
  requireProof(
    (
      await command([
        'git',
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
        '--',
        'tools/tool-remote-scripts',
        'tools/test',
        'package.json',
        'bun.lock',
        'tsconfig.base.json',
      ])
    ).trim() === '',
    'relevant source must be committed and clean',
  );
  for (const executable of ['docker', 'systemctl', 'busctl', '/bin/sleep', '/bin/rm'])
    requireProof(Bun.which(executable) !== null, `required tool unavailable: ${executable}`);
  const imageId = (
    await command(['docker', 'image', 'inspect', '--format', '{{.Id}}', image])
  ).trim();
  requireProof(/^sha256:[a-f0-9]{64}$/.test(imageId), 'installed image resolution malformed');
  const token = randomUUID();
  const root = await realpath(await mkdtemp(join(tmpdir(), `wbs-solver-drain-${token}-`)));
  await chmod(root, 0o700);
  requireProof(!receipt.startsWith(`${root}/`), 'receipt must be external');
  requireProof(
    (await realpath(dirname(receipt))) === dirname(receipt),
    'receipt parent must be canonical',
  );
  const receiptFile = await import('node:fs/promises').then((fs) => fs.open(receipt, 'wx', 0o600));
  const service = `wbs-solver-drain-acceptance-${token}.service`;
  const physicalBun = join(root, 'bun');
  const bundle = join(root, 'fixture.js');
  const config = join(root, 'solver.json');
  const unit = join(root, service);
  const link = join(
    process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'),
    'systemd',
    'user',
    service,
  );
  const socket = join(root, 'fixture.sock');
  const edgeState = join(root, 'edge');
  const prodRoot = join(root, 'prod');
  const devRoot = join(root, 'dev');
  for (const directory of [edgeState, prodRoot, devRoot]) await mkdir(directory, { mode: 0o700 });
  const layouts = {
    prod: { ...envLayout('prod'), root: prodRoot, stateDir: prodRoot },
    dev: { ...envLayout('dev'), root: devRoot, stateDir: devRoot },
  };
  const attempts = [randomUUID(), randomUUID(), randomUUID()].map((attempt) => ({
    token: attempt,
    name: `wbs-solver-${attempt}`,
    id: '',
  }));
  const running = attempts[0];
  const inert = attempts[1];
  const duringStop = attempts[2];
  const create = (attempt: typeof running) => [
    'docker',
    'create',
    '--pull=never',
    '--name',
    attempt.name,
    '--restart=no',
    '--network=none',
    '--label',
    `${OWNER}=${token}`,
    '--label',
    'wbs-managed-solver=true',
    '--label',
    `wbs-attempt-token=${attempt.token}`,
    '--label',
    `wbs-caller-id=${imageId.slice(7)}`,
    '--label',
    `wbs-project-id=${token}`,
    '--label',
    'wbs-objective=pri',
    '--entrypoint',
    '/bin/sleep',
    image,
    '300',
  ];
  const observations: unknown[] = [];
  let unitIntended = false;
  let failure: unknown;
  const cleanupFailures: string[] = [];
  const describe = (cause: unknown) =>
    cause instanceof Error ? `${cause.name}: ${cause.message}` : JSON.stringify(cause);
  async function record(label: string, proof: unknown): Promise<void> {
    observations.push({ label, proof });
    await receiptFile.truncate(0);
    await receiptFile.write(
      JSON.stringify(
        {
          version: 1,
          sha,
          token,
          root,
          service,
          image,
          imageId,
          attempts,
          observations,
          failure: failure === undefined ? null : describe(failure),
          cleanupFailures,
        },
        null,
        2,
      ),
      0,
      'utf8',
    );
    await receiptFile.sync();
  }
  let cleanupDeadline = 0;
  const execute = (argv: string[], signal?: AbortSignal) =>
    cleaning
      ? boundedCommand(argv, Math.min(10000, cleanupDeadline - performance.now()), signal)
      : command(argv, signal);
  async function ownContainer(id: string): Promise<void> {
    requireProof(
      /^[a-f0-9]{64}$/.test(id) && attempts.some((attempt) => attempt.id === id),
      'ID outside fixture inventory',
    );
    const projected: unknown = JSON.parse(
      await execute([
        'docker',
        'inspect',
        '--format',
        `{"id":{{json .Id}},"name":{{json .Name}},"owner":{{json (index .Config.Labels "${OWNER}")}}}`,
        id,
      ]),
    );
    assertFixtureContainer(projected, id, token, attempts);
  }
  async function recoverInventory(): Promise<void> {
    const ids = parseManagedContainerList(
      await execute([
        'docker',
        'ps',
        '--all',
        '--no-trunc',
        '--filter',
        `label=${OWNER}=${token}`,
        '--format',
        '{{.ID}}',
      ]),
    );
    for (const id of ids) {
      const projected: unknown = JSON.parse(
        await execute([
          'docker',
          'inspect',
          '--format',
          `{"id":{{json .Id}},"name":{{json .Name}},"owner":{{json (index .Config.Labels "${OWNER}")}}}`,
          id,
        ]),
      );
      requireProof(
        typeof projected === 'object' &&
          projected !== null &&
          'id' in projected &&
          projected.id === id &&
          'owner' in projected &&
          projected.owner === token &&
          'name' in projected,
        'recovery ownership differs',
      );
      const attempt = attempts.find((candidate) => `/${candidate.name}` === projected.name);
      requireProof(
        attempt !== undefined && (attempt.id === '' || attempt.id === id),
        'unplanned fixture child',
      );
      attempt.id = id;
    }
    await record('inventory', ids);
  }
  const physical = [physicalBun, bundle, config, unit];
  const logical = [
    SOLVER_SUPERVISOR_BUN,
    SOLVER_SUPERVISOR_BUNDLE.remote,
    SOLVER_SUPERVISOR_CONFIG,
    SOLVER_SUPERVISOR_UNIT,
  ];
  const tuple: Awaited<ReturnType<typeof captureSolverFile>>[] = [];
  async function assertUnitFile(): Promise<void> {
    for (const [index, path] of physical.entries()) {
      const captured = await captureSolverFile(path, 128 * 1024 * 1024);
      requireProof(
        JSON.stringify(captured) === JSON.stringify(tuple.at(index)),
        'fixture tuple identity changed',
      );
    }
    const observed = await captureSolverFile(unit, 65536);
    requireProof(
      JSON.stringify(observed) === JSON.stringify(tuple[3]),
      'fixture unit identity changed',
    );
    requireProof(
      (await lstat(link)).isSymbolicLink() && (await realpath(link)) === unit,
      'fixture unit link identity differs',
    );
  }
  let physicalGroup = '';
  let logicalGroup = '';
  async function show(signal?: AbortSignal): Promise<string> {
    await assertUnitFile();
    const output = await observeSolverUnit(service, execute, signal);
    const fields = new Map<string, string>();
    for (const line of output.trimEnd().split('\n')) {
      const equals = line.indexOf('=');
      requireProof(equals > 0 && !fields.has(line.slice(0, equals)), 'duplicate fixture property');
      fields.set(line.slice(0, equals), line.slice(equals + 1));
    }
    assertFixtureUnitAuthority(fields, { service, unit, link, edgeState });
    const fragment = fields.get('FragmentPath');
    requireProof(
      (fragment === unit || fragment === link) && (await realpath(fragment)) === unit,
      'fixture FragmentPath differs',
    );
    fields.set('Id', SOLVER_SUPERVISOR_SERVICE);
    fields.set('Names', SOLVER_SUPERVISOR_SERVICE);
    fields.set('FragmentPath', SOLVER_SUPERVISOR_UNIT);
    fields.set(
      'ExecStart',
      translateExecution(
        fields.get('ExecStart') ?? '',
        physicalBun,
        `${physicalBun} ${bundle} --config=${config} --admission=policy`,
        SOLVER_SUPERVISOR_BUN,
        `${SOLVER_SUPERVISOR_BUN} ${SOLVER_SUPERVISOR_BUNDLE.remote} --config=${SOLVER_SUPERVISOR_CONFIG} --admission=policy`,
      ),
    );
    fields.set(
      'ExecStopPost',
      translateExecution(
        fields.get('ExecStopPost') ?? '',
        '/bin/rm',
        `/bin/rm -f ${socket}`,
        '/bin/rm',
        '/bin/rm -f /run/user/1000/wbs-solver/supervisor.sock',
      ),
    );
    const group = fields.get('ControlGroup');
    requireProof(typeof group === 'string', 'fixture cgroup missing');
    if (group !== '') {
      requireProof(
        group.startsWith('/user.slice/') && group.endsWith(`/${service}`),
        'fixture cgroup identity differs',
      );
      if (physicalGroup === '') {
        physicalGroup = group;
        logicalGroup = group.slice(0, -service.length) + SOLVER_SUPERVISOR_SERVICE;
      }
      requireProof(group === physicalGroup, 'fixture cgroup changed');
      fields.set('ControlGroup', logicalGroup);
    }
    const translated = [...fields].map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
    return translated;
  }
  const unitEffect = (action: 'start' | 'stop', signal?: AbortSignal) =>
    runFixtureEffect(
      ['systemctl', '--user', action, service],
      service,
      async () => {
        await show(signal);
      },
      (argv) => execute(argv, signal),
    );
  process.on('SIGTERM', cancel);
  process.on('SIGINT', cancel);
  try {
    await record('intent', { unit, link, edgeState, create: attempts.map(create) });
    const bunBytes = await readFile(await realpath(process.execPath));
    const built = await Bun.build({
      entrypoints: [join(import.meta.dir, 'solver-drain-fixture.ts')],
      target: 'bun',
      minify: false,
    });
    requireProof(built.success && built.outputs.length === 1, 'fixture bundle failed');
    const artifact = built.outputs.at(0);
    requireProof(artifact !== undefined, 'fixture bundle absent');
    const bundleBytes = new Uint8Array(await artifact.arrayBuffer());
    const configBytes = JSON.stringify({
      socketPath: '/run/user/1000/wbs-solver/supervisor.sock',
      maxSearchWorkers: 2,
      maxMemoryLimitMb: 512,
      pidsLimit: 128,
      maxManagedContainers: 16,
      devSourceSha: sha,
      images: [{ callerName: 'be-01-blue', callerImage: image, solverImage: image }],
    });
    const unitBytes = `[Unit]\nDescription=Disposable solver drain ${token}\n[Service]\nType=simple\nExecStart=${physicalBun} ${bundle} --config=${config} --admission=policy\nExecStopPost=/bin/rm -f ${socket}\nEnvironment=WBS_EDGE_STATE=${edgeState}\nRestart=always\nRestartPreventExitStatus=78\nKillMode=control-group\nTimeoutStopSec=15\n`;
    // Independent expected byte hashes precede every installed fixture copy.
    const pins = {
      version: 1 as const,
      sourceSha: sha,
      bunSha256: digest(bunBytes),
      bundleSha256: digest(bundleBytes),
      configSha256: digest(configBytes),
      unitSha256: digest(unitBytes),
    };
    await initializeOrdinaryEdgePolicy(edgeState);
    await writeFile(physicalBun, bunBytes, { mode: 0o755, flag: 'wx' });
    await writeFile(bundle, bundleBytes, { mode: 0o755, flag: 'wx' });
    await writeFile(config, configBytes, { mode: 0o600, flag: 'wx' });
    await writeFile(unit, unitBytes, { mode: 0o644, flag: 'wx' });
    for (const [index, path] of physical.entries()) {
      await chmod(path, [0o755, 0o755, 0o600, 0o644][index]);
      tuple.push(await captureSolverFile(path, 128 * 1024 * 1024));
    }
    await writeFile(
      join(root, 'manifest.json'),
      JSON.stringify({
        token,
        createDuringStop: ['docker', 'run', '--detach', ...create(duringStop).slice(2)],
      }),
      { mode: 0o600, flag: 'wx' },
    );
    for (const attempt of [running, inert]) {
      attempt.id = (await execute(create(attempt))).trim();
      await ownContainer(attempt.id);
      await record('created', attempt);
    }
    await ownContainer(running.id);
    await execute(['docker', 'start', running.id]);
    // The unique basename is predeclared before link; partial acknowledgement is cleaned by identity.
    requireProof(
      !(await import('node:fs/promises').then((fs) => fs.readdir(dirname(link)))).includes(service),
      'fixture unit name already exists',
    );
    unitIntended = true;
    await execute(['systemctl', '--user', 'link', unit]);
    await assertUnitFile();
    await execute(['systemctl', '--user', 'daemon-reload']);
    await unitEffect('start');
    async function waitFor(path: string): Promise<void> {
      while (!(await Bun.file(path).exists())) {
        requireProof(
          !cancellation.signal.aborted && performance.now() < deadline,
          'fixture readiness deadline/cancellation',
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    await waitFor(join(root, 'ready.json'));
    const ready: unknown = JSON.parse(await readFile(join(root, 'ready.json'), 'utf8'));
    requireProof(
      typeof ready === 'object' &&
        ready !== null &&
        'descendant' in ready &&
        typeof ready.descendant === 'number',
      'fixture readiness malformed',
    );
    const descendant = await observeSolverProcess(ready.descendant);
    const ports: SolverPorts = {
      edgeState,
      captureFile: async (path, maximum, decode) => {
        const index = logical.indexOf(path);
        const mapped = physical.at(index);
        requireProof(index >= 0 && mapped !== undefined, 'unknown tuple path');
        const observed = await captureSolverFile(mapped, maximum, decode);
        return { ...observed, path };
      },
      runHost: async (request, signal) => {
        if (request.kind === 'show') return show(signal);
        await unitEffect('stop', signal);
        await recoverInventory();
        requireProof(
          duringStop.id !== '' &&
            (await readFile(join(root, 'during-stop.id'), 'utf8')).trim() === duringStop.id,
          'during-stop child not observed',
        );
        for (const attempt of [running, duringStop]) {
          await ownContainer(attempt.id);
          const child = parseSolverContainer(
            await execute(solverInspectArgs(attempt.id)),
            attempt.id,
          );
          requireProof(child.phase === 'running', 'Docker child did not survive creator stop');
        }
        await record('creator-stopped-child-survives', { descendant, physicalGroup });
        return '';
      },
      observeProcess: async (pid) => {
        const observed = await observeSolverProcess(pid);
        requireProof(observed.cgroup === physicalGroup, 'fixture process group differs');
        requireProof(descendant.cgroup === physicalGroup, 'descendant outside fixture cgroup');
        return { ...observed, cgroup: logicalGroup };
      },
      observeCgroup: async (group, removed) => {
        requireProof(group === logicalGroup && physicalGroup !== '', 'unknown logical cgroup');
        const observed = await observeSolverCgroup(physicalGroup, removed);
        await record('cgroup', observed);
        return observed;
      },
      runDocker: async (args, signal) => {
        if (args[0] === 'ps') {
          await recoverInventory();
          const output = await execute(['docker', ...scopeDiscovery(args, token)], signal);
          for (const id of parseManagedContainerList(output)) await ownContainer(id);
          return output;
        }
        if (args[0] === 'image') {
          requireProof(
            JSON.stringify(args) ===
              JSON.stringify(['image', 'inspect', '--format', '{{.Id}}', image]),
            'unexpected image query',
          );
          return execute(['docker', ...args], signal);
        }
        requireProof(
          ['inspect', 'kill', 'wait'].includes(args[0] ?? ''),
          'unexpected fixture Docker command',
        );
        const id = args.at(-1);
        requireProof(id !== undefined, 'exact ID missing');
        return runFixtureDockerCommand(args, id, ownContainer, (guarded) =>
          execute(['docker', ...guarded], signal),
        );
      },
    };
    await withDependencyOwner(
      { sha, layouts: [layouts.prod, layouts.dev] },
      async (owner) => {
        await withSolverDrainUnderOwner(owner, layouts, pins, ports, deadline, async () => {
          const admission = { entered: false };
          try {
            await withSolverPolicyAdmission(() => {
              admission.entered = true;
              return Promise.resolve();
            }, edgeState);
            throw new Error('manual guarded launch admitted');
          } catch (cause) {
            requireProof(
              !admission.entered && isRetainedEdgeOwnerRefusal(cause),
              'manual admission refusal not proven',
            );
          }
          await unitEffect('start');
          await waitFor(join(root, 'refused.json'));
          requireProof(
            (await readFile(join(root, 'ready.json'), 'utf8')) === JSON.stringify(ready),
            'fixture restart entered runtime',
          );
          const refusalText = await readFile(join(root, 'refused.json'), 'utf8');
          const refusal: unknown = JSON.parse(refusalText);
          requireProof(
            typeof refusal === 'object' &&
              refusal !== null &&
              'reason' in refusal &&
              refusal.reason === 'retained-edge-owner',
            'restart admission refusal not proven',
          );
          await unitEffect('stop');
          await record('protected', {
            manualRefused: !admission.entered,
            restartRefusal: refusalText,
          });
        });
      },
      edgeState,
    );
    await record('drain-completed', { physicalGroup, logicalGroup });
  } catch (cause) {
    failure = cause;
  } finally {
    cleaning = true;
    cleanupDeadline = performance.now() + 45000;
    async function cleanup(label: string, action: () => Promise<void>): Promise<void> {
      try {
        await action();
      } catch (cause) {
        cleanupFailures.push(`${label}: ${describe(cause)}`);
      }
    }
    if (unitIntended)
      await cleanup('exact unit stop', async () => {
        await unitEffect('stop');
        const output = await observeSolverUnit(service, execute);
        assertFixtureStoppedUnit(output);
        if (physicalGroup !== '')
          requireProof(
            !(await observeSolverCgroup(physicalGroup, true))?.populated,
            'fixture cgroup still populated',
          );
      });
    await cleanup('recover fixture inventory', recoverInventory);
    for (const attempt of attempts)
      if (attempt.id !== '')
        await cleanup(`remove ${attempt.id}`, async () => {
          await removeFixtureContainer(
            attempt.id,
            async () => {
              await ownContainer(attempt.id);
              return parseSolverContainer(await execute(solverInspectArgs(attempt.id)), attempt.id);
            },
            (args) =>
              runFixtureEffect(args, attempt.id, ownContainer, (guarded) =>
                execute(['docker', ...guarded]),
              ),
          );
          const ids = parseManagedContainerList(
            await execute([
              'docker',
              'ps',
              '--all',
              '--no-trunc',
              '--filter',
              `id=${attempt.id}`,
              '--filter',
              `label=${OWNER}=${token}`,
              '--format',
              '{{.ID}}',
            ]),
          );
          requireProof(ids.length === 0, 'fixture container survived cleanup');
        });
    await cleanup('final owned container absence', async () => {
      requireProof(
        parseManagedContainerList(
          await execute([
            'docker',
            'ps',
            '--all',
            '--no-trunc',
            '--filter',
            `label=${OWNER}=${token}`,
            '--format',
            '{{.ID}}',
          ]),
        ).length === 0,
        'owned containers remain',
      );
    });
    if (unitIntended && cleanupFailures.length === 0)
      await cleanup('exact unit unlink', async () => {
        await assertUnitFile();
        await unlink(link);
        await execute(['systemctl', '--user', 'daemon-reload']);
        requireProof(
          !(await import('node:fs/promises').then((fs) => fs.readdir(dirname(link)))).includes(
            service,
          ),
          'fixture unit link survived',
        );
      });
    await record('cleanup', {
      complete: cleanupFailures.length === 0,
      recovery:
        cleanupFailures.length === 0
          ? null
          : {
              unit: service,
              link,
              ids: attempts.map((attempt) => attempt.id),
              commands: [
                `systemctl --user show ${service} --property=FragmentPath --property=ExecStart --property=Environment`,
                `readlink -- ${link}`,
                `systemctl --user stop ${service}`,
                ...attempts
                  .filter((attempt) => attempt.id !== '')
                  .flatMap((attempt) => [
                    `docker inspect --format '{{.Id}} {{.Name}} {{index .Config.Labels "${OWNER}"}}' ${attempt.id}`,
                    `docker kill ${attempt.id}`,
                    `docker wait ${attempt.id}`,
                    `docker rm ${attempt.id}`,
                  ]),
              ],
              instruction:
                'Attend exact identities in retained inventory; revalidate token label/name and unit symlink identity before stopping/removing. Never sweep.',
            },
    });
    await receiptFile.close();
    process.off('SIGTERM', cancel);
    process.off('SIGINT', cancel);
  }
  if (failure !== undefined || cleanupFailures.length > 0)
    throw new Error(
      `solver acceptance refused; receipt ${receipt}; ${describe(failure)}; ${cleanupFailures.join('; ')}`,
    );
  console.log(`solver drain acceptance passed: ${receipt}; private evidence retained: ${root}`);
}

if (import.meta.main) await runSolverDrainAcceptance();
