import type { AuthenticatedUser } from '@wbs/contracts';

import type { Clock } from '../../ports/clock';
import type { CommandAccess } from '../../ports/command-access';
import type { RefusedOrganizationAccess, ResourceAccess } from '../../ports/organization-access';
import type { UnitOfWork } from '../../ports/unit-of-work';

/** Navigation is readable-only application access; the HTTP mutation still requires write scope. */
export type OpenOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'not_found' }
  | { readonly ok: false; readonly error: 'insufficient_scope' }
  | RefusedOrganizationAccess;

/** One source writer and current admission, without a planning graph or read-only observation loan. */
export interface WorkPackageOpeningOptions {
  readonly uow: UnitOfWork;
  readonly commandAccess: CommandAccess;
  readonly clock: Clock;
}

/** The required navigation mutation supplied to the mounted work package routes. */
export interface WorkPackageOpening {
  openWithin(
    id: string,
    actor: AuthenticatedUser,
    expectedAccess: ResourceAccess,
  ): Promise<OpenOutcome>;
}

/**
 * Retains complete caller evidence and one Clock stamp before the source queues. Current mode,
 * credential, selection and membership are resolved again on that same writer; scoped target
 * readability and the navigation upsert then use its borrowed store. No private projection,
 * dependency/fanout graph, event, command journal or plan revision is part of opening a screen.
 * Legacy keeps its raw package lookup/open semantics after current mode admission.
 * @throws on incoherent admitted identity, unavailable authority, trusted-state or owner failure.
 */
export function createWorkPackageOpening(options: WorkPackageOpeningOptions): WorkPackageOpening {
  return {
    async openWithin(id, actor, expectedAccess): Promise<OpenOutcome> {
      // Proof: OPEN F1 (2026-11-14), Replacing this caller/access clone with shared references failed
      // `retains the complete opening caller, expected scope and one stamp before the writer waits`
      // at the captured caller/access equality; whole retention only, not each field or SQLite authority.
      const retained = structuredClone({ actor, expectedAccess });
      // Proof: OPEN F2 (2026-11-14), Removing this scope refusal failed
      // `refuses missing OAuth write scope before stamping or acquiring the writer`
      // with ok:true instead of insufficient_scope; later no-writer/stamp assertions were not reached.
      if (!retained.actor.scopes.includes('write'))
        return { ok: false, error: 'insufficient_scope' };
      const stamped = options.clock.stampFor(retained.actor.id);
      // Proof: OPEN F3 (2026-11-14), Reusing the returned stamp object failed
      // `retains the complete opening caller, expected scope and one stamp before the writer waits`
      // with the later admitted-authority error after held mutation; whole stamp retention, not each field.
      const stamp = { by: stamped.by, at: stamped.at };
      // Proof: OPEN F4 (2026-11-14), Removing this early stamp/account check failed
      // `rejects a clock stamp for another account before actual writer acquisition`
      // because the later admitted-authority error replaced the expected stamp error; diagnostic boundary only.
      if (stamp.by !== retained.actor.id)
        throw new Error('opening stamp differs from the acting account');
      // Proof: OPEN F9 (2026-11-14), Moving resolution before uow.run failed
      // `retains the complete opening caller, expected scope and one stamp before the writer waits`
      // at the immediate expected begin call (received none); invocation order, not enqueue/snapshot proof.
      return await options.uow.run<OpenOutcome>(async (scope) => {
        const resolved = await options.commandAccess.resolve({
          kind: 'human',
          principal: retained.actor,
          expectedAccess: retained.expectedAccess,
        });
        // Proof: OPEN F5 (2026-11-14), Removing this refusal return failed
        // `rolls back a current context refusal without acquiring a package catalog`
        // with access.kind TypeError before the first outcome assertion; local forwarding, not resolver internals.
        if (!resolved.ok) return { commit: false, value: resolved };
        const access = resolved.access;
        // Proof: OPEN F6 (2026-11-14), Removing this compound coherence check failed
        // `rejects incoherent resolved kind, organization, principal and scope identity without recording access`
        // because the first kind mismatch resolved; no independent necessity claim for the remaining clauses.
        if (
          access.kind !== retained.expectedAccess.kind ||
          (access.kind === 'scoped' &&
            (retained.expectedAccess.kind !== 'scoped' ||
              access.scope.organizationId !== retained.expectedAccess.scope.organizationId ||
              access.principal.id !== stamp.by ||
              access.scope.userId !== stamp.by))
        )
          throw new Error('opening admitted authority differs from the captured act');
        let opened: boolean;
        if (access.kind === 'legacy') {
          const workPackage = await scope.stores.workPackages.findById(id);
          opened = workPackage !== null;
          // Proof: OPEN F8 (2026-11-14), Recording the absent legacy target unconditionally failed
          // `retains raw legacy opening behavior inside the participating writer only`
          // with two recorded writes instead of one; no scoped-authority or physical-write claim.
          if (opened) await scope.stores.workPackages.recordOpen(id, stamp);
        } else {
          opened = await scope.stores.workPackages.recordReadableOpenInOrganization(
            id,
            stamp,
            access.scope.organizationId,
            access.principal,
          );
        }
        // Proof: OPEN F7 (2026-11-14), Changing the false-store decision to commit failed
        // `rolls back an opaque store refusal and commits only its successful access record`
        // at begin/commit versus begin/rollback; purpose protocol only, not physical SQLite rollback.
        return opened
          ? { commit: true, value: { ok: true } }
          : { commit: false, value: { ok: false, reason: 'not_found' } };
      });
    },
  };
}
