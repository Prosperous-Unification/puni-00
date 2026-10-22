import { digestBytes, digestOf } from './canonical';
import {
  type AcceptanceSnapshot,
  type Binding,
  type CheckedBinding,
  type ClassSelection,
  type PromptSnapshot,
  type PromptSource,
  type SelectedActivity,
  type ValidatedBinding,
  WorkflowBindingError,
} from './workflow-binding';

/**
 * Checks references and exact per-type coverage against a copied, sorted project-step set.
 * Retains the immutable decoded binding; grants no prompt acceptance or runtime authority.
 * @throws {WorkflowBindingError} on malformed steps, dangling classes or inexact coverage.
 */
export function checkWorkflowBinding(
  binding: Binding,
  projectSteps: readonly string[],
): CheckedBinding {
  // Proof: separately removing empty/code checks changed invalid_project_steps to unknown_step;
  // removing uniqueness accepted a complete duplicated set. Using sparse-skipping some()
  // misclassified a hole in `refuses sparse supplied project-step arrays`.
  if (
    projectSteps.length === 0 ||
    [...projectSteps].some((step) => typeof step !== 'string' || !/^\S+$/.test(step)) ||
    new Set(projectSteps).size !== projectSteps.length
  ) {
    throw new WorkflowBindingError(
      'invalid_project_steps',
      'projectSteps',
      'expected unique nonempty codes without whitespace',
    );
  }
  // Proof: freezing the caller's step array prevented push('qa') in
  // `detaches without freezing caller-owned input`; copying preserves caller mutability.
  const sortedSteps = [...projectSteps].sort();
  for (const name of Object.keys(binding.types).sort()) {
    const mapping = binding.types[name];
    for (const step of Object.keys(mapping).sort()) {
      const reference = mapping[step];
      // Proof: removing this check accepted review without settings in
      // `refuses the original sample dangling class`.
      if (!Object.hasOwn(binding.classes, reference.class)) {
        throw new WorkflowBindingError(
          'unknown_class',
          `types.${name}.${step}.class`,
          `unknown class ${reference.class}`,
        );
      }
    }
  }
  for (const name of Object.keys(binding.types).sort()) {
    const mapping = binding.types[name];
    for (const step of Object.keys(mapping).sort()) {
      // Proof: bypassing only this guard accepted qa in
      // `refuses an unknown mapped step through the production checker`.
      if (!sortedSteps.includes(step)) {
        throw new WorkflowBindingError(
          'unknown_step',
          `types.${name}.${step}`,
          'step is outside the project set',
        );
      }
    }
    for (const step of sortedSteps) {
      // Proof: bypassing coverage accepted an incomplete explicit type in
      // `does not fill an incomplete explicit type from default`.
      if (!Object.hasOwn(mapping, step)) {
        throw new WorkflowBindingError(
          'missing_step',
          `types.${name}.${step}`,
          'mapping omits a project step',
        );
      }
    }
  }
  // Proof: separately removing either freeze let Reflect.set change the checked wrapper or
  // its step array in `freezes decoded and selected nested values`.
  return Object.freeze({ binding, projectSteps: Object.freeze(sortedSteps) });
}

/**
 * Selects an own explicit type or the whole default mapping and returns frozen identity/settings.
 * Settings were shape-checked only; no digest, prompt existence or execution authority is claimed.
 * @throws {WorkflowBindingError} for malformed arguments, an unmapped type or an unchecked step.
 */
export function selectActivityClass(
  checked: CheckedBinding,
  typeCode: string,
  stepCode: string,
): ClassSelection {
  // Proof: bypassing type-code syntax selected a whitespace-bearing type from default
  // in `refuses malformed selection ["has space","api"]`.
  if (
    typeof typeCode !== 'string' ||
    !/^\S+$/.test(typeCode) ||
    typeof stepCode !== 'string' ||
    !/^\S+$/.test(stepCode)
  ) {
    throw new WorkflowBindingError(
      'invalid_binding',
      'selection',
      'expected nonempty type and step codes without whitespace',
    );
  }
  // Proof: always choosing default returned the wrong class for an explicit type; using in
  // instead of own membership refused the inherited-name fallback in the two selection tests.
  const matchedType = Object.hasOwn(checked.binding.types, typeCode) ? typeCode : 'default';
  // Proof: bypassing this check produced a TypeError instead of unmapped_type
  // in `requires an own type or own default mapping`.
  if (!Object.hasOwn(checked.binding.types, matchedType)) {
    throw new WorkflowBindingError(
      'unmapped_type',
      `types.${typeCode}`,
      'no explicit type or default mapping',
    );
  }
  // Proof: bypassing checked-step membership changed unknown_step to invalid_binding
  // in `refuses selecting an unchecked step`; the later mapping guard still refused.
  if (!checked.projectSteps.includes(stepCode)) {
    throw new WorkflowBindingError(
      'unknown_step',
      `types.${matchedType}.${stepCode}`,
      'step was not checked',
    );
  }
  const mapping = checked.binding.types[matchedType];
  // Proof: bypassing this check produced a TypeError instead of invalid_binding
  // in `throws if a supposedly checked mapping loses its selected step`.
  if (!Object.hasOwn(mapping, stepCode)) {
    throw new WorkflowBindingError(
      'invalid_binding',
      `types.${matchedType}.${stepCode}`,
      'missing checked mapping',
    );
  }
  const reference = mapping[stepCode];
  // Proof: bypassing this check returned undefined settings without throwing
  // in `throws if a supposedly checked mapping loses its referenced class`.
  if (!Object.hasOwn(checked.binding.classes, reference.class)) {
    throw new WorkflowBindingError(
      'invalid_binding',
      `types.${matchedType}.${stepCode}.class`,
      'missing checked class reference',
    );
  }
  const settings = checked.binding.classes[reference.class];
  // Proof: dropping this freeze let Reflect.set change selection identity
  // in `freezes decoded and selected nested values`.
  return Object.freeze({
    requestedType: typeCode,
    matchedType,
    stepCode,
    className: reference.class,
    settings,
  });
}

/**
 * Accepts exactly the declared unique prompt sources, retaining original bytes as base64.
 * Only immutable strings escape byte acceptance; this grants no runtime authority.
 * @throws {WorkflowBindingError} for an inexact source set or malformed UTF-8.
 */
export function acceptWorkflowBinding(
  checked: CheckedBinding,
  prompts: readonly PromptSource[],
): ValidatedBinding {
  const paths = [
    ...new Set(
      Object.values(checked.binding.classes).flatMap((settings) =>
        settings.executor === 'tool' ? [] : [settings.prompt],
      ),
    ),
  ].sort();
  // Proof: bypassing this set check accepted duplicate/extra sources and omitted unused
  // prompts in the source-refusal and unused-class prompt tests.
  if (
    prompts.length !== paths.length ||
    new Set(prompts.map((source) => source.path)).size !== paths.length ||
    prompts.some((source) => !paths.includes(source.path))
  ) {
    throw new WorkflowBindingError(
      'invalid_prompt_sources',
      'prompts',
      'expected exactly one source for every declared prompt path',
    );
  }
  const retained: PromptSnapshot[] = [...prompts]
    // Proof: removing this sort changed digest under source reordering in the canonical acceptance test.
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    .map((source) => {
      const path = source.path;
      // A local staging copy ties all three derivations to one synchronous input.
      // This implementation choice is not an independently claimed safety guard.
      const original = Uint8Array.from(source.bytes);
      // Proof: hashing re-encoded decoded text erased the BOM; `binds original BOM bytes
      // while decoding prompt text` failed its independently computed original-byte SHA.
      const sha256 = digestBytes(original);
      let text: string;
      // Proof: disabling fatal decoding accepted malformed bytes in `refuses malformed prompt UTF-8`.
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(original);
      } catch (cause) {
        throw new WorkflowBindingError(
          'invalid_prompt_encoding',
          path,
          'prompt must be valid UTF-8',
          { cause },
        );
      }
      // Proof: base64 from decoded text lost original BOM bytes in the BOM correspondence test.
      const bytesBase64 = Buffer.from(original).toString('base64');
      // Proof: removing this freeze allowed text mutation in the acceptance mutation test.
      return Object.freeze({ path, sha256, text, bytesBase64 });
    });
  // Proof: removing snapshot/descriptor and descriptor-array freezes separately let Reflect.set succeed in
  // `acceptance survives caller mutation and binds changed prompt bytes`.
  const snapshot: AcceptanceSnapshot = Object.freeze({
    schemaVersion: 1,
    binding: checked.binding,
    projectSteps: checked.projectSteps,
    // Proof: omitting these descriptors broke the acceptance/BOM digest correspondence tests.
    prompts: Object.freeze(retained.map(({ path, sha256 }) => Object.freeze({ path, sha256 }))),
  });
  // Proof: dropping this wrapper freeze allowed bindingDigest mutation in the acceptance test.
  return Object.freeze({
    snapshot,
    // Proof: hashing only the binding failed byte-change and snapshot-digest correspondence tests.
    bindingDigest: digestOf(snapshot),
    // Proof: removing this array freeze let Reflect.set replace accepted prompt content.
    prompts: Object.freeze(retained),
  });
}

/**
 * Selects frozen accepted settings and prompt content without rereading source files.
 * @throws {WorkflowBindingError} for invalid selection or missing accepted prompt content.
 */
export function selectWorkflowActivity(
  accepted: ValidatedBinding,
  typeCode: string,
  stepCode: string,
): SelectedActivity {
  const selection = selectActivityClass(
    { binding: accepted.snapshot.binding, projectSteps: accepted.snapshot.projectSteps },
    typeCode,
    stepCode,
  );
  if (selection.settings.executor === 'tool')
    // Proof: dropping this freeze allowed identity mutation in the tool/null-prompt test.
    return Object.freeze({
      ...selection,
      settings: selection.settings,
      bindingDigest: accepted.bindingDigest,
      prompt: null,
    });
  const settings = selection.settings;
  const source = accepted.prompts.find((prompt) => prompt.path === settings.prompt);
  // Proof: bypassing this guard changed the named refusal in the lost-accepted-prompt test.
  if (source === undefined)
    throw new WorkflowBindingError(
      'invalid_prompt_sources',
      selection.settings.prompt,
      'missing accepted prompt',
    );
  const { path, sha256, text } = source;
  // Proof: removing selection and prompt freezes separately let Reflect.set succeed in the acceptance test.
  return Object.freeze({
    ...selection,
    settings: selection.settings,
    bindingDigest: accepted.bindingDigest,
    prompt: Object.freeze({ path, sha256, text }),
  });
}
