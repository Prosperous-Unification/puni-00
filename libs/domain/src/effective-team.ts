/**
 * A row of a plan, as far as the team label is concerned: its own id, its
 * parent's, and whatever team somebody wrote on it.
 *
 * Structural rather than be-01's `WorkItem` or fe-01's `NumberedWorkItem`,
 * because the whole point of this module is that both read the same rule. A
 * shape both already satisfy is what makes that possible without either app
 * depending on the other.
 */
export interface TeamLabelled {
  id: string;
  parentId: string | null;
  serviceTeamId: string | null;
}

/** Which team a row's work belongs to, and which row said so. */
export interface EffectiveTeam {
  /** The team id in force for this row. */
  teamId: string;
  /**
   * The row that carries the label — this row itself, or the nearest ancestor
   * above it that has one.
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
 * Every row's effective team: its own label, or the nearest ancestor's.
 *
 * **Most-specific wins**, in both directions — a leaf's own label beats every
 * ancestor's, and a nearer ancestor beats a further one. That is deliberately
 * not the rule a `startNoEarlierThan` floor takes, and for the same reason
 * `priorityByLeaf` is not: a floor takes `Math.max` because it is a hard
 * constraint and the strictest of them must hold, while a label is a statement
 * about **whose work this is**, and the one written closest to the work meant
 * that work.
 *
 * Rows with no label anywhere above them are simply absent from the map. That
 * is the state every plan is in today, and it is what a consumer reads as "no
 * team, no pool, nothing to inherit".
 *
 * **No write ever copies a label down.** Inheritance is a reading, computed
 * here and nowhere else: a stored second copy would go out of date the moment
 * anybody moved a row, and the five consumers would then disagree about the
 * same row while each held a defensible number.
 *
 * Returns a `Map` rather than answering about one row, because every consumer
 * of it draws a whole plan: a per-row call would re-walk the ancestry for each
 * of them, which is quadratic in the depth, and the four renderers would each
 * hold their own walk. One walk, memoised, five readers.
 *
 * @throws {TeamAncestryCycleError} when the parent chain loops. Unknown is not
 * OK: a cycle has no nearest ancestor, so there is no label to fall back to and
 * a default would put a row on a pool nobody assigned it to.
 */
export function effectiveTeamOf(rows: readonly TeamLabelled[]): Map<string, EffectiveTeam> {
  const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));
  const ownTeam = new Map(rows.map((row) => [row.id, row.serviceTeamId]));
  const found = new Map<string, EffectiveTeam>();

  for (const row of rows) {
    // The rows this walk passed through on the way up, in order, so every one
    // of them is memoised with the answer the walk found — a chain of ten
    // unlabelled rows under one labelled root is walked once, not ten times.
    const walked: string[] = [];
    const seen = new Set<string>();
    let resolved: EffectiveTeam | undefined;
    for (
      let cursor: string | null | undefined = row.id;
      cursor !== null && cursor !== undefined;
    ) {
      const already = found.get(cursor);
      if (already !== undefined) {
        resolved = already;
        break;
      }
      // Proof: this guard removed and `refuses a parent chain that runs in a
      // circle` hangs rather than failing — which is why the assertion is on
      // the throw and the fault was watched under a test timeout; watched
      // 2026-08-12.
      if (seen.has(cursor)) throw new TeamAncestryCycleError(row.id);
      seen.add(cursor);
      const own = ownTeam.get(cursor);
      if (own !== undefined && own !== null) {
        resolved = { teamId: own, fromId: cursor };
        break;
      }
      walked.push(cursor);
      cursor = parentOf.get(cursor);
    }
    if (resolved === undefined) continue;
    found.set(row.id, resolved);
    for (const each of walked) found.set(each, resolved);
  }

  return found;
}
