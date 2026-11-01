import type { DashCommand } from '../cli-parser';
import type { Monotonic, WallClock } from '../clock';
import { type HostFacts, loadResourceConfiguration, ResourceRuntime } from '../resources/runtime';
import { runHostJob } from './job-run';
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

/**
 * One handler per `ops` command, keyed by its words after `ops`; each returns its exit code.
 * `cli.test.ts` holds this table equal to the parser's `ops` commands.
 */
export const opsHandlers: OpsHandlers = {
  'job run': (command, deps) =>
    runHostJob(command, {
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
    }),
  'job status': (command, deps) => {
    const runtime = openPool(command.config, deps.clock);
    try {
      const status = runtime.hostPoolStatus();
      const records = HostJobRunRecords.open(
        runtime.configuration.root,
        runtime.listHostJobs().length > 0,
      );
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
