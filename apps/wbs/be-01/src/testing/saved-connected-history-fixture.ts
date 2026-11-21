import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { readLegacySavedConnectedScheduleBody2, readLegacySavedPlanInput } from '@wbs/domain';

/**
 * Frozen published10/2 structural evidence, captured once from unchanged7b helper('A').
 * Its original date-axis adjustments and retired algorithm are test fixtures, not a
 * newly observed production schedule. Only the original controlled target-ID
 * retargeting occurs here; deliberate corruption follows both frozen readers.
 */
export function savedConnectedHistoryFixture(workPackageId: string) {
  const capture = JSON.parse(
    readFileSync(
      new URL(
        '../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-connected-history-helper-capture.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as { output: { path: string; sha256: string; bytes: number } };
  const bytes = readFileSync(new URL('../../../../../' + capture.output.path, import.meta.url));
  if (
    bytes.length !== capture.output.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== capture.output.sha256
  )
    throw new Error('frozen historical helper fixture identity changed');
  const rewriteTarget = (value: unknown): unknown => {
    if (typeof value === 'string')
      return value === 'A' ? workPackageId : value.replaceAll('"A"', JSON.stringify(workPackageId));
    if (Array.isArray(value)) return value.map(rewriteTarget);
    if (typeof value === 'object' && value !== null)
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, rewriteTarget(entry)]),
      );
    return value;
  };
  const captured = rewriteTarget(JSON.parse(bytes.toString('utf8'))) as {
    input: unknown;
    schedule: unknown;
  };
  const input = readLegacySavedPlanInput(captured.input, 10);
  const schedule = readLegacySavedConnectedScheduleBody2(captured.schedule);
  // Boundary: test-only detached mutable copy; typed frozen10/2 fields stay historical.
  return JSON.parse(JSON.stringify({ input, schedule })) as {
    input: typeof input;
    schedule: typeof schedule;
  };
}
