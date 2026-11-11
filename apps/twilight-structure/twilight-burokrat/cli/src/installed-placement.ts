import { realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

import type { BunToolkit } from './policy/toolkit';

function isWithin(root: string, path: string): boolean {
  const offset = relative(root, path);
  return (
    offset === '' || (offset !== '..' && !offset.startsWith('..' + sep) && !isAbsolute(offset))
  );
}

export function assertExternal(candidate: string, path: string, subject: string): string {
  // Proof: placement-physical-target; the injected fault fails refuses candidate-targeted; restoration passes.
  const canonical = realpathSync.native(path);
  // Proof: placement-candidate-refusal; the injected fault fails refuses candidate-targeted|refuses installation equality|refuses a toolkit cwd; restoration passes.
  if (isWithin(candidate, canonical))
    throw new Error(subject + ' must be outside the candidate repository');
  return canonical;
}

/** A valid digest does not grant any physical asset authority over the candidate being checked. */
export function assertInstalledPlacement(
  candidate: string,
  directory: string,
  toolkit: BunToolkit,
): void {
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
