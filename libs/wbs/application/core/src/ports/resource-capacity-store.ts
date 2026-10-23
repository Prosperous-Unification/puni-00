import type { ResourceCapacity } from '@wbs/domain';

import type { WriteStamp } from './write-stamp';

export type { ResourceCapacity } from '@wbs/domain';

/**
 * What a resource capacity write decided, read inside the write's own
 * transaction: `unknown_project` and `unknown_resource` are ids nothing holds.
 */
export type ResourceCapacityWritten =
  { ok: true } | { ok: false; reason: 'unknown_project' | 'unknown_resource' };

/**
 * How many units of each resource a project's plan may use (`wbs-resources`
 * R1): {@link CapacityStore}'s shape for resources, and its three states. A
 * pair with no entry is unstated and constrains nothing; an entry whose
 * resource no leaf demands any more is remembered and stays until cleared.
 */
export interface ResourceCapacityStore {
  /** The stated pairs of one project, in resource-id order. */
  listFor(projectId: string): Promise<ResourceCapacity[]>;
  /**
   * States this project's capacity for one resource, or clears it on `null`.
   * `null` deletes the row: unstated has one spelling, the absence of one.
   */
  set(
    projectId: string,
    resourceId: string,
    units: number | null,
    stamp: WriteStamp,
  ): Promise<ResourceCapacityWritten>;
}
