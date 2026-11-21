import type { EstimateStore } from '@wbs/core';

import { type Connection, observeCommitted } from './db';
import { EstimateRepository } from './estimate';
import { OPEN } from './gate';

/** Public value observations borrow Source's existing committed read pool; target preflight and writes retain their existing owners. */
export function ownEstimateReads(
  writer: EstimateStore,
  openConnection: () => Connection,
): EstimateStore {
  const read = <Value>(project: (borrowed: EstimateStore) => Promise<Value>) =>
    observeCommitted(openConnection, (snapshot) => project(new EstimateRepository(snapshot, OPEN)));
  return new Proxy(writer, {
    get(target, key, receiver) {
      switch (key) {
        case 'listByWorkPackage':
          return (workPackageId: string) =>
            read((borrowed) => borrowed.listByWorkPackage(workPackageId));
        case 'listByWorkItems':
          return (workPackageId: string, ids: readonly string[]) => {
            const retained = [...ids];
            return read((borrowed) => borrowed.listByWorkItems(workPackageId, retained));
          };
        case 'listPlacements':
          return (workPackageId: string, ids: readonly string[]) => {
            const retained = [...ids];
            return read((borrowed) => borrowed.listPlacements(workPackageId, retained));
          };
      }
      const member: unknown = Reflect.get(target, key, receiver);
      return typeof member === 'function'
        ? (...args: unknown[]): unknown => Reflect.apply(member, target, args)
        : member;
    },
  });
}
