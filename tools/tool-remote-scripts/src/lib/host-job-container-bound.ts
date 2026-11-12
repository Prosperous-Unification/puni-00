/** The label settlement attributes a container by, valued with the job's use id (J16). */
export const HOST_JOB_LABEL = 'puni.job';

/**
 * The containers bound a test-phase container takes inside a Dash host job: the `gate` type's
 * declared `containers` in `infra/jobs/catalogue.json`, and at or under every other type's, so
 * settlement judges it bounded whichever type runs it. `host-job-container-bound.test.ts` reads
 * the catalogue and fails when either stops holding.
 */
export const HOST_JOB_CONTAINER_BOUND = { memoryGib: 1, cpuCores: 1 } as const;

/** The only variables these flags read; `process.env` satisfies it. */
export type HostJobEnvironment = Readonly<Record<string, string | undefined>>;

function readJobId(environment: HostJobEnvironment): string | null {
  const jobId = environment['DASH_JOB_ID'];
  // An empty value is outside a job, as `[ -n "${DASH_JOB_ID:-}" ]` reads it in
  // solver-image-smoke.sh, so the two sides of the gate agree on the boundary.
  return jobId === undefined || jobId === '' ? null : jobId;
}

/**
 * The `docker run`/`docker create` flags that close the `gate` type's J16 gap
 * (`docs/infra/heavy-job-launchers.md`): inside a Dash host job, which `DASH_JOB_ID` marks,
 * `--memory 1g --cpus 1 --label puni.job=<id>`, so Docker's cgroup enforces the declared bound
 * and Dash attributes the container to the job instead of reporting `attribution_incomplete`.
 * Outside one (CI, an unenrolled gate host, production) it is empty and the caller's argv is
 * exactly as before, because the bound is declared, not measured.
 */
export function hostJobContainerFlags(environment: HostJobEnvironment): string[] {
  const jobId = readJobId(environment);
  if (jobId === null) return [];
  return [
    '--memory',
    `${String(HOST_JOB_CONTAINER_BOUND.memoryGib)}g`,
    '--cpus',
    String(HOST_JOB_CONTAINER_BOUND.cpuCores),
    '--label',
    `${HOST_JOB_LABEL}=${jobId}`,
  ];
}

/**
 * {@link hostJobContainerFlags} for a caller that already sets a tighter `--memory` of its own
 * (the supervisor's managed solver, whose `--memory-swap` must equal it): only `--cpus` and the
 * label, empty outside a job.
 *
 * @throws when inside a job `ownMemoryMib` exceeds the bound, which settlement would judge
 * unbounded.
 */
export function hostJobAttributionFlags(
  environment: HostJobEnvironment,
  ownMemoryMib: number,
): string[] {
  const jobId = readJobId(environment);
  if (jobId === null) return [];
  if (ownMemoryMib > HOST_JOB_CONTAINER_BOUND.memoryGib * 1024) {
    throw new Error(
      `host job container: memory ${String(ownMemoryMib)} MiB exceeds the ${String(HOST_JOB_CONTAINER_BOUND.memoryGib)} GiB containers bound`,
    );
  }
  return [
    '--cpus',
    String(HOST_JOB_CONTAINER_BOUND.cpuCores),
    '--label',
    `${HOST_JOB_LABEL}=${jobId}`,
  ];
}
