import { getWorkItems, validateSchema } from '@wbs/contracts';
import { buildSolverRequestPair } from '@wbs/contracts/solver/solver-request-pair';
import { WorkItemService } from '@wbs/core';
import { scheduleInputOfCaptured, schedulePlanInput } from '@wbs/core/service/saved-plan-schedule';
import * as preparation from '@wbs/core/service/schedule-parts';
import { RollUpCache } from '@wbs/core/service/space.resource';
import type { ProjectRollUp, ResourceCapacity } from '@wbs/domain';
import { canonicalScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { afterEach, describe, expect, it, spyOn } from 'bun:test';

import { DirectoryRepository } from '../repository/directory';
import { scheduleInputHash } from '../repository/schedule-input-hash';
import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The plan read levels resource demands (`wbs-resources` R5) on both read
 * paths: an isolated organization's direct read, and a shared one's single
 * snapshot (`chain-snapshot.ts` over `readPlanInputIn`), which must read the
 * demands and resource capacities beside the tree or schedule as if neither
 * existed. Real SQLite, the production command routes, the production read.
 */
let h: OrganizationHarness | undefined;
afterEach(() => h?.close());

interface ReadSlice {
  workItemId: string;
  earliestStart: number;
  earliestFinish: number;
  boundBy: string;
  capacityTeamId: string | null;
  capacityResource?: { resourceId: string; units: number };
}

async function seedPlan(mode: 'isolated' | 'shared', role: 'member' | 'admin' = 'member') {
  const now = Date.parse('2026-10-05T00:00:00Z');
  const harness = OrganizationHarness.openComposedWith({
    supportedCapacityModes: ['isolated', 'shared'],
    now: () => now,
  });
  h = harness;
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', role);
  harness.bind('ada', 'org-a');
  harness.activate();
  if (mode === 'shared')
    harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  const created = await harness.call('ada', 'POST', '/api/projects', { name: 'Staging' });
  expect(created.status).toBe(200);
  const { project, steps } = created.body as {
    project: { id: string };
    steps: { id: string }[];
  };
  const batch = async (commands: unknown[]) => {
    const applied = await harness.call('ada', 'POST', `/api/projects/${project.id}/commands`, {
      commands,
    });
    expect(applied.status).toBe(200);
    return applied.body as { results: { id: string; ref: string }[] };
  };
  const made = await batch([
    { kind: 'createWorkItem', ref: 'one', parentId: null, afterId: null, name: 'One' },
    { kind: 'createWorkItem', ref: 'two', parentId: null, afterRef: 'one', name: 'Two' },
  ]);
  const leaves = ['one', 'two'].map((ref) => {
    const id = made.results.find((entry) => entry.ref === ref)?.id;
    if (id === undefined) throw new Error(`${ref} was not created`);
    return id;
  });
  await batch(
    leaves.flatMap((workItemId) =>
      steps.map((step) => ({
        kind: 'setEstimate',
        workItemId,
        stepId: step.id,
        days: { optimistic: 2, realistic: 2, pessimistic: 2 },
      })),
    ),
  );
  // Through the reader fe-01's client parses this route with, so a field the
  // chart draws from and the contract does not declare fails here first.
  const readTree = async () => {
    const answer = await harness.call('ada', 'GET', `/api/projects/${project.id}/work-items`);
    expect(answer.status).toBe(200);
    const [success] = getWorkItems.responses;
    const parsed = await validateSchema(success.schema, answer.body);
    if (parsed.issues !== undefined)
      throw new Error(`the tree read failed its own contract: ${JSON.stringify(parsed.issues)}`);
    return parsed.value as unknown as {
      slices: ReadSlice[];
      resourceLabels?: { id: string; name: string; unitLabel: string }[];
      demands?: { workItemId: string; resourceId: string; units: number }[];
      demandedResources?: { id: string; name: string; kind: string; unitLabel: string }[];
    };
  };
  return { harness, projectId: project.id, leaves, batch, readTree };
}

for (const mode of ['isolated', 'shared'] as const) {
  describe(`resource levelling on the plan read (${mode})`, () => {
    it(`levels a demanded resource (${mode})`, async () => {
      const { harness, leaves, batch, readTree } = await seedPlan(mode);
      const declared = await harness.call('ada', 'POST', '/api/directory/commands', {
        commands: [
          { kind: 'createResource', name: 'staging', resourceKind: 'exclusive', unitLabel: 'env' },
        ],
      });
      expect(declared.status).toBe(200);
      const staging = (declared.body as { results: { id?: string }[] }).results.at(0)?.id;
      if (staging === undefined) throw new Error('staging minted no id');
      const overlapping = (slices: readonly ReadSlice[]) =>
        slices.some((left) =>
          slices.some(
            (right) =>
              left !== right &&
              left.earliestStart < right.earliestFinish &&
              right.earliestStart < left.earliestFinish,
          ),
        );
      const unlevelled = await readTree();
      expect(overlapping(unlevelled.slices)).toBe(true);
      expect(unlevelled.resourceLabels).toBeUndefined();
      // A plan stating no demand keeps its payload shape.
      expect(unlevelled.demands).toBeUndefined();
      expect(unlevelled.demandedResources).toBeUndefined();

      await batch([
        { kind: 'setResourceCapacity', resourceId: staging, units: 1 },
        ...leaves.map((workItemId) => ({
          kind: 'setDemand',
          workItemId,
          resourceId: staging,
          units: 1,
        })),
      ]);
      const levelledTree = await readTree();
      const levelled = levelledTree.slices;
      // The bar's resource, labelled under the organization's own name.
      expect(levelledTree.resourceLabels).toEqual([
        { id: staging, name: 'staging', unitLabel: 'env' },
      ]);
      // Each leaf's own demand and the resource it names, under the
      // organization's own name, so a row's Resources cell reads the tree alone.
      // Proof: with the demands left off the read (`withDemands` answering the
      // tree unchanged), this failed on `expected undefined to deeply equal
      // [ { workItemId: …, resourceId: …, units: 1 }, … ]` in both modes.
      expect(levelledTree.demands).toEqual(
        [...leaves].sort().map((workItemId) => ({ workItemId, resourceId: staging, units: 1 })),
      );
      expect(levelledTree.demandedResources).toEqual([
        { id: staging, name: 'staging', kind: 'exclusive', unitLabel: 'env' },
      ]);
      expect(overlapping(levelled)).toBe(false);
      const waited = levelled.filter((slice) => slice.capacityResource !== undefined);
      expect(waited.length).toBeGreaterThan(0);
      for (const slice of waited)
        expect(slice).toMatchObject({
          boundBy: 'capacity',
          capacityTeamId: null,
          capacityResource: { resourceId: staging, units: 1 },
        });
    });
    it(`caches and captures a clamped plan (${mode})`, async () => {
      const { harness, projectId, leaves, batch, readTree } = await seedPlan(mode, 'admin');
      const plan = `/api/projects/${projectId}`;
      const command = async (draft: unknown) => {
        const answer = await harness.call('ada', 'POST', '/api/directory/commands', {
          commands: [draft],
        });
        expect(answer.status).toBe(200);
        return answer.body as { results: readonly { id?: string }[] };
      };
      const declared = await command({
        kind: 'createResource',
        name: 'host ram',
        resourceKind: 'divisible',
        unitLabel: 'GB',
      });
      const resourceId = declared.results.at(0)?.id;
      if (resourceId === undefined) throw new Error('RAM minted no id');
      const setDirectoryCapacity = (units: number | null) =>
        command({ kind: 'setDirectoryCapacity', resourceId, units });
      expect((await harness.call('ada', 'PATCH', plan, { startDate: '2026-10-05' })).status).toBe(
        200,
      );
      await batch([
        { kind: 'setResourceCapacity', resourceId, units: 32 },
        ...leaves.map((workItemId) => ({ kind: 'setDemand', workItemId, resourceId, units: 16 })),
      ]);

      const readRollUp = async () => {
        const answer = await harness.call(
          'ada',
          'GET',
          `/api/spaces/all/roll-ups?projectIds=${projectId}`,
        );
        expect(answer.status).toBe(200);
        const { rollUps } = answer.body as {
          rollUps: Record<string, ProjectRollUp | undefined>;
        };
        const rollUp = rollUps[projectId];
        if (!rollUp?.dates) throw new Error('Dated roll-up is absent');
        return { ...rollUp, dates: rollUp.dates };
      };
      const capture = async () => {
        const reads = await harness.capturePlanInput(projectId);
        if (reads === null) throw new Error('Admitted capture is absent');
        return reads;
      };
      const overlaps = (slices: readonly ReadSlice[]) =>
        slices.some((left) =>
          slices.some(
            (right) =>
              left.workItemId !== right.workItemId &&
              left.earliestStart < right.earliestFinish &&
              right.earliestStart < left.earliestFinish,
          ),
        );
      const cache = spyOn(RollUpCache.prototype, 'get');
      try {
        const slack = await readRollUp();
        expect(await readRollUp()).toEqual(slack);
        expect(cache.mock.results.at(-1)?.value).toMatchObject({ rollUp: slack });
        const slackHash = await harness.optimizationHash(projectId);
        expect(overlaps((await readTree()).slices)).toBe(true);

        await setDirectoryCapacity(16);
        const clamped = await readRollUp();
        expect(clamped.dates.endsOn > slack.dates.endsOn).toBe(true);
        expect(clamped.seq).toBeGreaterThan(slack.seq);
        const messages = harness.sqlite
          .query<{ message: string }, [string, number]>(
            'SELECT message FROM event_log WHERE subscription = ? AND seq > ? ORDER BY seq',
          )
          .all(`project:${projectId}`, slack.seq)
          .map(({ message }) => (JSON.parse(message) as { type: string }).type);
        expect(messages).toContain('directory_changed');
        const prepare = spyOn(preparation, 'prepareScheduleParts');
        try {
          expect(overlaps((await readTree()).slices)).toBe(false);
          expect(prepare.mock.calls.at(-1)?.[10]).toEqual([{ resourceId, units: 16 }]);
        } finally {
          prepare.mockRestore();
        }
        const liveHash = await harness.optimizationHash(projectId);
        expect(liveHash).not.toBe(slackHash);

        const frozen = await capture();
        expect(frozen.resourceCapacities).toEqual([{ resourceId, units: 32 }]);
        expect(frozen.directoryCapacities).toEqual([{ resourceId, units: 16 }]);
        const input = scheduleInputOfCaptured(frozen);
        expect(scheduleInputHash(input)).toBe(liveHash);
        const canonical = canonicalScheduleInput(input);
        const built = buildSolverRequestPair(input, '0.4.0', 30_000).time;
        if (!built.ok) throw new Error(built.detail);
        expect(built.request.resources).toEqual({ [resourceId]: 16 });
        expect(built.request.slices.map(({ demands }) => demands)).toEqual(
          input.slices.map(() => [{ resourceId, units: 16 }]),
        );

        const saved = await harness.call('ada', 'POST', `${plan}/saved-plans`, { name: 'Clamped' });
        expect(saved.status).toBe(201);
        const savedId = (saved.body as { savedPlan: { id: string } }).savedPlan.id;
        const archive = `/api/saved-plans/${savedId}`;
        const before = await harness.call('ada', 'GET', archive);
        expect(before.status).toBe(200);
        const stored = (
          before.body as {
            savedPlan: { schedule: { present: true; body: { bytes: string } } };
          }
        ).savedPlan.schedule;
        expect(stored.present).toBe(true);
        const storedWork = (
          JSON.parse(stored.body.bytes) as {
            workItems: Record<string, { earliestStart: number; earliestFinish: number }>;
          }
        ).workItems;
        for (const [id, { earliestStart, earliestFinish }] of schedulePlanInput(frozen).workItems)
          expect(storedWork[id]).toMatchObject({ earliestStart, earliestFinish });

        await setDirectoryCapacity(64);
        const next = await readRollUp();
        expect(next.seq).toBeGreaterThan(clamped.seq);
        expect(next.dates).toEqual(slack.dates);
        expect(await harness.optimizationHash(projectId)).toBe(slackHash);
        const current = await capture();
        expect(current.directoryCapacities).toEqual([{ resourceId, units: 64 }]);
        expect(scheduleInputHash(scheduleInputOfCaptured(current))).toBe(slackHash);
        const noLateRead = spyOn(
          DirectoryRepository.prototype,
          'directoryCapacitiesOf',
        ).mockRejectedValue(new Error('detached schedule tried to reread directory capacity'));
        try {
          expect(canonicalScheduleInput(scheduleInputOfCaptured(frozen))).toBe(canonical);
          const planned = schedulePlanInput(frozen);
          const finish = (placed: ReturnType<typeof schedulePlanInput>) =>
            Math.max(
              ...Array.from(placed.workItems.values(), ({ earliestFinish }) => earliestFinish),
            );
          expect(finish(planned)).toBeGreaterThan(finish(schedulePlanInput(current)));
          expect(noLateRead).not.toHaveBeenCalled();
        } finally {
          noLateRead.mockRestore();
        }
        expect(await harness.call('ada', 'GET', archive)).toEqual(before);
      } finally {
        cache.mockRestore();
      }
    });
    for (const scenario of mode === 'shared' ? ['scheduled', 'cycle'] : ['scheduled'])
      it(`uses the existing directory observation when arranging (${mode}, ${scenario})`, async () => {
        const { harness, projectId, leaves, batch } = await seedPlan(mode, 'admin');
        const response = await harness.call('ada', 'POST', '/api/directory/commands', {
          commands: [
            { kind: 'createResource', name: 'RAM', resourceKind: 'divisible', unitLabel: 'GB' },
          ],
        });
        expect(response.status).toBe(200);
        const resourceId = (response.body as { results: { id?: string }[] }).results[0]?.id;
        if (resourceId === undefined) throw new Error('RAM minted no id');
        await batch([
          { kind: 'setResourceCapacity', resourceId, units: 32 },
          ...leaves.map((workItemId) => ({ kind: 'setDemand', workItemId, resourceId, units: 16 })),
        ]);
        expect(
          (
            await harness.call('ada', 'POST', '/api/directory/commands', {
              commands: [{ kind: 'setDirectoryCapacity', resourceId, units: 16 }],
            })
          ).status,
        ).toBe(200);

        if (scenario === 'cycle') {
          const leaf = leaves.at(0);
          if (leaf === undefined) throw new Error('Missing cycle endpoint');
          harness.sqlite.run(
            'INSERT INTO dependency (id, project_id, predecessor_id, successor_id) VALUES (?, ?, ?, ?)',
            ['stored-cycle', projectId, leaf, leaf],
          );
        }

        const arrange = () =>
          harness.call('ada', 'POST', `/api/projects/${projectId}/commands`, {
            commands: [{ kind: 'arrangeBySchedule' }],
          });
        // The command's private live fallback and the captured SQLite queries
        // have separate owners. Poison just the fallback during a shared command.
        const prototype = WorkItemService.prototype as unknown as {
          readScheduleDirectoryCapacities(...args: unknown[]): Promise<ResourceCapacity[]>;
        };
        const fallback = spyOn(prototype, 'readScheduleDirectoryCapacities');
        if (mode === 'shared')
          fallback.mockRejectedValue(new Error('arrange read live D after capturing'));
        try {
          const answer = await arrange();
          if (mode === 'shared') expect(fallback).not.toHaveBeenCalled();
          else {
            expect(fallback).toHaveBeenCalledTimes(1);
            expect(await fallback.mock.results[0]?.value).toEqual([{ resourceId, units: 16 }]);
          }
          if (scenario === 'cycle')
            expect(answer).toMatchObject({ status: 409, body: { error: 'cycle' } });
          else expect(answer.status).toBe(200);
        } finally {
          fallback.mockRestore();
        }
      });
  });
}
