import {
  type Binding,
  type CheckedBinding,
  type ClassSelection,
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
