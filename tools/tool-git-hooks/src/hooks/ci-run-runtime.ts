import { createGatePlan } from './ci-plan';
import {
  DEDICATED_RUNTIME_PROJECTS,
  partitionRuntimeProjects,
  type RuntimePartition,
} from './ci-runtime-partitions';

/** A selected command's modeled failure, preserving the exit status for the CI gate. */
class CommandFailure extends Error {
  constructor(readonly status: number) {
    super(`Selected Nx command failed with exit status ${String(status)}`);
  }
}

function isProjectNames(names: unknown): names is string[] {
  return (
    Array.isArray(names) &&
    names.every(
      (name: unknown) => typeof name === 'string' && /^(?!-)[a-zA-Z0-9@_./-]+$/.test(name),
    )
  );
}

/** Runs one Nx command and records its real duration and exit status even when the command fails. */
async function runNx(repository: string, args: string[]): Promise<void> {
  const started = performance.now();
  const child = Bun.spawn(['bunx', 'nx', ...args], {
    cwd: repository,
    // Nx's pinned task-timings lifecycle prints each completed task's duration at endCommand.
    // The streamed log retains partial task output when the finite phase is cancelled.
    env: { ...process.env, NX_PERF_LOGGING: 'true' },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const status = await child.exited;
  process.stdout.write(
    `${JSON.stringify({ command: ['nx', ...args], elapsedMs: Math.round(performance.now() - started), exitCode: status })}\n`,
  );
  // Proof: suppressing nonzero command status made the production CLI failure regression fail (exit 23 became 0).
  if (status !== 0) throw new CommandFailure(status);
}

/** Schedules only the reviewed remote execution exception after logical owner validation. */
async function runRemoteLeaf(
  repository: string,
  head: string,
  leaf: 'model' | 'model-continuation' | 'source' | 'rest',
  mode: string,
): Promise<void> {
  if (leaf === 'rest')
    await runNx(repository, [
      'run-many',
      '-t',
      ...(mode === 'full' ? ['lint'] : []),
      'typecheck',
      'build',
      '-p',
      'tool-remote-scripts',
      '--parallel=2',
      '--output-style=stream',
    ]);
  // Proof: omitting or duplicating this dispatch failed the exact-one-leaf production CLI test.
  // Leaf targets are noncached and retain explicit canonical inputs/env and dependency builds.
  // Only rest owns test:caddy; no leaf depends on the canonical unsplit test target.
  await runNx(repository, [
    'run',
    `tool-remote-scripts:test:ci:${leaf}`,
    `--head=${head}`,
    '--skip-nx-cache',
    // Proof: dropping this bound failed actual fixed-leaf dispatch; nx.json otherwise allows four.
    '--parallel=2',
    '--output-style=stream',
  ]);
}

/**
 * Recomputes the immutable plan in the execution checkout before narrowing work. Runtime target
 * selection and independent lint use their respective inputs; the canonical full targets remain
 * unchanged. Package tests are a separately required workflow phase when Burokrat is selected.
 */
export async function runRuntime(
  repository: string,
  base: string,
  head: string,
  partition: string,
  mode = 'affected',
): Promise<void> {
  // Proof: removing this guard accepted an unknown partition in the production CLI regression.
  if (
    ![
      'workspace',
      'backend',
      'remote',
      'remote-rest',
      'remote-model',
      'remote-model-continuation',
      'remote-source',
      'frontend',
      'twilight',
    ].includes(partition)
  )
    throw new Error('Unknown runtime partition');
  // Proof: removing this refusal made the unknown-mode CLI case execute affected work and fail.
  if (mode !== 'affected' && mode !== 'full') throw new Error('Unknown runtime mode');
  // Proof: mapping continuation to core failed exact production CLI dispatch in affected/full modes (2026-10-29).
  // Proof: routing source to continuation failed the exact production CLI source-dispatch consumer (2026-10-29).
  const remoteLeaf =
    partition === 'remote-model'
      ? 'model'
      : partition === 'remote-model-continuation'
        ? 'model-continuation'
        : partition === 'remote-source'
          ? 'source'
          : partition === 'remote-rest'
            ? 'rest'
            : undefined;
  const owner = remoteLeaf === undefined ? partition : 'remote';
  if (mode === 'full') {
    if (partition === 'twilight') throw new Error('Twilight retains its existing full runner');
    const checkedOut = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], {
      cwd: repository,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    // Proof: the full-runner wrong-head CLI negative failed before inventory or Nx work.
    if (checkedOut.exitCode !== 0 || checkedOut.stdout.toString().trim() !== head)
      throw new Error('Full runtime checkout does not match the immutable head');
    const configured = Bun.spawn(['bunx', 'nx', 'show', 'projects', '--json'], {
      cwd: repository,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, status] = await Promise.all([
      new Response(configured.stdout).text(),
      new Response(configured.stderr).text(),
      configured.exited,
    ]);
    if (status !== 0) throw new Error(`Nx project inventory failed: ${stderr}`);
    const names: unknown = JSON.parse(stdout);
    // Proof: removing the name-shape guard let a `--skip-nx-cache` project reach run-many;
    // `full runner refuses stale head, missing owner and failed Nx inventory` failed.
    if (!isProjectNames(names) || new Set(names).size !== names.length)
      throw new Error('Nx project inventory is malformed');
    for (const project of Object.values(DEDICATED_RUNTIME_PROJECTS))
      if (!names.includes(project)) throw new Error(`Nx project inventory omits ${project}`);
    const owned = partitionRuntimeProjects(
      names.filter((name) => name !== 'twilight-burokrat' && name !== 'twilight-dash'),
    );
    // Boundary: the initial partition allowlist and full-mode Twilight refusal restrict this key.
    const projects = owned[owner as RuntimePartition];
    process.stdout.write(
      `${JSON.stringify({ mode, head, partition, projects, targets: ['test', 'lint', 'typecheck', 'build'] })}\n`,
    );
    if (projects.length === 0) {
      // Proof: the dedicated-owner omission test refuses, while the empty-residual full
      // fixture records the omitted runtime target instead of invoking `nx -p ''`.
      if (partition !== 'workspace') throw new Error('Full runtime partition has no projects');
      process.stdout.write(
        `${JSON.stringify({ partition, omitted: ['test', 'lint', 'typecheck', 'build'], reason: 'Full inventory has no residual projects' })}\n`,
      );
      return;
    }
    if (remoteLeaf !== undefined) {
      await runRemoteLeaf(repository, head, remoteLeaf, mode);
      return;
    }
    await runNx(repository, [
      'run-many',
      '-t',
      'test',
      'lint',
      'typecheck',
      'build',
      '-p',
      projects.join(','),
      '--parallel=2',
      '--output-style=stream',
    ]);
    return;
  }
  const plan = await createGatePlan(repository, base, head);
  // Proof: removing this guard let documentation plans execute runtime commands in both partition regressions.
  if (plan.mode !== 'affected') throw new Error('Runtime execution requires an affected code plan');
  const projects =
    partition === 'twilight'
      ? plan.twilightProjects
      : // Boundary: the initial partition allowlist restricts every remaining key.
        plan.partitions[owner as RuntimePartition];
  // Proof: removing this guard made the unexplained Twilight invocation regression falsely succeed.
  if (partition !== 'workspace' && projects.length === 0)
    throw new Error('Selected runtime partition has no projects');
  process.stdout.write(`${JSON.stringify({ selection: plan, partition })}\n`);
  if (remoteLeaf !== undefined) {
    await runRemoteLeaf(repository, head, remoteLeaf, mode);
    return;
  }
  const selected = plan.tests.filter(
    (test) => test.mode === 'files' && projects.includes(test.project),
  );
  const complete = projects.filter((project) => !selected.some((test) => test.project === project));
  if (complete.length > 0) {
    await runNx(repository, [
      'run-many',
      '-t',
      'test',
      'typecheck',
      'build',
      '-p',
      complete.join(','),
      '--parallel=2',
      '--output-style=stream',
    ]);
  }
  for (const test of selected) {
    await runNx(repository, [
      'run-many',
      '-t',
      'typecheck',
      'build',
      '-p',
      test.project,
      '--parallel=2',
      '--output-style=stream',
    ]);
    await runNx(repository, [
      'run',
      `${test.project}:test:selected`,
      `--base=${base}`,
      `--head=${head}`,
      '--output-style=stream',
    ]);
  }
  if (projects.length === 0) {
    process.stdout.write(
      `${JSON.stringify({ partition, omitted: ['test', 'typecheck', 'build'], reason: 'Validated plan has no runtime projects in this partition' })}\n`,
    );
  }
  if (partition === 'workspace') {
    await runNx(repository, [
      'affected',
      '-t',
      'lint',
      `--base=${base}`,
      `--head=${head}`,
      '--exclude=twilight-burokrat',
      '--parallel=2',
      '--output-style=stream',
    ]);
    // Proof: tying source lint to runtime selection omitted it for shared lint-loader edits;
    // the independent workspace-lint command regressions failed before this separation.
    // Burokrat's global lint target is inactive in CI; preserve its active source-lint command.
    await runNx(repository, [
      'run',
      'twilight-burokrat:lint:source',
      '--skip-nx-cache',
      '--output-style=stream',
    ]);
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const partition = args.at(0);
  const base = args.at(1);
  const head = args.at(2);
  const repository = args.at(3);
  const mode = args.at(4) ?? 'affected';
  if (
    (args.length !== 4 && args.length !== 5) ||
    partition === undefined ||
    base === undefined ||
    head === undefined ||
    repository === undefined
  ) {
    throw new Error(
      'Usage: ci-run-runtime.ts <workspace|backend|remote|remote-rest|remote-model|remote-model-continuation|remote-source|frontend|twilight> <base-sha> <head-sha> <repository> [affected|full]',
    );
  }
  try {
    await runRuntime(repository, base, head, partition, mode);
  } catch (error) {
    if (!(error instanceof CommandFailure)) throw error;
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.status;
  }
}
