// Codes every step an older release left uncoded (`step.code IS NULL`), then
// prints how many it coded. Run by the swap executor after the old colour has
// stopped, so no writer that ignores `code` is left:
//
//   docker exec be-01-<color> bun run src/backfill-step-codes-cli.ts
//
// Idempotent, so it is also the manual command a failed swap names. Any
// failure throws, which exits non-zero, and the swap reports it loudly rather
// than committing a deploy that left steps uncoded.
import { openConnection } from '@wbs/store-sqlite/db';
import { backfillStepCodes } from '@wbs/store-sqlite/step-code-backfill';

const dbPath = process.env['DB_PATH'];
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');

const connection = openConnection(dbPath);
try {
  const coded = backfillStepCodes(connection.db, Date.now());
  for (const { projectId, stepId, code } of coded) {
    console.log(`coded step ${stepId} in project ${projectId} as ${code}`);
  }
  console.log(`step codes backfilled: ${String(coded.length)}`);
} finally {
  connection.close();
}
