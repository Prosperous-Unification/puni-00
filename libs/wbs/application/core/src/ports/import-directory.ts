import type { LimitCrossed, PersonKind, Resource, ResourceKind } from '@wbs/domain';

import type { DirectoryOutcome } from './directory-outcome';
import type {
  DirectoryCatalog,
  DirectoryCatalogRows,
  Person,
  TeamPatch,
  TeamWithServices,
} from './directory-values';
import type { ResourceAccess } from './organization-access';

/**
 * Reconciles an imported directory through the admitted scope and its collector.
 * Composition supplies the complete resource instance, retaining its receiver.
 *
 * Proof: restoring the concrete directory import directly or through this port's
 * re-export made the committed production K6 boundary oracle fail with
 * `concrete directory resource edge remains`; watched 2026-10-16. Commands and
 * fault patches: `openspec/changes/import-directory-port-boundary/verify.md`.
 * Proof: moving TeamPatch back to directory-store.ts restored four Plan import
 * violations in the production module-boundaries.test.ts audit; neutral ownership passed.
 */
export interface ImportDirectory {
  /** Reads the catalog selected by the caller's existing access. */
  listWithin<C extends DirectoryCatalog>(
    catalog: C,
    access: ResourceAccess,
  ): Promise<DirectoryCatalogRows[C]>;

  /** Adds a named entry within the admitted access, refusing a blank name. */
  addWithin(
    catalog: 'tags' | 'workItemTypes' | 'services' | 'teams' | 'externalSystems',
    actorId: string,
    name: string,
    access: ResourceAccess,
  ): Promise<{ id: string; name: string } | null>;

  /** Reconciles a team's name and owned services within the admitted access. */
  patchTeamWithin(
    teamId: string,
    actorId: string,
    patch: TeamPatch,
    access: ResourceAccess,
  ): Promise<DirectoryOutcome<TeamWithServices>>;

  /**
   * Adds a resource within the admitted access, refusing a blank or held name
   * (`wbs-resources`).
   */
  addResourceWithin(
    actorId: string,
    input: { name: string; kind: ResourceKind; unitLabel: string },
    access: ResourceAccess,
  ): Promise<DirectoryOutcome<Resource>>;

  /** Adds a person and memberships within the admitted access. */
  addPersonWithin(
    actorId: string,
    name: string,
    teamIds: readonly string[],
    access: ResourceAccess,
    kind?: PersonKind,
  ): Promise<DirectoryOutcome<Person>>;

  /**
   * Whether `added` more agent persons would cross the organization's cap,
   * read in the admitted transaction: null when they fit or under legacy
   * access (`wbs-organization-limits` L9).
   */
  refuseAgentPersonsWithin(access: ResourceAccess, added: number): Promise<LimitCrossed | null>;
}
