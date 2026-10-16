import { parseOrThrow } from '@shared/validation';
import {
  checkProgressReceiptConsistency,
  digestOf,
  PlanReferenceRecord,
  PlanTasks,
  ProgressReceiptRecord,
} from '@twilight-burokrat/contracts';
import type { PlanCommandWire } from '@wbs/contracts';

import type { FlagValues } from './cli';
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

/** Strict required JSON boundary shared by conversion and selected-reference admission. */
export async function readDecoded<Decoded>(
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
 * whole work item. Task schemas 1 and 2 retain their original values through decoding;
 * Burokrat receipt consistency check precedes reading their shared task and step identifiers.
 *
 * @throws when the receipt is for another plan reference, the task export is not the one the
 * plan reference binds, the plan and tasks are inconsistent, or an entry names a task or
 * step code the export does not hold.
 */
export function commandsForReceipt(
  receipt: ProgressReceiptRecord,
  reference: PlanReferenceRecord,
  tasks: PlanTasks,
): CommandBatchDocument {
  // Proof: skipping this call failed 14 semantic/digest/membership refusals in
  // receipt-to-commands.test.ts, including the real subprocess (2026-10-15).
  checkProgressReceiptConsistency(receipt, reference, tasks);
  const stepIdByCode = new Map(tasks.steps.map((step) => [step.code, step.id]));
  const commands = receipt.entries.flatMap((entry, index): PlanCommandWire[] => {
    const stepId = stepIdByCode.get(entry.stepCode);
    // Proof: replacing the step lookup map with an empty map failed the real entrypoint
    // `emits commands per entry` test (2026-10-15).
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
