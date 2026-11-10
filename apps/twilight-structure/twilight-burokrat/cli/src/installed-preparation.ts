import { realpathSync } from 'node:fs';
import { join } from 'node:path';

import { assertInstalledPlacement } from './installed-placement';
import type { LintRuntime } from './lint-runtime';
import { readLintRuntime } from './lint-runtime';
import { readInstalledBunToolkit } from './packaging/installed';
import { readPreparationSource } from './policy/preparation-source';
import { executePreparation } from './preparation-dispatch';
import { type PreparationExecution, runPreparationOperation } from './preparation-execution';
import type { PreparationRequest } from './preparation-request';
import { anchorPath } from './validator-paths';

interface Context extends PreparationExecution {
  readonly callerDirectory: string;
  readonly installedDirectory: string;
  readonly runtime: LintRuntime;
  readonly launch: (entrypoint: string) => readonly string[];
}

/**
 * Verify package-bound current toolkit and physical package placement before typed preparation.
 * This route calls the preparation APIs in process; it does not execute the toolkit's preparer
 * role bytes or introduce parent IPC. Independently selected Git/runtime authority is preserved.
 * Prior cancellation performs no IO; the caller owns bounded reporting and terminal exit.
 * @throws for invalid package/source/placement or preparation failures, preserving owned causes.
 */
export async function executeInstalledPreparation(
  request: PreparationRequest,
  context: Context,
): Promise<number> {
  const selected = { ...request },
    callerDirectory = context.callerDirectory,
    installedDirectory = context.installedDirectory,
    runtime = {
      directory: context.runtime.directory,
      environment: { ...context.runtime.environment },
    },
    launch = context.launch,
    // Proof: c27-installed-output-capture; callback replacement of the aliased stdout sink made the completed native preparation reject; the focused test passed after copying these capabilities.
    // Proof: c27s-installed-output-capture; output function capture only; no independent claim over other fields; injected fault failed `captures installed output capabilities before the subscription callback can replace aliased sinks`; restoration passed.
    outputs = {
      stdout: context.outputs.stdout,
      stderr: context.outputs.stderr,
      reportDiagnostic: context.outputs.reportDiagnostic,
    },
    subscribeInterrupts = context.subscribeInterrupts;
  const control: { status: 130 | 143 | undefined } = { status: undefined };
  const unsubscribe = subscribeInterrupts((signal) => {
    control.status ??= signal === 'SIGINT' ? 130 : 143;
  });
  unsubscribe();
  // Proof: c27-installed-prior; injected fault failed `returns prior installed preparation cancellation before absent package and runtime IO`; restoration passed.
  if (control.status !== undefined) return control.status;
  const directory = realpathSync.native(installedDirectory);
  const toolkitDirectory =
    selected.command === 'prepare-activation' && selected.toolkit !== undefined
      ? anchorPath(selected.toolkit, callerDirectory)
      : join(directory, 'toolkit');
  const toolkit = readInstalledBunToolkit(directory, toolkitDirectory);
  const authority = {
    callerDirectory,
    toolkitDirectory: toolkit.directory,
    expectedToolkitIdentity: toolkit.digest,
    runtime,
    subscribeInterrupts,
  };
  const selection = await readPreparationSource(
    { candidateRepository: selected.candidateRepository, candidateSha: selected.candidateSha },
    authority,
  );
  // Proof: c27-installed-cancel; injected fault failed `propagates installed source preflight cancellation without invoking preparation outputs`; restoration passed.
  if (selection.kind === 'cancelled') return selection.status;
  // Proof: c27-installed-placement; injected fault failed `refuses candidate-targeted installed package manifest despite external toolkit assets`; restoration passed.
  assertInstalledPlacement(selection.candidateDirectory, directory, selection.toolkit);
  return await executePreparation(selected, { ...authority, launch, outputs });
}

/** Own a typed installed operation before PATH/package/source acquisition; never reparse argv/stdin. */
export function runInstalledPreparation(
  request: PreparationRequest,
  context: {
    readonly callerDirectory: string;
    readonly installedDirectory: string;
    readonly lookup: { readonly directory: string; readonly path: string | undefined };
    readonly launch: (entrypoint: string) => readonly string[];
  },
): Promise<number> {
  const selected = { ...request },
    callerDirectory = context.callerDirectory,
    installedDirectory = context.installedDirectory,
    lookup = { ...context.lookup },
    launch = context.launch;
  return runPreparationOperation((execution) => {
    const path = lookup.path;
    // Proof: c27-installed-path; diagnostic/order: absent PATH also fails readLintRuntime; injected fault failed `owns installed typed preparation before missing PATH and never reads stdin`; restoration passed.
    if (path === undefined) throw new Error('trusted executable PATH is required for preparation');
    return executeInstalledPreparation(selected, {
      callerDirectory,
      installedDirectory,
      runtime: readLintRuntime(path, lookup.directory),
      launch,
      ...execution,
    });
  });
}
