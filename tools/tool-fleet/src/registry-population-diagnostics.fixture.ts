import { type } from 'arktype';

// Proof (fixture clues only): removing fixed file, positive/maximum coordinates, or receiver count validation makes malformed-frame negatives accept the frame.
const PopulationFrame = type({
  file: "'fixture-bundle'",
  line: '0 < number.safe <= 999999',
  column: '0 < number.safe <= 999999',
  '+': 'reject',
});

// Proof (fixture receiver only): independently loosening unknown fields, evidence/phase/UUID enums, manifest count or branch boolean accepts its malformed diagnostic negative.
const PartialObservation = type({
  thirdLayerPut: 'boolean',
  patchAccepted: 'boolean',
  injected503: 'boolean',
  evidence: "'unobserved'|'present'|'absent'",
  stagingPhase: "'unobserved'|'absent'|'writing'|'stored'",
  uploadId: "'unobserved'|'absent'|'valid'|'invalid'",
  storedManifests: "'unobserved'|'overbound'|0|1|2|3",
  '+': 'reject',
});
export type RegistryPartialObservation = typeof PartialObservation.infer;
const partialObservations = new WeakMap<Error, RegistryPartialObservation>();
/** Fixture-only diagnostic association preserves the original Error and copies bounded internal predicates; it never serializes requests, IDs or a caught message. */
export function recordRegistryPartialFailure(
  failure: unknown,
  observation: RegistryPartialObservation,
): void {
  // Proof (fixture snapshot only): removing the copy lets later mutation change the recorded branch and fails the snapshot test.
  if (failure instanceof Error && !partialObservations.has(failure))
    partialObservations.set(failure, structuredClone(observation));
}

export type RegistryPopulationStage = 'reopen' | 'retained' | 'ordinary-delete' | 'partial';

/** Bounded fixture-only diagnostic; never returns a caught message, stack, request or journal. Unknown/truncated trees do not certify any unobserved category. */
export function describeRegistryPopulationFailure(stage: RegistryPopulationStage, cause: unknown) {
  const frames: (typeof PopulationFrame.infer)[] = [];
  const observed: typeof PopulationFailure.infer = {
    stage,
    upstream503: false,
    readonlyAckMissing: false,
    liveFenceUnconfirmed: false,
    truncated: false,
    frames,
    framesTruncated: false,
    partial: null,
  };
  const pending: unknown[] = [cause];
  const visited = new Set<Error>();
  while (pending.length > 0) {
    if (visited.size >= 32) {
      observed.truncated = true;
      break;
    }
    const failure = pending.shift();
    if (!(failure instanceof Error) || visited.has(failure)) continue;
    visited.add(failure);
    observed.partial ??= partialObservations.get(failure) ?? null;
    const location = readRegistryFixtureFrame(failure);
    if (location.kind === 'truncated') observed.framesTruncated = true;
    else if (location.kind === 'frame') {
      // Proof (fixture clues only): removing this cap makes the ten-error test return ten frames instead of eight.
      if (frames.length >= 8) observed.framesTruncated = true;
      else frames.push(location.frame);
    }
    if (
      failure.message ===
      'Managed registry request failed with HTTP 503: owned injected third-tier failure'
    )
      observed.upstream503 = true;
    if (failure.message === 'Unconfirmed live fencing: supervisor acknowledgement missing')
      observed.readonlyAckMissing = true;
    if (failure.message === 'Live fencing is unconfirmed') observed.liveFenceUnconfirmed = true;
    const append = (nested: unknown) => {
      if (pending.length >= 32) observed.truncated = true;
      else pending.push(nested);
    };
    if (failure.cause !== undefined) append(failure.cause);
    if (failure instanceof AggregateError) {
      if (failure.errors.length > 32) observed.truncated = true;
      for (const nested of failure.errors.slice(0, 32)) append(nested);
    }
  }
  return observed;
}

// Proof (fixture observer only): allowing unknown diagnostic fields makes the private-field negative wrongly accept its frame.
const PopulationFailure = type({
  stage: "'reopen'|'retained'|'ordinary-delete'|'partial'",
  upstream503: 'boolean',
  readonlyAckMissing: 'boolean',
  liveFenceUnconfirmed: 'boolean',
  truncated: 'boolean',
  frames: PopulationFrame.array().atMostLength(8),
  framesTruncated: 'boolean',
  partial: PartialObservation.or('null'),
  '+': 'reject',
});
// Proof (fixture observer only): removing the owner enum or unknown-field rejection makes the respective private-input negative accept it.
const PopulationOwner = type({
  boundary: "'identity'|'installation'|'ports'|'clock'|'publication'",
  '+': 'reject',
});
export type RegistryPopulationOwnerBoundary = typeof PopulationOwner.infer.boundary;

/** Observes failed fixture stderr without printing it. Unknown/duplicate/oversized frames remain explicitly unverified; a validated diagnostic never converts the owner's failure into success. */
export function observeRegistryPopulationOutput(stderr: string) {
  type Marker = 'absent' | 'valid' | 'invalid' | 'duplicate';
  const observed: {
    bounded: boolean;
    diagnostic: Marker;
    owner: Marker;
    failure: typeof PopulationFailure.infer | null;
    boundary: RegistryPopulationOwnerBoundary | null;
    trailer: boolean;
    unexpectedLines: boolean;
  } = {
    bounded: true,
    diagnostic: 'absent',
    owner: 'absent',
    failure: null,
    boundary: null,
    trailer: false,
    unexpectedLines: false,
  };
  // Proof (fixture observer only): independently removing byte/line bounds makes the oversized-output test parse a marker and fail its bounded=false assertion.
  if (Buffer.byteLength(stderr) > 16 * 1024) return { ...observed, bounded: false };
  const lines = stderr.split('\n');
  if (lines.length > 128) return { ...observed, bounded: false };
  const failurePrefix = 'task8-population-diagnostic:';
  const ownerPrefix = 'task8-population-owner:';
  // Boundary: preserve explicit absent-frame branches instead of trusting unchecked index reads.
  const failures: (string | undefined)[] = lines.filter((line) => line.startsWith(failurePrefix));
  const owners: (string | undefined)[] = lines.filter((line) => line.startsWith(ownerPrefix));
  observed.trailer = lines.includes('Native host fixture operation failed');
  observed.unexpectedLines = lines.some(
    (line) =>
      line !== '' &&
      line !== 'Native host fixture operation failed' &&
      !line.startsWith(failurePrefix) &&
      !line.startsWith(ownerPrefix),
  );
  const decode = (frame: string): { kind: 'parsed'; value: unknown } | { kind: 'malformed' } => {
    try {
      return { kind: 'parsed', value: JSON.parse(frame) };
    } catch (cause) {
      if (cause instanceof SyntaxError) return { kind: 'malformed' };
      throw cause;
    }
  };
  // Proof (fixture observer only): independently removing either duplicate guard certifies the first competing frame and fails the duplicate-marker test.
  if (failures.length > 1) observed.diagnostic = 'duplicate';
  else if (failures[0] !== undefined) {
    observed.diagnostic = 'invalid';
    const decoded = decode(failures[0].slice(failurePrefix.length));
    if (decoded.kind === 'parsed') {
      const failure = PopulationFailure(decoded.value);
      if (!(failure instanceof type.errors)) {
        observed.diagnostic = 'valid';
        observed.failure = failure;
      }
    }
  }
  if (owners.length > 1) observed.owner = 'duplicate';
  else if (owners[0] !== undefined) {
    observed.owner = 'invalid';
    const decoded = decode(owners[0].slice(ownerPrefix.length));
    if (decoded.kind === 'parsed') {
      const owner = PopulationOwner(decoded.value);
      if (!(owner instanceof type.errors)) {
        observed.owner = 'valid';
        observed.boundary = owner.boundary;
      }
    }
  }
  return observed;
}

/** Fixture-only clues, never authenticated error provenance. Skip the complete name/message prefix so forged message lines are not interpreted; retain no raw stack, function or path. */
// Proof (fixture clues): exact backup-worker aliases yield bounded frames; removing their alternative loses two positives, while accepting backup-worker-copy.js breaks the spoof negative. Both installed aliases must bind the same pinned bundle.
export function readRegistryFixtureFrame(
  failure: Error,
): { kind: 'absent' | 'truncated' } | { kind: 'frame'; frame: typeof PopulationFrame.infer } {
  const stack = failure.stack;
  if (stack === undefined) return { kind: 'absent' };
  // Proof (fixture clues only): independent stack byte/line bound removals expose a frame from the oversized stack in the negative test.
  if (Buffer.byteLength(stack) > 16 * 1024) return { kind: 'truncated' };
  const heading = failure.message === '' ? failure.name : `${failure.name}: ${failure.message}`;
  if (!stack.startsWith(heading + '\n')) return { kind: 'absent' };
  // Proof (fixture clues only): removing heading slicing reports the forged message frame; weakening the exact path patterns accepts the suffix/path-spoof fixture.
  const lines = stack.slice(heading.length + 1).split('\n');
  if (lines.length > 128) return { kind: 'truncated' };
  const named =
    /^ {4}at [^()\r\n]{1,160} \(\/usr\/local\/libexec\/puni-registry-maintenance\/(?:proof|backup-worker)\.js:([1-9][0-9]{0,5}):([1-9][0-9]{0,5})\)$/;
  const bare =
    /^ {4}at \/usr\/local\/libexec\/puni-registry-maintenance\/(?:proof|backup-worker)\.js:([1-9][0-9]{0,5}):([1-9][0-9]{0,5})$/;
  for (const line of lines) {
    const matched = named.exec(line) ?? bare.exec(line);
    if (matched === null) continue;
    // Fixed anchored patterns expose only bounded positive decimal captures; the schema also validates the serialized receiver boundary.
    // Boundary: retain required capture checks even though unchecked RegExp index typing claims every slot is a string.
    const lineNumber = matched[1] as string | undefined;
    const column = matched[2] as string | undefined;
    if (lineNumber === undefined || column === undefined)
      throw new Error('Missing fixed diagnostic frame capture');
    return {
      kind: 'frame',
      frame: { file: 'fixture-bundle', line: Number(lineNumber), column: Number(column) },
    };
  }
  return { kind: 'absent' };
}
