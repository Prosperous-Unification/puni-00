import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const SCHEMA_VERSION = 2;
export const MIGRATION = readFileSync(
  new URL('./migrations/0001-run-store/migration.sql', import.meta.url),
  'utf8',
);
export const DOWN = readFileSync(
  new URL('./migrations/0001-run-store/down.sql', import.meta.url),
  'utf8',
);
export const MIGRATION_HASH = createHash('sha256').update(MIGRATION).digest('hex');
export const DOWN_HASH = createHash('sha256').update(DOWN).digest('hex');
const runtimeForward = readFileSync(
  new URL('./migrations/0002-runtime-authority/migration.sql', import.meta.url),
  'utf8',
);
const runtimeDown = readFileSync(
  new URL('./migrations/0002-runtime-authority/down.sql', import.meta.url),
  'utf8',
);
/** Complete ordered bootstrap identity. The pinned0001 artifact contains only simple statements, so its unchanged bytes use a narrowly scoped semicolon split. New artifacts use explicit complete-statement breakpoints. Before down, callers must validate the exact installed full bundle and physical schema. Down artifacts require fail-fast complete-statement breakpoint execution inside a caller transaction, stopping and rolling back at the first error. Whole-script Bun Database.run/exec is unsupported. Existing first-migration exports preserve their exact original bytes and hashes. */
export const MIGRATIONS = [
  {
    name: '0001-run-store',
    forwardStatements: MIGRATION.split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0),
    forward: MIGRATION,
    down: DOWN,
    forwardHash: MIGRATION_HASH,
    downHash: DOWN_HASH,
  },
  {
    name: '0002-runtime-authority',
    forwardStatements: runtimeForward
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0),
    forward: runtimeForward,
    down: runtimeDown,
    forwardHash: createHash('sha256').update(runtimeForward).digest('hex'),
    downHash: createHash('sha256').update(runtimeDown).digest('hex'),
  },
] as const;
/** SHA256 of the named format/version/ordered forward-and-down identity tuple. */
export const FORMAT_HASH = createHash('sha256')
  .update(
    JSON.stringify([
      // Proof: F65 changed the version inside the named bundle digest; 'bootstrap retains the complete named' failed and exact restoration passed.
      'run-store-format',
      SCHEMA_VERSION,
      MIGRATIONS.map((migration) => [migration.name, migration.forwardHash, migration.downHash]),
    ]),
    'utf8',
  )
  .digest('hex');
