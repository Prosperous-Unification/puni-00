import type { Clock } from '../../ports/clock';
import type { DirectoryStore } from '../../ports/directory-store';
import type {
  DirectoryWriteAddress,
  DirectoryWriteResolution,
} from '../../ports/fanout-capture-store';
import type { Broadcaster } from '../../ports/project-event';
import type { UnitOfWork } from '../../ports/unit-of-work';
import {
  type CommittedFanoutDelivery,
  type CommittedProjectEvent,
  recordCommittedFanout,
} from '../../service/committed-fanout';
import { DirectoryService, type DirectoryServiceOptions } from './directory.resource';

/**
 * A public invocation binds explicit caller access once. Each raw store
 * mutation owns its own observation and UoW; compound service calls retain
 * their existing separate commits. Borrowed command stores stay raw.
 */
export function standaloneDirectoryService(options: {
  readonly directory: DirectoryStore;
  readonly uow: UnitOfWork;
  readonly clock: Clock;
  readonly announcements: Broadcaster;
  readonly delivery: CommittedFanoutDelivery;
}): DirectoryService {
  const { directory, uow, clock, announcements, delivery } = options;
  type Refusal = Extract<DirectoryWriteResolution, { ok: false }>['reason'];
  const unexpected = (reason: Refusal): never => {
    throw new Error(`standalone directory mutation unexpectedly refused: ${reason}`);
  };
  const standaloneWrite: NonNullable<DirectoryServiceOptions['standaloneWrite']> = async <T>(
    address: DirectoryWriteAddress,
    _refuse: (reason: Refusal) => T,
    act: (bound: DirectoryService) => Promise<T>,
    _accepted: (value: T) => boolean,
  ): Promise<T> => {
    // Proof: injecting an entry UoW before service validation made six invalid
    // inputs acquire six owners (expected zero) in the mounted directory test.
    if (address.access.kind === 'legacy')
      return act(new DirectoryService({ directory, broadcast: announcements, clock }));
    // Proof: replacing this invocation capture with a mutable latest-access
    // field made simultaneous A/B scoped renames answer A not_found (R5).
    const access = address.access;

    const recordMutation = async <Value>(
      writeAddress: DirectoryWriteAddress,
      refuse: (reason: Refusal) => Value,
      mutate: (borrowed: DirectoryStore) => Promise<Value>,
      accepted: (value: Value) => boolean,
    ): Promise<Value> => {
      const settled = await uow.run<{
        value: Value;
        events: readonly CommittedProjectEvent[];
      }>(async (scope) => {
        const capture = scope.fanoutCapture;
        if (capture?.resolveDirectoryWrite === undefined)
          throw new Error('standalone directory owner lacks borrowed capture or resolver');
        // Proof: resolving after capture called the throwing spy for a foreign
        // addressed person instead of returning typed not_found.
        const resolution = await capture.resolveDirectoryWrite(writeAddress);
        if (!resolution.ok)
          return { commit: false, value: { value: refuse(resolution.reason), events: [] } };
        // Proof: a post-cascade before capture lost the removed person's old
        // shared closure and the required downstream event.
        // Proof: reusing a prior raw mutation's before capture made the
        // compound person owner count test observe 3 captures, not 4.
        const before = await Promise.all(
          resolution.organizationIds.map((organizationId) => capture.capture(organizationId)),
        );
        const value = await mutate(scope.stores.directory);
        if (!accepted(value)) return { commit: false, value: { value, events: [] } };
        const events: CommittedProjectEvent[] = [];
        for (const [index, organizationId] of resolution.organizationIds.entries()) {
          const previous = before.at(index);
          if (previous === undefined) throw new Error('directory before capture disappeared');
          const after = await capture.capture(organizationId);
          // Proof: recording after the UoW persisted a cascade and revisions
          // when a later recipient event insert failed.
          events.push(
            ...(await recordCommittedFanout(scope.stores.eventLog, previous, after, () =>
              delivery.now(),
            )),
          );
        }
        return { commit: true, value: { value, events } };
      });
      // Proof: delivery inside the owner blocked an independent SQLite writer
      // while the recipient transport was held.
      if (settled.events.length > 0) await delivery.deliverCommitted(settled.events);
      return settled.value;
    };
    const refuseAbsent = (reason: Refusal) =>
      reason === 'not_found' ? { ok: false as const, reason } : unexpected(reason);
    const scopedMutation: Partial<DirectoryStore> = {
      renameInOrganization: (catalog, resourceId, organizationId, name, stamp) => {
        if (organizationId !== access.scope.organizationId)
          throw new Error('standalone rename changed invocation organization');
        return recordMutation(
          { kind: 'rename', catalog, resourceId, access },
          refuseAbsent,
          (borrowed) =>
            borrowed.renameInOrganization(catalog, resourceId, organizationId, name, stamp),
          (written) => written.ok,
        );
      },
      patchTeam: (teamId, patch, stamp) =>
        recordMutation(
          { kind: 'patch-team', teamId, serviceIds: patch.serviceIds, access },
          (reason) =>
            reason === 'unknown_service' ? { ok: false as const, reason } : refuseAbsent(reason),
          (borrowed) => borrowed.patchTeam(teamId, patch, stamp),
          (written) => written.ok,
        ),
      patchPerson: (personId, patch, stamp) =>
        recordMutation(
          { kind: 'patch-person', personId, teamIds: patch.teamIds, access },
          (reason) =>
            reason === 'unknown_team' ? { ok: false as const, reason } : refuseAbsent(reason),
          (borrowed) => borrowed.patchPerson(personId, patch, stamp),
          (written) => written.ok,
        ),
      addPerson: (person, teamIds, stamp) =>
        recordMutation(
          { kind: 'add-person', teamIds, access },
          (reason) =>
            reason === 'unknown_team' ? { ok: false as const, reason } : unexpected(reason),
          (borrowed) => borrowed.addPerson(person, teamIds, stamp),
          (written) => written.ok,
        ),
      removePerson: (personId, cascade, stamp) =>
        recordMutation(
          { kind: 'remove', catalog: 'people', resourceId: personId, access },
          refuseAbsent,
          (borrowed) => borrowed.removePerson(personId, cascade, stamp),
          (written) => written.ok,
        ),
      removeTeam: (teamId, cascade, stamp) =>
        recordMutation(
          { kind: 'remove', catalog: 'teams', resourceId: teamId, access },
          refuseAbsent,
          (borrowed) => borrowed.removeTeam(teamId, cascade, stamp),
          (written) => written.ok,
        ),
      removeTag: (tagId, cascade, stamp) =>
        recordMutation(
          { kind: 'remove', catalog: 'tags', resourceId: tagId, access },
          refuseAbsent,
          (borrowed) => borrowed.removeTag(tagId, cascade, stamp),
          (written) => written.ok,
        ),
      removeWorkItemType: (typeId, cascade, stamp) =>
        recordMutation(
          { kind: 'remove', catalog: 'workItemTypes', resourceId: typeId, access },
          refuseAbsent,
          (borrowed) => borrowed.removeWorkItemType(typeId, cascade, stamp),
          (written) => written.ok,
        ),
      removeService: (serviceId, cascade, stamp) =>
        recordMutation(
          { kind: 'remove', catalog: 'services', resourceId: serviceId, access },
          refuseAbsent,
          (borrowed) => borrowed.removeService(serviceId, cascade, stamp),
          (written) => written.ok,
        ),
      addTag: (row, stamp) =>
        recordMutation(
          { kind: 'add', catalog: 'tags', access },
          unexpected,
          (borrowed) => borrowed.addTag(row, stamp),
          () => true,
        ),
      addWorkItemType: (row, stamp) =>
        recordMutation(
          { kind: 'add', catalog: 'workItemTypes', access },
          unexpected,
          (borrowed) => borrowed.addWorkItemType(row, stamp),
          () => true,
        ),
      addService: (row, stamp) =>
        recordMutation(
          { kind: 'add', catalog: 'services', access },
          unexpected,
          (borrowed) => borrowed.addService(row, stamp),
          () => true,
        ),
      addTeam: (row, stamp) =>
        recordMutation(
          { kind: 'add', catalog: 'teams', access },
          unexpected,
          (borrowed) => borrowed.addTeam(row, stamp),
          () => true,
        ),
      addExternalSystem: (row, stamp) =>
        recordMutation(
          { kind: 'add', catalog: 'externalSystems', access },
          unexpected,
          (borrowed) => borrowed.addExternalSystem(row, stamp),
          () => true,
        ),
      mapInOrganization: (catalog, resourceId, organizationId, name) => {
        if (organizationId !== access.scope.organizationId)
          throw new Error('standalone map changed invocation organization');
        return recordMutation(
          { kind: 'add', catalog, access },
          unexpected,
          (borrowed) => borrowed.mapInOrganization(catalog, resourceId, organizationId, name),
          () => true,
        );
      },
    };
    const facade = new Proxy(directory, {
      get(target, property) {
        const owned: unknown = Reflect.get(scopedMutation, property);
        if (typeof owned === 'function') return owned;
        const borrowed: unknown = Reflect.get(target, property);
        if (typeof borrowed !== 'function') return borrowed;
        const bound: unknown = borrowed.bind(target);
        return bound;
      },
    });
    return act(new DirectoryService({ directory: facade, broadcast: announcements, clock }));
  };
  return new DirectoryService({ directory, broadcast: announcements, clock, standaloneWrite });
}
