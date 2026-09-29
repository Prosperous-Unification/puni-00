/** One project's place on the space's read-only Gantt. */
export type SpaceGanttLane =
  | { kind: 'bar'; projectId: string; name: string; left: number; width: number; label: string }
  | { kind: 'blank'; projectId: string; name: string; label: string };

/** What a lane is drawn from: a project and, once its roll-up arrived, its dates. */
export interface SpaceGanttInput {
  projectId: string;
  name: string;
  /** Null for a project with no dated root, whose schedule failed, or still loading. */
  dates: { startsOn: string; endsOn: string } | null;
}

const DAY_MS = 86_400_000;

function dayOf(date: string): number {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed)) throw new Error(`not an ISO date: ${date}`);
  return Math.round(parsed / DAY_MS);
}

/**
 * The lanes of a space's Gantt, in row order: one bar per dated project, as
 * percentages of the span from the earliest start to the latest end
 * (inclusive days), and a labelled blank for every undated project, which is
 * never drawn as a bar.
 */
export function spaceGanttLanesOf(inputs: readonly SpaceGanttInput[]): SpaceGanttLane[] {
  // Proof, observed 2026-09-29: with this filter removed (every project's
  // dates read as if present), `draws an undated project as a labelled blank,
  // never a bar` in `space-gantt.test.ts` threw on the null dates.
  const dated = inputs.flatMap(({ dates }) => (dates === null ? [] : [dates]));
  const first = Math.min(...dated.map(({ startsOn }) => dayOf(startsOn)));
  const last = Math.max(...dated.map(({ endsOn }) => dayOf(endsOn)));
  const span = last - first + 1;
  return inputs.map(({ projectId, name, dates }) => {
    if (dates === null) return { kind: 'blank', projectId, name, label: `${name}: no dates` };
    const start = dayOf(dates.startsOn);
    const end = dayOf(dates.endsOn);
    return {
      kind: 'bar',
      projectId,
      name,
      left: ((start - first) / span) * 100,
      width: ((end - start + 1) / span) * 100,
      label: `${name}: ${dates.startsOn} to ${dates.endsOn}`,
    };
  });
}
