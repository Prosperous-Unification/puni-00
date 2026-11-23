import type { Permission } from '@wbs/domain';

import type { CommandAccess } from '../../ports/command-access';
import type { CommandGraphAuthority, DependencyContext } from '../../ports/dependency-context';
import type { EditAdmission } from '../../ports/edit-admission';
import type { ResourceAccess } from '../../ports/organization-access';
import type { Scope } from '../../ports/unit-of-work';
import type { Broadcaster } from '../../ports/work-package-event';
import type {
  RecoveryAuditDetail,
  WorkPackageCrossReferenceKind,
} from '../../ports/work-package-values';
import { type Authorization, authorize } from '../../service/authorize';
import type { PlanCommand } from '../../service/plan-command';
import { COMMAND_PERMISSIONS } from './command-permissions';
import type { PlanCommandServices } from './plan-command-graph';
import type { RuntimeAdmission, RuntimeAdmissionIdentity } from './runtime-authority';
import type { RuntimeReadRefusal } from './runtime-state';

/**
 * Builds a batch's service graph over the scope its unit of work admitted,
 * publishing into `broadcast` and letting gated services write under `admission`.
 */
export type AdmittedGraphFactory<G> = (
  scope: Scope,
  broadcast: Broadcaster,
  admission: EditAdmission,
  dependencies: DependencyContext,
) => G;

/**
 * One admitted unit of work's scope, held privately by composition.
 *
 * The stores stay inside. Composition maps the command runner's callback to
 * specific graph and admission operations.
 */
export class AdmittedScope {
  readonly #scope: Scope;

  constructor(scope: Scope) {
    this.#scope = scope;
  }

  /**
   * The kind of every reference that leaves the work package or its organization,
   * in the order the source reports them.
   *
   * Proof: answering none made `fails closed on a workPackage that already crosses
   * its organization` and `fails closed on a workPackage another workPackage reaches
   * into, changing neither` in `command-organization.controller.db.test.ts`
   * fail (20 pass, 2 fail); watched 2026-09-29.
   */
  async listCrossReferenceKinds(
    workPackageId: string,
    organizationId: string,
  ): Promise<WorkPackageCrossReferenceKind[]> {
    const crossing = await this.#scope.stores.workPackages.findCrossReferences(
      workPackageId,
      organizationId,
    );
    return crossing.map(({ kind }) => kind);
  }

  /**
   * Checks the registry permission for every command against current borrowed
   * grants before opening a write graph. Addressed packages retain visibility
   * and P5 restrictions; budgets require the same permission at their current
   * owner and package. Typed writes also require every affected package.
   *
   * Legacy membership roles and incoming access snapshots supply no grant.
   * A journal walk gets base package admission here and checks its immutable
   * original-operation obligations before applying or discarding history.
   *
   * @throws for inconsistent actor identity or pre-existing cross-organization
   * references. Missing or unreadable grant authority is never a refusal.
   */
  async refuseOutsideScope(
    workPackageId: string | null,
    actorId: string,
    access: Extract<ResourceAccess, { kind: 'scoped' }>,
    detail: RecoveryAuditDetail,
    commands: readonly PlanCommand[] = [],
  ): Promise<Extract<Authorization, { ok: false }> | null> {
    const organization = access.scope;
    if (actorId !== access.principal.id || organization.userId !== access.principal.id)
      throw new Error('admitted permission principal differs from the acting account');
    const workPackage =
      workPackageId === null
        ? null
        : await this.#scope.stores.workPackages.findInOrganization(
            workPackageId,
            organization.organizationId,
          );
    if (workPackageId !== null && workPackage === null) return { ok: false, reason: 'not_found' };
    const permissions: readonly Permission[] =
      'journal' in detail || commands.length === 0
        ? [workPackageId === null ? 'organization.manage_directory' : 'package.write']
        : commands.map((command) => COMMAND_PERMISSIONS[command.kind]);
    for (const permission of permissions) {
      if (permission === 'project.manage_budgets' && workPackage !== null) {
        // Proof: moving this below the owner check disclosed hidden setBudget/clearBudget to a no-grant subject (two mounted RED cases); omitting the package evaluation admitted restricted admin/super-admin setBudget/clearBudget and a hidden budgets-only role; mounted tests observed nine RED cases across admission/replay, 2026-11-09.
        const packageAuthority = await authorize(
          this.#scope.stores.accessDecisions,
          access.principal,
          {
            kind: 'work_package',
            chain: {
              level: 'work_package',
              organizationId: organization.organizationId,
              spaceId: null,
              projectId: workPackage.projectId,
              workPackageId: workPackage.id,
            },
            restricted: workPackage.restricted,
          },
          permission,
        );
        // Proof: budget-package-admission fault failed 'before missing budget-owner|restricted setBudget' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
        if (!packageAuthority.ok) return packageAuthority;
      }
      const scope =
        permission.startsWith('organization.') ||
        permission.startsWith('workPackage.') ||
        workPackage === null
          ? { kind: 'organization' as const, organizationId: organization.organizationId }
          : {
              kind: 'work_package' as const,
              chain: {
                level: 'work_package' as const,
                organizationId: organization.organizationId,
                spaceId: null,
                projectId: workPackage.projectId,
                workPackageId: workPackage.id,
              },
              restricted: workPackage.restricted,
            };
      const decision = await authorize(
        this.#scope.stores.accessDecisions,
        access.principal,
        scope,
        permission,
      );
      // Proof: registry-command-grant fault failed 'names package.write when a viewer runs createWorkItem|budget-owner authority independently.*write' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
      if (!decision.ok) return decision;
    }
    if (workPackageId === null) return null;
    const related = new Set<string>();
    const held = commands.some(
      (command) =>
        command.kind === 'updateTypedDependency' || command.kind === 'removeTypedDependency',
    )
      ? await this.#scope.stores.typedDependencies.listByWorkPackage(workPackageId)
      : [];
    for (const command of commands) {
      if (command.kind === 'addTypedDependency' || command.kind === 'updateTypedDependency') {
        if (command.predecessor.workPackageId !== undefined)
          related.add(command.predecessor.workPackageId);
        if (command.successor.workPackageId !== undefined)
          related.add(command.successor.workPackageId);
      }
      if (command.kind === 'updateTypedDependency' || command.kind === 'removeTypedDependency') {
        const dependency = held.find((relationship) => relationship.id === command.dependencyId);
        if (dependency !== undefined) {
          related.add(dependency.predecessor.workPackageId);
          related.add(dependency.successor.workPackageId);
        }
      }
    }
    related.delete(workPackageId);
    for (const relatedId of related) {
      const affected = await this.#scope.stores.workPackages.findInOrganization(
        relatedId,
        organization.organizationId,
      );
      if (affected === null) return { ok: false, reason: 'not_found' };
      const authority = await authorize(
        this.#scope.stores.accessDecisions,
        access.principal,
        {
          kind: 'work_package',
          chain: {
            level: 'work_package',
            organizationId: organization.organizationId,
            spaceId: null,
            projectId: affected.projectId,
            workPackageId: affected.id,
          },
          restricted: affected.restricted,
        },
        'package.write',
      );
      if (!authority.ok) return authority;
    }
    const kinds = await this.listCrossReferenceKinds(workPackageId, organization.organizationId);
    // Proof: skipping this check made `fails closed on a workPackage that already
    // crosses its organization` in `command-organization.controller.db.test.ts`
    // answer 200 instead of 500; watched 2026-09-27, and again here on
    // 2026-09-29 (20 pass, 2 fail).
    if (kinds.length > 0) {
      throw new Error(
        `work package "${workPackageId}" holds references outside its organization: ${[...new Set(kinds)].sort().join(', ')}`,
      );
    }
    return null;
  }
}

/** The command graph and its scoped Working plan lifetime. */
export interface OpenCommandGraph {
  services: PlanCommandServices;
  close(): void;
}

/** Feature-owned command and receiver operations; the raw borrowed scope stays private. */
export interface CommandAdmission {
  /** Coordinator expiry without caller admission. */
  releaseExpiredLeases(workPackageId: string, broadcast: Broadcaster): Promise<number>;
  resolveAccess: CommandAccess['resolve'];
  /** Pure current runtime authorization over this same borrowed command transaction. */
  authorizeRuntime(
    identity: RuntimeAdmissionIdentity,
  ): Promise<RuntimeAdmission | RuntimeReadRefusal>;
  refuseOutsideScope: AdmittedScope['refuseOutsideScope'];
  listCrossReferenceKinds: AdmittedScope['listCrossReferenceKinds'];
  openCommandGraph(
    workPackageId: string | null,
    broadcast: Broadcaster,
    authority: CommandGraphAuthority,
  ): OpenCommandGraph;
}

/** The sole repair operation a failed replay needs over surviving state. */
export interface CommandRepair {
  discardEntry(entryId: string): Promise<void>;
}

export type CommandDecision<T> =
  | { commit: true; value: T }
  | { commit: false; value: T; afterRollback?: (repair: CommandRepair) => Promise<void> };

/** A feature-owned decision over resources mapped privately by composition. */
export interface CommandTransaction {
  run<T>(
    act: (resources: CommandAdmission) => Promise<CommandDecision<T>>,
    settled?: () => void,
  ): Promise<T>;
}
