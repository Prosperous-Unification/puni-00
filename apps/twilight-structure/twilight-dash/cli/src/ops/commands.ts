import type { DashCommand } from '../cli-parser';
import type { Monotonic, WallClock } from '../clock';
import { type HostFacts, loadResourceConfiguration, ResourceRuntime } from '../resources/runtime';
import { auditDrift } from './audit';
import { renderAuditUnits, writeAuditUnits } from './audit-units';
import {
  checkoutOfCatalogue,
  type CommittedCatalogue,
  hostClassOf,
  readCommittedCatalogue,
  toolchainOf,
} from './catalogue';
import { calibrateHostJob, type JobRunDependencies, runHostJob } from './job-run';
import { proposeEnvelope } from './propose';
import { causeText, OpsRefusal } from './refusal';
import { HostJobRunRecords } from './run-records';
import type { ScopeTelemetry } from './scope';
import { formatHostPoolStatus } from './status';

/** A parsed `ops` command line, discriminated by its words after `ops`. */
export type OpsCommand = Extract<DashCommand, { readonly command: 'ops' }>;

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
}

type OpsHandlers = {
  readonly [Words in OpsCommand['words']]: (
    command: Extract<OpsCommand, { readonly words: Words }>,
    deps: OpsDependencies,
  ) => Promise<number> | number;
};

function openPool(config: string, clock: WallClock): ResourceRuntime {
  try {
    return ResourceRuntime.open(loadResourceConfiguration(config), clock);
  } catch (cause) {
    throw new OpsRefusal(70, `host pool ${config} unusable: ${causeText(cause)}`, { cause });
  }
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
  };
}

/**
 * Every run record of the pool at `config`, read without creating anything.
 * @throws OpsRefusal 70 when the pool or its run records are unusable.
 */
function readRunRecords(config: string, deps: OpsDependencies, command: string) {
  const runtime = openPool(config, deps.clock);
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
  // Proof: without it `--now must be an ISO instant` (calibrate.test.ts) exited 0, not 64:
  // `tomorrow` became NaN and nothing expired (2026-11-02, Slice 4).
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(now) || !Number.isFinite(instant))
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
    const catalogues = new Map<string, CommittedCatalogue>();
    const own = readCommittedCatalogue(deps.cwd, 'ops job audit');
    catalogues.set(own.cataloguePath, own);
    for (const record of records) {
      if (catalogues.has(record.cataloguePath)) continue;
      const catalogue = readCommittedCatalogue(
        checkoutOfCatalogue(record.cataloguePath),
        'ops job audit',
      );
      catalogues.set(record.cataloguePath, catalogue);
    }
    const { drifts, notes } = auditDrift(records, catalogues, now);
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
  'job status': (command, deps) => {
    const runtime = openPool(command.config, deps.clock);
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
        for (const line of formatHostPoolStatus(status, peaks, deps.clock.read()))
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
    try {
      runtime = ResourceRuntime.initialize(
        loadResourceConfiguration(command.config),
        deps.clock,
        deps.host,
      );
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
    const runtime = openPool(command.config, deps.clock);
    try {
      deps.stdout(`${JSON.stringify(runtime.hostPoolStatus())}\n`);
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
