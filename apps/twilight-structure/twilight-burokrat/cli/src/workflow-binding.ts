import { accessSync, constants, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { isAlias, isNode, isPair, isScalar, parseAllDocuments, visit } from 'yaml';

import { acceptWorkflowBinding, checkWorkflowBinding } from './contracts/validate-workflow-binding';
import {
  decodeWorkflowBinding,
  listBindingPromptPaths,
  type ValidatedBinding,
  WorkflowBindingError,
} from './contracts/workflow-binding';

function readBoundary<Value>(read: () => Value, kind: 'binding' | 'prompt', path: string): Value {
  try {
    return read();
  } catch (cause) {
    if (cause instanceof WorkflowBindingError) throw cause;
    // Proof: mapping ENOENT to unreadable failed real deletion tests; mapping every IO
    // failure to missing failed real chmod(0) binding/prompt tests (non-root uid 1000).
    const missing = cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
    throw new WorkflowBindingError(
      missing ? `${kind}_missing` : `${kind}_unreadable`,
      path,
      'cannot access file',
      { cause },
    );
  }
}

const standardTags = new Set(
  ['map', 'seq', 'str', 'int', 'float', 'bool', 'null'].map((name) => `tag:yaml.org,2002:${name}`),
);

function decodeYaml(bytes: Uint8Array, path: string): unknown {
  try {
    // Proof: disabling fatal decoding changed malformed binding UTF-8 to invalid_binding.
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const documents = parseAllDocuments(text, {
      version: '1.2',
      // Proof: disabling strict parsing accepted a quoted scalar with an unseparated comment.
      strict: true,
      // Proof: disabling uniqueness accepted the duplicate-key YAML fixture.
      uniqueKeys: true,
      merge: false,
    });
    // Proof: bypassing this check accepted the extra-document fixture.
    if (documents.length !== 1)
      throw new WorkflowBindingError('invalid_yaml', path, 'expected exactly one YAML document');
    const document = documents[0];
    // Proof: removing the error term accepted duplicate keys; removing the warning term
    // accepted the unknown-directive warning fixture in separate source faults.
    if (document.errors.length !== 0 || document.warnings.length !== 0)
      throw new WorkflowBindingError(
        'invalid_yaml',
        path,
        'YAML errors or warnings are not accepted',
      );
    // Proof: bypassing this check accepted the explicit YAML 1.1 fixture.
    if (document.directives.yaml.version !== '1.2')
      throw new WorkflowBindingError('invalid_yaml', path, 'expected YAML 1.2');
    visit(document, (_key, node) => {
      // Proof: bypassing alias refusal changed the alias fixture to unknown_step.
      if (isAlias(node))
        throw new WorkflowBindingError('invalid_yaml', path, 'YAML aliases are not accepted');
      // Proof: bypassing tag refusal changed the non-JSON !!set fixture to invalid_binding;
      // unknown custom tags are additionally refused by the warning boundary.
      if (isNode(node) && node.tag !== undefined && !standardTags.has(node.tag))
        throw new WorkflowBindingError('invalid_yaml', path, 'custom YAML tags are not accepted');
      if (isPair(node)) {
        // Proof: bypassing key checks changed numeric/complex-key fixture refusals.
        if (!isScalar(node.key) || typeof node.key.value !== 'string')
          throw new WorkflowBindingError('invalid_yaml', path, 'YAML mapping keys must be strings');
        // Proof: bypassing merge refusal changed the merge fixture to invalid_binding.
        if (node.key.value === '<<')
          throw new WorkflowBindingError('invalid_yaml', path, 'YAML merge keys are not accepted');
      }
    });
    const documentValue: unknown = document.toJS();
    return documentValue;
  } catch (cause) {
    if (cause instanceof WorkflowBindingError) throw cause;
    throw new WorkflowBindingError('invalid_yaml', path, 'binding must be valid UTF-8 YAML 1.2', {
      cause,
    });
  }
}

/**
 * Reads strict YAML and each unique declared prompt once, anchored to the supplied root.
 * Physical containment and regular files are checked before prompt reads; the binding is
 * statted before reading to refuse preexisting FIFOs/devices without opening them.
 * Snapshots observed bytes, without atomic-checkout or hostile-writer guarantees.
 * @throws {WorkflowBindingError} with contextual filesystem, YAML or acceptance refusals.
 */
export function readWorkflowBinding(
  repositoryRoot: string,
  file: string,
  projectSteps: readonly string[],
): ValidatedBinding {
  let root: string;
  try {
    root = realpathSync(repositoryRoot);
    // Proof: bypassing this check lost repositoryRoot classification for a file-as-root.
    if (!statSync(root).isDirectory()) throw new Error('repository root must be a directory');
    // Proof: bypassing X_OK made the real chmod(0) root regression report the binding
    // filename instead of repositoryRoot; restoring this check preserved its EACCES cause.
    accessSync(root, constants.X_OK);
  } catch (cause) {
    throw new WorkflowBindingError(
      'binding_unreadable',
      'repositoryRoot',
      'cannot use repository root',
      { cause },
    );
  }
  const filename = resolve(root, file);
  const bindingStat = readBoundary(() => statSync(filename), 'binding', file);
  // Proof: removing this guard failed the directory test's specific regular-file diagnostic
  // (later EISDIR reading reported binding_unreadable, not the required pre-read refusal).
  if (!bindingStat.isFile())
    throw new WorkflowBindingError('invalid_yaml', file, 'binding must be a regular file');
  const bytes = readBoundary(() => readFileSync(filename), 'binding', file);
  const checked = checkWorkflowBinding(
    decodeWorkflowBinding(decodeYaml(bytes, file)),
    projectSteps,
  );
  const paths = listBindingPromptPaths(checked.binding);
  const prompts = paths.map((path) => {
    // Proof: anchoring at the binding directory broke `anchors prompt to root, not binding directory`.
    const physical = readBoundary(() => realpathSync(resolve(root, path)), 'prompt', path);
    const fromRoot = relative(root, physical);
    // Proof: bypassing containment accepted an external symlink in the sibling-prefix test.
    if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot))
      throw new WorkflowBindingError(
        'prompt_outside_root',
        path,
        'prompt resolves outside repository root',
      );
    const promptStat = readBoundary(() => statSync(physical), 'prompt', path);
    // Proof: bypassing this guard changed the real prompt-directory refusal to prompt_unreadable.
    if (!promptStat.isFile())
      throw new WorkflowBindingError('prompt_not_file', path, 'prompt must be a regular file');
    return { path, bytes: readBoundary(() => readFileSync(physical), 'prompt', path) };
  });
  return acceptWorkflowBinding(checked, prompts);
}

/**
 * Validates the entire five-argument binding command before any filesystem access.
 * Returns the accepted digest without writing output; prompt paths use the supplied root.
 * @throws {WorkflowBindingError} for invalid CLI grammar or binding acceptance failures.
 */
export function runWorkflowBindingCommand(args: readonly string[], repositoryRoot: string): string {
  const refuseArguments = () => {
    throw new WorkflowBindingError(
      'invalid_arguments',
      'arguments',
      'usage: twib validate workflow-binding <file> --steps <comma-list>',
    );
  };
  // Proof: removing exact arity let the spawned extra-operand command succeed; its refusal test failed.
  if (args.length !== 5) refuseArguments();
  const [command, kind, file, flag, codes] = args;
  // Proof: independently removing command/kind checks accepted the wrong helper prefix.
  // Removing either filename check replaced invalid_arguments with a filesystem refusal.
  // Removing flag equality let the spawned wrong-flag command succeed.
  // Proof: removing repeated-value refusal changed invalid_arguments to unknown_step
  // in `refuses malformed CLI repeated flag as value before filesystem access`.
  if (
    command !== 'validate' ||
    kind !== 'workflow-binding' ||
    file.length === 0 ||
    file.startsWith('-') ||
    flag !== '--steps' ||
    codes === '--steps'
  )
    refuseArguments();
  const steps = codes.split(',');
  // Proof: separately bypassing segment shape and uniqueness changed invalid_arguments
  // to invalid_project_steps in the empty/whitespace and duplicate CLI refusal tests.
  if (steps.some((step) => !/^\S+$/.test(step)) || new Set(steps).size !== steps.length)
    refuseArguments();
  return readWorkflowBinding(repositoryRoot, file, steps).bindingDigest;
}
