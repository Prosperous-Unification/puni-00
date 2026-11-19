import type { StoredTypedDependency } from '@wbs/core';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import { type OpenCase, storeCase } from './store-case';

/** Whether a call refused, synchronously or by rejecting; `.rejects` cannot be awaited under Bun's types. */
async function refusesCall(call: () => unknown): Promise<boolean> {
  try {
    await call();
    return false;
  } catch {
    return true;
  }
}

/** One shared contract for typed relationship identity and bulk deletion. */
export function typedDependencyRegistrations(
  open: OpenCase<'typedDependencies'>,
): readonly CaseRegistration[] {
  return [
    storeCase(
      'typedDependencies',
      'typedDependencies.write:identity-and-bulk',
      open,
      async ({ port, seed }) => {
        const [firstId, secondId] = seed.workItemIds[0];
        const workPackageId = seed.workPackageIds[0];
        const row: StoredTypedDependency = {
          id: 'typed-one',
          workPackageId,
          predecessor: { workPackageId, scope: 'whole', workItemId: firstId },
          successor: { workPackageId, scope: 'whole', workItemId: secondId },
          type: 'FS',
        };
        const changed: StoredTypedDependency = {
          ...row,
          successor: {
            workPackageId,
            scope: 'node',
            workItemId: secondId,
            stepId: seed.stepIds[0][0],
          },
        };
        expect(await port.listByWorkPackage(workPackageId)).toEqual([]);
        await port.add(row, seed.stamps[0]);
        expect(await refusesCall(() => port.add(row, seed.stamps[0]))).toBe(true);
        expect(await refusesCall(() => port.add({ ...row, id: 'typed-two' }, seed.stamps[0]))).toBe(
          true,
        );
        await port.update(changed, seed.stamps[1]);
        expect(await port.listByWorkPackage(workPackageId)).toEqual([changed]);
        expect(await port.removeAllFor([firstId], seed.stamps[1])).toEqual([changed]);
        expect(await port.listByWorkPackage(workPackageId)).toEqual([]);
        const remoteWorkPackageId = seed.workPackageIds[1];
        const external: StoredTypedDependency = {
          ...row,
          predecessor: {
            workPackageId: remoteWorkPackageId,
            scope: 'whole',
            workItemId: seed.workItemIds[1][0],
          },
        };
        await port.add(row, seed.stamps[0]);
        await port.update(external, seed.stamps[1]);
        expect(await port.listByWorkPackage(remoteWorkPackageId)).toEqual([]);
        expect(await port.listByWorkPackage(workPackageId)).toEqual([external]);
        expect(
          await port.listIncident([remoteWorkPackageId, workPackageId, remoteWorkPackageId]),
        ).toEqual([external]);
        expect(await port.listIncident([])).toEqual([]);
        expect(
          await refusesCall(() =>
            port.removeAllFor([external.predecessor.workItemId], seed.stamps[1]),
          ),
        ).toBe(true);
        await port.update(row, seed.stamps[1]);
        expect(await port.listIncident([remoteWorkPackageId])).toEqual([]);
        expect(await port.listByWorkPackage(workPackageId)).toEqual([row]);
        await port.remove(row.id, seed.stamps[1]);
        expect(await port.listByWorkPackage(workPackageId)).toEqual([]);
      },
    ),
  ];
}
