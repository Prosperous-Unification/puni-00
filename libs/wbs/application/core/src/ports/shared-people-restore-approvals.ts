import type { WriteStamp } from './write-stamp';

/** Durable personal consent for exactly one organization and backup restore. */
export interface RestoreApproval {
  readonly id: string;
  readonly operationId: string;
  readonly backupDigest: string;
  readonly organizationId: string;
  readonly actorId: string;
  readonly createdAt: number;
}

export type RestoreApproved =
  | { readonly ok: true; readonly approval: RestoreApproval }
  | { readonly ok: false; readonly refusal: 'forbidden' | 'restore_approval_conflict' };

/** Approval issuance rechecks super-admin membership on the writer, including retries. */
export interface SharedPeopleRestoreApprovals {
  approve(
    organizationId: string,
    operationId: string,
    backupDigest: string,
    approvalId: string,
    stamp: WriteStamp,
  ): Promise<RestoreApproved>;
}
