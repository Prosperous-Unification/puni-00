import type { ResourceAccess } from './organization-access';
import type { Step } from './step-store';
import type { WorkPackageList } from './work-package-list';
import type { WorkPackage } from './work-package-values';

export interface WorkPackageWithSteps {
  workPackage: WorkPackage;
  steps: Step[];
}

/**
 * A work package as its read and its PATCH publish it: the stored settings and the
 * IANA zone every day derived from an instant is read in (`step-node-attempts`
 * D3), stored beside them and read through {@link import('./work-package-store').WorkPackageStore.timezoneOf}.
 */
export type ZonedWorkPackage = WorkPackage & { timezone: string };

/** {@link WorkPackageWithSteps} with its work package {@link ZonedWorkPackage zoned}. */
export interface ZonedWorkPackageWithSteps {
  workPackage: ZonedWorkPackage;
  steps: Step[];
}

/**
 * Work package reads through the caller's resolved access, independent of the resource.
 *
 * Proof: restoring the concrete resource Pick directly or through a neutral-looking
 * port re-export made the committed K6 boundary oracle fail with
 * `concrete workPackage resource edge remains`; watched 2026-10-16. Commands and
 * candidate patches: `openspec/changes/space-work-package-port-boundary/verify.md`.
 */
export interface WorkPackageRead extends WorkPackageList {
  /** The readable work package's settings and ordered steps, or null when inaccessible. */
  readWithin(id: string, access: ResourceAccess): Promise<ZonedWorkPackageWithSteps | null>;
}
