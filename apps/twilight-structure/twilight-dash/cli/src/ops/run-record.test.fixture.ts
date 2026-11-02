import { type CommittedCatalogue, descriptorDigestOf, parseCatalogueJobs } from './catalogue';
import { catalogueOf, type FixtureJobType } from './ops.test.fixture';
import type { ContainerVerdict, RunRecord, RunSample } from './run-records';

const GIB = 1024 ** 3;
export const CHECKOUT = '/srv/checkout';
export const CATALOGUE_PATH = `${CHECKOUT}/infra/jobs/catalogue.json`;
export const HOST_CLASS = 'linux-x64-8c-15g';
export const TOOLCHAIN = 'bun 1.4.4+38afee6c8';

/** A catalogue at a fixed revision, as `readCommittedCatalogue` would read it. */
export function committedCatalogue(
  types: readonly FixtureJobType[],
  edit: (jobs: ReturnType<typeof catalogueOf>['jobs']) => unknown[] = (jobs) => jobs,
): CommittedCatalogue {
  const raw = catalogueOf(types);
  return {
    checkout: CHECKOUT,
    revision: 'a'.repeat(40),
    cataloguePath: CATALOGUE_PATH,
    jobs: parseCatalogueJobs({ ...raw, jobs: edit(raw.jobs) }),
  };
}

/** What one synthetic run measured, and how it ended. */
export interface FixtureRun {
  id: string;
  type?: string;
  calibration?: boolean;
  memoryGib?: number;
  /** A steady CPU rate over the whole run. */
  cpuCores?: number;
  tmpGib?: number;
  seconds?: number;
  memoryHighEvents?: number;
  exitCode?: number;
  ended?: boolean;
  hostClass?: string;
  toolchain?: string | null;
  argumentProfile?: string;
  containers?: ContainerVerdict[];
  startedAt?: number;
}

/**
 * A run record of `run` as `HostJobRunRecords.inspect` returns it, admitted under the entry
 * `catalogue` names for its type: a gate sample, ten-second interval samples and an exit sample.
 */
export function runRecord(catalogue: CommittedCatalogue, run: FixtureRun): RunRecord {
  const type = run.type ?? 'gate';
  const jobType = catalogue.jobs.find((job) => job.id === type);
  if (jobType === undefined) throw new Error(`fixture catalogue has no ${type}`);
  const startedAt = run.startedAt ?? 1_800_000_000_000;
  const seconds = run.seconds ?? 30;
  const peak = Math.round((run.memoryGib ?? 1) * GIB);
  const tmp = Math.round((run.tmpGib ?? 0) * GIB);
  const ended = run.ended ?? true;
  const at = [
    0,
    ...Array.from({ length: Math.floor(seconds / 10) }, (_, index) => (index + 1) * 10),
  ];
  if (at.at(-1) !== seconds) at.push(seconds);
  const samples: RunSample[] = at.map((second, index) => ({
    kind: index === 0 ? 'gate' : index === at.length - 1 && ended ? 'exit' : 'interval',
    observedAt: startedAt + second * 1000,
    counters: {
      memoryPeak: index === 0 ? 0 : peak,
      memoryCurrent: 0,
      cpuUsageUsec: Math.round((run.cpuCores ?? 1) * second * 1_000_000),
      cpuUserUsec: 0,
      cpuSystemUsec: 0,
      pidsCurrent: 1,
      memoryHighEvents: index === 0 ? 0 : (run.memoryHighEvents ?? 0),
    },
    tmpBytes: index === 0 ? 0 : tmp,
    containers: null,
    failure: null,
  }));
  const containers = run.containers ?? [];
  return {
    jobId: run.id,
    type,
    label: 'lane:test',
    descriptor: {
      id: jobType.id,
      envelope: jobType.envelope,
      containers: jobType.containers,
      enforcement: jobType.enforcement,
    },
    descriptorDigest: descriptorDigestOf(jobType),
    cataloguePath: catalogue.cataloguePath,
    launcherSha: catalogue.revision,
    argumentProfile: run.argumentProfile ?? jobType.argumentProfile,
    argv: ['bin/payload.sh'],
    hostClass: run.hostClass ?? HOST_CLASS,
    ...(run.toolchain === null ? {} : { toolchain: run.toolchain ?? TOOLCHAIN }),
    ...(run.calibration === true ? { calibration: true as const } : {}),
    unit: `dash-job-${run.id}`,
    cgroup: `/user.slice/dash-job-${run.id}.scope`,
    tmpDirectory: `/managed/${run.id}`,
    units: [],
    startedAt,
    endedAt: ended ? startedAt + seconds * 1000 : null,
    exitCode: ended ? (run.exitCode ?? 0) : null,
    signal: null,
    telemetryFailure: null,
    ledgerFailure: null,
    attributionIncomplete: containers.some((container) => container.verdict !== 'bounded'),
    containers,
    peakMemoryBytes: peak,
    peakTmpBytes: tmp,
    wallMs: ended ? seconds * 1000 : null,
    samples,
  };
}
