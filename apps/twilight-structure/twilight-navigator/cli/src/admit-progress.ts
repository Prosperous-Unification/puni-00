import { parseOrThrow } from '@shared/validation';
import {
  digestOf,
  PlanReferenceRecord,
  PlanTasks,
  ProgressReceiptRecord,
} from '@twilight-burokrat/contracts';

import type { NavigatorRequest } from './cli-parser';
import { commandsForReceipt, readDecoded } from './receipt-to-commands';
import { createExclusiveFiles } from './required-file';

/**
 * Proposes a batch only for bound progress consistent with a caller-selected accepted
 * reference. Digest equality proves supplied-document identity, without authenticating the
 * caller's selection or establishing live WBS freshness. Applies no commands.
 *
 * @throws on unbound receipts, mismatched digests, inconsistent documents, invalid required
 * files or failed exclusive output creation. All validation precedes publication.
 */
export async function runAdmitProgress(
  request: NavigatorRequest<'admit-progress'>,
): Promise<string> {
  const receipt = await readDecoded(request.receipt, 'progress receipt', (input) =>
    parseOrThrow(ProgressReceiptRecord, input),
  );
  const producer = await readDecoded(request.planReference, 'producer reference', (input) =>
    parseOrThrow(PlanReferenceRecord, input),
  );
  const tasks = await readDecoded(request.tasks, 'task export', (input) =>
    parseOrThrow(PlanTasks, input),
  );
  // Proof: substituting the producer for this decoder admitted a redigested unknown-key
  // accepted reference in admit-progress.test.ts (2026-10-16). Missing, mode-000 unreadable
  // and malformed accepted files are independently refused through this production path.
  const accepted = await readDecoded(request.acceptedReference, 'accepted reference', (input) =>
    parseOrThrow(PlanReferenceRecord, input),
  );
  if (receipt.schemaVersion === 2) {
    // Proof: replacing this equality guard with false admitted the redigested substituted
    // receipt against matching producer/accepted A in admit-progress.test.ts (2026-10-16).
    if (receipt.referenceDigest !== producer.referenceDigest) {
      throw new Error('progress receipt does not bind the producer reference');
    }
  } else {
    // Proof: removing this throw admitted a schema 1 receipt and wrote the batch in
    // `legacy admission refuses while legacy conversion remains available` (2026-10-16).
    throw new Error('progress admission requires a bound schema 2 receipt');
  }
  // Proof: replacing this guard with false admitted real v9 export A against selected B,
  // differing only in blockedAt, in admit-progress.test.ts (2026-10-16).
  if (producer.referenceDigest !== accepted.referenceDigest) {
    throw new Error('producer reference differs from the selected accepted reference');
  }
  const batch = commandsForReceipt(receipt, producer, tasks);
  await createExclusiveFiles([
    { path: request.output, text: `${JSON.stringify(batch, null, 2)}\n` },
  ]);
  return digestOf(batch);
}
