import type { MeasureStore } from '@wbs/core';
import type { MeasureEstimateStore, StepNodeAttemptStore } from '@wbs/core';

import type { Drizzle } from './db';
import { type Connection, observeCommitted } from './db';
import { OPEN } from './gate';
import { MeasureEstimateRepository } from './measure-estimate';
import { ownStepFactReads } from './point-read-owner';
import { StepMeasureRepository } from './step-measure';
import { StepNodeAttemptRepository } from './step-node-attempt';

/** Public trios use Source's existing read pool; prototype methods are delegated with their actual writer receiver. */
export function ownMeasureEstimateReads<Store extends MeasureEstimateStore>(
  writer: Store,
  openConnection: () => Connection,
): Store {
  return new Proxy(writer, {
    get(target, key, receiver) {
      if (key === 'listByWorkPackage')
        return (workPackageId: string) =>
          observeCommitted(openConnection, (snapshot) =>
            new MeasureEstimateRepository(snapshot, OPEN).listByWorkPackage(workPackageId),
          );
      const member: unknown = Reflect.get(target, key, receiver);
      return typeof member === 'function'
        ? (...args: unknown[]): unknown => Reflect.apply(member, target, args)
        : member;
    },
  });
}

/** Each numbered-history or counter operation owns one coherent pooled snapshot; writes stay on the Source writer. */
export function ownAttemptReads<Store extends StepNodeAttemptStore>(
  writer: Store,
  openConnection: () => Connection,
): Store {
  const read = <Value>(project: (reader: StepNodeAttemptStore) => Promise<Value>) =>
    observeCommitted(openConnection, (snapshot) =>
      project(new StepNodeAttemptRepository(snapshot, OPEN)),
    );
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
        case 'listOfWorkItem':
          return (workItemId: string) => read((reader) => reader.listOfWorkItem(workItemId));
        case 'listIssued':
          return (workPackageId: string, ids: readonly string[]) => {
            const retained = [...ids];
            return read((reader) => reader.listIssued(workPackageId, retained));
          };
      }
      const member: unknown = Reflect.get(target, key, receiver);
      return typeof member === 'function'
        ? (...args: unknown[]): unknown => Reflect.apply(member, target, args)
        : member;
    },
  });
}

/** Full, targeted, placement and definition observations all borrow Source's actual committed read pool. */
export function ownMeasureReads<Store extends MeasureStore>(
  writer: Store,
  openConnection: () => Connection,
  createReader: (db: Drizzle) => Store,
): Store {
  const observed = ownStepFactReads(writer, openConnection, createReader);
  return new Proxy(observed, {
    get(target, key, receiver) {
      if (key === 'definitionsFor')
        return (workPackageId: string) =>
          observeCommitted(openConnection, (snapshot) =>
            new StepMeasureRepository(snapshot, OPEN).definitionsFor(workPackageId),
          );
      const member: unknown = Reflect.get(target, key, receiver);
      return typeof member === 'function'
        ? (...args: unknown[]): unknown => Reflect.apply(member, target, args)
        : member;
    },
  });
}
