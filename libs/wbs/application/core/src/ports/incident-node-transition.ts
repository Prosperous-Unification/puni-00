import type { ScopedRevision } from './dependency-context';
import type { IncidentReceipt } from './typed-dependency-store';
import type { WriteStamp } from './write-stamp';

/** Directional receipt pairs admit only the exact derived node mapping. */
export interface IncidentNodeReceipt {
  readonly from: IncidentReceipt;
  readonly to: IncidentReceipt;
}

export type IncidentNodeRequest = {
  readonly fromWorkItemId: string;
  readonly toWorkItemId: string;
} & (
  | { readonly kind: 'fresh' }
  | { readonly kind: 'replay'; readonly receipts: readonly IncidentNodeReceipt[] }
);

export interface IncidentTransitionEvidence {
  readonly receipts: readonly IncidentNodeReceipt[];
  readonly externalBefore: readonly ScopedRevision[];
}

/** Raw operations have no retained projection; owner projections refresh only local identities. */
export type IncidentRetention =
  | { readonly kind: 'raw' }
  | { readonly kind: 'owner'; readonly refresh: (workItemIds: readonly string[]) => Promise<void> };

export type IncidentTransitionOutcome<T> =
  | { readonly ok: true; readonly value: T; readonly evidence: IncidentTransitionEvidence }
  | {
      readonly ok: false;
      readonly reason: 'structure_refused';
      readonly value: T;
      readonly evidence: IncidentTransitionEvidence;
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'project_deleting'
        | 'not_found'
        | 'forbidden'
        | 'unknown_step'
        | 'stale_undo'
        | 'cycle'
        | 'self_node'
        | 'node_on_parent'
        | 'descendant_step_on_leaf';
    };

/** One admitted structural transition; no arbitrary foreign relationship writer escapes.
 * Delete-pending endpoint facts refuse before any relationship is detached.
 * The caller must abort its enclosing UoW for any refusal or throw. */
export interface IncidentNodeTransition {
  run<T extends { readonly ok: boolean }>(
    projectId: string,
    actorId: string,
    request: IncidentNodeRequest,
    stamp: WriteStamp,
    structure: (evidence: IncidentTransitionEvidence) => Promise<T>,
  ): Promise<IncidentTransitionOutcome<T>>;
}
