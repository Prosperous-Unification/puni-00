import { describe, expect, it } from 'bun:test';

import { Presence } from './presence';

const socket = () => {
  const sent: string[] = [];
  return { sent, send: (s: string) => sent.push(s) };
};

const HULL = 'project-hull';
const KEEL = 'project-keel';

/** A connection that has joined and named the project it is looking at. */
function inProject(p: Presence, connectionId: string, username: string, projectId: string) {
  const s = socket();
  p.join(connectionId, username, s);
  p.enterProject(connectionId, projectId);
  return s;
}

const rosterIn = (s: { sent: string[] }): string[] =>
  (JSON.parse(s.sent.at(-1) ?? '{}') as { users?: string[] }).users ?? [];

describe('Presence', () => {
  it('lists a joined user once per name, not once per connection', () => {
    const p = new Presence();
    inProject(p, 'c1', 'ada', HULL);
    inProject(p, 'c2', 'ada', HULL);
    inProject(p, 'c3', 'grace', HULL);
    expect(p.list(HULL)).toEqual(['ada', 'grace']);
    expect(p.connectionCount).toBe(3);
  });

  it('keeps a user online while any of their connections remains', () => {
    const p = new Presence();
    inProject(p, 'c1', 'ada', HULL);
    inProject(p, 'c2', 'ada', HULL);
    p.leave('c1');
    expect(p.list(HULL)).toEqual(['ada']);
    p.leave('c2');
    expect(p.list(HULL)).toEqual([]);
  });

  it('broadcasts the roster to every connection', () => {
    const p = new Presence();
    const a = inProject(p, 'c1', 'ada', HULL);
    const b = inProject(p, 'c2', 'grace', HULL);
    p.broadcast();
    const expected = JSON.stringify({ type: 'presence', users: ['ada', 'grace'] });
    expect(a.sent.at(-1)).toBe(expected);
    expect(b.sent.at(-1)).toBe(expected);
  });

  it('still reaches the other clients when one socket throws', () => {
    const p = new Presence();
    const good = socket();
    p.join('c1', 'broken', {
      send: () => {
        throw new Error('socket closed');
      },
    });
    p.enterProject('c1', HULL);
    p.join('c2', 'ada', good);
    p.enterProject('c2', HULL);
    expect(() => {
      p.broadcast();
    }).not.toThrow();
    expect(good.sent).toHaveLength(1);
  });

  it('resolves the username behind a connection id', () => {
    const p = new Presence();
    p.join('c1', 'ada', socket());
    expect(p.usernameOf('c1')).toBe('ada');
    expect(p.usernameOf('missing')).toBeNull();
  });
});

describe('a roster is a project’s, not the gateway’s', () => {
  it('shows each project only the names in it', () => {
    // F4, observed live 2026-08-09: a project created a second ago listed every
    // account with a socket open on this gateway.
    //
    // Proof: the `projectId` filter struck from `Presence.list` — the body left
    // as the old `[...new Set(values().map(username))].sort()`. This test failed
    // on `expect(p.list(HULL)).toEqual(['ada', 'grace'])`, receiving
    // `['ada', 'grace', 'linus']`, and the two `rosterFor` expectations below
    // failed with the other project's names in them. Watched 2026-08-09.
    const p = new Presence();
    inProject(p, 'c1', 'ada', HULL);
    inProject(p, 'c2', 'grace', HULL);
    inProject(p, 'c3', 'linus', KEEL);

    expect(p.list(HULL)).toEqual(['ada', 'grace']);
    expect(p.list(KEEL)).toEqual(['linus']);
    expect(p.rosterFor('c1')).toEqual(['ada', 'grace']);
    expect(p.rosterFor('c3')).toEqual(['linus']);
  });

  it('broadcasts each socket its own project’s names and no others', () => {
    const p = new Presence();
    const ada = inProject(p, 'c1', 'ada', HULL);
    const linus = inProject(p, 'c2', 'linus', KEEL);

    p.broadcast();

    expect(rosterIn(ada)).toEqual(['ada']);
    expect(rosterIn(linus)).toEqual(['linus']);
  });

  it('moves a connection when it switches project', () => {
    const p = new Presence();
    inProject(p, 'c1', 'ada', HULL);
    inProject(p, 'c2', 'grace', HULL);
    const linus = inProject(p, 'c3', 'linus', KEEL);

    p.enterProject('c3', HULL);

    // In the new list, and out of the old one — a switch is a move, not a
    // second membership.
    expect(p.list(HULL)).toEqual(['ada', 'grace', 'linus']);
    expect(p.list(KEEL)).toEqual([]);
    p.broadcast();
    expect(rosterIn(linus)).toEqual(['ada', 'grace', 'linus']);
  });

  it('puts a connection that has named no project in nobody’s roster', () => {
    const p = new Presence();
    const lurker = socket();
    p.join('c1', 'mallory', lurker);
    inProject(p, 'c2', 'ada', HULL);

    expect(p.list(HULL)).toEqual(['ada']);
    expect(p.rosterFor('c1')).toEqual([]);
    p.broadcast();
    // Told, rather than left silent: an empty roster is an answer, and the
    // panel says "Nobody yet." on it.
    expect(rosterIn(lurker)).toEqual([]);
  });

  it('knows nothing about a connection that never joined', () => {
    // The socket whose token did not verify at `open`. It has no username, so
    // there is nothing to put in a roster and nothing to take out of one.
    const p = new Presence();
    inProject(p, 'c1', 'ada', HULL);

    p.enterProject('unknown-connection', HULL);
    p.leaveProject('unknown-connection', HULL);

    expect(p.list(HULL)).toEqual(['ada']);
    expect(p.rosterFor('unknown-connection')).toEqual([]);
  });

  it('takes a connection out of the project it leaves', () => {
    const p = new Presence();
    inProject(p, 'c1', 'ada', HULL);
    inProject(p, 'c2', 'grace', HULL);

    p.leaveProject('c2', HULL);

    expect(p.list(HULL)).toEqual(['ada']);
    expect(p.rosterFor('c2')).toEqual([]);
  });

  it('ignores an unsubscribe from a project the connection has already left', () => {
    // A browser that switches project sends `subscribe` and `unsubscribe`, and
    // their order on the wire is the network's. A late unsubscribe for the old
    // project must not empty the roster of the new one.
    //
    // Proof: the `?.projectId === projectId` guard in `leaveProject` replaced
    // with an unconditional clear. This test failed on
    // `expect(p.list(KEEL)).toEqual(['grace'])`, receiving `[]`.
    const p = new Presence();
    inProject(p, 'c1', 'grace', HULL);
    p.enterProject('c1', KEEL);

    p.leaveProject('c1', HULL);

    expect(p.list(KEEL)).toEqual(['grace']);
  });
});
