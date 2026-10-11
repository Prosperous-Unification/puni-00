/** Who is doing one work item's work for one step. */
export interface Assignment {
  readonly workItemId: string;
  readonly stepId: string;
  readonly personId: string;
}
