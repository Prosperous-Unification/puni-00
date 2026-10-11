/** Who is doing one work item's work for one step. */
export interface Assignment {
  workItemId: string;
  stepId: string;
  personId: string;
}
