import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { JwksTokenVerifier } from '@wbs/auth';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import { OrganizationHarness } from '../testing/organization-harness';

const REPOSITORY = join(import.meta.dir, '../../../../..');
const ISSUER = 'https://idp.test';
const AUDIENCE = 'api://wbs';
const FLEET = 'claire-m2m@clients';

let signing: CryptoKeyPair;
let jwks: ReturnType<typeof Bun.serve>;
let h: OrganizationHarness;

beforeAll(async () => {
  signing = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(signing.publicKey);
  jwks = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      Response.json({ keys: [{ ...publicJwk, alg: 'RS256', kid: 'fleet', use: 'sig' }] }),
  });
});

afterAll(async () => {
  await jwks.stop(true);
});

/**
 * The retired operator links (`wbs-machine-credentials` A18, A21, spec
 * `fleet-credentials`): a verified token of the configured issuer without a
 * groups claim is refused `unknown_identity` whatever `external_identity`
 * holds, a pinned row included, and writes nothing; a token with the groups
 * claim keeps the browser login. A machine is admitted only by a machine
 * credential (`machine-credential.controller.db.test.ts`).
 */
beforeEach(async () => {
  h = openHarness();
  for (const username of ['dany', 'mem']) await h.register(username);
  h.organization('org-a');
  h.member('org-a', 'dany', 'admin');
  h.member('org-a', 'mem', 'member');
  h.bind('dany', 'org-a');
  h.bind('mem', 'org-a');
  h.activate();
  // A verified address, which `register` does not give: what a machine token
  // must leave alone.
  h.sqlite.run("UPDATE users SET email = 'dany@example.com', email_verified = 1 WHERE id = ?", [
    h.userId('dany'),
  ]);
  const created = await h.call('dany', 'POST', '/api/projects', { name: 'Fleet plan' });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  h.sqlite.run(
    "INSERT INTO person (id, name, kind, account_id) VALUES ('claire', 'Claire', 'agent', ?), ('mem-agent', 'Mem agent', 'agent', ?)",
    [h.userId('dany'), h.userId('mem')],
  );
});

afterEach(() => {
  h.close();
});

/** be-01's production composition over a fresh store, verifying tokens against the test JWKS. */
function openHarness(): OrganizationHarness {
  return OrganizationHarness.openComposedWith({
    upstreamCredential: {
      verifier: new JwksTokenVerifier({
        audience: AUDIENCE,
        issuer: ISSUER,
        jwksUri: new URL(`http://127.0.0.1:${String(jwks.port)}/jwks`),
      }),
      groupPrefix: 'dev',
      groupsClaim: 'wbs_groups',
    },
  });
}

/**
 * An access token for `subject`, with no email unless `claims` adds one.
 * `groups` adds `wbs_groups` as a browser token carries it; a real Auth0
 * machine-to-machine token carries none (slice 0), which is the default here.
 */
function token(subject: string, groups = false, claims: Record<string, unknown> = {}) {
  const seconds = Math.floor(Date.now() / 1000);
  return new SignJWT({
    ...claims,
    ...(groups ? { wbs_groups: ['dev:wbs:read', 'dev:wbs:write'] } : {}),
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'fleet' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(subject)
    .setJti(crypto.randomUUID())
    .setIssuedAt(seconds)
    .setExpirationTime(seconds + 300)
    .sign(signing.privateKey);
}

/**
 * The row the retired `link-credential-cli.ts` wrote: the fleet pair mapped to
 * `account`, pinned to `person` (or unpinned with null). Rows like it stay on
 * dev and prod after the swap until a cleanup change drops the column.
 */
function legacyLink(account: string, person: string | null): void {
  h.sqlite.run(
    'INSERT INTO external_identity (id, user_id, issuer, subject, person_id, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [crypto.randomUUID(), h.userId(account), ISSUER, FLEET, person, Date.now(), h.userId(account)],
  );
}

function as(bearer: string, method: string, path: string, body?: unknown) {
  return h.callWith(bearer, method, path, body, { 'X-WBS-Expected-Organization': 'org-a' });
}

function usersTable(): unknown[] {
  return h.sqlite.query('SELECT * FROM users ORDER BY id').all();
}

function linksTable(): unknown[] {
  return h.sqlite.query('SELECT * FROM external_identity ORDER BY id').all();
}

const UNKNOWN = { status: 401, body: { error: 'unknown_identity' } };

describe('a retired operator link', () => {
  it('admits nothing for a pinned row, leaving the row and the owner byte for byte', async () => {
    legacyLink('dany', 'claire');
    const users = usersTable();
    const links = linksTable();

    expect(await as(await token(FLEET), 'GET', '/api/projects')).toEqual(UNKNOWN);
    expect(usersTable()).toEqual(users);
    expect(linksTable()).toEqual(links);
  }, 30_000);

  it('admits nothing for an unpinned row of a member’s account', async () => {
    legacyLink('mem', null);
    const users = usersTable();

    expect(await as(await token(FLEET), 'GET', '/api/projects')).toEqual(UNKNOWN);
    expect(
      await as(await token(FLEET), 'POST', '/api/projects', { name: 'Written by a link' }),
    ).toEqual(UNKNOWN);
    expect(usersTable()).toEqual(users);
  }, 30_000);

  // A groups-less token naming another verified address must not refresh the
  // owner's email.
  it('leaves the owner’s email alone under a groups-less token carrying an email', async () => {
    legacyLink('dany', 'claire');
    const before = usersTable();
    const bearer = await token(FLEET, false, {
      email: 'fleet@elsewhere.example',
      email_verified: true,
    });

    expect(await as(bearer, 'GET', '/api/projects')).toEqual(UNKNOWN);
    expect(usersTable()).toEqual(before);
  }, 30_000);

  it('refuses an unlinked machine token as unknown_identity, minting no account', async () => {
    const before = usersTable();
    const bearer = await token(FLEET);
    expect(await as(bearer, 'GET', '/api/projects')).toEqual(UNKNOWN);
    // The refusal keeps the endpoint's own no-store and Vary headers.
    const raw = await h.request('/api/organization/active', {
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(raw.status).toBe(401);
    expect(await raw.json()).toEqual({ error: 'unknown_identity' });
    expect(raw.headers.get('cache-control')).toBe('no-store');
    expect(raw.headers.get('vary')).toContain('Authorization');
    expect(usersTable()).toEqual(before);
  }, 30_000);

  // Proof: with `authenticateOrRefuse`'s groups-less branch disabled (the
  // token resolved through `resolveOidcIdentity`), this answered 200 with an
  // empty project list instead of 401; watched 2026-10-20.
  it('refuses an unlinked groups-less token before activation, minting no account', async () => {
    h.close();
    h = openHarness();
    await h.register('dany');
    const before = usersTable();
    expect(await h.callWith(await token(FLEET), 'GET', '/api/projects')).toEqual(UNKNOWN);
    expect(usersTable()).toEqual(before);
  }, 30_000);

  it('removes a person with a pinned row unconfirmed, taking the inert row with it', async () => {
    legacyLink('dany', 'claire');
    h.sqlite.run(
      "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('claire', 'org-a', 'Claire')",
    );

    const removed = await h.call('dany', 'POST', '/api/directory/commands', {
      commands: [{ kind: 'deletePerson', personId: 'claire', cascade: false }],
    });
    expect(removed.status).toBe(200);
    expect(
      h.sqlite.query('SELECT count(*) AS n FROM external_identity WHERE subject = ?').get(FLEET),
    ).toEqual({ n: 0 });
  }, 30_000);
});

describe('a browser token', () => {
  it('keeps its groups whether or not its pair is linked, leaving the owner byte for byte', async () => {
    legacyLink('dany', 'claire');
    const before = usersTable();

    const answer = await as(await token(FLEET, true), 'GET', '/api/projects');
    expect(answer.status).toBe(200);
    expect(JSON.stringify(answer.body)).toContain('Fleet plan');
    expect(usersTable()).toEqual(before);
  }, 30_000);
});

/**
 * Every production source line of the WBS apps and libraries that names
 * `external_identity.person_id` in code (comments aside), as
 * `path: line`. Tests, test fixtures and migrations are not production
 * readers; the rollback guard of `20261019130100_add_external_identity_person`
 * counts the column but is a frozen migration.
 *
 * What it does not prove: it reads single lines, so a row selected whole
 * (`select().from(externalIdentity)`) and then read for `.personId`, raw SQL
 * split across lines, or an alias escapes it; and it says nothing about
 * admission by `(issuer, subject)`, which is the real risk. The behavioural
 * cases above and the groups-less link start and refresh in
 * `oidc-identity.controller.db.test.ts` are the guards for that.
 */
function personIdUses(): string[] {
  const uses: string[] = [];
  for (const root of ['apps/wbs', 'libs/wbs']) {
    for (const path of new Bun.Glob('**/src/**/*.{ts,tsx}').scanSync(join(REPOSITORY, root))) {
      if (/(^|\/)(testing|e2e)\/|\.(test|proof)\.tsx?$/.test(path)) continue;
      const lines = readFileSync(join(REPOSITORY, root, path), 'utf8').split('\n');
      for (const line of lines) {
        const code = line.trim();
        if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) continue;
        if (
          code.includes('externalIdentity.personId') ||
          (code.includes('external_identity') && code.includes('person_id'))
        )
          uses.push(`${root}/${path}: ${code}`);
      }
    }
  }
  return uses.toSorted();
}

describe('the retired pin column', () => {
  // Proof: with `credentialPinOf` restored on `DirectoryRepository` (its
  // select of `externalIdentity.personId`), this listed that line beside the
  // delete; watched 2026-10-25.
  it('has no production reader: its only use deletes a removed person’s rows', () => {
    expect(personIdUses()).toEqual([
      'libs/wbs/adapters/store-sqlite/src/directory.ts: tx.delete(externalIdentity).where(eq(externalIdentity.personId, personId)).run();',
    ]);
  });
});
