import { Buffer } from 'node:buffer';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';

import { createLaunch } from '@shared/bun-startup';

import { LintActivationRefusal } from './lint-activation';
import { createLintInterrupts, type SubscribeLintInterrupts } from './lint-interrupts';
import { createLintOutputs, type LintOutputs } from './lint-output';
import {
  createLintParentControl,
  type LintParentControl,
  lintParentMode,
} from './lint-parent-control';
import { decodeLintRequest, LintUsageRefusal } from './lint-request';
import { runLint } from './run-lint';

declare const __PUNI_LINT_BUN_VERSION__: string;

type Input =
  | { readonly kind: 'input'; readonly bytes: Uint8Array }
  | { readonly kind: 'cancelled'; readonly status: 130 | 143 };

async function readInput(subscribe: SubscribeLintInterrupts): Promise<Input> {
  const reader = Bun.stdin.stream().getReader();
  const cancellation = Promise.withResolvers<Input>();
  const unsubscribe = subscribe((signal) => {
    cancellation.resolve({ kind: 'cancelled', status: signal === 'SIGINT' ? 130 : 143 });
  });
  const input = (async (): Promise<Input> => {
    const chunks: Uint8Array[] = [];
    for (;;) {
      const next = await reader.read();
      if (next.done) return { kind: 'input', bytes: Buffer.concat(chunks) };
      chunks.push(next.value);
    }
  })();
  try {
    // Proof: main-stdin-cancel; `standalone Bun lint boundary > cancels the executable boundary while stdin remains open` fails with this injected fault and passes after restoration.
    const selected = await Promise.race([input, cancellation.promise]);
    if (selected.kind === 'cancelled') {
      await reader.cancel();
      await input;
    }
    return selected;
  } finally {
    unsubscribe();
    reader.releaseLock();
  }
}

/**
 * Read the standalone launcher's stdin and environment boundary with caller-owned signals/output. Only the closed
 * internal lint mode is supported. The build embeds its exact Bun version; unpinned source
 * execution is refused. Missing PATH is trusted-state failure, never an inherited/default grant.
 * @throws for missing build/runtime prerequisites and unexpected implementation failures.
 */
export async function runLintMain(
  argv: readonly string[],
  context: {
    readonly outputs: Pick<LintOutputs, 'stdout' | 'stderr'>;
    readonly subscribeInterrupts: SubscribeLintInterrupts;
  },
): Promise<number> {
  try {
    // Proof: main-build-runtime-pin; `refuses an unpinned or mismatched standalone runtime undefined` fails with this injected fault and passes after restoration.
    if (typeof __PUNI_LINT_BUN_VERSION__ === 'undefined')
      throw new Error('lint launcher has no build runtime pin');
    // Proof: main-runtime-pin; `refuses an unpinned or mismatched standalone runtime 0.0.0` fails with this injected fault and passes after restoration.
    if (__PUNI_LINT_BUN_VERSION__ !== Bun.version)
      throw new Error('lint launcher was built with another Bun');
    // Proof: main-argc; `standalone Bun lint boundary > refuses unsupported argv ["--puni-lint-v1","extra"] as usage` fails with this injected fault and passes after restoration.
    // Proof: main-mode; `standalone Bun lint boundary > refuses unsupported argv ["working"] as usage` fails with this injected fault and passes after restoration.
    if (argv.length !== 1 || argv[0] !== '--puni-lint-v1')
      throw new LintUsageRefusal('expected --puni-lint-v1');
    const source = await readInput(context.subscribeInterrupts);
    if (source.kind === 'cancelled') return source.status;
    const invocation = decodeLintRequest(source.bytes);
    const required = process.env['TOOL_WIKI_REQUIRE_CERTIFIED'];
    // Proof: main-required-setting; `standalone Bun lint boundary > refuses invalid required-admission configuration ""` fails with this injected fault and passes after restoration.
    if (required !== undefined && required !== '0' && required !== '1')
      throw new LintUsageRefusal('TOOL_WIKI_REQUIRE_CERTIFIED must be 0 or 1');
    const path = process.env['PATH'];
    // Proof: main-explicit-path; `refuses a missing explicit PATH before optional activation can return` fails with this injected fault and passes after restoration.
    if (path === undefined) throw new Error('lint launcher requires an explicit PATH');
    return await runLint(invocation, {
      runtimeDirectory: dirname(import.meta.path),
      path,
      activationRoot: process.env['TOOL_WIKI_ACTIVATION_ROOT'],
      trustedNodeModules: process.env['TOOL_WIKI_TRUSTED_NODE_MODULES'],
      required: required === '1',
      scratchDirectory: tmpdir(),
      launch: (entrypoint) => createLaunch(process.execPath, entrypoint),
      stdout: context.outputs.stdout,
      stderr: context.outputs.stderr,
      subscribeInterrupts: context.subscribeInterrupts,
    });
  } catch (cause) {
    if (!(cause instanceof LintUsageRefusal) && !(cause instanceof LintActivationRefusal))
      throw cause;
    // Proof: main-refusal-output-await; `preserves cancellation while awaiting a modeled usage refusal write` fails with this injected fault and passes after restoration.
    const written = await context.outputs.stderr(
      Buffer.from('tool-wiki lint: ' + cause.message + '\n'),
    );
    // Proof: main-refusal-output-cancel; `preserves cancellation while awaiting a modeled usage refusal write` fails with this injected fault and passes after restoration.
    return written.kind === 'cancelled' ? (written.signal === 'SIGINT' ? 130 : 143) : cause.status;
  }
}

/**
 * Own executable output and native signals through API cleanup. Unexpected failures receive
 * one bounded diagnostic through the same stderr sink; failed or stalled output is explicitly
 * abandoned. The executable then exits even when failed group cleanup retained native refs.
 */
export async function runLintExecutable(argv: readonly string[]): Promise<number> {
  const interrupts = createLintInterrupts();
  const outputs = createLintOutputs({
    stdout: () => Bun.stdout.writer(),
    stderr: () => Bun.stderr.writer(),
    subscribeInterrupts: interrupts.subscribe,
  });
  async function reportFailure(cause: unknown): Promise<1> {
    try {
      await outputs.reportDiagnostic(
        Buffer.from(
          'tool-wiki lint: ' + (cause instanceof Error ? cause.message : String(cause)) + '\n',
        ),
      );
    } catch {
      // Proof: main-terminal-report-contained; `contains terminal reporting failures without Bun automatic reporting` fails with this injected fault and passes after restoration.
      // Terminal reporting/release failure is exit 1; another reporter would be unowned.
      return 1;
    }
    return 1;
  }
  let status: number;
  let parent: LintParentControl | undefined;
  try {
    // Proof: executable-private-argc; `refuses extra private parent argv before handshake or request IO` failed with the recorded source fault and passed after restoration.
    const isParent = argv.length === 1 && argv[0] === lintParentMode;
    parent = createLintParentControl(interrupts, isParent);
    // Proof: executable-start-gate; `does not read the typed request after pre-start cancel` failed with the recorded source fault and passed after restoration.
    const start = parent.kind === 'connected' ? await parent.start : { kind: 'started' as const };
    // Proof: executable-start-failure-before-io; `does not read the typed request after pre-start invalid` failed with the recorded source fault and passed after restoration.
    if (start.kind === 'failed') throw start.cause;
    status =
      // Proof: executable-start-cancel-before-io; `does not read the typed request after pre-start cancel` failed with the recorded source fault and passed after restoration.
      start.kind === 'cancelled'
        ? start.signal === 'SIGINT'
          ? 130
          : 143
        : // Proof: executable-typed-mode; `actual installed launcher ordered parent control > does not launch a stage before start and reports finished after lifecycle settlement` failed with the recorded source fault and passed after restoration.
          await runLintMain(isParent ? ['--puni-lint-v1'] : argv, {
            outputs,
            subscribeInterrupts: interrupts.subscribe,
          });
    const failure = parent.kind === 'connected' ? parent.readFailure() : undefined;
    // Proof: executable-read-control-failure; `actual installed launcher ordered parent control > cleans its actual live stage after duplicate-start` failed with the recorded source fault and passed after restoration.
    if (failure !== undefined) throw failure;
  } catch (cause) {
    status = await reportFailure(cause);
  }
  if (parent?.kind === 'connected') {
    try {
      // Proof: executable-control-before-dispose; `contains actual child broker-dispose-late failures within its owned executable boundary` failed with the recorded source fault and passed after restoration.
      // Proof: executable-release-contained; `contains actual child release failures within its owned executable boundary` failed with the recorded source fault and passed after restoration.
      parent.releaseControl();
    } catch (cause) {
      status = await reportFailure(cause);
    }
  }
  try {
    // Proof: main-terminal-disposal-contained; `contains terminal disposal failures without Bun automatic reporting` fails with this injected fault and passes after restoration.
    outputs.dispose();
  } catch (cause) {
    status = await reportFailure(cause);
  }
  try {
    interrupts.dispose();
  } catch (cause) {
    status = await reportFailure(cause);
  }
  if (parent?.kind === 'connected') {
    try {
      // Proof: executable-finished-contained; `contains actual child finished-late failures within its owned executable boundary` failed with the recorded source fault and passed after restoration.
      parent.finishLifecycle();
    } catch (cause) {
      status = await reportFailure(cause);
    }
  }
  return status;
}

// Proof: main-terminal-native-exit; `exits after unconfirmed group cleanup with PID diagnostics and retained scratch` fails with this injected fault and passes after restoration.
if (import.meta.main) process.exit(await runLintExecutable(process.argv.slice(2)));
