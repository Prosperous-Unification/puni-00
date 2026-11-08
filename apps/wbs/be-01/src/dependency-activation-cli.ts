import { inspectDependencyActivation } from '@wbs/store-sqlite/cross-project-dependency-activation';
import { openReadOnlyConnection } from '@wbs/store-sqlite/db';

// Proof: removing this guard admitted all four invalid argument subprocesses (2026-10-22).
if (process.argv.length !== 3 || process.argv[2] !== 'inspect')
  throw new Error('usage: dependency-activation-cli inspect');
const path = process.env['DB_PATH'];
// Proof: removing this guard lost explicit DB_PATH refusals in subprocess negatives (2026-10-22).
if (path === undefined || path.trim() === '')
  throw new Error('dependency inspection requires explicit DB_PATH');

// Proof: substituting openConnection created an absent file and let the injected inspector
// create forbidden_inspection_write; both subprocess negatives failed (2026-10-22).
const connection = openReadOnlyConnection(path);
try {
  // Proof: replacing inspection with DISABLED admitted ten corrupt-authority subprocess cases (2026-10-22).
  console.log(JSON.stringify(inspectDependencyActivation(connection.db)));
} finally {
  connection.close();
}
