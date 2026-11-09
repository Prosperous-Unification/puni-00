import type { AccessDecisions } from '../../ports/access-decisions';
import { AnnouncementCollector } from '../../ports/announcement-collector';
import type { Clock } from '../../ports/clock';
import type { DirectoryStore } from '../../ports/directory-store';
import type {
  DirectoryWriteAddress,
  DirectoryWriteResolution,
} from '../../ports/fanout-capture-store';
import type { ResourceAccess } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/project-event';
import type { UnitOfWork } from '../../ports/unit-of-work';
import { type Authorization, authorize } from '../../service/authorize';
import {
  type CommittedFanoutDelivery,
  type CommittedProjectEvent,
  recordCommittedFanout,
} from '../../service/committed-fanout';
import { DirectoryService, type DirectoryServiceOptions } from './directory.resource';

/** Resources are written only inside a command batch (`wbs-resources`), never standalone. */
const STANDALONE_RESOURCE_WRITE = 'resource writes run only inside a command batch';

/**
 * A public invocation binds explicit caller access once. Each raw store
 * mutation owns its observation and UoW. Creation and removal include their
 * service preflights in that owner; compound rename/membership calls retain
 * separate commits. Service announcements leave only after successful
 * settlement. Borrowed command stores stay raw.
 *
 * It carries no organization limit gauge (`wbs-organization-limits` L10): a
 * count read here would not share the person write's unit of work, so a
 * scoped agent promotion or agent add through it throws. No production HTTP
 * route reaches person writes here; they go through a command batch.
 */
export function standaloneDirectoryService(options: {
  readonly directory: DirectoryStore;
  readonly accessDecisions?: AccessDecisions;
  readonly uow: UnitOfWork;
  readonly clock: Clock;
  readonly announcements: Broadcaster;
  readonly delivery: CommittedFanoutDelivery;
}): DirectoryService {
  const { directory, uow, clock, announcements, delivery } = options;
  type Refusal = Extract<DirectoryWriteResolution, { ok: false }>['reason'];
  type InvocationRefusal =
    | Extract<DirectoryWriteResolution, { ok: false }>
    | Extract<Authorization, { reason: 'forbidden' }>;
  const unexpected = (reason: Refusal): never => {
    throw new Error(`standalone directory mutation unexpectedly refused: ${reason}`);
  };
  const standaloneWrite: NonNullable<DirectoryServiceOptions['standaloneWrite']> = async <T>(
    address: DirectoryWriteAddress,
    actorId: string,
    refuseInvocation: (refusal: InvocationRefusal) => T,
    act: (bound: DirectoryService, access: ResourceAccess) => Promise<T>,
    acceptedInvocation: (value: T) => boolean,
  ): Promise<T> => {
    // Proof: retaining the caller alias substituted a granted account while queued; `retains the original standalone permission principal`
    // (command-permission.controller.db.test.ts) failed with the fault and passed restored, 2026-11-09.
    address = structuredClone(address);
    // Proof: injecting an entry UoW before service validation made six invalid
    // inputs acquire six owners (expected zero) in the mounted directory test.
    if (address.access.kind === 'legacy')
      return act(
        new DirectoryService({
          directory,
          accessDecisions: options.accessDecisions,
          broadcast: announcements,
          clock,
        }),
        address.access,
      );
    // Proof: replacing this invocation capture with a mutable latest-access
    // field made simultaneous A/B scoped renames answer A not_found (R5).
    const access = address.access;
    // Proof: removing actor coherence returned a refusal instead of throwing on mismatched trusted identity; `throws on a mismatched standalone principal`
    // (command-permission.controller.db.test.ts) failed with the fault and passed restored, 2026-11-09.
    // Proof: omitting invocation actor equality accepted seven direct service mismatch cases across directory/project creation; observed RED/GREEN, 2026-11-09.
    // Proof: direct-standalone-actor fault failed 'mismatched standalone.*actor' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
    if (access.principal.id !== access.scope.userId || access.principal.id !== actorId)
      throw new Error('standalone directory principal differs from its scoped account');
    class DirectoryRefused extends Error {
      constructor(readonly refusal: InvocationRefusal) {
        super(refusal.reason);
      }
    }

    const recordMutation = async <Value>(
      writeAddress: DirectoryWriteAddress,
      refuse: (reason: Refusal) => Value,
      mutate: (borrowed: DirectoryStore, decisions: AccessDecisions | undefined) => Promise<Value>,
      accepted: (value: Value) => boolean,
    ): Promise<Value> => {
      const settled = await uow.run<
        | {
            value: Value;
            events: readonly CommittedProjectEvent[];
          }
        | { readonly refusal: Extract<Authorization, { reason: 'forbidden' }> }
      >(async (scope) => {
        const capture = scope.fanoutCapture;
        if (capture?.resolveDirectoryWrite === undefined)
          throw new Error('standalone directory owner lacks borrowed capture or resolver');
        // Proof: skipping the current grant refusal admitted an existing-name create; `keeps an existing-name standalone add`
        // (command-permission.controller.db.test.ts) failed with the fault and passed restored, 2026-11-09.
        const authority = await authorize(
          scope.stores.accessDecisions,
          access.principal,
          { kind: 'organization', organizationId: access.scope.organizationId },
          'organization.manage_directory',
        );
        if (!authority.ok) {
          if (authority.reason !== 'forbidden')
            throw new Error('organization directory authority was unexpectedly invisible');
          return { commit: false, value: { refusal: authority } };
        }
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
        const value = await mutate(scope.stores.directory, scope.stores.accessDecisions);
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
      if ('refusal' in settled) throw new DirectoryRefused(settled.refusal);
      // Proof: delivery inside the owner blocked an independent SQLite writer
      // while the recipient transport was held.
      if (settled.events.length > 0) await delivery.deliverCommitted(settled.events);
      return settled.value;
    };
    // Proof: restoring separate raw owners retained an opaque root after mapping failed; `rolls back a standalone opaque root`
    // (command-permission.controller.db.test.ts) failed with the fault and passed restored, 2026-11-09.
    // Proof: leaving removal outside this owner disclosed used tag/team/person usage before authority; three actual standalone negatives observed RED, 2026-11-09.
    // Proof: removal-usage-owner fault failed 'authorizes used standalone' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
    if (address.kind === 'add' || address.kind === 'add-person' || address.kind === 'remove') {
      try {
        // The service may announce removal before returning; hold it until the owner commits.
        const collector = new AnnouncementCollector(announcements);
        // Proof: removal-buffer fault failed 'removal announcements buffered' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
        const value = await recordMutation(
          address,
          (reason) => refuseInvocation({ ok: false, reason }),
          (borrowed, decisions) =>
            act(
              new DirectoryService({
                directory: borrowed,
                accessDecisions: decisions,
                broadcast: collector,
                clock,
              }),
              access,
            ),
          acceptedInvocation,
        );
        if (acceptedInvocation(value)) await collector.send();
        return value;
      } catch (cause) {
        if (cause instanceof DirectoryRefused) return refuseInvocation(cause.refusal);
        throw cause;
      }
    }
    const refuseAbsent = (reason: Refusal) =>
      reason === 'not_found' ? { ok: false as const, reason } : unexpected(reason);
    const scopedMutation: Partial<DirectoryStore> = {
      renameInOrganization: (catalog, resourceId, organizationId, name, stamp) => {
        if (catalog === 'resources') throw new Error(STANDALONE_RESOURCE_WRITE);
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
      removePerson: (personId, cascade, stamp, reach) =>
        recordMutation(
          { kind: 'remove', catalog: 'people', resourceId: personId, access },
          refuseAbsent,
          (borrowed) => borrowed.removePerson(personId, cascade, stamp, reach),
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
        if (catalog === 'resources') throw new Error(STANDALONE_RESOURCE_WRITE);
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
    try {
      return await act(
        new DirectoryService({
          directory: facade,
          accessDecisions: options.accessDecisions,
          broadcast: announcements,
          clock,
        }),
        access,
      );
    } catch (cause) {
      if (cause instanceof DirectoryRefused) return refuseInvocation(cause.refusal);
      throw cause;
    }
  };
  return new DirectoryService({
    directory,
    accessDecisions: options.accessDecisions,
    broadcast: announcements,
    clock,
    standaloneWrite,
  });
}
