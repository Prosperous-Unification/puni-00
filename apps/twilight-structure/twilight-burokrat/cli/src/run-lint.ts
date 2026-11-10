import { Buffer } from 'node:buffer';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

import { assertGitVersionResponse } from './git-environment';
import { decodeCandidateRoot } from './inventory/read-candidate';
import { readLintActivation } from './lint-activation';
import { hasEnforceCertificate } from './lint-certificate';
import { LintCleanupFailure, runLintChild } from './lint-child';
import type { SubscribeLintInterrupts } from './lint-interrupts';
import type { LintOutput } from './lint-output';
import type { LintInvocation } from './lint-request';
import { type LintRuntime, readLintRuntime } from './lint-runtime';
import { anchorPath } from './validator-paths';
import type { Request as ValidatorRequest } from './validator-request';

export interface LintContext {
  readonly runtimeDirectory: string;
  readonly path: string;
  readonly activationRoot: string | undefined;
  readonly trustedNodeModules: string | undefined;
  readonly required: boolean;
  readonly scratchDirectory: string;
  readonly launch: (entrypoint: string) => readonly string[];
  readonly stdout: LintOutput;
  readonly stderr: LintOutput;
  readonly subscribeInterrupts: SubscribeLintInterrupts;
}

function isWithin(root: string, path: string): boolean {
  const offset = relative(root, path);
  return (
    offset === '' || (offset !== '..' && !offset.startsWith('..' + sep) && !isAbsolute(offset))
  );
}

export type LintCandidateOutcome =
  | { readonly kind: 'candidate'; readonly directory: string }
  | { readonly kind: 'cancelled'; readonly status: 130 | 143 };

/**
 * Own asynchronous Git version/root probes under the invocation's interruption source.
 * Each probe settles its group and pipes before another stage can start. A synchronous probe
 * delays Bun signal delivery and cannot preserve controlled cancellation while its child blocks.
 */
export async function readLintCandidate(
  invocation: LintInvocation,
  runtime: LintRuntime,
  subscribeInterrupts: SubscribeLintInterrupts,
): Promise<LintCandidateOutcome> {
  const common = {
    // Proof: preflight-trusted-cwd; `runs both Git probes from the trusted runtime cwd after PATH is frozen` fails with this injected fault and passes after restoration.
    directory: runtime.directory,
    // Proof: preflight-explicit-environment; `runs both Git probes from the trusted runtime cwd after PATH is frozen` fails with this injected fault and passes after restoration.
    environment: runtime.environment,
    // Proof: preflight-interruption-source; `does not spawn a Git probe after prior cancellation reaches its direct API` fails with this injected fault and passes after restoration.
    subscribeInterrupts,
  };
  const version = await runLintChild({
    ...common,
    argv: ['git', '--version'],
    stage: 'Git version',
    stdin: undefined,
    stdout: () => ({ kind: 'written' }),
    stderr: () => ({ kind: 'written' }),
  });
  // Proof: preflight-version-cancel; `owns cancellation during the version Git probe with bounded first-signal grace` fails with this injected fault and passes after restoration.
  if (version.kind === 'cancelled') return { kind: 'cancelled', status: version.status };
  // Proof: preflight-version-before-root; `refuses unsupported Git before optional inactive activation can return` fails with this injected fault and passes after restoration.
  // Proof: preflight-version-order; `refuses unsupported Git before optional inactive activation can return` fails with this injected fault and passes after restoration.
  assertGitVersionResponse(version.status, Buffer.from(version.stdout).toString());
  const errors: Uint8Array[] = [];
  const root = await runLintChild({
    ...common,
    argv: [
      'git',
      '-C',
      anchorPath(invocation.request.repository, invocation.callerDirectory),
      'rev-parse',
      '--show-toplevel',
    ],
    stage: 'candidate root',
    stdin: undefined,
    stdout: () => ({ kind: 'written' }),
    stderr: (bytes) => {
      errors.push(bytes.slice());
      return { kind: 'written' };
    },
  });
  // Proof: preflight-root-cancel; `owns cancellation during the root Git probe with bounded first-signal grace` fails with this injected fault and passes after restoration.
  if (root.kind === 'cancelled') return { kind: 'cancelled', status: root.status };
  return {
    kind: 'candidate',
    directory: realpathSync.native(
      decodeCandidateRoot({
        exitCode: root.status,
        stdout: root.stdout,
        stderr: Buffer.concat(errors).toString(),
      }),
    ),
  };
}

/**
 * Verify current activation, execute its authenticated snapshotter, then execute only the
 * captured validator with a typed request. Optional absence is visible; required zero verdicts
 * additionally require the enforce certificate. Output is forwarded as original bytes.
 * The installed launcher remains authority; the selected launcher's bytes are verified but
 * never recursively executed. The caller owns native signal registration and protected startup.
 */
export async function runLint(invocation: LintInvocation, context: LintContext): Promise<number> {
  const cancellation: { status: 130 | 143 | undefined } = { status: undefined };
  const unsubscribe = context.subscribeInterrupts((signal) => {
    cancellation.status ??= signal === 'SIGINT' ? 130 : 143;
  });
  unsubscribe();
  // Proof: driver-recorded-cancel; `preserves recorded cancellation before optional activation preflight` fails with this injected fault and passes after restoration.
  if (cancellation.status !== undefined) return cancellation.status;
  const runtime = readLintRuntime(context.path, context.runtimeDirectory);
  // Proof: preflight-no-early-scratch; `preserves unconfirmed preflight cleanup without creating activation scratch` fails with this injected fault and passes after restoration.
  const candidate = await readLintCandidate(invocation, runtime, context.subscribeInterrupts);
  // Proof: preflight-driver-cancel; `owns cancellation during the version Git probe with bounded first-signal grace` fails with this injected fault and passes after restoration.
  if (candidate.kind === 'cancelled') return candidate.status;
  const candidateRoot = candidate.directory;
  const selected = readLintActivation({
    candidateRoot,
    callerDirectory: invocation.callerDirectory,
    activationRoot: context.activationRoot,
    trustedNodeModules: context.trustedNodeModules,
    required: context.required,
  });
  if (selected.kind === 'inactive') {
    // Proof: driver-inactive-output-await; `preserves cancellation of the optional inactive report without creating scratch` fails with this injected fault and passes after restoration.
    const written = await context.stdout(
      Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          status: 'inactive',
          certified: false,
          reason: selected.reason,
        }) + '\n',
      ),
    );
    // Proof: driver-inactive-output-cancel; `preserves cancellation of the optional inactive report without creating scratch` fails with this injected fault and passes after restoration.
    return written.kind === 'cancelled' ? (written.signal === 'SIGINT' ? 130 : 143) : 0;
  }
  const base = realpathSync.native(context.scratchDirectory);
  // Proof: driver-scratch-external; `refuses scratch inside the actual candidate before creating files` fails with this injected fault and passes after restoration.
  if (isWithin(candidateRoot, base))
    throw new Error('lint scratch root must be outside the candidate repository');
  const scratch = mkdtempSync(join(base, 'puni-lint-'));
  let canRelease = true;
  try {
    const activation = selected.activation;
    const rolePath = (role: keyof typeof activation.manifest.roles) =>
      join(activation.directory, activation.manifest.roles[role]);
    const committed = invocation.request.kind === 'committed';
    const binding = rolePath(committed ? 'ciBinding' : 'localBinding');
    const validator = join(scratch, 'validator.mjs');
    const snapshot = await runLintChild({
      argv: [
        ...context.launch(rolePath('snapshotter')),
        binding,
        rolePath('validator'),
        candidateRoot,
        validator,
      ],
      directory: activation.directory,
      environment: runtime.environment,
      stage: 'snapshotter',
      stdin: undefined,
      stdout: context.stdout,
      stderr: context.stderr,
      subscribeInterrupts: context.subscribeInterrupts,
    });
    // Proof: driver-snapshot-verdict; `retains a nonzero snapshotter verdict and never invokes the validator` fails with this injected fault and passes after restoration.
    if (snapshot.status !== 0) return snapshot.status;
    const request: ValidatorRequest = committed
      ? {
          command: 'lint-ci',
          kind: 'committed',
          repository: candidateRoot,
          revision: invocation.request.revision,
          evidence: rolePath('evidence'),
        }
      : {
          command: 'lint-local',
          mode: invocation.request.kind === 'working' ? 'observe' : 'ratchet',
          kind: invocation.request.kind,
          repository: candidateRoot,
          revision: invocation.request.revision,
          binding: binding,
          evidence: rolePath('evidence'),
        };
    const environment: Record<string, string> = {
      ...runtime.environment,
      TOOL_WIKI_TRUSTED_NODE_MODULES: selected.trustedNodeModules,
    };
    // Proof: driver-committed-binding; `Bun lint activation execution > captures and invokes the selected validator for working` fails with this injected fault and passes after restoration.
    if (committed) environment['TOOL_WIKI_CI_TRUSTED_BINDING'] = binding;
    const verdict = await runLintChild({
      argv: [...context.launch(validator), '--puni-request-v1'],
      directory: scratch,
      environment,
      stage: 'validator',
      stdin: Buffer.from(
        JSON.stringify({ version: 1, callerDirectory: invocation.callerDirectory, request }),
      ),
      stdout: context.stdout,
      stderr: context.stderr,
      subscribeInterrupts: context.subscribeInterrupts,
    });
    // Proof: driver-verdict-status; `Bun lint activation execution > preserves raw binary output and a nonzero validator verdict` fails with this injected fault and passes after restoration.
    if (verdict.status !== 0 || !context.required) return verdict.status;
    // Proof: driver-required-certificate; `Bun lint activation execution > refuses a zero verdict missing certificate field schemaVersion` fails with this injected fault and passes after restoration.
    if (hasEnforceCertificate(verdict.stdout)) return 0;
    // Proof: driver-required-refusal-await; `preserves cancellation of a required certificate refusal report` fails with this injected fault and passes after restoration.
    const written = await context.stderr(
      Buffer.from('tool-wiki lint: required admission did not return certified enforce output\n'),
    );
    // Proof: driver-required-refusal-cancel; `preserves cancellation of a required certificate refusal report` fails with this injected fault and passes after restoration.
    return written.kind === 'cancelled' ? (written.signal === 'SIGINT' ? 130 : 143) : 78;
  } catch (cause) {
    if (cause instanceof LintCleanupFailure) {
      // Proof: driver-retain-scratch; `retains owned scratch when process-group cleanup cannot be confirmed` fails with this injected fault and passes after restoration.
      canRelease = false;
      throw new LintCleanupFailure([cause], cause.message + '; retained scratch: ' + scratch);
    }
    throw cause;
  } finally {
    if (canRelease) rmSync(scratch, { recursive: true });
  }
}
