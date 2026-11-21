import type { SpaceStore } from '@wbs/core';

import { type Connection, observeCommitted } from './db';
import { OPEN } from './gate';
import { SpaceRepository } from './space';

/** Public contents use Source's committed read pool, while writes retain their existing coordinator. */
export function ownSpaceContents(writer: SpaceStore, openConnection: () => Connection): SpaceStore {
  return new Proxy(writer, {
    get(target, key, receiver) {
      if (key === 'readContents') {
        return (organizationId: string, spaceId: string) =>
          observeCommitted(openConnection, (snapshot) =>
            new SpaceRepository(snapshot, OPEN).readContents(organizationId, spaceId),
          );
      }
      const operation: unknown = Reflect.get(target, key, receiver);
      // SpaceStore's Promise-only protocol requires the original repository as receiver at this dynamic boundary.
      return typeof operation === 'function'
        ? (...args: unknown[]): unknown => Reflect.apply(operation, target, args)
        : operation;
    },
  });
}
