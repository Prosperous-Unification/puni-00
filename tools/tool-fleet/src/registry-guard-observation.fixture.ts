import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import { readRegistryFixtureBootMilliseconds } from './registry-http-observation.fixture';
import { readRegistryFixtureFrame } from './registry-population-diagnostics.fixture';

export const RegistryPermissionObservation = type({
  state: "'coherent'",
  permitsWrites: 'boolean',
  fenced: 'boolean',
  '+': 'reject',
}).or({ state: "'transition'|'absent'", '+': 'reject' });
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Fixture diagnostic reads actual owner files as root without confusing observer UID with authority UID. This is not an authority validator or a write admission. Two unchanged descriptor/path identities and byte hashes establish only the sampled permit/journal relation; any replacement is explicitly transitional. */
export async function observeRegistryFixturePermission(
  directory: string,
  owner: { uid: number; gid: number },
  afterFirst?: () => Promise<void>,
  afterOpen?: () => Promise<void>,
): Promise<typeof RegistryPermissionObservation.infer> {
  let opened = false;
  const read = async (name: 'writable.permit' | 'journal.json') => {
    const path = join(directory, name);
    let descriptor;
    try {
      descriptor = await open(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
    } catch (cause) {
      if (
        cause instanceof Error &&
        'code' in cause &&
        cause.code === 'ENOENT' &&
        name === 'writable.permit'
      )
        return null;
      throw cause;
    }
    try {
      if (name === 'writable.permit' && !opened) {
        opened = true;
        await afterOpen?.();
      }
      const before = await descriptor.stat();
      const limit = name === 'writable.permit' ? 256 : 16 * 1024 * 1024;
      // Proof (fixture observation only): independent UID/GID/mode/link removals make the actual-file metadata negatives resolve.
      if (
        !before.isFile() ||
        before.uid !== owner.uid ||
        before.gid !== owner.gid ||
        (before.mode & 0o7777) !== 0o600 ||
        before.nlink > 1 ||
        before.size < 1 ||
        before.size > limit
      )
        throw new Error('Unexpected fixture permission metadata');
      // Proof (fixture sampler only): reinstating unconditional nlink1 rejects the actual open/rename/first-fstat transition test.
      if (before.nlink === 0) {
        let current;
        try {
          current = await lstat(path);
        } catch (cause) {
          if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')
            return { transition: true as const };
          throw cause;
        }
        if (current.dev !== before.dev || current.ino !== before.ino)
          return { transition: true as const };
        throw new Error('Unexpected unlinked fixture descriptor identity');
      }
      const bytes = Buffer.alloc(before.size + 1);
      let length = 0;
      while (length < bytes.length) {
        const read = await descriptor.read(bytes, length, bytes.length - length, null);
        if (read.bytesRead === 0) break;
        length += read.bytesRead;
      }
      const after = await descriptor.stat();
      let linked;
      try {
        linked = await lstat(path);
      } catch (cause) {
        if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')
          return { transition: true as const };
        throw cause;
      }
      const identity = (status: typeof before) =>
        [
          status.dev,
          status.ino,
          status.size,
          status.mtimeMs,
          status.ctimeMs,
          status.uid,
          status.gid,
          status.mode,
          status.nlink,
        ].join(':');
      if (
        length !== before.size ||
        identity(before) !== identity(after) ||
        identity(after) !== identity(linked)
      )
        return { transition: true as const };
      return {
        transition: false as const,
        identity: identity(after),
        bytes: bytes.subarray(0, length),
        hash: hash(bytes.subarray(0, length)),
      };
    } finally {
      await descriptor.close();
    }
  };
  const permitBefore = await read('writable.permit');
  const canonicalBefore = await read('journal.json');
  await afterFirst?.();
  const permitAfter = await read('writable.permit');
  const canonicalAfter = await read('journal.json');
  if (canonicalBefore === null || canonicalAfter === null)
    throw new Error('Missing fixture canonical journal');
  if (
    canonicalBefore.transition ||
    canonicalAfter.transition ||
    permitBefore?.transition ||
    permitAfter?.transition
  )
    return { state: 'transition' };
  // Proof (fixture observation only): removed canonical identity/hash comparison certifies the injected replacement as coherent.
  if (
    canonicalBefore.identity !== canonicalAfter.identity ||
    canonicalBefore.hash !== canonicalAfter.hash
  )
    return { state: 'transition' };
  if (permitBefore === null && permitAfter === null) return { state: 'absent' };
  const hasPermit = permitAfter !== null;
  // Proof (fixture observation only): removing permit identity comparison certifies an atomic same-byte replacement as coherent.
  if (
    permitBefore === null ||
    !hasPermit ||
    permitBefore.identity !== permitAfter.identity ||
    permitBefore.hash !== permitAfter.hash
  )
    return { state: 'transition' };
  const fields =
    /^1 ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}) (0|[1-9]\d*) (0|[1-9]\d*) ([0-9a-f]{64}) ([0-9a-f]{64})\n$/.exec(
      permitAfter.bytes.toString('utf8'),
    );
  if (fields === null) throw new Error('Malformed fixture permission');
  const issued = Number(fields[2]),
    expires = Number(fields[3]);
  if (!Number.isSafeInteger(issued) || !Number.isSafeInteger(expires) || expires - issued !== 30)
    throw new Error('Malformed fixture permission interval');
  const canonical: unknown = JSON.parse(canonicalAfter.bytes.toString('utf8'));
  if (
    typeof canonical !== 'object' ||
    canonical === null ||
    !('fenced' in canonical) ||
    typeof canonical.fenced !== 'boolean'
  )
    throw new Error('Malformed fixture canonical fence');
  const boot = await readFile('/proc/sys/kernel/random/boot_id', 'utf8');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\n$/.test(boot))
    throw new Error('Malformed fixture boot identity');
  const seconds = readRegistryFixtureBootMilliseconds() / 1000;
  return {
    state: 'coherent',
    fenced: canonical.fenced,
    // Proof (fixture observation only): expiry and boot removals each report the stale or foreign-boot sample writable.
    permitsWrites:
      fields[1] === boot.trim() &&
      issued <= seconds &&
      expires > seconds &&
      (canonicalAfter.hash === fields[4] || canonicalAfter.hash === fields[5]),
  };
}

/** Only the exact owned Distribution command contributes a mode; shell utility children are explicitly other. UID or environment ambiguity fails the observation. */
export function classifyRegistryFixtureChild(
  argv: string,
  status: string,
  environment: string,
  expected: readonly string[],
): 'writable' | 'readonly' | 'other' {
  if (argv.length > 4096 || status.length > 16384 || environment.length > 16384)
    throw new Error('Oversized guard child observation');
  if (JSON.stringify(argv.split('\0')) !== JSON.stringify(expected)) return 'other';
  // Proof (fixture child only): removed owner or unique-mode checks admit the wrong UID or duplicate environment negative.
  if (!/^Uid:\s+59001\s+59001\s+59001\s+59001$/m.test(status))
    throw new Error('Unexpected guard child owner');
  const modes = environment
    .split('\0')
    .filter((entry) => entry.startsWith('REGISTRY_STORAGE_MAINTENANCE_READONLY='));
  if (modes.length !== 1) throw new Error('Ambiguous guard child mode');
  if (modes[0] === 'REGISTRY_STORAGE_MAINTENANCE_READONLY={"enabled":true}') return 'readonly';
  if (modes[0] === 'REGISTRY_STORAGE_MAINTENANCE_READONLY={"enabled":false}') return 'writable';
  throw new Error('Unknown guard child mode');
}

export const RegistryGuardTimeline = type({
  samples: type({
    started: 'number.safe >= 0',
    finished: 'number.safe >= 0',
    child: "'readonly'|'writable'|'transition'|'exited'",
    permission: RegistryPermissionObservation,
    '+': 'reject',
  })
    .array()
    .atMostLength(128),
  truncated: 'boolean',
  '+': 'reject',
});

/** Bounded fixture-only observation loop. Owner terminal precedes stop; stop awaits the final sample, surfaces every observer failure, and permits no background file or process reads after cleanup. Only state changes are retained; unchanged gaps are not continuous-state certification. Samples share the kernel uptime origin with HTTP observations. */
export function startRegistryGuardTimeline(
  directory: string,
  observeChild: () => Promise<RegistryFixtureChildObservation>,
) {
  let stopped = false;
  let truncated = false;
  const samples: typeof RegistryGuardTimeline.infer.samples = [];
  const started = readRegistryFixtureBootMilliseconds();
  const terminal = (async () => {
    let previous: string | undefined;
    // Boundary: stop() updates this boolean while sampling awaits I/O.
    while (!(stopped as boolean)) {
      const before = readRegistryFixtureBootMilliseconds();
      if (before - started > 60000) throw new Error('Guard observation exceeded fixture lifetime');
      const childBefore = await observeChild();
      const permission = await observeRegistryFixturePermission(directory, {
        uid: 59001,
        gid: 59001,
      });
      const childAfter = await observeChild();
      const finished = readRegistryFixtureBootMilliseconds();
      if (finished < before) throw new Error('Guard observation clock moved backwards');
      const child =
        childBefore.mode === childAfter.mode && childBefore.identity === childAfter.identity
          ? childAfter.mode
          : 'transition';
      const fingerprint = JSON.stringify({ child, permission });
      if (previous !== fingerprint) {
        previous = fingerprint;
        if (samples.length === 128) truncated = true;
        else samples.push({ started: before, finished, child, permission });
      }
      await Bun.sleep(50);
    }
  })().then(
    () => ({ ok: true as const }),
    (cause: unknown) => ({ ok: false as const, cause }),
  );
  return {
    async stop() {
      stopped = true;
      const outcome = await terminal;
      if (!outcome.ok) throw outcome.cause;
      return RegistryGuardTimeline.assert({ samples, truncated });
    },
  };
}

/** Internal PID/start binding only; no identifier is serialized in the diagnostic timeline. */
export function readRegistryFixtureStart(stat: string, pid: string): string {
  // Proof (fixture process only): removing PID agreement admits another process stat in the exact-PID negative.
  if (stat.length > 16384 || !stat.startsWith(pid + ' ('))
    throw new Error('Unexpected guard process identity');
  const delimiter = stat.lastIndexOf(') ');
  if (delimiter < 0) throw new Error('Malformed guard process identity');
  const started = stat
    .slice(delimiter + 2)
    .trim()
    .split(/\s+/)
    .at(19);
  if (
    started === undefined ||
    !/^[1-9]\d*$/.test(started) ||
    !Number.isSafeInteger(Number(started))
  )
    throw new Error('Malformed guard process start');
  return started;
}
export interface RegistryFixtureChildObservation {
  mode: 'readonly' | 'writable' | 'transition' | 'exited';
  identity: string | null;
}

/** Fixed fixture clues only, never authenticated provenance or raw error text. Unknown causes retain the required observation failure. The shared frame parser excludes the entire message prefix and returns bounded numeric locations only. */
export function describeRegistryGuardObservationFailure(cause: unknown) {
  if (!(cause instanceof Error)) return { category: 'unknown', location: { kind: 'absent' } };
  // Proof (fixture diagnostic only): removed fixed mapping or private-message fallback fails the exact category/nonreflection tests.
  const categories = new Map([
    ['Unexpected fixture permission metadata', 'permission-metadata'],
    ['Unexpected unlinked fixture descriptor identity', 'unlinked-descriptor'],
    ['Missing fixture canonical journal', 'canonical-missing'],
    ['Malformed fixture permission', 'permission-record'],
    ['Malformed fixture permission interval', 'permission-interval'],
    ['Malformed fixture canonical fence', 'canonical-fence'],
    ['Malformed fixture boot identity', 'boot-identity'],
    ['Oversized guard child observation', 'child-bound'],
    ['Unexpected guard child owner', 'child-owner'],
    ['Ambiguous guard child mode', 'child-mode-ambiguous'],
    ['Unknown guard child mode', 'child-mode-unknown'],
    ['Guard observation exceeded fixture lifetime', 'timeline-lifetime'],
    ['Guard observation clock moved backwards', 'timeline-clock'],
    ['Unexpected guard process identity', 'child-identity'],
    ['Malformed guard process identity', 'child-identity'],
    ['Malformed guard process start', 'child-start'],
    ['Malformed guard observation child census', 'child-census'],
    ['Multiple owned guard servers observed', 'multiple-children'],
  ]);
  const code = 'code' in cause ? cause.code : null;
  const category =
    categories.get(cause.message) ??
    (code === 'ENOENT'
      ? 'file-absent'
      : code === 'EACCES'
        ? 'access-denied'
        : code === 'ESRCH'
          ? 'process-absent'
          : 'unknown');
  // Proof: removing frame delivery loses the exact numeric clue in the successful-owner/failed-monitor test.
  return { category, location: readRegistryFixtureFrame(cause) };
}

/** Bind a sampled ordinary supervisor's acknowledgement to its unchanged instance, actual boot and a new request nonce. Every raw observation is required by equality with the canonical request; absence refuses. The caller verifies descriptor ownership/path identity. This returns only hashes and never grants writes or certifies native execution.
 * @throws On malformed requests or missing, stale, substituted or foreign observations.
 */
export function verifyRegistrySupervisorAcknowledgement(input: unknown) {
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const request = type(new RegExp('^' + uuid + ' ' + uuid + ' ' + uuid + '\n(?![\\s\\S])'));
  // Proof (correlation): schema omission accepts malformed previous records and extra keys in registry-guard-observation.test.ts.
  const observed = type({
    'instance?': 'unknown',
    previousRequest: request,
    request,
    'afterInstance?': 'unknown',
    'acknowledgement?': 'unknown',
    'boot?': 'unknown',
    '+': 'reject',
  }).assert(input);
  const instance = observed.request.slice(37);
  // Proof (correlation): each captured/current instance, boot, fresh-nonce and ACK predicate omission admits its corresponding mismatched or absent observation.
  if (
    observed.afterInstance !== instance ||
    observed.boot !== instance.slice(37) ||
    observed.instance !== instance ||
    observed.request.slice(0, 36) === observed.previousRequest.slice(0, 36) ||
    observed.acknowledgement !== observed.request
  )
    throw new Error(
      'Supervisor acknowledgement is not bound to the current instance, boot and new request',
    );
  return {
    instanceSha256: hash(Buffer.from(instance)),
    requestSha256: hash(Buffer.from(observed.request)),
  };
}
