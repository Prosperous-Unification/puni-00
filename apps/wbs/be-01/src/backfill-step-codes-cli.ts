import { openConnection } from '@wbs/store-sqlite/db';
import { DrizzleEventLogStore } from '@wbs/store-sqlite/event-log';
import { OPEN } from '@wbs/store-sqlite/gate';
import { backfillStepCodes } from '@wbs/store-sqlite/step-code-backfill';

const dbPath = process.env['DB_PATH'];
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');

const connection = openConnection(dbPath);
try {
  // `OPEN`: this process is the only writer it coordinates, and the backfill
  // takes SQLite's own write lock per project.
  const eventLog = new DrizzleEventLogStore(connection.db, OPEN);
  const coded = backfillStepCodes(connection.db, eventLog, Date.now());
  for (const { projectId, stepId, code } of coded) {
    console.log(`coded step ${stepId} in project ${projectId} as ${code}`);
  }
  console.log(`step codes backfilled: ${String(coded.length)}`);
} finally {
  connection.close();
}
