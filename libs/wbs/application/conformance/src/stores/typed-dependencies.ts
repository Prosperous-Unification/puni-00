import type { StoredTypedDependency } from '@wbs/core';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import { type OpenCase, storeCase } from './store-case';

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
        const projectId = seed.projectIds[0];
        const row: StoredTypedDependency = {
          id: 'typed-one',
          projectId,
          predecessor: { scope: 'whole', workItemId: firstId },
          successor: { scope: 'whole', workItemId: secondId },
          type: 'FS',
        };
        const changed: StoredTypedDependency = {
          ...row,
          successor: { scope: 'node', workItemId: secondId, stepId: seed.stepIds[0][0] },
        };
        expect(await port.listByProject(projectId)).toEqual([]);
        await port.add(row, seed.stamps[0]);
        expect(port.add(row, seed.stamps[0])).rejects.toThrow();
        expect(port.add({ ...row, id: 'typed-two' }, seed.stamps[0])).rejects.toThrow();
        await port.update(changed, seed.stamps[1]);
        expect(await port.listByProject(projectId)).toEqual([changed]);
        expect(await port.removeAllFor([firstId], seed.stamps[1])).toEqual([changed]);
        expect(await port.listByProject(projectId)).toEqual([]);
        await port.add(row, seed.stamps[0]);
        await port.remove(row.id, seed.stamps[1]);
        expect(await port.listByProject(projectId)).toEqual([]);
      },
    ),
  ];
}
