import { getWorkItems, validateSchema } from '@wbs/contracts';
import { afterEach, describe, expect, it } from 'bun:test';

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

for (const mode of ['isolated', 'shared'] as const) {
  describe(`resource levelling on the plan read (${mode})`, () => {
    it(`levels a demanded resource (${mode})`, async () => {
      const harness = OrganizationHarness.openComposedWith({
        supportedCapacityModes: ['isolated', 'shared'],
      });
      h = harness;
      await harness.register('ada');
      harness.organization('org-a');
      harness.member('org-a', 'ada', 'member');
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
      const declared = await harness.call('ada', 'POST', '/api/directory/commands', {
        commands: [
          { kind: 'createResource', name: 'staging', resourceKind: 'exclusive', unitLabel: 'env' },
        ],
      });
      expect(declared.status).toBe(200);
      const staging = (declared.body as { results: { id?: string }[] }).results.at(0)?.id;
      if (staging === undefined) throw new Error('staging minted no id');
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
          throw new Error(
            `the tree read failed its own contract: ${JSON.stringify(parsed.issues)}`,
          );
        return parsed.value as unknown as {
          slices: ReadSlice[];
          resourceLabels?: { id: string; name: string; unitLabel: string }[];
          demands?: { workItemId: string; resourceId: string; units: number }[];
          demandedResources?: { id: string; name: string; kind: string; unitLabel: string }[];
        };
      };
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
  });
}
