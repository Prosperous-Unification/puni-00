import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { JwksTokenVerifier } from '@wbs/auth';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import { OrganizationHarness } from '../testing/organization-harness';

const APP_ROOT = dirname(fileURLToPath(new URL('../../package.json', import.meta.url)));
const ISSUER = 'https://idp.test';
const AUDIENCE = 'api://wbs';
const FLEET = 'claire-m2m@clients';

let signing: CryptoKeyPair;
let jwks: ReturnType<typeof Bun.serve>;
let h: OrganizationHarness;
let projectId: string;

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
 * A fleet credential linked by `link-credential-cli.ts` (`wbs-team-claims` D6
 * and D6b, spec `fleet-credentials`): a verified upstream token for the linked
 * `(issuer, subject)` acts as the linked account and writes nothing to it; one
 * without a groups claim is scoped from the account's memberships, and refused
 * `unknown_identity` when nothing is linked, minting no account.
 */
beforeEach(async () => {
  h = OrganizationHarness.open({
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
  projectId = (created.body as { project: { id: string } }).project.id;
  h.sqlite.run(
    "INSERT INTO person (id, name, kind, account_id) VALUES ('claire', 'Claire', 'agent', ?), ('mem-agent', 'Mem agent', 'agent', ?)",
    [h.userId('dany'), h.userId('mem')],
  );
});

afterEach(() => {
  h.close();
});

/**
 * An access token for `subject`, with no email. `groups` adds `wbs_groups` as a
 * browser token carries it; a real Auth0 machine-to-machine token carries none
 * (slice 0), which is the default here.
 */
function token(subject: string, groups = false): Promise<string> {
  const seconds = Math.floor(Date.now() / 1000);
  return new SignJWT(groups ? { wbs_groups: ['dev:wbs:read', 'dev:wbs:write'] } : {})
    .setProtectedHeader({ alg: 'RS256', kid: 'fleet' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(subject)
    .setJti(crypto.randomUUID())
    .setIssuedAt(seconds)
    .setExpirationTime(seconds + 300)
    .sign(signing.privateKey);
}

async function linkCli(...args: string[]): Promise<number> {
  const child = Bun.spawn(
    [process.execPath, 'run', join(APP_ROOT, 'src', 'link-credential-cli.ts'), ...args],
    {
      cwd: APP_ROOT,
      env: { ...process.env, DB_PATH: h.databasePath() },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  return child.exited;
}

const link = (account: string, person: string) =>
  linkCli(`--issuer=${ISSUER}`, `--subject=${FLEET}`, `--account=${account}`, `--person=${person}`);

function as(bearer: string, method: string, path: string, body?: unknown) {
  return h.callWith(bearer, method, path, body, { 'X-WBS-Expected-Organization': 'org-a' });
}

function usersTable(): unknown[] {
  return h.sqlite.query('SELECT * FROM users ORDER BY id').all();
}

describe('a linked fleet credential', () => {
  it('leaves the owner’s row byte for byte under a linked machine token', async () => {
    expect(await link('dany', 'claire')).toBe(0);
    const before = usersTable();

    for (const groups of [true, false]) {
      const answer = await as(await token(FLEET, groups), 'GET', '/api/projects');
      expect(answer.status).toBe(200);
      expect(JSON.stringify(answer.body)).toContain('Fleet plan');
    }
    expect(usersTable()).toEqual(before);
  }, 30_000);

  it('refuses an unlinked machine token as unknown_identity, minting no account', async () => {
    const before = usersTable();
    expect(await as(await token(FLEET), 'GET', '/api/projects')).toEqual({
      status: 401,
      body: { error: 'unknown_identity' },
    });
    expect(usersTable()).toEqual(before);
  }, 30_000);

  it('ends at --unlink: unknown_identity, no new account, and the pair links again', async () => {
    expect(await link('dany', 'claire')).toBe(0);
    expect(await linkCli('--unlink', `--issuer=${ISSUER}`, `--subject=${FLEET}`)).toBe(0);
    const before = usersTable();

    expect(await as(await token(FLEET), 'GET', '/api/projects')).toEqual({
      status: 401,
      body: { error: 'unknown_identity' },
    });
    expect(usersTable()).toEqual(before);
    const own = await h.call('dany', 'GET', '/api/projects');
    expect(own.status).toBe(200);
    expect(await link('dany', 'claire')).toBe(0);
  }, 30_000);

  // Proof: `scopesOfRoles` answering [] for every role made the member's read
  // answer 403 insufficient_scope (watched 2026-10-20).
  it('scopes a linked token without groups from its account’s membership: a member', async () => {
    expect(await link('mem', 'mem-agent')).toBe(0);
    const bearer = await token(FLEET);

    const read = await as(bearer, 'GET', '/api/projects');
    expect(read.status).toBe(200);
    expect(JSON.stringify(read.body)).toContain('Fleet plan');
    const write = await as(bearer, 'PATCH', `/api/projects/${projectId}`, {
      name: 'Renamed by the fleet',
    });
    expect(write.status).toBe(200);
    expect(await as(bearer, 'PATCH', '/api/organization', { sharedPeople: true })).toMatchObject({
      status: 403,
    });
  }, 30_000);
});
