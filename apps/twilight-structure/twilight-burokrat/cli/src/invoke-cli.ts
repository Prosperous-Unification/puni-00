import { executeCli } from './cli';

/** What one in-process CLI command wrote and the exit code it would have ended with. */
export interface CliInvocation {
  exitCode: number;
  stdout: string;
  stderr: string;
}

let running = false;

/**
 * Runs one `cli.ts` command in this process through {@link executeCli}, the function the process
 * entry calls, and captures its output and exit code. Tests use it instead of spawning
 * `bun run cli.ts`, which starts a Bun and loads every module per case.
 *
 * It swaps the process-global stdout, stderr and exit code, so calls must not overlap: it throws
 * when one is already running instead of mixing their output. A test about the process boundary
 * itself (arity, usage, real exit status) still spawns the CLI.
 *
 * `environment` sets `process.env` keys for the call (an `undefined` value unsets one) and restores
 * them afterwards. It reaches what
 * the command reads from `process.env` itself, such as `TOOL_WIKI_TRUSTED_NODE_MODULES`, but not
 * a child it spawns without an explicit `env`: Bun gives such a child the environment the process
 * started with. A test whose subject is a child's environment (a fake `git` on `PATH`, a sentinel
 * a candidate script would write) still spawns the CLI.
 */
export async function invokeCli(
  argv: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = {},
): Promise<CliInvocation> {
  if (running) throw new Error('invokeCli calls overlap; they share process stdout and exit code');
  running = true;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const writeStdout = process.stdout.write.bind(process.stdout);
  const writeStderr = process.stderr.write.bind(process.stderr);
  const exitCode = process.exitCode;
  const replaced = Object.keys(environment).map((key) => [key, process.env[key]] as const);
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    stdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  };
  process.stderr.write = (chunk: string | Uint8Array): boolean => {
    stderr.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  };
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
    process.stdout.write = writeStdout;
    process.stderr.write = writeStderr;
    for (const [key, value] of replaced) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
    process.exitCode = exitCode;
    running = false;
  }
}
