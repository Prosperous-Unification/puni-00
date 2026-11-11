import { type LockCommand, UsageRefusal } from '../cli-parser';
import { type Context, createLockOwner } from './lock';

function readSeconds(text: string | undefined, kind: 'wait' | 'poll'): number {
  const value = text === undefined || text === '' ? (kind === 'wait' ? '0' : '5') : text;
  // Proof: removing canonical syntax admitted wait01 in the actual compatibility decoder.
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value))
    throw new UsageRefusal('heavy lock ' + kind + ' interval must use canonical whole seconds');
  const seconds = Number(value);
  if (
    // Proof: removing the integer bound admitted wait9007199254740992.
    !Number.isSafeInteger(seconds) ||
    seconds < 0 ||
    // Proof: removing the poll range admitted poll0 instead of UsageRefusal.
    (kind === 'poll' && (seconds < 1 || seconds > 30))
  )
    throw new UsageRefusal('heavy lock ' + kind + ' interval is outside its supported range');
  return seconds;
}

/**
 * Decode the former executable boundary once into the same typed PUNI operation. Status ignores
 * queue environment. Optional unset/empty queue settings retain Bash parameter-default semantics;
 * run intervals use canonical decimal integers, closing the old unchecked Bash arithmetic input.
 * No environment key selects a lock pathname. Request admission validates labels before publication.
 * @throws UsageRefusal for unsupported argv or malformed/out-of-range intervals, without operand text.
 */
export function readCompatibility(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
): LockCommand {
  const argv = [...args];
  if (argv.length === 1 && argv.at(0) === 'status') return { command: 'ops', words: 'lock status' };
  // Proof: removing this boundary admitted unsupported argv in lock-compat.test.ts.
  if (argv.at(0) !== '--' || argv.length < 2 || argv.at(1) === '')
    throw new UsageRefusal('heavy lock expects status or -- command [arg ...]');
  const label = environment['HEAVY_LOCK_LABEL'];
  return {
    command: 'ops',
    words: 'lock run',
    argv: argv.slice(1),
    label: label === undefined || label === '' ? 'unlabeled' : label,
    waitSeconds: readSeconds(environment['HEAVY_LOCK_WAIT_SECONDS'], 'wait'),
    pollSeconds: readSeconds(environment['HEAVY_LOCK_POLL_SECONDS'], 'poll'),
  };
}

/** Capture compatibility parsing failures inside the same bounded native executable owner. */
export async function runCompatibility(args: readonly string[], context: Context): Promise<number> {
  const owner = createLockOwner(async () => {
    const { selectLockPath } = await import('@shared/heavy-lock');
    return selectLockPath(process.platform);
  });
  return await owner(() => readCompatibility(args, context.environment), context);
}
