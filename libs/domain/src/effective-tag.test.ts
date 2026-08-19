import { describe, expect, it } from 'bun:test';

import { effectiveTagsOf, TagAncestryCycleError, type TagsLabelled } from './effective-tag';
import { effectiveTeamsOf } from './effective-team';

const row = (id: string, parentId: string | null, ...tagIds: string[]): TagsLabelled => ({
  id,
  parentId,
  tagIds,
});

describe('effectiveTagsOf', () => {
  it('reaches an untagged leaf from the parent above it', () => {
    const rows = [row('parent', null, 'regulatory'), row('leaf', 'parent')];

    const found = effectiveTagsOf(rows);

    expect(found.get('leaf')).toEqual({ tagIds: ['regulatory'], fromId: 'parent' });
    expect(found.get('parent')).toEqual({ tagIds: ['regulatory'], fromId: 'parent' });
  });

  it('inherits an ancestor’s whole set, not its first member', () => {
    // The team half of this fault moves dates, because the capacity adapter
    // spends slots in whatever set it is handed. The tag half cannot move a
    // date — nothing below `slicesOf` reads a tag — and it is still wrong in the
    // way that matters for a label: a filter on `tech-debt` would not find a row
    // the plan says is `tech-debt`, and the row would be reported as one kind of
    // thing when the plan said two.
    const rows = [row('parent', null, 'regulatory', 'tech-debt'), row('leaf', 'parent')];

    const found = effectiveTagsOf(rows);

    expect(found.get('leaf')?.tagIds).toEqual(['regulatory', 'tech-debt']);
  });

  it('lets a leaf’s own set beat its parent’s, whole and in both directions', () => {
    // Override, not union — R2's Q4, confirmed for teams on 2026-08-13 and taken
    // unchanged for tags. The leaf states `q3-must-have` and is on it **alone**,
    // with no trace of the two above it.
    const rows = [
      row('parent', null, 'regulatory', 'tech-debt'),
      row('leaf', 'parent', 'q3-must-have'),
      row('other-parent', null, 'q3-must-have'),
      row('other-leaf', 'other-parent', 'tech-debt'),
    ];

    const found = effectiveTagsOf(rows);

    expect(found.get('leaf')).toEqual({ tagIds: ['q3-must-have'], fromId: 'leaf' });
    expect(found.get('other-leaf')?.tagIds).toEqual(['tech-debt']);
  });

  it('gives the nearer ancestor’s set to a leaf between two', () => {
    const rows = [
      row('grandparent', null, 'tech-debt', 'regulatory'),
      row('parent', 'grandparent', 'q3-must-have'),
      row('leaf', 'parent'),
    ];

    const found = effectiveTagsOf(rows);

    expect(found.get('leaf')).toEqual({ tagIds: ['q3-must-have'], fromId: 'parent' });
  });

  it('reads an empty set as unstated, so it inherits rather than meaning untagged', () => {
    // `[]` is _unstated_ and there is no second state meaning "deliberately no
    // tag". A row whose set is empty is on its ancestor's, and a plan with
    // nothing above it is absent from the map — one spelling of unstated, which
    // is the same call the team dimension made and the same one the export has
    // carried since it was written: an empty cell means nobody typed it.
    const inherits = effectiveTagsOf([row('parent', null, 'regulatory'), row('leaf', 'parent')]);
    expect(inherits.get('leaf')?.tagIds).toEqual(['regulatory']);

    const nothing = effectiveTagsOf([row('parent', null), row('leaf', 'parent')]);
    expect(nothing.size).toBe(0);
  });

  it('names the ancestor the set came from, so a reader can be told', () => {
    // The `fromId` half of the reading, and what `plan-cards.tsx`'s `↳` chip
    // renders: "regulatory — inherited from 010 Compliance" cannot be said
    // without it, and a consumer showing an inherited tag would be showing an
    // unexplained one.
    const rows = [row('a', null, 'regulatory'), row('b', 'a'), row('c', 'b'), row('d', 'c')];

    const found = effectiveTagsOf(rows);

    for (const id of ['b', 'c', 'd']) expect(found.get(id)?.fromId).toBe('a');
  });

  it('resolves a chain of untagged rows once, and hands each of them the same answer', () => {
    // The memoisation, asserted the only way it is observable from outside:
    // every row the deepest walk passed through holds **the same object**, which
    // a per-row re-walk cannot produce.
    //
    // This case is why `effectiveLabelsOf` takes a `wrap` rather than returning
    // its own shape for each dimension to convert afterwards: a conversion over
    // the finished map builds a fresh object per entry, every one of them equal
    // and none of them identical, and this assertion is what caught that while
    // the shared walk was being written. The order of `rows` is load-bearing —
    // deepest first, so `d`'s walk is the one that reaches the tag.
    const rows = [row('d', 'c'), row('c', 'b'), row('b', 'a'), row('a', null, 'regulatory')];

    const found = effectiveTagsOf(rows);

    const answer = found.get('d');
    expect(answer).toBeDefined();
    for (const id of ['b', 'c']) expect(found.get(id)).toBe(answer);
  });

  it('refuses a parent chain that runs in a circle', () => {
    // R5. A cycle has no nearest ancestor, so there is no set to fall back to,
    // and without the guard the walk does not come back at all — which is why
    // the assertion is on the throw and the injected fault is watched as a hang.
    // The error is the tag dimension's own, not the team one's: a reader handed
    // a `TeamAncestryCycleError` while filtering by tag would go looking in the
    // wrong half of the model.
    const rows = [row('a', 'b'), row('b', 'a')];

    expect(() => effectiveTagsOf(rows)).toThrow(TagAncestryCycleError);
  });

  it('answers for a row whose parent is not in the list', () => {
    // A parent from another project, or one that has been removed: the walk runs
    // out of rows rather than throwing, and the row is simply untagged.
    const rows = [row('orphan', 'elsewhere')];

    expect(effectiveTagsOf(rows).size).toBe(0);
  });
});

describe('the two dimensions, read together', () => {
  /** A row that answers both questions at once, which every real row does. */
  const both = (
    id: string,
    parentId: string | null,
    teamIds: readonly string[],
    tagIds: readonly string[],
  ) => ({ id, parentId, teamIds, tagIds });

  it('overrides one dimension while inheriting the other, and the mirror case', () => {
    // The property the whole design rests on, and the one a reader is most
    // likely to doubt: inheritance is **per dimension, independently**. A row
    // that states tags and no teams keeps its ancestor's teams; a row that
    // states teams and no tags keeps its ancestor's tags. Neither statement
    // touches the other dimension, because they are two walks over two fields.
    //
    // Proof: `effectiveTagsOf` pointed at `row.teamIds` and this fails with the
    // tag half reading `['platform']` — a plan whose filter facet lists teams
    // under the tag heading. Watched 2026-08-19, see verify.md.
    const rows = [
      both('parent', null, ['platform'], ['regulatory']),
      both('tags-only', 'parent', [], ['tech-debt']),
      both('teams-only', 'parent', ['design'], []),
    ];

    const teams = effectiveTeamsOf(rows);
    const tags = effectiveTagsOf(rows);

    // States tags, inherits teams.
    expect(tags.get('tags-only')).toEqual({ tagIds: ['tech-debt'], fromId: 'tags-only' });
    expect(teams.get('tags-only')).toEqual({ teamIds: ['platform'], fromId: 'parent' });

    // The mirror: states teams, inherits tags.
    expect(teams.get('teams-only')).toEqual({ teamIds: ['design'], fromId: 'teams-only' });
    expect(tags.get('teams-only')).toEqual({ tagIds: ['regulatory'], fromId: 'parent' });
  });

  it('keeps a row out of one map while it is in the other', () => {
    // Absence is per dimension too. A plan that labels teams and nothing else
    // has an empty tag map, and every consumer reads that as "nobody has
    // labelled anything" rather than as a row missing from the plan.
    const rows = [both('parent', null, ['platform'], []), both('leaf', 'parent', [], [])];

    expect(effectiveTeamsOf(rows).size).toBe(2);
    expect(effectiveTagsOf(rows).size).toBe(0);
  });
});
