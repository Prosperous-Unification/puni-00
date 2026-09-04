/**
 * Task 1.1: the canonical form of a `schedule()` call, as one string.
 *
 * A cached optimized result is keyed on the hash of this string, so the rule it
 * has to satisfy is narrow and total: **two calls that would produce different
 * schedules must produce different strings, and two that would produce the same
 * schedule should produce the same string.** The first half is a correctness
 * obligation — a fact left out serves a stale schedule as current. The second is
 * only a hit-rate one, which is why the asymmetries below all fall the safe way.
 *
 * It lives beside Fast rather than in `apps/be-01/src/service/` because the
 * argument tuple is `schedule.ts`'s, and a normalizer kept anywhere else is a
 * second reading of that tuple that drifts the first time an argument is added.
 * Everything it needs already exists: {@link indexTree} finds the leaves and
 * {@link groupSlicesByLeaf} groups by them, both with the refusals the engine
 * itself makes.
 *
 * **Not in the barrel** (`index.ts`), deliberately: {@link scheduleInputHash}
 * imports `node:crypto` and `libs/domain/src` has no other `node:` import in it.
 * `apps/fe-01` imports this library exclusively by subpath — 0 root-barrel
 * imports at `9a8e4a98` — so keeping the module out of `export *` is what stops
 * a future root import from pulling a Node builtin into a browser bundle.
 * `fast-golden-corpus.ts` and `effective-label.ts` are out of it for their own
 * reasons already.
 */

import { createHash } from 'node:crypto';

import type { DependencyReach } from './dependency-reach';
import type { PlannedRow } from './derive-numbers';
import { type DependencyEdge, indexTree, type PoolSizes, type Slice } from './schedule';
import { groupSlicesByLeaf } from './slice-groups';

/**
 * The exact argument tuple of `schedule(rows, edges, slices, notBefore,
 * poolSizes, reach, deadlines)`.
 *
 * Every member is required here even though `schedule()` defaults four of them.
 * A default is a caller's convenience; a hash input that could be absent is a
 * hash that means two things, so the caller states the empty map rather than
 * omitting it.
 *
 * `deadlines` is the **seventh** argument, and `schedule()` does not take it
 * yet. TASK-219 owns the plumbing and TASK-241 owns the field and its source
 * (`tasks.md` §1, "whose seventh argument this is"), so today every caller
 * passes an empty map and the entry canonicalizes to `[]`. That empty state is
 * the *proved* state rather than a placeholder: 1.6's no-op proof requires the
 * seventh argument to leave every golden corpus case byte-identical.
 */
export interface ScheduleInput {
  readonly rows: readonly PlannedRow[];
  readonly edges: readonly DependencyEdge[];
  readonly slices: readonly Slice[];
  readonly notBefore: ReadonlyMap<string, number>;
  readonly poolSizes: PoolSizes;
  readonly reach: DependencyReach;
  readonly deadlines: ReadonlyMap<string, number>;
}

/**
 * Byte-wise, and never `localeCompare`.
 *
 * The hash has to be the same on every machine that computes it — blue and
 * green, a developer's box and CI — and `localeCompare` is the one string
 * comparison in JavaScript that is allowed to differ by ICU build. The corpus
 * serializer uses this same idiom for the same reason
 * (`fast-golden-corpus.ts:171`).
 */
const byBytes = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/** `[key, value]` pairs from a map, sorted by key. Used for (d), (e) and (g). */
const sortedPairs = <V>(map: ReadonlyMap<string, V>): [string, V][] =>
  [...map.entries()].sort(([left], [right]) => byBytes(left, right));

/**
 * The canonical JSON string for one `schedule()` call.
 *
 * Seven entries in the argument tuple's own order, each named, so a field
 * dropped from this function is a visible hole in the string rather than a
 * silent collision. Object literals are used throughout because
 * `JSON.stringify` emits a literal's keys in source order, which makes the
 * output deterministic without a key-sorting replacer.
 *
 * **(a) rows, sorted by `id`, carrying the AS-WRITTEN `priority`.** Not the
 * resolved leaf priority. A parent's priority edit that changes no leaf's
 * effective priority today still changes the plan the moment a work item moves
 * under it, so hashing the resolution would serve a cached schedule computed
 * from a priority nobody holds any more. Same argument as (g)'s.
 *
 * **(b) authored edges, sorted by the pair.** The leaf expansion is derived
 * from these by {@link expandToLeaves}, so hashing the expansion would be
 * hashing a function of the tree twice — and would miss an authored edge whose
 * expansion is empty today.
 *
 * **(c) slices grouped by work item, groups ordered by `workItemId`, each
 * group's own order preserved exactly as given.** This is the one place the
 * canonical form is deliberately *not* fully sorted, and the asymmetry is
 * load-bearing in both directions. Within a group the order IS the step
 * precedence the engine runs — `slicesOf` chains them — so sorting it would
 * make two different schedules hash the same. Across groups it is whatever SQL
 * returned, because `WorkItemRepo.listByProject` selects with no `ORDER BY`, so
 * hashing the global order made one unchanged project hash two ways between
 * reads and between blue and green.
 *
 * `poolIds` is a **set**, sorted: a slice labelled `['a','b']` and one labelled
 * `['b','a']` wait for the same two pools, and `jointWindowFor` reads them as a
 * set. Duplicates are dropped for the same reason.
 *
 * **(d) `notBefore` and (g) `deadlines`, both `[workItemId, offset]` sorted by
 * id.** Both are already whole days from day zero, resolved against
 * `project.startDate` by the caller — a calendar date in here would make the
 * hash depend on the project's start twice. `deadlines` is keyed by
 * **as-authored** work item ids rather than by the leaf expansion, because the
 * fold down the tree is derived: a parent's deadline that binds no leaf today
 * binds one after a move, and hashing the expansion would hide the edit that
 * set it.
 *
 * **(e) `poolSizes`, sorted, and (f) `reach` verbatim.** Both are plain
 * scheduling inputs — a pool that grew and a reach that flipped each move
 * placements.
 *
 * Refusals are the engine's own and are not re-implemented: {@link indexTree}
 * and {@link groupSlicesByLeaf} throw on a slice for something that is not a
 * leaf, and on a width below 1. A canonicalizer that accepted input
 * `schedule()` refuses would hand out a cache key for a call that cannot run.
 *
 * **Proof (task 1.4), both watched reds measured on h2puni at `b5e64717`
 * against a green 393 pass / 0 fail:**
 *
 * `reach: input.reach` REMOVED from the returned object → **391 pass / 2
 * fail**: `depReach flipped to anchor-slice` (the two arms of the reach now
 * hash the same while placing `b` differently — a stale schedule served as
 * current) and `puts every one of the seven arguments in the string, maps
 * included`, which is the structural guard catching the same hole a second
 * way.
 *
 * The slices entry REPLACED by a flat list of every slice sorted byte-wise —
 * that is, the grouping and the preserved intra-item order both dropped for a
 * global sorted set → **392 pass / 1 fail**, and it is exactly `two slices of
 * one work item swapped`. Nothing else in the suite notices, which is the
 * measurement worth keeping: the intra-item order is a scheduling fact that no
 * other test in `libs/domain` connects to the cache key.
 */
export function canonicalScheduleInput(input: ScheduleInput): string {
  const { leafIds } = indexTree(input.rows);
  const grouped = groupSlicesByLeaf(leafIds, input.slices);

  const rows = [...input.rows]
    .sort((left, right) => byBytes(left.id, right.id))
    .map((row) => ({
      id: row.id,
      parentId: row.parentId,
      position: row.position,
      frozenNumber: row.frozenNumber,
      priority: row.priority,
    }));

  const edges = [...input.edges]
    .sort(
      (left, right) =>
        byBytes(left.predecessorId, right.predecessorId) ||
        byBytes(left.successorId, right.successorId),
    )
    .map((edge) => ({ predecessorId: edge.predecessorId, successorId: edge.successorId }));

  const slices = [...grouped.keys()].sort(byBytes).map((workItemId) => ({
    workItemId,
    steps: (grouped.get(workItemId) ?? []).map((slice) => ({
      stepId: slice.stepId,
      days: slice.days,
      personId: slice.personId,
      width: slice.width,
      poolIds: [...new Set(slice.poolIds)].sort(byBytes),
    })),
  }));

  return JSON.stringify({
    rows,
    edges,
    slices,
    notBefore: sortedPairs(input.notBefore),
    poolSizes: sortedPairs(input.poolSizes),
    reach: input.reach,
    deadlines: sortedPairs(input.deadlines),
  });
}

/**
 * Task 1.2: the exact-input hash — SHA-256 of {@link canonicalScheduleInput},
 * hex.
 *
 * Hex rather than base64 because this becomes a SQLite primary-key column and a
 * value that is written by hand into a query during an incident should not have
 * `+` or `/` in it. 64 characters, fixed width.
 *
 * `budgetMs` and `contractVersion` are deliberately **not** hashed. They are
 * cache-key *columns* beside this hash (task 4.2): a longer budget on the same
 * plan is the same question asked with more time, and a contract bump must
 * evict every row rather than move each one to a new address.
 */
export function scheduleInputHash(input: ScheduleInput): string {
  return createHash('sha256').update(canonicalScheduleInput(input), 'utf8').digest('hex');
}
