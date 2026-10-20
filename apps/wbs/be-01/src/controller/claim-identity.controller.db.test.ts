import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { JwksTokenVerifier } from '@wbs/auth';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

const APP_ROOT = dirname(fileURLToPath(new URL('../../package.json', import.meta.url)));
const ISSUER = 'https://idp.test';
const AUDIENCE = 'api://wbs';
const FLEET = 'claire-m2m@clients';

let signing: CryptoKeyPair;
let jwks: ReturnType<typeof Bun.serve>;
let h: OrganizationHarness;
let projectId: string;
let leaf: string;

beforeAll(async () => {
  signing = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(signing.publicKey);
  jwks = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      Response.json({ keys: [{ ...publicJwk, alg: 'RS256', kid: 'claims', use: 'sig' }] }),
  });
});

afterAll(async () => {
  await jwks.stop(true);
});

/**
 * `person_not_bound` and `credential_not_for_person` (`wbs-team-claims` task
 * 2.3, D5, D6) over be-01's production composition and real SQLite: the claim
 * reads `person.account_id` and the request credential's
 * `external_identity.person_id`, and an organization admin bypasses the first.
 */
beforeEach(async () => {
  h = OrganizationHarness.openComposedWith({
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
  for (const username of ['dany', 'mem', 'kat']) await h.register(username);
  h.organization('org-a');
  h.member('org-a', 'dany', 'admin');
  h.member('org-a', 'mem', 'member');
  h.member('org-a', 'kat', 'member');
  for (const username of ['dany', 'mem', 'kat']) h.bind(username, 'org-a');
  h.activate();
  const created = await h.call('dany', 'POST', '/api/projects', { name: 'Claims' });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  projectId = (created.body as { project: { id: string } }).project.id;
  const rows = await h.call('dany', 'POST', `/api/projects/${projectId}/commands`, {
    commands: [{ kind: 'createWorkItem', parentId: null, name: 'Leaf' }],
  });
  if (rows.status !== 200) throw new Error(`leaf refused: ${JSON.stringify(rows)}`);
  leaf = (rows.body as { results: { id: string }[] }).results[0]?.id ?? '';
  for (const [id, account] of [
    ['claire', h.userId('mem')],
    ['codex', h.userId('mem')],
    ['kats-agent', h.userId('kat')],
    ['loose', null],
  ] as const) {
    h.sqlite.run('INSERT INTO person (id, name, kind, account_id) VALUES (?, ?, ?, ?)', [
      id,
      `root-${id}`,
      'agent',
      account,
    ]);
    h.sqlite.run(
      'INSERT INTO person_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
      [id, 'org-a', id],
    );
  }
});

afterEach(() => {
  h.close();
});

function batch(username: string, commands: unknown[]): Promise<Answer> {
  return h.call(username, 'POST', `/api/projects/${projectId}/commands`, { commands });
}

const claim = (personId: string) => ({ kind: 'claimWorkItem', workItemId: leaf, personId });

/** A machine token for the fleet pair: no groups claim and no email, as Auth0 issues one. */
function machineToken(): Promise<string> {
  const seconds = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'claims' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(FLEET)
    .setJti(crypto.randomUUID())
    .setIssuedAt(seconds)
    .setExpirationTime(seconds + 300)
    .sign(signing.privateKey);
}

async function linkFleet(person: string): Promise<void> {
  const child = Bun.spawn(
    [
      process.execPath,
      'run',
      join(APP_ROOT, 'src', 'link-credential-cli.ts'),
      `--issuer=${ISSUER}`,
      `--subject=${FLEET}`,
      '--account=mem',
      `--person=${person}`,
    ],
    {
      cwd: APP_ROOT,
      env: { ...process.env, DB_PATH: h.databasePath() },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  if ((await child.exited) !== 0) throw new Error('the fleet credential did not link');
}

function claimsOf(personId: string): number {
  return (
    h.sqlite
      .query<{ n: number }, [string]>('SELECT count(*) AS n FROM claim WHERE person_id = ?')
      .get(personId)?.n ?? -1
  );
}

const refused = (error: string) => ({
  status: 403,
  body: { error, at: 0, kind: 'claimWorkItem' },
});

describe('who may claim as a person', () => {
  // Proof: `ClaimRepository.boundAccountOf` answering null (slice 1's interim
  // port) made this answer 403 person_not_bound (watched 2026-10-20).
  it('accepts a member claiming as a person bound to their own account', async () => {
    expect((await batch('mem', [claim('claire')])).status).toBe(200);
    expect(claimsOf('claire')).toBeGreaterThan(0);
  });

  it('refuses a member claiming as a person bound to another account', async () => {
    expect(await batch('mem', [claim('kats-agent')])).toEqual(refused('person_not_bound'));
    expect(claimsOf('kats-agent')).toBe(0);
  });

  it('refuses a member claiming as a person bound to nobody', async () => {
    expect(await batch('mem', [claim('loose')])).toEqual(refused('person_not_bound'));
    expect(claimsOf('loose')).toBe(0);
  });

  // Proof: `isClaimAdmin` answering false made both admin cases answer 403
  // person_not_bound (watched 2026-10-20).
  it('lets an admin claim as a person bound to nobody', async () => {
    expect((await batch('dany', [claim('loose')])).status).toBe(200);
    expect(claimsOf('loose')).toBeGreaterThan(0);
  });

  it('lets an admin claim as a person bound to another account', async () => {
    expect((await batch('dany', [claim('kats-agent')])).status).toBe(200);
    expect(claimsOf('kats-agent')).toBeGreaterThan(0);
  });

  it('refuses a member releasing a person bound to another account', async () => {
    expect((await batch('kat', [claim('kats-agent')])).status).toBe(200);
    expect(
      await batch('mem', [{ kind: 'releaseWorkItem', workItemId: leaf, personId: 'kats-agent' }]),
    ).toEqual({
      status: 403,
      body: { error: 'person_not_bound', at: 0, kind: 'releaseWorkItem' },
    });
    expect(claimsOf('kats-agent')).toBeGreaterThan(0);
  });
});

describe('a refused claim names its holder', () => {
  it("names the holder by the organization's name, not the root name", async () => {
    expect((await batch('mem', [claim('claire')])).status).toBe(200);
    const lost = await batch('kat', [claim('kats-agent')]);
    expect(lost.status).toBe(409);
    const { error, holders } = lost.body as {
      error: string;
      holders: { personId: string; name: string }[];
    };
    expect(error).toBe('already_claimed');
    expect(holders.length).toBeGreaterThan(0);
    expect(holders.map(({ personId, name }) => [personId, name])).toEqual(
      holders.map(() => ['claire', 'claire']),
    );
  });
});

describe('a credential pinned to one person', () => {
  // Proof: `runCommandBatch` passing a null credential (no pin read) made the
  // claim as `codex` answer 200 (watched 2026-10-20).
  it('claims as its person and is refused as any other of its account’s persons', async () => {
    await linkFleet('claire');
    const token = await machineToken();

    expect(
      await h.callWith(
        token,
        'POST',
        `/api/projects/${projectId}/commands`,
        { commands: [claim('codex')] },
        { 'X-WBS-Expected-Organization': 'org-a' },
      ),
    ).toEqual(refused('credential_not_for_person'));
    expect(claimsOf('codex')).toBe(0);
    const own = await h.callWith(
      token,
      'POST',
      `/api/projects/${projectId}/commands`,
      { commands: [claim('claire')] },
      { 'X-WBS-Expected-Organization': 'org-a' },
    );
    expect(own.status).toBe(200);
    expect(claimsOf('claire')).toBeGreaterThan(0);
  });

  // Proof: with `parentChain.some(...)` in decideClaim's pin check answering
  // false, the delegated claim as `codex` answered 403
  // credential_not_for_person; watched 2026-10-20.
  it('delegates under its own person’s subtree claim, and only there', async () => {
    await linkFleet('claire');
    const token = await machineToken();
    const asFleet = (commands: unknown[]) =>
      h.callWith(
        token,
        'POST',
        `/api/projects/${projectId}/commands`,
        { commands },
        { 'X-WBS-Expected-Organization': 'org-a' },
      );
    const created = await batch('dany', [
      { kind: 'createWorkItem', parentId: leaf, afterId: null, name: 'Under' },
    ]);
    if (created.status !== 200) throw new Error(`child refused: ${JSON.stringify(created)}`);
    const under = (created.body as { results: { id: string }[] }).results[0]?.id ?? '';
    expect((await asFleet([claim('claire')])).status).toBe(200);
    const parentClaim = h.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM claim WHERE work_item_id = ?')
      .get(leaf)?.id;
    expect(parentClaim).toBeDefined();
    const delegated = { kind: 'claimWorkItem', workItemId: under, personId: 'codex' };
    expect(await asFleet([delegated])).toEqual(refused('credential_not_for_person'));
    expect(claimsOf('codex')).toBe(0);
    expect((await asFleet([{ ...delegated, parentClaim }])).status).toBe(200);
    expect(claimsOf('codex')).toBeGreaterThan(0);
  });

  it('leaves the account’s own session unpinned', async () => {
    await linkFleet('claire');
    expect((await batch('mem', [claim('codex')])).status).toBe(200);
  });
});
