import { openExistingConnection, openReadOnlyConnection } from '@wbs/store-sqlite/db';
import {
  activateStepBlockages,
  inspectStepBlockageReceipt,
  parseStepBlockageReceipt,
} from '@wbs/store-sqlite/step-blockage-receipt';

const path = process.env['DB_PATH'];
// Proof: omitted DB_PATH guard; absent/empty CLI boundary negatives lost the named refusal (2026-10-15).
if (path === undefined || path === '') throw new Error('DB_PATH must be set');
const args = process.argv.slice(2);
const [command, file] = args;
// Proof: omitted usage guard; empty-argv CLI negative lost its usage refusal (2026-10-15).
if (
  (command !== 'inspect' && command !== 'activate') ||
  (command === 'inspect' && args.length !== 1) ||
  (command === 'activate' && (args.length !== 2 || file === ''))
)
  throw new Error('usage: step-blockage-activation-cli.ts inspect | activate <receipt.json>');

if (command === 'inspect') {
  // Proof: writable substitution let a broken inspect dependency enable writers; CLI negative lost readonly refusal (2026-10-15).
  const connection = openReadOnlyConnection(path);
  try {
    console.log(JSON.stringify(inspectStepBlockageReceipt(connection.db)));
  } finally {
    connection.close();
  }
} else {
  const receipt = parseStepBlockageReceipt(await Bun.file(file).json());
  // Proof: switched to a creating connection; missing-database CLI negative observed an invented file (2026-10-15).
  const connection = openExistingConnection(path);
  try {
    console.log(JSON.stringify(activateStepBlockages(connection.db, receipt)));
  } finally {
    connection.close();
  }
}
