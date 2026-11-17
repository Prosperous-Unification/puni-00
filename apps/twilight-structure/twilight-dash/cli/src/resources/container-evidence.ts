import type { ContainerEvidence } from './runtime';

/** The label every container a host job starts carries, valued with the job's use id (J16). */
export const JOB_LABEL = 'puni.job';

const DOCKER_DEADLINE_MS = 30_000;

/**
 * The environment the `docker` CLI gets: what selects its daemon and finds its contexts, so a
 * reading sees the daemon the payload's own `docker` reaches.
 */
export function dockerEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const key of ['PATH', 'HOME', 'DOCKER_CONFIG', 'DOCKER_HOST', 'DOCKER_CONTEXT']) {
    const value = environment[key];
    if (value !== undefined) kept[key] = value;
  }
  return kept;
}

/** The `docker` CLI on `PATH`, or null when the host has none; no daemon is contacted. */
export function findDocker(
  environment: Readonly<Record<string, string | undefined>>,
): string | null {
  return Bun.which('docker', { PATH: environment['PATH'] ?? '' });
}

/**
 * Settlement's container evidence (J2'): no running container carries the job's label. A
 * failed reading throws, which keeps the compute entry charged. `ops job run` reads it for the
 * job it launched; `resources watch` and `resources sweep` read it for every job whose launcher
 * is gone, since a declared bound otherwise stays charged forever (h4claw job 22ce2369,
 * 2026-11-17, `dash-host-jobs` verify.md).
 */
export function dockerContainerEvidence(
  docker: string,
  environment: Readonly<Record<string, string | undefined>>,
): ContainerEvidence {
  return {
    containersGone: (job) => {
      if (job.descriptor.containers === 'none') return true;
      const listed = Bun.spawnSync(
        [docker, 'ps', '--quiet', '--filter', `label=${JOB_LABEL}=${job.id}`],
        {
          env: dockerEnvironment(environment),
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: DOCKER_DEADLINE_MS,
          killSignal: 'SIGKILL',
        },
      );
      if (listed.exitCode !== 0)
        throw new Error(
          `docker ps answered exit ${String(listed.exitCode)}: ${listed.stderr.toString('utf8').split('\n')[0] ?? ''}`,
        );
      return listed.stdout.toString('utf8').trim() === '';
    },
  };
}
