import {
  encodeCursor,
  isCursorOf,
  isUpdatedSince,
  nameMatches,
  type PageQuery,
} from './list-query';

/** The sort key of a work package page entry: its update instant, then its id. */
export type WorkPackageKey = readonly [updatedAt: number | null, id: string];

/** What a work package page needs of an entry; the entry itself is answered whole. */
export interface PageableWorkPackage {
  id: string;
  name: string;
  updatedAt: number | null;
}

/**
 * The key a work package cursor carries, or null when the decoded cursor is not a
 * work package cursor: `{ v: 1, k: [updatedAt | null, id] }` and nothing else.
 *
 * Proof, observed 2026-09-29: with the key-type checks removed, `refuses a
 * cursor that is not a workPackage cursor` in `work-package-page.test.ts` accepted
 * `k: ["x", "p"]` instead of refusing it.
 */
export function workPackageKeyOf(cursor: unknown): WorkPackageKey | null {
  if (!isCursorOf(cursor, ['k'])) return null;
  const key: unknown = cursor['k'];
  if (!Array.isArray(key) || key.length !== 2) return null;
  const entries: readonly unknown[] = key;
  const [updatedAt, id] = entries;
  if (updatedAt !== null && (typeof updatedAt !== 'number' || !Number.isSafeInteger(updatedAt)))
    return null;
  if (typeof id !== 'string' || id === '') return null;
  return [updatedAt, id];
}

/**
 * Update instant descending, `null` instants last, then id descending: a total
 * order, so two work packages stamped in one millisecond page deterministically.
 *
 * Proof, observed 2026-09-29: with the id tie-break removed, `a tie is broken
 * by id and a null instant sorts last` in `work-package-page.test.ts` answered `a`
 * before `b`; with the null branch removed it answered `c` first.
 */
export function compareWorkPackageKeys(left: WorkPackageKey, right: WorkPackageKey): number {
  const [leftAt, leftId] = left;
  const [rightAt, rightId] = right;
  if (leftAt !== rightAt) {
    if (leftAt === null) return 1;
    if (rightAt === null) return -1;
    return rightAt - leftAt;
  }
  return leftId === rightId ? 0 : leftId < rightId ? 1 : -1;
}

const keyOf = (workPackage: PageableWorkPackage): WorkPackageKey => [
  workPackage.updatedAt,
  workPackage.id,
];

/**
 * One page of `workPackages`, which the caller has already confined to what it may
 * read: ordered by {@link compareWorkPackageKeys}, filtered by `search` and
 * `updatedSince`, resumed strictly after the cursor's key. Keyset resumption
 * means a work package edited mid-walk moves ahead of the cursor and is not
 * answered again.
 *
 * Proof, observed 2026-09-29: resuming after the cursor's id instead of its
 * key made `a workPackage edited mid-walk is not answered again` in
 * `work-package-page.test.ts` answer the edited work package twice.
 */
export function pageWorkPackages<P extends PageableWorkPackage>(
  workPackages: readonly P[],
  query: Omit<PageQuery, 'cursor'> & { after: WorkPackageKey | null },
): { workPackages: P[]; nextCursor: string | null } {
  const { after, search, updatedSince, limit } = query;
  const matching = workPackages
    .filter(
      (workPackage) =>
        (search === null || nameMatches(workPackage.name, search)) &&
        isUpdatedSince(workPackage.updatedAt, updatedSince) &&
        (after === null || compareWorkPackageKeys(keyOf(workPackage), after) > 0),
    )
    .sort((left, right) => compareWorkPackageKeys(keyOf(left), keyOf(right)));
  const page = matching.slice(0, limit);
  const last = page.at(-1);
  return {
    workPackages: page,
    nextCursor:
      matching.length > limit && last !== undefined ? encodeCursor({ v: 1, k: keyOf(last) }) : null,
  };
}
