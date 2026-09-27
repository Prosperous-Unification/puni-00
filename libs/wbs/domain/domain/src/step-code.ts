/** The longest a step code may be, suffix included. */
export const STEP_CODE_MAX_LENGTH = 32;

const STEP_CODE = /^[a-z][a-z0-9-]*$/;

/**
 * The ordinal alias's namespace: `s1`, `s12-review`. A step reference may spell
 * a step by displayed position as `010.s1-dev`, so a code of that shape would
 * make `010.s1-dev` mean two things.
 */
const RESERVED_STEP_CODE = /^s[0-9]+(?:-|$)/;

/** The stem a name with nothing codeable in it gets, and the prefix that makes a stem start with a letter. */
const FALLBACK_STEM = 'step';

/**
 * Whether `candidate` is a step code by grammar: a lowercase letter, then
 * lowercase letters, digits or hyphens, at most {@link STEP_CODE_MAX_LENGTH}.
 *
 * Says nothing about reservation or uniqueness; see {@link isReservedStepCode}.
 */
export function isStepCode(candidate: string): boolean {
  return candidate.length <= STEP_CODE_MAX_LENGTH && STEP_CODE.test(candidate);
}

/** Whether `code` lies in the ordinal alias's namespace, `s<digits>` or `s<digits>-…`. */
export function isReservedStepCode(code: string): boolean {
  return RESERVED_STEP_CODE.test(code);
}

/** Cuts `stem` to `length` and trims the hyphens a cut can leave at its end. */
function cut(stem: string, length: number): string {
  return stem.slice(0, length).replace(/-+$/, '');
}

/**
 * The code a step named `name` is given when nobody chose one: lowercased,
 * every run of characters outside `[a-z0-9]` collapsed to one hyphen, hyphens
 * trimmed, prefixed `step-` when the result does not start with a letter or is
 * reserved, and suffixed `-2`, `-3`… while `taken` holds it — the stem cut so
 * stem and suffix stay within {@link STEP_CODE_MAX_LENGTH}.
 *
 * One function for every place a code is suggested — step creation, a plan
 * document of an earlier version, and the post-swap backfill of steps an older
 * writer left uncoded — so the three cannot drift. A name with nothing codeable
 * in it (`Ревю`, `!!!`) is coded `step`.
 *
 * Always answers a code {@link isStepCode} accepts and {@link isReservedStepCode}
 * refuses; `taken` is the project's codes, and the answer is never in it.
 */
export function suggestStepCode(name: string, taken: ReadonlySet<string>): string {
  const collapsed = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const prefixed =
    collapsed === ''
      ? FALLBACK_STEM
      : /^[a-z]/.test(collapsed) && !isReservedStepCode(collapsed)
        ? collapsed
        : `${FALLBACK_STEM}-${collapsed}`;
  const stem = cut(prefixed, STEP_CODE_MAX_LENGTH);
  if (!taken.has(stem)) return stem;
  for (let n = 2; ; n += 1) {
    const suffix = `-${String(n)}`;
    const code = `${cut(stem, STEP_CODE_MAX_LENGTH - suffix.length)}${suffix}`;
    if (!taken.has(code)) return code;
  }
}

/**
 * {@link suggestStepCode} for several steps at once, in the order given — step
 * order, for the backfill — each suggestion taken before the next is made, so
 * two steps named `Review` and `Review!` are coded `review` and `review-2`.
 */
export function suggestStepCodes(names: readonly string[], taken: ReadonlySet<string>): string[] {
  const held = new Set(taken);
  return names.map((name) => {
    const code = suggestStepCode(name, held);
    held.add(code);
    return code;
  });
}
