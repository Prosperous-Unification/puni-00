import { isReservedStepCode, isStepCode } from './step-code';
import { orderSteps, type StepNodeRef } from './step-node';

/**
 * Current references resolve against effective numbers, leafhood and each leaf's
 * captured ordered step identities/codes. Uniform legacy spaces omit leafSteps
 * and retain their package columns, including uncoded positions.
 *
 * Numbers are the effective ones — derived, or frozen — so a reference means
 * what the table shows.
 */
export interface AddressSpace {
  workItems: readonly { id: string; number: string; isLeaf: boolean }[];
  steps: readonly { id: string; code: string | null; position: number }[];
  /** Current ordered leaf inventories, including explicit empty lists; absent only in uniform legacy spaces. */
  leafSteps?: ReadonlyMap<string, readonly { readonly id: string; readonly code: string | null }[]>;
}

/** Current leaf order is authoritative; only an explicitly uniform space uses package columns. */
export function readAddressSteps(space: AddressSpace, workItemId: string) {
  if (space.leafSteps === undefined) return orderSteps(space.steps);
  const steps = space.leafSteps.get(workItemId);
  // Proof: required-domain-map omitted this check; current address reader throws for an absent
  // required leaf inventory returned undefined instead of throwing (2026-11-20).
  if (steps === undefined) throw new Error('address leaf steps are absent');
  return steps;
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

const TAIL = /^(?:s(0*[1-9][0-9]*)-)?([a-z][a-z0-9-]*)$/;
/** A work item number: dot-separated digit groups, as `deriveNumbers` writes them. */
const NUMBER = /^[0-9]+(?:\.[0-9]+)*$/;

/**
 * The canonical step reference: work item number, then the displayed step
 * ordinal before its immutable code — `010.s1-dev`, `020.2.s02-review`.
 *
 * The ordinal is padded to the decimal width of the addressed leaf's step count, so
 * plain string sorting keeps the displayed step order within one work item.
 * Reordering or repadding changes this spelling, never {@link StepNodeRef}.
 */
export function formatStepReference(
  number: string,
  code: string,
  ordinal: number,
  stepCount: number,
): string {
  return `${number}.s${String(ordinal).padStart(String(stepCount).length, '0')}-${code}`;
}

/**
 * Takes a reference apart at its **last** dot — a code holds no dot, so the
 * split is unique however many segments the number has.
 *
 * The number must be dot-separated digit groups, the shape every derived and
 * frozen number has, and the code must be a whole step code — at most 32
 * characters and outside the reserved namespace.
 *
 * Also reads the legacy code-only form `<number>.<code>` and unpadded
 * ordinal forms. The ordinal is the step's 1-based displayed position and may
 * have leading zeroes. A tail that is itself reserved (`s2`) is neither a
 * code nor a complete ordinal reference.
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
 * Resolves a step reference within one work package's current addresses.
 *
 * Staleness is not decided here: the caller compares the address revision the
 * reference was read at against {@link describeAddressSpace} of `space` first,
 * so resolution never follows a renumbering the reader did not see. An uncoded
 * step has no code to spell, so no reference resolves to it; its nodes stay
 * addressable by step node ID.
 *
 * @returns the node and its canonical ordinal-first spelling.
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
  // Proof: resolver-union made the actual isolated HTTP read resolve an untyped leaf200
  // instead of422 in current tree carries each leaf own resolved steps and every matching binding.
  const ordered = readAddressSteps(space, workItem.id);
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
    reference: formatStepReference(
      parsed.number,
      parsed.code,
      ordered.indexOf(step) + 1,
      // Proof: resolver-padding used package count12; the current leaf-count control read s01-dev instead of s1-dev.
      ordered.length,
    ),
  };
}

/**
 * The canonical text of a work package's address space, which the address revision
 * is a digest of.
 *
 * Current ar2 describes each leaf's ordered identities/codes and ignores unused
 * package columns. Uniform legacy ar1 retains its exact package-order description,
 * including uncoded positions. Both describe every effective number and leafhood.
 * Names, provenance, facts, freeze flags and entity revisions cannot change it.
 * Work-item input order is immaterial; captured leaf order is meaningful.
 * Two work items holding one number are described like any others; resolving
 * that number is what refuses, as `ambiguous_work_item`.
 */
export function describeAddressSpace(workPackageId: string, space: AddressSpace): string {
  const workItems = [...space.workItems]
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map((each) => [each.id, each.number, each.isLeaf ? 'leaf' : 'parent']);
  if (space.leafSteps !== undefined) {
    const leaves = [...space.workItems]
      .filter(({ isLeaf }) => isLeaf)
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
      .map(({ id }) => [id, readAddressSteps(space, id).map((step) => [step.id, step.code])]);
    // Proof: digest-omission lost the actual unchanged-union type edit; digest-unused-union
    // falsely changed the unused-column control. Both owning revision assertions failed.
    return JSON.stringify(['ar2', workPackageId, workItems, leaves]);
  }
  const steps = orderSteps(space.steps).map((each) => [each.id, each.code, each.position]);
  // Proof: legacy-bytes appended a field and failed uniform legacy description keeps its exact ar1 representation.
  return JSON.stringify(['ar1', workPackageId, workItems, steps]);
}
