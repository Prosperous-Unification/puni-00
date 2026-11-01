import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { expect, test } from 'bun:test';

import { fixtureGit } from '../resources/host-pool.test.fixture';

/**
 * Register `path`'s tests to rerun inside a private user and PID namespace that maps this
 * account to itself. As `insideLinuxNamespace` does for the resource runtime, `/proc` then
 * shows only the suite's processes, so settlement is not blocked by an unrelated process of
 * this account; unlike it, the account is not root inside, so a file mode of 000 really makes a
 * cgroup counter unreadable (a mapped root's CAP_DAC_OVERRIDE would read it anyway).
 * Returns true inside the namespace, where the caller registers its real tests.
 */
export function insideOpsNamespace(path: string): boolean {
  if (process.env['DASH_OPS_TEST_NAMESPACE'] === '1') return true;
  test(`${basename(path)} in a private Linux namespace`, () => {
    const uid = String(process.getuid?.());
    const gid = String(process.getgid?.());
    const execution = Bun.spawnSync(
      [
        'unshare',
        '--user',
        `--map-user=${uid}`,
        `--map-group=${gid}`,
        '--pid',
        '--fork',
        '--mount-proc',
        process.execPath,
        'test',
        path,
        '--timeout=120000',
      ],
      {
        env: { ...process.env, DASH_OPS_TEST_NAMESPACE: '1' },
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 420000,
      },
    );
    if (execution.exitCode !== 0)
      throw new Error(execution.stdout.toString() + execution.stderr.toString());
    // The inner results, skips and their reasons included, stay visible in the outer run.
    process.stderr.write(execution.stderr.toString());
    expect(execution.exitCode).toBe(0);
  }, 420000);
  return false;
}

/**
 * Whether this host's user manager creates a scope, the precondition of every real-scope test,
 * and the diagnostic when it does not, so a skipped test names why.
 */
export function probeUserScopes(): { available: true } | { available: false; reason: string } {
  const probe = Bun.spawnSync(
    ['systemd-run', '--user', '--scope', '--quiet', '-p', 'MemoryHigh=100M', '--', 'true'],
    { stdout: 'pipe', stderr: 'pipe', timeout: 30000 },
  );
  if (probe.exitCode === 0) return { available: true };
  return {
    available: false,
    reason: `systemd-run --user --scope answered exit ${String(probe.exitCode)}: ${probe.stderr.toString().trim().split('\n')[0] ?? ''}`,
  };
}

/** The small image the container tests run, when the local daemon already has it. */
export const CONTAINER_IMAGE = 'busybox:1.37.0-musl';

/** Whether a local Docker daemon answers and holds {@link CONTAINER_IMAGE}, else why not. */
export function probeDocker(): { available: true } | { available: false; reason: string } {
  const probe = Bun.spawnSync(['docker', 'image', 'inspect', CONTAINER_IMAGE], {
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 30000,
  });
  if (probe.exitCode === 0) return { available: true };
  return {
    available: false,
    reason: `docker image inspect ${CONTAINER_IMAGE} answered exit ${String(probe.exitCode)}: ${probe.stderr.toString().trim().split('\n')[0] ?? ''}`,
  };
}

/** One catalogue entry for a fixture checkout; profile `""` unless stated. */
export interface FixtureJobType {
  id: string;
  cpuCores: number;
  memoryGib: number;
  tmpDiskGib?: number;
  exclusive?: string[];
  containers?: 'none' | { memoryGib: number; cpuCores: number };
  enforcement?: 'observe' | 'cap';
  argumentProfile?: string;
}

/** A Git checkout whose HEAD commits `infra/jobs/catalogue.json` with `types`. */
export function catalogueCheckout(path: string, types: readonly FixtureJobType[]): string {
  mkdirSync(join(path, 'infra', 'jobs'), { recursive: true });
  mkdirSync(join(path, 'bin'), { recursive: true });
  fixtureGit(path, 'init', '--quiet');
  writeFileSync(join(path, 'bin', 'payload.sh'), '#!/bin/sh\nexit 0\n');
  writeFileSync(
    join(path, 'infra', 'jobs', 'catalogue.json'),
    `${JSON.stringify(catalogueOf(types), null, 2)}\n`,
  );
  fixtureGit(path, 'add', '.');
  fixtureGit(path, 'commit', '--quiet', '-m', 'catalogue');
  return path;
}

/** The catalogue file a fixture checkout commits. */
export function catalogueOf(types: readonly FixtureJobType[]) {
  return {
    schemaVersion: 1,
    jobs: types.map((jobType) => ({
      id: jobType.id,
      entrypoint: 'bin/payload.sh',
      argumentProfile: jobType.argumentProfile ?? '',
      envelope: {
        cpuCores: jobType.cpuCores,
        memoryGib: jobType.memoryGib,
        tmpDiskGib: jobType.tmpDiskGib ?? 0,
        exclusive: jobType.exclusive ?? [],
      },
      containers: jobType.containers ?? 'none',
      enforcement: jobType.enforcement ?? 'observe',
      provenance: { kind: 'estimated', basis: 'test fixture', until: '2099-12-31' },
    })),
  };
}

/** An executable payload script at `path`: `/bin/sh` running `body`. */
export function payloadScript(path: string, body: string): string {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

/**
 * A directory holding a stub `systemd-run` that prints `diagnostic` on stderr and exits 1, as
 * systemd's client does when no user manager answers, to put first on `PATH`.
 */
export function refusingSystemdRun(directory: string, diagnostic: string): string {
  mkdirSync(directory, { recursive: true });
  payloadScript(join(directory, 'systemd-run'), `printf '%s\\n' '${diagnostic}' >&2\nexit 1`);
  return directory;
}
