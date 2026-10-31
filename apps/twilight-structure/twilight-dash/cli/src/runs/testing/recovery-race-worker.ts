import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { parseOrThrow, type } from '@shared/validation';
import { Database } from 'bun:sqlite';

import { decodeClaimAcceptCommand, decodeScopedAttemptGuard } from '../execution-codecs';
import { decodeRecoveryBeginCall } from '../recovery-codecs';
import { decodeRuntimeAcceptanceInput, decodeRuntimeGuard } from '../runtime-codecs';
import { createSqliteRunStore } from '../sqlite/run-store';
import { configureDatabase, validateDatabase } from '../sqlite/schema';

const path = process.argv.at(2);
if (path === undefined) throw new Error('recovery race command path missing');
const command = parseOrThrow(
  type({
    path: 'string',
    entered: 'string',
    release: 'string',
    operation: type({ kind: "'begin'", call: 'unknown' })
      .or({ kind: "'accept'", guard: 'unknown', input: 'unknown' })
      .or({ kind: "'accept_claim'", guard: 'unknown', input: 'unknown' }),
  }).onUndeclaredKey('reject'),
  JSON.parse(readFileSync(path, 'utf8')),
);
const database = new Database(command.path, { create: false, strict: true });
/** Bun owns this native function registration boundary; the fixture invokes it through a real SQLite trigger and observes the synchronous held write lock. */
function supportsFunction(
  connection: Database,
): connection is Database & { function(name: string, callback: () => number): void } {
  return 'function' in connection && typeof connection.function === 'function';
}
let stores: ReturnType<typeof createSqliteRunStore> | undefined;
try {
  configureDatabase(database);
  validateDatabase(database);
  if (!supportsFunction(database))
    throw new Error('native SQLite function registration unavailable');
  database.function('recovery_test_barrier', () => {
    writeFileSync(command.entered, 'entered');
    const deadline = Date.now() + 15_000;
    while (!existsSync(command.release)) {
      if (Date.now() >= deadline) throw new Error('recovery race release timed out');
      Bun.sleepSync(2);
    }
    return 1;
  });
  const table =
    command.operation.kind === 'begin' ? 'run5_recovery_journal' : 'run5_runtime_acceptance';
  database.run(
    `CREATE TRIGGER recovery_test_barrier BEFORE INSERT ON ${table} BEGIN SELECT recovery_test_barrier(); END;`,
  );
  stores = createSqliteRunStore(database, {
    clock: { read: () => 1000 },
    maxBusyAttempts: 20,
    busyDelayMilliseconds: 1,
  });
  const reply =
    command.operation.kind === 'begin'
      ? await stores.runs.beginRecovery(decodeRecoveryBeginCall(command.operation.call))
      : command.operation.kind === 'accept_claim'
        ? await stores.runs.recordClaimAcceptance(
            decodeScopedAttemptGuard(command.operation.guard),
            decodeClaimAcceptCommand(command.operation.input),
          )
        : await stores.runs.recordRuntimeAcceptance(
            decodeRuntimeGuard(command.operation.guard),
            decodeRuntimeAcceptanceInput(command.operation.input),
          );
  process.stdout.write(JSON.stringify(reply) + '\n');
} finally {
  if (stores === undefined) database.close();
  else await stores.close();
}
