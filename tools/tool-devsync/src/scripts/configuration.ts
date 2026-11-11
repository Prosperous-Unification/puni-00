import { type Node, type ParseError, parseTree } from 'jsonc-parser';
import { isScalar, parseDocument, visit } from 'yaml';

import type { Entry } from './workspace';

export type Json = null | boolean | number | string | readonly Json[] | JsonObject;
export interface JsonObject {
  readonly [key: string]: Json;
}

export function isObject(value: Json | undefined): value is JsonObject {
  return (
    value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value)
  );
}
export function requireObject(value: Json | undefined, context: string): JsonObject {
  // Proof: c31c-configuration-root-shape; injected if (!isObject(value)) throw new Error('script configuration requires an object: ' + context); → if (false) throw new Error("disabled object diagnostic"); failed `refuses non-object or non-string package execution shapes []` and 1 other named controls; restoration passed. Array root/scripts can silently omit consumers; numeric command remains separately guarded. Interpret each reached named case.
  if (!isObject(value)) throw new Error('script configuration requires an object: ' + context);
  return value;
}
export function readField(record: JsonObject, key: string): Json | undefined {
  // Proof: c31c-configuration-own-properties; injected return Object.hasOwn(record, key) ? record[key] : undefined; → return record[key]; failed `does not read inherited JavaScript prototype properties as Nx defaults`; restoration passed. Actual toString target and empty defaults; inherited prototype must not become Nx configuration.
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
export function requireString(value: Json | undefined, context: string): string {
  // Proof: c31c-configuration-string-shape; injected if (typeof value !== 'string' || value === '') → if (false) failed `refuses non-object or non-string package execution shapes {"scripts":{"verify":12}}`; restoration passed. Current numeric command case still fails at trimStart but loses explicit requires-string diagnostic. No independent empty-string proof.
  if (typeof value !== 'string' || value === '')
    throw new Error('script configuration requires a nonempty string: ' + context);
  return value;
}
export function decodeUtf8(bytes: Uint8Array, context: string): string {
  try {
    // Proof: c31c-configuration-utf8; injected { fatal: true, ignoreBOM: true } → { fatal: false, ignoreBOM: true } failed `refuses malformed UTF8 inside an otherwise valid captured package configuration`; restoration passed. Invalid byte is inside an otherwise valid JSON string while the command/target remain valid; replacement decoding must not admit the configuration.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (cause) {
    throw new Error('script configuration UTF8 is malformed: ' + context, { cause });
  }
}

function decodeJson(value: unknown, context: string, ancestors: Set<object>): Json {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  // Proof: c31c-configuration-yaml-finite; injected typeof value === 'number' && Number.isFinite(value) → typeof value === 'number' failed `refuses nonfinite YAML numbers instead of colliding their execution identity with null`; restoration passed. Nonfinite scalar admitted by mutant; command context digest would otherwise serialize Infinity as null.
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // Proof: c31c-configuration-json-primitive; injected typeof value !== 'object' → false failed `refuses nonfinite YAML numbers instead of colliding their execution identity with null`; restoration passed. Explicit non-JSON value diagnostic; prototype-object refusal may remain after guard removal.
  if (typeof value !== 'object')
    throw new Error('script configuration contains a non-JSON value: ' + context);
  // Proof: c31c-configuration-yaml-cycle; injected if (ancestors.has(value)) → if (false) failed `refuses cyclic YAML values as non-JSON state instead of recursing into a partial discovery`; restoration passed. Explicit cycle diagnostic only: removing guard may still raise ordinary JS stack RangeError. No native crash/test-timeout credit.
  if (ancestors.has(value))
    throw new Error('script configuration contains an alias cycle: ' + context);
  ancestors.add(value);
  try {
    if (Array.isArray(value))
      return value.map((entry: unknown) => decodeJson(entry, context, ancestors));
    // Proof: c31c-configuration-yaml-json-objects; injected if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) → if (false) failed `refuses tagged YAML objects that cannot be represented in the JSON execution model`; restoration passed. Tagged timestamp Date becomes empty object under mutant; explicit JSON model excludes it.
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
      throw new Error('script configuration contains a non-JSON object: ' + context);
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]: [string, unknown]) => [
        key,
        decodeJson(entry, context, ancestors),
      ]),
    );
  } finally {
    ancestors.delete(value);
  }
}

function decodeNode(node: Node, context: string): Json {
  if (node.type === 'object' || node.type === 'array') {
    const children = node.children;
    // Proof: c31c-configuration-container-children; injected children === undefined → false failed `refuses broken parser AST children with a contextual boundary error`; restoration passed. Controlled parser contract fault; removal can still produce native iteration failure, so explicit boundary diagnostic only.
    if (children === undefined)
      throw new Error('script JSON parser omitted container children: ' + context);
    if (node.type === 'array') return children.map((child) => decodeNode(child, context));
    const properties = new Map<string, Json>();
    for (const property of children) {
      const key = property.children?.at(0),
        child = property.children?.at(1);
      // Proof: c31c-configuration-object-property; injected property.type !== 'property' || key === undefined || child === undefined → false failed `refuses broken parser AST property with a contextual boundary error`; restoration passed. Controlled missing property-value node; later decode can still fail, explicit parser boundary diagnostic only.
      if (property.type !== 'property' || key === undefined || child === undefined)
        throw new Error('script JSON parser omitted object property: ' + context);
      const name: unknown = key.value;
      // Proof: c31c-configuration-property-key; injected typeof name !== 'string' → false failed `refuses broken parser AST key with a contextual boundary error`; restoration passed. Controlled parser returns numeric key for otherwise valid tree; ignoring it must not admit a silently lost scripts field.
      if (typeof name !== 'string')
        throw new Error('script JSON property key is malformed: ' + context);
      // Proof: c31c-configuration-json-duplicates; injected if (properties.has(name)) → if (false) failed `refuses malformed or duplicate execution configuration package.json "{\"scripts\":{\"x\":\"bun a\",\"x\":\"bun b\"}}"`; restoration passed. Duplicate JSON script property is silently overwritten by mutant; no claim malformed-syntax parser errors are covered.
      if (properties.has(name))
        throw new Error('script configuration duplicate property: ' + context + ' ' + name);
      properties.set(name, decodeNode(child, context));
    }
    return Object.fromEntries(properties);
  }
  const value: unknown = node.value;
  return decodeJson(value, context, new Set());
}

/** Decode one captured configuration once; duplicates/parser warnings and non-JSON values refuse. */
export function readConfiguration(entry: Entry, syntax: 'json' | 'jsonc' | 'yaml'): JsonObject {
  // Proof: c31c-configuration-regular; injected if (entry.kind !== 'file') → if (false) failed `refuses a symbolic configuration boundary before decoding its external bytes`; restoration passed. Diagnostic ordering: disabled regular-file guard can still meet absent bytes while decoding; do not infer independent symlink traversal admission.
  if (entry.kind !== 'file')
    throw new Error('script configuration requires a captured regular file: ' + entry.path);
  const text = decodeUtf8(entry.bytes, entry.path);
  if (syntax === 'yaml') {
    const document = parseDocument(text, { version: '1.2', uniqueKeys: true, strict: true });
    // Proof: c31c-configuration-yaml-errors; injected document.errors.length > 0 || document.warnings.length > 0 → document.warnings.length > 0 failed `refuses malformed or duplicate execution configuration .github/workflows/ci.yml "jobs:\n  x:\n    steps: ["` and 1 other named controls; restoration passed. Malformed syntax and duplicate YAML are selected together; inspect which cases reach ordinary failures; parser/conversion may retain additional refusal.
    // Proof: c31c-configuration-yaml-warnings; injected document.errors.length > 0 || document.warnings.length > 0 → document.errors.length > 0 failed `refuses unresolved YAML tags even if the library could return a string command`; restoration passed. Unknown tag warning would otherwise become a usable string command.
    if (document.errors.length > 0 || document.warnings.length > 0)
      throw new Error(
        'script YAML configuration is malformed: ' +
          entry.path +
          ': ' +
          [...document.errors, ...document.warnings].map((issue) => issue.message).join('; '),
      );
    visit(document, {
      Pair(_key, pair) {
        const key: unknown = pair.key;
        // Proof: c31c-configuration-yaml-string-keys; injected !isScalar(key) || typeof key.value !== 'string' || key.value === '<<' → isScalar(key) && key.value === '<<' failed `rejects YAML non-string mapping keys before distinct scalar keys can overwrite one another`; restoration passed. Single grouped key-domain fault; actual numeric/string collision reaches overwrite. Not separate proof for every scalar/collection key shape.
        // Proof: c31c-configuration-yaml-merge; injected || key.value === '<<' →  failed `refuses YAML merge semantics instead of overlooking a merged startup program`; restoration passed. Mapping merge-key refusal; inspect downstream startup-indirection refusal if conversion resolves merge in this pinned library.
        if (!isScalar(key) || typeof key.value !== 'string' || key.value === '<<')
          throw new Error(
            'script YAML mapping key must be an explicit string without merge semantics: ' +
              entry.path,
          );
      },
    });
    // Proof: c31c-configuration-yaml-alias-budget; injected maxAliasCount: 100 → maxAliasCount: -1 failed `refuses excessive YAML alias expansion before materializing the configuration`; restoration passed. Bounded finite fixture; disable library alias cap, do not run unbounded expansion specimen.
    const value: unknown = document.toJS({ maxAliasCount: 100 });
    return requireObject(decodeJson(value, entry.path, new Set()), entry.path);
  }
  const errors: ParseError[] = [],
    node = parseTree(text, errors, {
      // Proof: c31c-configuration-package-trailing; injected allowTrailingComma: syntax === 'jsonc' → allowTrailingComma: true failed `refuses strict or malformed configuration syntax package.json "{\"scripts\":{\"verify\":\"bun ./safe.xyz\",}}"`; restoration passed. Selected strict-package trailing-comma case admits otherwise valid execution under mutant; comments may remain refused.
      // Proof: c31c-configuration-jsonc-positive; injected allowTrailingComma: syntax === 'jsonc' → allowTrailingComma: false failed `accepts explicit Nx JSONC comments and trailing commas without relaxing package JSON`; restoration passed. Required supported Nx JSONC observation must remain admissible; this is positive syntax compatibility, not unsafe admission.
      allowTrailingComma: syntax === 'jsonc',
      // Proof: c31c-configuration-package-comments; injected disallowComments: syntax === 'json' → disallowComments: false failed `refuses strict or malformed configuration syntax package.json "// unsupported package comment\n{\"scripts\":{\"verify\":\"bun ./safe.xyz\"}}"`; restoration passed. Otherwise valid package command and captured target; the package JSON boundary cannot silently adopt JSONC comments.
      disallowComments: syntax === 'json',
    });
  // Proof: c31c-configuration-json-errors; injected errors.length > 0 || node === undefined → false failed `refuses strict or malformed configuration syntax package.json "{"` and 3 other named controls; restoration passed. Recovered JSON/JSONC trees cannot bypass parser errors. Inspect malformed-root versus recovered valid-body cases; later structural diagnostics are not admission.
  if (errors.length > 0 || node === undefined)
    throw new Error('script JSON configuration is malformed: ' + entry.path);
  return requireObject(decodeNode(node, entry.path), entry.path);
}

/** Stable execution identity ignores object key ordering while retaining array order and scalar types. */
export function canonicalize(value: Json): Json {
  if (isArray(value)) return value.map((entry) => canonicalize(entry));
  if (isObject(value))
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  return value;
}

/** Preserve JSON element types across the platform Array.isArray boundary. */
export function isArray(value: Json | undefined): value is readonly Json[] {
  return Array.isArray(value);
}
