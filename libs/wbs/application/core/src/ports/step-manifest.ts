/** Revision-bound project applicability, independent of package values and retained run manifests. */
export interface ProjectStepManifest {
  readonly version: 1;
  readonly project: { readonly id: string; readonly revision: number };
  readonly default: readonly string[];
  readonly types: readonly {
    readonly workItemTypeId: string;
    readonly codes: readonly string[];
  }[];
}
