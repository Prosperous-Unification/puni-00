import { inspectExpiredDrafts, purgeExpiredDrafts } from '@website/store-sqlite';

function parseCutoff(value: string): number {
  // Proof: the malformed-cutoff child command fails; accepting it reaches SQLite with an invalid boundary.
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error('Cutoff must be UTC epoch milliseconds');
  const cutoff = Number(value);
  if (!Number.isSafeInteger(cutoff)) throw new Error('Cutoff must be a safe UTC epoch millisecond');
  return cutoff;
}

/** Runs one explicit operator command without opening an API listener. */
export function runDraftRetentionCommand(arguments_: string[], now: number): unknown {
  const [command, databasePath, cutoffText, fingerprint] = arguments_;
  // Proof: unknown-command and missing-argument child commands fail before opening a database.
  if (!databasePath || (command !== 'inspect' && command !== 'apply'))
    throw new Error('Usage: inspect DATABASE | apply DATABASE CUTOFF FINGERPRINT');
  if (command === 'inspect') {
    if (arguments_.length !== 2) throw new Error('Usage: inspect DATABASE');
    return inspectExpiredDrafts(databasePath, now);
  }
  if (arguments_.length !== 4) throw new Error('Usage: apply DATABASE CUTOFF FINGERPRINT');
  const cutoff = parseCutoff(cutoffText);
  // Proof: the malformed-fingerprint child command fails before any database deletion.
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('Fingerprint must be lowercase SHA-256');
  return purgeExpiredDrafts(databasePath, cutoff, fingerprint, now);
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(runDraftRetentionCommand(Bun.argv.slice(2), Date.now())));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Draft retention failed');
    process.exitCode = 1;
  }
}
