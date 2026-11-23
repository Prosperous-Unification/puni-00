import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { afterEach, expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness | undefined;
afterEach(async () => {
  await harness?.closeComposed();
  harness = undefined;
});
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
interface Identity {
  path: string;
  sha256: string;
  bytes: number;
}
const manifest = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL(
        '../../../../../openspec/changes/wbs-work-packages/fixtures/' + name,
        import.meta.url,
      ),
      'utf8',
    ),
  ) as { records: Identity[] };
const paired = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-comparison-captures.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { records: { input: Identity; schedule: Identity }[] };
const identities = [
  ...manifest('legacy-input-captures.json').records,
  ...manifest('legacy-schedule-captures.json').records,
  ...paired.records.flatMap((capture) => [capture.input, capture.schedule]),
];
function readFixture(name: string) {
  const capture = identities.find((identity) => identity.path.endsWith('/' + name));
  if (capture === undefined) throw new Error('genuine fixture identity absent');
  const bytes = readFileSync(new URL('../../../../../' + capture.path, import.meta.url), 'utf8');
  expect(hash(bytes)).toBe(capture.sha256);
  expect(Buffer.byteLength(bytes)).toBe(capture.bytes);
  return bytes;
}
const cases = [
  {
    name: 'legacy9 local/plain1',
    input: 'legacy-comparison-local-input9.txt',
    schedule: 'legacy-comparison-local-schedule1.txt',
    target: 'P',
    inputVersion: 9,
    scheduleVersion: 1,
  },
  {
    name: 'published10 local/absent schedule',
    input: 'legacy-input10-local.txt',
    schedule: null,
    target: 'p1',
    inputVersion: 10,
    scheduleVersion: null,
  },
  {
    name: 'published10 connected2',
    input: 'legacy-comparison-connected-input10.txt',
    schedule: 'legacy-schedule2-connected.txt',
    target: 'B',
    inputVersion: 10,
    scheduleVersion: 2,
  },
] as const;

async function fixture(capture: (typeof cases)[number]) {
  const mounted = OrganizationHarness.openComposed();
  harness = mounted;
  await mounted.register('ada');
  mounted.organization('org');
  mounted.member('org', 'ada', 'member', ['org-admin']);
  mounted.bind('ada', 'org');
  mounted.activate();
  const owner = mounted.userId('ada');
  const projectId = 'historical-project';
  mounted.sqlite
    .query('INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES(?,?,?,?,?)')
    .run(projectId, 'org', 'Historical project', 1, owner);
  mounted.sqlite
    .query('INSERT INTO work_package(id,name,project_id,created_by,created_at) VALUES (?,?,?,?,?)')
    .run(capture.target, 'Historical package', projectId, owner, 1);
  mounted.sqlite
    .query('INSERT INTO work_package_organization(resource_id,organization_id) VALUES (?,?)')
    .run(capture.target, 'org');
  const input = readFixture(capture.input);
  const schedule = capture.schedule === null ? null : readFixture(capture.schedule);
  const body = schedule === null ? null : (JSON.parse(schedule) as { algorithmId: string });
  const id = 'saved-history';
  const inputHash = hash(input);
  const scheduleHash = schedule === null ? null : hash(schedule);
  mounted.sqlite
    .query(
      'INSERT INTO saved_plan(id,work_package_id,name,created_by,created_by_id,created_at,input_schema_version,input_bytes,input_sha256,schedule_schema_version,schedule_bytes,schedule_sha256,schedule_input_sha256,scheduler_algorithm_id,schedule_absent_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      id,
      capture.target,
      capture.name,
      'Original author',
      owner,
      1,
      capture.inputVersion,
      Buffer.byteLength(input),
      inputHash,
      capture.scheduleVersion,
      schedule === null ? null : Buffer.byteLength(schedule),
      scheduleHash,
      schedule === null ? null : inputHash,
      body === null ? null : body.algorithmId,
      schedule === null ? 'unavailable' : null,
    );
  mounted.sqlite
    .query('INSERT INTO saved_plan_organization(resource_id,organization_id) VALUES (?,?)')
    .run(id, 'org');
  mounted.sqlite
    .query('INSERT INTO saved_plan_body(saved_plan_id,kind,bytes) VALUES (?,?,?)')
    .run(id, 'input', input);
  if (schedule !== null)
    mounted.sqlite
      .query('INSERT INTO saved_plan_body(saved_plan_id,kind,bytes) VALUES (?,?,?)')
      .run(id, 'schedule', schedule);
  return { mounted, id, input, schedule, inputHash, scheduleHash };
}

for (const capture of cases)
  test(
    'mounted renamed SQLite reads ' + capture.name + ' with original stored bytes and hashes',
    async () => {
      const { mounted, id, input, schedule, inputHash, scheduleHash } = await fixture(capture);
      const before = {
        headers: mounted.sqlite.query('SELECT * FROM saved_plan').all(),
        bodies: mounted.sqlite.query('SELECT * FROM saved_plan_body ORDER BY kind').all(),
      };
      const read = await mounted.call('ada', 'GET', '/api/saved-plans/' + id);
      expect(read).toMatchObject({
        status: 200,
        body: {
          savedPlan: {
            workPackageId: capture.target,
            input: { schemaVersion: capture.inputVersion, bytes: input, sha256: inputHash },
            schedule:
              schedule === null
                ? { present: false, absentReason: 'unavailable' }
                : {
                    present: true,
                    body: {
                      schemaVersion: capture.scheduleVersion,
                      bytes: schedule,
                      sha256: scheduleHash,
                    },
                  },
          },
        },
      });
      const compare = await mounted.call(
        'ada',
        'GET',
        '/api/work-packages/' + capture.target + '/saved-plans/compare?left=' + id + '&right=' + id,
      );
      expect(compare).toMatchObject({ status: 200, body: { diff: { input: [], schedule: [] } } });
      expect({
        headers: mounted.sqlite.query('SELECT * FROM saved_plan').all(),
        bodies: mounted.sqlite.query('SELECT * FROM saved_plan_body ORDER BY kind').all(),
      }).toEqual(before);
    },
  );

test('mounted renamed SQLite rejects original input header mismatch before projecting history', async () => {
  const { mounted, id } = await fixture(cases[0]);
  mounted.sqlite.query('UPDATE saved_plan SET input_schema_version=11 WHERE id=?').run(id);
  const before = mounted.sqlite.query('SELECT * FROM saved_plan_body ORDER BY kind').all();
  const read = await mounted.call('ada', 'GET', '/api/saved-plans/' + id);
  expect(read).toMatchObject({
    status: 422,
    body: {
      error: 'corrupt',
      refusal: { reason: 'body_invalid', body: 'input', path: '$.schemaVersion' },
    },
  });
  expect(mounted.sqlite.query('SELECT * FROM saved_plan_body ORDER BY kind').all()).toEqual(before);
});
