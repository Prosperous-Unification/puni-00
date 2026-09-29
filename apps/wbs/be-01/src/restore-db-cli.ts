// Puts a `backup-db-cli.ts` snapshot back at DB_PATH. Only with every be-01
// colour stopped, from a throwaway container on the same data volume:
//
//   docker run --rm -v /home/puni1/wbs/data:/data -e DB_PATH=/data/wbs.db \
//     --entrypoint bun <be-01 image> run src/restore-db-cli.ts /data/backups/<name>.db
//
// The replaced files are moved aside, never deleted (`restoreDatabase`).
// Procedure: docs/runbook-prod-deploy.md#first-product-deploy.
import { restoreDatabase } from '@wbs/store-sqlite/backup';

const dbPath = process.env['DB_PATH'];
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');
const snapshot = process.argv.at(2);
if (snapshot === undefined || snapshot === '') {
  throw new Error('usage: restore-db-cli.ts <snapshot-path>');
}

const stamp = new Date().toISOString().replaceAll(/[-:.]/g, '');
console.log(JSON.stringify(restoreDatabase(snapshot, dbPath, stamp)));
