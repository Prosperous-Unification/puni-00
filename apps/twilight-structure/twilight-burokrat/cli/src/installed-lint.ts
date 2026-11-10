import { realpathSync } from 'node:fs';
import { join } from 'node:path';

import { assertExternal, assertInstalledPlacement } from './installed-placement';
import type { SubscribeLintInterrupts } from './lint-interrupts';
import type { LintInvocation } from './lint-request';
import { type LintRuntime } from './lint-runtime';
import { readInstalledBunToolkit } from './packaging/installed';
import type { BunToolkit } from './policy/toolkit';
import { readLintCandidate } from './run-lint';

export interface InstalledLintContext {
  readonly installedDirectory: string;
  readonly runtime: LintRuntime;
  readonly subscribeInterrupts: SubscribeLintInterrupts;
}

export type InstalledLint =
  | { readonly kind: 'cancelled'; readonly status: 130 | 143 }
  | {
      readonly kind: 'ready';
      readonly toolkit: BunToolkit;
      readonly runtime: LintRuntime;
      readonly candidateDirectory: string;
    };

/**
 * Verify the current installed package before owned Git probes and physical placement checks.
 * Derive the toolkit child only after native installation selection. Activation availability
 * cannot bypass this boundary; activation selection remains the delivered launcher's operation.
 * The trusted caller selects Git lookup authority before and independently of this provider
 * installation. Its runtime cwd, frozen PATH and Git remain stable trusted prerequisites;
 * package selection cannot rebase them. Prior cancellation does no IO; each Git probe owns
 * its process group and pipes. This does not authenticate arbitrary operator PATH entries.
 * @throws for invalid package/runtime bytes, unsupported Git or candidate-contained assets.
 */
export async function readInstalledLint(
  invocation: LintInvocation,
  context: InstalledLintContext,
): Promise<InstalledLint> {
  const cancellation: { status: 130 | 143 | undefined } = { status: undefined };
  const unsubscribe = context.subscribeInterrupts((signal) => {
    cancellation.status ??= signal === 'SIGINT' ? 130 : 143;
  });
  unsubscribe();
  // Proof: preflight-prior-cancel; the injected fault fails returns prior cancellation before touching; restoration passes.
  if (cancellation.status !== undefined) return { kind: 'cancelled', status: cancellation.status };
  // Proof: preflight-native-default; the injected fault fails derives the default toolkit only after native installation selection; restoration passes.
  const directory = realpathSync.native(context.installedDirectory);
  // Proof: preflight-expected-package; the injected fault fails binds the preflight toolkit to the expected package identity; restoration passes.
  const toolkit = readInstalledBunToolkit(directory, join(directory, 'toolkit'));
  // Proof: preflight-caller-runtime-cwd; replacing caller cwd with toolkit cwd fails retains independently selected frozen runtime configuration; restoration passes.
  // Proof: preflight-caller-runtime-origin; reconstructing relative lookup and rebasing it to the toolkit executes the candidate Git marker; keeps Git lookup bound to the caller runtime fails and restoration passes.
  const runtime = context.runtime;
  const candidate = await readLintCandidate(invocation, runtime, context.subscribeInterrupts);
  // Proof: preflight-candidate-cancel; the injected fault fails propagates cancellation during the installed (version|root) Git probe; restoration passes.
  if (candidate.kind === 'cancelled') return candidate;
  // Proof: preflight-runtime-cwd-external; removing this call admits a candidate-contained caller cwd; refuses a Git runtime cwd inside the actual candidate fails and restoration passes.
  assertExternal(candidate.directory, runtime.directory, 'Git runtime cwd');
  // Proof: preflight-placement-delivery; the injected fault fails refuses candidate-targeted|refuses installation equality|refuses a toolkit cwd; restoration passes.
  assertInstalledPlacement(candidate.directory, directory, toolkit);
  return { kind: 'ready', toolkit, runtime, candidateDirectory: candidate.directory };
}
