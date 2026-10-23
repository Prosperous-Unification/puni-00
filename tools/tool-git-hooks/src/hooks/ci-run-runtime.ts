import { createGatePlan } from './ci-plan';

/** A selected command's modeled failure, preserving the exit status for the CI gate. */
class CommandFailure extends Error {
  constructor(readonly status: number) {
    super(`Selected Nx command failed with exit status ${String(status)}`);
  }
}

/** Runs one Nx command and records its real duration and exit status even when the command fails. */
async function runNx(repository: string, args: string[]): Promise<void> {
  const started = performance.now();
  const child = Bun.spawn(['bunx', 'nx', ...args], {
    cwd: repository,
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
): Promise<void> {
  // Proof: removing this guard accepted an unknown partition in the production CLI regression.
  if (partition !== 'workspace' && partition !== 'twilight')
    throw new Error('Unknown runtime partition');
  const plan = await createGatePlan(repository, base, head);
  // Proof: removing this guard let documentation plans execute runtime commands in both partition regressions.
  if (plan.mode !== 'affected') throw new Error('Runtime execution requires an affected code plan');
  const projects = partition === 'workspace' ? plan.workspaceProjects : plan.twilightProjects;
  // Proof: removing this guard made the unexplained Twilight invocation regression falsely succeed.
  if (partition === 'twilight' && projects.length === 0)
    throw new Error('Twilight execution has no selected projects');
  process.stdout.write(`${JSON.stringify({ selection: plan, partition })}\n`);
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
  if (
    args.length !== 4 ||
    partition === undefined ||
    base === undefined ||
    head === undefined ||
    repository === undefined
  ) {
    throw new Error(
      'Usage: ci-run-runtime.ts <workspace|twilight> <base-sha> <head-sha> <repository>',
    );
  }
  try {
    await runRuntime(repository, base, head, partition);
  } catch (error) {
    if (!(error instanceof CommandFailure)) throw error;
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.status;
  }
}
