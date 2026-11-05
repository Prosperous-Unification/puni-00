import type { DashCommand, ReleaseCommand } from '../cli-parser';
import type { Monotonic, WallClock } from '../clock';
import {
  legacyHoldDirectory,
  type LegacyLock,
  type LegacyQueueStatus,
  readLegacyQueue,
} from '../resources/legacy-lock';
import {
  type HostFacts,
  type HostPoolStatus,
  loadResourceConfiguration,
  ResourceRuntime,
} from '../resources/runtime';
import { auditDrift } from './audit';
import { renderAuditUnits, writeAuditUnits } from './audit-units';
import { hostClassOf, readCommittedCatalogue, toolchainOf } from './catalogue';
import { calibrateHostJob, type JobRunDependencies, runHostJob } from './job-run';
import { proposeEnvelope } from './propose';
import { causeText, OpsRefusal } from './refusal';
import { HostJobRunRecords } from './run-records';
import type { ScopeTelemetry } from './scope';
import { formatHostPoolStatus } from './status';
import { checkEligibleTypes, switchPoolMode } from './switch-mode';

/** A parsed host-job or pool command line, discriminated by its words after `ops`. */
export type OpsCommand = Exclude<Extract<DashCommand, { readonly command: 'ops' }>, ReleaseCommand>;

/** Everything the `ops` commands reach outside their arguments, composed by `cli.ts`. */
export interface OpsDependencies {
  readonly clock: WallClock;
  readonly monotonic: Monotonic;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly cwd: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly telemetry: ScopeTelemetry;
  readonly host: HostFacts;
  readonly user: string;
  /** The shell lock (J12), resolved only by the commands that take or read it. */
  readonly legacyLock: () => LegacyLock;
}

/**
 * The shell lock, or a refusal naming why it cannot be found.
 * @throws OpsRefusal 70 when the library is missing or answers no path.
 */
function resolveLegacyLock(deps: OpsDependencies, command: string): LegacyLock {
  try {
    return deps.legacyLock();
  } catch (cause) {
    throw new OpsRefusal(70, `${command}: ${causeText(cause)}`, { cause });
  }
}

/**
 * The shell lock's queue while it matters to the pool (J13): in observe mode, or in concurrent
 * mode under the guard; null once the guard is released, when no Dash job takes it.
 * @throws OpsRefusal 70 when the queue cannot be read: unknown is never reported as empty.
 */
function legacyQueueOf(
  status: HostPoolStatus,
  deps: OpsDependencies,
  command: string,
): LegacyQueueStatus | null {
  if (status.mode === 'concurrent' && status.guard === 'released') return null;
  try {
    return readLegacyQueue(resolveLegacyLock(deps, command));
  } catch (cause) {
    if (cause instanceof OpsRefusal) throw cause;
    throw new OpsRefusal(70, `${command}: ${causeText(cause)}`, { cause });
  }
}

type OpsHandlers = {
  readonly [Words in OpsCommand['words']]: (
    command: Extract<OpsCommand, { readonly words: Words }>,
    deps: OpsDependencies,
  ) => Promise<number> | number;
};

function openPool(config: string, clock: WallClock, command: string): ResourceRuntime {
  let runtime: ResourceRuntime;
  try {
    runtime = ResourceRuntime.open(loadResourceConfiguration(config), clock);
  } catch (cause) {
    throw new OpsRefusal(70, `host pool ${config} unusable: ${causeText(cause)}`, { cause });
  }
  try {
    checkEligibleTypes(runtime.configuration, command);
  } catch (cause) {
    runtime.close();
    throw cause;
  }
  return runtime;
}

/** What `ops job run` and `ops job calibrate` reach, from the `ops` dependencies. */
function launcherDependencies(deps: OpsDependencies): JobRunDependencies {
  return {
    clock: deps.clock,
    monotonic: deps.monotonic,
    environment: deps.environment,
    cwd: deps.cwd,
    report: (line) => {
      deps.stderr(`${line}\n`);
    },
    telemetry: deps.telemetry,
    host: deps.host,
    sampleIntervalMs: 10_000,
    settleBudgetMs: 30_000,
    user: deps.user,
    legacyLock: resolveLegacyLock(deps, 'ops job run'),
  };
}

/**
 * Every run record of the pool at `config`, read without creating anything.
 * @throws OpsRefusal 70 when the pool or its run records are unusable.
 */
function readRunRecords(config: string, deps: OpsDependencies, command: string) {
  const runtime = openPool(config, deps.clock, command);
  try {
    const records = HostJobRunRecords.openForReading(runtime.configuration.root);
    try {
      return records.list();
    } finally {
      records.close();
    }
  } catch (cause) {
    throw new OpsRefusal(70, `${command}: ${causeText(cause)}`, { cause });
  } finally {
    runtime.close();
  }
}

/**
 * The instant `--now` names, or the injected clock's.
 * @throws OpsRefusal 64 when `--now` is not an ISO-8601 UTC instant.
 */
function auditInstant(now: string | undefined, clock: WallClock): number {
  if (now === undefined) return clock.read();
  const instant = Date.parse(now);
  // Proof: without the pattern `--now must be an ISO instant` (calibrate.test.ts) exited 0,
  // not 64, for `tomorrow`; without `isFinite` it threw `RangeError: Invalid Date` for
  // `2026-13-45T00:00:00Z`; without the round trip it exited 0 for `2026-02-30T00:00:00Z`
  // (2026-11-02, review A13).
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(now) ||
    !Number.isFinite(instant) ||
    new Date(instant).toISOString().slice(0, 19) !== now.slice(0, 19)
  )
    throw new OpsRefusal(
      64,
      `ops job audit: --now ${JSON.stringify(now)} is not an ISO-8601 UTC instant`,
    );
  return instant;
}

/**
 * One handler per `ops` command, keyed by its words after `ops`; each returns its exit code.
 * `cli.test.ts` holds this table equal to the parser's `ops` commands.
 */
export const opsHandlers: OpsHandlers = {
  'job run': (command, deps) => runHostJob(command, launcherDependencies(deps)),
  'job calibrate': (command, deps) => calibrateHostJob(command, launcherDependencies(deps)),
  'job propose': (command, deps) => {
    const catalogue = readCommittedCatalogue(deps.cwd, 'ops job propose');
    const jobType = catalogue.jobs.find((job) => job.id === command.type);
    // Proof: without it `propose refuses … an uncatalogued type` (calibrate.test.ts) threw from
    // `proposeEnvelope` instead of refusing 64 (2026-11-02, Slice 4 review A13).
    if (jobType === undefined)
      throw new OpsRefusal(
        64,
        `ops job propose: job type ${command.type} is not in ${catalogue.cataloguePath} at ${catalogue.revision}`,
      );
    const records = readRunRecords(command.config, deps, 'ops job propose');
    const proposal = proposeEnvelope(
      command.type,
      catalogue,
      records,
      {
        argumentProfile: jobType.argumentProfile,
        hostClass: command.hostClass ?? hostClassOf(deps.host),
        toolchain: command.toolchain ?? toolchainOf(deps.environment),
      },
      deps.clock.read(),
    );
    for (const line of proposal.lines) deps.stdout(`${line}\n`);
    if (proposal.kind === 'refused') {
      deps.stderr(`error: ${proposal.reason}\n`);
      return 1;
    }
    deps.stdout(`${JSON.stringify(proposal.entry, null, 2)}\n`);
    return 0;
  },
  'job audit': (command, deps) => {
    const now = auditInstant(command.now, deps.clock);
    const records = readRunRecords(command.config, deps, 'ops job audit');
    // Every record is judged against this checkout's catalogue by job id, never by re-reading
    // the checkout it ran from, which may be a deleted scratch worktree (S4-A8, review A2).
    // Proof: reading each record's own checkout made `a run from a vanished checkout is judged
    // against this checkout` (calibrate.test.ts) refuse 64 naming the vanished path (2026-11-02).
    const catalogue = readCommittedCatalogue(deps.cwd, 'ops job audit');
    const { drifts, notes } = auditDrift(records, catalogue, now);
    for (const note of notes) deps.stdout(`note: ${note}\n`);
    if (drifts.length === 0) {
      deps.stdout('no drift\n');
      return 0;
    }
    for (const drift of drifts) deps.stdout(`${drift.line}\n`);
    return 1;
  },
  'job render-audit-units': (command, deps) => {
    const written = writeAuditUnits(
      command.outputDirectory,
      renderAuditUnits({
        bun: command.bun,
        dash: command.dash,
        config: command.config,
        checkout: command.checkout,
      }),
    );
    for (const path of written) deps.stdout(`${path}\n`);
    return 0;
  },
  'job admission': (command, deps) => {
    const runtime = openPool(command.config, deps.clock, 'ops job admission');
    try {
      deps.stdout(
        `${JSON.stringify({ job: command.job, ...runtime.hostJobRunning(command.job) })}\n`,
      );
      return 0;
    } finally {
      runtime.close();
    }
  },
  'job status': (command, deps) => {
    const runtime = openPool(command.config, deps.clock, 'ops job status');
    try {
      const status = runtime.hostPoolStatus();
      let records: HostJobRunRecords;
      try {
        records = HostJobRunRecords.openForReading(runtime.configuration.root);
      } catch (cause) {
        // Proof: opening for writing here made `status refuses 70 when the run records are
        // missing, creating nothing` (status.test.ts) create them and exit 0 (2026-11-02, F7).
        throw new OpsRefusal(70, `ops job status: ${causeText(cause)}`, { cause });
      }
      try {
        const peaks = new Map(
          status.jobs.map((job) => [job.id, records.inspect(job.id)?.peakMemoryBytes ?? null]),
        );
        const legacy = legacyQueueOf(status, deps, 'ops job status');
        for (const line of formatHostPoolStatus(
          status,
          peaks,
          deps.clock.read(),
          legacy,
          legacyHoldDirectory(runtime.configuration.root),
        ))
          deps.stdout(`${line}\n`);
      } finally {
        records.close();
      }
      return 0;
    } finally {
      runtime.close();
    }
  },
  'pool init': (command, deps) => {
    let runtime: ResourceRuntime;
    let configuration;
    try {
      configuration = loadResourceConfiguration(command.config);
    } catch (cause) {
      throw new OpsRefusal(70, `host pool ${command.config} not initialized: ${causeText(cause)}`, {
        cause,
      });
    }
    // An eligible id no launcher checkout catalogues is refused before anything is created.
    // Proof: without it `ops pool init refuses an eligible type no catalogue names`
    // (host-pool-mode.test.ts) initialized the pool (2026-11-02, Slice 6b).
    checkEligibleTypes(configuration, 'ops pool init', true);
    try {
      runtime = ResourceRuntime.initialize(configuration, deps.clock, deps.host);
    } catch (cause) {
      throw new OpsRefusal(70, `host pool ${command.config} not initialized: ${causeText(cause)}`, {
        cause,
      });
    }
    try {
      HostJobRunRecords.open(runtime.configuration.root, false).close();
      const status = runtime.hostPoolStatus();
      deps.stdout(
        `${JSON.stringify({
          initialized: true,
          root: runtime.configuration.root,
          enrollmentId: status.enrollmentId,
          mode: status.mode,
          guard: status.guard,
          concurrencyEligible: runtime.configuration.concurrencyEligible ?? [],
          allocatable: status.allocatable,
          units: status.units,
          runRecords: HostJobRunRecords.pathOf(runtime.configuration.root),
        })}\n`,
      );
      return 0;
    } finally {
      runtime.close();
    }
  },
  'pool inspect': (command, deps) => {
    const runtime = openPool(command.config, deps.clock, 'ops pool inspect');
    try {
      const status = runtime.hostPoolStatus();
      const legacy = legacyQueueOf(status, deps, 'ops pool inspect');
      deps.stdout(
        `${JSON.stringify({
          ...status,
          concurrencyEligible: runtime.configuration.concurrencyEligible ?? [],
          launcherCheckouts: runtime.configuration.launcherCheckouts ?? [],
          legacyLock: legacy === null ? null : { holder: legacy.holder, waiters: legacy.waiters },
        })}\n`,
      );
      return 0;
    } finally {
      runtime.close();
    }
  },
  'pool switch-mode': async (command, deps) => {
    const runtime = openPool(command.config, deps.clock, 'ops pool switch-mode');
    try {
      const record = await switchPoolMode(
        runtime,
        {
          target: command.target,
          operator: command.operator,
          waitSeconds: command.waitSeconds,
          pollSeconds: command.pollSeconds,
          releaseGuard: command.releaseGuard,
          allowEmpty: command.allowEmpty,
        },
        {
          now: () => deps.clock.read(),
          environment: deps.environment,
          legacyLock: resolveLegacyLock(deps, 'ops pool switch-mode'),
          account: deps.user,
          report: (line) => {
            deps.stderr(`${line}\n`);
          },
        },
      );
      deps.stdout(`${JSON.stringify(record)}\n`);
      return 0;
    } finally {
      runtime.close();
    }
  },
};

/**
 * Run one `ops` command and return its exit code. A refusal prints one `error: ` line on
 * stderr and returns its code (J13); anything else thrown reaches the entrypoint, exit 1.
 * @throws Error `Unsupported Dash command: ops <words>` for words no handler takes, which only a
 * JavaScript caller bypassing the parser can pass.
 */
export async function runOps(command: OpsCommand, deps: OpsDependencies): Promise<number> {
  const words: string = command.words;
  // Proof: deleting this guard made `runOps refuses ops words no handler takes` (cli.test.ts)
  // throw a TypeError calling undefined (2026-11-01, Slice 3).
  if (!Object.hasOwn(opsHandlers, words)) throw new Error(`Unsupported Dash command: ops ${words}`);
  // The table is keyed by the same union member that selected the handler, a pairing TypeScript
  // cannot follow through an indexed access; the mapped type above checks each entry.
  const handler = opsHandlers[command.words] as (
    command: OpsCommand,
    deps: OpsDependencies,
  ) => Promise<number> | number;
  try {
    return await handler(command, deps);
  } catch (cause) {
    if (!(cause instanceof OpsRefusal)) throw cause;
    deps.stderr(`error: ${cause.message}\n`);
    return cause.exitCode;
  }
}
