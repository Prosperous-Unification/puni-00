import type { Step, WorkPackage } from '@wbs/core';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import { type OpenCase, storeCase } from './store-case';

/** The shared work-package-store cases, scoped to creation, updates and access order. */
export function workPackageRegistrations(
  open: OpenCase<'workPackages'>,
): readonly CaseRegistration[] {
  return [
    storeCase(
      'workPackages',
      'workPackages.create:steps',
      open,
      async ({ port, readers, seed }) => {
        const workPackage = {
          id: 'work-package-created',
          name: 'Created work package',
          abbreviation: 'CRE',
          projectId: 'fixture-project',
          restricted: true,
          estimateMethod: 'realistic',
          depReach: 'anchor-slice',
          pertWeights: { optimistic: 2, realistic: 3, pessimistic: 4 },
          estimateRounding: 'round',
          startDate: '2026-09-12',
          solutionRef: {
            slug: 'created-work-package',
            url: 'https://example.test/created-work-package',
          },
          revision: 0,
          createdAt: 300,
          optimizationEnabled: true,
          scheduleEngine: 'optimized',
          scheduleObjective: 'time',
          budgetFactor: 1.5,
        } satisfies WorkPackage;
        const steps: Step[] = [
          {
            id: 'work-package-created-dev',
            workPackageId: workPackage.id,
            name: 'Build',
            position: 10,
            code: 'build',
            allowancePercent: 0,
            estimateUnit: 'workdays' as const,
          },
          {
            id: 'work-package-created-qa',
            workPackageId: workPackage.id,
            name: 'Verify',
            position: 20,
            code: 'verify',
            allowancePercent: 0,
            estimateUnit: 'workdays' as const,
          },
        ];

        expect(await port.create(workPackage, steps, { at: 300, by: seed.ownerIds[0] })).toEqual(
          workPackage,
        );
        expect(await readers.workPackages.findById(workPackage.id)).toEqual(workPackage);
        // Proof: `reinjects workPackage step, scope, and reader-order faults` omitted
        // the starting-step write; this failed with the expected two steps and
        // `Received: []`.
        expect(await readers.workPackages.stepsOf(workPackage.id)).toEqual(steps);
      },
    ),
    storeCase(
      'workPackages',
      'workPackages.update:scope',
      open,
      async ({ port, readers, seed }) => {
        const [workPackageA, workPackageB] = await Promise.all(
          seed.workPackageIds.map((workPackageId) => readers.workPackages.findById(workPackageId)),
        );
        expect(workPackageA).toMatchObject({ id: seed.workPackageIds[0], name: 'Work package 1' });
        expect(workPackageB).toMatchObject({ id: seed.workPackageIds[1], name: 'Work package 2' });

        expect(
          await port.update(
            seed.workPackageIds[0],
            { name: 'Renamed work package' },
            { at: 300, by: seed.ownerIds[0] },
          ),
        ).toMatchObject({ id: seed.workPackageIds[0], name: 'Renamed work package' });
        expect(
          await port.update(
            'work-package-missing',
            { name: 'Missing work package' },
            { at: 301, by: seed.ownerIds[0] },
          ),
        ).toBeNull();

        expect(await readers.workPackages.findById(seed.workPackageIds[0])).toMatchObject({
          id: seed.workPackageIds[0],
          name: 'Renamed work package',
        });
        // Proof: the same source fault broadened the update predicate; this
        // failed on `Expected: "WorkPackage 2"; Received: "Renamed workPackage"`.
        expect(await readers.workPackages.findById(seed.workPackageIds[1])).toEqual(workPackageB);
      },
    ),
    storeCase(
      'workPackages',
      'workPackages.recordOpen:reader-order',
      open,
      async ({ port, seed }) => {
        await port.recordOpen(seed.workPackageIds[0], { at: 100, by: seed.ownerIds[0] });
        await port.recordOpen(seed.workPackageIds[1], { at: 200, by: seed.ownerIds[0] });
        await port.recordOpen(seed.workPackageIds[0], { at: 200, by: seed.ownerIds[1] });

        const ownerA = await port.listFor(seed.ownerIds[0]);
        const ownerB = await port.listFor(seed.ownerIds[1]);
        expect(ownerA.map(({ name }) => name)).toEqual(['Work package 2', 'Work package 1']);
        expect(ownerA.map(({ lastOpenedAt }) => lastOpenedAt)).toEqual([200, 100]);
        // Proof: the same source fault ignored the access user; this failed
        // with expected `WorkPackage 1, WorkPackage 2` and received
        // `WorkPackage 2, WorkPackage 1`.
        expect(ownerB.map(({ name }) => name)).toEqual(['Work package 1', 'Work package 2']);
        expect(ownerB.map(({ lastOpenedAt }) => lastOpenedAt)).toEqual([200, null]);
      },
    ),
  ];
}
