import {
  command,
  constant,
  formatUsage,
  type InferValue,
  message,
  object,
  option,
  or,
  string,
  text,
} from '@optique/core';
import { run } from '@optique/run';

const programName = 'twin';

/**
 * A refused invocation: unknown command, or an unknown, duplicate, missing or valueless flag.
 * It is raised before any input is read; the entrypoint prints its one-line message after
 * `error: ` and exits 2.
 */
export class UsageRefusal extends Error {
  override readonly name = 'UsageRefusal';
}

/**
 * One required flag, each once with a nonempty value that is not itself a flag, refusing in the
 * wording the hand-written loop used.
 * Proof: dropping `pattern` made `refuses a valueless flag before any read` reach the reader
 * (`plan export is missing`) for an empty `--output` instead of refusing (2026-11-02).
 * Proof: wrapping `--change` in `optional` made `refuses a missing flag before any read` reach
 * the reader instead of refusing `Missing required twin flag: --change` (2026-11-02).
 */
function requiredFlag(
  name: `--${string}`,
  metavar: 'PATH' | 'DIR' | 'URL' | 'NAME' | 'SHA',
  description: string,
) {
  return option(name, string({ metavar, pattern: /^(?!--)[\s\S]+$/u }), {
    description: [text(description)],
    errors: {
      // Proof: dropping `duplicate` made `refuses a duplicate flag before any read` see Optique's
      // own wording instead of `Duplicate twin flag: --change` (2026-11-02).
      duplicate: [text(`Duplicate twin flag: ${name}`)],
      endOfInput: [text(`twin flag has no value: ${name}`)],
      invalidValue: [text(`twin flag has no value: ${name}`)],
      missing: [text(`Missing required twin flag: ${name}`)],
    },
  });
}

/**
 * Unknown flags refuse in the hand-written loop's wording, before any read. A bare word is a
 * stray argument: a flag followed by another flag consumes it as its value, so the word after
 * that pair is the first token Optique cannot place.
 * Proof: dropping `unexpectedInput` made `refuses an unknown flag before any read` see Optique's
 * "Unexpected option or subcommand: `--force`." instead of this wording (2026-11-02).
 */
const objectErrors = {
  errors: {
    unexpectedInput: (token: string) => [
      text(
        token.startsWith('-')
          ? `Unsupported twin flag: ${token}`
          : `Unexpected twin argument: ${token}`,
      ),
    ],
  },
};

const admitProgress = command(
  'admit-progress',
  object(
    {
      command: constant('admit-progress'),
      receipt: requiredFlag(
        '--receipt',
        'PATH',
        'The bound (schema 2) progress receipt from Dash `record-progress-v2`.',
      ),
      planReference: requiredFlag(
        '--plan-reference',
        'PATH',
        'The producer plan reference the receipt is bound to.',
      ),
      tasks: requiredFlag('--tasks', 'PATH', "The plan's `tasks.json`."),
      acceptedReference: requiredFlag(
        '--accepted-reference',
        'PATH',
        'The independently selected accepted plan reference.',
      ),
      output: requiredFlag('--output', 'PATH', 'The new command batch file; never replaced.'),
    },
    objectErrors,
  ),
  {
    brief: message`Propose WBS commands for a bound receipt against a selected accepted reference.`,
  },
);

const planReference = command(
  'plan-reference',
  object(
    {
      command: constant('plan-reference'),
      export: requiredFlag(
        '--export',
        'PATH',
        'The WBS plan export (`GET /api/projects/:id/export`).',
      ),
      repository: requiredFlag('--repository', 'URL', 'The repository the plan is built in.'),
      change: requiredFlag('--change', 'NAME', 'The OpenSpec change the plan answers.'),
      planningCommit: requiredFlag('--planning-commit', 'SHA', 'The commit the plan was made at.'),
      sourceBase: requiredFlag('--source-base', 'SHA', 'The source base commit.'),
      requirements: requiredFlag(
        '--requirements',
        'PATH',
        "The requirements the plan answers, such as the change's delta spec.",
      ),
      output: requiredFlag(
        '--output',
        'DIR',
        'An existing directory for `tasks.json` and `plan-reference.json`.',
      ),
    },
    objectErrors,
  ),
  { brief: message`Write tasks.json and plan-reference.json from a WBS plan export.` },
);

const receiptToCommands = command(
  'receipt-to-commands',
  object(
    {
      command: constant('receipt-to-commands'),
      receipt: requiredFlag(
        '--receipt',
        'PATH',
        'The progress receipt from Dash `record-progress`.',
      ),
      planReference: requiredFlag(
        '--plan-reference',
        'PATH',
        'The plan reference the receipt names.',
      ),
      tasks: requiredFlag('--tasks', 'PATH', "The plan's `tasks.json`."),
      output: requiredFlag('--output', 'PATH', 'The new command batch file; never replaced.'),
    },
    objectErrors,
  ),
  { brief: message`Write the WBS command batch for one progress receipt.` },
);

const commands = [admitProgress, planReference, receiptToCommands] as const;

/** Every `twin` command line: one `command` per Navigator command, help and completion added by `run`. */
export const navigatorParser = or(...commands, objectErrors);

/** A parsed `twin` command line, discriminated by `command`. */
export type NavigatorCommand = InferValue<typeof navigatorParser>;

/** The parsed request of one Navigator command. */
export type NavigatorRequest<Name extends NavigatorCommand['command']> = Extract<
  NavigatorCommand,
  { readonly command: Name }
>;

/** What one invocation did: a command to dispatch, or help or a completion script printed. */
export type NavigatorInvocation =
  { readonly kind: 'command'; readonly command: NavigatorCommand } | { readonly kind: 'printed' };

/** The usage line of one Navigator command, or undefined when `name` names none. */
function usageOf(name: string): string | undefined {
  const parser = commands.find((candidate) =>
    candidate.usage.some((term) => term.type === 'command' && term.name === name),
  );
  if (parser === undefined) return undefined;
  // Proof: `colors: true` here failed `Missing Navigator flag: …` under `FORCE_COLOR=1` with
  // ANSI bytes in the refusal line (2026-11-02).
  return `usage: ${formatUsage(programName, parser.usage, { colors: false })}`;
}

/**
 * One refusal line from Optique's error text, which `help <unknown>` prefixes with the whole
 * usage, so only the text after its last `Error: ` is the reason. An argv whose first word names
 * no Navigator command refuses `Unsupported twin command: <word>`; any other refusal starts with
 * that command's usage.
 */
function refusalOf(args: readonly string[], errorText: string): string {
  const marker = errorText.lastIndexOf('Error: ');
  const reason = (marker < 0 ? errorText : errorText.slice(marker + 'Error: '.length))
    .replace(/\s+/gu, ' ')
    .trim();
  const name = args.at(0);
  // `help <unknown>` refuses with the help usage, not `Unsupported twin command:` (N-A12).
  // Proof: dropping this branch failed `<command> --help prints that command; help <unknown>
  // refuses in one line` with `error: Unsupported twin command: help` (2026-11-02).
  if (name === 'help' || name === 'completion') {
    // `completion` without a shell follows its first sentence with its whole help page.
    // Proof: returning `reason` whole here failed `completion without a shell, and --version,
    // refuse in one line` with the help page inside the line (2026-11-02).
    const brief = reason.includes('Usage:') ? /^[^.]*\./u.exec(reason)?.[0] : undefined;
    return `usage: ${programName} ${name} (${brief ?? reason})`;
  }
  const usage = name === undefined ? undefined : usageOf(name);
  // Proof: returning `reason` unmapped here failed `refuses an unsupported command before any
  // read, exit 2 through the entrypoint` on its exact `error: Unsupported twin command: apply`
  // line (2026-11-02).
  if (usage === undefined) return `Unsupported twin command: ${name ?? ''}`;
  return `${usage.replace(/\s+/gu, ' ')} (${reason})`;
}

/** The exit that ends `run` after it printed help or a completion script; never escapes. */
class Printed extends Error {
  override readonly name = 'Printed';
}

/**
 * Parses one `twin` command line through Optique's `run`, with every sink injected: help and
 * completion scripts go to `stdout` and return `{ kind: 'printed' }`; a refusal throws
 * {@link UsageRefusal} and writes nothing. Never calls `process.exit`.
 *
 * @throws UsageRefusal with one line: `Unsupported twin command: <name>` or `usage: …`.
 */
export function readNavigatorInvocation(
  args: readonly string[],
  stdout: (text: string) => void,
): NavigatorInvocation {
  let errorText = '';
  try {
    const parsed = run(navigatorParser, {
      programName,
      args,
      stdout,
      stderr: (chunk) => {
        errorText += chunk;
      },
      // Proof: dropping `onExit` let `run` call `process.exit(1)`, so `refuses an unsupported
      // command before any read, exit 2 through the entrypoint` saw exit 1, and the entrypoint
      // printed nothing on either stream (2026-11-02).
      onExit: (code) => {
        throw code === 0 ? new Printed() : new UsageRefusal(refusalOf(args, errorText));
      },
      // Without these two `run` reads the terminal's colour support and width, so help and
      // refusals would vary per terminal.
      // Proof: dropping `maxWidth` failed `help parity holds under any terminal width and colour
      // request` under `COLUMNS=30` (2026-11-02).
      // Proof: dropping `colors` failed that test under `FORCE_COLOR=1`: 13 help lines differed
      // by ANSI bytes (2026-11-02). Refusal lines stayed plain without it; `usageOf`'s own
      // `colors: false` guards them.
      colors: false,
      maxWidth: 120,
      aboveError: 'none',
      help: 'both',
      completion: 'command',
    });
    return { kind: 'command', command: parsed };
  } catch (cause) {
    // Proof: rethrowing `Printed` here failed `help and bash, zsh and fish completion print on
    // stdout` (2026-11-02).
    if (cause instanceof Printed) return { kind: 'printed' };
    throw cause;
  }
}
