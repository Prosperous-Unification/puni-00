import type { Step } from '@wbs/core';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import { type OpenCase, storeCase } from './store-case';

/** The original shared step cases, retaining their stable case IDs. */
export function stepRegistrations(open: OpenCase<'steps'>): readonly CaseRegistration[] {
  return [
    storeCase('steps', 'steps.add', open, async ({ port, seed }) => {
      const workPackageId = seed.workPackageIds[0];
      const added = await port.add(
        {
          id: `${workPackageId}:step-added`,
          workPackageId,
          name: 'Wiring',
          allowancePercent: 0,
          estimateUnit: 'workdays' as const,
        },
        seed.stamps[0],
      );
      expect(added.ok).toBe(true);
      const names = (await port.listByWorkPackage(workPackageId)).map(({ name }) => name);
      // Proof: `reinjects the existing add, rename, estimate, remove, range, and prune faults`
      // ran `break:steps.add`; this failed on `Expected to contain: "Wiring" ·
      // Received: ["Dev", "QA", "faulted add"]`.
      expect(names).toContain('Wiring');
    }),
    storeCase('steps', 'steps.rename', open, async ({ port, seed }) => {
      const stepId = seed.stepIds[0][0];
      const renamed = await port.rename(seed.workPackageIds[0], stepId, 'Renamed', seed.stamps[0]);
      expect(renamed.ok).toBe(true);
      const found = (await port.listByWorkPackage(seed.workPackageIds[0])).find(
        (step: Step) => step.id === stepId,
      );
      // Proof: `reinjects the existing add, rename, estimate, remove, range, and prune faults`
      // ran `break:steps.rename`; this failed on `Expected: "Renamed" ·
      // Received: "faulted rename"`.
      expect(found?.name).toBe('Renamed');
    }),
    storeCase('steps', 'steps.rename:unknown', open, async ({ port, seed }) => {
      const renamed = await port.rename(
        seed.workPackageIds[0],
        'no-such-step',
        'Renamed',
        seed.stamps[0],
      );
      expect(renamed.ok).toBe(false);
    }),
  ];
}
