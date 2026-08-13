import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TeamCapacityView, TeamView } from '@/lib/wbs-api';

import { TeamsDialog, teamsOnThePlan } from './teams-dialog';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

afterEach(cleanup);

/**
 * Both teams **unsized** globally, deliberately.
 *
 * `TeamView.size` is the retired column, read by nothing since
 * `capacity-per-project`. A fixture that carried numbers there would let every
 * assertion below pass against a build that still fell back to it — which is the
 * one wrong answer this change is most likely to be written with.
 */
const BACKEND: TeamView = { id: 't-backend', name: 'Backend', size: null };
const PLATFORM: TeamView = { id: 't-platform', name: 'Platform', size: null };
const DESIGN: TeamView = { id: 't-design', name: 'Design', size: null };

/** Everything the dialog is given, with each call recorded. */
function stubbed(overrides: Partial<Parameters<typeof TeamsDialog>[0]> = {}) {
  const setCapacity = vi.fn(() => Promise.resolve());
  const onChanged = vi.fn(() => Promise.resolve());
  const props = {
    teams: [
      { id: 't-backend', name: 'Backend', stated: 2, rows: 4 },
      { id: 't-platform', name: 'Platform', stated: null, rows: 1 },
    ],
    setCapacity,
    onChanged,
    ...overrides,
  };
  render(<TeamsDialog {...props} />);
  // Opened through its own trigger, because the trigger is the component's:
  // Radix restores the focus to it on close and to nothing without one.
  fireEvent.click(screen.getByRole('button', { name: 'Teams' }));
  return { setCapacity, onChanged, props };
}

/** Lets the two awaits every change makes — the call, then the reread — settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resume) => setTimeout(resume, 0));
  });
}

const boxFor = (name: string): HTMLInputElement =>
  screen.getByLabelText(`How many of ${name} at once`) as HTMLInputElement;

describe('which teams the plan offers a capacity for', () => {
  const capacities: TeamCapacityView[] = [{ serviceTeamId: 't-backend', size: 2 }];

  it('lists a team only an ancestor carries, because its pool is what the leaves spend', () => {
    // The effective reading, which is the whole reason this takes a list of
    // resolved team ids rather than the rows' own labels. A leaf under a labelled
    // parent carries no label of its own and its dates come out of that parent's
    // pool, so a plan bounded by `Backend` must offer somewhere to state it.
    //
    // Proof: the caller's `effectiveTeams.get(row.id)` replaced by
    // `row.serviceTeamId`, so only rows carrying a label themselves count, and
    // this failed on `expected [] to have length 1` — a plan whose pool bounds
    // four rows offering nowhere at all to state the number. Watched 2026-08-13.
    // The same fault at the dialog's own boundary is the `effective` argument
    // being all-null, below.
    const listed = teamsOnThePlan([BACKEND, PLATFORM], capacities, [
      // The labelled ancestor, then three leaves that inherit it.
      't-backend',
      't-backend',
      't-backend',
      't-backend',
    ]);

    expect(listed).toEqual([{ id: 't-backend', name: 'Backend', stated: 2, rows: 4 }]);
  });

  it('offers nothing for a team no work on this plan is labelled with', () => {
    // Not every team in the directory: a plan that does no `Design` work has no
    // `Design` capacity to state, and a list of every team on the deployment is a
    // list nobody reads. `Design` here is in the directory and on no row.
    const listed = teamsOnThePlan([BACKEND, PLATFORM, DESIGN], capacities, ['t-backend', null]);

    expect(listed.map((each) => each.name)).toEqual(['Backend']);
  });

  it('reads a team the plan has stated nothing about as unstated, not as one', () => {
    // Absent from `capacities` is _unstated_, which limits that team's work not at
    // all — and is emphatically not a pool of one, which would serialise every row
    // it labels.
    const listed = teamsOnThePlan([BACKEND, PLATFORM], capacities, ['t-backend', 't-platform']);

    expect(listed.find((each) => each.name === 'Platform')?.stated).toBeNull();
    expect(listed.find((each) => each.name === 'Backend')?.stated).toBe(2);
  });

  it('never reads the team’s retired global size', () => {
    // D1, at this boundary: `TeamView.size` is still on the wire because be-01
    // still sends the column, and a client falling back to it would give a plan
    // that has stated nothing a bound nobody typed for it.
    const globallySized: TeamView = { ...PLATFORM, size: 7 };

    const listed = teamsOnThePlan([globallySized], [], ['t-platform']);

    expect(listed[0]?.stated).toBeNull();
  });

  it('lists by name, so the panel does not reshuffle between two reads', () => {
    const listed = teamsOnThePlan(
      [PLATFORM, BACKEND],
      [],
      ['t-platform', 't-backend', 't-backend'],
    );

    expect(listed.map((each) => each.name)).toEqual(['Backend', 'Platform']);
    // And the row counts are each team's own, inherited rows included.
    expect(listed.map((each) => each.rows)).toEqual([2, 1]);
  });
});

describe('stating how many of a team are at work at once on this plan', () => {
  itDom('sends the number typed, and re-reads the plan the dates come from', async () => {
    const { setCapacity, onChanged } = stubbed();

    fireEvent.change(boxFor('Platform'), { target: { value: '3' } });
    fireEvent.blur(boxFor('Platform'));
    await settle();

    expect(setCapacity).toHaveBeenCalledWith('t-platform', 3);
    expect(onChanged).toHaveBeenCalled();
  });

  itDom('an emptied box unlimits the team rather than asking for nobody', async () => {
    // The first of the box's two local decisions. `Number('')` is `0`, and a pool
    // of 0 slots clamps every width to 0 — the engine divides effort by width, so
    // that is a plan of `Infinity` dates. An emptied box plainly means "this plan
    // does not limit them", which is `null`.
    //
    // Proof: the empty-box arm replaced by `Number(draft)`, and this failed on
    // `setCapacity` called with `('t-backend', 0)` where `('t-backend', null)` was
    // owed. Watched 2026-08-13.
    const { setCapacity } = stubbed();

    fireEvent.change(boxFor('Backend'), { target: { value: '' } });
    fireEvent.blur(boxFor('Backend'));
    await settle();

    expect(setCapacity).toHaveBeenCalledWith('t-backend', null);
  });

  itDom('refuses a number too big to send rather than unlimiting the team', async () => {
    // The second. JSON has no literal for `Infinity`, so `JSON.stringify` writes a
    // typed `1e999` as `null` — which on this route is the clear. Sending it would
    // silently unlimit a team that was limited while looking to the reader like a
    // refusal, so it is refused here.
    //
    // Proof: the `Number.isFinite` arm deleted, and this failed on `setCapacity`
    // called with `('t-backend', null)` — the team unlimited, with nothing on
    // screen said about it. Watched 2026-08-13.
    const { setCapacity } = stubbed();

    fireEvent.change(boxFor('Backend'), { target: { value: '1e999' } });
    fireEvent.blur(boxFor('Backend'));
    await settle();

    expect(setCapacity).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('a whole number of 1 or more');
  });

  itDom('sends what be-01 refuses, and says what be-01 answered', async () => {
    // Validation stays at be-01's boundary — C3's D6, one tier along. A second
    // copy of the rule here is a rule free to disagree with it, so `0` goes and is
    // answered on, and the answer is a sentence rather than the wire code.
    const setCapacity = vi.fn(() => Promise.reject(new Error('size_must_be_at_most_1000')));
    stubbed({ setCapacity });

    fireEvent.change(boxFor('Platform'), { target: { value: '1001' } });
    fireEvent.blur(boxFor('Platform'));
    await settle();

    expect(setCapacity).toHaveBeenCalledWith('t-platform', 1001);
    // The ceiling read out of be-01's own code, never a literal here: a `1000`
    // written in this component is a second copy of `MOST_PEOPLE_AT_ONCE`.
    expect(screen.getByRole('alert').textContent).toContain('at most 1000');
    // And the draft stays, because the sentence is about the number on screen.
    expect(boxFor('Platform').value).toBe('1001');
  });

  itDom('sends nothing when the box says what the plan already says', async () => {
    const { setCapacity } = stubbed();

    fireEvent.change(boxFor('Backend'), { target: { value: '2' } });
    fireEvent.blur(boxFor('Backend'));
    await settle();

    expect(setCapacity).not.toHaveBeenCalled();
  });

  itDom('sends nothing when an already-empty box is left empty', async () => {
    const { setCapacity } = stubbed();

    fireEvent.blur(boxFor('Platform'));
    await settle();

    expect(setCapacity).not.toHaveBeenCalled();
  });

  itDom('Escape puts the box back to what the plan says', async () => {
    const { setCapacity } = stubbed();

    fireEvent.change(boxFor('Backend'), { target: { value: '9' } });
    fireEvent.keyDown(boxFor('Backend'), { key: 'Escape' });
    await settle();

    expect(boxFor('Backend').value).toBe('2');
    expect(setCapacity).not.toHaveBeenCalled();
  });

  itDom('Enter commits without waiting for the box to lose the focus', async () => {
    const { setCapacity } = stubbed();

    fireEvent.change(boxFor('Platform'), { target: { value: '5' } });
    fireEvent.keyDown(boxFor('Platform'), { key: 'Enter' });
    await settle();

    expect(setCapacity).toHaveBeenCalledWith('t-platform', 5);
  });

  itDom('says so when no work on the plan is labelled with a team', () => {
    // Said out loud rather than left as an empty panel, which reads as a list that
    // failed to load — and it names the thing to do about it.
    stubbed({ teams: [] });

    expect(screen.getByText(/No work on this plan is labelled with a team yet/)).toBeTruthy();
  });

  itDom('says the number is this plan’s own, where somebody would assume otherwise', () => {
    // The one sentence that has to be on this surface: the box looks exactly like
    // the directory box it replaced, and a reader who remembers that one would
    // assume this number is the team's everywhere.
    stubbed();

    expect(
      screen.getByText(/another plan sharing a team is not affected/i),
    ).toBeTruthy();
    expect(boxFor('Platform').title).toContain('This plan does not limit');
    expect(boxFor('Backend').title).toContain('on this plan');
  });
});
