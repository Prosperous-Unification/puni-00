import {
  command,
  constant,
  formatUsage,
  type InferValue,
  message,
  object,
  option,
  or,
  passThrough,
  string,
  text,
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
 * A command whose module parses its own arguments: the tokens after its name reach that module
 * verbatim, so its grammar and refusal wording stay where they are documented and tested.
 */
function delegated<const Name extends string>(name: Name, brief: string, grammar: string) {
  return command(
    name,
    object({ command: constant(name), argv: passThrough({ format: 'greedy' }) }),
    { brief: [text(brief)], description: [text(`${brief} Arguments: ${grammar}`)] },
  );
}

/** `mcp token` and `pool import`: a namespace word, then a delegated command. */
function namespaced<const Space extends string, const Name extends string>(
  space: Space,
  name: Name,
  brief: string,
  grammar: string,
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
      { brief: [text(brief)], description: [text(`${brief} Arguments: ${grammar}`)] },
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
    '<repository>',
  ),
  delegated(
    'inspect-authority',
    'Print the authority state, read-only.',
    '<repository> [--session <id>]',
  ),
  delegated(
    'recover-publication',
    'Finish an interrupted publication from its durable record.',
    '<repository> --integration-id <id>',
  ),
  delegated(
    'submit-admission',
    "Freeze a bound packet's candidate and print its submission report.",
    '<repository> <packet-json> <staged|committed> <revision-or-base>',
  ),
  delegated(
    'render-observation-units',
    'Render the uninstalled observation service units into a new directory.',
    '<layout.json> <new-dir>',
  ),
  delegated(
    'run-activation-checks',
    "Run a candidate's activation checks and write the CheckRun ledger.",
    '--candidate-repository <checkout> --candidate-sha <sha> --candidate-policy <path> --check-runs <new-dir>',
  ),
  delegated('bootstrap-observation', 'Create the observation store.', '<service.json>'),
  delegated('migrate-observation', 'Migrate the observation store to v10.', '<service.json>'),
  delegated(
    'record-progress',
    'Record operator progress assertions as a receipt.',
    '--entries <path> --plan-reference <path> --tasks <path> --output <path>',
  ),
  delegated(
    'record-progress-v2',
    'Record operator progress assertions as a plan-bound receipt.',
    '--entries <path> --plan-reference <path> --tasks <path> --output <path>',
  ),
  delegated(
    'account-outcomes',
    "Write the period's efficiency breakdown from harness logs.",
    '--repository <path> --since <instant> --until <instant> --rate-card <path> --output <new-dir> [--claude-projects <dir>]... [--codex-sessions <dir>]...',
  ),
  delegated(
    'report-capacity',
    'Measure each bound resource and report it to WBS until a refusal.',
    '--config <owner-only file>',
  ),
  delegated(
    'resources',
    'Manage disposable directories, worktrees and their commands.',
    'init|create|exec|run|inspect|cleanup|sweep|sync|watch --config <path> [flags] [-- <command>...]',
  ),
] as const;

/** The commands `entrypoint.ts` dispatches before it loads `cli.ts`. */
const entrypointCommands = [
  namespaced(
    'mcp',
    'token',
    "Print a fresh WBS MCP bearer as a header map for Claude Code's headersHelper.",
    '--resource <url> (--key-file <path> | --assertion-file <path> | --github-actions-audience <aud>) [--run <id>]',
  ),
  namespaced(
    'pool',
    'import',
    "Store an agent pool's keys for mcp token.",
    '<pool-keys.json> --store <directory>',
  ),
] as const;

const commands = [...dispatchedCommands, ...entrypointCommands];

/**
 * Every Dash command line: one `command` per Dash command, help and completion added by `run`.
 * Nested because `or` takes at most fifteen parsers.
 */
export const dashParser = or(or(...dispatchedCommands), ...entrypointCommands);

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
  if (name === 'help' || name === 'completion') return `usage: ${programName} ${name} (${reason})`;
  const usage = name === undefined ? undefined : usageOf(name);
  if (usage === undefined) return `Unsupported Dash command: ${String(name)}`;
  return `${usage.replace(/\s+/gu, ' ')} (${reason})`;
}

/** The exit that ends `run` after it printed help or a completion script; never escapes. */
class Printed extends Error {}

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
      colors: false,
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
