import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const SCHEMA_VERSION = 4;
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
const executionForward = readFileSync(
  new URL('./migrations/0003-execution-history/migration.sql', import.meta.url),
  'utf8',
);
const executionDown = readFileSync(
  new URL('./migrations/0003-execution-history/down.sql', import.meta.url),
  'utf8',
);
const recoveryForward = readFileSync(
  new URL('./migrations/0004-runtime-recovery/migration.sql', import.meta.url),
  'utf8',
);
const recoveryDown = readFileSync(
  new URL('./migrations/0004-runtime-recovery/down.sql', import.meta.url),
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
  {
    name: '0003-execution-history',
    forwardStatements: executionForward
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0),
    forward: executionForward,
    down: executionDown,
    forwardHash: createHash('sha256').update(executionForward).digest('hex'),
    // Proof: F175 replaced the third down hash; the complete named bundle identity assertion failed, then passed after restoration.
    downHash: createHash('sha256').update(executionDown).digest('hex'),
  },
  {
    name: '0004-runtime-recovery',
    forwardStatements: recoveryForward
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0),
    forward: recoveryForward,
    down: recoveryDown,
    forwardHash: createHash('sha256').update(recoveryForward).digest('hex'),
    downHash: createHash('sha256').update(recoveryDown).digest('hex'),
  },
] as const;
export interface SqliteMigrationIdentity {
  readonly name: string;
  readonly forwardHash: string;
  readonly downHash: string;
}
export interface SqliteFormatIdentity {
  readonly version: 3 | 4;
  readonly bundleHash: string;
  readonly migrations: readonly SqliteMigrationIdentity[];
}
function createFormatIdentity(
  version: 3 | 4,
  migrations: readonly SqliteMigrationIdentity[],
): SqliteFormatIdentity {
  return Object.freeze({
    version,
    bundleHash: createHash('sha256')
      .update(
        JSON.stringify([
          'run-store-format',
          version,
          migrations.map((migration) => [
            migration.name,
            migration.forwardHash,
            migration.downHash,
          ]),
        ]),
      )
      .digest('hex'),
    migrations: Object.freeze(
      migrations.map(({ name, forwardHash, downHash }) =>
        Object.freeze({ name, forwardHash, downHash }),
      ),
    ),
  });
}
/** Immutable source identities calculated from complete forward/down artifact bytes. They do not attest to any database inspection. */
export const FORMAT3_IDENTITY = createFormatIdentity(3, MIGRATIONS.slice(0, 3));
// Proof: T3M2 replaced only the new complete-bundle dependency with the predecessor hash; actual already-loaded BB14 code inserted a fresh manifest on physical/version4. Exact restoration refused with unchanged rows.
export const FORMAT4_IDENTITY = createFormatIdentity(4, MIGRATIONS);

/** Complete compiled current bundle used by bootstrap and semantic admission. */
export const FORMAT_HASH = FORMAT4_IDENTITY.bundleHash;
