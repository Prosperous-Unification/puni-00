import type {
  CapacityReport,
  CapacityReportDecision,
  CapacityReportRequest,
  ComputeProviderKind,
  Permission,
} from '@wbs/domain';

import type { SecurityPrincipal } from './security-principal';

/** Current named directory permission denial; no provider facts are exposed. */
export interface ComputeProviderPermissionRefusal {
  readonly kind: 'forbidden';
  readonly permission: Permission;
}
import type { AuditedAct } from './organization-audit';

/** One provider instance as its administrators list it, with the count of resources it fulfils. */
export interface ComputeProviderSummary {
  readonly id: string;
  readonly kind: ComputeProviderKind;
  readonly name: string;
  /** Display text naming the host; WBS never dials it. */
  readonly locator: string;
  readonly createdAt: number;
  readonly createdBy: string | null;
  readonly resources: number;
}

/** A provider instance to register: the caller's id and what the admin typed. */
export interface ComputeProviderDraft {
  readonly id: string;
  readonly kind: ComputeProviderKind;
  readonly name: string;
  readonly locator: string;
}

/** A rename or relocation of one instance; at least one field is present. */
export interface ComputeProviderPatch {
  readonly name?: string;
  readonly locator?: string;
}

/** One resource that refuses an instance's removal, under its organization name. */
export interface FulfilledResource {
  readonly id: string;
  readonly name: string;
}

/**
 * Provider instance administration (`compute-providers` P2), through organization.manage_directory from the
 * retained actual authenticated principal, with fixed credential cap and no delegation.
 * Every public owner checks current grants on its own connection and shared Gate;
 * writes and audit append commit together. Inputs and audit identity are detached
 * before queueing. Inactive activation remains a modeled refusal. An instance of
 * another organization, or none, is `unknown_provider`.
 *
 * @throws when trusted state is malformed, and when the audit row cannot be
 * written (the act is then rolled back).
 */
export interface ComputeProviderAdministration {
  list(
    organizationId: string,
    principal: SecurityPrincipal,
  ): Promise<readonly ComputeProviderSummary[] | 'inactive' | ComputeProviderPermissionRefusal>;
  register(
    organizationId: string,
    principal: SecurityPrincipal,
    draft: ComputeProviderDraft,
    act: AuditedAct,
  ): Promise<
    | { readonly kind: 'registered'; readonly provider: ComputeProviderSummary }
    | { readonly kind: 'inactive' | 'name_taken' }
    | ComputeProviderPermissionRefusal
  >;
  update(
    organizationId: string,
    principal: SecurityPrincipal,
    id: string,
    patch: ComputeProviderPatch,
    act: AuditedAct,
  ): Promise<
    | { readonly kind: 'updated'; readonly provider: ComputeProviderSummary }
    | { readonly kind: 'inactive' | 'unknown_provider' | 'name_taken' }
    | ComputeProviderPermissionRefusal
  >;
  /**
   * Removes instance `id`. While resources reference it: `in_use` naming them,
   * unless `cascade`, which clears every reference and deletes the instance's
   * reports in the same transaction. The audit row names the cleared
   * resources by id.
   */
  remove(
    organizationId: string,
    principal: SecurityPrincipal,
    id: string,
    cascade: boolean,
    act: AuditedAct,
  ): Promise<
    | 'removed'
    | 'inactive'
    | ComputeProviderPermissionRefusal
    | 'unknown_provider'
    | { readonly kind: 'in_use'; readonly resources: readonly FulfilledResource[] }
  >;
}

/**
 * One host job a resource authority published and has not returned
 * (`dash-host-jobs` J10): the name its host pool admitted it under and what it
 * reserves per dimension. Shown beside a report's `reservedUnits`, never planned with.
 */
export interface HostJobReading {
  readonly useId: string;
  readonly label: string;
  readonly type: string;
  readonly host: string;
  readonly reservations: readonly { readonly dimension: string; readonly units: number }[];
}

/**
 * What the resources read shows of one resource's provider: the instance that
 * fulfils it, named by kind and name (never its locator, which only the
 * admin-only instances list carries), or null; its latest report; and the
 * unreturned host jobs of the authority bound to that instance, oldest
 * registration first (empty without an instance or an authority).
 */
export interface ResourceProviderReading {
  readonly provider: {
    readonly id: string;
    readonly kind: ComputeProviderKind;
    readonly name: string;
  } | null;
  readonly report: CapacityReport | null;
  readonly hostJobs: readonly HostJobReading[];
}

/**
 * Capacity reports (`compute-providers` P5, P6): one latest report per
 * resource, no history and no audit row. Nothing in planning reads this port
 * (P4): the schedule input, the claim decision, the occupancy check, the
 * startable read and the plan export take their capacity from the project's
 * declared figures alone.
 */
export interface CapacityReports {
  /**
   * Reads the facts {@link decideCapacityReport} needs and applies its
   * decision in one immediate transaction, so two racing reporters cannot
   * both compare against the same stored instant.
   *
   * @throws when the request's pinned person does not exist (trusted state:
   * the credential that named it was just admitted).
   */
  put(request: CapacityReportRequest): Promise<CapacityReportDecision>;
  /**
   * The provider reference and latest report of each retained `resourceIds`; an id nothing holds is absent.
   * This public snapshot owner serializes with administration on the same source Gate;
   * it adds no permission requirement to the calling package read. An empty retained
   * selection may answer without entering the database.
   *
   * @throws when a reference names no instance or an instance has a kind
   * outside the four, or a report names another instance than its resource:
   * each is broken trusted state.
   */
  readingsOf(resourceIds: readonly string[]): Promise<ReadonlyMap<string, ResourceProviderReading>>;
}

/**
 * Compute providers for an app composed without them (the memory twin): no
 * instance exists, every administration act answers as before activation,
 * every resource reads unreferenced, and a report names no instance.
 */
export const NO_COMPUTE_PROVIDERS: {
  readonly administration: ComputeProviderAdministration;
  readonly reports: CapacityReports;
} = {
  administration: {
    list: () => Promise.resolve('inactive'),
    register: () => Promise.resolve({ kind: 'inactive' }),
    update: () => Promise.resolve({ kind: 'inactive' }),
    remove: () => Promise.resolve('inactive'),
  },
  reports: {
    put: () => Promise.resolve({ kind: 'refused', refusal: { kind: 'unknown_provider' } } as const),
    readingsOf: (resourceIds) =>
      Promise.resolve(
        new Map(
          resourceIds.map((id) => [id, { provider: null, report: null, hostJobs: [] }] as const),
        ),
      ),
  },
};
