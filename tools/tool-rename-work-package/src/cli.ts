import { resolve } from 'node:path';

import {
  emitRouteDocument,
  formatInventory,
  readMigrations,
  routeInventory,
  schemaInventory,
} from './inventory';
import { renamePath } from './rename-text';
import { applyRename, git, residualsIn, trackedPaths } from './tree';

const USAGE = `usage: cli.ts <apply|check|report> [--root <dir>] [<path>...]
  apply <path>...  move paths with git mv, then respell content, under each <path>
  check            exit 1 listing every residual outside the allow-list, 0 when none
  report           print the rename inventory regenerated from the tree`;

/** The parsed command line. */
interface Invocation {
  readonly mode: 'apply' | 'check' | 'report';
  readonly root: string;
  readonly paths: readonly string[];
}

/**
 * Parses `argv` (without the runtime and script). The root defaults to the git top level of
 * the working directory.
 *
 * @throws on an unknown mode, a `--root` without a value, paths given to `check` or `report`,
 *   or `apply` without paths.
 */
export function parseInvocation(argv: readonly string[]): Invocation {
  const [mode, ...rest] = argv;
  if (mode !== 'apply' && mode !== 'check' && mode !== 'report') throw new Error(USAGE);
  let root: string | undefined;
  const paths: string[] = [];
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest.at(index);
    if (argument === '--root') {
      root = rest.at(index + 1);
      if (root === undefined) throw new Error('--root needs a directory');
      index += 1;
    } else if (argument !== undefined) {
      paths.push(argument);
    }
  }
  if (mode === 'apply' && paths.length === 0) throw new Error('apply needs at least one path');
  if (mode !== 'apply' && paths.length > 0) throw new Error(`${mode} takes no paths`);
  const top = root ?? git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  return { mode, root: resolve(top), paths };
}

/** Runs one invocation, writing to stdout, and returns the exit code. */
export function run(invocation: Invocation): number {
  if (invocation.mode === 'apply') {
    const { moved, rewritten } = applyRename(invocation.root, invocation.paths);
    process.stdout.write(`moved ${String(moved)} paths, rewrote ${String(rewritten)} files\n`);
    return 0;
  }
  if (invocation.mode === 'check') {
    const residuals = residualsIn(invocation.root);
    for (const { path, line, text } of residuals) {
      process.stdout.write(line === 0 ? `${path}: path\n` : `${path}:${String(line)}: ${text}\n`);
    }
    process.stdout.write(`${String(residuals.length)} residuals outside the allow-list\n`);
    return residuals.length === 0 ? 0 : 1;
  }
  const moves = trackedPaths(invocation.root).filter((path) => renamePath(path) !== path).length;
  process.stdout.write(
    formatInventory([
      ...schemaInventory(readMigrations(invocation.root)),
      ...routeInventory(emitRouteDocument(invocation.root)),
      { surface: 'tracked paths apply would move', count: moves },
    ]),
  );
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = run(parseInvocation(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
