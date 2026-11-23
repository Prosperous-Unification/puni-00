import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Completion } from '../apps/puni/cli/src/entrypoint';
import type { Context } from '../apps/puni/cli/src/execute-command';
import { createInterrupts, createOutputs } from '../libs/shared/adapters/bun-output/src/index';

class CallerConfigurationFailure extends Error {}

/**
 * Invoke the explicitly provisioned delivered PUNI main export in this Bun process.
 * Capture caller paths, operands, environment and native output functions before module loading.
 * The installed root retains grammar, toolkit/placement/activation validation and lint's native
 * lifetime; this adapter creates no child, signal forwarder or competing escalation timer.
 *
 * @throws for missing/nonabsolute PUNI_EXECUTABLE, unreadable installation, an unusable main
 * export, malformed completion or unexpected installed-module failures. No PATH/source fallback.
 * Cancellation during module import has no adapter-owned lifecycle and remains a native signal.
 */
export async function runRepositoryLint(args: readonly string[]): Promise<Completion> {
  const operands = [...args];
  const environment = { ...process.env };
  const selected = environment['PUNI_EXECUTABLE'];
  if (selected === undefined || !isAbsolute(selected))
    throw new CallerConfigurationFailure(
      'set PUNI_EXECUTABLE to the absolute entrypoint of a separately provisioned reviewed current PUNI installation',
    );
  const entrypoint = realpathSync.native(selected);
  const directory = dirname(entrypoint);
  const writeStdout = process.stdout.write.bind(process.stdout);
  const writeStderr = process.stderr.write.bind(process.stderr);
  const context: Context = {
    installation: { directory, entrypoint },
    lookup: { directory, path: environment['PATH'] },
    callerDirectory: process.cwd(),
    runtime: process.execPath,
    temporaryDirectory: tmpdir(),
    environment,
    stdout: (chunk) => {
      writeStdout(chunk);
    },
    stderr: (chunk) => {
      writeStderr(chunk);
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
  // The delivered ESM ABI is dynamic; validate its unknown return at the completion boundary.
  const completion: unknown = await Reflect.apply(delivered.main, delivered, [
    ['bur', 'lint', ...operands],
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

/**
 * Make one shared bounded diagnostic attempt after executable failure. Abandoned or failed
 * reporting remains exit1; this does not flush an abandoned sink or clean imported resources.
 * Both successful local acquisitions receive their release attempt before terminal exit.
 */
async function reportCallerFailure(
  instruction: string,
  factories: Pick<Parameters<typeof createOutputs>[0], 'stdout' | 'stderr'>,
): Promise<void> {
  const interrupts = createInterrupts('repository lint adapter');
  let outputs: ReturnType<typeof createOutputs> | undefined;
  try {
    outputs = createOutputs({
      name: 'repository lint adapter',
      stdout: factories.stdout,
      stderr: factories.stderr,
      subscribeInterrupts: interrupts.subscribe,
    });
    await outputs.reportDiagnostic(Buffer.from('tool-wiki lint: ' + instruction + '\n'));
  } finally {
    try {
      outputs?.dispose();
    } finally {
      interrupts.dispose();
    }
  }
}

if (import.meta.main) {
  const nativeStdout = Bun.stdout;
  const nativeStderr = Bun.stderr;
  // Proof: V2's delivered import/completion output-replacement controls reached ready/normal1,
  // then failed at runtime-root.test.ts:819: empty native stderr and replacement-writer bytes.
  // This observes stderr retention only, not independent stdout or native flush necessity.
  const diagnosticFactories = {
    stdout: nativeStdout.writer.bind(nativeStdout),
    stderr: nativeStderr.writer.bind(nativeStderr),
  };
  try {
    const completion = await runRepositoryLint(process.argv.slice(2));
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
      // Proof: V1's retained import/completion timer controls reached ready, then failed
      // `signalCode` at runtime-root.test.ts:745: timeout SIGTERM after5000ms. No flush
      // or arbitrary imported-resource cleanup was observed by that two-case RED.
      process.exit(1);
    }
  }
}
