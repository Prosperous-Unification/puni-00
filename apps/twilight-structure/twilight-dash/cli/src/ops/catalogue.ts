import { createHash } from 'node:crypto';
import { arch } from 'node:os';

import {
  JobCataloguePath,
  type JobType,
  parseJobArguments,
  parseJobCatalogue,
} from '@twilight-burokrat/contracts';

import type { JobTypeDescriptor } from '../resources/host-pool';
import type { HostFacts, ScopeCeiling } from '../resources/runtime';
import { causeText, OpsRefusal } from './refusal';

/** A job type read from a checkout's catalogue at one commit, as the run record pins it (J2). */
export interface CataloguedJob {
  readonly jobType: JobType;
  /**
   * What the host pool admits from: the envelope, containers, enforcement and the dimensions
   * clamped to the pool; `executeHostJob` adds the scope bound once the pool is open.
   */
  readonly descriptor: JobTypeDescriptor;
  /** The checkout's top directory. */
  readonly checkout: string;
  /** The commit the catalogue was read at and the payload runs from: the checkout's HEAD. */
  readonly revision: string;
  /** `<checkout>/infra/jobs/catalogue.json`, the path every refusal names. */
  readonly cataloguePath: string;
  /** SHA-256 of the entry's JSON as the catalogue states it. */
  readonly descriptorDigest: string;
}

/** Which figure set a scope's `MemoryHigh` ({@link scopeMemoryBound}). */
export type BoundTerm = 'envelope' | 'heuristic' | 'pool' | 'reservation';

/** A job scope's `MemoryHigh` on one pool and the figure that set it. */
export interface ScopeMemoryBound {
  readonly memoryGib: number;
  readonly term: BoundTerm;
  /** The clamped entry's `heuristic.memoryGib`; absent for term `envelope`. */
  readonly heuristicGib?: number;
}

/**
 * The memory a job's scope may use before `MemoryHigh` throttles it (J7) on a pool `ceiling`:
 * the envelope's `memoryGib` (term `envelope`), except for an entry whose provenance clamped
 * `memoryGib` to the pool (task 6.25, S25-A6). That entry reserves the pool (S25-A7) but runs
 * under `min(heuristic.memoryGib, ceiling.memoryGib − ceiling.memoryBoundHeadroomGib)`: the
 * heuristic, or the pool's budget less the room it leaves to the rest of the host, whichever is
 * lower (term `heuristic` or `pool`), and never below its own envelope (term `reservation`).
 * @throws Error when a clamped `memoryGib` has no heuristic, which the contract refuses.
 */
export function scopeMemoryBound(jobType: JobType, ceiling: ScopeCeiling): ScopeMemoryBound {
  const { provenance } = jobType;
  const envelope = jobType.envelope.memoryGib;
  if (provenance.kind !== 'calibrated' || !provenance.clampedToAllocatable?.includes('memoryGib'))
    return { memoryGib: envelope, term: 'envelope' };
  // Proof: answering the envelope here (then `memoryBoundOf`) made `a clamped entry sets
  // MemoryHigh to its heuristic; an unclamped one to its envelope` (job-run.test.ts) find the
  // scope launched with `MemoryHigh=2G` (2026-11-20, S25-A6).
  const heuristic = provenance.heuristic?.memoryGib;
  if (heuristic === undefined)
    throw new Error(`job type ${jobType.id} clamps memoryGib without its heuristic`);
  const pool = ceiling.memoryGib - ceiling.memoryBoundHeadroomGib;
  // Proof: taking the heuristic alone made `the pool caps the bound when …` (job-run.test.ts)
  // launch `-p MemoryHigh=3G` on a 4 − 2 GiB pool, and `the scope bound is the lower of the
  // heuristic and the pool, never below the reservation` fail; dropping the floor failed the
  // latter's reservation case (2026-11-20, review S2-3).
  if (pool < envelope) return { memoryGib: envelope, term: 'reservation', heuristicGib: heuristic };
  return heuristic <= pool
    ? { memoryGib: heuristic, term: 'heuristic', heuristicGib: heuristic }
    : { memoryGib: pool, term: 'pool', heuristicGib: heuristic };
}

/**
 * The refusal for a `cap` entry whose `memoryGib` is clamped to the pool, or null: its
 * `MemoryMax` would sit below the measured p95 and kill every run (task 6.25, S25-A6).
 */
export function cappedClampOf(jobType: JobType): string | null {
  const { provenance } = jobType;
  return jobType.enforcement === 'cap' &&
    provenance.kind === 'calibrated' &&
    provenance.clampedToAllocatable?.includes('memoryGib') === true
    ? `job type ${jobType.id} enforces cap with memoryGib clamped to the pool: MemoryMax ${String(jobType.envelope.memoryGib)}G is below its calibrated p95 ${String(provenance.p95.memoryGib)} GiB and would kill every run; use observe enforcement or raise the pool's allocatable`
    : null;
}

function git(cwd: string, ...arguments_: string[]): { exitCode: number; stdout: string } {
  const execution = Bun.spawnSync(['git', '-C', cwd, ...arguments_], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { exitCode: execution.exitCode, stdout: execution.stdout.toString('utf8') };
}

/** A checkout's whole catalogue at its HEAD commit, as `propose` and `audit` read it (J9). */
export interface CommittedCatalogue {
  readonly checkout: string;
  readonly revision: string;
  readonly cataloguePath: string;
  readonly jobs: readonly JobType[];
}

/** SHA-256 of a catalogue entry's JSON as the catalogue states it: what a run record pins. */
export function descriptorDigestOf(jobType: JobType): string {
  return createHash('sha256').update(JSON.stringify(jobType)).digest('hex');
}

/**
 * The catalogue of the checkout holding `cwd`, read at that checkout's HEAD commit, never from
 * the working tree. `command` prefixes every refusal.
 * @throws OpsRefusal 64 when `cwd` is in no checkout or the revision has no catalogue; 70 when
 * the catalogue at that revision is malformed.
 */
export function readCommittedCatalogue(cwd: string, command: string): CommittedCatalogue {
  // Proof: dropping each refusal below in turn failed `propose refuses a checkout without a
  // usable catalogue, and an uncatalogued type` (calibrate.test.ts): outside a checkout it went
  // on and exited 1; with no HEAD it named a missing catalogue; with no catalogue it refused 70
  // as malformed; a malformed catalogue threw the contract's error, not 70 (2026-11-02, A13).
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  if (top.exitCode !== 0)
    throw new OpsRefusal(
      64,
      `${command}: ${cwd} is not inside a Git checkout with a job catalogue`,
    );
  const checkout = top.stdout.trim();
  const head = git(checkout, 'rev-parse', '--verify', 'HEAD^{commit}');
  if (head.exitCode !== 0) throw new OpsRefusal(64, `${command}: ${checkout} has no HEAD commit`);
  const revision = head.stdout.trim();
  const cataloguePath = `${checkout}/${JobCataloguePath}`;
  const shown = git(checkout, 'show', `${revision}:${JobCataloguePath}`);
  if (shown.exitCode !== 0)
    throw new OpsRefusal(64, `${command}: ${cataloguePath} does not exist at ${revision}`);
  try {
    return {
      checkout,
      revision,
      cataloguePath,
      jobs: parseJobCatalogue(JSON.parse(shown.stdout) as unknown).jobs,
    };
  } catch (cause) {
    throw new OpsRefusal(
      70,
      `${command}: ${cataloguePath} at ${revision} is malformed: ${causeText(cause)}`,
      { cause },
    );
  }
}

/**
 * The job type `typeId` from the catalogue of the checkout holding `cwd`, read at that
 * checkout's HEAD commit, never from the working tree: the payload's revision is the commit the
 * caller stands on (`dash-host-jobs` J2, slice 3 assumption S3-A2). `argv` is the payload command;
 * its first word is the program and the rest must match the type's argument profile.
 * @throws OpsRefusal 64 when `cwd` is in no checkout, the revision has no catalogue, the
 * catalogue names no such type, or the arguments do not match its profile; 70 when the
 * catalogue at that revision is malformed.
 */
export function readCataloguedJob(
  cwd: string,
  typeId: string,
  argv: readonly string[],
): CataloguedJob {
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  if (top.exitCode !== 0)
    throw new OpsRefusal(
      64,
      `ops job run: ${cwd} is not inside a Git checkout with a job catalogue`,
    );
  const checkout = top.stdout.trim();
  const head = git(checkout, 'rev-parse', '--verify', 'HEAD^{commit}');
  if (head.exitCode !== 0) throw new OpsRefusal(64, `ops job run: ${checkout} has no HEAD commit`);
  const revision = head.stdout.trim();
  const cataloguePath = `${checkout}/${JobCataloguePath}`;
  const shown = git(checkout, 'show', `${revision}:${JobCataloguePath}`);
  // Proof: reading the working tree's file instead made `reads the catalogue at HEAD, not the
  // working tree` (job-run.test.ts) find the uncommitted type, no refusal (2026-11-01, Slice 3).
  if (shown.exitCode !== 0)
    throw new OpsRefusal(
      64,
      `ops job run: ${cataloguePath} does not exist at ${revision}; no job type ${typeId} is catalogued there`,
    );
  let catalogue;
  try {
    catalogue = parseJobCatalogue(JSON.parse(shown.stdout) as unknown);
  } catch (cause) {
    throw new OpsRefusal(
      70,
      `ops job run: ${cataloguePath} at ${revision} is malformed: ${causeText(cause)}`,
      {
        cause,
      },
    );
  }
  const jobType = catalogue.jobs.find((candidate) => candidate.id === typeId);
  // Proof: without it `an uncatalogued type exits 64 naming the type and the catalogue`
  // (job-run.test.ts) got "undefined is not an object (evaluating 'jobType.argumentProfile')".
  if (jobType === undefined)
    throw new OpsRefusal(
      64,
      `ops job run: job type ${typeId} is not in ${cataloguePath} at ${revision}`,
    );
  const capped = cappedClampOf(jobType);
  // Proof: dropping this refusal made `a cap entry with memoryGib clamped to the pool is refused
  // 64 before admission` (job-run.test.ts) admit and launch the job (2026-11-20, S25-A6).
  if (capped !== null)
    throw new OpsRefusal(64, `ops job run: ${capped} (${cataloguePath} at ${revision})`);
  try {
    parseJobArguments(jobType, argv.slice(1));
  } catch (cause) {
    throw new OpsRefusal(64, `ops job run: ${causeText(cause)} (${cataloguePath} at ${revision})`, {
      cause,
    });
  }
  return {
    jobType,
    descriptor: {
      id: jobType.id,
      envelope: jobType.envelope,
      containers: jobType.containers,
      enforcement: jobType.enforcement,
      // Proof: leaving it out made `a clamped gate holds the whole pool through ops job run`
      // (job-run.test.ts) find reserved memoryGib 2 of 3 (2026-11-20, S25-A7).
      ...(jobType.provenance.kind === 'calibrated' &&
      jobType.provenance.clampedToAllocatable !== undefined
        ? { clampedToAllocatable: [...jobType.provenance.clampedToAllocatable] }
        : {}),
    },
    checkout,
    revision,
    cataloguePath,
    descriptorDigest: descriptorDigestOf(jobType),
  };
}

/**
 * The commit `checkout` stands on now, or null when it has none: compared at the gate with the
 * revision whose catalogue admitted the job (review F9).
 */
export function currentHead(checkout: string): string | null {
  const head = git(checkout, 'rev-parse', '--verify', 'HEAD^{commit}');
  return head.exitCode === 0 ? head.stdout.trim() : null;
}

/**
 * The host class a run record names (J2, J9's partition): architecture, cores and whole GiB of
 * `MemTotal`, such as `linux-x64-8c-15g`.
 */
export function hostClassOf(host: HostFacts): string {
  return `linux-${arch()}-${String(host.cpuCores())}c-${String(Math.floor(host.memoryGib()))}g`;
}

/**
 * The toolchain a run record names (J9's partition): the version and revision of the `bun` the
 * payload finds first on its `PATH`, such as `bun 1.4.4+0d9b296a`, or `no bun on PATH`, which is
 * a toolchain too (slice 4 assumption S4-A2).
 * @throws OpsRefusal 70 when a `bun` is on `PATH` but does not answer `--revision`: a record
 * must not pin an unknown toolchain.
 */
export function toolchainOf(environment: Readonly<Record<string, string | undefined>>): string {
  const bun = Bun.which('bun', { PATH: environment['PATH'] ?? '' });
  if (bun === null) return 'no bun on PATH';
  const answer = Bun.spawnSync([bun, '--revision'], {
    env: { ...environment },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 30_000,
  });
  const revision = answer.stdout.toString('utf8').trim();
  // Proof: accepting any answer made `a bun that cannot name its revision refuses 70 before
  // anything is reserved` (calibrate.test.ts) run the job, no refusal (2026-11-02, Slice 4).
  if (answer.exitCode !== 0 || !/^\d+\.\d+\.\d+\S*$/.test(revision))
    throw new OpsRefusal(
      70,
      `${bun} --revision answered exit ${String(answer.exitCode)} ${JSON.stringify(revision.slice(0, 60))}; the run's toolchain is unknown`,
    );
  return `bun ${revision}`;
}

export type { JobType };

/**
 * The jobs of a catalogue file's parsed JSON, through Burokrat's contract: the one way `ops`
 * modules other than this one reach it.
 * @throws Error naming what the contract refused.
 */
export function parseCatalogueJobs(input: unknown): readonly JobType[] {
  return parseJobCatalogue(input).jobs;
}
