import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

const PATH = '/api/organization/shared-people/restore-approvals';
const REQUEST = { operationId: 'restore-1', backupDigest: 'a'.repeat(64) };
let h: OrganizationHarness;

async function populate() {
  for (const username of ['sam', 'ada', 'other']) await h.register(username);
  h.organization('org-a');
  h.member('org-a', 'sam', 'super_admin');
  h.member('org-a', 'ada', 'admin');
  h.member('org-a', 'other', 'super_admin');
  for (const username of ['sam', 'ada', 'other']) h.bind(username, 'org-a');
  h.activate();
}

function approvals() {
  return h.sqlite.query('SELECT * FROM shared_people_restore_approval ORDER BY id').all();
}
function operations() {
  return h.sqlite.query('SELECT * FROM shared_people_restore_operation ORDER BY id').all();
}

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  await populate();
});
afterEach(() => {
  h.close();
});

describe('personal shared people restore approval', () => {
  it('persists the authenticated actor and active organization, retrying without new evidence', async () => {
    const approved = await h.call('sam', 'POST', PATH, REQUEST);
    expect(approved).toMatchObject({
      status: 200,
      body: {
        approval: {
          organizationId: 'org-a',
          actorId: h.userId('sam'),
          ...REQUEST,
        },
      },
    });
    const evidence = approvals();
    expect(evidence).toHaveLength(1);
    expect(operations()).toHaveLength(1);
    expect(await h.call('sam', 'POST', PATH, REQUEST)).toEqual(approved);
    expect(approvals()).toEqual(evidence);
  });

  it('refuses an admin without storing an operation', async () => {
    expect(await h.call('ada', 'POST', PATH, REQUEST)).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(approvals()).toEqual([]);
    expect(operations()).toEqual([]);
  });

  it('refuses a different backup or actor for existing evidence', async () => {
    expect((await h.call('sam', 'POST', PATH, REQUEST)).status).toBe(200);
    const evidence = approvals();
    const operation = operations();
    for (const [actor, request] of [
      ['sam', { ...REQUEST, backupDigest: 'b'.repeat(64) }],
      ['other', REQUEST],
    ] as const) {
      expect(await h.call(actor, 'POST', PATH, request)).toEqual({
        status: 409,
        body: { error: 'restore_approval_conflict' },
      });
    }
    expect(approvals()).toEqual(evidence);
    expect(operations()).toEqual(operation);
  });

  it('binds one operation digest across organizations without leaking a foreign approval', async () => {
    expect((await h.call('sam', 'POST', PATH, REQUEST)).status).toBe(200);
    h.organization('org-b');
    h.member('org-b', 'other', 'super_admin');
    h.bind('other', 'org-b');
    expect(
      await h.call('other', 'POST', PATH, { ...REQUEST, backupDigest: 'b'.repeat(64) }),
    ).toEqual({ status: 409, body: { error: 'restore_approval_conflict' } });
    expect(approvals()).toHaveLength(1);
    expect(await h.call('other', 'POST', PATH, REQUEST)).toMatchObject({
      status: 200,
      body: {
        approval: { organizationId: 'org-b', actorId: h.userId('other'), ...REQUEST },
      },
    });
    expect(approvals()).toHaveLength(2);
    expect(operations()).toHaveLength(1);
  });

  it('requires super-admin membership in the active organization', async () => {
    h.organization('org-b');
    h.member('org-b', 'other', 'viewer');
    h.bind('other', 'org-b');
    expect(await h.call('other', 'POST', PATH, REQUEST)).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(operations()).toEqual([]);
    expect(approvals()).toEqual([]);
  });

  it('rejects malformed digests and asserted authority at the request boundary', async () => {
    for (const request of [
      { ...REQUEST, backupDigest: 'A'.repeat(64) },
      { ...REQUEST, backupDigest: 'a' },
      { ...REQUEST, operationId: '' },
      { ...REQUEST, actorId: h.userId('sam') },
      { ...REQUEST, organizationId: 'org-b' },
    ])
      expect((await h.call('sam', 'POST', PATH, request)).status).toBe(400);
    expect(approvals()).toEqual([]);
    expect(operations()).toEqual([]);
  });

  it('rechecks membership after route admission, including approval retries', async () => {
    expect((await h.call('sam', 'POST', PATH, REQUEST)).status).toBe(200);
    h.sqlite.run("UPDATE organization_membership SET role = 'admin' WHERE user_id = ?", [
      h.userId('sam'),
    ]);
    expect((await h.call('sam', 'POST', PATH, REQUEST)).status).toBe(403);
    h.close();
    let demote = false;
    h = OrganizationHarness.openComposedWith({
      afterResolve: () => {
        if (demote)
          h.sqlite.run("UPDATE organization_membership SET role = 'admin' WHERE user_id = ?", [
            h.userId('sam'),
          ]);
      },
    });
    await populate();
    demote = true;
    expect(await h.call('sam', 'POST', PATH, REQUEST)).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(approvals()).toEqual([]);
    expect(operations()).toEqual([]);
  });

  it('waits for the composed writer and refuses membership removed while queued', async () => {
    h.close();
    let admitted!: () => void;
    const admission = new Promise<void>((resolve) => {
      admitted = resolve;
    });
    h = OrganizationHarness.openComposedWith({
      afterResolve: () => {
        admitted();
      },
    });
    await populate();
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const until = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = h.holdWriteTurn(until, entered);
    await held;
    const requested = h.call('sam', 'POST', PATH, REQUEST);
    try {
      await admission;
      await Bun.sleep(10);
      expect(approvals()).toEqual([]);
      h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('sam')]);
    } finally {
      release();
      await holder;
    }
    expect(await requested).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect(operations()).toEqual([]);
  });

  it('rolls back the operation when approval insertion fails', async () => {
    h.sqlite.run(
      "CREATE TRIGGER fail_approval BEFORE INSERT ON shared_people_restore_approval BEGIN SELECT RAISE(ABORT, 'injected approval fault'); END",
    );
    expect((await h.call('sam', 'POST', PATH, REQUEST)).status).toBe(500);
    expect(approvals()).toEqual([]);
    expect(operations()).toEqual([]);
  });

  it('requires authentication and an activated organization', async () => {
    expect((await h.callWith('invalid', 'POST', PATH, REQUEST)).status).toBe(401);
    h.close();
    h = OrganizationHarness.openComposed();
    await h.register('sam');
    expect(await h.call('sam', 'POST', PATH, REQUEST)).toEqual({
      status: 409,
      body: { error: 'organization_required' },
    });
    expect(operations()).toEqual([]);
  });
});
