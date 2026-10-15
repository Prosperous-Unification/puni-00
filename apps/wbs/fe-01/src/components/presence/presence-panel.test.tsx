import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PresencePanel } from './presence-panel';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/**
 * What the panel's aria contract is, which nothing asserted before
 * `H header-fits-a-row`.
 *
 * The panel moved into the header bar in that change and its markup was
 * rewritten around it — a grey label and one clipped line rather than a section
 * with a bulleted list. Every role and name it had is the same, and this file is
 * what makes that a fact rather than a claim. Watched failures are quoted in
 * `openspec/changes/header-fits-a-row/verify.md`.
 *
 * **It opens no socket, since 2026-09-02.** The four cases that were about
 * frames — the `subscribe` before the `who`, the socket per project, the closed
 * connection that started no other — moved to `lib/project-stream.test.ts`,
 * which is where the socket is now: the roster rides the plan's own stream, so
 * a browser holds one connection rather than two. `StillSocket`, the
 * `globalThis.WebSocket` swap and the `act` wrappers went with them, and what is
 * left is a component that renders its props.
 */
describe('the presence panel', () => {
  afterEach(cleanup);

  itDom('names the live link, Live or Reconnecting, never Online (D9, F-078)', () => {
    const view = render(<PresencePanel me="kat" users={[]} connected={false} />);

    // Proof: on 5b65fd5ae (`Online` / `Offline`, which read as "the server is up"
    // beside a write the server could not complete) this failed on `Unable to find an
    // accessible element with the role "heading" and name "Reconnecting"`.
    expect(screen.getByRole('heading', { name: 'Reconnecting' })).toBeDefined();

    view.rerender(<PresencePanel me="kat" users={[]} connected />);

    expect(screen.getByRole('heading', { name: 'Live' })).toBeDefined();
    expect(screen.queryByText(/Online|Offline|\(open\)|\(closed\)/)).toBeNull();
  });

  itDom('carries the whole roster in its fact card, for the collapsed dot and count', () => {
    render(<PresencePanel me="kat" users={['kat', 'sam']} connected />);

    const panel = screen.getByRole('region', { name: 'Live' });
    expect(panel.getAttribute('data-fact')).toBe('Live: kat (you), sam');
    expect(panel.querySelector('[data-presence-count]')?.textContent).toBe('2');
  });

  itDom('says so while nobody has arrived', () => {
    render(<PresencePanel me="kat" users={[]} connected />);

    expect(screen.getByText('Nobody yet.')).toBeDefined();
  });

  itDom('lists who is online, and marks which one is you', () => {
    render(<PresencePanel me="kat" users={['kat', 'sam']} connected />);

    const roster = screen.getByRole('list');
    expect([...roster.querySelectorAll('li')].map((entry) => entry.textContent)).toEqual([
      'kat (you)',
      'sam',
    ]);
  });

  /*
   * While the link is down nobody's presence can be known: the roster is not
   * shown (not even the last one heard, which may already be wrong), no count is
   * drawn, and the panel says presence is unknown instead of "Nobody yet." The
   * stream reconnects, resubscribes and asks again (`reopens after a close it did
   * not ask for` and `asks who is there again on a reconnect` are the stream's).
   */
  itDom.each([
    ['nobody heard yet', [] as string[]],
    ['a roster heard before the drop', ['kat', 'sam']],
  ])('claims no roster while reconnecting, with %s (F-077)', (_, users) => {
    render(<PresencePanel me="kat" users={users} connected={false} />);

    const panel = screen.getByRole('region', { name: 'Reconnecting' });
    // Proof: with the roster drawn while reconnecting again (5b65fd5ae's branches under
    // the new names) this failed on `expected <p …(1)></p> to be null` ("Nobody yet.")
    // for the empty roster and on `expected <ul …(1)>…` to be null for the heard one.
    expect(screen.queryByText('Nobody yet.')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(panel.querySelector('[data-presence-count]')).toBeNull();
    expect(screen.getByText('Who else is here is not known until the link is back.')).toBeDefined();
    expect(panel.getAttribute('data-fact')).toBe(
      'Reconnecting: who else is here is not known until the link is back.',
    );
  });
});
