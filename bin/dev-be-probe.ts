#!/usr/bin/env -S -u BUN_OPTIONS -u BUN_INSPECT_PRELOAD -u NODE_OPTIONS -u BUN_BE_BUN bun --no-env-file --config=/dev/null
import { realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Completion } from '../apps/puni/cli/src/entrypoint';
import type { Context } from '../apps/puni/cli/src/execute-command';
import { createInterrupts, createOutputs } from '../libs/shared/adapters/bun-output/src/index';

class CallerConfigurationFailure extends Error {}

/**
 * Forward backend health to explicitly selected PUNI; --preflight silently checks
 * that its grammar accepts the operation before the deployment caller starts work.
 * Capture caller authority and native writes before importing the selected artifact.
 * The protected executable shebang applies the shared Bun startup contract first.
 * Proof: backend-caller-fault-startup-{bun-options,bun-inspect-preload,node-options,
 * bun-be-bun,configuration,dotenv}-v124b each fails its native startup/erasure
 * control and passes restored. Erasure alone does not prove preload execution.
 * Proof: startup-bun-options/startup-bun-inspect-preload-v124c each actually
 * creates its preload marker when erasure is removed; marker refusal passes restored.
 * @throws on absent/nonabsolute/unreadable selection, unusable main, invalid completion
 * or failed grammar preflight. There is no source/PATH fallback or provisioning.
 */
export async function runRepositoryProbe(args: readonly string[]): Promise<Completion> {
  const operands = [...args];
  const isPreflight = operands.length === 1 && operands[0] === '--preflight';
  const environment = { ...process.env };
  const callerDirectory = process.cwd();
  const runtime = process.execPath;
  const temporaryDirectory = tmpdir();
  const writeStdout = process.stdout.write.bind(process.stdout);
  const writeStderr = process.stderr.write.bind(process.stderr);
  const selected = environment['PUNI_EXECUTABLE'];
  // Proof: backend-caller-fault-absolute-selection-v124b imported the existing
  // relative fixture and returned0; the owning refusal fails, then passes restored.
  if (selected === undefined || !isAbsolute(selected))
    throw new CallerConfigurationFailure(
      'set PUNI_EXECUTABLE to the absolute entrypoint of a separately provisioned reviewed current PUNI installation',
    );
  const entrypoint = realpathSync.native(selected);
  const status = statSync(entrypoint);
  // Proof: backend-caller-fault-{regular,readable}-entrypoint-v124b each loses
  // its explicit regular/readable instruction; both owning controls pass restored.
  // This qualifies boundary diagnostics; later native import can still refuse.
  if (!status.isFile() || (status.mode & 0o444) === 0)
    throw new CallerConfigurationFailure(
      'selected PUNI entrypoint must be a readable regular file',
    );
  const directory = dirname(entrypoint);
  const context: Context = {
    installation: { directory, entrypoint },
    lookup: { directory: callerDirectory, path: environment['PATH'] },
    callerDirectory,
    runtime,
    temporaryDirectory,
    environment,
    stdout: (bytes) => {
      // Proof: backend-caller-fault-silent-preflight-v124b emits help bytes;
      // the exact silent-preflight assertion fails and passes restored.
      if (!isPreflight) writeStdout(bytes);
    },
    stderr: (bytes) => {
      writeStderr(bytes);
    },
  };
  const delivered: unknown = await import(pathToFileURL(entrypoint).href);
  // Proof: backend-caller-fault-callable-main-v124b reaches a later apply refusal
  // and loses this instruction; restoration passes. No successful main7 claim.
  if (
    typeof delivered !== 'object' ||
    delivered === null ||
    !('main' in delivered) ||
    typeof delivered.main !== 'function'
  )
    throw new CallerConfigurationFailure('selected PUNI must export callable main');
  const completion: unknown = await Reflect.apply(delivered.main, delivered, [
    // Proof: backend-caller-fault-{fixed-purpose,argv-retention}-v124b each
    // changes the actual captured vector; own ABI assertions fail and pass restored.
    ['dash', 'dev-probe', 'be', ...(isPreflight ? ['--help'] : operands)],
    context,
  ]);
  // Proof: backend-caller-fault-completion-boundary-v124b admits status256 and
  // exits0 instead of1; restoration passes. This is the whole completion check,
  // not independent omission proof for every kind/type/range conjunct.
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
    throw new CallerConfigurationFailure('selected PUNI returned an invalid completion');
  // Proof: backend-caller-fault-preflight-status-v124b leaves the stale grammar's
  // timer alive until the controlled child SIGKILL; restored config failure exits1.
  if (isPreflight && completion.status !== 0)
    throw new CallerConfigurationFailure(
      'selected PUNI does not accept the backend probe operation',
    );
  return { kind: completion.kind, status: completion.status };
}

/** Report once through the shared bounded native writer, then release local owners. */
async function reportCallerFailure(
  instruction: string,
  factories: Pick<Parameters<typeof createOutputs>[0], 'stdout' | 'stderr'>,
): Promise<void> {
  const interrupts = createInterrupts('repository backend probe');
  let outputs: ReturnType<typeof createOutputs> | undefined;
  try {
    outputs = createOutputs({
      name: 'repository backend probe',
      stdout: factories.stdout,
      stderr: factories.stderr,
      subscribeInterrupts: interrupts.subscribe,
    });
    await outputs.reportDiagnostic(Buffer.from('backend probe caller: ' + instruction + '\n'));
  } finally {
    try {
      outputs?.dispose();
    } finally {
      interrupts.dispose();
    }
  }
}

// Proof: backend-caller-fault-import-guard-v124b dispatches ambient argv during
// library import; its own import/status assertions fail and pass restored.
if (import.meta.main) {
  const nativeStdout = Bun.stdout,
    nativeStderr = Bun.stderr;
  const factories = {
    stdout: nativeStdout.writer.bind(nativeStdout),
    // Proof: backend-caller-fault-native-reporter-v124b uses the replaced writer
    // and loses the actual diagnostic; the restored own stderr assertion passes.
    stderr: nativeStderr.writer.bind(nativeStderr),
  };
  try {
    const completion = await runRepositoryProbe(process.argv.slice(2));
    // Proof: backend-caller-fault-success-terminal-v124b leaves its module timer
    // alive to the controlled kill deadline; restored exit37 settles normally.
    if (completion.kind === 'exit') process.exit(completion.status);
    process.exitCode = completion.status;
  } catch (cause: unknown) {
    const instruction =
      // Proof: backend-caller-fault-private-failure-v124b emits the selected
      // Error's private message; the confidentiality assertion passes restored.
      cause instanceof CallerConfigurationFailure
        ? cause.message
        : 'selected installed PUNI could not complete; verify its reviewed provisioning and PUNI_EXECUTABLE';
    try {
      await reportCallerFailure(instruction, factories);
    } finally {
      // Proof: backend-caller-fault-failure-terminal-v124b leaves its reached
      // timer alive until controlled SIGKILL; restored failure exits1 normally.
      process.exit(1);
    }
  }
}
