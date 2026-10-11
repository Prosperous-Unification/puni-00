import { parseOrThrow } from '@shared/validation';
import {
  canonicalJson,
  digestOf,
  PlanReferenceRecord,
  ProgressReceiptRecord,
} from '@twilight/burokrat-contracts';
import type { PlanCommandWire } from '@wbs/contracts';

import type { FlagValues } from './cli';
import { PlanTasks } from './plan-tasks';
import { createExclusiveFiles, parseRequiredJson, readRequiredBytes } from './required-file';

/** The flags of `twin receipt-to-commands`, each required once. */
export const RECEIPT_TO_COMMANDS_FLAGS = [
  '--receipt',
  '--plan-reference',
  '--tasks',
  '--output',
] as const;

type ReceiptToCommandsFlag = (typeof RECEIPT_TO_COMMANDS_FLAGS)[number];

/** The document a person or the WBS MCP posts to `POST /api/projects/:id/commands`. */
export interface CommandBatchDocument {
  readonly id: string;
  readonly commands: readonly PlanCommandWire[];
}

/** Measures in the fixed order their commands are emitted. */
const MEASURE_ORDER = ['token_actual', 'hours_actual'] as const;

async function readDecoded<Decoded>(
  path: string,
  role: string,
  decode: (input: unknown) => Decoded,
): Promise<Decoded> {
  const input = parseRequiredJson(await readRequiredBytes(path, role), role, path);
  try {
    return decode(input);
  } catch (failure) {
    throw new Error(`${role} is malformed: ${path}`, { cause: failure });
  }
}

/**
 * The WBS commands that record a receipt: per entry in receipt order, one `setProgress` with
 * the entry's status, then one `setMeasure` per present measure in {@link MEASURE_ORDER}.
 * `setProgress`, not `setStatus`, because an entry names one step and `setStatus` acts on the
 * whole work item.
 *
 * @throws when the receipt is for another plan reference, the task export is not the one the
 * plan reference binds, or an entry names a task or step code the export does not hold.
 */
export function commandsForReceipt(
  receipt: ProgressReceiptRecord,
  reference: PlanReferenceRecord,
  tasks: PlanTasks,
): CommandBatchDocument {
  // Proof: skipping this comparison failed `refuses a receipt for another plan reference`: the
  // receipt for another change produced a batch (2026-10-11).
  if (canonicalJson(receipt.planRef) !== canonicalJson(reference.planRef)) {
    throw new Error('progress receipt names another plan reference');
  }
  // Proof: skipping this comparison failed `refuses a task export the plan reference does not
  // bind` and the tampered task export case of `refuses a tampered receipt, plan reference or
  // task export` (2026-10-11).
  if (digestOf(tasks) !== reference.tasksDigest) {
    throw new Error('task export does not match the plan reference tasksDigest');
  }
  const stepIdByCode = new Map(tasks.steps.map((step) => [step.code, step.id]));
  const taskIds = new Set(tasks.tasks.map((task) => task.id));
  const commands = receipt.entries.flatMap((entry, index): PlanCommandWire[] => {
    const stepId = stepIdByCode.get(entry.stepCode);
    // Proof: skipping this lookup failed `refuses an unknown task or step before writing` at its
    // absent-task case (2026-10-11).
    if (!taskIds.has(entry.taskId)) {
      throw new Error(
        `receipt entry ${String(index)} names task ${entry.taskId}, absent from the plan`,
      );
    }
    // Proof: skipping this lookup failed `refuses an unknown task or step before writing` at its
    // absent-step case (2026-10-11).
    if (stepId === undefined) {
      throw new Error(
        `receipt entry ${String(index)} names step ${entry.stepCode}, absent from the plan`,
      );
    }
    const target = { workItemId: entry.taskId, stepId };
    return [
      { kind: 'setProgress', ...target, state: entry.status },
      ...MEASURE_ORDER.flatMap((metric): PlanCommandWire[] => {
        const value = entry.measures?.[metric];
        return value === undefined ? [] : [{ kind: 'setMeasure', ...target, metric, value }];
      }),
    ];
  });
  return { id: reference.planRef.plan, commands };
}

/**
 * `twin receipt-to-commands`: writes the WBS command batch for one progress receipt and
 * returns its digest. Nothing is sent; applying the batch is a person's or the WBS MCP's act.
 */
export async function runReceiptToCommands(
  request: FlagValues<ReceiptToCommandsFlag>,
): Promise<string> {
  const receipt = await readDecoded(request('--receipt'), 'progress receipt', (input) =>
    parseOrThrow(ProgressReceiptRecord, input),
  );
  const reference = await readDecoded(request('--plan-reference'), 'plan reference', (input) =>
    parseOrThrow(PlanReferenceRecord, input),
  );
  const tasks = await readDecoded(request('--tasks'), 'task export', (input) =>
    parseOrThrow(PlanTasks, input),
  );
  const batch = commandsForReceipt(receipt, reference, tasks);
  await createExclusiveFiles([
    { path: request('--output'), text: `${JSON.stringify(batch, null, 2)}\n` },
  ]);
  return digestOf(batch);
}
