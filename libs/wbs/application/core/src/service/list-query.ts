/** A page holds 25 entries unless asked for up to 200. */
export const PAGE_LIMIT = { default: 25, max: 200 } as const;

/** A search holds 1 to 200 characters after trimming. */
const SEARCH_MAX = 200;

/** A cursor is at most 512 base64url characters; every one this module issues is far shorter. */
const CURSOR_SPELLING = /^[A-Za-z0-9_-]{1,512}$/;

/** The parameters every paged read takes, as the shape's query schema admits them. */
export interface PageQueryInput {
  q?: string;
  updatedSince?: string;
  limit?: string;
  cursor?: string;
}

/** A page query after its grammar is checked; `cursor` is the decoded JSON, not yet its endpoint's shape. */
export interface PageQuery {
  search: string | null;
  updatedSince: number | null;
  limit: number;
  cursor: unknown;
}

/**
 * Whether the request names any query parameter twice. be-01's mount collapses
 * a declared query to the last value per key, so a repeated `status` would
 * otherwise be read as one of its values and the rest silently dropped.
 *
 * Proof, observed 2026-09-29: with this check removed, `refuses every value
 * outside the grammar` in `list-query.test.ts` failed on `limit=5&limit=6`
 * (received the parsed query instead of null).
 */
export function hasRepeatedKey(url: URL): boolean {
  const names = [...url.searchParams.keys()];
  return new Set(names).size !== names.length;
}

/**
 * The `limit` of a paged read: absent is {@link PAGE_LIMIT}'s default, a whole
 * number from 1 to its maximum is itself, anything else null.
 *
 * Proof, observed 2026-09-29: with the maximum check removed, `refuses every
 * value outside the grammar` in `list-query.test.ts` received a parsed query
 * instead of null for `limit=201`.
 */
export function limitOf(raw: string | undefined): number | null {
  if (raw === undefined) return PAGE_LIMIT.default;
  if (!/^[0-9]{1,7}$/.test(raw)) return null;
  const limit = Number(raw);
  return limit < 1 || limit > PAGE_LIMIT.max ? null : limit;
}

/** The trimmed search text, or null when it is empty or longer than 200 characters. */
export function searchOf(raw: string): string | null {
  const trimmed = raw.trim();
  const length = Array.from(trimmed).length;
  return length === 0 || length > SEARCH_MAX ? null : trimmed;
}

/** Whether `name` contains `search`, both compared after `toLowerCase()`; names only, never notes. */
export function nameMatches(name: string, search: string): boolean {
  return name.toLowerCase().includes(search.toLowerCase());
}

/** An instant in epoch milliseconds spelled in decimal digits, or null. */
export function instantOf(raw: string): number | null {
  if (!/^[0-9]{1,16}$/.test(raw)) return null;
  const instant = Number(raw);
  return Number.isSafeInteger(instant) ? instant : null;
}

/**
 * Whether an update instant passes `updatedSince`: inclusive, and a `null`
 * instant (a row written before the audit columns) never passes.
 *
 * Proof, observed 2026-09-29: with `>=` made `>`, `updatedSince is inclusive
 * and never matches null` in `project-page.test.ts` lost the project stamped
 * exactly at the bound.
 */
export function isUpdatedSince(updatedAt: number | null, since: number | null): boolean {
  if (since === null) return true;
  return updatedAt !== null && updatedAt >= since;
}

/** The base64url spelling, without padding, of a cursor payload's JSON. */
export function encodeCursor(
  payload: Readonly<Record<string, unknown>> & { readonly v: 1 },
): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/**
 * The JSON a cursor spells, or `undefined` when it is not base64url of UTF-8
 * JSON. The caller still checks the payload's shape for its endpoint.
 * `atob`, strict UTF-8 decoding and `JSON.parse` throw on malformed client
 * input; catching them here is the modeled refusal, not a swallowed failure.
 *
 * Proof, observed 2026-09-29: with the spelling check removed, `refuses every
 * value outside the grammar` in `list-query.test.ts` decoded the padded
 * `eyJ2IjoxfQ==` (standard base64, not base64url) instead of refusing it.
 */
export function decodeCursor(raw: string): unknown {
  if (!CURSOR_SPELLING.test(raw) || raw.length % 4 === 1) return undefined;
  const padded =
    raw.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (raw.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Whether `value` is a version-1 cursor object with exactly `keys` besides `v`.
 * Endpoints check their own value types after this.
 */
export function isCursorOf(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const present = Object.keys(value).sort();
  const expected = ['v', ...keys].sort();
  return (
    present.length === expected.length &&
    present.every((key, index) => key === expected[index]) &&
    Reflect.get(value, 'v') === 1
  );
}

/**
 * The common parameters of a paged read (spec `list-reads`), or null when any
 * is outside its grammar (including a repeated key); the route answers that
 * null with `400 invalid_query` before any store read. Absent parameters take
 * their documented defaults. A present cursor that does not decode
 * is null here; one that decodes is returned for its endpoint to shape-check.
 */
export function pageQueryOf(input: PageQueryInput, url: URL): PageQuery | null {
  if (hasRepeatedKey(url)) return null;
  const limit = limitOf(input.limit);
  if (limit === null) return null;
  const search = input.q === undefined ? null : searchOf(input.q);
  if (input.q !== undefined && search === null) return null;
  const updatedSince = input.updatedSince === undefined ? null : instantOf(input.updatedSince);
  if (input.updatedSince !== undefined && updatedSince === null) return null;
  const cursor = input.cursor === undefined ? null : decodeCursor(input.cursor);
  if (cursor === undefined) return null;
  return { search, updatedSince, limit, cursor };
}

/** Whether a request carries any paging parameter, which selects the paged contract. */
export function isPaged(input: PageQueryInput): boolean {
  return (
    input.q !== undefined ||
    input.updatedSince !== undefined ||
    input.limit !== undefined ||
    input.cursor !== undefined
  );
}
