import type { ResourceAccess } from './organization-access';
import type { ProjectList } from './project-list';
import type { Project } from './project-values';
import type { Step } from './step-store';

export interface ProjectWithSteps {
  project: Project;
  steps: Step[];
}

/**
 * A project as its read and its PATCH publish it: the stored settings and the
 * IANA zone every day derived from an instant is read in (`step-node-attempts`
 * D3), stored beside them and read through {@link import('./project-store').ProjectStore.timezoneOf}.
 */
export type ZonedProject = Project & { timezone: string };

/** {@link ProjectWithSteps} with its project {@link ZonedProject zoned}. */
export interface ZonedProjectWithSteps {
  project: ZonedProject;
  steps: Step[];
}

/**
 * Project reads through the caller's resolved access, independent of the resource.
 *
 * Proof: restoring the concrete resource Pick directly or through a neutral-looking
 * port re-export made the committed K6 boundary oracle fail with
 * `concrete project resource edge remains`; watched 2026-10-16. Commands and
 * candidate patches: `openspec/changes/space-project-port-boundary/verify.md`.
 */
export interface ProjectRead extends ProjectList {
  /** The readable project's settings and ordered steps, or null when inaccessible. */
  readWithin(id: string, access: ResourceAccess): Promise<ZonedProjectWithSteps | null>;
}
