import { createHash } from 'node:crypto';

export const registryGuardOriginalSha256 =
  '020d445290293563758ac52529abb65e7a3bb633bd75414564d411eb7824a220';
const reasons = [
  'permission-stat',
  'permission-metadata',
  'journal-stat',
  'journal-metadata',
  'permission-open',
  'permission-size',
  'permission-bound',
  'permission-read',
  'record-size',
  'record-fields',
  'record-canonical',
  'boot-read',
  'boot-mismatch',
  'uptime-read',
  'record-lease-grammar',
  'checksum-read',
  'checksum-mismatch',
  'sample-limit',
  'allowed',
] as const;
type Reason = (typeof reasons)[number];
interface Decision {
  sequence: number;
  uptime: number;
  desired: 'readonly' | 'writable';
  reason: Reason;
  phase: 'first' | 'final';
  attempt: number;
}
const digest = (source: string) => createHash('sha256').update(source).digest('hex');

/** Diagnostic-only assignments around the exact pinned shell; deleting marked lines reconstructs every original byte. No decision predicate, return status, sample count, or lease changes. The caller must verify the new artifact separately before execution. */
export function instrumentRegistryGuard(source: string) {
  // Proof (fixture only): removing the original-byte pin accepts an added newline in the exact-source test.
  if (digest(source) !== registryGuardOriginalSha256)
    throw new Error('Unexpected guard diagnostic source');
  let inside = false;
  let sample = 0;
  const transformed: string[] = [];
  const insert = (statement: string) => transformed.push(statement + ' # task8-decision');
  for (const line of source.split('\n')) {
    if (line === 'permits_writes() {') inside = true;
    if (line === 'umask 077') inside = false;
    const command = line.trim();
    if (inside) {
      let reason: Reason | undefined;
      if (command.startsWith('metadata=$(stat') && command.includes('"$permission"'))
        reason = 'permission-stat';
      if (command.startsWith('metadata=$(stat') && command.includes('"$canonical"'))
        reason = 'journal-stat';
      if (command === `test "$metadata" = '8180:59001:59001:1' || return 1`) {
        reason = transformed.at(-1)?.includes('"$canonical"')
          ? 'journal-metadata'
          : 'permission-metadata';
      }
      if (command === '{') reason = 'permission-open';
      if (command.startsWith('size=$(stat')) reason = 'permission-size';
      if (command === 'test "$size" -le 256 || return 1') reason = 'permission-bound';
      if (command === 'IFS= read -r record <&3 || return 1') reason = 'permission-read';
      if (command.startsWith('test "${#record}"')) reason = 'record-size';
      if (command === 'test -z "$extra" || return 1') reason = 'record-fields';
      if (command.startsWith('test "$record" =')) reason = 'record-canonical';
      if (command.startsWith('actual_boot=')) reason = 'boot-read';
      if (command.startsWith('test "$boot" =')) reason = 'boot-mismatch';
      if (command.startsWith('uptime=')) reason = 'uptime-read';
      if (command.startsWith("printf '%s %s %s %s %s %s")) reason = 'record-lease-grammar';
      if (command.startsWith('checksum=$(sha256sum')) reason = 'checksum-read';
      if (command.startsWith('if test "$checksum" =')) reason = 'checksum-mismatch';
      if (command === 'return 0') reason = 'allowed';
      if (line === '  return 1') reason = 'sample-limit';
      if (command === 'read_permission || return 1') {
        sample++;
        insert(`    task8_phase=${sample === 1 ? 'first' : 'final'}`);
      }
      if (reason !== undefined) insert('    task8_reason=' + reason);
    }
    if (line === 'mode=') insert('task8_sequence=0');
    transformed.push(line);
    if (line === '  if permits_writes; then desired=writable; fi') {
      insert('  task8_sequence=$((task8_sequence + 1))');
      insert("  task8_observed=$(cut -d ' ' -f 1 /proc/uptime)");
      insert(
        `  printf 'task8-decision %s %s %s %s %s %s\\n' "$task8_sequence" "$task8_observed" "$desired" "$task8_reason" "$task8_phase" "$permission_attempt" >&2`,
      );
    }
  }
  if (sample !== 2) throw new Error('Guard diagnostic sample shape changed');
  const instrumented = transformed.join('\n');
  return {
    source: instrumented,
    originalSha256: registryGuardOriginalSha256,
    sha256: digest(instrumented),
  };
}

/** Parse only fixed decision lines from a bounded, terminally drained owned stderr stream. Unrelated stderr is visible as a boolean and never reflected; missing or malformed diagnostic evidence refuses. Timestamps are post-decision boot-relative observations, not admission or continuous-mode proofs. */
export function readRegistryGuardDecisions(bytes: string): {
  decisions: Decision[];
  otherStderr: boolean;
} {
  // Proof (fixture only): removing the byte bound accepts oversized unrelated stderr followed by a valid decision; private bytes never enter the returned observation.
  if (Buffer.byteLength(bytes) > 256 * 1024)
    throw new Error('Guard diagnostic stream exceeds bound');
  const decisions: Decision[] = [];
  let otherStderr = false;
  for (const line of bytes.split('\n')) {
    if (line === '') continue;
    if (!line.startsWith('task8-decision')) {
      otherStderr = true;
      continue;
    }
    // Proof (fixture only): widened attempt grammar and removed terminal-newline checks admit the corresponding strict-trace negatives.
    const match =
      /^task8-decision ([1-9]\d{0,2}) (\d{1,12}\.\d{2}) (readonly|writable) ([a-z-]+) (first|final) ([1-3])$/.exec(
        line,
      );
    if (match === null || !bytes.endsWith('\n')) throw new Error('Malformed guard decision');
    const [, sequenceText, uptimeText, desired, reasonText, phase, attemptText] = match;
    const reason = reasons.find((candidate) => candidate === reasonText);
    const sequence = Number(sequenceText);
    const uptime = Number(uptimeText);
    // Proof (fixture only): separate removals admit unknown reasons, duplicate sequence, 257 decisions, backward time, writable refusal, first-sample success and premature exhaustion.
    if (
      reason === undefined ||
      (desired !== 'readonly' && desired !== 'writable') ||
      (phase !== 'first' && phase !== 'final') ||
      sequence !== decisions.length + 1 ||
      sequence > 256 ||
      uptime < (decisions.at(-1)?.uptime ?? 0) ||
      (desired === 'writable') !== (reason === 'allowed') ||
      (['allowed', 'checksum-mismatch', 'sample-limit'].includes(reason) && phase !== 'final') ||
      (reason === 'sample-limit' && attemptText !== '3')
    )
      throw new Error('Inconsistent guard decision');
    decisions.push({ sequence, uptime, desired, reason, phase, attempt: Number(attemptText) });
  }
  // Proof (fixture only): removing this check accepts empty diagnostics in the absent-trace negative.
  if (decisions.length === 0) throw new Error('Missing guard decisions');
  return { decisions, otherStderr };
}
