import type { StepWriteOutcome } from './estimate-store';
import type { StepFactKind } from './step-catalogue';

/** A candidate step value no longer applies; return only after every method-local change is rolled back. */
export type SubtreeWriteOutcome =
  | 'written'
  | {
      readonly kind: 'estimate_refused';
      readonly workItemId: string;
      readonly stepId: string;
      readonly reason: Exclude<StepWriteOutcome, 'written'>;
    }
  | {
      readonly kind: 'point_refused';
      readonly fact: Extract<StepFactKind, 'actual' | 'progress' | 'measure'>;
      readonly workItemId: string;
      readonly stepId: string;
      readonly reason: Exclude<StepWriteOutcome, 'written'>;
    };
