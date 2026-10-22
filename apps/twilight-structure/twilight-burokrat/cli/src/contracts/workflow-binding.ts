import { parseOrThrow, type Type, type, ValidationError } from '@shared/validation';

import { RelativePath } from './records';

/** API stopping settings; provider-qualified model names establish neither availability nor budget authority. */
export interface ApiModelClass {
  readonly executor: 'api-model';
  readonly model: string;
  readonly prompt: string;
  readonly tools: readonly string[];
  readonly limits: { readonly maxSteps: number; readonly maxOutputTokens: number };
}
/** Desired harness policy; permission modes are not approval bypass or backend flags. */
export interface CliHarnessClass {
  readonly executor: 'cli-harness';
  readonly harness: 'claude-code' | 'codex';
  readonly permissionMode: 'read-only' | 'allow-edits';
  readonly prompt: string;
}
/** Agent registry name and requested tools, without registration or authority resolution. */
export interface AcpClass {
  readonly executor: 'acp';
  readonly agent: string;
  readonly prompt: string;
  readonly tools: readonly string[];
}
/** A command registry key, never shell text executed by binding validation. */
export interface ToolClass {
  readonly executor: 'tool';
  readonly command: string;
}
/** A decision-request prompt; wait targets and allowed decisions remain runtime facts. */
export interface HumanClass {
  readonly executor: 'human';
  readonly prompt: string;
}
/** The five supported strict executor shapes decoded by {@link decodeWorkflowBinding}. */
export type ActivityClass = ApiModelClass | CliHarnessClass | AcpClass | ToolClass | HumanClass;
/** Version-1 configuration; decoded values are detached and deeply immutable. */
export interface Binding {
  readonly version: 1;
  readonly types: Readonly<Record<string, Readonly<Record<string, { readonly class: string }>>>>;
  readonly classes: Readonly<Record<string, ActivityClass>>;
}
/** Lists the sorted unique prompt paths of every declared class, including unused classes. */
export function listBindingPromptPaths(binding: Binding): readonly string[] {
  return [
    ...new Set(
      Object.values(binding.classes).flatMap((settings) =>
        settings.executor === 'tool' ? [] : [settings.prompt],
      ),
    ),
  ].sort();
}
/** Exact step coverage and class references only; no prompt acceptance or digest. */
export interface CheckedBinding {
  readonly binding: Binding;
  readonly projectSteps: readonly string[];
}
/** Frozen selection identity and settings; identifies the whole matched type mapping. */
export interface ClassSelection {
  readonly requestedType: string;
  readonly matchedType: string;
  readonly stepCode: string;
  readonly className: string;
  readonly settings: ActivityClass;
}
/** Static document, acceptance and filesystem refusals; none grant execution authority. */
export type WorkflowBindingErrorCode =
  | 'invalid_arguments'
  | 'unsupported_version'
  | 'unknown_executor'
  | 'invalid_binding'
  | 'unpinned_model'
  | 'unknown_provider'
  | 'invalid_prompt_path'
  | 'invalid_project_steps'
  | 'unknown_class'
  | 'unknown_step'
  | 'missing_step'
  | 'unmapped_type'
  | 'invalid_prompt_sources'
  | 'invalid_prompt_encoding'
  | 'binding_missing'
  | 'binding_unreadable'
  | 'invalid_yaml'
  | 'prompt_missing'
  | 'prompt_unreadable'
  | 'prompt_not_file'
  | 'prompt_outside_root';
/** A named configuration refusal retaining its logical path and optional underlying cause. */
export class WorkflowBindingError extends Error {
  override readonly name = 'WorkflowBindingError';
  constructor(
    readonly code: WorkflowBindingErrorCode,
    readonly path: string,
    detail: string,
    options?: ErrorOptions,
  ) {
    super(`${code}: ${path}: ${detail}`, options);
  }
}
// Proof: widening Reference accepted a blank ACP agent in `refuses blank agent`.
const Reference = type(/^\S+$/);
// Proof: dropping the minimum accepted zero; dropping safe-integer narrowing accepted an unsafe limit
// in `refuses zero limit` and `refuses unsafe limit`. Bypassing both integer checks accepted a fraction.
const PositiveLimit = type('number.integer>=1').narrow((limit, context) =>
  Number.isSafeInteger(limit) ? true : context.mustBe('a positive safe integer'),
);
// Proof: bypassing uniqueness accepted repeated tool names in `refuses duplicate tools`.
const Tools = Reference.array().narrow((tools, context) =>
  new Set(tools).size === tools.length ? true : context.mustBe('unique tool references'),
);
// Proof: dropping this strict branch accepted an undeclared field in `refuses extra API field`.
const ApiModel = type({
  executor: "'api-model'",
  model: 'string',
  prompt: 'string',
  tools: Tools,
  // Proof: dropping nested strictness accepted timeout in `refuses extra nested field`;
  // removing maxSteps from the schema accepted its absence in `refuses missing limit`.
  limits: type({ maxSteps: PositiveLimit, maxOutputTokens: PositiveLimit }).onUndeclaredKey(
    'reject',
  ),
}).onUndeclaredKey('reject');
// Proof: dropping this strict branch accepted an undeclared field in `refuses extra harness field`.
const CliHarness = type({
  executor: "'cli-harness'",
  // Proof: widening harness to string accepted other in `refuses unknown harness`.
  harness: "'claude-code'|'codex'",
  // Proof: widening permissionMode to string accepted bypass in `refuses unknown permission`.
  permissionMode: "'read-only'|'allow-edits'",
  prompt: 'string',
}).onUndeclaredKey('reject');
// Proof: dropping this strict branch accepted an undeclared field in `refuses extra ACP field`.
const Acp = type({
  executor: "'acp'",
  agent: Reference,
  prompt: 'string',
  tools: Tools,
}).onUndeclaredKey('reject');
// Proof: dropping this strict branch accepted an undeclared field in `refuses extra tool field`.
const Tool = type({ executor: "'tool'", command: Reference }).onUndeclaredKey('reject');
// Proof: dropping this strict branch accepted an undeclared field in `refuses extra class field`.
const Human = type({ executor: "'human'", prompt: 'string' }).onUndeclaredKey('reject');
const Activity = ApiModel.or(CliHarness).or(Acp).or(Tool).or(Human);
// Proof: dropping this strict branch accepted an undeclared field in `refuses extra mapping field`.
const Mapping = type({ class: Reference }).onUndeclaredKey('reject');
// Proof: dropping strictness accepted an undeclared field in `refuses extra document field`;
// removing the version field accepted its absence in `refuses missing version`.
const Envelope = type({ version: '1', types: 'object', classes: 'object' }).onUndeclaredKey(
  'reject',
);
const executors = new Set(['api-model', 'cli-harness', 'acp', 'tool', 'human']);
const reservedKeys = new Set(['__proto__', 'prototype', 'constructor']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Proof: bypassing this boundary accepted an accessor-backed model in
// `refuses cyclic, accessor and symbol-bearing documents`.
function checkJson(value: unknown, path: string, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object') {
    throw new WorkflowBindingError('invalid_binding', path, 'expected a plain JSON value');
  }
  // Proof: bypassing prototype refusal accepted a class instance; dropping only the array
  // prototype check accepted Tools extends Array in the two JSON-shape refusal tests.
  const prototype: unknown = Object.getPrototypeOf(value);
  if (
    (Array.isArray(value)
      ? prototype !== Array.prototype
      : prototype !== Object.prototype && prototype !== null) ||
    ancestors.has(value)
  ) {
    throw new WorkflowBindingError('invalid_binding', path, 'expected an acyclic plain JSON value');
  }
  ancestors.add(value);
  // Proof: insertion-order traversal reported Z before A in
  // `reports the earliest sorted non-JSON class path`; removing the sort reproduced it.
  const keys = Reflect.ownKeys(value).sort((left, right) => {
    const leftKey = String(left);
    const rightKey = String(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  // Proof: removing the dense-array guard accepted an extra named tool-array property
  // in `refuses decorated and sparse JSON tool arrays`.
  if (
    Array.isArray(value) &&
    (keys.length !== value.length + 1 ||
      keys.some(
        (key) => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key)),
      ))
  ) {
    throw new WorkflowBindingError('invalid_binding', path, 'expected a dense JSON array');
  }
  for (const key of keys) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== 'string' ||
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, 'value')
    ) {
      throw new WorkflowBindingError(
        'invalid_binding',
        path,
        'expected enumerable JSON fields without accessors or symbols',
      );
    }
    const child: unknown = descriptor.value;
    checkJson(child, `${path}.${key}`, ancestors);
  }
  ancestors.delete(value);
}

function parseAt<Schema extends Type>(
  schema: Schema,
  input: unknown,
  path: string,
): Schema['infer'] {
  try {
    return parseOrThrow(schema, input);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    if (!(error.cause instanceof type.errors)) throw error;
    if (error.cause.length === 0) throw error;
    const failure = [...error.cause].sort((left, right) =>
      left.propString < right.propString ? -1 : left.propString > right.propString ? 1 : 0,
    )[0];
    const suffix = failure.propString;
    throw new WorkflowBindingError(
      'invalid_binding',
      suffix === '' ? path : `${path}.${suffix}`,
      failure.problem,
      { cause: error },
    );
  }
}

function checkDictionary(value: unknown, path: string): Record<string, unknown> {
  // Proof: removing nonemptiness accepted {} in `refuses empty types`.
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw new WorkflowBindingError('invalid_binding', path, 'expected a nonempty dictionary');
  }
  for (const key of Object.keys(value).sort()) {
    // Proof: separately removing whitespace and reserved-key checks accepted `type code`
    // and constructor in `refuses whitespace key` and `refuses reserved constructor key`.
    if (!/^\S+$/.test(key) || reservedKeys.has(key)) {
      throw new WorkflowBindingError(
        'invalid_binding',
        `${path}.${key}`,
        'expected a nonreserved nonempty key without whitespace',
      );
    }
  }
  return value;
}

// Proof: bypassing returned freezing, or only recursive traversal, let Reflect.set change
// nested selected settings in `freezes decoded and selected nested values`.
function freezeValue<Value>(value: Value): Value {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) freezeValue(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Decodes all five strict executor shapes, including unused classes, without IO or defaults.
 * Returns a detached, deeply frozen binding; caller-owned JSON remains mutable.
 * @throws {WorkflowBindingError} with a logical path when version, settings or JSON shape is invalid.
 */
export function decodeWorkflowBinding(input: unknown): Binding {
  checkJson(input, 'binding');
  // Proof: substituting caller aliases froze the caller's API settings; Reflect.set returned
  // false instead of true in `detaches without freezing caller-owned input`.
  const detached: unknown = structuredClone(input);
  if (!isRecord(detached))
    throw new WorkflowBindingError('invalid_binding', 'binding', 'expected a document object');
  // Proof: removing this classification changed version 2 to invalid_binding in
  // `refuses unsupported version`; Envelope still refused the unsupported shape.
  if (Object.hasOwn(detached, 'version') && detached['version'] !== 1) {
    throw new WorkflowBindingError('unsupported_version', 'version', 'expected version 1');
  }
  const envelope = parseAt(Envelope, detached, 'binding');
  const suppliedClasses = checkDictionary(envelope.classes, 'classes');
  const classes: Record<string, ActivityClass> = {};
  for (const name of Object.keys(suppliedClasses).sort()) {
    const settings = suppliedClasses[name];
    const path = `classes.${name}`;
    // Proof: bypassing required-executor classification changed the missing executor to
    // unknown_executor in `refuses missing executor`.
    if (!isRecord(settings) || typeof settings['executor'] !== 'string') {
      throw new WorkflowBindingError(
        'invalid_binding',
        `${path}.executor`,
        'expected an executor string',
      );
    }
    // Proof: bypassing discriminator classification changed other to invalid_binding
    // in `refuses unknown executor`; the strict union still refused it.
    if (!executors.has(settings['executor'])) {
      throw new WorkflowBindingError(
        'unknown_executor',
        `${path}.executor`,
        'unsupported executor',
      );
    }
    if (settings['executor'] === 'api-model' && typeof settings['model'] === 'string') {
      const colon = settings['model'].indexOf(':');
      // Proof: removing this classification changed a bare model to unknown_provider
      // in `refuses bare model`; it did not make that input valid.
      if (colon < 0)
        throw new WorkflowBindingError(
          'unpinned_model',
          `${path}.model`,
          'expected provider:model',
        );
      const provider = settings['model'].slice(0, colon);
      // Proof: bypassing the provider check accepted vendor:model in `refuses unknown provider`.
      if (!['anthropic', 'openai', 'openrouter'].includes(provider)) {
        throw new WorkflowBindingError(
          'unknown_provider',
          `${path}.model`,
          'unsupported model provider',
        );
      }
      // Proof: bypassing suffix shape accepted openai: in `refuses empty model suffix`.
      if (!/^\S+$/.test(settings['model'].slice(colon + 1))) {
        throw new WorkflowBindingError(
          'invalid_binding',
          `${path}.model`,
          'expected a nonempty model suffix without whitespace',
        );
      }
    }
    // Proof: separately bypassing RelativePath and drive checks accepted /absolute.md and
    // C:relative.md in their named prompt-path refusal tests.
    if (
      // Proof: removing this guard changed invalid_binding to invalid_prompt_path in
      // `refuses an undeclared tool prompt with invalid path` (fix round 1).
      settings['executor'] !== 'tool' &&
      typeof settings['prompt'] === 'string' &&
      (!RelativePath.allows(settings['prompt']) || /^[A-Za-z]:/.test(settings['prompt']))
    ) {
      throw new WorkflowBindingError(
        'invalid_prompt_path',
        `${path}.prompt`,
        'expected a canonical repository-relative prompt path',
      );
    }
    classes[name] = parseAt(Activity, settings, path);
  }
  const suppliedTypes = checkDictionary(envelope.types, 'types');
  const types: Record<string, Record<string, { readonly class: string }>> = {};
  for (const name of Object.keys(suppliedTypes).sort()) {
    const mapping = checkDictionary(suppliedTypes[name], `types.${name}`);
    const entries: Record<string, { readonly class: string }> = {};
    for (const step of Object.keys(mapping).sort()) {
      entries[step] = parseAt(Mapping, mapping[step], `types.${name}.${step}`);
    }
    types[name] = entries;
  }
  return freezeValue({ version: 1, types, classes });
}

/** Original caller-owned prompt bytes accepted synchronously by {@link acceptWorkflowBinding}. */
export interface PromptSource {
  readonly path: string;
  readonly bytes: Uint8Array;
}
/** Immutable text and base64 originals tied to the same exact byte hash. */
export interface PromptSnapshot {
  readonly path: string;
  readonly sha256: string;
  readonly text: string;
  readonly bytesBase64: string;
}
/** Canonical static acceptance content; its digest is distinct from a retained RunStore manifest. */
export interface AcceptanceSnapshot {
  readonly schemaVersion: 1;
  readonly binding: Binding;
  readonly projectSteps: readonly string[];
  readonly prompts: readonly { readonly path: string; readonly sha256: string }[];
}
/** Frozen static consistency and referenced-byte acceptance, without execution authority. */
export interface ValidatedBinding {
  readonly snapshot: AcceptanceSnapshot;
  readonly bindingDigest: string;
  readonly prompts: readonly PromptSnapshot[];
}
/** Selected accepted settings; tool activities have no prompt. */
export type SelectedActivity = Omit<ClassSelection, 'settings'> & {
  readonly bindingDigest: string;
} & (
    | { readonly settings: ToolClass; readonly prompt: null }
    | {
        readonly settings: Exclude<ActivityClass, ToolClass>;
        readonly prompt: Pick<PromptSnapshot, 'path' | 'sha256' | 'text'>;
      }
  );
