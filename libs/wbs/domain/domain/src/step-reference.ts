import { isReservedStepCode, isStepCode } from './step-code';
import { orderSteps, type StepNodeRef } from './step-node';

/**
 * What a step reference is resolved against: every work item's current number
 * and leafhood, and every step's code (NULL while uncoded) and position.
 *
 * Numbers are the effective ones — derived, or frozen — so a reference means
 * what the table shows.
 */
export interface AddressSpace {
  workItems: readonly { id: string; number: string; isLeaf: boolean }[];
  steps: readonly { id: string; code: string | null; position: number }[];
}

/** A step reference taken apart: the ordinal is set only for the input alias. */
export interface ParsedStepReference {
  number: string;
  ordinal: number | null;
  code: string;
}

/** Why a step reference does not name a step node now. */
export type StepReferenceRefusal =
  | 'malformed'
  | 'unknown_work_item'
  | 'ambiguous_work_item'
  | 'parent'
  | 'unknown_code'
  | 'alias_mismatch';

const TAIL = /^(?:s([1-9][0-9]*)-)?([a-z][a-z0-9-]*)$/;
/** A work item number: dot-separated digit groups, as `deriveNumbers` writes them. */
const NUMBER = /^[0-9]+(?:\.[0-9]+)*$/;

/**
 * The canonical step reference: work item number, a dot, step code — `010.dev`,
 * `020.2.review`. Changes when the work item is renumbered, which is why it is
 * never an identity; see {@link StepNodeRef}.
 */
export function formatStepReference(number: string, code: string): string {
  return `${number}.${code}`;
}

/**
 * Takes a reference apart at its **last** dot — a code holds no dot, so the
 * split is unique however many segments the number has.
 *
 * The number must be dot-separated digit groups, the shape every derived and
 * frozen number has, and the code must be a whole step code — at most 32
 * characters and outside the reserved namespace.
 *
 * Also reads the input-only alias `<number>.s<ordinal>-<code>`, whose ordinal is
 * the step's 1-based displayed position. A tail that is itself reserved (`s2`)
 * is neither a code nor an alias.
 *
 * @returns `null` when the text is not a step reference at all.
 */
export function parseStepReference(text: string): ParsedStepReference | null {
  const cut = text.lastIndexOf('.');
  if (cut <= 0) return null;
  const number = text.slice(0, cut);
  if (!NUMBER.test(number)) return null;
  const tail = TAIL.exec(text.slice(cut + 1));
  if (tail === null) return null;
  // `at`, not an index: an optional group is `undefined` when it took no part
  // in the match, which only `at`'s return type says.
  const ordinal = tail.at(1);
  const code = tail[2];
  if (!isStepCode(code) || isReservedStepCode(code)) return null;
  if (ordinal !== undefined && !Number.isSafeInteger(Number(ordinal))) return null;
  return {
    number,
    ordinal: ordinal === undefined ? null : Number(ordinal),
    code,
  };
}

/**
 * Resolves a step reference within one project's current addresses.
 *
 * Staleness is not decided here: the caller compares the address revision the
 * reference was read at against {@link describeAddressSpace} of `space` first,
 * so resolution never follows a renumbering the reader did not see. An uncoded
 * step has no code to spell, so no reference resolves to it; its nodes stay
 * addressable by step node ID.
 *
 * @returns the node and its canonical spelling — never the alias.
 */
export function resolveStepReference(
  reference: string,
  space: AddressSpace,
): { ok: true; ref: StepNodeRef; reference: string } | { ok: false; reason: StepReferenceRefusal } {
  const parsed = parseStepReference(reference);
  if (parsed === null) return { ok: false, reason: 'malformed' };
  const holders = space.workItems.filter((each) => each.number === parsed.number);
  // Two rows can show one number: a frozen number moved under another parent
  // keeps its label while the siblings it left renumber into it. The table
  // still reads; a reference to that number names neither row.
  // Proof: with this refusal disabled, `refuses a number two work items hold`
  // failed on `- Expected - 2 / + Received + 6`, resolving to the first holder;
  // watched 2026-09-27.
  if (holders.length > 1) return { ok: false, reason: 'ambiguous_work_item' };
  const workItem = holders.at(0);
  if (workItem === undefined) return { ok: false, reason: 'unknown_work_item' };
  if (!workItem.isLeaf) return { ok: false, reason: 'parent' };
  const ordered = orderSteps(space.steps);
  const step = ordered.find((each) => each.code === parsed.code);
  if (step === undefined) return { ok: false, reason: 'unknown_code' };
  // Proof: with this comparison disabled, `refuses an alias whose position
  // names another step` failed on `- Expected - 2 / + Received + 6` — `010.s2-dev`
  // resolved to Dev although position 2 is QA; watched 2026-09-27.
  if (parsed.ordinal !== null && ordered[parsed.ordinal - 1]?.id !== step.id) {
    return { ok: false, reason: 'alias_mismatch' };
  }
  return {
    ok: true,
    ref: { workItemId: workItem.id, stepId: step.id },
    reference: formatStepReference(parsed.number, parsed.code),
  };
}

/**
 * The canonical text of a project's address space, which the address revision
 * is a digest of.
 *
 * Holds exactly what can change what a reference means: every work item's id,
 * effective number and leafhood, and every step's id, code and position,
 * uncoded steps included because they hold a displayed ordinal. Names, facts,
 * the freeze flag and entity revisions are left out, so an edit that changes no
 * address keeps the revision. Order-independent: both lists are sorted here.
 * Two work items holding one number are described like any others; resolving
 * that number is what refuses, as `ambiguous_work_item`.
 */
export function describeAddressSpace(projectId: string, space: AddressSpace): string {
  const workItems = [...space.workItems]
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map((each) => [each.id, each.number, each.isLeaf ? 'leaf' : 'parent']);
  const steps = orderSteps(space.steps).map((each) => [each.id, each.code, each.position]);
  return JSON.stringify(['ar1', projectId, workItems, steps]);
}
