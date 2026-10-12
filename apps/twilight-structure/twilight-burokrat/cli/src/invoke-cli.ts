import { executeCli } from './cli';

/** What one in-process CLI command wrote and the exit code it would have ended with. */
export interface CliInvocation {
  exitCode: number;
  stdout: string;
  stderr: string;
}

let running = false;

/**
 * Sends `stream.write` into `chunks` and returns the function that puts the original back: the
 * own property it had, or none, so the inherited `write` shows through again unchanged.
 */
function captureWrites(stream: NodeJS.WriteStream, chunks: string[]): () => void {
  const own = Object.getOwnPropertyDescriptor(stream, 'write');
  stream.write = (chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  };
  return () => {
    if (own === undefined) Reflect.deleteProperty(stream, 'write');
    else Object.defineProperty(stream, 'write', own);
  };
}

/**
 * Runs one `cli.ts` command in this process through {@link executeCli}, the function the process
 * entry calls, and captures its output and exit code. Tests use it instead of spawning
 * `bun run cli.ts`, which starts a Bun and loads every module per case.
 *
 * It swaps the process-global stdout, stderr and exit code, so calls must not overlap: it throws
 * when one is already running instead of mixing their output. A test about the process boundary
 * itself (arity, usage, real exit status) still spawns the CLI.
 *
 * `environment` sets `process.env` keys for the call (an `undefined` value unsets one) and
 * restores them afterwards. It reaches what the command reads from `process.env` itself, such as
 * `TOOL_WIKI_TRUSTED_NODE_MODULES`, but not a child it spawns without an explicit `env`: Bun gives
 * such a child the environment the process started with. A test whose subject is a child's
 * environment (a fake `git` on `PATH`, a sentinel a candidate script would write) still spawns.
 */
export async function invokeCli(
  argv: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = {},
): Promise<CliInvocation> {
  if (running) throw new Error('invokeCli calls overlap; they share process stdout and exit code');
  running = true;
  const stdout: string[] = [];
  const stderr: string[] = [];
  // Bun reports `undefined` here until something sets an exit code, though its type says number,
  // and ignores `undefined` assigned back, so the restore below writes 0, the same "no failure".
  const exitCode = process.exitCode as number | undefined;
  const replaced = Object.keys(environment).map((key) => [key, process.env[key]] as const);
  const restoreStdout = captureWrites(process.stdout, stdout);
  const restoreStderr = captureWrites(process.stderr, stderr);
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
  process.exitCode = 0;
  try {
    await executeCli(argv);
    return {
      exitCode: process.exitCode,
      stdout: stdout.join(''),
      stderr: stderr.join(''),
    };
  } finally {
    restoreStdout();
    restoreStderr();
    for (const [key, value] of replaced) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
    process.exitCode = exitCode ?? 0;
    running = false;
  }
}
