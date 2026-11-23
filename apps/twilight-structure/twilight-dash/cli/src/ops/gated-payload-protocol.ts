/**
 * Maximum encoded private environment body; no OS exec-environment capacity is implied.
 * Proof: the separately human-selected encoder observation40 raised8MiB to16MiB and
 * `refuses encoded private input beyond8MiB instead of allocating or launching a helper`
 * failed at its first encoder assertion, returning a printed8388631-byte frame. One later
 * unchanged baseline passed. This proves neither decoder rejection nor allocation absence;
 * the original automated recipe stays excluded for its literal-rendering mismatch.
 */
export const GATED_ENVIRONMENT_BYTES = 8 * 1024 * 1024;
const entryLimit = Math.floor(GATED_ENVIRONMENT_BYTES / 8);

/** A redacted failure of the closed private gated-payload protocol. */
export class GatedProtocolFailure extends Error {}
function refuse(reason: string): never {
  throw new GatedProtocolFailure('gated payload: ' + reason);
}
/**
 * Reject invalid protocol entries for both codec directions.
 * Proof: removing the empty/equal-name clauses failed the native decoder-stage oracles
 * `env-name-empty` and `env-name-equal`; no OS key-normalization claim follows.
 * Separately removing either NUL clause failed the existing direct decoder toThrow at
 * gated-payload-protocol.test.ts:59 for a\u0000b and bad\u0000value; restored tests passed.
 * Those two observations are decoder-only, not encoder/native-FD5 or old46/47 salvage.
 */
function requireEntry(name: string, value: string): void {
  if (name === '' || name.includes('=') || name.includes('\0') || value.includes('\0'))
    refuse('private environment entry is invalid');
}
/** Count JSON-quoted UTF8 bytes without allocating a potentially oversized quoted string. */
function quotedBytes(value: string, budget: number): number {
  let count = 2;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (
      code === 34 ||
      code === 92 ||
      code === 8 ||
      code === 9 ||
      code === 10 ||
      code === 12 ||
      code === 13
    )
      count += 2;
    else if (code < 32) count += 6;
    else if (code < 128) count++;
    else if (code < 2048) count += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      count += 4;
      index++;
    } else if (code >= 0xd800 && code <= 0xdfff) count += 6;
    else count += 3;
    if (count > budget) refuse('private environment exceeds its byte limit');
  }
  if (count > budget) refuse('private environment exceeds its byte limit');
  return count;
}

/** Capture defined own environment values into one bounded v1 frame, before any helper launch. */
export function encodeGatedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): Uint8Array {
  const entries: [string, string][] = [];
  let size = 6;
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined) continue;
    if (typeof value !== 'string') refuse('private environment value is invalid');
    requireEntry(name, value);
    size += (entries.length === 0 ? 0 : 1) + 3;
    size += quotedBytes(name, GATED_ENVIRONMENT_BYTES - size);
    size += quotedBytes(value, GATED_ENVIRONMENT_BYTES - size);
    if (entries.length >= entryLimit) refuse('private environment has too many entries');
    entries.push([name, value]);
  }
  const body = new TextEncoder().encode(JSON.stringify([1, entries]));
  if (body.byteLength !== size || body.byteLength > GATED_ENVIRONMENT_BYTES)
    refuse('private environment byte accounting disagrees');
  const frame = new Uint8Array(body.byteLength + 4);
  new DataView(frame.buffer).setUint32(0, body.byteLength, false);
  frame.set(body, 4);
  return frame;
}

/**
 * Validate one bounded environment body once at its external boundary. Object.fromEntries
 * preserves names such as __proto__ as own values; decoded bytes never enter helper process.env.
 * JSON/UTF8 parse diagnostics are deliberately redacted instead of retaining private excerpts.
 * Proof: relaxing fatal UTF8 or rethrowing the caught JSON parse cause instead of canonical
 * refusal changed the stage in `gated proof oracle env-utf8` / `env-json`. JSON.parse remained
 * unchanged; these observations prove refusal-stage behavior only, not excerpt privacy or admission.
 * @see ../../docs/gated-payload-proof.md
 */
export function decodeGatedEnvironment(body: Uint8Array): Record<string, string> {
  if (body.byteLength > GATED_ENVIRONMENT_BYTES)
    refuse('private environment exceeds its byte limit');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body);
  } catch (cause) {
    if (!(cause instanceof TypeError)) throw cause;
    refuse('private environment UTF8 is invalid');
  }
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch (cause) {
    if (!(cause instanceof SyntaxError)) throw cause;
    refuse('private environment JSON is invalid');
  }
  // Proof: removing this compound guard admitted version2 in `gated proof oracle
  // env-version`; no separate proof for every tuple-shape disjunct is claimed.
  if (
    !Array.isArray(envelope) ||
    envelope.length !== 2 ||
    envelope[0] !== 1 ||
    !Array.isArray(envelope[1])
  )
    refuse('private environment version or shape is invalid');
  const rawEntries: unknown[] = envelope[1];
  // Proof: removing this check moved `gated proof oracle env-count-stage` from count
  // refusal to entry-shape refusal for1048577 invalid empty entries. Stage/order only:
  // it establishes no valid over-count admission inside the8MiB body limit.
  if (rawEntries.length > entryLimit) refuse('private environment has too many entries');
  const entries: [string, string][] = [],
    names = new Set<string>();
  for (const raw of rawEntries) {
    // Proof: removing this compound guard admitted the three-element entry in
    // `gated proof oracle env-entry-arity`; other shape arms are not independent claims.
    if (!Array.isArray(raw) || raw.length !== 2)
      refuse('private environment entry shape is invalid');
    const name: unknown = raw[0],
      value: unknown = raw[1];
    // Proof: dropping types changed numeric-name refusal to an unexpected boundary error
    // in `gated proof oracle env-name-type`. Both helpers still refused: stage only,
    // without a numeric-value or payload-admission negative.
    if (typeof name !== 'string' || typeof value !== 'string')
      refuse('private environment entry type is invalid');
    requireEntry(name, value);
    // Proof: removing duplicate refusal admits the conflicting map in
    // `gated proof oracle env-duplicate`; restoration refuses it.
    if (names.has(name)) refuse('private environment name is duplicated');
    names.add(name);
    entries.push([name, value]);
  }
  // Proof: assignment-map replacement loses own __proto__ fidelity in
  // `gated proof oracle environment-ownership`; constructor survives both epochs,
  // so this is no independent constructor-negative observation.
  return Object.fromEntries(entries);
}
export type GatedStatus =
  | { readonly kind: 'status'; readonly status: number }
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid' };

/** Decode at most one canonical ASCII status frame; absent and invalid never imply payload0. */
export function parseGatedStatus(bytes: Uint8Array): GatedStatus {
  if (bytes.byteLength === 0) return { kind: 'absent' };
  if (bytes.byteLength > 4) return { kind: 'invalid' };
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  // Proof: relaxing canonical decimal admits00 in the existing malformed-status API
  // case; raising the bound below admits256. These are parser observations, not new
  // installed/native FD4 or every-numeric-arm proofs.
  if (!/^(?:0|[1-9][0-9]{0,2})\n$/u.test(text)) return { kind: 'invalid' };
  const status = Number(text.slice(0, -1));
  return status <= 255 ? { kind: 'status', status } : { kind: 'invalid' };
}
