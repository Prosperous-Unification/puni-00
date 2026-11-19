import { afterEach, beforeEach, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';
let h: OrganizationHarness | undefined;
let aWorkPackage: string;
const SECRET = 'x'.repeat(32);
function requireHarness() {
  if (h === undefined) throw new Error('composed namespace harness absent');
  return h;
}
async function gateway(path: string, headers: Record<string, string>, body: unknown) {
  const owner = requireHarness();
  const response = await owner.app.handle(
    new Request('http://localhost' + path, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: (await response.json()) as unknown };
}
function forwarded(username: string) {
  return {
    'x-internal-auth': SECRET,
    cookie: '__Host-wbs_access=' + requireHarness().token(username),
  };
}
beforeEach(async () => {
  h = undefined;
  h = OrganizationHarness.openComposedWith({ internalAuthSecret: SECRET });
  const owner = requireHarness();
  await owner.register('ada');
  owner.organization('org-a');
  owner.member('org-a', 'ada', 'admin', ['org-admin']);
  owner.bind('ada', 'org-a');
  owner.activate();
  const created = await owner.call('ada', 'POST', '/api/work-packages', {
    name: 'Current namespace',
  });
  expect(created.status).toBe(200);
  aWorkPackage = (created.body as { workPackage: { id: string } }).workPackage.id;
});
afterEach(async () => {
  if (h !== undefined) {
    await h.closeComposed();
    h = undefined;
  }
});
for (const shared of [false, true]) {
  it(
    'current ' +
      (shared ? 'shared' : 'isolated') +
      ' backend anchor and readable replay isolate old transport zero from current zero and one',
    async () => {
      const owner = requireHarness();
      owner.sqlite
        .query('UPDATE organization SET shared_people=? WHERE id=?')
        .run(shared ? 1 : 0, 'org-a');
      const oldKey = 'project:' + aWorkPackage,
        currentKey = 'work-package:' + aWorkPackage,
        camelKey = 'workPackage:' + aWorkPackage;
      const oldPayload = JSON.stringify({ type: 'tree_replaced', legacy: 'old-frame-zero' });
      owner.sqlite
        .query('INSERT INTO event_sequencer(subscription,next_seq) VALUES(?,?)')
        .run(oldKey, 1);
      owner.sqlite
        .query('INSERT INTO event_log(subscription,seq,message,created_at) VALUES(?,?,?,?)')
        .run(oldKey, 0, oldPayload, 1);
      const before = owner.sqlite
        .query('SELECT * FROM event_log WHERE subscription=? ORDER BY seq')
        .all(oldKey);
      const initial = await owner.call(
        'ada',
        'GET',
        '/api/work-packages/' + aWorkPackage + '/work-items',
      );
      expect(initial.status).toBe(200);
      expect(initial.body).toMatchObject({ seq: -1 });
      owner.sqlite
        .query('INSERT INTO event_sequencer(subscription,next_seq) VALUES(?,?)')
        .run(currentKey, 2);
      for (const seq of [0, 1])
        owner.sqlite
          .query('INSERT INTO event_log(subscription,seq,message,created_at) VALUES(?,?,?,?)')
          .run(
            currentKey,
            seq,
            JSON.stringify({ type: 'calendar_markers_changed', current: seq }),
            seq + 2,
          );
      const captured = await owner.call(
        'ada',
        'GET',
        '/api/work-packages/' + aWorkPackage + '/work-items',
      );
      expect(captured.status).toBe(200);
      expect(captured.body).toMatchObject({ seq: 1 });
      const answer = await gateway('/internal/resume', forwarded('ada'), {
        resume_points: { [currentKey]: -1, [oldKey]: -1, [camelKey]: -1 },
        trace_id: 'namespace-current',
      });
      expect(answer.status).toBe(200);
      expect(answer.body).toEqual({
        [currentKey]: {
          status: 'replaying',
          events: [
            { seq: 0, message: { type: 'calendar_markers_changed', current: 0 } },
            { seq: 1, message: { type: 'calendar_markers_changed', current: 1 } },
          ],
        },
        [oldKey]: { status: 'denied', reason: 'forbidden' },
        [camelKey]: { status: 'denied', reason: 'forbidden' },
      });
      expect(
        owner.sqlite.query('SELECT * FROM event_log WHERE subscription=? ORDER BY seq').all(oldKey),
      ).toEqual(before);
    },
  );
}
