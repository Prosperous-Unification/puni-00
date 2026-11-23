import { Buffer } from 'node:buffer';

import { runInstalledLintLauncher } from '../installed-lint-launcher';
import { hasEnforceCertificate } from '../lint-certificate';
import type { LintInterrupt, SubscribeLintInterrupts } from '../lint-interrupts';
import { lintParentMode } from '../lint-parent-control';
import { readLintRuntime } from '../lint-runtime';
import { anchorPath } from '../validator-paths';
import { RelocationRefusal } from './relocation-refusal';

/** A complete capture or the exact captured prefix when interruption stopped outward delivery. */
export interface CapturedOutput {
  readonly kind: 'complete' | 'prefix';
  readonly bytes: Uint8Array;
}

export type SelfCheckOutcome =
  | { readonly kind: 'certified'; readonly report: Uint8Array; readonly diagnostics: Uint8Array }
  | {
      readonly kind: 'cancelled';
      readonly status: 130 | 143;
      readonly report: CapturedOutput;
      readonly diagnostics: CapturedOutput;
    };

/**
 * The caller owns/authenticates freshly assembled bootstrap bytes and native external placement
 * before this helper. Its launch capability supplies protected selected-Bun startup. One outer
 * preparation owner supplies interruption; this helper installs no native signal handlers.
 */
export interface SelfCheckContext {
  readonly launcher: string;
  readonly callerDirectory: string;
  readonly lookup: { readonly directory: string; readonly path: string };
  readonly activationRoot: string;
  readonly scratchDirectory: string;
  readonly repository: string;
  readonly revision: string;
  readonly launch: (entrypoint: string) => readonly string[];
  readonly subscribeInterrupts: SubscribeLintInterrupts;
}

/**
 * Preserve original diagnostics alongside a lossy display for the CLI. After interruption only
 * normal status1 gets the controller's complete stderr replay; other captured output is a prefix.
 */
export class PreparedSelfCheckFailure extends RelocationRefusal {
  readonly report: CapturedOutput;
  readonly diagnostics: CapturedOutput;
  constructor(
    readonly status: number,
    report: Uint8Array,
    diagnostics: Uint8Array,
    isInterrupted: boolean,
  ) {
    // Proof: selfcheck-report-completeness; `retains complete status1 diagnostics after cancellation without manufacturing cleanup success` failed under its recorded source fault and passed after restoration.
    const reportKind = isInterrupted ? 'prefix' : 'complete';
    const diagnosticsKind = // Proof: selfcheck-status1-completeness; `retains complete status1 diagnostics after cancellation without manufacturing cleanup success` failed under its recorded source fault and passed after restoration.
      // Proof: selfcheck-other-prefix; `preserves other interrupted verdict diagnostics as a captured prefix` failed under its recorded source fault and passed after restoration.
      isInterrupted && status !== 1 ? 'prefix' : 'complete';
    super(
      'R20',
      'prepared activation is not certified by the Bun launcher (exit ' +
        String(status) +
        '); stderr ' +
        diagnosticsKind +
        ': ' +
        Buffer.from(diagnostics).toString('utf8') +
        '; stdout ' +
        reportKind +
        ': ' +
        Buffer.from(report).toString('utf8'),
    );
    this.report = { kind: reportKind, bytes: report };
    this.diagnostics = { kind: diagnosticsKind, bytes: diagnostics };
  }
}

/**
 * Run committed self-certification through the existing ordered parent/launcher owner. The
 * explicit environment exercises the activation archive's default closure, never an operator
 * override. A reported certificate authenticates no executable: caller-established bootstrap
 * authority remains a precondition. Matching recorded cancellation is controlled; normal1 and
 * other nonzero statuses remain failures with retained bytes. No parent escalation competes
 * with detached stage ownership.
 * @throws PreparedSelfCheckFailure for a nonpassing status or missing full certificate;
 * transport, runtime and unexpected certificate failures propagate with their original context.
 */
export async function checkPreparedActivation(
  context: SelfCheckContext,
): Promise<SelfCheckOutcome> {
  const runtime = readLintRuntime(context.lookup.path, context.lookup.directory);
  const stdout: Uint8Array[] = [],
    stderr: Uint8Array[] = [];
  const interruption: { first: LintInterrupt | undefined } = { first: undefined };
  const status = await runInstalledLintLauncher({
    // Proof: selfcheck-parent-lane; `runs committed self-certification through the actual delivered launcher and archive-default closure` failed under its recorded source fault and passed after restoration.
    argv: [
      // Proof: selfcheck-protected-launch; `uses the protected launch capability and does not inherit a closure override` failed under its recorded source fault and passed after restoration.
      ...context.launch(context.launcher),
      lintParentMode,
    ],
    directory: runtime.directory,
    environment: {
      // Proof: selfcheck-closure-isolation; `uses the protected launch capability and does not inherit a closure override` failed under its recorded source fault and passed after restoration.
      ...runtime.environment,
      // Proof: selfcheck-activation-root; `certifies the real IPC peer only from a complete report with exact captured bytes` failed under its recorded source fault and passed after restoration.
      TOOL_WIKI_ACTIVATION_ROOT: anchorPath(context.activationRoot, context.callerDirectory),
      // Proof: selfcheck-required-admission; `requires admission78 from the actual launcher when its validator reports only certified true` failed under its recorded source fault and passed after restoration.
      TOOL_WIKI_REQUIRE_CERTIFIED: '1',
      // Proof: selfcheck-scratch-root; `certifies the real IPC peer only from a complete report with exact captured bytes` failed under its recorded source fault and passed after restoration.
      TMPDIR: anchorPath(context.scratchDirectory, context.callerDirectory),
    },
    stdin: Buffer.from(
      JSON.stringify({
        // Proof: selfcheck-request-version; `certifies the real IPC peer only from a complete report with exact captured bytes` failed under its recorded source fault and passed after restoration.
        version: 1,
        // Proof: selfcheck-request-caller; `certifies the real IPC peer only from a complete report with exact captured bytes` failed under its recorded source fault and passed after restoration.
        callerDirectory: context.callerDirectory,
        request: {
          // Proof: selfcheck-request-command; `certifies the real IPC peer only from a complete report with exact captured bytes` failed under its recorded source fault and passed after restoration.
          command: 'lint',
          // Proof: selfcheck-request-committed; `certifies the real IPC peer only from a complete report with exact captured bytes` failed under its recorded source fault and passed after restoration.
          kind: 'committed',
          // Proof: selfcheck-request-repository; `certifies the real IPC peer only from a complete report with exact captured bytes` failed under its recorded source fault and passed after restoration.
          repository: context.repository,
          // Proof: selfcheck-request-revision; `certifies the real IPC peer only from a complete report with exact captured bytes` failed under its recorded source fault and passed after restoration.
          revision: context.revision,
        },
      }),
    ),
    stdout: (bytes) => {
      // Proof: selfcheck-captured-report; `certifies the real IPC peer only from a complete report with exact captured bytes` failed under its recorded source fault and passed after restoration.
      stdout.push(bytes.slice());
      return { kind: 'written' };
    },
    stderr: (bytes) => {
      // Proof: selfcheck-captured-diagnostic; `certifies the real IPC peer only from a complete report with exact captured bytes` failed under its recorded source fault and passed after restoration.
      stderr.push(bytes.slice());
      return { kind: 'written' };
    },
    reportDiagnostic: (bytes) => {
      // Proof: selfcheck-complete-diagnostic-replay; `retains complete status1 diagnostics after cancellation without manufacturing cleanup success` failed under its recorded source fault and passed after restoration.
      stderr.push(bytes.slice());
      return Promise.resolve({ kind: 'reported' });
    },
    subscribeInterrupts: (listener) =>
      context.subscribeInterrupts((signal) => {
        // Proof: selfcheck-first-signal; `returns recorded first cancellation and releases its only controller subscription` failed under its recorded source fault and passed after restoration.
        interruption.first ??= signal;
        // Proof: selfcheck-signal-forwarding; `delivers first cancellation through the actual self-check chain and confirms stage cleanup` failed under its recorded source fault and passed after restoration.
        listener(signal);
      }),
  });
  const report = Buffer.concat(stdout),
    diagnostics = Buffer.concat(stderr);
  const first = interruption.first;
  if (first !== undefined) {
    const expected = first === 'SIGINT' ? 130 : 143; // Proof: selfcheck-cancel-reason; `returns recorded first cancellation and releases its only controller subscription` failed under its recorded source fault and passed after restoration.
    // Proof: selfcheck-cancel-match; `refuses a nonzero peer status that does not match the recorded first signal` failed under its recorded source fault and passed after restoration.
    if (status === expected)
      return {
        kind: 'cancelled',
        status: expected,
        report: { kind: 'prefix', bytes: report },
        diagnostics: { kind: 'prefix', bytes: diagnostics },
      };
    // Proof: selfcheck-normal1-refusal; `retains complete status1 diagnostics after cancellation without manufacturing cleanup success` failed under its recorded source fault and passed after restoration.
    throw new PreparedSelfCheckFailure(status, report, diagnostics, true);
  }
  if (
    // Proof: selfcheck-normal-nonzero; `does not interpret an unrequested normal130 peer status as cancellation` failed under its recorded source fault and passed after restoration.
    // Proof: selfcheck-certificate; `refuses zero peer status missing certificate schemaVersion` failed under its recorded source fault and passed after restoration.
    status !== 0 ||
    !hasEnforceCertificate(report)
  )
    throw new PreparedSelfCheckFailure(status, report, diagnostics, false);
  return { kind: 'certified', report, diagnostics };
}
