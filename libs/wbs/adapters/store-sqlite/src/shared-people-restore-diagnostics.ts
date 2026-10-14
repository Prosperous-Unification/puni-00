import { eq } from 'drizzle-orm';

import { openReadOnlyConnection } from './db';
import { sharedPeopleRestoreApproval, sharedPeopleRestoreOperation } from './schema';
import { digestSharedPeople, type SavedSharedPeople } from './shared-people-backup';

/** Stored evidence identifiers only; no actor/session assertion or consuming authority. */
export interface RestoreReferences {
  operationId?: string;
  approvalIds: readonly string[];
}

/** Checks references only; this grants no restore authority and never consumes consent. */
export function diagnoseSharedPeopleRestore(
  dbPath: string,
  request: RestoreReferences,
  saved: SavedSharedPeople,
): void {
  const shared = saved.organizations.some((organization) => organization.mode === 'shared');
  if (request.operationId === undefined && request.approvalIds.length === 0 && !shared) return;
  // Proof: bypassing reference validation lost the shared-backup missing-IDs refusal; duplicate IDs also failed.
  if (
    request.operationId === undefined ||
    request.operationId === '' ||
    request.approvalIds.length === 0 ||
    new Set(request.approvalIds).size !== request.approvalIds.length
  )
    throw new Error('restore requires operation and approval IDs for binding diagnostics');
  const operationId = request.operationId;
  // Proof: substituting the writer opener changed DELETE to WAL during refused shared diagnostics.
  const connection = openReadOnlyConnection(dbPath);
  try {
    connection.db.transaction(
      (tx) => {
        const operation = tx
          .select()
          .from(sharedPeopleRestoreOperation)
          .where(eq(sharedPeopleRestoreOperation.id, operationId))
          .get();
        // Proof: bypassing digest equality admitted the foreign-digest operation in binding diagnostics.
        if (operation?.backupDigest !== digestSharedPeople(saved))
          throw new Error('restore operation binding does not match canonical backup digest');
        const organizations = new Set(
          saved.organizations.map((organization) => organization.organizationId),
        );
        const approved = new Set<string>();
        for (const id of request.approvalIds) {
          const approval = tx
            .select()
            .from(sharedPeopleRestoreApproval)
            .where(eq(sharedPeopleRestoreApproval.id, id))
            .get();
          if (approval?.operationId !== operation.id || !organizations.has(approval.organizationId))
            throw new Error('restore approval binding does not match operation/organization');
          approved.add(approval.organizationId);
        }
        const changed = new Set([
          ...saved.organizations
            .filter((organization) => organization.mode === 'shared')
            .map((organization) => organization.organizationId),
          ...saved.ranks.map((rank) => rank.organizationId),
        ]);
        // Proof: bypassing completeness admitted the two-shared-organizations fixture with only org-a's approval.
        if ([...changed].some((id) => !approved.has(id)))
          throw new Error('restore approval binding is incomplete for saved changes');
      },
      { behavior: 'deferred' },
    );
  } finally {
    connection.close();
  }
}
