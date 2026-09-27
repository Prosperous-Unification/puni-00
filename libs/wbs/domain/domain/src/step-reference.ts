import type { StepNodeRef } from './step-node';

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
  'malformed' | 'unknown_work_item' | 'parent' | 'unknown_code' | 'alias_mismatch';

const TAIL = /^(?:s([1-9][0-9]*)-)?([a-z][a-z0-9-]*)$/;
const RESERVED = /^s[0-9]+(?:-|$)/;

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
 * Also reads the input-only alias `<number>.s<ordinal>-<code>`, whose ordinal is
 * the step's 1-based displayed position. A tail that is itself reserved (`s2`)
 * is neither a code nor an alias.
 *
 * @returns `null` when the text is not a step reference at all.
 */
export function parseStepReference(text: string): ParsedStepReference | null {
  const cut = text.lastIndexOf('.');
  if (cut <= 0) return null;
  const tail = TAIL.exec(text.slice(cut + 1));
  if (tail === null) return null;
  // `at`, not an index: an optional group is `undefined` when it took no part
  // in the match, which only `at`'s return type says.
  const ordinal = tail.at(1);
  const code = tail[2];
  if (RESERVED.test(code)) return null;
  return {
    number: text.slice(0, cut),
    ordinal: ordinal === undefined ? null : Number(ordinal),
    code,
  };
}

/** Steps in displayed order: position, then id, as the store reads them. */
function stepsInOrder(steps: AddressSpace['steps']): AddressSpace['steps'] {
  return [...steps].sort(
    (left, right) =>
      left.position - right.position || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );
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
  const workItem = space.workItems.find((each) => each.number === parsed.number);
  if (workItem === undefined) return { ok: false, reason: 'unknown_work_item' };
  if (!workItem.isLeaf) return { ok: false, reason: 'parent' };
  const ordered = stepsInOrder(space.steps);
  const step = ordered.find((each) => each.code === parsed.code);
  if (step === undefined) return { ok: false, reason: 'unknown_code' };
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
 *
 * @throws when two work items hold one number: a reference to it would be
 *   ambiguous, and that is a broken tree, not a state to resolve against.
 */
export function describeAddressSpace(projectId: string, space: AddressSpace): string {
  const holders = new Map<string, string>();
  for (const each of space.workItems) {
    const holder = holders.get(each.number);
    if (holder !== undefined) {
      throw new Error(`number ${each.number} is held by ${holder} and ${each.id}`);
    }
    holders.set(each.number, each.id);
  }
  const workItems = [...space.workItems]
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map((each) => [each.id, each.number, each.isLeaf ? 'leaf' : 'parent']);
  const steps = stepsInOrder(space.steps).map((each) => [each.id, each.code, each.position]);
  return JSON.stringify(['ar1', projectId, workItems, steps]);
}
