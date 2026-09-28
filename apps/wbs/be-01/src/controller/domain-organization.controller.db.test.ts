import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { generateKeyPair, SignJWT } from 'jose';

import { DELEGATION_TOKEN_TYPE } from '../runtime/delegation';
import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;
let policyDirectory: string | undefined;
let dnsRecords: readonly string[] | Error | 'hang' = new Error('DNS unavailable');
let beforeDnsReply: (() => void) | undefined;
let dnsBarrier: Promise<void> | undefined;
const assetSource = new URL('../../../../../libs/wbs/domain/domain/src/', import.meta.url);

function copyPolicy(): string {
  const directory = mkdtempSync(join(tmpdir(), 'domain-policy-mounted-'));
  for (const file of ['public-email-policy.v1.json', 'public-email-policy.manifest.json'])
    copyFileSync(new URL(file, assetSource), join(directory, file));
  policyDirectory = directory;
  return directory;
}

function pinAsset(directory: string, content: string): void {
  const manifestPath = join(directory, 'public-email-policy.manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { sha256: string };
  manifest.sha256 = createHash('sha256').update(content).digest('hex');
  writeFileSync(manifestPath, JSON.stringify(manifest));
}

beforeEach(async () => {
  dnsRecords = new Error('DNS unavailable');
  beforeDnsReply = undefined;
  dnsBarrier = undefined;
  harness = OrganizationHarness.open(undefined, copyPolicy(), {
    lookupTxt: async () => {
      beforeDnsReply?.();
      await dnsBarrier;
      if (dnsRecords === 'hang') return Promise.withResolvers<readonly string[]>().promise;
      if (dnsRecords instanceof Error) throw dnsRecords;
      return dnsRecords;
    },
  });
  await harness.register('owner');
  await harness.register('member');
  harness.organization('org-a');
  harness.member('org-a', 'owner', 'super_admin');
  harness.member('org-a', 'member', 'member');
  harness.bind('owner', 'org-a');
  harness.bind('member', 'org-a');
});
afterEach(() => {
  harness.close();
  if (policyDirectory !== undefined) rmSync(policyDirectory, { recursive: true, force: true });
  policyDirectory = undefined;
});

const path = '/api/organization/domains/challenges';

describe('mounted organization domain challenges', () => {
  it('surfaces corrupt pending proof fields as a server error', async () => {
    harness.activate();
    const issued = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
    };
    harness.sqlite.run(
      'UPDATE organization_domain_claim SET challenge_digest = NULL, challenge_expires_at = NULL WHERE id = ?',
      [issued.id],
    );
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`),
    ).toEqual({ status: 500, body: 'Internal Server Error' });
  });
  it('verifies only an exact current TXT value and retains its digest', async () => {
    harness.activate();
    const issued = await harness.call('owner', 'POST', path, { domain: 'example.org' });
    const claim = issued.body as { id: string; dnsValue: string };
    dnsRecords = [`${claim.dnsValue}extra`];
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${claim.id}/verify`),
    ).toEqual({ status: 409, body: { error: 'proof_mismatch' } });
    dnsRecords = [claim.dnsValue];
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${claim.id}/verify`),
    ).toEqual({ status: 200, body: { id: claim.id, status: 'verified' } });
    expect(
      harness.sqlite
        .query(
          'SELECT status, proof_digest, challenge_digest FROM organization_domain_claim WHERE id = ?',
        )
        .get(claim.id),
    ).toEqual({
      status: 'verified',
      proof_digest: createHash('sha256').update(claim.dnsValue).digest('hex'),
      challenge_digest: null,
    });
  });

  it('refuses a reissued challenge whose old proof arrived during DNS lookup', async () => {
    harness.activate();
    const issued = await harness.call('owner', 'POST', path, { domain: 'example.org' });
    const claim = issued.body as { id: string; dnsValue: string };
    dnsRecords = [claim.dnsValue];
    beforeDnsReply = () => {
      beforeDnsReply = undefined;
      harness.sqlite.run('UPDATE organization_domain_claim SET challenge_digest = ? WHERE id = ?', [
        'changed',
        claim.id,
      ]);
    };
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${claim.id}/verify`),
    ).toEqual({ status: 409, body: { error: 'stale' } });
  });

  it('refuses a claim whose domain changes during DNS lookup', async () => {
    harness.activate();
    const issued = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
      dnsValue: string;
    };
    dnsRecords = [issued.dnsValue];
    beforeDnsReply = () => {
      beforeDnsReply = undefined;
      harness.sqlite.run('UPDATE organization_domain_claim SET domain = ? WHERE id = ?', [
        'changed.example.org',
        issued.id,
      ]);
    };
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`),
    ).toEqual({ status: 409, body: { error: 'stale' } });
  });

  it('rechecks challenge expiry and maintained policy after DNS lookup', async () => {
    harness.activate();
    const issued = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
      dnsValue: string;
    };
    dnsRecords = [issued.dnsValue];
    harness.sqlite.run(
      'UPDATE organization_domain_claim SET challenge_expires_at = ? WHERE id = ?',
      [Date.now() + 1_000, issued.id],
    );
    beforeDnsReply = () => {
      beforeDnsReply = undefined;
      Bun.sleepSync(1_200);
    };
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`),
    ).toEqual({ status: 409, body: { error: 'stale' } });
    harness.sqlite.run(
      'UPDATE organization_domain_claim SET challenge_expires_at = ? WHERE id = ?',
      [Date.now() + 60_000, issued.id],
    );
    const directory = policyDirectory;
    if (directory === undefined) throw new Error('policy fixture missing');
    beforeDnsReply = () => {
      beforeDnsReply = undefined;
      const asset = join(directory, 'public-email-policy.v1.json');
      const content = readFileSync(asset, 'utf8').replace('"co.jp",', '"example.org", "co.jp",');
      writeFileSync(asset, content);
      pinAsset(directory, content);
    };
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`),
    ).toEqual({ status: 409, body: { error: 'stale' } });
  });

  it('refuses an old token, an expired challenge and a foreign claim id', async () => {
    harness.organization('org-b');
    harness.member('org-b', 'owner', 'super_admin');
    harness.activate();
    const first = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
      dnsValue: string;
    };
    await harness.call('owner', 'POST', path, { domain: 'example.org' });
    dnsRecords = [first.dnsValue];
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${first.id}/verify`),
    ).toEqual({ status: 409, body: { error: 'proof_mismatch' } });
    harness.sqlite.run(
      'UPDATE organization_domain_claim SET challenge_expires_at = 1 WHERE id = ?',
      [first.id],
    );
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${first.id}/verify`),
    ).toEqual({ status: 409, body: { error: 'stale' } });
    harness.bind('owner', 'org-b');
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${first.id}/verify`),
    ).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(await harness.call('owner', 'POST', '/api/organization/domains/missing/verify')).toEqual(
      { status: 404, body: { error: 'not_found' } },
    );
  });

  it('lets only one pending organization become the verified owner', async () => {
    harness.organization('org-b');
    harness.member('org-b', 'owner', 'super_admin');
    harness.activate();
    const first = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
      dnsValue: string;
    };
    harness.bind('owner', 'org-b');
    const second = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
      dnsValue: string;
    };
    dnsRecords = [first.dnsValue, second.dnsValue];
    expect(
      (await harness.call('owner', 'POST', `/api/organization/domains/${second.id}/verify`)).status,
    ).toBe(200);
    harness.bind('owner', 'org-a');
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${first.id}/verify`),
    ).toEqual({ status: 409, body: { error: 'domain_taken' } });
  });

  it('settles concurrent DNS lookups with one owner and an untouched losing proof', async () => {
    await harness.register('owner-b');
    harness.organization('org-b');
    harness.member('org-b', 'owner-b', 'super_admin');
    harness.bind('owner-b', 'org-b');
    harness.activate();
    const first = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
      dnsValue: string;
    };
    const second = (await harness.call('owner-b', 'POST', path, { domain: 'example.org' }))
      .body as {
      id: string;
      dnsValue: string;
    };
    dnsRecords = [first.dnsValue, second.dnsValue];
    const bothLooking = Promise.withResolvers<undefined>();
    const releaseDns = Promise.withResolvers<undefined>();
    dnsBarrier = releaseDns.promise;
    let lookups = 0;
    beforeDnsReply = () => {
      lookups += 1;
      if (lookups === 2) bothLooking.resolve(undefined);
    };
    const answers = [
      harness.call('owner', 'POST', `/api/organization/domains/${first.id}/verify`),
      harness.call('owner-b', 'POST', `/api/organization/domains/${second.id}/verify`),
    ];
    await bothLooking.promise;
    releaseDns.resolve(undefined);
    const settled = await Promise.all(answers);
    expect(settled.map((answer) => answer.status).sort()).toEqual([200, 409]);
    const loser = settled[0]?.status === 409 ? first : second;
    expect(
      harness.sqlite
        .query(
          'SELECT status, challenge_digest, proof_digest FROM organization_domain_claim WHERE id = ?',
        )
        .get(loser.id),
    ).toEqual({
      status: 'pending',
      challenge_digest: createHash('sha256').update(loser.dnsValue).digest('hex'),
      proof_digest: null,
    });
  });

  it('refuses malformed and timed-out resolver answers', async () => {
    harness.activate();
    const issued = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
    };
    // The test deliberately violates the resolver's trusted return contract.
    dnsRecords = [42] as unknown as readonly string[];
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`),
    ).toEqual({ status: 503, body: { error: 'dns_unavailable' } });
    dnsRecords = 'hang';
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`),
    ).toEqual({ status: 503, body: { error: 'dns_unavailable' } });
    expect(
      harness.sqlite
        .query('SELECT status FROM organization_domain_claim WHERE id = ?')
        .get(issued.id),
    ).toEqual({ status: 'pending' });
  });

  it('rechecks current super-admin authority after the lookup', async () => {
    harness.activate();
    const issued = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
      dnsValue: string;
    };
    dnsRecords = [issued.dnsValue];
    beforeDnsReply = () => {
      beforeDnsReply = undefined;
      harness.sqlite.run(
        "UPDATE organization_membership SET role = 'member' WHERE organization_id = 'org-a' AND user_id = ?",
        [harness.userId('owner')],
      );
    };
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`),
    ).toEqual({ status: 403, body: { error: 'forbidden' } });
  });

  it('refuses verification when authoritative DNS is unavailable without promoting the claim', async () => {
    harness.activate();
    const issued = await harness.call('owner', 'POST', path, { domain: 'example.org' });
    expect(issued.status).toBe(201);
    expect(
      await harness.call(
        'owner',
        'POST',
        `/api/organization/domains/${(issued.body as { id: string }).id}/verify`,
      ),
    ).toEqual({
      status: 503,
      body: { error: 'dns_unavailable' },
    });
    expect(
      harness.sqlite
        .query("SELECT status FROM organization_domain_claim WHERE domain = 'example.org'")
        .get(),
    ).toEqual({ status: 'pending' });
  });
  it('is inert until activation and requires current super-admin authority', async () => {
    expect((await harness.callWith('none', 'POST', path, { domain: 'example.org' })).status).toBe(
      401,
    );
    expect((await harness.call('owner', 'POST', path, { domain: 'example.org' })).status).toBe(403);
    harness.activate();
    expect((await harness.call('member', 'POST', path, { domain: 'example.org' })).status).toBe(
      403,
    );
    expect((await harness.call('member', 'GET', '/api/organization/domains')).status).toBe(403);
    harness.sqlite.run("UPDATE organization_membership SET role = 'member' WHERE user_id = ?", [
      harness.userId('owner'),
    ]);
    expect((await harness.call('owner', 'POST', path, { domain: 'example.org' })).status).toBe(403);
    harness.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [
      harness.userId('member'),
    ]);
    expect((await harness.call('member', 'GET', '/api/organization/domains')).status).toBe(403);
  });

  it('rechecks super-admin authority after request access resolves', async () => {
    let demote = false;
    const contender = OrganizationHarness.openComposed(false, () => {
      if (!demote) return;
      demote = false;
      contender.sqlite.run("UPDATE organization_membership SET role = 'member' WHERE user_id = ?", [
        contender.userId('late-owner'),
      ]);
    });
    try {
      await contender.register('late-owner');
      contender.organization('late-org');
      contender.member('late-org', 'late-owner', 'super_admin');
      contender.bind('late-owner', 'late-org');
      contender.activate();
      demote = true;
      expect(await contender.call('late-owner', 'POST', path, { domain: 'example.org' })).toEqual({
        status: 403,
        body: { error: 'forbidden' },
      });
      contender.sqlite.run(
        "UPDATE organization_membership SET role = 'super_admin' WHERE user_id = ?",
        [contender.userId('late-owner')],
      );
      demote = true;
      expect(await contender.call('late-owner', 'GET', '/api/organization/domains')).toEqual({
        status: 403,
        body: { error: 'forbidden' },
      });
      expect(contender.sqlite.query('SELECT id FROM organization_domain_claim').all()).toEqual([]);
    } finally {
      contender.close();
    }
  });

  it('refuses a delegated caller even with current super-admin membership', async () => {
    const keys = await generateKeyPair('RS256');
    let dnsValue = '';
    const delegated = OrganizationHarness.open(keys.publicKey, undefined, {
      lookupTxt: () => Promise.resolve([dnsValue]),
    });
    try {
      await delegated.register('delegated-owner');
      delegated.organization('delegated-org');
      delegated.member('delegated-org', 'delegated-owner', 'super_admin');
      delegated.bind('delegated-owner', 'delegated-org');
      delegated.sqlite.run(
        'INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES (?, ?, ?, ?, 1)',
        ['delegated-map', delegated.userId('delegated-owner'), 'https://idp.test', 'delegated-sub'],
      );
      delegated.activate();
      const issued = await delegated.call('delegated-owner', 'POST', path, {
        domain: 'example.org',
      });
      expect(issued.status).toBe(201);
      const claim = issued.body as { id: string; dnsValue: string };
      dnsValue = claim.dnsValue;
      const token = async () =>
        new SignJWT({
          username: 'delegated-owner',
          org: 'delegated-org',
          client: 'client-1',
          grant: 'family-1',
          scope: 'read write',
          upstream_iss: 'https://idp.test',
          upstream_sub: 'delegated-sub',
        })
          .setProtectedHeader({ alg: 'RS256', typ: DELEGATION_TOKEN_TYPE })
          .setIssuer('wbs')
          .setSubject(delegated.userId('delegated-owner'))
          .setAudience('wbs-be-01/via-mcp-01')
          .setJti(crypto.randomUUID())
          .setIssuedAt()
          .setExpirationTime('2m')
          .sign(keys.privateKey);
      expect(
        await delegated.callWith(await token(), 'POST', path, { domain: 'example.org' }),
      ).toEqual({ status: 403, body: { error: 'insufficient_scope' } });
      expect(await delegated.callWith(await token(), 'GET', '/api/organization/domains')).toEqual({
        status: 403,
        body: { error: 'insufficient_scope' },
      });
      expect(
        await delegated.callWith(
          await token(),
          'POST',
          `/api/organization/domains/${claim.id}/verify`,
        ),
      ).toEqual({ status: 403, body: { error: 'insufficient_scope' } });
    } finally {
      delegated.close();
    }
  });

  it('canonicalizes exact IDNA names and refuses malformed, provider, relay and suffix domains', async () => {
    harness.activate();
    for (const domain of [
      '127.0.0.1',
      'http://example.org',
      'exa mple.org',
      'example.com\\evil.com',
      '%65xample.com',
    ])
      expect(await harness.call('owner', 'POST', path, { domain })).toEqual({
        status: 400,
        body: { error: 'invalid_domain' },
      });
    for (const domain of ['gmail.com', 'privaterelay.appleid.com', 'co.uk', 'co.in', 'appspot.com'])
      expect(await harness.call('owner', 'POST', path, { domain })).toEqual({
        status: 409,
        body: { error: 'unclaimable' },
      });
    const issued = await harness.call('owner', 'POST', path, { domain: 'BÜCHER.DE' });
    expect(issued.status).toBe(201);
    expect(issued.body).toMatchObject({
      domain: 'xn--bcher-kva.de',
      dnsName: '_wbs-verification.xn--bcher-kva.de',
    });
  });

  it('refuses a domain whose complete TXT challenge hostname exceeds DNS length', async () => {
    harness.activate();
    const domain = `${'a'.repeat(57)}.${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(60)}.com`;
    expect(domain).toHaveLength(244);
    expect(await harness.call('owner', 'POST', path, { domain })).toEqual({
      status: 400,
      body: { error: 'invalid_domain' },
    });
    expect(harness.sqlite.query('SELECT id FROM organization_domain_claim').all()).toEqual([]);
  });

  it('honors a checked suffix override beyond the pinned PSL', async () => {
    harness.activate();
    const directory = policyDirectory;
    if (directory === undefined) throw new Error('policy fixture missing');
    const asset = join(directory, 'public-email-policy.v1.json');
    const content = readFileSync(asset, 'utf8').replace(
      '"co.jp",',
      '"shared-mail.example.org", "co.jp",',
    );
    writeFileSync(asset, content);
    pinAsset(directory, content);
    expect(
      await harness.call('owner', 'POST', path, { domain: 'shared-mail.example.org' }),
    ).toEqual({ status: 409, body: { error: 'unclaimable' } });
  });

  it('reissues one pending row and invalidates the old digest', async () => {
    harness.activate();
    const before = Date.now();
    const first = await harness.call('owner', 'POST', path, { domain: 'example.org' });
    const after = Date.now();
    const second = await harness.call('owner', 'POST', path, { domain: 'example.org' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const claims = harness.sqlite
      .query(
        "SELECT id, challenge_digest FROM organization_domain_claim WHERE domain = 'example.org'",
      )
      .all();
    expect(claims).toHaveLength(1);
    expect((claims[0] as { challenge_digest: string }).challenge_digest).toBe(
      createHash('sha256')
        .update((second.body as { dnsValue: string }).dnsValue)
        .digest('hex'),
    );
    expect(first.body).toMatchObject({ id: (second.body as { id: string }).id });
    expect((first.body as { dnsValue: string }).dnsValue).not.toBe(
      (second.body as { dnsValue: string }).dnsValue,
    );
    const challenge = first.body as { dnsValue: string; expiresAt: number };
    expect(challenge.dnsValue).toMatch(/^wbs-domain-verification=org-a:example\.org:[a-f0-9]{64}$/);
    expect(challenge.expiresAt).toBeGreaterThanOrEqual(before + 86_400_000);
    expect(challenge.expiresAt).toBeLessThanOrEqual(after + 86_400_000);
    expect((await harness.call('owner', 'GET', '/api/organization/domains')).status).toBe(200);
  });

  it('lists only the active organization and never a foreign challenge', async () => {
    harness.organization('org-b');
    harness.member('org-b', 'owner', 'super_admin');
    harness.activate();
    harness.sqlite.run(
      "INSERT INTO organization_domain_claim (id, organization_id, domain, status, challenge_digest, challenge_expires_at, created_at) VALUES ('foreign', 'org-b', 'example.org', 'pending', 'foreign-digest', 99999999, 1)",
    );
    expect((await harness.call('owner', 'POST', path, { domain: 'example.org' })).status).toBe(201);
    expect(
      harness.sqlite
        .query("SELECT challenge_digest FROM organization_domain_claim WHERE id = 'foreign'")
        .get(),
    ).toEqual({ challenge_digest: 'foreign-digest' });
    const listing = await harness.call('owner', 'GET', '/api/organization/domains');
    expect(listing.status).toBe(200);
    expect(
      (listing.body as { domains: { domain: string }[] }).domains.map((claim) => claim.domain),
    ).toEqual(['example.org']);
  });

  it('throws through the mounted route for missing, malformed and checksum-invalid policy', async () => {
    harness.activate();
    const directory = policyDirectory;
    if (directory === undefined) throw new Error('policy fixture missing');
    const asset = join(directory, 'public-email-policy.v1.json');
    const original = readFileSync(asset);
    rmSync(asset);
    expect((await harness.call('owner', 'POST', path, { domain: 'example.org' })).status).toBe(500);
    mkdirSync(asset);
    expect((await harness.call('owner', 'POST', path, { domain: 'example.org' })).status).toBe(500);
    rmSync(asset, { recursive: true });
    writeFileSync(asset, '{');
    pinAsset(directory, '{');
    expect((await harness.call('owner', 'POST', path, { domain: 'example.org' })).status).toBe(500);
    pinAsset(directory, original.toString('utf8'));
    writeFileSync(asset, original.toString('utf8').replace('gmail.com', 'gmaix.com'));
    expect((await harness.call('owner', 'POST', path, { domain: 'example.org' })).status).toBe(500);
    expect(harness.sqlite.query('SELECT id FROM organization_domain_claim').all()).toEqual([]);
  });
});
