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
 * A fleet credential linked by `link-credential-cli.ts` (`wbs-team-claims`
 * D6, spec `fleet-credentials`): a verified upstream token for the linked
 * `(issuer, subject)` reaches the projects of the account's organizations
 * through the ordinary `resolveOidcIdentity` path, as that account.
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
  await h.register('dany');
  h.organization('org-a');
  h.member('org-a', 'dany', 'admin');
  h.bind('dany', 'org-a');
  h.activate();
  const created = await h.call('dany', 'POST', '/api/projects', { name: 'Fleet plan' });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  h.sqlite.run(
    "INSERT INTO person (id, name, kind, account_id) VALUES ('claire', 'Claire', 'agent', ?)",
    [h.userId('dany')],
  );
});

afterEach(() => {
  h.close();
});

/** A machine-to-machine access token for `subject`: no email, valid for five minutes. */
function machineToken(subject: string): Promise<string> {
  const seconds = Math.floor(Date.now() / 1000);
  return new SignJWT({ wbs_groups: ['dev:wbs:read', 'dev:wbs:write'] })
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

function projectsAs(token: string) {
  return h.callWith(token, 'GET', '/api/projects', undefined, {
    'X-WBS-Expected-Organization': 'org-a',
  });
}

function accountCount(): number {
  return h.sqlite.query<{ n: number }, []>('SELECT count(*) AS n FROM users').get()?.n ?? -1;
}

describe('a linked fleet credential', () => {
  it('reaches the account’s organization projects as that account', async () => {
    expect(
      await linkCli(
        `--issuer=${ISSUER}`,
        `--subject=${FLEET}`,
        '--account=dany',
        '--person=claire',
      ),
    ).toBe(0);
    const accounts = accountCount();

    const answer = await projectsAs(await machineToken(FLEET));
    expect(answer.status).toBe(200);
    expect(JSON.stringify(answer.body)).toContain('Fleet plan');
    // Resolved through the link: no account was minted for the machine.
    expect(accountCount()).toBe(accounts);
  }, 30_000);

  it('stops reaching them once unlinked, while the account’s own credential still works', async () => {
    expect(
      await linkCli(
        `--issuer=${ISSUER}`,
        `--subject=${FLEET}`,
        '--account=dany',
        '--person=claire',
      ),
    ).toBe(0);
    expect(await linkCli('--unlink', `--issuer=${ISSUER}`, `--subject=${FLEET}`)).toBe(0);

    const answer = await projectsAs(await machineToken(FLEET));
    expect(answer.status).not.toBe(200);
    expect(JSON.stringify(answer.body)).not.toContain('Fleet plan');
    const own = await h.call('dany', 'GET', '/api/projects');
    expect(own.status).toBe(200);
    expect(JSON.stringify(own.body)).toContain('Fleet plan');
  }, 30_000);
});
