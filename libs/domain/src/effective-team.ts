/**
 * A row of a plan, as far as the team labels are concerned: its own id, its
 * parent's, and whatever teams somebody wrote on it.
 *
 * Structural rather than be-01's `LabelledWorkItem` or fe-01's `TreeRow`,
 * because the whole point of this module is that both read the same rule. A
 * shape both already satisfy is what makes that possible without either app
 * depending on the other.
 *
 * `teamIds` is a **set**, and an empty one is _unstated_ — the state that
 * inherits. There is deliberately no second spelling meaning "deliberately no
 * team", exactly as there was no second spelling of the `null` this replaced
 * (Dany, 2026-08-13, Q4).
 */
export interface TeamsLabelled {
  id: string;
  parentId: string | null;
  teamIds: readonly string[];
}

/** Which teams a row's work belongs to, and which row said so. */
export interface EffectiveTeams {
  /**
   * The teams in force for this row, **whole**: the set the nearest stating row
   * carries, never a member of it.
   *
   * In the order the stating row carried them, which is the store's order —
   * `work_item_team` is read by team id, so two reads of an unchanged plan
   * answer the same array. Ordering for display is a different question and
   * belongs to whoever displays it.
   *
   * Never empty. A row with no non-empty set anywhere above it is absent from
   * the map instead, so "unstated" has one spelling here too.
   */
  teamIds: readonly string[];
  /**
   * The row that carries the set — this row itself, or the nearest ancestor
   * above it that states one.
   *
   * Carried rather than reduced to a boolean because every consumer that shows
   * an inherited label has to name where it came from: "Platform — inherited
   * from 010 Backend" is the sentence, and a `true` cannot say it.
   */
  fromId: string;
}

/** A `parentId` chain that runs in a circle, which is not a tree and has no ancestors. */
export class TeamAncestryCycleError extends Error {
  override name = 'TeamAncestryCycleError' as const;
  constructor(startedAt: string) {
    super(`the parent chain above ${startedAt} runs in a circle, so it has no nearest label`);
  }
}

/**
 * Every row's effective team set: its own, or the nearest ancestor's.
 *
 * **Most-specific wins**, in both directions — a leaf's own set beats every
 * ancestor's, and a nearer ancestor beats a further one. That is deliberately
 * not the rule a `startNoEarlierThan` floor takes, and for the same reason
 * `priorityByLeaf` is not: a floor takes `Math.max` because it is a hard
 * constraint and the strictest of them must hold, while a label is a statement
 * about **whose work this is**, and the one written closest to the work meant
 * that work.
 *
 * **Override, not union** (Dany, 2026-08-13): an ancestor stating `{A}` and a row
 * stating `{B}` leaves the row on `{B}` alone. The row's own set replaces the
 * inherited one whole; it does not accumulate. And what is inherited is the
 * ancestor's **whole** set — a reader handed one member of two would report a
 * pool the plan never narrowed to.
 *
 * Rows with no non-empty set anywhere above them are simply absent from the map.
 * That is the state most rows are in, and it is what a consumer reads as "no
 * team, no pool, nothing to inherit".
 *
 * **No write ever copies a set down.** Inheritance is a reading, computed here
 * and nowhere else: a stored second copy would go out of date the moment
 * anybody moved a row, and the six consumers would then disagree about the same
 * row while each held a defensible answer.
 *
 * Returns a `Map` rather than answering about one row, because every consumer of
 * it draws a whole plan: a per-row call would re-walk the ancestry for each of
 * them, which is quadratic in the depth, and the renderers would each hold their
 * own walk. One walk, memoised, six readers.
 *
 * @throws {TeamAncestryCycleError} when the parent chain loops. Unknown is not
 * OK: a cycle has no nearest ancestor, so there is no set to fall back to and a
 * default would put a row on a pool nobody assigned it to.
 */
export function effectiveTeamsOf(rows: readonly TeamsLabelled[]): Map<string, EffectiveTeams> {
  const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));
  const ownTeams = new Map(rows.map((row) => [row.id, row.teamIds]));
  const found = new Map<string, EffectiveTeams>();

  for (const row of rows) {
    // The rows this walk passed through on the way up, in order, so every one
    // of them is memoised with the answer the walk found — a chain of ten
    // unlabelled rows under one labelled root is walked once, not ten times.
    const walked: string[] = [];
    const seen = new Set<string>();
    let resolved: EffectiveTeams | undefined;
    for (
      let cursor: string | null | undefined = row.id;
      cursor !== null && cursor !== undefined;
    ) {
      const already = found.get(cursor);
      if (already !== undefined) {
        resolved = already;
        break;
      }
      // Proof: TO OBSERVE cycle guard
      if (seen.has(cursor)) throw new TeamAncestryCycleError(row.id);
      seen.add(cursor);
      const own = ownTeams.get(cursor);
      // The whole set, not `own[0]`: narrowing here is the one fault in this
      // function that changes dates rather than failing, since the adapter
      // spends slots in whatever it is handed.
      //
      // Proof: TO OBSERVE whole set
      if (own !== undefined && own.length > 0) {
        resolved = { teamIds: own, fromId: cursor };
        break;
      }
      walked.push(cursor);
      cursor = parentOf.get(cursor);
    }
    if (resolved === undefined) continue;
    found.set(row.id, resolved);
    // Proof: TO OBSERVE memoisation
    for (const each of walked) found.set(each, resolved);
  }

  return found;
}
