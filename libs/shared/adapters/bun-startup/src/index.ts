import { isAbsolute } from 'node:path';

const interpreter = '/usr/bin/env';
/**
 * Proof: deleting each entry fails its named executable/helper erasure case. OPTIONS and
 * INSPECT_PRELOAD also execute the candidate sentinel; NODE_OPTIONS/BE_BUN assert erasure only.
 */
const removed = ['BUN_OPTIONS', 'BUN_INSPECT_PRELOAD', 'NODE_OPTIONS', 'BUN_BE_BUN'] as const;
/** Proof: dropping each flag admits dotenv or candidate preload; splitting config fails real startup. */
const flags = ['--no-env-file', '--config=/dev/null'] as const;

function createRuntimeArgs(runtime: string): readonly string[] {
  return [...removed.flatMap((name) => ['-u', name]), runtime, ...flags];
}

/**
 * Build the installed script's kernel interpreter line. Startup variables are erased before
 * Bun can load a preload, and candidate Bun configuration and dotenv autoload are disabled.
 * Generated integrations use {@link createLaunch}; invoking Bun directly bypasses this line.
 */
export function createShebang(): string {
  return `#!${interpreter} -S ${createRuntimeArgs('bun').join(' ')}`;
}

/**
 * Bind a generated invocation to the selected Bun and installed script with the same startup
 * controls as {@link createShebang}. Callers append the canonical namespace and operation.
 *
 * @throws Error when either selected executable path is relative, which could resolve against
 * the candidate's working directory instead of the selected installation. Selected Bun paths
 * containing an equals sign are unsupported: env would interpret them as assignments.
 */
export function createLaunch(runtime: string, entrypoint: string): readonly string[] {
  // Proof: deleting either guard independently fails the selected/installed absolute-path case.
  if (!isAbsolute(runtime)) throw new Error('selected Bun executable must be absolute');
  // Proof: removing this guard loses the explicit refusal for an env-assignment runtime path.
  if (runtime.includes('='))
    throw new Error("selected Bun executable cannot contain '=' with the env launcher");
  if (!isAbsolute(entrypoint)) throw new Error('installed PUNI entrypoint must be absolute');
  // Proof: returning bare [runtime, entrypoint] executes preloads in the actual helper test.
  return [interpreter, ...createRuntimeArgs(runtime), entrypoint];
}
