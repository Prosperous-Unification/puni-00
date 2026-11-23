import { Buffer } from 'node:buffer';

import { createLaunch } from '@shared/bun-startup';

import { readExecutionInput } from './execution-input';
import { readLintRuntime } from './lint-runtime';
import { executePreparation } from './preparation-dispatch';
import { type PreparationExecution, runPreparationOperation } from './preparation-execution';
import {
  decodePreparationRequest,
  type PreparationCommand,
  PreparationUsageRefusal,
} from './preparation-request';

declare const __PUNI_PREPARATION_BUN_VERSION__: string;

interface Context extends PreparationExecution {
  readonly directory: string;
  readonly path: string | undefined;
  readonly launch: (entrypoint: string) => readonly string[];
}

/**
 * Read only the closed private transport for this compiled role and invoke the typed API.
 * Program lookup is captured independently of the invocation's selected toolkit. Runtime pin,
 * usage, stdin and PATH failures remain inside the caller's bounded execution owner. Reusable
 * callers provide their own signal/output context; this function installs no native handlers.
 */
export async function runPreparationMain(
  role: PreparationCommand,
  argv: readonly string[],
  context: Context,
): Promise<number> {
  try {
    // Proof: c27-main-build-pin; diagnostic/order: absent build pin would also fail the differing pin comparison; injected fault failed `actual preparation refuses absent build runtime pin before request input`; restoration passed.
    // Proof: c27s-valid-admission-absent-pin; paired absent/different build-pin fences; no independent missing-pin admission claim; injected fault failed `refuses actual valid preparation at the absent-pin admission boundary before output ownership`; restoration passed.
    if (typeof __PUNI_PREPARATION_BUN_VERSION__ === 'undefined')
      throw new Error('preparation executable has no build runtime pin');
    // Proof: c27-main-runtime-pin; early runtime-pin diagnostic/status ordering: removed pin check reaches later malformed-input usage64; independent valid-request admission is supplemental; injected fault failed `actual preparation refuses different build runtime pin before request input`; restoration passed.
    // Proof: c27s-valid-admission-runtime; injected fault failed `refuses actual valid preparation at the wrong-pin admission boundary before output ownership`; restoration passed.
    // Proof: c27s-valid-admission-absent-pin; paired absent/different build-pin fences; no independent missing-pin admission claim; injected fault failed `refuses actual valid preparation at the absent-pin admission boundary before output ownership`; restoration passed.
    if (__PUNI_PREPARATION_BUN_VERSION__ !== Bun.version)
      throw new Error('preparation executable was built with another Bun');
    // Proof: c27-main-argv; early private-mode diagnostic ordering: removed argv check reaches malformed-input usage refusal; independent valid-request admission is supplemental; injected fault failed `actual prepare-activation refuses argv [] before input IO` and 5 additional named controls; restoration passed.
    // Proof: c27s-valid-admission-mode; injected fault failed `refuses actual valid preparation at the missing-mode admission boundary before output ownership`; restoration passed.
    if (argv.length !== 1 || argv[0] !== '--puni-preparation-v1')
      throw new PreparationUsageRefusal('expected --puni-preparation-v1');
    const input = await readExecutionInput(context.subscribeInterrupts);
    if (input.kind === 'cancelled') return input.status;
    const invocation = decodePreparationRequest(input.bytes, role);
    const path = context.path;
    // Proof: c27-main-path; diagnostic/order: absent PATH also fails readLintRuntime; injected fault failed `contains a missing standalone preparation PATH inside the bounded native reporter`; restoration passed.
    if (path === undefined) throw new Error('preparation requires an explicit PATH');
    return await executePreparation(invocation.request, {
      callerDirectory: invocation.callerDirectory,
      toolkitDirectory: invocation.toolkitDirectory,
      expectedToolkitIdentity: invocation.expectedToolkitIdentity,
      runtime: readLintRuntime(path, context.directory),
      launch: context.launch,
      outputs: context.outputs,
      subscribeInterrupts: context.subscribeInterrupts,
    });
  } catch (cause) {
    if (!(cause instanceof PreparationUsageRefusal)) throw cause;
    const written = await context.outputs.stderr(
      Buffer.from('puni preparation: ' + cause.message + '\n'),
    );
    return written.kind === 'cancelled' ? (written.signal === 'SIGINT' ? 130 : 143) : cause.status;
  }
}

/** Own one standalone role through terminal reporting; its entry calls exit after settlement. */
export function runPreparationExecutable(
  role: PreparationCommand,
  argv: readonly string[],
  program: { readonly directory: string; readonly runtime: string },
): Promise<number> {
  const selected = { ...program },
    args = [...argv];
  return runPreparationOperation((execution) =>
    runPreparationMain(role, args, {
      ...execution,
      directory: selected.directory,
      path: process.env['PATH'],
      launch: (entrypoint) => createLaunch(selected.runtime, entrypoint),
    }),
  );
}
