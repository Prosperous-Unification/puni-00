import type { ValueGroupPlacement } from '@wbs/core';

import { type Connection, type Drizzle, observeCommitted } from './db';

interface StepFactReader {
  listByWorkPackage(
    workPackageId: string,
  ): Promise<readonly { readonly workItemId: string; readonly stepId: string }[]>;
  listByWorkItems(
    workPackageId: string,
    ids: readonly string[],
  ): Promise<readonly { readonly workItemId: string; readonly stepId: string }[]>;
  listPlacements(
    workPackageId: string,
    ids: readonly string[],
  ): Promise<readonly ValueGroupPlacement[]>;
}

/** Public value queries borrow the existing committed read pool; writes and admitted loans retain their actual owners. */
export function ownStepFactReads<Store extends StepFactReader>(
  writer: Store,
  openConnection: () => Connection,
  createReader: (db: Drizzle) => Store,
): Store {
  const read = <Value>(project: (reader: Store) => Promise<Value>) =>
    observeCommitted(openConnection, (snapshot) => project(createReader(snapshot)));
  return new Proxy(writer, {
    get(target, key, receiver) {
      switch (key) {
        case 'listByWorkPackage':
          return (workPackageId: string) =>
            read((reader) => reader.listByWorkPackage(workPackageId));
        case 'listByWorkItems':
          return (workPackageId: string, ids: readonly string[]) => {
            const retained = [...ids];
            return read((reader) => reader.listByWorkItems(workPackageId, retained));
          };
        case 'listPlacements':
          return (workPackageId: string, ids: readonly string[]) => {
            const retained = [...ids];
            return read((reader) => reader.listPlacements(workPackageId, retained));
          };
      }
      const member: unknown = Reflect.get(target, key, receiver);
      return typeof member === 'function'
        ? (...args: unknown[]): unknown => Reflect.apply(member, target, args)
        : member;
    },
  });
}
