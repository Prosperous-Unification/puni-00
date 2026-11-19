import type {StepBinding, StepTypeState, WorkPackageChain} from '@wbs/domain';
import type {StepFactKind} from './step-catalogue';

export interface StepUsageWorkItem {
  readonly id: string;
  readonly parentId: string | null;
  readonly position: number;
  readonly name: string;
  readonly typeState: StepTypeState;
}
export interface StepUsagePackage {
  readonly chain: WorkPackageChain;
  readonly workItems: readonly StepUsageWorkItem[];
}
export interface StepUsageNode {
  readonly scope: 'node';
  readonly workPackageId: string;
  readonly workItemId: string;
  readonly stepId: string;
}
/** Retained attempt-number address, including a parent whose own direct type still resolves the step. */
export interface StepUsageAllocator {
  readonly scope: 'allocator';
  readonly workPackageId: string;
  readonly workItemId: string;
  readonly stepId: string;
}
export interface StepUsageDescendantStep {
  readonly scope: 'descendant-step';
  readonly workPackageId: string;
  readonly workItemId: string;
  readonly stepId: string;
}
export interface StepUsageWhole {
  readonly scope: 'whole';
  readonly workPackageId: string;
  readonly workItemId: string;
  readonly stepId: null;
}
export interface StepUsageSubtreeClaim {
  readonly scope: 'subtree-claim';
  readonly workPackageId: string;
  readonly workItemId: string;
  readonly stepId: null;
}
export type StepUsageEndpoint =
  StepUsageNode | StepUsageAllocator | StepUsageDescendantStep | StepUsageWhole | StepUsageSubtreeClaim;
export type StepUsageFact =
  | {
      readonly kind: Exclude<StepFactKind, 'typed_dependency' | 'external_dependency' | 'claim' | 'attempt_issued'>;
      readonly endpoint: StepUsageNode;
    }
  | {
      readonly kind: 'typed_dependency' | 'external_dependency';
      readonly endpoint: StepUsageNode | StepUsageDescendantStep | StepUsageWhole;
    }
  | { readonly kind: 'claim'; readonly endpoint: StepUsageNode | StepUsageSubtreeClaim }
  | { readonly kind: 'attempt_issued'; readonly endpoint: StepUsageNode | StepUsageAllocator };


/** Decoded complete organization evidence on one owner; the pure projector checks semantic applicability before response selection. */
export interface StepUsageSnapshot {
  readonly packages: readonly StepUsagePackage[];
  readonly facts: readonly StepUsageFact[];
  readonly bindings: readonly StepBinding[];
}
