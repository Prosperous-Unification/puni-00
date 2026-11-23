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
            id: seed.stepIds[0][0],
            workPackageId: workPackage.id,
            name: 'Dev',
            position: 10,
            code: 'dev',
            allowancePercent: 0,
            estimateUnit: 'workdays' as const,
          },
          {
            id: seed.stepIds[0][1],
            workPackageId: workPackage.id,
            name: 'QA',
            position: 20,
            code: 'qa',
            allowancePercent: 0,
            estimateUnit: 'workdays' as const,
          },
        ];

        expect(await port.create(workPackage, [], { at: 300, by: seed.ownerIds[0] })).toEqual(
          workPackage,
        );
        expect(await readers.workPackages.findById(workPackage.id)).toEqual(workPackage);
        // The new package inherits existing project definitions; it authors none.
        // Proof: both actual Source fault owners remove the newborn's explicit
        // rows; this read names step-a-dev through WorkPackageStepMissing, then
        // each exact healthy after-control passes.
        expect(await readers.workPackages.stepsOf(workPackage.id)).toEqual(steps);
      },
    ),
    storeCase(
      'workPackages',
      // Proof: required-registration removes this production case; the independent
      // current Source inventory fails with its mandatory snapshot identity absent.
      'workPackages.createWithSteps:catalogue-snapshot',
      open,
      async ({ port, readers, seed }) => {
        const parent = await readers.workPackages.findById(seed.workPackageIds[0]);
        if (parent === null) throw new Error('actual snapshot creation parent is absent');
        const workPackage = {
          ...parent,
          id: 'work-package-snapshot-created',
          name: 'Captured current birth',
          abbreviation: 'SNAP',
          revision: 0,
          createdAt: 300,
        };
        const born = await port.createWithSteps(
          workPackage,
          { at: 300, by: seed.ownerIds[0] },
          { kind: 'legacy' },
        );
        if (typeof born === 'string') throw new Error('current snapshot birth refused: ' + born);
        expect(born.workPackage).toMatchObject({
          id: workPackage.id,
          name: workPackage.name,
          projectId: parent.projectId,
          revision: 0,
          createdAt: 300,
        });
        expect(born.steps.map(({ id }) => id)).toEqual([...seed.stepIds[0]]);
        expect(born.steps.every((step) => step.workPackageId === workPackage.id)).toBe(true);
        expect(await readers.workPackages.findById(workPackage.id)).toEqual(born.workPackage);
        expect(await readers.workPackages.stepsOf(workPackage.id)).toEqual(born.steps);
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
