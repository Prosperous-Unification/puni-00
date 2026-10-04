import type { CapacityService } from '../capacity/capacity.resource';
import type { DirectoryService } from '../directory/directory.resource';
import type { PriorityBandService } from '../priority-band/priority-band.resource';
import type { StepService } from '../step/step.resource';
import type { WorkItemService } from '../work-item/work-item.resource';

/** The exact resource graph a command batch may invoke. */
export interface PlanCommandServices {
  workItems: WorkItemService;
  steps: StepService;
  directory: DirectoryService;
  capacity: CapacityService;
  priorityBands: PriorityBandService;
}
