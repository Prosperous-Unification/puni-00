/** Recursively immutable JSON evidence; no caller-owned collection survives decoding. */
export type Historical<T> = T extends object
  ? { readonly [Key in keyof T]: Historical<T[Key]> }
  : T;

/** Stable corruption identity for versioned historical readers and their eventual HTTP boundary. */
export class SavedHistoryError extends Error {
  override readonly name = 'SavedHistoryError';
  constructor(
    readonly code: string,
    readonly path: string,
    options?: ErrorOptions,
  ) {
    super(`saved history ${code} at ${path}`, options);
  }
}

/** Require a captured invariant without scheduling or replacing missing facts. */
export function requireHistory(condition: boolean, code: string, path: string): asserts condition {
  if (!condition) throw new SavedHistoryError(code, path);
}

/** Detached frozen JSON only: refuses Map, missing values, nonfinite numbers and exotic objects. */
export function detachHistory<T>(source: T, path = '$'): Historical<T> {
  if (source === null || typeof source === 'string' || typeof source === 'boolean') {
    // Boundary: primitive identity is unchanged by the recursive readonly mapping.
    return source as Historical<T>;
  }
  if (typeof source === 'number') {
    requireHistory(Number.isFinite(source), 'nonfinite', path);
    // Boundary: finite primitive validated above.
    return source as Historical<T>;
  }
  if (Array.isArray(source)) {
    // Boundary: every array child is recursively detached and frozen.
    return Object.freeze(
      source.map((entry: unknown, index) => detachHistory(entry, `${path}[${String(index)}]`)),
    ) as Historical<T>;
  }
  requireHistory(
    typeof source === 'object' && Object.getPrototypeOf(source) === Object.prototype,
    'json_required',
    path,
  );
  // Boundary: the plain-object guard above excludes prototypes and non-JSON containers.
  const record = source as Record<string, unknown>;
  // Boundary: all own enumerable fields retain their keys and recursively detached values.
  return Object.freeze(
    Object.fromEntries(
      Object.entries(record).map(([key, value]) => [key, detachHistory(value, `${path}.${key}`)]),
    ),
  ) as Historical<T>;
}

/** Sort object keys bytewise; array order carries its declared domain meaning. */
export function serializeHistory(source: unknown): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => compareHistoryKeys(left, right))
          .map(([key, child]) => [key, canonical(child)]),
      );
    return value;
  };
  return JSON.stringify(canonical(detachHistory(source)));
}

/** Bytewise ordering independent of locale and host settings. */
export function compareHistoryKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Refuse duplicate identities before Map construction could silently overwrite evidence. */
export function indexHistory<Entry>(
  entries: readonly Entry[],
  keyOf: (entry: Entry) => string,
  path: string,
): Map<string, Entry> {
  const indexed = new Map<string, Entry>();
  for (const entry of entries) {
    const key = keyOf(entry);
    requireHistory(!indexed.has(key), 'duplicate', `${path}.${key}`);
    indexed.set(key, entry);
  }
  return indexed;
}

/** Frozen historical slice-key encoding, independent of future scheduler code. */
export function historicalSliceKey(workItemId: string, stepId: string | null): string {
  requireHistory(
    !workItemId.includes('\u0000') && !stepId?.includes('\u0000'),
    'identity',
    '$.sliceKey',
  );
  return `${workItemId}\u0000${stepId ?? ''}`;
}

/** Read an own JSON record key with absence expressed in its return type. */
export function readHistoryKey<Value>(
  record: Readonly<Record<string, Value>>,
  key: string,
): Value | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
