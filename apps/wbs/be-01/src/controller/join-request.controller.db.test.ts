import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { LaneProcess } from '../testing/lane-process';
import { OrganizationHarness } from '../testing/organization-harness';

describe('organization join request decisions', () => {
  let harness: OrganizationHarness;

  beforeEach(async () => {
    harness = OrganizationHarness.open();
    await harness.register('owner');
    await harness.register('applicant');
    harness.organization('org');
    harness.member('org', 'owner', 'super_admin');
    harness.bind('owner', 'org');
    harness.sqlite.run(
      "UPDATE users SET email = 'applicant@example.org', email_verified = 1 WHERE id = ?",
      [harness.userId('applicant')],
    );
    harness.sqlite.run(
      "INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, created_at) VALUES ('claim', 'org', 'example.org', 'verified', 'proof', 1, 1)",
    );
  });

  afterEach(async () => {
    await LaneProcess.stopAll();
    harness.close();
  });

  it('approves one pending request by issuing a viewer invitation without membership', async () => {
    harness.activate();
    const submitted = await harness.call('applicant', 'POST', '/api/onboarding/join-requests', {
      organizationId: 'org',
    });
    expect(submitted.status).toBe(201);
    const requests = await harness.call('owner', 'GET', '/api/organization/join-requests');
    expect(requests.status).toBe(200);
    const id = (submitted.body as { request: { id: string } }).request.id;
    expect(
      (
        await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/approve`, {
          role: 'viewer',
        })
      ).status,
    ).toBe(200);
    expect(
      harness.sqlite
        .query('SELECT * FROM organization_membership WHERE user_id = ?')
        .all(harness.userId('applicant')),
    ).toHaveLength(0);
    const token = harness.deliveredEmailToken('applicant@example.org');
    expect(harness.sqlite.query('SELECT token_digest FROM organization_invitation').get()).toEqual({
      token_digest: createHash('sha256').update(token).digest('hex'),
    });
    expect(
      await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/approve`, {
        role: 'viewer',
      }),
    ).toEqual({ status: 409, body: { error: 'request_resolved' } });
    expect(
      await harness.call('applicant', 'POST', '/api/onboarding/invitations/accept', { token }),
    ).toEqual({ status: 200, body: { membership: { organizationId: 'org', role: 'viewer' } } });
  });

  it('rejects an admin approval role at the HTTP boundary', async () => {
    harness.activate();
    const id = await submit();
    expect(
      await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/approve`, {
        role: 'admin',
      }),
    ).toEqual({ status: 400, body: { error: 'invalid_body' } });
    expect(harness.sqlite.query('SELECT id FROM organization_invitation').all()).toHaveLength(0);
  });

  async function submit(): Promise<string> {
    const submitted = await harness.call('applicant', 'POST', '/api/onboarding/join-requests', {
      organizationId: 'org',
    });
    expect(submitted.status).toBe(201);
    return (submitted.body as { request: { id: string } }).request.id;
  }

  it('refuses before activation and rejects delegated administration', async () => {
    expect(await harness.call('owner', 'GET', '/api/organization/join-requests')).toEqual({
      status: 403,
      body: { error: 'no_active_organization' },
    });
    harness.activate();
    const id = await submit();
    expect(
      await harness.call('applicant', 'POST', `/api/organization/join-requests/${id}/deny`),
    ).toEqual({ status: 403, body: { error: 'no_active_organization' } });
  });

  it('refuses a suspended or changed domain at approval', async () => {
    harness.activate();
    const id = await submit();
    harness.sqlite.run("UPDATE organization_domain_claim SET status = 'suspended'");
    expect(
      await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/approve`, {
        role: 'member',
      }),
    ).toEqual({ status: 409, body: { error: 'domain_changed' } });
    harness.sqlite.run("UPDATE organization_domain_claim SET status = 'verified'");
    harness.sqlite.run("UPDATE users SET email = 'applicant@other.org' WHERE id = ?", [
      harness.userId('applicant'),
    ]);
    expect(
      await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/approve`, {
        role: 'member',
      }),
    ).toEqual({ status: 409, body: { error: 'domain_changed' } });
    expect(harness.sqlite.query('SELECT id FROM organization_invitation').all()).toHaveLength(0);
  });

  it('refuses a changed or unverified applicant', async () => {
    harness.activate();
    const id = await submit();
    harness.sqlite.run('UPDATE users SET email_verified = 0 WHERE id = ?', [
      harness.userId('applicant'),
    ]);
    expect(
      await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/approve`, {
        role: 'viewer',
      }),
    ).toEqual({ status: 409, body: { error: 'domain_changed' } });
    harness.sqlite.run(
      "UPDATE users SET email = 'new@example.org', email_verified = 1 WHERE id = ?",
      [harness.userId('applicant')],
    );
    expect(
      await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/approve`, {
        role: 'viewer',
      }),
    ).toEqual({ status: 409, body: { error: 'domain_changed' } });
    expect(harness.sqlite.query('SELECT id FROM organization_invitation').all()).toHaveLength(0);
  });

  it('throws for a malformed trusted verified address', async () => {
    harness.activate();
    const id = await submit();
    harness.sqlite.run("UPDATE users SET email = 'invalid' WHERE id = ?", [
      harness.userId('applicant'),
    ]);
    harness.sqlite.run("UPDATE organization_join_request SET email = 'invalid' WHERE id = ?", [id]);
    expect(
      (
        await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/approve`, {
          role: 'viewer',
        })
      ).status,
    ).toBe(500);
  });

  it('refuses a removed administrator', async () => {
    harness.activate();
    const id = await submit();
    harness.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [
      harness.userId('owner'),
    ]);
    expect(
      (
        await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/approve`, {
          role: 'viewer',
        })
      ).status,
    ).toBe(403);
    expect(harness.sqlite.query('SELECT id FROM organization_invitation').all()).toHaveLength(0);
  });

  it('rechecks administrator authority after active organization resolution', async () => {
    harness.close();
    let removeAfterResolve = false;
    harness = OrganizationHarness.openComposed(false, () => {
      if (removeAfterResolve)
        harness.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [
          harness.userId('owner'),
        ]);
    });
    await harness.register('owner');
    await harness.register('applicant');
    harness.organization('org');
    harness.member('org', 'owner', 'super_admin');
    harness.bind('owner', 'org');
    harness.sqlite.run(
      "UPDATE users SET email = 'applicant@example.org', email_verified = 1 WHERE id = ?",
      [harness.userId('applicant')],
    );
    harness.sqlite.run(
      "INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, created_at) VALUES ('claim', 'org', 'example.org', 'verified', 'proof', 1, 1)",
    );
    harness.activate();
    const id = await submit();
    removeAfterResolve = true;
    expect(
      await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/approve`, {
        role: 'viewer',
      }),
    ).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect(harness.sqlite.query('SELECT id FROM organization_invitation').all()).toHaveLength(0);
  });

  it('rechecks activation after active organization resolution', async () => {
    harness.close();
    let deactivateAfterResolve = false;
    harness = OrganizationHarness.openComposed(false, () => {
      if (deactivateAfterResolve) harness.sqlite.run('DROP TABLE organization_activation');
    });
    await harness.register('owner');
    harness.organization('org');
    harness.member('org', 'owner', 'super_admin');
    harness.bind('owner', 'org');
    harness.activate();
    deactivateAfterResolve = true;
    expect((await harness.call('owner', 'GET', '/api/organization/join-requests')).status).toBe(
      500,
    );
  });

  for (const decision of ['approve', 'deny'] as const) {
    it(`rechecks activation during ${decision}`, async () => {
      harness.close();
      let dropAfterResolve = false;
      harness = OrganizationHarness.openComposed(false, () => {
        if (dropAfterResolve) harness.sqlite.run('DROP TABLE organization_activation');
      });
      await harness.register('owner');
      await harness.register('applicant');
      harness.organization('org');
      harness.member('org', 'owner', 'super_admin');
      harness.bind('owner', 'org');
      harness.sqlite.run(
        "UPDATE users SET email = 'applicant@example.org', email_verified = 1 WHERE id = ?",
        [harness.userId('applicant')],
      );
      harness.sqlite.run(
        "INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, created_at) VALUES ('claim', 'org', 'example.org', 'verified', 'proof', 1, 1)",
      );
      harness.activate();
      const id = await submit();
      dropAfterResolve = true;
      expect(
        (
          await harness.call(
            'owner',
            'POST',
            `/api/organization/join-requests/${id}/${decision}`,
            decision === 'approve' ? { role: 'viewer' } : undefined,
          )
        ).status,
      ).toBe(500);
    });
  }

  it('hides foreign and missing requests identically', async () => {
    harness.activate();
    const id = await submit();
    harness.organization('other');
    harness.member('other', 'owner', 'super_admin');
    harness.bind('owner', 'other');
    const foreign = await harness.call(
      'owner',
      'POST',
      `/api/organization/join-requests/${id}/approve`,
      { role: 'viewer' },
    );
    const absent = await harness.call(
      'owner',
      'POST',
      '/api/organization/join-requests/missing/approve',
      { role: 'viewer' },
    );
    expect(foreign).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(absent).toEqual(foreign);
  });

  it('resolves approve and deny calls on one connection once', async () => {
    harness.activate();
    const id = await submit();
    const decisions = await Promise.all([
      harness.call('owner', 'POST', `/api/organization/join-requests/${id}/approve`, {
        role: 'viewer',
      }),
      harness.call('owner', 'POST', `/api/organization/join-requests/${id}/deny`),
    ]);
    const statuses = decisions.map((decision) => decision.status).sort();
    expect([200, 204]).toContain(statuses[0]);
    expect(statuses[1]).toBe(409);
    expect(harness.sqlite.query('SELECT id FROM organization_invitation').all()).toHaveLength(
      statuses[0] === 200 ? 1 : 0,
    );
  });

  for (const pair of [
    ['approve', 'approve'],
    ['approve', 'deny'],
  ] as const) {
    it(`serializes overlapping ${pair[0]}/${pair[1]} decisions across processes`, async () => {
      harness.activate();
      const id = await submit();
      const databasePath = harness.databasePath();
      const workerPath = new URL('../testing/join-request-decision.worker.ts', import.meta.url)
        .pathname;
      const workers = pair.map((decision, lane) =>
        LaneProcess.spawn([
          process.execPath,
          workerPath,
          databasePath,
          harness.userId('owner'),
          id,
          decision,
          String(lane),
        ]),
      );
      let locked = false;
      try {
        harness.sqlite.run('BEGIN IMMEDIATE');
        locked = true;
        await Promise.all(workers.map((worker) => worker.expectLine('ready')));
        writeFileSync(`${databasePath}.go`, 'go');
        await Promise.all(workers.map((worker) => worker.expectLine('attempt')));
        await Bun.sleep(150);
        harness.sqlite.run('COMMIT');
        locked = false;
        const answers = await Promise.all(
          workers.map(async (worker) => {
            const exit = await worker.finish();
            expect(exit.code, exit.errors).toBe(0);
            expect(exit.errors).toBe('');
            return JSON.parse(exit.answer) as { ok: boolean; refusal?: string };
          }),
        );
        expect(answers.map((answer) => answer.ok).sort()).toEqual([false, true]);
        expect(answers.find((answer) => !answer.ok)?.refusal).toBe('request_resolved');
        const request = harness.sqlite
          .query('SELECT status, invitation_id FROM organization_join_request WHERE id = ?')
          .get(id) as { status: string; invitation_id: string | null };
        expect(request.status).toBe(pair[1] === 'approve' || answers[0].ok ? 'approved' : 'denied');
        expect(harness.sqlite.query('SELECT id FROM organization_invitation').all()).toHaveLength(
          request.status === 'approved' ? 1 : 0,
        );
        expect(request.invitation_id === null).toBe(request.status === 'denied');
      } finally {
        if (locked) harness.sqlite.run('ROLLBACK');
      }
    });
  }

  it('leaves the request pending when invitation insertion aborts', async () => {
    harness.activate();
    const id = await submit();
    harness.sqlite.run(
      "CREATE TRIGGER abort_join_invitation BEFORE INSERT ON organization_invitation BEGIN SELECT RAISE(ABORT, 'injected invitation failure'); END",
    );
    expect(
      (
        await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/approve`, {
          role: 'viewer',
        })
      ).status,
    ).toBe(500);
    expect(
      harness.sqlite.query('SELECT status FROM organization_join_request WHERE id = ?').get(id),
    ).toEqual({ status: 'pending' });
    expect(harness.sqlite.query('SELECT id FROM organization_invitation').all()).toHaveLength(0);
  });

  it('rolls the invitation back when the subsequent resolution update fails', async () => {
    harness.activate();
    const id = await submit();
    harness.sqlite.run(
      "CREATE TRIGGER abort_join_resolution BEFORE UPDATE ON organization_join_request BEGIN SELECT RAISE(ABORT, 'injected resolution failure'); END",
    );
    expect(
      (
        await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/approve`, {
          role: 'viewer',
        })
      ).status,
    ).toBe(500);
    expect(harness.sqlite.query('SELECT id FROM organization_invitation').all()).toHaveLength(0);
    expect(
      harness.sqlite.query('SELECT status FROM organization_join_request WHERE id = ?').get(id),
    ).toEqual({ status: 'pending' });
  });

  it('denies without invitation or membership and refuses replay', async () => {
    harness.activate();
    const id = await submit();
    expect(
      await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/deny`),
    ).toEqual({ status: 204, body: null });
    expect(
      await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/deny`),
    ).toEqual({ status: 409, body: { error: 'request_resolved' } });
    expect(harness.sqlite.query('SELECT id FROM organization_invitation').all()).toHaveLength(0);
  });

  it('limits listing and denial to current administrators', async () => {
    harness.activate();
    const id = await submit();
    harness.member('org', 'applicant', 'viewer');
    harness.bind('applicant', 'org');
    expect(await harness.call('applicant', 'GET', '/api/organization/join-requests')).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(
      await harness.call('applicant', 'POST', `/api/organization/join-requests/${id}/deny`),
    ).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect(
      harness.sqlite.query('SELECT status FROM organization_join_request WHERE id = ?').get(id),
    ).toEqual({ status: 'pending' });
  });

  it('throws for a malformed trusted administrator role', async () => {
    harness.close();
    let corruptAfterResolve = false;
    harness = OrganizationHarness.openComposed(false, () => {
      if (corruptAfterResolve) {
        harness.sqlite.run('PRAGMA ignore_check_constraints = ON');
        harness.sqlite.run("UPDATE organization_membership SET role = 'broken' WHERE user_id = ?", [
          harness.userId('owner'),
        ]);
      }
    });
    await harness.register('owner');
    harness.organization('org');
    harness.member('org', 'owner', 'super_admin');
    harness.bind('owner', 'org');
    harness.activate();
    corruptAfterResolve = true;
    expect((await harness.call('owner', 'GET', '/api/organization/join-requests')).status).toBe(
      500,
    );
  });

  it('lists only requests in the active organization', async () => {
    harness.activate();
    const ownId = await submit();
    harness.organization('other');
    harness.sqlite.run(
      "INSERT INTO organization_join_request (id, organization_id, user_id, email, status, created_at) VALUES ('foreign-request', 'other', ?, 'applicant@example.org', 'pending', 1)",
      [harness.userId('applicant')],
    );
    const listing = await harness.call('owner', 'GET', '/api/organization/join-requests');
    expect(listing.status).toBe(200);
    expect(listing.body).toMatchObject({
      requests: [{ id: ownId, email: 'applicant@example.org', status: 'pending' }],
    });
    expect((listing.body as { requests: unknown[] }).requests).toHaveLength(1);
  });

  it('requires the exact verified claim in the active organization', async () => {
    harness.activate();
    const id = await submit();
    harness.sqlite.run(
      "UPDATE organization_domain_claim SET status = 'pending' WHERE id = 'claim'",
    );
    harness.organization('other');
    harness.sqlite.run(
      "INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, created_at) VALUES ('foreign-claim', 'other', 'example.org', 'verified', 'proof', 1, 1)",
    );
    expect(
      await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/approve`, {
        role: 'viewer',
      }),
    ).toEqual({
      status: 409,
      body: { error: 'domain_changed' },
    });
    harness.sqlite.run(
      "UPDATE organization_domain_claim SET status = 'verified', domain = 'other.org' WHERE id = 'claim'",
    );
    expect(
      await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/approve`, {
        role: 'viewer',
      }),
    ).toEqual({
      status: 409,
      body: { error: 'domain_changed' },
    });
    expect(harness.sqlite.query('SELECT id FROM organization_invitation').all()).toHaveLength(0);
  });

  it('throws for a malformed trusted request status', async () => {
    harness.activate();
    const id = await submit();
    harness.sqlite.run('PRAGMA ignore_check_constraints = ON');
    harness.sqlite.run("UPDATE organization_join_request SET status = 'broken' WHERE id = ?", [id]);
    expect((await harness.call('owner', 'GET', '/api/organization/join-requests')).status).toBe(
      500,
    );
    expect(
      (
        await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/approve`, {
          role: 'viewer',
        })
      ).status,
    ).toBe(500);
    expect(
      (await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/deny`)).status,
    ).toBe(500);
  });

  it('gives identical 404 for foreign and missing denial targets', async () => {
    harness.activate();
    const id = await submit();
    harness.organization('other');
    harness.member('other', 'owner', 'super_admin');
    harness.bind('owner', 'other');
    const foreign = await harness.call(
      'owner',
      'POST',
      `/api/organization/join-requests/${id}/deny`,
    );
    expect(foreign).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(
      await harness.call('owner', 'POST', '/api/organization/join-requests/missing/deny'),
    ).toEqual(foreign);
  });

  it('reopens a request and revokes its invitation when the injected sink fails', async () => {
    harness.activate();
    const id = await submit();
    harness.failEmailDelivery();
    expect(
      await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/approve`, {
        role: 'viewer',
      }),
    ).toEqual({ status: 503, body: { error: 'delivery_failed' } });
    expect(
      harness.sqlite.query('SELECT status FROM organization_join_request WHERE id = ?').get(id),
    ).toEqual({ status: 'pending' });
    expect(
      harness.sqlite
        .query('SELECT revoked_at IS NOT NULL AS revoked FROM organization_invitation')
        .get(),
    ).toEqual({ revoked: 1 });
  });

  it('revokes a failed offer when a new request arrives during delayed delivery', async () => {
    harness.activate();
    const id = await submit();
    let replacementId: string | undefined;
    harness.failEmailDelivery(async () => {
      const submitted = await harness.call('applicant', 'POST', '/api/onboarding/join-requests', {
        organizationId: 'org',
      });
      expect(submitted.status).toBe(201);
      replacementId = (submitted.body as { request: { id: string } }).request.id;
    });
    expect(
      await harness.call('owner', 'POST', `/api/organization/join-requests/${id}/approve`, {
        role: 'viewer',
      }),
    ).toEqual({
      status: 503,
      body: { error: 'delivery_failed' },
    });
    expect(
      harness.sqlite
        .query('SELECT revoked_at IS NOT NULL AS revoked FROM organization_invitation')
        .get(),
    ).toEqual({ revoked: 1 });
    expect(
      harness.sqlite.query('SELECT status FROM organization_join_request WHERE id = ?').get(id),
    ).toEqual({ status: 'approved' });
    if (replacementId === undefined) throw new Error('the replacement was not submitted');
    expect(
      harness.sqlite
        .query('SELECT status FROM organization_join_request WHERE id = ?')
        .get(replacementId),
    ).toEqual({ status: 'pending' });
  });
});
