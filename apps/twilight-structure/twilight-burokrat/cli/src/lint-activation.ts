import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

import { parseSecretsOrThrow, type, ValidationError } from '@shared/validation';

import { hashBytes } from './evidence/content-manifest';
import { isFilesystemFailure } from './filesystem-failure';
import { decodeJsonInput, JsonInputRefusal } from './json-input';
import { ActivationRefusal, type BunActivation, readBunActivation } from './policy/activation';
import { anchorPath } from './validator-paths';

const directory = type('string').narrow(
  (value) =>
    // Proof: selection-slashes; `reviewed activation refusal boundaries > rejects noncanonical selection directory "v1\\child"` fails with this injected fault and passes after restoration.
    !value.includes('\\') &&
    // Proof: selection-nul; `models a NUL in the selected directory as malformed authority` fails with this injected fault and passes after restoration.
    !value.includes('\0') &&
    // Proof: selection-segments; `current lint activation selection > refuses malformed selection {"schemaVersion":1,"directory":"../escape","identity":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","checksumsIdentity":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"} without a flat fallback` fails with this injected fault and passes after restoration.
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
);
const selection = type({
  // Proof: selection-closed; `current lint activation selection > refuses malformed selection {"schemaVersion":1,"directory":"v1","identity":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","checksumsIdentity":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","extra":true} without a flat fallback` fails with this injected fault and passes after restoration.
  '+': 'reject',
  // Proof: selection-required-schemaVersion; `reviewed activation refusal boundaries > requires selected descriptor member schemaVersion` fails with this injected fault and passes after restoration.
  // Proof: selection-version-value; `current lint activation selection > refuses malformed selection {"schemaVersion":2,"directory":"v1","identity":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","checksumsIdentity":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"} without a flat fallback` fails with this injected fault and passes after restoration.
  schemaVersion: '1',
  // Proof: selection-required-directory; `reviewed activation refusal boundaries > requires selected descriptor member directory` fails with this injected fault and passes after restoration.
  directory,
  // Proof: selection-digest-shape-identity; `current lint activation selection > refuses malformed selection {"schemaVersion":1,"directory":"v1","identity":"bad","checksumsIdentity":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"} without a flat fallback` fails with this injected fault and passes after restoration.
  // Proof: selection-required-identity; `reviewed activation refusal boundaries > requires selected descriptor member identity` fails with this injected fault and passes after restoration.
  identity: /^[0-9a-f]{64}$/,
  // Proof: selection-digest-shape-checksumsIdentity; `current lint activation selection > refuses malformed selection {"schemaVersion":1,"directory":"v1","identity":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","checksumsIdentity":"bad"} without a flat fallback` fails with this injected fault and passes after restoration.
  // Proof: selection-required-checksumsIdentity; `reviewed activation refusal boundaries > requires selected descriptor member checksumsIdentity` fails with this injected fault and passes after restoration.
  checksumsIdentity: /^[0-9a-f]{64}$/,
});

/** A modeled configured-activation refusal; executable boundaries preserve its status78. */
export class LintActivationRefusal extends Error {
  override readonly name = 'LintActivationRefusal';
  readonly status = 78;
}

export interface LintActivationContext {
  readonly candidateRoot: string;
  readonly callerDirectory: string;
  readonly activationRoot: string | undefined;
  readonly trustedNodeModules: string | undefined;
  readonly required: boolean;
}

export type LintActivation =
  | {
      readonly kind: 'inactive';
      readonly reason:
        | 'external activation root is not provisioned'
        | 'external activation marker is not provisioned';
    }
  | {
      readonly kind: 'active';
      readonly activation: BunActivation;
      readonly configuredRoot: string;
      readonly trustedNodeModules: string;
    };

function hasCode(cause: unknown, code: string): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === code;
}

function isAbsent(path: string): boolean {
  try {
    lstatSync(path);
    return false;
  } catch (cause) {
    // Proof: selection-inaccessible-not-absent; `does not interpret inaccessible configured ancestors as optional absence` fails with this injected fault and passes after restoration.
    if (!hasCode(cause, 'ENOENT')) throw cause;
  }
  let ancestor = dirname(path);
  for (;;) {
    try {
      // Proof: selection-dangling-ancestor; `current lint activation selection > refuses a configured dangling root symlink at its ancestor component` fails with this injected fault and passes after restoration.
      if (lstatSync(ancestor).isSymbolicLink()) realpathSync.native(ancestor);
      return true;
    } catch (cause) {
      if (!hasCode(cause, 'ENOENT')) throw cause;
      // A dangling symlink is present configured state, even when reached through an ancestor.
      try {
        if (lstatSync(ancestor).isSymbolicLink())
          throw new LintActivationRefusal('activation path has a dangling symlink', { cause });
      } catch (inspection) {
        if (!hasCode(inspection, 'ENOENT')) throw inspection;
      }
      const parent = dirname(ancestor);
      if (parent === ancestor)
        throw new Error('activation path has no existing filesystem ancestor', { cause });
      ancestor = parent;
    }
  }
}

function isWithin(root: string, path: string): boolean {
  const offset = relative(root, path);
  return (
    offset === '' || (offset !== '..' && !offset.startsWith('..' + sep) && !isAbsolute(offset))
  );
}

function assertExternal(candidate: string, path: string, subject: string): void {
  // Proof: selection-external-physical; `lint authority boundary details > refuses a candidate role even when a flat package is an ancestor of the candidate` fails with this injected fault and passes after restoration.
  if (isWithin(candidate, path))
    throw new LintActivationRefusal(subject + ' must be outside the candidate repository');
}

// Proof: the compatibility realpathSync selects the wrong symlink/parent authority; the native-path test fails.
function readExternalPath(path: string, candidate: string, subject: string): string {
  // Proof: selection-native-physical; `lint authority boundary details > preserves native symlink/parent resolution for configured host inputs` fails with this injected fault and passes after restoration.
  const canonical = realpathSync.native(path);
  assertExternal(candidate, canonical, subject);
  return canonical;
}

function readAuthorityFile(
  root: string,
  path: string,
  candidate: string,
  subject: string,
): Uint8Array {
  const canonical = realpathSync.native(path);
  assertExternal(candidate, canonical, subject);
  // Proof: selection-file-contained; `lint authority boundary details > keeps authority metadata inside its own root for selected.json` fails with this injected fault and passes after restoration.
  if (!isWithin(root, canonical))
    throw new LintActivationRefusal(subject + ' escapes its authority root');
  // Proof: selection-file-regular; `refuses a FIFO authority file before attempting to read its bytes` fails with this injected fault and passes after restoration.
  if (!statSync(canonical).isFile())
    throw new LintActivationRefusal(subject + ' is not a regular file');
  return readFileSync(canonical);
}

function assertClosure(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) assertClosure(path);
    else if (entry.isFile()) readFileSync(path);
    // Proof: selection-closure-entries; `current lint activation selection > refuses a closure containing a symlink into the candidate` fails with this injected fault and passes after restoration.
    else throw new LintActivationRefusal('trusted runtime closure carries a non-regular entry');
  }
}

function decodeSelection(bytes: Uint8Array): typeof selection.infer {
  let input: unknown;
  try {
    input = decodeJsonInput(bytes);
  } catch (cause) {
    // Proof: selection-json-classifier; `preserves an internal TypeError from the selection JSON phase` fails with this injected fault and passes after restoration.
    if (!(cause instanceof JsonInputRefusal)) throw cause;
    throw new LintActivationRefusal('activation selection is malformed');
  }
  try {
    return parseSecretsOrThrow(selection, input);
  } catch (cause) {
    // Proof: selection-schema-classifier; `unexpected dependency failures retain their identity > does not normalize a trusted selection-schema implementation failure` fails with this injected fault and passes after restoration.
    if (!(cause instanceof ValidationError)) throw cause;
    throw new LintActivationRefusal('activation selection is malformed');
  }
}

function readActivation(context: LintActivationContext): LintActivation {
  const input = context.activationRoot;
  if (input === undefined || input === '' || isAbsent(anchorPath(input, context.callerDirectory))) {
    // Proof: selection-required-root; `current lint activation selection > refuses required absent root undefined` fails with this injected fault and passes after restoration.
    if (context.required)
      throw new LintActivationRefusal('required admission has no external activation root');
    return { kind: 'inactive', reason: 'external activation root is not provisioned' };
  }
  const configuredRoot = readExternalPath(
    anchorPath(input, context.callerDirectory),
    context.candidateRoot,
    'activation root',
  );
  const modules = context.trustedNodeModules;
  const closure = readExternalPath(
    // Proof: selection-empty-closure-default; `lint authority boundary details > models an explicitly empty optional closure override as the configured-root default` fails with this injected fault and passes after restoration.
    modules === undefined || modules === ''
      ? join(configuredRoot, 'trusted-node-modules')
      : anchorPath(modules, context.callerDirectory),
    context.candidateRoot,
    'trusted runtime closure',
  );
  // Proof: selection-closure-ancestor; `reviewed activation refusal boundaries > refuses a trusted closure that contains the candidate workspace` fails with this injected fault and passes after restoration.
  if (isWithin(closure, context.candidateRoot))
    throw new LintActivationRefusal('trusted runtime closure overlaps the candidate repository');
  // Proof: selection-typescript-required; `current lint activation selection > refuses missing TypeScript and a legacy descriptor-only flat root` fails with this injected fault and passes after restoration.
  readAuthorityFile(
    closure,
    join(closure, 'typescript/package.json'),
    context.candidateRoot,
    'trusted TypeScript package',
  );
  assertClosure(closure);
  const selectedPath = join(configuredRoot, 'selected.json');
  let activeRoot = configuredRoot;
  if (!isAbsent(selectedPath)) {
    const selected = decodeSelection(
      readAuthorityFile(
        configuredRoot,
        selectedPath,
        context.candidateRoot,
        'activation selection',
      ),
    );
    activeRoot = readExternalPath(
      join(configuredRoot, selected.directory),
      context.candidateRoot,
      'selected activation directory',
    );
    // Proof: selection-version-contained; `lint authority boundary details > refuses a selected version symlink that leaves its configured archive root` fails with this injected fault and passes after restoration.
    if (activeRoot === configuredRoot || !isWithin(configuredRoot, activeRoot))
      throw new LintActivationRefusal('selected activation escapes its external root');
    const manifest = readAuthorityFile(
      activeRoot,
      join(activeRoot, 'manifest.json'),
      context.candidateRoot,
      'activation manifest',
    );
    const checksums = readAuthorityFile(
      activeRoot,
      join(activeRoot, 'checksums.sha256'),
      context.candidateRoot,
      'activation checksums',
    );
    if (
      // Proof: selection-raw-identities; `lint authority boundary details > binds the selected raw identity before reading role descriptors` fails with this injected fault and passes after restoration.
      hashBytes(manifest) !== selected.identity ||
      hashBytes(checksums) !== selected.checksumsIdentity
    )
      throw new LintActivationRefusal('selected activation package failed digest verification');
  } else if (isAbsent(join(activeRoot, 'active-v1'))) {
    // Proof: selection-required-marker; `current lint activation selection > distinguishes an optional absent flat marker from a broken selected package` fails with this injected fault and passes after restoration.
    if (context.required)
      throw new LintActivationRefusal('required admission has no external activation marker');
    return { kind: 'inactive', reason: 'external activation marker is not provisioned' };
  }
  for (const path of [
    'manifest.json',
    'checksums.sha256',
    'active-v1',
    'ci-binding-path',
    'evidence-path',
    'launcher-path',
    'local-binding-path',
    'snapshotter-path',
    'validator-path',
  ]) {
    // Proof: selection-metadata-physical; `current lint activation selection > refuses candidate-targeted authority/role symlinks for launcher-path` fails with this injected fault and passes after restoration.
    readAuthorityFile(
      activeRoot,
      join(activeRoot, path),
      context.candidateRoot,
      'activation metadata ' + path,
    );
  }
  const activation = readBunActivation(activeRoot);
  for (const artifact of activation.manifest.artifacts) {
    // Proof: selection-role-physical; `lint authority boundary details > refuses a candidate role even when a flat package is an ancestor of the candidate` fails with this injected fault and passes after restoration.
    readAuthorityFile(
      activeRoot,
      join(activeRoot, artifact.path),
      context.candidateRoot,
      'activation role ' + artifact.role,
    );
  }
  return { kind: 'active', activation, configuredRoot, trustedNodeModules: closure };
}

/**
 * Resolve optional activation availability, then verify current package and physical authority.
 * Closure authority is the configured transport/operator, not the activation manifest.
 * @throws LintActivationRefusal for modeled filesystem, format, integrity or placement failures.
 * Unexpected implementation failures propagate unchanged.
 */
export function readLintActivation(context: LintActivationContext): LintActivation {
  try {
    return readActivation(context);
  } catch (cause) {
    if (cause instanceof LintActivationRefusal) throw cause;
    if (
      cause instanceof ActivationRefusal ||
      cause instanceof ValidationError ||
      isFilesystemFailure(cause)
    )
      throw new LintActivationRefusal('cannot verify current lint activation', { cause });
    throw cause;
  }
}
