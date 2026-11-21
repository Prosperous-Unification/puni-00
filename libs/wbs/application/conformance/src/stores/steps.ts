import type { Step } from '@wbs/core';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import type { SeededPlan } from '../source-declaration';
import { type OpenCase, storeCase } from './store-case';

function readSeedSteps(seed: SeededPlan, index: 0 | 1): Step[] {
  return [
    {
      id: seed.stepIds[index][0],
      workPackageId: seed.workPackageIds[index],
      name: index === 0 ? 'Dev' : 'Other Dev',
      code: index === 0 ? 'dev' : 'b-dev',
      position: 10,
      allowancePercent: 0,
      estimateUnit: 'workdays',
    },
    {
      id: seed.stepIds[index][1],
      workPackageId: seed.workPackageIds[index],
      name: index === 0 ? 'QA' : 'Other QA',
      code: index === 0 ? 'qa' : 'b-qa',
      position: 20,
      allowancePercent: 0,
      estimateUnit: 'workdays',
    },
  ];
}

/** Current Source projection reads; catalogue writers own definition/binding authoring. */
export function stepRegistrations(open: OpenCase<'steps'>): readonly CaseRegistration[] {
  return [
    storeCase('steps', 'steps.listByWorkPackage:resolved-scope', open, async ({ port, seed }) => {
      // Proof: both real Source value faults change the projected name. Omitting
      // these two comparisons makes both fault proofs assertion-passed
      // (step-reader-effect-resolved-oracles-v1); exact restored controls pass.
      expect(await port.listByWorkPackage(seed.workPackageIds[0])).toEqual(readSeedSteps(seed, 0));
      expect(await port.listByWorkPackage(seed.workPackageIds[1])).toEqual(readSeedSteps(seed, 1));
    }),
    storeCase('steps', 'steps.listByWorkPackage:unknown', open, async ({ port, seed }) => {
      const before = await port.listByWorkPackage(seed.workPackageIds[0]);
      expect(before).toEqual(readSeedSteps(seed, 0));
      // Proof: omitting this comparison admits actual sibling rows in both
      // Source fault owners (step-reader-effect-unknown-oracle-v1).
      expect(await port.listByWorkPackage('no-such-work-package')).toEqual([]);
      expect(await port.listByWorkPackage(seed.workPackageIds[0])).toEqual(before);
    }),
    storeCase('steps', 'steps.listByWorkPackage:detached', open, async ({ port, seed }) => {
      const selected = await port.listByWorkPackage(seed.workPackageIds[0]);
      const before = structuredClone(selected);
      expect(before).toEqual(readSeedSteps(seed, 0));
      const first = selected.at(0);
      if (first === undefined) throw new Error('current step detachment fixture is empty');
      first.name = 'Caller mutation';
      first.allowancePercent = 33;
      selected.reverse();
      selected.push({ ...first, id: 'caller-only-step' });
      // Proof: omitting this comparison admits the same actual reply array in
      // both Source fault owners (step-reader-effect-detachment-oracle-v1).
      expect(await port.listByWorkPackage(seed.workPackageIds[0])).toEqual(before);
      expect(await port.listByWorkPackage(seed.workPackageIds[1])).toEqual(readSeedSteps(seed, 1));
    }),
  ];
}
