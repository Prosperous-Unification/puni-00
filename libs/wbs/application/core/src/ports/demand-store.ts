import type { Demand } from '@wbs/domain';

import type { WriteStamp } from './write-stamp';

export type { Demand } from '@wbs/domain';

/**
 * What a demand write decided, read inside the write's own transaction:
 * `unknown_work_item` and `unknown_resource` are ids nothing holds.
 */
export type DemandWritten = 'written' | 'unknown_work_item' | 'unknown_resource';

/**
 * The units of each resource each work item states it needs (`wbs-resources`
 * R1): a satellite of the work item, so every write moves the item's revision,
 * and every demand goes with its work item and with its resource.
 */
export interface DemandStore {
  /** Every demand on a work item of the project, by work item then resource. */
  listByProject(projectId: string): Promise<Demand[]>;
  /**
   * States one work item's demand on one resource, or removes it on `null`,
   * moving the work item's revision either way. Units are already bounded and
   * checked against the resource's kind by the caller.
   */
  set(
    workItemId: string,
    resourceId: string,
    units: number | null,
    stamp: WriteStamp,
  ): Promise<DemandWritten>;
}
