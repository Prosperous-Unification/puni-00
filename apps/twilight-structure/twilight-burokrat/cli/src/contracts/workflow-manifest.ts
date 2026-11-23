import { type } from '@shared/validation';

import { digestOf } from './canonical';
import { acceptWorkflowPrompts } from './validate-workflow-binding';
import {
  AcceptanceDescriptor,
  type ActivityClass,
  checkDictionary,
  checkJson,
  freezeValue,
  listBindingPromptPaths,
  parseAt,
  type PromptSnapshot,
  type PromptSource,
  readActivityClasses,
  WorkflowBindingError,
} from './workflow-binding';

/** Offline applicability exported by WBS; IDs are stable identities, never display names. */
export interface StepManifest {
  readonly version: 1;
  readonly project: { readonly id: string; readonly revision: number };
  readonly default: readonly string[];
  readonly types: readonly { readonly workItemTypeId: string; readonly codes: readonly string[] }[];
}
/** One explicit class choice; presentation order does not prescribe execution order. */
export interface WorkflowStep {
  readonly code: string;
  readonly class: string;
}
/** Revision-naming workflow configuration with separate untyped and stable-ID mappings. */
export interface ManifestBinding {
  readonly version: 2;
  readonly project: { readonly id: string; readonly revision: number };
  readonly default: readonly WorkflowStep[];
  readonly types: readonly {
    readonly workItemTypeId: string;
    readonly steps: readonly WorkflowStep[];
  }[];
  readonly classes: Readonly<Record<string, ActivityClass>>;
}
/** Exact applicability and class coverage, without prompt-byte acceptance or execution authority. */
export interface CheckedManifestBinding {
  readonly binding: ManifestBinding;
  readonly manifest: StepManifest;
}
/** Static manifest acceptance; schema1 acceptance remains a distinct retained contract. */
export interface ManifestAcceptanceSnapshot {
  readonly schemaVersion: 2;
  readonly binding: ManifestBinding;
  readonly manifest: StepManifest;
  readonly manifestDigest: string;
  readonly prompts: readonly { readonly path: string; readonly sha256: string }[];
}
/** Canonical manifest/configuration and original prompt bytes accepted offline. */
export interface ValidatedManifestBinding {
  readonly snapshot: ManifestAcceptanceSnapshot;
  readonly bindingDigest: string;
  readonly prompts: readonly PromptSnapshot[];
}

const Id = type('string > 0');
const Project = type({
  id: Id,
  // Proof: separate revision admission omissions accepted -1,1.5 and an unsafe integer;
  // "workflow manifest refuses coherently malformed revisions" failed, then passed after exact restore.
  // verification-workflow-manifest-20261119.json.
  revision: '0 <= number.integer <= 9007199254740991',
}).onUndeclaredKey('reject');
const Manifest = type({
  version: '1',
  project: Project,
  default: Id.array(),
  types: type({ workItemTypeId: Id, codes: Id.array() }).onUndeclaredKey('reject').array(),
}).onUndeclaredKey('reject');
const Mapping = type({ code: Id, class: type(/^\S+$/) }).onUndeclaredKey('reject');
const Binding = type({
  version: '2',
  project: Project,
  default: Mapping.array(),
  types: type({ workItemTypeId: Id, steps: Mapping.array() }).onUndeclaredKey('reject').array(),
  classes: 'object',
}).onUndeclaredKey('reject');
const compare = (left: string, right: string) =>
  Buffer.compare(Buffer.from(left), Buffer.from(right));

function requireUnique(ids: readonly string[], path: string): void {
  // Proof: omitting uniqueness admitted repeated manifest types;
  // "workflow manifest refuses malformed manifest duplicate-type" failed, then passed after exact restore.
  // verification-workflow-manifest-20261119.json.
  if (new Set(ids).size !== ids.length)
    throw new WorkflowBindingError(
      'invalid_binding',
      path,
      'duplicate identities are not accepted',
    );
}

/** Decodes strict detached manifest JSON; code order remains the producer's SC18 order. */
export function decodeStepManifest(input: unknown): StepManifest {
  checkJson(input, 'manifest');
  const manifest = parseAt(Manifest, structuredClone(input), 'manifest');
  // Proof: omitting this call admitted repeated manifest types;
  // "workflow manifest refuses malformed manifest duplicate-type" failed, then passed after exact restore.
  // verification-workflow-manifest-20261119.json.
  requireUnique(
    manifest.types.map((type) => type.workItemTypeId),
    'manifest.types',
  );
  // Proof: omitting this call admitted repeated untyped manifest codes;
  // "workflow manifest refuses malformed manifest duplicate-code" failed, then passed after exact restore.
  // verification-workflow-manifest-20261119.json.
  requireUnique(manifest.default, 'manifest.default');
  // Proof: omitting this loop admitted repeated typed manifest codes;
  // "workflow manifest refuses duplicate typed codes in the actual manifest" failed, then passed after exact restore.
  // verification-workflow-manifest-20261119.json.
  for (const type of manifest.types)
    requireUnique(type.codes, 'manifest.types.' + type.workItemTypeId + '.codes');
  return freezeValue({
    ...manifest,
    types: [...manifest.types].sort((left, right) =>
      compare(left.workItemTypeId, right.workItemTypeId),
    ),
  });
}

/** Decodes the distinct version2 envelope while reusing all existing executor policies. */
export function decodeManifestBinding(input: unknown): ManifestBinding {
  checkJson(input, 'binding');
  const binding = parseAt(Binding, structuredClone(input), 'binding');
  // Proof: omitting this call admitted repeated binding types;
  // "workflow manifest refuses malformed binding duplicate-type" failed, then passed after exact restore.
  // verification-workflow-manifest-20261119.json.
  requireUnique(
    binding.types.map((type) => type.workItemTypeId),
    'types',
  );
  // Proof: omitting this call admitted repeated untyped binding codes;
  // "workflow manifest refuses duplicate untyped binding codes" failed, then passed after exact restore.
  // verification-workflow-manifest-20261119.json.
  requireUnique(
    binding.default.map((step) => step.code),
    'default',
  );
  // Proof: omitting this loop admitted repeated typed binding codes;
  // "workflow manifest refuses malformed binding duplicate-code" failed, then passed after exact restore.
  // verification-workflow-manifest-20261119.json.
  for (const type of binding.types)
    requireUnique(
      type.steps.map((step) => step.code),
      'types.' + type.workItemTypeId,
    );
  const classes = readActivityClasses(checkDictionary(binding.classes, 'classes', true));
  const sortedSteps = (steps: readonly WorkflowStep[]) =>
    [...steps].sort((left, right) => compare(left.code, right.code));
  return freezeValue({
    version: 2,
    project: binding.project,
    default: sortedSteps(binding.default),
    types: [...binding.types]
      .sort((left, right) => compare(left.workItemTypeId, right.workItemTypeId))
      .map((type) => ({ workItemTypeId: type.workItemTypeId, steps: sortedSteps(type.steps) })),
    classes,
  });
}

function checkCoverage(
  steps: readonly WorkflowStep[],
  codes: readonly string[],
  path: string,
): void {
  const mapped = new Set(steps.map((step) => step.code));
  for (const step of steps)
    if (!codes.includes(step.code))
      throw new WorkflowBindingError(
        'unknown_step',
        path + '.' + step.code,
        'step is outside this type resolved set',
      );
  for (const code of codes)
    if (!mapped.has(code))
      throw new WorkflowBindingError(
        'missing_step',
        path + '.' + code,
        'mapping omits a resolved step',
      );
}

/**
 * Checks project identity/revision, untyped default and every actual type independently.
 * Explicit mappings replace default wholly; unknown types and dangling classes refuse.
 * @throws {WorkflowBindingError} with the affected type/code or project field; performs no IO.
 */
export function checkManifestBinding(
  binding: ManifestBinding,
  manifest: StepManifest,
): CheckedManifestBinding {
  // Proof: omitting project identity admitted a different project;
  // "workflow manifest refuses a different project id" failed, then passed after exact restore.
  // verification-workflow-manifest-20261119.json.
  if (binding.project.id !== manifest.project.id)
    throw new WorkflowBindingError(
      'manifest_mismatch',
      'project.id',
      'manifest belongs to another project',
    );
  // Proof: omitting revision equality admitted another revision;
  // "workflow manifest refuses a different project revision" failed, then passed after exact restore.
  // verification-workflow-manifest-20261119.json.
  if (binding.project.revision !== manifest.project.revision)
    throw new WorkflowBindingError(
      'manifest_mismatch',
      'project.revision',
      'manifest belongs to another revision',
    );
  const declared = new Map(binding.types.map((type) => [type.workItemTypeId, type.steps]));
  const owned = new Set(manifest.types.map((type) => type.workItemTypeId));
  for (const type of binding.types)
    // Proof: omitting owned-type admission accepted a foreign mapping;
    // "workflow manifest refuses malformed binding unknown-type" failed, then passed after exact restore.
    // verification-workflow-manifest-20261119.json.
    if (!owned.has(type.workItemTypeId))
      throw new WorkflowBindingError(
        'unmapped_type',
        'types.' + type.workItemTypeId,
        'type is absent from the project manifest',
      );
  const mappings = [
    { path: 'default', steps: binding.default },
    ...binding.types.map((type) => ({ path: 'types.' + type.workItemTypeId, steps: type.steps })),
  ];
  for (const mapping of mappings)
    for (const step of mapping.steps)
      // Proof: omitting class admission accepted a dangling reference;
      // "workflow manifest refuses malformed binding unknown-class" failed, then passed after exact restore.
      // verification-workflow-manifest-20261119.json.
      if (!Object.hasOwn(binding.classes, step.class))
        throw new WorkflowBindingError(
          'unknown_class',
          mapping.path + '.' + step.code + '.class',
          'unknown class ' + step.class,
        );
  // Proof: omitting untyped coverage admitted an untyped-only extra code;
  // "workflow manifest checks an untyped-only default without typed fallback interference" failed, then passed after exact restore.
  // verification-workflow-manifest-20261119.json.
  checkCoverage(binding.default, manifest.default, 'default');
  // Proof: omitting actual per-type coverage admitted story.research;
  // "workflow manifest refuses a code that only belongs to another type" failed, then passed after exact restore.
  // verification-workflow-manifest-20261119.json.
  for (const type of manifest.types) {
    const steps = declared.get(type.workItemTypeId);
    checkCoverage(
      // Proof: filling explicit mappings from default admitted an incomplete type;
      // "workflow manifest does not fill an incomplete explicit type from default" failed, then passed after exact restore.
      // verification-workflow-manifest-20261119.json.
      steps ?? binding.default,
      type.codes,
      'types.' + type.workItemTypeId,
    );
  }
  return Object.freeze({ binding, manifest });
}

/** Accepts original prompt bytes and binds canonical manifest/configuration identity without runtime authority. */
export function acceptManifestBinding(
  checked: CheckedManifestBinding,
  prompts: readonly PromptSource[],
): ValidatedManifestBinding {
  const retained = acceptWorkflowPrompts(listBindingPromptPaths(checked.binding), prompts);
  const snapshot: ManifestAcceptanceSnapshot = Object.freeze({
    schemaVersion: 2,
    binding: checked.binding,
    manifest: checked.manifest,
    manifestDigest: digestOf(checked.manifest),
    prompts: Object.freeze(retained.map(({ path, sha256 }) => Object.freeze({ path, sha256 }))),
  });
  return Object.freeze({ snapshot, bindingDigest: digestOf(snapshot), prompts: retained });
}

const Acceptance = type({
  schemaVersion: '2',
  binding: 'unknown',
  manifest: 'unknown',
  manifestDigest: type(/^[0-9a-f]{64}$/),
  prompts: AcceptanceDescriptor.array(),
}).onUndeclaredKey('reject');

/**
 * Reconstructs strict schema2 descriptors, rechecking all applicability and manifest digest evidence.
 * It accepts no prompt bytes and grants no execution authority; legacy schema1 uses its original reader.
 * @throws {WorkflowBindingError} for malformed retained content, stale applicability or inconsistent descriptors/digest.
 */
export function decodeManifestWorkflowAcceptance(input: unknown): ManifestAcceptanceSnapshot {
  // Proof: omitting outer JSON admission invoked the accessor; nested shape still refused;
  // "manifest acceptance reader refuses accessors without reading them" failed, then passed after exact restore.
  // verification-workflow-manifest-20261119.json.
  checkJson(input, 'acceptance');
  const detached: unknown = structuredClone(input);
  if (
    typeof detached === 'object' &&
    detached !== null &&
    Object.hasOwn(detached, 'schemaVersion') &&
    Reflect.get(detached, 'schemaVersion') !== 2
  )
    throw new WorkflowBindingError(
      'unsupported_version',
      'schemaVersion',
      'expected schemaVersion 2',
    );
  const envelope = parseAt(Acceptance, detached, 'acceptance');
  const binding = decodeManifestBinding(envelope.binding),
    manifest = decodeStepManifest(envelope.manifest);
  // Proof: omitting retained coverage accepted story.research;
  // "manifest acceptance reader rechecks retained per-type coverage" failed, then passed after exact restore.
  // verification-workflow-manifest-20261119.json.
  checkManifestBinding(binding, manifest);
  // Proof: omitting digest comparison accepted a valid-looking wrong digest;
  // "manifest acceptance reader refuses a syntactically valid wrong manifest digest" failed, then passed after exact restore.
  // verification-workflow-manifest-20261119.json.
  if (digestOf(manifest) !== envelope.manifestDigest)
    throw new WorkflowBindingError(
      'invalid_manifest',
      'manifestDigest',
      'manifest digest does not match canonical content',
    );
  const paths = listBindingPromptPaths(binding);
  if (
    // Proof: omitting length admitted a missing trailing prompt descriptor;
    // "manifest acceptance reader refuses descriptor coverage missing" failed, then passed after exact restore.
    // verification-workflow-manifest-20261119.json.
    envelope.prompts.length !== paths.length ||
    // Proof: omitting correspondence admitted duplicate prompt descriptors;
    // "manifest acceptance reader refuses descriptor coverage duplicate" failed, then passed after exact restore.
    // verification-workflow-manifest-20261119.json.
    envelope.prompts.some((prompt, index) => prompt.path !== paths[index])
  )
    throw new WorkflowBindingError(
      'invalid_prompt_sources',
      'prompts',
      'expected sorted unique descriptors for every declared prompt path',
    );
  return freezeValue({
    schemaVersion: 2,
    binding,
    manifest,
    manifestDigest: envelope.manifestDigest,
    prompts: envelope.prompts,
  });
}
