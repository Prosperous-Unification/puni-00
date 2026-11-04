import { createHash } from 'node:crypto';
import { appendFile, readFile, readlink } from 'node:fs/promises';

import { type } from 'arktype';

import { readTrustedEnrollment } from './registry-enrollment';
import { executeRegistryHostAction } from './registry-maintenance-actions';
import { verifyRegistryHostArtifact } from './registry-maintenance-installation';
import { readRegistryUpload, RegistryUploadCensus } from './registry-upload-census';

const day = 24 * 60 * 60 * 1000;
const FixtureClock = type({ now: 'string.date.iso', '+': 'reject' });

/** Root-owned fixed fixture enrollment only; neither a caller path nor persisted upload evidence supplies the retirement clock. */
export async function readRegistryFixtureRetirementClock(): Promise<string> {
  const clock = FixtureClock.assert(
    await readTrustedEnrollment('/etc/puni/registry-fixture-retirement-clock.json'),
  );
  if (!Number.isFinite(Date.parse(clock.now)) || new Date(clock.now).toISOString() !== clock.now)
    throw new Error('Invalid exact fixture retirement time');
  return clock.now;
}

/** Synthetic retirement authority time includes journal events/attempts/plan, while real publication, restic receipts and monotonic permits retain their original clocks. */
export function createRegistryFixtureClock(stamp: string): () => string {
  const original = Date.now;
  const offset = measureFixtureOffset(stamp, original());
  // Proof (fixture only): removing this offset fails the independent authority-clock test without altering real Date.now.
  return () => new Date(original() + offset).toISOString();
}

function measureFixtureOffset(stamp: string, now: number): number {
  // Proof (fixture only): independently removing finite/minimum/maximum guards makes invalid offsets reach the callback.
  const offset = Date.parse(stamp) - now;
  if (!Number.isFinite(offset) || offset < 7 * day || offset > 9 * day)
    throw new Error('Fixture retention offset outside bounded eight-day scenario');
  return offset;
}

/** Fixture-only elapsed-time substitution. This does not certify deadlines/capacity freshness across clock shifts; real setTimeout and Date construction are untouched. */
export async function withRegistryFixtureTime<T>(stamp: string, run: () => Promise<T>): Promise<T> {
  const original = Date.now;
  const offset = measureFixtureOffset(stamp, original());
  // Proof (fixture only): freezing this reading fails elapsed advancement; removing restoration fails both normal and throwing callback tests.
  Date.now = () => original() + offset;
  const restore = () => {
    Date.now = original;
    if (Date.now !== original) throw new Error('Fixture real clock was not restored');
  };
  let completed: T;
  try {
    completed = await run();
  } catch (cause) {
    // Proof: actual callback/restoration faults detect skipped restoration and independently lost aggregate members/cause in registry-maintenance-clock.test.ts.
    let restoration: { kind: 'restored' } | { kind: 'failed'; failure: unknown };
    try {
      restore();
      restoration = { kind: 'restored' };
    } catch (restorationFailure) {
      restoration = { kind: 'failed', failure: restorationFailure };
    }
    if (restoration.kind === 'failed')
      throw new AggregateError(
        [cause, restoration.failure],
        'Fixture operation and clock restoration failed',
        { cause },
      );
    throw cause;
  }
  restore();
  return completed;
}

/** Actual fixed root discard dispatch first refuses young staging under real time, with identical complete staged census. Only its second dispatch advances fixture time; original upload bytes/timestamps and every production guard stay unchanged.
 * Completion preserves the original action failure alongside every clock/report failure. Unexpected filesystem rejection values become Errors with their original causes; a failed observation cannot return success.
 */
export async function proveRegistryUploadGrace(
  input: Parameters<typeof executeRegistryHostAction>[0],
): Promise<string> {
  if (
    input.request.action !== 'discard-uploads' ||
    process.getuid?.() !== 0 ||
    process.getgid?.() !== 0 ||
    process.pid === 1
  )
    throw new Error('Upload clock proof requires fixed owned root helper');
  await verifyRegistryHostArtifact({
    path: '/etc/task8-namespace',
    sha256: createHash('sha256').update('owned-private-proof\n').digest('hex'),
  });
  const [self, leader, ownNamespace, leaderNamespace] = await Promise.all([
    readlink('/proc/self'),
    readFile('/proc/1/cmdline'),
    readlink('/proc/self/ns/pid'),
    readlink('/proc/1/ns/pid'),
  ]);
  if (
    self !== String(process.pid) ||
    ownNamespace !== leaderNamespace ||
    leader.toString('utf8') !==
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-populated\0'
  )
    throw new Error('Upload clock proof lacks exact private workload PID namespace');
  const stamp = await readRegistryFixtureRetirementClock();
  const plan = type({
    retireUploads: RegistryUploadCensus.array().atLeastLength(1).atMostLength(2048),
  }).assert(JSON.parse(input.journal.maintenanceEvidence?.plan ?? 'null'));
  const census = () =>
    Promise.all(
      plan.retireUploads.map((upload) =>
        readRegistryUpload(input.journal, upload.repository, upload.uploadId),
      ),
    );
  const before = await census();
  let refused = false;
  try {
    await executeRegistryHostAction(input);
  } catch (cause) {
    if (
      !(cause instanceof Error) ||
      cause.message !== 'Upload owner is not reconciled and grace-eligible'
    )
      throw cause;
    refused = true;
  }
  const unchanged = JSON.stringify(before) === JSON.stringify(await census());
  await appendFile(
    '/root/task8-fixture/upload-grace-proof.log',
    JSON.stringify({
      realClockRefused: refused,
      stagedCensusUnchanged: unchanged,
      offsetMilliseconds: measureFixtureOffset(stamp, Date.now()),
    }) + '\n',
    { mode: 0o600 },
  );
  if (!refused || !unchanged) throw new Error('Real-time young staging was not preserved');
  const original = Date.now;
  const observe = async () => {
    const restored = Date.now === original;
    const failures: Error[] = [];
    // Proof (modeled completion): omitting this failure loses the false-clock cases even if the report also fails.
    if (!restored) failures.push(new Error('Upload proof did not restore real clock'));
    try {
      await appendFile(
        '/root/task8-fixture/upload-grace-proof.log',
        JSON.stringify({ realClockRestored: restored }) + '\n',
        { mode: 0o600 },
      );
    } catch (cause) {
      // Proof (modeled filesystem boundary): omitted wrapping or cause context fails undefined/null/string rejection cases.
      failures.push(
        cause instanceof Error
          ? cause
          : new Error('Upload clock report rejected a non-error value', { cause }),
      );
    }
    return failures;
  };
  let completed: string;
  try {
    completed = await withRegistryFixtureTime(stamp, () => executeRegistryHostAction(input));
  } catch (cause) {
    // Proof (modeled completion): skipping observation or losing the original member/cause fails the compound operation/clock/report cases.
    const failures = await observe();
    if (failures.length > 0)
      throw new AggregateError(
        [cause, ...failures],
        'Upload operation and clock observation failed',
        { cause },
      );
    throw cause;
  }
  const failures = await observe();
  // Proof (modeled completion): a false clock and failed report retain both causes after a successful action.
  if (failures.length > 1)
    throw new AggregateError(failures, 'Upload clock observation failed', { cause: failures[0] });
  if (failures.length === 1) return Promise.reject(failures[0]);
  return completed;
}
