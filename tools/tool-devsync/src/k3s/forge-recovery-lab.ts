import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { type PodObservation, type RecoveryDriver, rehearseRecovery } from './forge-recovery-check';

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('expected JSON object');
  // JSON/object boundary is checked above; individual fields are validated by their consumers.
  return value as Record<string, unknown>;
}
function readText(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('expected nonempty string');
  return value;
}
function readCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    throw new Error('expected nonnegative integer');
  return value;
}

/** Missing container status is a modeled startup state; malformed present status fails closed. */
export function observePod(value: unknown): PodObservation | null {
  const pod = readObject(value);
  const status = readObject(pod['status']);
  if (status['containerStatuses'] === undefined) return null;
  if (!Array.isArray(status['containerStatuses']))
    throw new Error('expected containerStatuses array');
  const source = status['containerStatuses']
    .map(readObject)
    .find((container) => container['name'] === 'source');
  if (source === undefined) throw new Error('source container missing from present status');
  if (source['containerID'] === undefined) return null;
  if (typeof source['ready'] !== 'boolean') throw new Error('source ready is not boolean');
  const previous = readObject(source['lastState']);
  const state = readObject(source['state']);
  const terminated = [previous['terminated'], state['terminated']]
    .filter((termination) => termination !== undefined)
    .map(readObject);
  return {
    uid: readText(readObject(pod['metadata'])['uid']),
    container: readText(source['containerID']),
    restarts: readCount(source['restartCount']),
    ready: source['ready'],
    // Proof: ignoring current OOM fails its snapshot test; treating Error/137 as OOM fails the deliberate SIGKILL test.
    oom: terminated.some((termination) => termination['reason'] === 'OOMKilled'),
  };
}

/**
 * Owns one uniquely named disposable app lab and one clean served checkout. Evidence is outside
 * the checkout. Every external process has a deadline; cleanup aggregates failures and throws.
 * Usage: bun .../forge-recovery-lab.ts --lab <id> --worktree <fresh-clone> --evidence <new-dir>
 * --sha <exact-commit>. Run from that fresh clone after committing the driver.
 */
export async function runRecoveryLab(arguments_: readonly string[]): Promise<void> {
  const flags = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_.at(index);
    const value = arguments_.at(index + 1);
    if (
      flag === undefined ||
      value === undefined ||
      !['--lab', '--worktree', '--evidence', '--sha'].includes(flag) ||
      flags.has(flag)
    ) {
      throw new Error('expected unique --lab, --worktree, --evidence and --sha pairs');
    }
    flags.set(flag, value);
  }
  const lab = readText(flags.get('--lab'));
  if (!/^[a-z][a-z0-9]{1,19}$/.test(lab)) throw new Error('invalid disposable lab ID');
  const worktree = resolve(readText(flags.get('--worktree')));
  const evidence = resolve(readText(flags.get('--evidence')));
  const sha = readText(flags.get('--sha'));
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('exact 40-character SHA required');
  if (evidence === worktree || evidence.startsWith(`${worktree}/`))
    throw new Error('evidence must be outside served checkout');
  await mkdir(evidence, { recursive: false });
  const kubectl = process.env['KUBECTL'] ?? 'kubectl';
  const k3d = process.env['K3D'] ?? 'k3d';
  const cluster = `puni-${lab}-platform`;
  const context = `k3d-${cluster}`;
  const node = `k3d-${cluster}-server-0`;
  const namespace = 'puni-forge-alpha';
  const podName = 'dev-alpha';
  const statePath = join(worktree, `.puni/fleet-labs/k3d/${lab}`);
  const kubeconfig = join(statePath, `${cluster}.kubeconfig`);
  const environment = { ...process.env, KUBECTL: kubectl, K3D: k3d };
  const events: unknown[] = [];
  const event = async (phase: string, fields: unknown): Promise<void> => {
    events.push({ at: new Date().toISOString(), phase, fields });
    await writeFile(join(evidence, 'events.json'), JSON.stringify(events, null, 2));
  };
  let sequence = 0;
  let firstContainer: PodObservation | undefined;
  const terminations = new Set<string>();
  const invoke = async (command: readonly string[], name: string, timeout = 60_000) => {
    const logPath = join(evidence, `${name}-${String(sequence++)}.log`);
    const child = Bun.spawn([...command], {
      cwd: worktree,
      env: environment,
      stdout: Bun.file(logPath),
      stderr: Bun.file(`${logPath}.stderr`),
      timeout,
    });
    const exitCode = await child.exited;
    const output = `${await readFile(logPath, 'utf8')}\n${await readFile(`${logPath}.stderr`, 'utf8')}`;
    await event(name, { command, exitCode, signal: child.signalCode, logPath });
    if (child.signalCode !== null) throw new Error(`${name} terminated by ${child.signalCode}`);
    return { exitCode, output };
  };
  const requireCommand = async (
    command: readonly string[],
    name: string,
    timeout?: number,
  ): Promise<string> => {
    const receipt = await invoke(command, name, timeout);
    if (receipt.exitCode !== 0) throw new Error(`${name} exited ${String(receipt.exitCode)}`);
    return receipt.output;
  };
  const kube = (...args: string[]) => [
    kubectl,
    '--kubeconfig',
    kubeconfig,
    '--context',
    context,
    ...args,
  ];
  const digest = async (path: string) =>
    createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
  if ((await requireCommand(['git', 'rev-parse', 'HEAD'], 'sha')).trim() !== sha)
    throw new Error('checkout SHA mismatch');
  if ((await requireCommand(['git', 'status', '--porcelain'], 'clean')).trim() !== '')
    throw new Error('served checkout dirty');
  for (const path of ['.nx', '.puni', 'apps/wbs/be-01/local.db']) {
    if (existsSync(join(worktree, path)))
      throw new Error(`fresh checkout required: ${path} exists`);
  }
  const lock = readObject(
    JSON.parse(await readFile(join(worktree, 'infra/versions/toolchain.json'), 'utf8')),
  );
  const binaries = readObject(lock['binaries']);
  for (const [name, executable] of [
    ['kubectl', kubectl],
    ['k3d', k3d],
  ] as const) {
    const expected = readText(readObject(binaries[name])['sha256']);
    if ((await digest(executable)) !== expected) throw new Error(`${name} digest mismatch`);
  }
  const kubeGlobal = join(readText(process.env['HOME']), '.kube/config');
  const kubeBefore = await digest(kubeGlobal);
  const dockerBefore = await requireCommand(
    ['docker', 'ps', '-a', '--format', '{{.ID}} {{.Names}}'],
    'docker-before',
  );
  const ownedBefore = await requireCommand(
    ['docker', 'ps', '-aq', '--filter', `label=puni.dev/lab-id=${lab}`],
    'ownership-before',
  );
  if (ownedBefore.trim() !== '' || existsSync(statePath))
    throw new Error('lab already exists; refusing adoption');
  const memory = await readFile('/proc/meminfo', 'utf8');
  const available = /^MemAvailable:\s+(\d+) kB$/m.exec(memory)?.[1];
  if (available === undefined || Number(available) < 4 * 1024 * 1024)
    throw new Error('app lab needs 4GiB available memory');
  await event('identity', {
    sha,
    tree: (await requireCommand(['git', 'rev-parse', 'HEAD^{tree}'], 'tree')).trim(),
    worktree,
    lab,
    memory,
    dockerBefore,
    kubeBefore,
  });
  await requireCommand(['bun', 'install', '--frozen-lockfile'], 'install', 180_000);
  await requireCommand(['bun', 'run', 'dev:setup'], 'setup');
  let labAttempted = false;
  let devAttempted = false;
  let startup: ReturnType<typeof Bun.spawn> | undefined;
  let sampler: ReturnType<typeof Bun.spawn> | undefined;
  let origin: string | undefined;
  const stop = `/tmp/forge-recovery-${lab}-stop`;
  const driver: RecoveryDriver = {
    observe: async () => {
      const raw = await requireCommand(
        kube('-n', namespace, 'get', 'pod', podName, '--ignore-not-found', '-o', 'json'),
        'pod',
      );
      if (raw.trim() === '') return null;
      const observed = observePod(JSON.parse(raw));
      await event('pod-observation', observed);
      if (observed !== null && firstContainer === undefined) firstContainer = observed;
      if (observed?.oom === true && !terminations.has(observed.container)) {
        terminations.add(observed.container);
        await invoke(kube('-n', namespace, 'logs', podName, '--previous'), 'cold-previous-logs');
        await invoke(kube('-n', namespace, 'logs', podName), 'cold-current-logs');
      }
      if (startup !== undefined && startup.exitCode !== null && startup.exitCode !== 0)
        throw new Error(`dev up exited ${String(startup.exitCode)}`);
      return observed;
    },
    kill: async (pod) => {
      if (startup !== undefined && (await startup.exited) !== 0)
        throw new Error('dev up failed before PID1 diagnostic');
      if (!/^containerd:\/\/[a-f0-9]+$/.test(pod.container))
        throw new Error('invalid container identity');
      const identity = readObject(
        JSON.parse(
          await requireCommand(
            ['docker', 'exec', node, 'crictl', 'inspect', pod.container.slice(13)],
            'container-inspect',
          ),
        ),
      );
      const status = readObject(identity['status']);
      if (readObject(status['labels'])['io.kubernetes.pod.uid'] !== pod.uid)
        throw new Error('node container belongs to foreign UID');
      const pid = readCount(readObject(identity['info'])['pid']);
      if (pid <= 1) throw new Error('node PID must be greater than one');
      const statusText = await requireCommand(
        ['docker', 'exec', node, 'cat', `/proc/${String(pid)}/status`],
        'pid-status',
      );
      if (!/^NSpid:\s+.*\b1$/m.test(statusText)) throw new Error('target is not container PID1');
      await requireCommand(['docker', 'exec', node, 'kill', '-9', String(pid)], 'kill-pid1');
    },
    check: async (phase) => {
      if (origin === undefined) throw new Error('lab origin missing');
      const destination = join(evidence, `${phase}-browser`);
      return invoke(
        [
          'env',
          `FORGE_RECOVERY_TRACE=${destination}`,
          'bun',
          '--preload',
          join(worktree, 'tools/tool-devsync/src/k3s/forge-recovery-browser.ts'),
          'tools/tool-devsync/src/k3s/dev-environment-check.ts',
          '--origin',
          origin,
          '--worktree',
          worktree,
          '--kubeconfig',
          kubeconfig,
          '--context',
          context,
          '--pod',
          podName,
        ],
        `checker-${phase}`,
        420_000,
      );
    },
    readPolicy: async () => {
      const policy = readObject(
        JSON.parse(
          await requireCommand(
            kube('-n', namespace, 'get', 'networkpolicy', podName, '-o', 'json'),
            'policy-read',
          ),
        ),
      );
      const spec = readObject(policy['spec']);
      if (!Array.isArray(spec['ingress'])) throw new Error('policy ingress array required');
      return { ...spec, ingress: spec['ingress'] };
    },
    writePolicy: async (spec) => {
      await requireCommand(
        kube(
          '-n',
          namespace,
          'patch',
          'networkpolicy',
          podName,
          '--type=merge',
          '-p',
          JSON.stringify({ spec }),
        ),
        'policy-write',
      );
    },
    pause: () => Bun.sleep(500),
    cleanup: async () => {
      const failures: string[] = [];
      const attempt = async (operation: () => Promise<void>) => {
        try {
          await operation();
        } catch (failure) {
          failures.push(String(failure));
        }
      };
      await attempt(async () => {
        if (startup?.exitCode === null) {
          startup.kill('SIGTERM');
          await startup.exited;
        }
        if (sampler !== undefined) {
          await requireCommand(['docker', 'exec', node, 'touch', stop], 'sampler-stop');
          const code = await sampler.exited;
          const samples = await readFile(join(evidence, 'node-memory-rss.log'), 'utf8');
          if (firstContainer === undefined)
            throw new Error('first source container identity absent');
          requireMemoryEvidence(samples, firstContainer);
          if (code !== 0) throw new Error(`memory sampler exited ${String(code)}`);
        }
      });
      if (devAttempted)
        await attempt(async () => {
          await requireCommand(
            [
              'bun',
              'tools/tool-devsync/src/k3s/dev-environment.ts',
              'down',
              '--slug',
              'alpha',
              '--cluster',
              cluster,
            ],
            'dev-down',
            180_000,
          );
          if (
            (
              await requireCommand(
                kube('get', 'namespace', namespace, '--ignore-not-found', '-o', 'name'),
                'namespace-absent',
              )
            ).trim() !== ''
          )
            throw new Error('owned namespace remains');
          const leases = readObject(
            JSON.parse(
              await requireCommand(
                kube('-n', 'puni-forge', 'get', 'leases', '-o', 'json'),
                'leases-absent',
              ),
            ),
          );
          if (!Array.isArray(leases['items']) || leases['items'].length !== 0)
            throw new Error('owned claim Leases remain');
        });
      if (labAttempted)
        await attempt(async () => {
          await requireCommand(
            ['bun', 'tools/tool-fleet/src/k3d-lab.ts', 'down', '--id', lab, '--profile', 'app'],
            'lab-down',
            180_000,
          );
          if (existsSync(join(statePath, 'lab.json'))) throw new Error('lab state remains');
          for (const kind of ['container', 'network', 'volume']) {
            const command = [
              'docker',
              kind,
              'ls',
              '-q',
              '--filter',
              `label=puni.dev/lab-id=${lab}`,
            ];
            if (kind === 'container') command.push('--all');
            if ((await requireCommand(command, `${kind}-absent`)).trim() !== '')
              throw new Error(`owned ${kind} remains`);
          }
        });
      await attempt(async () => {
        if ((await digest(kubeGlobal)) !== kubeBefore) throw new Error('global kubeconfig changed');
        if ((await requireCommand(['git', 'status', '--porcelain'], 'final-clean')).trim() !== '')
          throw new Error('served tracked tree changed');
        await requireCommand(
          ['docker', 'ps', '-a', '--format', '{{.ID}} {{.Names}}'],
          'docker-after',
        );
      });
      if (failures.length > 0) throw new Error(`cleanup failed: ${failures.join('; ')}`);
    },
  };
  try {
    labAttempted = true;
    await requireCommand(
      [
        'bun',
        'tools/tool-fleet/src/k3d-lab.ts',
        'up',
        '--id',
        lab,
        '--profile',
        'app',
        '--worktree-root',
        dirname(worktree),
      ],
      'lab-up',
      300_000,
    );
    const labState = readObject(JSON.parse(await readFile(join(statePath, 'lab.json'), 'utf8')));
    origin = `http://alpha.localhost:${String(readCount(labState['httpPort']))}`;
    await requireCommand(
      [
        'docker',
        'exec',
        node,
        'sh',
        '-c',
        'cat /proc/meminfo; cat /sys/fs/cgroup/memory.current; cat /sys/fs/cgroup/memory.peak; cat /sys/fs/cgroup/memory.events',
      ],
      'node-memory-before',
    );
    // The node owns the process/cgroup view. Its shell runs before dev up and stops after 15m
    // even if the client disappears; lab teardown removes the entire owned node afterwards.
    const sampleScript = `deadline=$(( $(date +%s) + 900 )); while [ ! -e ${stop} ] && [ $(date +%s) -lt $deadline ]; do date -u +%FT%TZ; crictl ps -a --name source -o json || exit 90; for metricpath in $(find /sys/fs/cgroup -path '*kubepods*' -name memory.current); do path=\${metricpath%/memory.current}; [ -d "$path" ] || continue; echo "$path"; for metric in memory.current memory.peak memory.events cgroup.procs; do echo "$metric"; cat "$path/$metric" || exit 91; done; while read -r pid; do [ ! -e /proc/$pid/status ] || cat /proc/$pid/status; done < "$path/cgroup.procs"; done; sleep 0.2; done`;
    sampler = Bun.spawn(['docker', 'exec', node, 'sh', '-c', sampleScript], {
      cwd: worktree,
      env: environment,
      stdout: Bun.file(join(evidence, 'node-memory-rss.log')),
      stderr: Bun.file(join(evidence, 'node-memory-rss.stderr')),
      timeout: 920_000,
    });
    devAttempted = true;
    startup = Bun.spawn(
      [
        'bun',
        'tools/tool-devsync/src/k3s/dev-environment.ts',
        'up',
        '--slug',
        'alpha',
        '--worktree',
        worktree,
        '--cluster',
        cluster,
      ],
      {
        cwd: worktree,
        env: environment,
        stdout: Bun.file(join(evidence, 'dev-up.log')),
        stderr: Bun.file(join(evidence, 'dev-up.stderr')),
        timeout: 660_000,
      },
    );
    const report = await rehearseRecovery(driver, 600_000);
    await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ evidence, ...report }, null, 2));
    if (!report.acceptancePassed) process.exitCode = 1;
  } catch (failure) {
    await event('startup-failed', String(failure));
    await driver.cleanup();
    throw failure;
  }
}

if (import.meta.main) await runRecoveryLab(process.argv.slice(2));

/** Refuses unrelated platform samples as evidence about the first observed forge container. */
export function requireMemoryEvidence(samples: string, pod: PodObservation): void {
  const source = samples
    .split('/sys/fs/cgroup/')
    .filter((sample) =>
      sample.split('\n')[0]?.includes(`pod${pod.uid}/${pod.container.slice(13)}`),
    );
  // Proof: platform-only and missing-peak samples fail their first-source evidence tests.
  if (
    !source.some((sample) =>
      ['memory.current', 'memory.peak', 'memory.events', 'VmRSS:'].every((metric) =>
        sample.includes(metric),
      ),
    )
  ) {
    throw new Error('first source container memory/RSS evidence absent');
  }
}
