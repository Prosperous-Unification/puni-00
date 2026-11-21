import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { Presence } from './presence';

const socket = () => {
  const sent: string[] = [];
  return {
    sent,
    send: (s: string) => {
      sent.push(s);
      return Promise.resolve('sent' as const);
    },
  };
};

const HULL = 'work-package-hull';
const KEEL = 'work-package-keel';

/** A connection that has joined and named the work package it is looking at. */
function inWorkPackage(p: Presence, connectionId: string, username: string, workPackageId: string) {
  const s = socket();
  p.join(connectionId, username, s);
  p.enterWorkPackage(connectionId, workPackageId);
  return s;
}

const rosterIn = (s: { sent: string[] }): string[] =>
  (JSON.parse(s.sent.at(-1) ?? '{}') as { users?: string[] }).users ?? [];

describe('Presence', () => {
  it('lists a joined user once per name, not once per connection', () => {
    const p = new Presence();
    inWorkPackage(p, 'c1', 'ada', HULL);
    inWorkPackage(p, 'c2', 'ada', HULL);
    inWorkPackage(p, 'c3', 'grace', HULL);
    expect(p.list(HULL)).toEqual(['ada', 'grace']);
    expect(p.connectionCount).toBe(3);
  });

  it('keeps a user online while any of their connections remains', () => {
    const p = new Presence();
    inWorkPackage(p, 'c1', 'ada', HULL);
    inWorkPackage(p, 'c2', 'ada', HULL);
    p.leave('c1');
    expect(p.list(HULL)).toEqual(['ada']);
    p.leave('c2');
    expect(p.list(HULL)).toEqual([]);
  });

  it('broadcasts the roster to every connection', async () => {
    const p = new Presence();
    const a = inWorkPackage(p, 'c1', 'ada', HULL);
    const b = inWorkPackage(p, 'c2', 'grace', HULL);
    await p.broadcast([HULL, KEEL]);
    const expected = JSON.stringify({ type: 'presence', users: ['ada', 'grace'] });
    expect(a.sent.at(-1)).toBe(expected);
    expect(b.sent.at(-1)).toBe(expected);
  });

  it('still reaches the other clients when one socket is retired', async () => {
    const p = new Presence();
    const good = socket();
    p.join('c1', 'broken', {
      send: () => {
        return Promise.resolve('retired');
      },
    });
    p.enterWorkPackage('c1', HULL);
    p.join('c2', 'ada', good);
    p.enterWorkPackage('c2', HULL);
    expect(await p.broadcast([HULL, KEEL])).toEqual(['retired', 'sent']);
    expect(good.sent).toHaveLength(1);
  });

  it('resolves the username behind a connection id', () => {
    const p = new Presence();
    p.join('c1', 'ada', socket());
    expect(p.usernameOf('c1')).toBe('ada');
    expect(p.usernameOf('missing')).toBeNull();
  });
});

describe('a roster is a work package’s, not the gateway’s', () => {
  it('shows each work package only the names in it', () => {
    // F4, observed live 2026-08-09: a work package created a second ago listed every
    // account with a socket open on this gateway.
    //
    // Proof: the `workPackageId` filter struck from `Presence.list` — the body left
    // as the old `[...new Set(values().map(username))].sort()`. This test failed
    // on `expect(p.list(HULL)).toEqual(['ada', 'grace'])`, receiving
    // `['ada', 'grace', 'linus']`, and the two `rosterFor` expectations below
    // failed with the other work package's names in them. Watched 2026-08-09.
    const p = new Presence();
    inWorkPackage(p, 'c1', 'ada', HULL);
    inWorkPackage(p, 'c2', 'grace', HULL);
    inWorkPackage(p, 'c3', 'linus', KEEL);

    expect(p.list(HULL)).toEqual(['ada', 'grace']);
    expect(p.list(KEEL)).toEqual(['linus']);
    expect(p.rosterFor('c1')).toEqual(['ada', 'grace']);
    expect(p.rosterFor('c3')).toEqual(['linus']);
  });

  it('broadcasts each socket its own work package’s names and no others', async () => {
    const p = new Presence();
    const ada = inWorkPackage(p, 'c1', 'ada', HULL);
    const linus = inWorkPackage(p, 'c2', 'linus', KEEL);

    await p.broadcast([HULL, KEEL]);

    expect(rosterIn(ada)).toEqual(['ada']);
    expect(rosterIn(linus)).toEqual(['linus']);
  });

  it('moves a connection when it switches work package', async () => {
    const p = new Presence();
    inWorkPackage(p, 'c1', 'ada', HULL);
    inWorkPackage(p, 'c2', 'grace', HULL);
    const linus = inWorkPackage(p, 'c3', 'linus', KEEL);

    p.enterWorkPackage('c3', HULL);

    // In the new list, and out of the old one — a switch is a move, not a
    // second membership.
    expect(p.list(HULL)).toEqual(['ada', 'grace', 'linus']);
    expect(p.list(KEEL)).toEqual([]);
    await p.broadcast([HULL, KEEL]);
    expect(rosterIn(linus)).toEqual(['ada', 'grace', 'linus']);
  });

  it('puts a connection that has named no work package in nobody’s roster', async () => {
    const p = new Presence();
    const lurker = socket();
    p.join('c1', 'mallory', lurker);
    inWorkPackage(p, 'c2', 'ada', HULL);

    expect(p.list(HULL)).toEqual(['ada']);
    expect(p.rosterFor('c1')).toEqual([]);
    await p.broadcast([HULL, KEEL]);
    await p.sendRoster('c1');
    // Told, rather than left silent: an empty roster is an answer, and the
    // panel says "Nobody yet." on it.
    expect(rosterIn(lurker)).toEqual([]);
  });

  it('knows nothing about a connection that never joined', () => {
    // The socket whose token did not verify at `open`. It has no username, so
    // there is nothing to put in a roster and nothing to take out of one.
    const p = new Presence();
    inWorkPackage(p, 'c1', 'ada', HULL);

    p.enterWorkPackage('unknown-connection', HULL);
    p.leaveWorkPackage('unknown-connection', HULL);

    expect(p.list(HULL)).toEqual(['ada']);
    expect(p.rosterFor('unknown-connection')).toEqual([]);
  });

  it('takes a connection out of the work package it leaves', () => {
    const p = new Presence();
    inWorkPackage(p, 'c1', 'ada', HULL);
    inWorkPackage(p, 'c2', 'grace', HULL);

    p.leaveWorkPackage('c2', HULL);

    expect(p.list(HULL)).toEqual(['ada']);
    expect(p.rosterFor('c2')).toEqual([]);
  });

  it('ignores an unsubscribe from a work package the connection has already left', () => {
    // A browser that switches work package sends `subscribe` and `unsubscribe`, and
    // their order on the wire is the network's. A late unsubscribe for the old
    // work package must not empty the roster of the new one.
    //
    // Proof: the `?.workPackageId === workPackageId` guard in `leaveWorkPackage` replaced
    // with an unconditional clear. This test failed on
    // `expect(p.list(KEEL)).toEqual(['grace'])`, receiving `[]`.
    const p = new Presence();
    inWorkPackage(p, 'c1', 'grace', HULL);
    p.enterWorkPackage('c1', KEEL);

    p.leaveWorkPackage('c1', HULL);

    expect(p.list(KEEL)).toEqual(['grace']);
  });
});

/**
 * The per-work-package index and a full scan agree, whatever happens to a socket.
 *
 * `list()` filtered every connection the gateway holds until 2026-09-02, and
 * `broadcast()` calls it once per distinct work package — so a join, a subscribe or a
 * leave cost O(connections × work packages) on the one class that runs on every
 * socket event. It is a `Map<workPackageId, Set<connectionId>>` now, which means
 * **two indexes over one fact**, and the fault that shape has is drift: a
 * connection left in a work package's set, or taken out of the wrong one.
 *
 * So this is a differential rather than a set of examples: a thousand random
 * sequences of join, subscribe, move, unsubscribe and leave, comparing every
 * work package's roster against the scan the class used to do.
 *
 * Proof, both watched 2026-09-02 and both caught by an **existing** case as
 * well as by this one. The set removal taken out of `leave` fails `keeps a user
 * online while any of their connections remains` on `presence: c1 is in
 * work-package-hull but is not connected` — the throw `list` keeps for exactly this
 * drift. Taken out of `enterWorkPackage`, it fails `moves a connection when it
 * switches workPackage` on `+ Received + 3` and the differential below: a
 * connection that moved still counted in the work package it left.
 */
describe('the two indexes never disagree', () => {
  const WORK_PACKAGES = ['p1', 'p2', 'p3'];

  it('over a thousand random socket sequences', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            connection: fc.integer({ min: 0, max: 5 }),
            workPackage: fc.integer({ min: 0, max: 2 }),
            what: fc.constantFrom('join', 'subscribe', 'unsubscribe', 'leave'),
          }),
          { minLength: 1, maxLength: 40 },
        ),
        (steps) => {
          const presence = new Presence();
          /** What the class did before the index existed. */
          const byScanning = (workPackageId: string): string[] =>
            [
              ...new Set(
                [...seen.entries()]
                  .filter(([, at]) => at === workPackageId)
                  .map(([connectionId]) => `u${connectionId.slice(1)}`),
              ),
            ].sort();
          const seen = new Map<string, string | null>();

          for (const step of steps) {
            const connectionId = `c${String(step.connection)}`;
            const workPackageId = WORK_PACKAGES[step.workPackage] ?? 'p1';
            if (step.what === 'join') {
              presence.join(connectionId, `u${String(step.connection)}`, {
                send: () => Promise.resolve('sent'),
              });
              seen.set(connectionId, null);
            } else if (step.what === 'subscribe') {
              presence.enterWorkPackage(connectionId, workPackageId);
              if (seen.has(connectionId)) seen.set(connectionId, workPackageId);
            } else if (step.what === 'unsubscribe') {
              presence.leaveWorkPackage(connectionId, workPackageId);
              if (seen.get(connectionId) === workPackageId) seen.set(connectionId, null);
            } else {
              presence.leave(connectionId);
              seen.delete(connectionId);
            }
          }

          for (const workPackageId of WORK_PACKAGES) {
            expect(presence.list(workPackageId)).toEqual(byScanning(workPackageId));
          }
        },
      ),
      { numRuns: 1_000, seed: 20_260_902 },
    );
  });
});

it('identifies only changed work packages across join, move, reset, rejoin and disconnect', () => {
  const p = new Presence();
  expect(p.join('c1', 'ada', socket())).toEqual([]);
  expect(p.enterWorkPackage('c1', HULL)).toEqual([HULL]);
  expect(p.enterWorkPackage('c1', HULL)).toEqual([]);
  expect(p.enterWorkPackage('c1', KEEL)).toEqual([HULL, KEEL]);
  expect(p.leaveWorkPackage('c1', HULL)).toEqual([]);
  expect(p.leaveWorkPackage('c1', KEEL)).toEqual([KEEL]);
  expect(p.leaveWorkPackage('c1', KEEL)).toEqual([]);
  expect(p.enterWorkPackage('c1', HULL)).toEqual([HULL]);
  expect(p.join('c1', 'grace', socket())).toEqual([HULL]);
  expect(p.list(HULL)).toEqual([]);
  expect(p.usernameOf('c1')).toBe('grace');
  expect(p.enterWorkPackage('c1', KEEL)).toEqual([KEEL]);
  expect(p.leave('c1')).toEqual([KEEL]);
  expect(p.leave('c1')).toEqual([]);
  expect(p.enterWorkPackage('missing', HULL)).toEqual([]);
  expect(p.leaveWorkPackage('missing', HULL)).toEqual([]);
  expect((p as unknown as { byWorkPackage: Map<string, Set<string>> }).byWorkPackage.size).toBe(0);
});

it('sends an unprojected newcomer one initial roster and zero frames to 1000 connections in 100 work packages', async () => {
  const p = new Presence();
  const existing = Array.from({ length: 1000 }, (_, n) =>
    inWorkPackage(p, `c${String(n)}`, `u${String(n)}`, `p${String(n % 100)}`),
  );
  const newcomer = socket();
  const affected = p.join('new', 'newcomer', newcomer);
  await p.broadcast(affected);
  expect(existing.reduce((count, s) => count + s.sent.length, 0)).toBe(0);
  await p.sendRoster('new');
  expect(newcomer.sent).toEqual([JSON.stringify({ type: 'presence', users: [] })]);
});

it('delivers only to affected members and resets a renamed connection after its own unsubscribe', async () => {
  const p = new Presence();
  const ada = inWorkPackage(p, 'ada', 'ada', HULL);
  const grace = inWorkPackage(p, 'grace', 'grace', HULL);
  const linus = inWorkPackage(p, 'linus', 'linus', KEEL);
  const other = inWorkPackage(p, 'other', 'other', 'unrelated');
  await p.broadcast(p.enterWorkPackage('ada', KEEL));
  expect(ada.sent).toHaveLength(1);
  expect(grace.sent).toEqual([JSON.stringify({ type: 'presence', users: ['grace'] })]);
  expect(linus.sent).toEqual([JSON.stringify({ type: 'presence', users: ['ada', 'linus'] })]);
  expect(other.sent).toEqual([]);
  for (const s of [ada, grace, linus]) s.sent.length = 0;
  await p.broadcast(p.enterWorkPackage('ada', KEEL));
  await p.broadcast(p.leaveWorkPackage('ada', HULL));
  expect([ada.sent.length, grace.sent.length, linus.sent.length, other.sent.length]).toEqual([
    0, 0, 0, 0,
  ]);

  const renamed = socket();
  await p.broadcast(p.join('ada', 'renamed', renamed));
  await p.sendRoster('ada');
  expect(ada.sent).toEqual([]);
  expect(linus.sent).toEqual([JSON.stringify({ type: 'presence', users: ['linus'] })]);
  expect(renamed.sent).toEqual([JSON.stringify({ type: 'presence', users: [] })]);
  await p.broadcast(p.enterWorkPackage('ada', HULL));
  for (const s of [renamed, grace, linus]) s.sent.length = 0;
  const left = p.leaveWorkPackage('ada', HULL);
  await p.broadcast(left);
  if (left.length > 0) await p.sendRoster('ada');
  expect(renamed.sent).toEqual([JSON.stringify({ type: 'presence', users: [] })]);
  expect(grace.sent).toEqual([JSON.stringify({ type: 'presence', users: ['grace'] })]);
  expect([ada.sent.length, linus.sent.length, other.sent.length]).toEqual([0, 0, 0]);
});

it('disconnects one tab through its work package lookup while keeping the duplicate username', async () => {
  const p = new Presence();
  const departing = inWorkPackage(p, 'tab1', 'ada', HULL);
  const remaining = inWorkPackage(p, 'tab2', 'ada', HULL);
  const unrelated = inWorkPackage(p, 'other', 'grace', KEEL);
  await p.broadcast(p.leave('tab1'));
  expect(remaining.sent).toEqual([JSON.stringify({ type: 'presence', users: ['ada'] })]);
  expect(departing.sent).toEqual([]);
  expect(unrelated.sent).toEqual([]);
  expect(p.connectionCount).toBe(2);
});
