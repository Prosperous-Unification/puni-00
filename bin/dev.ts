import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Completion } from '../apps/puni/cli/src/entrypoint';
import type { Context } from '../apps/puni/cli/src/execute-command';
import { createInterrupts, createOutputs } from '../libs/shared/adapters/bun-output/src/index';

class CallerConfigurationFailure extends Error {}

/**
 * Forward this checkout's complete development purpose to explicitly selected delivered PUNI main.
 * Capture checkout/caller/environment/runtime, native writers and lazy executable IO before import.
 * PUNI alone owns preflight, local Nx, signals and merged capture; no shell or extra child owner.
 * Reusable calls return Completion or preserve their thrown cause, without exiting the caller.
 * @throws on absent/nonabsolute/unreadable selection, unusable main or invalid completion.
 * No source/PATH fallback, default provisioning or arbitrary imported-resource cleanup is promised.
 */
export async function runRepositoryDevelopment(args: readonly string[]): Promise<Completion> {
  const operands = [...args];
  const environment = { ...process.env };
  const callerDirectory = process.cwd();
  const repository = realpathSync.native(resolve(dirname(import.meta.path), '..'));
  const runtime = process.execPath;
  const temporaryDirectory = tmpdir();
  const writeStdout = process.stdout.write.bind(process.stdout);
  const writeStderr = process.stderr.write.bind(process.stderr);
  const nativeStdout = Bun.stdout,
    nativeStderr = Bun.stderr;
  let diagnosticAttempt: ReturnType<NonNullable<Context['developmentIO']>['readDiagnosticAttempt']>;
  const developmentIO: NonNullable<Context['developmentIO']> = {
    stdin: 0,
    stdout: 1,
    stderr: 2,
    openStdout: nativeStdout.writer.bind(nativeStdout),
    openStderr: nativeStderr.writer.bind(nativeStderr),
    recordDiagnosticAttempt: (cause, outcome) => {
      diagnosticAttempt = { cause, outcome };
    },
    readDiagnosticAttempt: () => diagnosticAttempt,
  };
  const selected = environment['PUNI_EXECUTABLE'];
  if (selected === undefined || !isAbsolute(selected))
    throw new CallerConfigurationFailure(
      'set PUNI_EXECUTABLE to the absolute entrypoint of a separately provisioned reviewed current PUNI installation',
    );
  const entrypoint = realpathSync.native(selected);
  const directory = dirname(entrypoint);
  const context: Context = {
    installation: { directory, entrypoint },
    lookup: { directory: callerDirectory, path: environment['PATH'] },
    callerDirectory,
    runtime,
    temporaryDirectory,
    environment,
    developmentIO,
    stdout: (bytes) => {
      writeStdout(bytes);
    },
    stderr: (bytes) => {
      writeStderr(bytes);
    },
  };
  const delivered: unknown = await import(pathToFileURL(entrypoint).href);
  if (
    typeof delivered !== 'object' ||
    delivered === null ||
    !('main' in delivered) ||
    typeof delivered.main !== 'function'
  )
    throw new CallerConfigurationFailure(
      'selected PUNI must export callable main; provision the reviewed current PUNI artifact',
    );
  const completion: unknown = await Reflect.apply(delivered.main, delivered, [
    ['dash', 'dev', ...operands, '--repository', repository],
    context,
  ]);
  if (
    typeof completion !== 'object' ||
    completion === null ||
    !('kind' in completion) ||
    (completion.kind !== 'drain' && completion.kind !== 'exit') ||
    !('status' in completion) ||
    typeof completion.status !== 'number' ||
    !Number.isInteger(completion.status) ||
    completion.status < 0 ||
    completion.status > 255
  )
    throw new CallerConfigurationFailure(
      'selected PUNI returned an invalid completion; provision the reviewed current PUNI artifact',
    );
  return { kind: completion.kind, status: completion.status };
}

/** Bound failure reporting with pre-import factories, then release both successful local acquisitions. */
async function reportCallerFailure(
  instruction: string,
  factories: Pick<Parameters<typeof createOutputs>[0], 'stdout' | 'stderr'>,
): Promise<void> {
  const interrupts = createInterrupts('repository development adapter');
  let outputs: ReturnType<typeof createOutputs> | undefined;
  try {
    outputs = createOutputs({
      name: 'repository development adapter',
      stdout: factories.stdout,
      stderr: factories.stderr,
      subscribeInterrupts: interrupts.subscribe,
    });
    await outputs.reportDiagnostic(Buffer.from('development: ' + instruction + '\n'));
  } finally {
    try {
      outputs?.dispose();
    } finally {
      interrupts.dispose();
    }
  }
}

if (import.meta.main) {
  const nativeStdout = Bun.stdout,
    nativeStderr = Bun.stderr;
  const diagnosticFactories = {
    stdout: nativeStdout.writer.bind(nativeStdout),
    stderr: nativeStderr.writer.bind(nativeStderr),
  };
  try {
    const completion = await runRepositoryDevelopment(process.argv.slice(2));
    if (completion.kind === 'exit') process.exit(completion.status);
    process.exitCode = completion.status;
  } catch (cause: unknown) {
    const instruction =
      cause instanceof CallerConfigurationFailure
        ? cause.message
        : 'selected installed PUNI could not complete; verify its reviewed provisioning and PUNI_EXECUTABLE';
    try {
      await reportCallerFailure(instruction, diagnosticFactories);
    } finally {
      process.exit(1);
    }
  }
}
