import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { expect, test } from 'bun:test';

import { seedLegacyPackageParent } from '../../testing/legacy-package-source-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { installSavedPlans } from './check';

const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
function fixture(name: string) {
  return readFileSync(
    new URL(
      '../../../../../../../openspec/changes/wbs-work-packages/fixtures/' + name,
      import.meta.url,
    ),
    'utf8',
  );
}
const cases = [
  {
    name: 'original9',
    input: 'legacy-input9-local.txt',
    inputVersion: 9,
    scope: 'p1',
    provenance: 'legacy-unknown',
  },
  {
    name: 'original10-local',
    input: 'legacy-input10-local.txt',
    inputVersion: 10,
    scope: 'p1',
    provenance: 'local',
  },
  {
    name: 'original10-connected',
    input: 'legacy-input10-connected.txt',
    inputVersion: 10,
    scope: 'A',
    provenance: 'connected',
    schedule: 'legacy-schedule2-questions.txt',
  },
] as const;
async function stored(
  capture: (typeof cases)[number],
  options: { headerVersion?: number; scheduleHeaderVersion?: number; alteredInput?: string } = {},
) {
  const parentFixture = openMemorySourceFixture();
  const source = parentFixture.source;
  await source.stores.users.create(
    { id: 'owner', username: 'owner', passwordHash: null, createdAt: 0 },
    { by: 'owner', at: 0 },
  );
  seedLegacyPackageParent(parentFixture, {
    organizationId: 'comparison-legacy',
    projectId: 'comparison-parent',
    creator: 'owner',
  });
  const created = await source.stores.workPackages.create(
    {
      id: capture.scope,
      name: 'Unrelated current name',
      projectId: 'comparison-parent',
      restricted: false,
      estimateMethod: 'pert',
      depReach: 'whole-item',
      pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
      estimateRounding: 'ceil',
      startDate: null,
      solutionRef: null,
      revision: 0,
      createdAt: 0,
    },
    [],
    { by: 'owner', at: 0 },
  );
  expect(typeof created).toBe('object');
  const original = fixture(capture.input);
  const input = options.alteredInput ?? original;
  const schedule = 'schedule' in capture ? fixture(capture.schedule) : null;
  const written = await source.history.savedPlans.write(
    {
      id: 'historical',
      workPackageId: capture.scope,
      name: 'Historical',
      createdBy: 'owner',
      createdById: 'owner',
      createdAt: 0,
      input: {
        schemaVersion: options.headerVersion ?? capture.inputVersion,
        bytes: input,
        sha256: sha(original),
      },
      schedule:
        schedule === null
          ? { present: false, absentReason: 'pending' }
          : {
              present: true,
              body: {
                schemaVersion: options.scheduleHeaderVersion ?? 2,
                bytes: schedule,
                sha256: sha(schedule),
              },
              inputSha256: sha(original),
              algorithmId: (JSON.parse(schedule) as { algorithmId: string }).algorithmId,
            },
    },
    () => Promise.resolve(null),
  );
  expect(written).toEqual({ outcome: 'written' });
  const { savedPlans } = installSavedPlans({
    plans: source.history.savedPlans,
    capture: source.history.savedPlanCapture,
    digest: { sha256: (bytes) => Promise.resolve(sha(bytes)) },
    newId: () => {
      throw new Error('historical read must not allocate');
    },
    now: () => {
      throw new Error('historical read must not read clock');
    },
    scheduler: {
      ...fastScheduler,
      read: () => {
        throw new Error('historical read must not schedule');
      },
    },
  });
  return { source, savedPlans, original, schedule };
}
for (const capture of cases)
  test(
    'actual stored ' +
      capture.name +
      ' read and comparison retain original bytes and captured provenance',
    async () => {
      const { source, savedPlans, original, schedule } = await stored(capture);
      const before = await source.history.savedPlans.readOf('historical');
      const read = await savedPlans.read('historical');
      expect(read.outcome).toBe('read');
      if (read.outcome !== 'read') throw new Error('historical read refused');
      expect(read.plan.input.bytes).toBe(original);
      expect(read.plan.input.sha256).toBe(sha(original));
      expect(read.plan.input.schemaVersion).toBe(capture.inputVersion);
      if (schedule !== null) {
        expect(read.plan.schedule.present).toBe(true);
        if (!read.plan.schedule.present) throw new Error('historical schedule lost');
        expect(read.plan.schedule.body.bytes).toBe(schedule);
        expect(read.plan.schedule.body.sha256).toBe(sha(schedule));
      }
      const compared = await savedPlans.compare(
        capture.scope,
        { kind: 'saved', savedPlanId: 'historical' },
        { kind: 'saved', savedPlanId: 'historical' },
      );
      expect(compared.outcome).toBe('compared');
      if (compared.outcome !== 'compared') throw new Error('historical comparison refused');
      expect(compared.left.provenance.kind).toBe(capture.provenance);
      expect(compared.right.provenance.kind).toBe(capture.provenance);
      expect(compared.diff).toEqual({ input: [], schedule: [] });
      expect(await source.history.savedPlans.readOf('historical')).toEqual(before);
    },
  );
test('stored original header mismatch refuses before legacy provenance projection', async () => {
  const { savedPlans, source } = await stored(cases[1], { headerVersion: 9 });
  const before = await source.history.savedPlans.readOf('historical');
  expect(await savedPlans.read('historical')).toMatchObject({
    outcome: 'corrupt',
    refusal: { reason: 'body_invalid', body: 'input', code: 'version', path: '$.schemaVersion' },
  });
  expect(await source.history.savedPlans.readOf('historical')).toEqual(before);
});
test('stored original byte hash is verified before any renamed projection', async () => {
  const original = fixture(cases[0].input);
  const { savedPlans } = await stored(cases[0], { alteredInput: original + ' ' });
  expect(await savedPlans.read('historical')).toMatchObject({
    outcome: 'corrupt',
    refusal: { reason: 'body_hash_mismatch', body: 'input' },
  });
});

test('actual current local save writes thirteen and three and retains captured local provenance', async () => {
  const { source } = await stored(cases[0]);
  const { savedPlans } = installSavedPlans({
    plans: source.history.savedPlans,
    capture: source.history.savedPlanCapture,
    digest: { sha256: (bytes) => Promise.resolve(sha(bytes)) },
    newId: () => 'current',
    now: () => 1,
    scheduler: fastScheduler,
  });
  expect(
    (await savedPlans.save({ workPackageId: 'p1', createdBy: 'owner', createdById: 'owner' }))
      .outcome,
  ).toBe('saved');
  const read = await savedPlans.read('current');
  expect(read.outcome).toBe('read');
  if (read.outcome !== 'read') throw new Error('current read refused');
  expect(read.plan.input.schemaVersion).toBe(13);
  expect(read.plan.schedule.present).toBe(true);
  if (!read.plan.schedule.present) throw new Error('current schedule absent');
  expect(read.plan.schedule.body.schemaVersion).toBe(3);
  const compared = await savedPlans.compare(
    'p1',
    { kind: 'saved', savedPlanId: 'current' },
    { kind: 'saved', savedPlanId: 'current' },
  );
  expect(compared.outcome).toBe('compared');
  if (compared.outcome !== 'compared') throw new Error('current comparison refused');
  expect(compared.left.provenance.kind).toBe('local');
  expect(compared.diff).toEqual({ input: [], schedule: [] });
});

test('stored schedule header is checked against original body before two-to-four projection', async () => {
  const { savedPlans, source } = await stored(cases[2], { scheduleHeaderVersion: 4 });
  const before = await source.history.savedPlans.readOf('historical');
  expect(await savedPlans.read('historical')).toMatchObject({
    outcome: 'corrupt',
    refusal: { reason: 'body_invalid', body: 'schedule', code: 'version', path: '$.version' },
  });
  expect(await source.history.savedPlans.readOf('historical')).toEqual(before);
});
