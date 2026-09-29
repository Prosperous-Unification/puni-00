/** Why a lane draws no bar; each reads differently to a screen reader. */
export type SpaceGanttGap = 'undated' | 'loading' | 'unavailable' | 'failed';

/** One project's place on the space's read-only Gantt. */
export type SpaceGanttLane =
  | { kind: 'bar'; projectId: string; name: string; left: number; width: number; label: string }
  | { kind: 'blank'; projectId: string; name: string; gap: SpaceGanttGap; label: string };

/** What a lane is drawn from: a project and what its roll-up says of its dates. */
export interface SpaceGanttInput {
  projectId: string;
  name: string;
  /** The dates of a rolled-up project with a dated root, or why there are none to draw. */
  schedule: { startsOn: string; endsOn: string } | SpaceGanttGap;
}

const DAY_MS = 86_400_000;

const GAP_TEXT: Readonly<Record<SpaceGanttGap, string>> = {
  undated: 'no dates',
  loading: 'loading',
  unavailable: 'schedule unavailable',
  failed: 'figures could not be loaded',
};

function dayOf(date: string): number {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed)) throw new Error(`not an ISO date: ${date}`);
  return Math.round(parsed / DAY_MS);
}

/**
 * The lanes of a space's Gantt, in row order: one bar per dated project, as
 * percentages of the span from the earliest start to the latest end
 * (inclusive days), and a blank labelled with its {@link SpaceGanttGap} for
 * every other project, which is never drawn as a bar.
 */
export function spaceGanttLanesOf(inputs: readonly SpaceGanttInput[]): SpaceGanttLane[] {
  // Proof, observed 2026-09-29: with this filter removed (every schedule read
  // as dates), `labels each undated, loading, unavailable and failed project,
  // and draws it no bar` and `draws only blanks when no project is dated` in
  // `space-gantt.test.ts` crashed with `not an ISO date: undefined` before
  // any lane was drawn; the observed fault is that crash, not a drawn bar.
  const dated = inputs.flatMap(({ schedule }) => (typeof schedule === 'string' ? [] : [schedule]));
  const first = dated.length === 0 ? 0 : Math.min(...dated.map(({ startsOn }) => dayOf(startsOn)));
  const last = dated.length === 0 ? 0 : Math.max(...dated.map(({ endsOn }) => dayOf(endsOn)));
  const span = last - first + 1;
  return inputs.map(({ projectId, name, schedule }) => {
    if (typeof schedule === 'string') {
      return {
        kind: 'blank',
        projectId,
        name,
        gap: schedule,
        label: `${name}: ${GAP_TEXT[schedule]}`,
      };
    }
    const start = dayOf(schedule.startsOn);
    const end = dayOf(schedule.endsOn);
    return {
      kind: 'bar',
      projectId,
      name,
      left: ((start - first) / span) * 100,
      width: ((end - start + 1) / span) * 100,
      label: `${name}: ${schedule.startsOn} to ${schedule.endsOn}`,
    };
  });
}
