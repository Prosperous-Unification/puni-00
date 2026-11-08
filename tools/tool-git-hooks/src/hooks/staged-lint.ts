import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Finds the nearest project boundary; only ENOENT means an absent manifest. */
function findProject(workspace: string, source: string): string {
  let directory = dirname(source);
  for (;;) {
    const manifest = join(directory, 'project.json');
    let text: string | undefined;
    try {
      text = readFileSync(manifest, 'utf8');
    } catch (cause) {
      // Proof: swallowing EACCES made `rejects a genuinely unreadable present manifest` fail
      // (0 pass / 1 fail); the fixture first independently observes a real EACCES read.
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
    }
    if (text !== undefined) {
      // Proof: replacing JSON.parse with {} made all five `present invalid manifest` cases
      // fail (0 pass / 5 fail), including the malformed JSON source `{`.
      const project: unknown = JSON.parse(text);
      // Proof: disabling this guard made null, array, number and string manifests pass the CLI;
      // `present invalid manifest` reported 1 pass / 4 fail.
      if (typeof project !== 'object' || project === null || Array.isArray(project)) {
        throw new Error(`${manifest}: expected a JSON object`);
      }
      return directory;
    }
    const parent = dirname(directory);
    if (directory === workspace || parent === directory) return workspace;
    directory = parent;
  }
}

/**
 * Runs installed ESLint serially at the workspace cwd, releasing project state between batches.
 * Present unreadable/invalid manifests, missing executables, child failures and signals throw.
 * Source arguments are absolute paths after `--`, preserving spaces and option-like filenames.
 */
function lintStaged(workspace: string, files: string[]): void {
  // Proof: removing this guard made `rejects an empty invocation with explicit usage`
  // fail (0 pass / 1 fail) because the CLI exited 0 without running ESLint.
  if (files.length === 0) throw new Error('Usage: staged-lint.ts <staged source> [...]');
  const batches = new Map<string, string[]>();
  for (const file of files) {
    const source = resolve(workspace, file);
    const project = findProject(workspace, source);
    const batch = batches.get(project);
    if (batch === undefined) batches.set(project, [source]);
    else batch.push(source);
  }
  const executable = join(workspace, 'node_modules', '.bin', 'eslint');
  for (const [project, sources] of batches) {
    // Proof: `rejects a missing installed ESLint` removes only the fixture dependency symlink;
    // this spawn throws with its exact executable path and the production CLI exits nonzero.
    const child = Bun.spawnSync([executable, '--', ...sources], {
      cwd: workspace,
      stdout: 'inherit',
      stderr: 'inherit',
    });
    // Proof: disabling this guard made both real no-debugger batches and the SIGTERM fixture
    // return success; `rule violation|terminated by a signal` reported 0 pass / 3 fail.
    if (child.signalCode !== undefined || child.exitCode !== 0) {
      throw new Error(
        `ESLint failed for ${project}: ${child.signalCode ?? String(child.exitCode)}`,
      );
    }
  }
}

if (import.meta.main) {
  try {
    lintStaged(process.cwd(), process.argv.slice(2));
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exit(1);
  }
}
