import { resolve } from 'node:path';

import { type CheckRunner, runFleetChecks } from './check';
import { provisionCheckTools } from './check-provision';

/** Bounded subprocess: SIGKILL past the deadline, then throw naming the command. */
export const runChecked: CheckRunner = async (argv, options) => {
  const child = Bun.spawn({
    cmd: [...argv],
    cwd: options.cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const deadline = { passed: false };
  const timer = setTimeout(() => {
    deadline.passed = true;
    child.kill('SIGKILL');
  }, options.timeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(timer);
  if (deadline.passed) throw new Error(`${argv.join(' ')} exceeded ${String(options.timeoutMs)}ms`);
  return { exitCode, stdout, stderr };
};

/** `check-cli.ts [--root <tree>]`: the command `tool-fleet:check` runs. */
export async function main(args: readonly string[]): Promise<void> {
  const rootIndex = args.indexOf('--root');
  let root = resolve(import.meta.dir, '../../..');
  if (rootIndex !== -1) {
    if (rootIndex + 1 >= args.length || args[rootIndex + 1].startsWith('--')) {
      throw new Error('--root needs a path');
    }
    const value = args[rootIndex + 1];
    root = resolve(value);
  }
  const tools = await provisionCheckTools(root, process.env, runChecked);
  await runFleetChecks(root, tools, runChecked, (line) => {
    console.log(`[tool-fleet:check] ${line}`);
  });
  console.log('[tool-fleet:check] every family passed');
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exit(1);
  }
}
