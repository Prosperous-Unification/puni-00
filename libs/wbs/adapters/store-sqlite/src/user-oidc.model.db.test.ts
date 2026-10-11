import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { UserRepository } from './user';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const ISSUER = 'https://tenant.test/';
const SEED = 20261011;

/** Auth0-shaped subjects: one per connection, as Auth0 mints them. */
type Pair = 'google-oauth2|1' | 'github|2' | 'email|3';
type Email = 'a@x.test' | 'b@x.test';

/** What the store should hold: who owns each pair, and each user's address. */
interface Model {
  readonly owners: Map<Pair, string>;
  readonly users: Map<string, { email: string | null; verified: boolean }>;
  created: number;
}

interface World {
  readonly path: string;
  readonly first: UserRepository;
  readonly second: UserRepository;
}

const at = (n: number) => ({ at: 1_000 + n, by: `u${String(n)}` });
const identity = (pair: Pair, email: Email, emailVerified: boolean) => ({
  issuer: ISSUER,
  subject: pair,
  email,
  emailVerified,
});
const heldByOther = (model: Model, email: string, self: string | null) =>
  [...model.users].some(([id, user]) => id !== self && user.email === email);

/**
 * Reads the store and checks social-sign-in D6 invariants 1–3 and agreement
 * with the model after every command.
 */
function checkInvariants(model: Model, world: World): void {
  const db = openDatabase(world.path);
  try {
    // 1. A pair maps to at most one user.
    expect(
      db
        .query(
          'SELECT issuer, subject FROM external_identity GROUP BY issuer, subject HAVING COUNT(*) > 1',
        )
        .all(),
    ).toEqual([]);
    // 2. A user's own pair, when present, is mapped to that user.
    expect(
      db
        .query(
          `SELECT u.id FROM users u LEFT JOIN external_identity m
             ON m.issuer = u.idp_issuer AND m.subject = u.idp_sub
           WHERE u.idp_sub IS NOT NULL AND (m.user_id IS NULL OR m.user_id <> u.id)`,
        )
        .all(),
    ).toEqual([]);
    // 3. An address is held by at most one user.
    expect(
      db
        .query(
          'SELECT lower(email) AS email FROM users WHERE email IS NOT NULL GROUP BY lower(email) HAVING COUNT(*) > 1',
        )
        .all(),
    ).toEqual([]);
    const owners = db
      .query<{ subject: string; user_id: string }, []>(
        'SELECT subject, user_id FROM external_identity ORDER BY subject',
      )
      .all();
    expect(Object.fromEntries(owners.map((row) => [row.subject, row.user_id]))).toEqual(
      Object.fromEntries(model.owners),
    );
    const users = db
      .query<{ id: string; email: string | null; email_verified: number }, []>(
        'SELECT id, email, email_verified FROM users ORDER BY id',
      )
      .all();
    expect(
      Object.fromEntries(
        users.map((row) => [row.id, { email: row.email, verified: row.email_verified === 1 }]),
      ),
    ).toEqual(Object.fromEntries(model.users));
  } finally {
    db.close();
  }
}

/** A first or repeat sign-in through `resolveOidcIdentity`. */
class Login implements fc.AsyncCommand<Model, World> {
  constructor(
    readonly pair: Pair,
    readonly email: Email,
    readonly verified: boolean,
  ) {}
  check = () => true;
  async run(model: Model, world: World): Promise<void> {
    model.created += 1;
    const id = `u${String(model.created)}`;
    const answer = await world.first.resolveOidcIdentity(
      identity(this.pair, this.email, this.verified),
      { id },
      at(model.created),
    );
    const owner = model.owners.get(this.pair);
    if (owner !== undefined) {
      const user = model.users.get(owner);
      if (user === undefined) throw new Error(`model owner ${owner} has no user`);
      if (heldByOther(model, this.email, owner) && this.verified) {
        user.verified = false;
        expect(answer).toBeNull();
      } else if (heldByOther(model, this.email, owner)) {
        // An unproven address held elsewhere is dropped, never refused.
        user.email = null;
        user.verified = false;
        expect(answer?.id).toBe(owner);
      } else {
        user.email = this.email;
        user.verified = this.verified;
        expect(answer?.id).toBe(owner);
      }
    } else if (heldByOther(model, this.email, null) && this.verified) {
      expect(answer).toBeNull();
    } else if (heldByOther(model, this.email, null)) {
      model.owners.set(this.pair, id);
      model.users.set(id, { email: null, verified: false });
      expect(answer?.id).toBe(id);
    } else {
      model.owners.set(this.pair, id);
      model.users.set(id, { email: this.email, verified: this.verified });
      expect(answer?.id).toBe(id);
    }
    checkInvariants(model, world);
  }
  toString = () => `Login(${this.pair}, ${this.email}, ${String(this.verified)})`;
}

/** Two first sign-ins of one pair racing on two connections. */
class RacingLogin implements fc.AsyncCommand<Model, World> {
  constructor(
    readonly pair: Pair,
    readonly email: Email,
  ) {}
  check = (model: Readonly<Model>) => !model.owners.has(this.pair);
  async run(model: Model, world: World): Promise<void> {
    const held = heldByOther(model, this.email, null);
    model.created += 2;
    const ids = [`u${String(model.created - 1)}`, `u${String(model.created)}`];
    const answers = await Promise.all([
      world.first.resolveOidcIdentity(
        identity(this.pair, this.email, true),
        { id: ids[0] ?? '' },
        at(model.created - 1),
      ),
      world.second.resolveOidcIdentity(
        identity(this.pair, this.email, true),
        { id: ids[1] ?? '' },
        at(model.created),
      ),
    ]);
    if (held) {
      expect(answers).toEqual([null, null]);
    } else {
      const winner = answers[0]?.id;
      expect(winner === undefined ? undefined : ids.includes(winner)).toBe(true);
      expect(answers[1]?.id).toBe(winner);
      if (winner === undefined) throw new Error('racing login resolved no user');
      model.owners.set(this.pair, winner);
      model.users.set(winner, { email: this.email, verified: true });
    }
    checkInvariants(model, world);
  }
  toString = () => `RacingLogin(${this.pair}, ${this.email})`;
}

/** An explicit link of a further pair to an existing user. */
class Link implements fc.AsyncCommand<Model, World> {
  constructor(
    readonly userIndex: number,
    readonly pair: Pair,
    readonly email: Email,
    readonly verified: boolean,
  ) {}
  check = (model: Readonly<Model>) => model.users.size > 0;
  async run(model: Model, world: World): Promise<void> {
    const ids = [...model.users.keys()].sort();
    const userId = ids[this.userIndex % ids.length] ?? '';
    const answer = await world.first.linkIdentity(
      userId,
      identity(this.pair, this.email, this.verified),
      { at: 2_000 + model.created, by: userId },
    );
    const owner = model.owners.get(this.pair);
    if (!this.verified) expect(answer).toEqual({ kind: 'unverified' });
    else if (owner !== undefined && owner !== userId)
      expect(answer).toEqual({ kind: 'identity_collision' });
    else if (heldByOther(model, this.email, userId))
      expect(answer).toEqual({ kind: 'email_collision' });
    else {
      expect(answer).toEqual({ kind: 'linked' });
      model.owners.set(this.pair, userId);
      model.users.set(userId, { email: this.email, verified: true });
    }
    checkInvariants(model, world);
  }
  toString = () =>
    `Link(${String(this.userIndex)}, ${this.pair}, ${this.email}, ${String(this.verified)})`;
}

const pair = fc.constantFrom<Pair>('google-oauth2|1', 'github|2', 'email|3');
const email = fc.constantFrom<Email>('a@x.test', 'b@x.test');
const commands = fc.commands<Model, World, false>(
  [
    fc.tuple(pair, email, fc.boolean()).map(([p, e, v]) => new Login(p, e, v)),
    fc.tuple(pair, email).map(([p, e]) => new RacingLogin(p, e)),
    fc.tuple(fc.nat(3), pair, email, fc.boolean()).map(([u, p, e, v]) => new Link(u, p, e, v)),
  ],
  { maxCommands: 10 },
);

/**
 * Login and link interleavings over three Auth0-shaped pairs and two
 * addresses, after activation: the model owns who holds which pair and
 * address, and D6's invariants are read back from SQLite after every step.
 * Logout is absent on purpose: it touches no identity row.
 *
 * Proof: 2026-10-11, re-pointing an already-owned pair to the linking user
 * (instead of answering identity_collision, which leaves the owner's own pair
 * mapped to someone else) failed with the shrunk counterexample
 * `[Login(google-oauth2|1, b@x.test, false), Login(github|2, a@x.test, false),
 * Link(0, github|2, a@x.test, true)]`.
 */
describe('several verified pairs per user, by model', () => {
  it('keeps D6 invariants across login and link histories', async () => {
    expect(fc.__version).toBe('4.9.0');
    await fc.assert(
      fc.asyncProperty(commands, async (history) => {
        const dir = mkdtempSync(join(tmpdir(), 'wbs-user-oidc-model-'));
        try {
          const path = join(dir, 'test.db');
          runMigrations(path, FOLDER);
          const db = openDatabase(path);
          db.run(
            "UPDATE organization_activation SET state = 'activated', activated_at = 1 WHERE singleton = 1",
          );
          db.close();
          const world: World = {
            path,
            first: new UserRepository(openDrizzle(path), OPEN),
            second: new UserRepository(openDrizzle(path), OPEN),
          };
          await fc.asyncModelRun(
            () => ({ model: { owners: new Map(), users: new Map(), created: 0 }, real: world }),
            history,
          );
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }),
      { seed: SEED, numRuns: 60 },
    );
  }, 120_000);
});
