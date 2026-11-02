import {
  argument,
  command,
  constant,
  formatUsage,
  type InferValue,
  integer,
  message,
  multiple,
  object,
  option,
  optional,
  or,
  type Parser,
  passThrough,
  string,
  text,
  withDefault,
} from '@optique/core';
import { run } from '@optique/run';

const programName = 'twilight-dash';

/**
 * A command line Dash refuses before any handler runs. Its message is the one line the
 * entrypoint prints after `error: `.
 */
export class UsageRefusal extends Error {
  override readonly name = 'UsageRefusal';
}

/**
 * A flag value: non-empty and not itself a flag, as the hand-written loop required.
 * Proof: dropping `pattern` made `refuses a valueless or empty flag before planning` receive no
 * refusal for `--known-hosts-sha256 ''` (2026-11-01).
 */
const flagValue = (metavar: 'PATH' | 'NAME' | 'SHA256') =>
  string({ metavar, pattern: /^(?!--)[\s\S]+$/u });

/** One required `plan-enrollment` flag, refusing in the wording the hand-written loop used. */
function enrollmentFlag(name: `--${string}`, metavar: 'PATH' | 'NAME' | 'SHA256') {
  return option(name, flagValue(metavar), {
    errors: {
      duplicate: [text(`Duplicate Dash flag: ${name}`)],
      endOfInput: [text(`Dash flag has no value: ${name}`)],
      invalidValue: [text(`Dash flag has no value: ${name}`)],
      missing: [text(`Missing required Dash flag: ${name}`)],
    },
  });
}

const planEnrollment = command(
  'plan-enrollment',
  object({
    command: constant('plan-enrollment'),
    fleet: enrollmentFlag('--fleet', 'PATH'),
    observation: enrollmentFlag('--observation', 'PATH'),
    output: enrollmentFlag('--output', 'PATH'),
    node: enrollmentFlag('--node', 'NAME'),
    cluster: enrollmentFlag('--cluster', 'NAME'),
    inventorySha256: enrollmentFlag('--inventory-sha256', 'SHA256'),
    ansibleVariablesSha256: enrollmentFlag('--ansible-variables-sha256', 'SHA256'),
    knownHostsSha256: enrollmentFlag('--known-hosts-sha256', 'SHA256'),
  }),
  { brief: message`Delegate enrollment planning to the fleet planner; plans, never applies.` },
);

/**
 * The grammar each delegated command's module documents: the tail of that module's usage line
 * after the command words, shown by `help <command>`. `cli.test.ts` compares each with the
 * module's exported usage, so a module grammar changed alone fails a test.
 */
export const delegatedGrammars = {
  'bootstrap-authority': '<repository>',
  'inspect-authority': '<repository> [--session <id>]',
  'recover-publication': '<repository> --integration-id <id>',
  'submit-admission': '<repository> <packet-json> <staged|committed> <revision-or-base>',
  'render-observation-units': '<layout.json> <new-dir>',
  'run-activation-checks':
    '--candidate-repository <checkout> --candidate-sha <40-hex sha> --candidate-policy <committed path> --check-runs <new directory>',
  'bootstrap-observation': '<service.json>',
  'migrate-observation': '<service.json>',
  'record-progress': '--entries <path> --plan-reference <path> --tasks <path> --output <path>',
  'record-progress-v2': '--entries <path> --plan-reference <path> --tasks <path> --output <path>',
  'account-outcomes':
    '--repository <path> --since <instant> --until <instant> --rate-card <path> --output <new-dir> [--claude-projects <dir>]... [--codex-sessions <dir>]...',
  'report-capacity': '--config <owner-only file>',
  resources:
    'init|create|exec|run|inspect|cleanup|sweep|sync|watch --config <path> [flags] [-- <command>...]',
  'mcp token':
    '--resource <url> (--key-file <path> | --assertion-file <path> | --github-actions-audience <audience>) [--run <id>]',
  'pool import': '<pool-keys.json> --store <directory>',
} as const;

type DelegatedWords = keyof typeof delegatedGrammars;

function described(words: DelegatedWords, brief: string) {
  return {
    brief: [text(brief)],
    description: [text(`${brief} Arguments: ${delegatedGrammars[words]}`)],
  };
}

/**
 * A command whose module parses its own arguments: the tokens after its name reach that module
 * verbatim, so its grammar and refusal wording stay where they are documented and tested.
 */
function delegated<const Name extends DelegatedWords>(name: Name, brief: string) {
  return command(
    name,
    object({ command: constant(name), argv: passThrough({ format: 'greedy' }) }),
    described(name, brief),
  );
}

/** `mcp token` and `pool import`: a namespace word, then a delegated command. */
function namespaced<const Space extends string, const Name extends string>(
  space: Space,
  name: Name,
  words: DelegatedWords & `${Space} ${Name}`,
  brief: string,
) {
  return command(
    space,
    command(
      name,
      object({
        command: constant(space),
        subcommand: constant(name),
        argv: passThrough({ format: 'greedy' }),
      }),
      described(words, brief),
    ),
    { brief: [text(brief)] },
  );
}

/** The commands `cli.ts`'s `runDash` dispatches. */
const dispatchedCommands = [
  planEnrollment,
  delegated(
    'bootstrap-authority',
    'Create the repository authority; the only command that creates one.',
  ),
  delegated('inspect-authority', 'Print the authority state, read-only.'),
  delegated('recover-publication', 'Finish an interrupted publication from its durable record.'),
  delegated(
    'submit-admission',
    "Freeze a bound packet's candidate and print its submission report.",
  ),
  delegated(
    'render-observation-units',
    'Render the uninstalled observation service units into a new directory.',
  ),
  delegated(
    'run-activation-checks',
    "Run a candidate's activation checks and write the CheckRun ledger.",
  ),
  delegated('bootstrap-observation', 'Create the observation store.'),
  delegated('migrate-observation', 'Migrate the observation store to v10.'),
  delegated('record-progress', 'Record operator progress assertions as a receipt.'),
  delegated('record-progress-v2', 'Record operator progress assertions as a plan-bound receipt.'),
  delegated('account-outcomes', "Write the period's efficiency breakdown from harness logs."),
  delegated('report-capacity', 'Measure each bound resource and report it to WBS until a refusal.'),
  delegated('resources', 'Manage disposable directories, worktrees and their commands.'),
] as const;

/** The commands `entrypoint.ts` dispatches before it loads `cli.ts`. */
const entrypointCommands = [
  namespaced(
    'mcp',
    'token',
    'mcp token',
    "Print a fresh WBS MCP bearer as a header map for Claude Code's headersHelper.",
  ),
  namespaced('pool', 'import', 'pool import', "Store an agent pool's keys for mcp token."),
] as const;

/** `--config`, the owner-only host pool configuration every `ops` command names. */
const poolConfig = () =>
  option('--config', flagValue('PATH'), {
    description: message`The owner-only host pool configuration (resource configuration schema 3).`,
  });

/** `--type`, the job type as the checkout's catalogue at HEAD names it. */
const jobTypeOption = () =>
  option('--type', flagValue('NAME'), {
    description: message`The job type, as the checkout's infra/jobs/catalogue.json at HEAD names it.`,
  });

/** The admission and payload fields `ops job run` and `ops job calibrate` share (J7, J9). */
const launchFields = (label: string, waitSeconds: number) => ({
  config: poolConfig(),
  type: jobTypeOption(),
  label: withDefault(
    option('--label', flagValue('NAME'), {
      description: message`The lane label status and refusals name, as HEAVY_LOCK_LABEL is; default ${label}.`,
    }),
    label,
  ),
  waitSeconds: withDefault(
    option('--wait-seconds', integer({ min: 0, metavar: 'SECONDS' }), {
      description:
        waitSeconds === 0
          ? message`How long to wait for room; 0 (the default) refuses 75 while anyone is ahead.`
          : message`How long to wait for the pool to drain; default ${String(waitSeconds)}, then 75.`,
    }),
    waitSeconds,
  ),
  pollSeconds: withDefault(
    option('--poll-seconds', integer({ min: 1, max: 30, metavar: 'SECONDS' }), {
      description: message`Seconds between admission polls, 1 to 30; default 5.`,
    }),
    5,
  ),
  argv: multiple(
    argument(string({ metavar: 'COMMAND' }), {
      description: message`The payload, after --: its program, then arguments matching the type's argument profile.`,
    }),
    { min: 1 },
  ),
});

/** One `ops` command: its words after `ops` are its discriminant in `src/ops/commands.ts`. */
function opsCommand<const Words extends string, const Fields extends Record<string, Parser>>(
  name: string,
  words: Words,
  brief: string,
  fields: Fields,
) {
  return command(name, object({ command: constant('ops'), words: constant(words), ...fields }), {
    brief: [text(brief)],
  });
}

/**
 * `ops`, the first typed namespace (`dash-host-jobs` J17): host jobs and the host pool. The
 * grammar is parsed here, not in its module, because it has no hand-written parser to keep.
 * `switch-mode` arrives with slice 6.
 */
const opsNamespace = command(
  'ops',
  or(
    command(
      'job',
      or(
        opsCommand(
          'run',
          'job run',
          'Admit a host job from the host pool, run it measured in its own scope, settle it.',
          launchFields('unlabeled', 0),
        ),
        opsCommand(
          'calibrate',
          'job calibrate',
          'Wait for the pool to drain, hold all of it, run the job unbounded and record a calibration.',
          launchFields('calibration', 7200),
        ),
        opsCommand(
          'propose',
          'job propose',
          'Print a catalogue patch for a job type from its run records; write nothing.',
          {
            config: poolConfig(),
            type: jobTypeOption(),
            hostClass: optional(
              option('--host-class', flagValue('NAME'), {
                description: message`The host class to propose for; default this host's.`,
              }),
            ),
            toolchain: optional(
              option('--toolchain', flagValue('NAME'), {
                description: message`The toolchain to propose for, as run records name it; default the bun on PATH.`,
              }),
            ),
          },
        ),
        opsCommand(
          'audit',
          'job audit',
          'Name every envelope drift in the run records; exit 1 on any, print no drift otherwise.',
          {
            config: poolConfig(),
            now: optional(
              option('--now', flagValue('NAME'), {
                description: message`The ISO-8601 UTC instant estimates are judged at; default now.`,
              }),
            ),
          },
        ),
        opsCommand(
          'render-audit-units',
          'job render-audit-units',
          'Write the weekly systemd user timer and service for ops job audit; install nothing.',
          {
            config: poolConfig(),
            bun: option('--bun', flagValue('PATH'), {
              description: message`The bun the service runs Dash with.`,
            }),
            dash: option('--dash', flagValue('PATH'), {
              description: message`Dash's entrypoint.`,
            }),
            checkout: option('--checkout', flagValue('PATH'), {
              description: message`The checkout whose catalogue the audit judges; its working directory.`,
            }),
            outputDirectory: option('--output-directory', flagValue('PATH'), {
              description: message`Where to write the two unit files; neither may exist.`,
            }),
          },
        ),
        opsCommand(
          'status',
          'job status',
          'Print the running host jobs, then the waiters oldest first.',
          { config: poolConfig() },
        ),
      ),
      { brief: message`Run and inspect host jobs.` },
    ),
    command(
      'pool',
      or(
        opsCommand(
          'init',
          'pool init',
          'Initialize the host pool: the resource ledger and its run records.',
          { config: poolConfig() },
        ),
        opsCommand(
          'inspect',
          'pool inspect',
          'Print the host pool as JSON: mode, budgets, reservations, jobs and waiters.',
          { config: poolConfig() },
        ),
      ),
      { brief: message`Initialize and inspect the host pool.` },
    ),
  ),
  { brief: message`Operate this host: host jobs and the host pool.` },
);

const commands = [...dispatchedCommands, opsNamespace, ...entrypointCommands];

/**
 * Every Dash command line: one `command` per Dash command, help and completion added by `run`.
 * Nested because `or` takes at most fifteen parsers.
 */
export const dashParser = or(or(...dispatchedCommands), opsNamespace, ...entrypointCommands);

/** A parsed Dash command line, discriminated by `command`. */
export type DashCommand = InferValue<typeof dashParser>;

/** What one invocation did: a command to dispatch, or help or a completion script printed. */
export type DashInvocation =
  { readonly kind: 'command'; readonly command: DashCommand } | { readonly kind: 'printed' };

/** The usage line of one Dash command, or undefined when `name` names none. */
function usageOf(name: string): string | undefined {
  const parser = commands.find((candidate) =>
    candidate.usage.some((term) => term.type === 'command' && term.name === name),
  );
  if (parser === undefined) return undefined;
  return `usage: ${formatUsage(programName, parser.usage, { colors: false })}`;
}

/**
 * One refusal line from Optique's error text, which `help <unknown>` prefixes with the whole
 * usage, so only the text after its last `Error: ` is the reason. An argv whose first word names
 * no Dash command refuses `Unsupported Dash command: <word>`; any other refusal starts with that
 * command's usage.
 */
function refusalOf(args: readonly string[], errorText: string): string {
  const marker = errorText.lastIndexOf('Error: ');
  const reason = (marker < 0 ? errorText : errorText.slice(marker + 'Error: '.length))
    .replace(/\s+/gu, ' ')
    .trim();
  const name = args.at(0);
  // Proof: returning `reason` unmapped here failed `the installed entrypoint refuses an apply
  // command` with Optique's "Unexpected option or subcommand: `apply`." (2026-11-01).
  if (name === 'help' || name === 'completion') {
    // `completion` without a shell follows its first sentence with its whole help page.
    // Proof: returning `reason` whole here failed `completion without a shell refuses in one
    // short line` with the help page in the line (2026-11-01).
    const brief = reason.includes('Usage:') ? /^[^.]*\./u.exec(reason)?.[0] : undefined;
    return `usage: ${programName} ${name} (${brief ?? reason})`;
  }
  const usage = name === undefined ? undefined : usageOf(name);
  if (usage === undefined) return `Unsupported Dash command: ${String(name)}`;
  return `${usage.replace(/\s+/gu, ' ')} (${reason})`;
}

/** The exit that ends `run` after it printed help or a completion script; never escapes. */
class Printed extends Error {
  override readonly name = 'Printed';
}

/**
 * Parses one Dash command line through Optique's `run`, with every sink injected: help and
 * completion scripts go to `stdout` and return `{ kind: 'printed' }`; a refusal throws {@link UsageRefusal}
 * and writes nothing. Never calls `process.exit`.
 *
 * @throws UsageRefusal with one line: `Unsupported Dash command: <name>` or `usage: …`.
 */
export function readDashInvocation(
  args: readonly string[],
  stdout: (text: string) => void,
): DashInvocation {
  let errorText = '';
  try {
    const parsed = run(dashParser, {
      programName,
      args,
      stdout,
      stderr: (chunk) => {
        errorText += chunk;
      },
      // Proof: dropping `onExit` let `run` call `process.exit(1)`, so `the installed entrypoint
      // refuses an apply command` saw empty stderr instead of one `error:` line (2026-11-01).
      onExit: (code) => {
        throw code === 0 ? new Printed() : new UsageRefusal(refusalOf(args, errorText));
      },
      // The two byte-stability knobs: without them `run` reads the terminal's colour support and
      // width (`process.stdout.columns`, `COLUMNS`), so help and refusals would vary per terminal.
      // Proof: dropping `maxWidth` failed `help parity holds under COLUMNS=30`: the help printed
      // under `COLUMNS=30` differed from the in-process bytes (2026-11-01).
      colors: false,
      maxWidth: 120,
      aboveError: 'none',
      help: 'both',
      completion: 'command',
    });
    return { kind: 'command', command: parsed };
  } catch (cause) {
    if (cause instanceof Printed) return { kind: 'printed' };
    throw cause;
  }
}

/**
 * Parses a command line that must name a command, for programmatic callers such as tests.
 *
 * @throws UsageRefusal on any refusal, and when the line asks only for help or completion.
 */
export function parseDashCommand(args: readonly string[]): DashCommand {
  const invocation = readDashInvocation(args, () => undefined);
  if (invocation.kind === 'printed') {
    throw new UsageRefusal(`${args.join(' ')} prints help or completion, not a command`);
  }
  return invocation.command;
}
