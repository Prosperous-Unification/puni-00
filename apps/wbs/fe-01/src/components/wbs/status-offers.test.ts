import { describe, expect, it } from 'vitest';

import { statusOffersOf, type StatusRow } from './status-offers';

function leaf(overrides: Partial<StatusRow> = {}): StatusRow {
  return {
    status: 'unknown',
    readiness: null,
    hold: null,
    progress: {},
    subRows: [],
    ...overrides,
  };
}

function parent(children: StatusRow[], status: StatusRow['status']): StatusRow {
  return { status, readiness: null, hold: null, progress: {}, subRows: children };
}

describe('statusOffersOf', () => {
  it('offers every settable status but the one a silent leaf reads, in the menu order', () => {
    expect(statusOffersOf(leaf(), true)).toEqual([
      'draft',
      'ready',
      'in_progress',
      'on_hold',
      'blocked',
      'done',
    ]);
  });

  it('leaves out a held row’s own hold, and Draft and Ready once a step has spoken', () => {
    const held = leaf({ status: 'on_hold', hold: 'on_hold', progress: { dev: 'in_progress' } });
    expect(statusOffersOf(held, true)).toEqual(['in_progress', 'blocked', 'done', 'unknown']);
  });

  it('offers Draft and Ready on a held leaf nobody has started, since either clears the hold', () => {
    const held = leaf({ status: 'on_hold', readiness: 'ready', hold: 'on_hold' });
    expect(statusOffersOf(held, true)).toEqual([
      'draft',
      'ready',
      'in_progress',
      'blocked',
      'done',
      'unknown',
    ]);
  });

  it('leaves out what would change nothing: Ready on a ready leaf read as blocked by proxy', () => {
    const waiting = leaf({ status: 'blocked_by_proxy', readiness: 'ready' });
    expect(statusOffersOf(waiting, true)).toEqual([
      'draft',
      'in_progress',
      'on_hold',
      'blocked',
      'done',
      'unknown',
    ]);
  });

  it('offers no hold on done work, and In progress to reopen it', () => {
    const done = leaf({ status: 'done', progress: { dev: 'done' } });
    expect(statusOffersOf(done, true)).toEqual(['in_progress', 'unknown']);
  });

  it('offers neither In progress nor Done in a project with no steps', () => {
    expect(statusOffersOf(leaf(), false)).toEqual(['draft', 'ready', 'on_hold', 'blocked']);
  });

  it('offers In progress on a parent only while a leaf beneath it is unstarted', () => {
    const started = leaf({ status: 'on_hold', hold: 'on_hold', progress: { dev: 'in_progress' } });
    expect(statusOffersOf(parent([started], 'on_hold'), true)).not.toContain('in_progress');
    expect(statusOffersOf(parent([started, leaf()], 'on_hold'), true)).toContain('in_progress');
  });

  it('offers a parent Draft only when no leaf beneath has spoken', () => {
    const spoken = leaf({ status: 'in_progress', progress: { dev: 'in_progress' } });
    expect(statusOffersOf(parent([spoken, leaf()], 'in_progress'), true)).not.toContain('draft');
    expect(statusOffersOf(parent([leaf(), leaf()], 'unknown'), true)).toContain('draft');
  });

  it('offers a parent a hold while any unfinished leaf beneath does not already hold it', () => {
    const held = leaf({ status: 'on_hold', hold: 'on_hold' });
    const done = leaf({ status: 'done', progress: { dev: 'done' } });
    // One leaf held and one done folds to in progress, and holding it again changes nothing.
    const offers = statusOffersOf(parent([held, done], 'in_progress'), true);
    expect(offers).not.toContain('on_hold');
    expect(offers).toContain('blocked');
    expect(statusOffersOf(parent([held, leaf()], 'unknown'), true)).toContain('on_hold');
  });

  it('never offers blocked by proxy, which is read and not set', () => {
    expect(statusOffersOf(leaf(), true)).not.toContain('blocked_by_proxy');
  });
});
