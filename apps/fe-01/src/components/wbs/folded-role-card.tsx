import type { Point } from './estimate-draft';
import { HoverCard } from './hover-card';
import type { CardAssignee } from './plan-cards';

/** One of the three points, as the row holds it: `''` where nobody typed one. */
export interface FoldedRolePoint {
  point: Point;
  days: string;
}

export interface FoldedRoleCardProps {
  roleName: string;
  /** The work item's number, so a card over a busy table says whose it is. */
  number: string;
  points: readonly FoldedRolePoint[];
  /** The figure the folded cell shows — `''` where there is nothing to show. */
  final: string;
  doing: CardAssignee | null;
}

/**
 * What one folded role column cell folds away, in full.
 *
 * The cell at rest is `4.8 · Ka…` in 96px: one computed figure, and a person's
 * name cut to about four characters. The trio behind the figure is only on
 * screen while the role is unfolded — and unfolding one folds another, so a
 * plan cannot be read with every trio open. This is where the folded ones are
 * read.
 *
 * Everything here is already on the row the client holds, which is the whole
 * of "hover asks the server for nothing": the three points, the final figure,
 * who is doing it and whether anybody said so.
 */
export function FoldedRoleCard({ roleName, number, points, final, doing }: FoldedRoleCardProps) {
  const estimated = points.some((each) => each.days.trim() !== '');
  return (
    <HoverCard label={`${roleName} for ${number}`}>
      <div style={{ fontWeight: 600 }}>{roleName}</div>
      {/*
        Said in words, not as `2/3/8`: the shorthand is what an estimator types
        into the cell, and a card is read by whoever is looking at the plan.
      */}
      <div>
        {estimated
          ? points.map((each) => `${each.point} ${each.days === '' ? '—' : each.days}`).join(' · ')
          : 'No estimate yet'}
      </div>
      {final !== '' && <div>Final {final} days</div>}
      {doing !== null && (
        <div>
          {doing.name}
          {doing.assumed &&
            ' — assumed: they are the only person assigned, so they are taken to be doing this phase too'}
        </div>
      )}
    </HoverCard>
  );
}
