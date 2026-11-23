import { expect } from 'bun:test';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';
import type { StepCatalogueCaseId } from './step-catalogue';

/** Actual catalogue birth and safe unbinding, leaving physical values owned by their packages. */
async function defineUnboundStep(
  fixture: StepCatalogueFixture,
  organizationId: string,
  projectId: string,
  code: string,
): Promise<void> {
  const { port, seed } = fixture;
  expect(
    await port.defineAndBindStep(
      organizationId,
      {
        id: code,
        code,
        name: code,
        defaultEstimateUnit: 'minutes',
        defaultAllowancePercent: 3,
        position: 10,
      },
      {
        bindingId: code + ':binding',
        scopeKind: 'project',
        scopeId: projectId,
        workItemTypeId: null,
        position: 10,
      },
      seed.stamp,
    ),
  ).toMatchObject({ ok: true });
  expect(
    await port.unbindStep(organizationId, code + ':binding', { dryRun: false }, seed.stamp),
  ).toMatchObject({ kind: 'unbound' });
}

export const STEP_RETIRED_CODE_ASSERTIONS: readonly {
  readonly caseId: StepCatalogueCaseId;
  assert(fixture: StepCatalogueFixture): Promise<void>;
}[] = [
  {
    // Proof: replacing either real adapter's retired-code read with [] failed this
    // assertion on its actual Source (catalogue-retired-census-fault-{memory,sqlite}-read-v1).
    caseId: 'stepCatalogue.readRetiredCodes:owned-detached-state',
    async assert(fixture) {
      const { port, seed } = fixture;
      expect(await port.readRetiredCodes(seed.organizationId)).toEqual([]);
      expect(await port.readRetiredCodes('absent-retirement-owner')).toBeNull();
      for (const code of ['alpha', 'zeta', 'active'])
        await defineUnboundStep(fixture, seed.organizationId, seed.projectId, code);
      await defineUnboundStep(
        fixture,
        seed.foreignOrganizationId,
        seed.foreignProjectId,
        'foreign-only',
      );
      expect(await port.retireStepDefinition(seed.organizationId, 'alpha', seed.stamp)).toEqual({
        ok: true,
      });
      const first = await port.readRetiredCodes(seed.organizationId);
      expect(first).toEqual(['alpha']);
      if (first === null) throw new Error('Actual retirement owner disappeared');
      expect(await port.retireStepDefinition(seed.organizationId, 'zeta', seed.stamp)).toEqual({
        ok: true,
      });
      expect(
        await port.retireStepDefinition(seed.foreignOrganizationId, 'foreign-only', seed.stamp),
      ).toEqual({ ok: true });
      expect(first).toEqual(['alpha']);
      const before = fixture.readEvidence();
      const codes = await port.readRetiredCodes(seed.organizationId);
      expect(codes).toEqual(['alpha', 'zeta']);
      if (codes === null) throw new Error('Actual retirement owner disappeared');
      Reflect.set(codes, 0, 'caller-mutation');
      expect(await port.readRetiredCodes(seed.organizationId)).toEqual(['alpha', 'zeta']);
      expect(await port.readRetiredCodes(seed.foreignOrganizationId)).toEqual(['foreign-only']);
      expect(
        (await port.readCatalogue(seed.organizationId))?.definitions.map(({ code }) => code),
      ).toEqual(['active']);
      expect(fixture.readEvidence()).toEqual(before);
    },
  },
  {
    // Proof: neutralizing the read's combined loan fences settled both ordinary
    // and repair outcomes as false in both Sources before this case failed
    // (catalogue-retired-census-fault-loan-fences-v1). Not independent fence proofs.
    caseId: 'stepCatalogue.readRetiredCodes:writer-snapshot-and-rollback',
    async assert(fixture) {
      const { source, port, seed } = fixture;
      for (const settlement of ['refuse', 'throw', 'commit'] as const) {
        const code = 'loan-' + settlement;
        await defineUnboundStep(fixture, seed.organizationId, seed.projectId, code);
        const before = fixture.readEvidence();
        const expired: (() => Promise<unknown>)[] = [];
        const abort = new Error('intentional retirement read rollback');
        const transaction = source.uow.run(async ({ stores }) => {
          expired.push(() => stores.stepCatalogue.readRetiredCodes(seed.organizationId));
          expect(await stores.stepCatalogue.readRetiredCodes(seed.organizationId)).toEqual([]);
          expect(
            await stores.stepCatalogue.retireStepDefinition(seed.organizationId, code, seed.stamp),
          ).toEqual({ ok: true });
          expect(await stores.stepCatalogue.readRetiredCodes(seed.organizationId)).toEqual([code]);
          expect(await port.readRetiredCodes(seed.organizationId)).toEqual([]);
          if (settlement === 'throw') throw abort;
          if (settlement === 'commit') return { commit: true, value: undefined };
          return {
            commit: false,
            value: undefined,
            afterRollback: async (repaired) => {
              expired.push(() =>
                repaired.stores.stepCatalogue.readRetiredCodes(seed.organizationId),
              );
              expect(
                await repaired.stores.stepCatalogue.readRetiredCodes(seed.organizationId),
              ).toEqual([]);
            },
          };
        });
        await transaction.then(
          () => {
            expect(settlement).not.toBe('throw');
          },
          (cause: unknown) => {
            expect(settlement).toBe('throw');
            expect(cause).toBe(abort);
          },
        );
        expect(expired).toHaveLength(settlement === 'refuse' ? 2 : 1);
        const closed = await Promise.allSettled(expired.map((read) => read()));
        expect(
          closed.map(
            (reading) =>
              reading.status === 'rejected' &&
              reading.reason instanceof Error &&
              reading.reason.message.includes('closed'),
          ),
        ).toEqual(settlement === 'refuse' ? [true, true] : [true]);
        expect(await port.readRetiredCodes(seed.organizationId)).toEqual(
          settlement === 'commit' ? ['loan-commit'] : [],
        );
        if (settlement !== 'commit') expect(fixture.readEvidence()).toEqual(before);
      }
    },
  },
];
