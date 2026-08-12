import { describe, expect, it } from 'bun:test';

import { effectiveTeamOf, TeamAncestryCycleError, type TeamLabelled } from './effective-team';

const row = (id: string, parentId: string | null, serviceTeamId: string | null): TeamLabelled => ({
  id,
  parentId,
  serviceTeamId,
});

describe('effectiveTeamOf', () => {
  it('reaches an unlabelled leaf from the parent above it', () => {
    const rows = [row('parent', null, 'platform'), row('leaf', 'parent', null)];

    const found = effectiveTeamOf(rows);

    expect(found.get('leaf')).toEqual({ teamId: 'platform', fromId: 'parent' });
    expect(found.get('parent')).toEqual({ teamId: 'platform', fromId: 'parent' });
  });

  it('lets a leaf’s own label beat its parent’s, in both directions', () => {
    // Most-specific wins, and deliberately not the floor rule: a floor takes
    // `Math.max` because it is a hard constraint, and a label is a statement
    // about whose work this is.
    const rows = [
      row('parent', null, 'platform'),
      row('leaf', 'parent', 'payments'),
      row('other-parent', null, 'payments'),
      row('other-leaf', 'other-parent', 'platform'),
    ];

    const found = effectiveTeamOf(rows);

    expect(found.get('leaf')?.teamId).toBe('payments');
    expect(found.get('leaf')?.fromId).toBe('leaf');
    expect(found.get('other-leaf')?.teamId).toBe('platform');
  });

  it('gives the nearer ancestor’s label to a leaf between two', () => {
    const rows = [
      row('grandparent', null, 'platform'),
      row('parent', 'grandparent', 'payments'),
      row('leaf', 'parent', null),
    ];

    const found = effectiveTeamOf(rows);

    expect(found.get('leaf')).toEqual({ teamId: 'payments', fromId: 'parent' });
  });

  it('leaves a row with no label above it absent, rather than guessing one', () => {
    const rows = [row('parent', null, null), row('leaf', 'parent', null)];

    const found = effectiveTeamOf(rows);

    expect(found.size).toBe(0);
  });

  it('names the ancestor the label came from, so a reader can be told', () => {
    // The `fromId` half of the reading. Without it, "Platform — inherited from
    // 010 Backend" cannot be said and every consumer showing an inherited
    // label would be showing an unexplained one.
    const rows = [
      row('a', null, 'platform'),
      row('b', 'a', null),
      row('c', 'b', null),
      row('d', 'c', null),
    ];

    const found = effectiveTeamOf(rows);

    for (const id of ['b', 'c', 'd']) expect(found.get(id)?.fromId).toBe('a');
  });

  it('refuses a parent chain that runs in a circle', () => {
    // R5. A cycle has no nearest ancestor, so there is no label to fall back
    // to — and without the guard the walk does not come back at all, which is
    // why the assertion is on the throw and the injected fault was watched
    // under a test timeout rather than as a wrong answer.
    const rows = [row('a', 'b', null), row('b', 'a', null)];

    expect(() => effectiveTeamOf(rows)).toThrow(TeamAncestryCycleError);
  });

  it('answers for a row whose parent is not in the list', () => {
    // A parent from another project, or one that has been removed: the walk
    // runs out of rows rather than throwing, and the row is simply unlabelled.
    const rows = [row('orphan', 'elsewhere', null)];

    expect(effectiveTeamOf(rows).size).toBe(0);
  });
});
