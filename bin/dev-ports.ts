import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Completion } from '../apps/puni/cli/src/entrypoint';
import type { Context } from '../apps/puni/cli/src/execute-command';
import { createInterrupts, createOutputs } from '../libs/shared/adapters/bun-output/src/index';

class CallerConfigurationFailure extends Error {}

/**
 * Forward only the repository development-port purpose to the explicitly selected delivered main.
 * The repository belongs to this adapter; installation dirname never supplies checkout authority.
 * Capture arguments, caller, environment (including empty overrides), runtime and native writes
 * before importing. PUNI owns parsing, port observation and release; no child/signal owner is added.
 * @throws on absent/nonabsolute selection, failed import, unusable main or invalid completion.
 * No PATH/source fallback, default provisioning, import cancellation or arbitrary-resource cleanup.
 */
export async function runRepositoryPorts(args: readonly string[]): Promise<Completion> {
  const operands = [...args];
  const environment = { ...process.env };
  const callerDirectory = process.cwd();
  const repository = realpathSync.native(resolve(dirname(import.meta.path), '..'));
  const runtime = process.execPath;
  const temporaryDirectory = tmpdir();
  const writeStdout = process.stdout.write.bind(process.stdout);
  const writeStderr = process.stderr.write.bind(process.stderr);
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
    stdout: (bytes) => {
      writeStdout(bytes);
    },
    stderr: (bytes) => {
      writeStderr(bytes);
    },
  };
  const delivered: unknown = await import(pathToFileURL(entrypoint).href);
  // Proof: A07 omitted this whole callable-main condition; main7 still refused downstream,
  // but its named instruction became generic. Exact restoration passed; classification only.
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
    ['dash', 'dev-ports', ...operands, '--repository', repository],
    context,
  ]);
  // Proof: A06 omitted this whole completion condition; drain/status256 reached exit0 instead
  // of1 after its replacement-ready witness. Exact restoration passed; no per-conjunct proof.
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
  const interrupts = createInterrupts('repository dev-port adapter');
  let outputs: ReturnType<typeof createOutputs> | undefined;
  try {
    outputs = createOutputs({
      name: 'repository dev-port adapter',
      stdout: factories.stdout,
      // Proof: A04/A05 used a late Bun.stderr factory; import/completion replacement controls
      // then saw empty native stderr and replacement-writer bytes. Restoration passed; stderr only.
      stderr: factories.stderr,
      subscribeInterrupts: interrupts.subscribe,
    });
    await outputs.reportDiagnostic(Buffer.from('development ports: ' + instruction + '\n'));
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
    const completion = await runRepositoryPorts(process.argv.slice(2));
    // Proof: A01 replaced terminal exit with exitCode assignment; its retained-timer control
    // hit its inner5s SIGKILL deadline at the signal assertion. Restoration passed; no ready witness.
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
      // Proof: A02/A03 replaced this terminal exit with exitCode assignment; both actual ready
      // witnesses passed before the inner5s SIGKILL assertion failed. Exact restoration passed.
      // This is one failure-terminal effect, not a flush or arbitrary-resource cleanup proof.
      process.exit(1);
    }
  }
}
