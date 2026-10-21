import { parseStepReference } from './step-reference';

/**
 * Validates a manual project abbreviation and normalizes ASCII lowercase only.
 * Does not trim, allocate, check uniqueness or resolve a project identity.
 */
export function parseProjectAbbreviation(
  value: string,
): { ok: true; abbreviation: string } | { ok: false; reason: 'invalid_abbreviation' } {
  // Proof: removing the length guard failed `rejects empty and twenty-one character abbreviations`.
  if (value.length > 20) {
    return { ok: false, reason: 'invalid_abbreviation' };
  }
  // Proof: removing the initial-letter guard failed `rejects leading digits hyphens and underscores`.
  if (!/^[A-Za-z]/.test(value)) return { ok: false, reason: 'invalid_abbreviation' };
  // Proof: removing this guard, or uppercasing before it, failed
  // `rejects dots whitespace and non-ASCII characters before normalization`.
  if (/[^A-Za-z0-9_-]/.test(value)) return { ok: false, reason: 'invalid_abbreviation' };
  return { ok: true, abbreviation: value.toUpperCase() };
}

/**
 * Name-derived recommendations, ordered from three to five ASCII letters.
 * Short names are padded with X; names without ASCII letters use PRJ. These
 * are candidates only: allocation must check the organization's occupied codes.
 */
export function suggestProjectAbbreviations(name: string): readonly string[] {
  // Proof: retaining nonletters failed `suggests only three to five ASCII letters`.
  const letters = name.replaceAll(/[^A-Za-z]/g, '').toUpperCase();
  const stem = letters.length === 0 ? 'PRJ' : letters;
  // Proof: offering lengths 2 and 6 failed `suggests only three to five ASCII letters`.
  return [3, 4, 5].map((length) => stem.slice(0, length).padEnd(length, 'X'));
}

/**
 * Parses syntax only, preserving local numbers and step spellings verbatim.
 * Numeric tokens stay local; the first dot of a qualified token separates its
 * case-insensitive project abbreviation from the existing local grammar.
 * No identity, ownership, lookup or address-revision authority is established.
 */
export function parseWorkItemAddress(
  token: string,
):
  | { kind: 'local'; reference: string }
  | { kind: 'qualified'; abbreviation: string; reference: string }
  | { kind: 'invalid' } {
  if (isLocalReference(token)) return { kind: 'local', reference: token };
  // Proof: splitting at the last dot failed `parses PUNI-CORE.080.39 and PUNI_CORE.020.s1-dev`.
  const cut = token.indexOf('.');
  const prefix = parseProjectAbbreviation(token.slice(0, cut));
  // Proof: admitting a refused prefix failed `rejects malformed project prefixes`.
  if (!prefix.ok) return { kind: 'invalid' };
  const reference = token.slice(cut + 1);
  // Proof: removing this guard failed `rejects empty qualified endpoints`.
  if (!isLocalReference(reference)) return { kind: 'invalid' };
  return { kind: 'qualified', abbreviation: prefix.abbreviation, reference };
}

/**
 * Uses the digit-group shape of step-reference's numbers, or its full step parser.
 * The negative lookahead requires the actual end, including after a final newline.
 */
function isLocalReference(reference: string): boolean {
  // Proof: accepting partial digit/dot strings or replacing the step parser with
  // a dot check each failed `rejects malformed local and qualified references`.
  return /^[0-9]+(?:\.[0-9]+)*(?![\s\S])/.test(reference) || parseStepReference(reference) !== null;
}
