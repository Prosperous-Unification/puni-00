import {
  encodeCursor,
  isCursorOf,
  isUpdatedSince,
  nameMatches,
  type PageQuery,
} from './list-query';

/** The sort key of a project page entry: its update instant, then its id. */
export type ProjectKey = readonly [updatedAt: number | null, id: string];

/** What a project page needs of an entry; the entry itself is answered whole. */
export interface PageableProject {
  id: string;
  name: string;
  updatedAt: number | null;
}

/**
 * The key a project cursor carries, or null when the decoded cursor is not a
 * project cursor: `{ v: 1, k: [updatedAt | null, id] }` and nothing else.
 *
 * Proof, observed 2026-09-29: with the key-type checks removed, `refuses a
 * cursor that is not a project cursor` in `project-page.test.ts` accepted
 * `k: ["x", "p"]` instead of refusing it.
 */
export function projectKeyOf(cursor: unknown): ProjectKey | null {
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
 * order, so two projects stamped in one millisecond page deterministically.
 *
 * Proof, observed 2026-09-29: with the id tie-break removed, `a tie is broken
 * by id and a null instant sorts last` in `project-page.test.ts` answered `a`
 * before `b`; with the null branch removed it answered `c` first.
 */
export function compareProjectKeys(left: ProjectKey, right: ProjectKey): number {
  const [leftAt, leftId] = left;
  const [rightAt, rightId] = right;
  if (leftAt !== rightAt) {
    if (leftAt === null) return 1;
    if (rightAt === null) return -1;
    return rightAt - leftAt;
  }
  return leftId === rightId ? 0 : leftId < rightId ? 1 : -1;
}

const keyOf = (project: PageableProject): ProjectKey => [project.updatedAt, project.id];

/**
 * One page of `projects`, which the caller has already confined to what it may
 * read: ordered by {@link compareProjectKeys}, filtered by `search` and
 * `updatedSince`, resumed strictly after the cursor's key. Keyset resumption
 * means a project edited mid-walk moves ahead of the cursor and is not
 * answered again.
 *
 * Proof, observed 2026-09-29: resuming after the cursor's id instead of its
 * key made `a project edited mid-walk is not answered again` in
 * `project-page.test.ts` answer the edited project twice.
 */
export function pageProjects<P extends PageableProject>(
  projects: readonly P[],
  query: Omit<PageQuery, 'cursor'> & { after: ProjectKey | null },
): { projects: P[]; nextCursor: string | null } {
  const { after, search, updatedSince, limit } = query;
  const matching = projects
    .filter(
      (project) =>
        (search === null || nameMatches(project.name, search)) &&
        isUpdatedSince(project.updatedAt, updatedSince) &&
        (after === null || compareProjectKeys(keyOf(project), after) > 0),
    )
    .sort((left, right) => compareProjectKeys(keyOf(left), keyOf(right)));
  const page = matching.slice(0, limit);
  const last = page.at(-1);
  return {
    projects: page,
    nextCursor:
      matching.length > limit && last !== undefined ? encodeCursor({ v: 1, k: keyOf(last) }) : null,
  };
}
