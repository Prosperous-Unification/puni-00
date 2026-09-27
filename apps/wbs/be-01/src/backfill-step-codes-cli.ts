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
