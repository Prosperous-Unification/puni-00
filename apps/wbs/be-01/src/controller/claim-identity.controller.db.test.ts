import { JwksTokenVerifier } from '@wbs/auth';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { exportJWK, generateKeyPair } from 'jose';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

const ISSUER = 'https://idp.test';
const AUDIENCE = 'api://wbs';

let signing: CryptoKeyPair;
let jwks: ReturnType<typeof Bun.serve>;
let h: OrganizationHarness;
let projectId: string;
let leaf: string;
let firstStep: string;

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
 * `person_not_bound` (`wbs-team-claims` task 2.3, D5) over be-01's production
 * composition and real SQLite: the claim reads `person.account_id`, and an
 * organization admin bypasses it. A credential pinned to one person
 * (`credential_not_for_person`) is a machine credential's, tested in
 * `machine-credential.controller.db.test.ts`.
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
  const step = h.sqlite
    .query<{ id: string }, [string]>(
      'SELECT id FROM step WHERE project_id = ? ORDER BY position LIMIT 1',
    )
    .get(projectId);
  if (step === null) throw new Error('claim identity project has no first step');
  firstStep = step.id;
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

// Identity admission claims the first runnable step; later unstarted workflow steps need Dev completion.
const claim = (personId: string) => ({
  kind: 'claimWorkItem',
  workItemId: leaf,
  personId,
  steps: [firstStep],
});

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

describe('a move under a claimed leaf', () => {
  // Proof: with the `destination_claimed` arm removed from the 409 response
  // schema, this answered 500; watched 2026-10-20.
  it('answers 409 destination_claimed naming the holder by the organization’s name', async () => {
    expect((await batch('mem', [claim('claire')])).status).toBe(200);
    const other = await batch('dany', [
      { kind: 'createWorkItem', parentId: null, afterId: leaf, name: 'Other' },
    ]);
    const otherId = (other.body as { results: { id: string }[] }).results[0]?.id ?? '';
    const moved = await batch('dany', [
      { kind: 'moveWorkItem', workItemId: otherId, parentId: leaf, afterId: null },
    ]);
    expect(moved.status).toBe(409);
    const { error, holders } = moved.body as {
      error: string;
      holders: { personId: string; name: string }[];
    };
    expect(error).toBe('destination_claimed');
    expect(holders.length).toBeGreaterThan(0);
    expect(holders.map(({ name }) => name)).toEqual(holders.map(() => 'claire'));
  });
});
