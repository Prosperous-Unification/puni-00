import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import { type OpenCase, storeCase } from './store-case';

/** The original shared directory cases, retaining their stable case IDs. */
export function directoryRegistrations(open: OpenCase<'directory'>): readonly CaseRegistration[] {
  return [
    storeCase('directory', 'directory.addTag', open, async ({ port, seed }) => {
      await port.addTag({ id: 'tag-urgent', name: 'urgent' }, seed.stamps[0]);
      expect((await port.listTags()).map(({ name }) => name)).toContain('urgent');
    }),
    storeCase('directory', 'directory.assign:unknown_person', open, async ({ port, seed }) => {
      const workItemId = seed.workItemIds[0][0];
      const assigned = await port.assign(
        workItemId,
        seed.stepIds[0][0],
        'nobody-by-that-id',
        seed.stamps[0],
      );
      expect(assigned).toEqual({ ok: false, reason: 'unknown_person' });
      expect(await port.assignmentsFor(workItemId)).toEqual([]);
    }),
  ];
}
