import { PLAN_REFERENCE_FLAGS, runPlanReference } from './plan-reference';

/**
 * A refused invocation: unknown command, or an unknown, duplicate, missing or valueless flag.
 * It is raised before any input is read; the entrypoint maps it to exit code 2.
 */
export class UsageRefusal extends Error {
  override readonly name = 'UsageRefusal';
}

/** The value of each of a command's flags, every one present exactly once. */
export type FlagValues<Flag extends string> = (flag: Flag) => string;

const COMMAND_FLAGS = {
  'plan-reference': PLAN_REFERENCE_FLAGS,
} as const;

/** The usage text, one line per command with its required flags. */
export const USAGE = Object.entries(COMMAND_FLAGS)
  .map(([name, flags]) => `twin ${name} ${flags.map((flag) => `${flag} <value>`).join(' ')}`)
  .join('\n');

/**
 * Exactly `flags`, each once with a nonempty value that is not itself a flag.
 *
 * @throws {UsageRefusal} on an unknown, duplicate, valueless or missing flag.
 */
function parseFlags<const Flag extends string>(
  flags: readonly Flag[],
  argv: readonly string[],
): FlagValues<Flag> {
  const allowed = new Set<string>(flags);
  const values = new Map<string, string>();
  for (let position = 0; position < argv.length; position += 2) {
    const flag = argv.at(position);
    if (flag === undefined || !allowed.has(flag)) {
      // Proof: bypassing this allowlist failed `refuses an unknown flag before any read`
      // (2026-10-11).
      throw new UsageRefusal(`Unsupported twin flag: ${String(flag)}`);
    }
    if (values.has(flag)) {
      // Proof: bypassing this guard failed `refuses a duplicate flag before any read`: the last
      // value won instead of the ambiguous request being refused (2026-10-11).
      throw new UsageRefusal(`Duplicate twin flag: ${flag}`);
    }
    const value = argv.at(position + 1);
    if (value === undefined || value.length === 0 || value.startsWith('--')) {
      // Proof: bypassing this guard failed `refuses a valueless flag before any read`
      // (2026-10-11).
      throw new UsageRefusal(`twin flag has no value: ${flag}`);
    }
    values.set(flag, value);
  }
  for (const flag of flags) {
    if (!values.has(flag)) {
      // Proof: bypassing this check failed `refuses a missing flag before any read` (2026-10-11).
      throw new UsageRefusal(`Missing required twin flag: ${flag}`);
    }
  }
  return (flag) => {
    const value = values.get(flag);
    if (value === undefined) throw new Error(`twin flag ${flag} was not parsed`);
    return value;
  };
}

/**
 * Dispatches one `twin` invocation and returns the line to print.
 *
 * @throws {UsageRefusal} before any file is read when the command or a flag is not exactly
 * one of the declared ones.
 */
export async function runNavigator(argv: readonly string[]): Promise<string> {
  const [name = '', ...flagArguments] = argv;
  switch (name) {
    case 'plan-reference':
      return await runPlanReference(parseFlags(PLAN_REFERENCE_FLAGS, flagArguments));
    case '--help':
      if (flagArguments.length === 0) return USAGE;
      throw new UsageRefusal(`twin --help takes no arguments\n${USAGE}`);
    default:
      // Proof: routing unknown commands to plan-reference failed `refuses an unsupported command
      // before any read, exit 2 through the entrypoint` and `refuses no command at all`
      // (2026-10-11).
      throw new UsageRefusal(`Unsupported twin command: ${name}\n${USAGE}`);
  }
}
