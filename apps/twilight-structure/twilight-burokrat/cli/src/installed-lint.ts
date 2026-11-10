import { realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

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

function isWithin(root: string, path: string): boolean {
  const offset = relative(root, path);
  return (
    offset === '' || (offset !== '..' && !offset.startsWith('..' + sep) && !isAbsolute(offset))
  );
}

function assertExternal(candidate: string, path: string, subject: string): string {
  // Proof: placement-physical-target; the injected fault fails refuses candidate-targeted; restoration passes.
  const canonical = realpathSync.native(path);
  // Proof: placement-candidate-refusal; the injected fault fails refuses candidate-targeted|refuses installation equality|refuses a toolkit cwd; restoration passes.
  if (isWithin(candidate, canonical))
    throw new Error(subject + ' must be outside the candidate repository');
  return canonical;
}

/** A valid digest does not grant any physical asset authority over the candidate being checked. */
function assertInstallation(candidate: string, directory: string, toolkit: BunToolkit): void {
  // Proof: placement-installation; the injected fault fails independently refuses a local installation with all asset targets external; restoration passes.
  assertExternal(candidate, directory, 'installation');
  // Proof: placement-toolkit-cwd; the injected fault fails independently refuses a local toolkit cwd with all asset targets external; restoration passes.
  assertExternal(candidate, toolkit.directory, 'toolkit cwd');
  // Proof: placement-package-manifest; the injected fault fails refuses candidate-targeted package-manifest.json; restoration passes.
  assertExternal(candidate, join(directory, 'package-manifest.json'), 'package manifest');
  // Proof: placement-toolkit-descriptor; the injected fault fails refuses candidate-targeted toolkit.json; restoration passes.
  assertExternal(candidate, join(toolkit.directory, 'toolkit.json'), 'toolkit descriptor');
  // Proof: placement-role-launcher.mjs; the injected fault fails refuses candidate-targeted launcher.mjs; restoration passes.
  // Proof: placement-role-snapshotter.ts; the injected fault fails refuses candidate-targeted snapshotter.ts; restoration passes.
  // Proof: placement-role-validator.mjs; the injected fault fails refuses candidate-targeted validator.mjs; restoration passes.
  // Proof: placement-role-prepare-activation.mjs; the injected fault fails refuses candidate-targeted prepare-activation.mjs; restoration passes.
  // Proof: placement-role-prepare-relocation-activation.mjs; the injected fault fails refuses candidate-targeted prepare-relocation-activation.mjs; restoration passes.
  for (const role of Object.keys(toolkit.roleBytes))
    assertExternal(candidate, join(toolkit.directory, role), role);
  // Proof: placement-closure-target; the injected fault fails refuses candidate-targeted trusted-node-modules; restoration passes.
  const closure = assertExternal(
    candidate,
    join(toolkit.directory, 'trusted-node-modules'),
    'runtime closure',
  );
  // Proof: placement-closure-ancestor; the injected fault fails refuses a closure ancestor containing the candidate; restoration passes.
  if (isWithin(closure, candidate))
    throw new Error('runtime closure overlaps the candidate repository');
}

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
  assertInstallation(candidate.directory, directory, toolkit);
  return { kind: 'ready', toolkit, runtime, candidateDirectory: candidate.directory };
}
