import type { WorkPackageStore } from '@wbs/core';

import { type Connection, observeCommitted } from './db';
import { OPEN } from './gate';
import { WorkPackageRepository } from './work-package';

/**
 * Public raw package projections borrow this Source's existing read pool. Metadata,
 * actual settings chain and overrides share the loan. Writes remain on the raw
 * writer, whose internal rereads must stay on its transaction instead of this pool.
 */
export function ownWorkPackageReads(
  writer: WorkPackageStore,
  openConnection: () => Connection,
): WorkPackageStore {
  const read = <Value>(project: (borrowed: WorkPackageStore) => Promise<Value>) =>
    observeCommitted(openConnection, (snapshot) =>
      project(new WorkPackageRepository(snapshot, OPEN, 'borrowed')),
    );
  return new Proxy(writer, {
    get(target, key, receiver) {
      switch (key) {
        case 'findById':
          return (...args: Parameters<WorkPackageStore['findById']>) =>
            read((borrowed) => borrowed.findById(...args));
        case 'findInOrganization':
          return (...args: Parameters<WorkPackageStore['findInOrganization']>) =>
            read((borrowed) => borrowed.findInOrganization(...args));
        case 'findBySolutionSlug':
          return (...args: Parameters<WorkPackageStore['findBySolutionSlug']>) =>
            read((borrowed) => borrowed.findBySolutionSlug(...args));
        case 'findBySolutionSlugInOrganization':
          return (...args: Parameters<WorkPackageStore['findBySolutionSlugInOrganization']>) =>
            read((borrowed) => borrowed.findBySolutionSlugInOrganization(...args));
        case 'list':
          return (...args: Parameters<WorkPackageStore['list']>) =>
            read((borrowed) => borrowed.list(...args));
        case 'listFor':
          return (...args: Parameters<WorkPackageStore['listFor']>) =>
            read((borrowed) => borrowed.listFor(...args));
        case 'listForInOrganization':
          return (...args: Parameters<WorkPackageStore['listForInOrganization']>) =>
            read((borrowed) => borrowed.listForInOrganization(...args));
        case 'stepsOf':
          return (...args: Parameters<WorkPackageStore['stepsOf']>) => read((borrowed) => borrowed.stepsOf(...args));
        case 'timezoneOf':
          return (...args: Parameters<WorkPackageStore['timezoneOf']>) =>
            read((borrowed) => borrowed.timezoneOf(...args));
      }
      const member: unknown = Reflect.get(target, key, receiver);
      return typeof member === 'function'
        ? (...args: unknown[]): unknown => Reflect.apply(member, target, args)
        : member;
    },
  });
}
