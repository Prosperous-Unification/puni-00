import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
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

async function withShortDnsTimeout<T>(run: () => Promise<T>): Promise<T> {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  const requested: number[] = [];
  const timeoutSpy = spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
    requested.push(milliseconds);
    return timeout(1);
  });
  try {
    const answer = await run();
    expect(requested).toEqual([5_000]);
    return answer;
  } finally {
    timeoutSpy.mockRestore();
  }
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
  it('rotates an owned proof and accepts the old proof only during overlap', async () => {
    harness.activate();
    const issued = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
      dnsValue: string;
    };
    dnsRecords = [issued.dnsValue];
    expect(
      (await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`)).status,
    ).toBe(200);
    const rotated = await harness.call(
      'owner',
      'POST',
      `/api/organization/domains/${issued.id}/rotate`,
    );
    expect(rotated.status).toBe(201);
    const replacement = (rotated.body as { dnsValue: string }).dnsValue;
    expect(replacement).not.toBe(issued.dnsValue);
    const start = Date.now();
    harness.sqlite.run('UPDATE organization_domain_claim SET last_checked_at = ? WHERE id = ?', [
      start - 6 * 86_400_000 - 1,
      issued.id,
    ]);
    expect(await harness.checkDomains(start + 1 * 86_400_000 - 1)).toEqual({
      checked: 1,
      stale: 0,
    });
    expect(
      harness.sqlite
        .query('SELECT status FROM organization_domain_claim WHERE id = ?')
        .get(issued.id),
    ).toEqual({ status: 'verified' });
    expect(await harness.checkDomains(start + 8 * 86_400_000)).toEqual({ checked: 1, stale: 0 });
    expect(await harness.checkDomains(start + 15 * 86_400_000)).toEqual({ checked: 1, stale: 0 });
    expect(
      harness.sqlite
        .query('SELECT status FROM organization_domain_claim WHERE id = ?')
        .get(issued.id),
    ).toEqual({ status: 'suspended' });
  });

  it('suspends without releasing domain ownership or memberships', async () => {
    await harness.register('joiner');
    harness.sqlite.run('UPDATE users SET email = ?, email_verified = 1 WHERE id = ?', [
      'joiner@example.org',
      harness.userId('joiner'),
    ]);
    harness.activate();
    const issued = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
      dnsValue: string;
    };
    dnsRecords = [issued.dnsValue];
    expect(
      (await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`)).status,
    ).toBe(200);
    const start = Date.now();
    dnsRecords = [];
    await harness.checkDomains(start + 14 * 86_400_000);
    harness.organization('org-b');
    harness.member('org-b', 'owner', 'super_admin');
    harness.bind('owner', 'org-b');
    const contender = (await harness.call('owner', 'POST', path, { domain: 'example.org' }))
      .body as { id: string; dnsValue: string };
    dnsRecords = [contender.dnsValue];
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${contender.id}/verify`),
    ).toEqual({ status: 409, body: { error: 'domain_taken' } });
    expect(
      harness.sqlite
        .query('SELECT status, organization_id FROM organization_domain_claim WHERE id = ?')
        .get(issued.id),
    ).toEqual({ status: 'suspended', organization_id: 'org-a' });
    expect((await harness.call('joiner', 'GET', '/api/onboarding')).body).toEqual({
      state: 'create_organization',
    });
    expect(
      harness.sqlite
        .query(
          "SELECT count(*) AS count FROM organization_membership WHERE organization_id = 'org-a'",
        )
        .get(),
    ).toEqual({ count: 2 });
    expect(await harness.isVerifiedDomain('org-a', 'example.org')).toBe(false);
  });

  it('ends old-proof overlap when the replacement succeeds', async () => {
    harness.activate();
    const issued = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
      dnsValue: string;
    };
    dnsRecords = [issued.dnsValue];
    expect(
      (await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`)).status,
    ).toBe(200);
    const rotated = (
      await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/rotate`)
    ).body as { dnsValue: string };
    const at = Date.now();
    harness.sqlite.run('UPDATE organization_domain_claim SET last_checked_at = ? WHERE id = ?', [
      at - 7 * 86_400_000,
      issued.id,
    ]);
    dnsRecords = [issued.dnsValue, rotated.dnsValue];
    expect(await harness.checkDomains(at)).toEqual({ checked: 1, stale: 0 });
    expect(
      harness.sqlite
        .query(
          'SELECT previous_proof_digest, previous_proof_valid_until FROM organization_domain_claim WHERE id = ?',
        )
        .get(issued.id),
    ).toEqual({ previous_proof_digest: null, previous_proof_valid_until: null });
    dnsRecords = [issued.dnsValue];
    expect(await harness.checkDomains(at + 7 * 86_400_000)).toEqual({ checked: 1, stale: 0 });
    expect(
      harness.sqlite
        .query('SELECT last_success_at FROM organization_domain_claim WHERE id = ?')
        .get(issued.id),
    ).toEqual({ last_success_at: at });
  });

  it('confirms a rotated proof through verify before the overlap ends', async () => {
    harness.activate();
    const issued = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
      dnsValue: string;
    };
    dnsRecords = [issued.dnsValue];
    expect(
      (await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`)).status,
    ).toBe(200);
    const rotated = (
      await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/rotate`)
    ).body as { dnsValue: string };
    dnsRecords = [rotated.dnsValue];
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`),
    ).toEqual({ status: 200, body: { id: issued.id, status: 'verified' } });
    expect(
      harness.sqlite
        .query('SELECT previous_proof_digest FROM organization_domain_claim WHERE id = ?')
        .get(issued.id),
    ).toEqual({ previous_proof_digest: null });
  });

  it('refuses a rotated proof after the 24-hour confirmation window', async () => {
    harness.activate();
    const issued = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
      dnsValue: string;
    };
    dnsRecords = [issued.dnsValue];
    expect(
      (await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`)).status,
    ).toBe(200);
    const rotated = (
      await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/rotate`)
    ).body as { dnsValue: string };
    harness.sqlite.run(
      'UPDATE organization_domain_claim SET previous_proof_valid_until = 1 WHERE id = ?',
      [issued.id],
    );
    dnsRecords = [rotated.dnsValue];
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`),
    ).toEqual({ status: 409, body: { error: 'stale' } });
  });

  it('rechecks rotation snapshot after DNS lookup', async () => {
    harness.activate();
    const issued = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
      dnsValue: string;
    };
    dnsRecords = [issued.dnsValue];
    expect(
      (await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`)).status,
    ).toBe(200);
    const rotated = (
      await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/rotate`)
    ).body as { dnsValue: string };
    dnsRecords = [rotated.dnsValue];
    beforeDnsReply = () => {
      beforeDnsReply = undefined;
      harness.sqlite.run(
        'UPDATE organization_domain_claim SET previous_proof_valid_until = 1 WHERE id = ?',
        [issued.id],
      );
    };
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`),
    ).toEqual({ status: 409, body: { error: 'stale' } });
    expect(
      harness.sqlite
        .query('SELECT previous_proof_digest FROM organization_domain_claim WHERE id = ?')
        .get(issued.id),
    ).not.toEqual({ previous_proof_digest: null });
  });

  it('refuses rotation before activation and after super-admin demotion', async () => {
    const planted = 'owned';
    harness.sqlite.run(
      "INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, last_checked_at, created_at, updated_at) VALUES (?, 'org-a', 'example.org', 'verified', 'digest', 1, 1, 1, 1)",
      [planted],
    );
    const rotate = `/api/organization/domains/${planted}/rotate`;
    expect(await harness.rotateDomainClaim('org-a', harness.userId('owner'), planted)).toEqual({
      kind: 'inactive',
    });
    expect(await harness.call('owner', 'POST', rotate)).toEqual({
      status: 403,
      body: { error: 'no_active_organization' },
    });
    harness.activate();
    harness.sqlite.run(
      "UPDATE organization_membership SET role = 'member' WHERE organization_id = 'org-a' AND user_id = ?",
      [harness.userId('owner')],
    );
    expect(await harness.call('owner', 'POST', rotate)).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(
      harness.sqlite
        .query('SELECT proof_digest FROM organization_domain_claim WHERE id = ?')
        .get(planted),
    ).toEqual({ proof_digest: 'digest' });
  });

  it('refuses rotation of pending and foreign claims', async () => {
    harness.activate();
    const pending = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
    };
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${pending.id}/rotate`),
    ).toEqual({ status: 409, body: { error: 'stale' } });
    harness.organization('org-b');
    harness.member('org-b', 'owner', 'super_admin');
    harness.bind('owner', 'org-b');
    expect(
      await harness.call('owner', 'POST', `/api/organization/domains/${pending.id}/rotate`),
    ).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(await harness.call('owner', 'POST', '/api/organization/domains/missing/rotate')).toEqual(
      { status: 404, body: { error: 'not_found' } },
    );
  });
  it('shows retained proof check timestamps and a warning after a failed day-seven check', async () => {
    harness.activate();
    const issued = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
      dnsValue: string;
    };
    dnsRecords = [issued.dnsValue];
    expect(
      (await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`)).status,
    ).toBe(200);
    const listed = await harness.call('owner', 'GET', '/api/organization/domains');
    expect(listed.status).toBe(200);
    const initial = (
      listed.body as {
        domains: { lastSuccessAt: number; lastCheckedAt: number; proofWarning: boolean }[];
      }
    ).domains[0];
    expect(typeof initial.lastSuccessAt).toBe('number');
    expect(typeof initial.lastCheckedAt).toBe('number');
    expect(initial.proofWarning).toBe(false);
    const dayZero = Date.now();
    harness.sqlite.run(
      'UPDATE organization_domain_claim SET last_success_at = ?, last_checked_at = ? WHERE id = ?',
      [dayZero, dayZero, issued.id],
    );
    expect(await harness.checkDomains(dayZero + 6 * 24 * 60 * 60 * 1000)).toEqual({
      checked: 0,
      stale: 0,
    });
    dnsRecords = 'hang';
    await withShortDnsTimeout(() => harness.checkDomains(dayZero + 7 * 24 * 60 * 60 * 1000));
    const warned = await harness.call('owner', 'GET', '/api/organization/domains');
    expect(
      (
        warned.body as {
          domains: { lastSuccessAt: number; lastCheckedAt: number; proofWarning: boolean }[];
        }
      ).domains[0],
    ).toMatchObject({
      lastSuccessAt: dayZero,
      lastCheckedAt: dayZero + 7 * 24 * 60 * 60 * 1000,
      proofWarning: true,
    });
    const lastHex = issued.dnsValue.slice(-1);
    dnsRecords = [`${issued.dnsValue.slice(0, -1)}${lastHex === '0' ? '1' : '0'}`];
    await harness.checkDomains(dayZero + 14 * 24 * 60 * 60 * 1000);
    const mismatched = await harness.call('owner', 'GET', '/api/organization/domains');
    expect(
      (mismatched.body as { domains: { lastSuccessAt: number; proofWarning: boolean }[] })
        .domains[0],
    ).toMatchObject({ lastSuccessAt: dayZero, proofWarning: true });
    expect((mismatched.body as { domains: { status: string }[] }).domains[0]?.status).toBe(
      'suspended',
    );
  });

  it('leaves planted retained proof untouched before activation', async () => {
    const at = Date.now();
    harness.sqlite.run(
      "INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, last_checked_at, created_at, updated_at) VALUES ('planted', 'org-a', 'example.org', 'verified', 'digest', ?, ?, ?, ?)",
      [at, at, at, at],
    );
    expect(await harness.checkDomains(at + 7 * 24 * 60 * 60 * 1000)).toEqual({
      checked: 0,
      stale: 0,
    });
    expect(
      harness.sqlite
        .query("SELECT last_checked_at FROM organization_domain_claim WHERE id = 'planted'")
        .get(),
    ).toEqual({ last_checked_at: at });
  });

  it('rejects a verified claim with a missing retained check timestamp', async () => {
    harness.activate();
    const issued = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
      dnsValue: string;
    };
    dnsRecords = [issued.dnsValue];
    expect(
      (await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`)).status,
    ).toBe(200);
    harness.sqlite.run('UPDATE organization_domain_claim SET last_checked_at = NULL WHERE id = ?', [
      issued.id,
    ]);
    let failure: unknown;
    try {
      await harness.checkDomains(Date.now() + 7 * 24 * 60 * 60 * 1000);
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error('expected corrupt proof refusal');
    expect(failure.message).toContain('lacks retained proof state');
  });

  it('records a failed retained check for a malformed TXT response', async () => {
    harness.activate();
    const issued = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
      dnsValue: string;
    };
    dnsRecords = [issued.dnsValue];
    expect(
      (await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`)).status,
    ).toBe(200);
    const dayZero = Date.now();
    harness.sqlite.run(
      'UPDATE organization_domain_claim SET last_success_at = ?, last_checked_at = ? WHERE id = ?',
      [dayZero, dayZero, issued.id],
    );
    // The resolver violates its trusted return contract after verification.
    dnsRecords = [42] as unknown as readonly string[];
    expect(await harness.checkDomains(dayZero + 7 * 24 * 60 * 60 * 1000)).toEqual({
      checked: 1,
      stale: 0,
    });
    expect(
      harness.sqlite
        .query(
          'SELECT last_success_at, last_checked_at FROM organization_domain_claim WHERE id = ?',
        )
        .get(issued.id),
    ).toEqual({
      last_success_at: dayZero,
      last_checked_at: dayZero + 7 * 24 * 60 * 60 * 1000,
    });
  });

  for (const [snapshot, change] of [
    [
      'organization',
      (claimId: string) => {
        harness.organization('org-b');
        harness.sqlite.run(
          'UPDATE organization_domain_claim SET organization_id = ? WHERE id = ?',
          ['org-b', claimId],
        );
      },
    ],
    [
      'domain',
      (claimId: string) => {
        harness.sqlite.run('UPDATE organization_domain_claim SET domain = ? WHERE id = ?', [
          'example.net',
          claimId,
        ]);
      },
    ],
    [
      'digest',
      (claimId: string) => {
        harness.sqlite.run('UPDATE organization_domain_claim SET proof_digest = ? WHERE id = ?', [
          '0'.repeat(64),
          claimId,
        ]);
      },
    ],
    [
      'timestamp',
      (claimId: string) => {
        harness.sqlite.run(
          'UPDATE organization_domain_claim SET last_checked_at = last_checked_at + 1 WHERE id = ?',
          [claimId],
        );
      },
    ],
  ] as const) {
    it(`leaves a retained check stale when its ${snapshot} changes during lookup`, async () => {
      harness.activate();
      const issued = (await harness.call('owner', 'POST', path, { domain: 'example.org' }))
        .body as {
        id: string;
        dnsValue: string;
      };
      dnsRecords = [issued.dnsValue];
      expect(
        (await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`))
          .status,
      ).toBe(200);
      beforeDnsReply = () => {
        beforeDnsReply = undefined;
        change(issued.id);
      };
      const before = harness.sqlite
        .query(
          'SELECT last_success_at, last_checked_at FROM organization_domain_claim WHERE id = ?',
        )
        .get(issued.id) as { last_success_at: number; last_checked_at: number };
      expect(await harness.checkDomains(Date.now() + 7 * 24 * 60 * 60 * 1000)).toEqual({
        checked: 0,
        stale: 1,
      });
      expect(
        harness.sqlite
          .query(
            'SELECT last_success_at, last_checked_at FROM organization_domain_claim WHERE id = ?',
          )
          .get(issued.id),
      ).toEqual({
        last_success_at: before.last_success_at,
        last_checked_at: before.last_checked_at + (snapshot === 'timestamp' ? 1 : 0),
      });
    });
  }

  it('leaves a retained check stale when activation changes during lookup', async () => {
    harness.activate();
    const issued = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
      dnsValue: string;
    };
    dnsRecords = [issued.dnsValue];
    expect(
      (await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`)).status,
    ).toBe(200);
    const before = harness.sqlite
      .query('SELECT last_checked_at FROM organization_domain_claim WHERE id = ?')
      .get(issued.id);
    beforeDnsReply = () => {
      beforeDnsReply = undefined;
      // Inject a rollback that production's irreversible activation trigger refuses.
      harness.sqlite.run('DROP TRIGGER organization_activation_no_revert');
      harness.sqlite.run(
        "UPDATE organization_activation SET state = 'pre_activation', activated_at = NULL WHERE singleton = 1",
      );
    };
    expect(await harness.checkDomains(Date.now() + 7 * 24 * 60 * 60 * 1000)).toEqual({
      checked: 0,
      stale: 1,
    });
    expect(
      harness.sqlite
        .query('SELECT last_checked_at FROM organization_domain_claim WHERE id = ?')
        .get(issued.id),
    ).toEqual(before);
  });

  it('does not record a retained check after its claim is released during DNS lookup', async () => {
    harness.activate();
    const issued = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
      dnsValue: string;
    };
    dnsRecords = [issued.dnsValue];
    expect(
      (await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`)).status,
    ).toBe(200);
    const due = Date.now() + 7 * 24 * 60 * 60 * 1000;
    beforeDnsReply = () => {
      beforeDnsReply = undefined;
      harness.sqlite.run('DELETE FROM organization_domain_claim WHERE id = ?', [issued.id]);
    };
    expect(await harness.checkDomains(due)).toEqual({ checked: 0, stale: 1 });
    expect(
      harness.sqlite.query('SELECT id FROM organization_domain_claim WHERE id = ?').get(issued.id),
    ).toBeNull();
  });

  it('refuses a retained check when maintained policy changes during DNS lookup', async () => {
    harness.activate();
    const issued = (await harness.call('owner', 'POST', path, { domain: 'example.org' })).body as {
      id: string;
      dnsValue: string;
    };
    dnsRecords = [issued.dnsValue];
    expect(
      (await harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`)).status,
    ).toBe(200);
    const before = harness.sqlite
      .query('SELECT last_checked_at FROM organization_domain_claim WHERE id = ?')
      .get(issued.id);
    beforeDnsReply = () => {
      beforeDnsReply = undefined;
      const directory = policyDirectory;
      if (directory === undefined) throw new Error('policy fixture missing');
      const asset = join(directory, 'public-email-policy.v1.json');
      const content = readFileSync(asset, 'utf8').replace('"co.jp",', '"example.org", "co.jp",');
      writeFileSync(asset, content);
      pinAsset(directory, content);
    };
    let refusal: unknown;
    try {
      await harness.checkDomains(Date.now() + 7 * 24 * 60 * 60 * 1000);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).message).toContain('no longer claimable');
    expect(
      harness.sqlite
        .query('SELECT last_checked_at FROM organization_domain_claim WHERE id = ?')
        .get(issued.id),
    ).toEqual(before);
  });

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
      await withShortDnsTimeout(() =>
        harness.call('owner', 'POST', `/api/organization/domains/${issued.id}/verify`),
      ),
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
        await delegated.callWith(await token(), 'POST', '/api/organization/domains/missing/rotate'),
      ).toEqual({ status: 403, body: { error: 'insufficient_scope' } });
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
