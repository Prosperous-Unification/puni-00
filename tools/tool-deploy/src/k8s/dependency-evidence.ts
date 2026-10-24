import { createHash } from 'node:crypto';

type Decoder<T> = (value: unknown) => T;
type Decoded<S> = { [K in keyof S]: S[K] extends Decoder<infer T> ? T : never };

function throwInvalidEvidence(message: string): never {
  throw new Error(`invalid Kubernetes dependency evidence: ${message}`);
}
// Proof: object-boundary fault replaced the named object-required error with an incidental exception.
function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throwInvalidEvidence('object required');
  // Boundary: non-null non-array object checked above; values remain unknown.
  return value as Record<string, unknown>;
}
function decodeObject<S extends Record<string, Decoder<unknown>>>(shape: S): Decoder<Decoded<S>> {
  return (value) => {
    const fields = readRecord(value);
    // Proof: closed-shape fault admitted unknown fields; other guards still rejected missing progress.
    if (Object.keys(fields).sort().join(',') !== Object.keys(shape).sort().join(','))
      throwInvalidEvidence('closed fields differ');
    const decoded = Object.fromEntries(
      Object.entries(shape).map(([key, decode]) => [key, decode(fields[key])]),
    );
    // Boundary: exact shape checked and every key decoded by its corresponding decoder above.
    return decoded as Decoded<S>;
  };
}
// Proof: nonempty-text fault admitted the explicit empty store reason.
function readText(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '')
    throwInvalidEvidence('nonempty text required');
  return value;
}
// Proof: literal fault admitted nine format/protocol/version/authority negatives.
function decodeLiteral<const T extends string | number>(expected: T): Decoder<T> {
  return (value) => {
    if (value !== expected) throwInvalidEvidence(`expected ${String(expected)}`);
    return expected;
  };
}
// Proof: array-boundary fault replaced the named array-required failure with an incidental exception.
function decodeList<T>(decode: Decoder<T>): Decoder<T[]> {
  return (value) => {
    if (!Array.isArray(value)) throwInvalidEvidence('array required');
    const decoded: T[] = [];
    for (let index = 0; index < value.length; index++) {
      // Proof: sparse-index fault lost the named dense-array refusal in six exported-boundary tests; restoring map also admitted the original sparse-semantics input.
      if (!Object.hasOwn(value, index)) throwInvalidEvidence('dense array required');
      decoded.push(decode(value[index]));
    }
    return decoded;
  };
}
// Proof: choice fault admitted the unknown observed-store stage.
function decodeChoice<const T extends readonly string[]>(...choices: T): Decoder<T[number]> {
  return (value) => {
    const candidate = readText(value);
    if (!choices.includes(candidate)) throwInvalidEvidence('unknown choice');
    return candidate;
  };
}
// Proof: integer fault admitted negative and fractional activation timestamps.
function readInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throwInvalidEvidence('nonnegative integer required');
  return value;
}
// Proof: digest fault admitted an invalid B2 ownership hash.
function readDigest(value: unknown): string {
  const hash = readText(value);
  if (!/^[0-9a-f]{64}$/.test(hash)) throwInvalidEvidence('SHA256 required');
  return hash;
}
// Proof: image fault admitted an unpinned participant image.
function readImage(value: unknown): string {
  const reference = readText(value);
  if (!/^[^\s@]+@sha256:[0-9a-f]{64}$/.test(reference))
    throwInvalidEvidence('digest image required');
  return reference;
}
function encodeCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(encodeCanonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, field]) => `${JSON.stringify(key)}:${encodeCanonical(field)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function hashBytes(bytes: string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function assertEqual(observed: unknown, expected: unknown, label: string): void {
  // Proof: equality fault admits resealed foreign source, swapped attribution and mismatched receipts.
  if (encodeCanonical(observed) !== encodeCanonical(expected))
    throwInvalidEvidence(`${label} differs`);
}
const readInvocation = decodeObject({
  observationId: readText,
  namespace: readText,
  jobName: readText,
  jobUid: readText,
  podUid: readText,
  image: readImage,
  command: decodeList(readText),
  commandSha256: readDigest,
});
const readBinding = decodeObject({
  transactionId: readText,
  clusterUid: readText,
  namespace: readText,
  pvcName: decodeLiteral('wbs-data'),
  pvcUid: readText,
  volumeName: readText,
  pvUid: readText,
  databasePath: decodeLiteral('/data/wbs.sqlite'),
  candidateImage: readImage,
  retainedImage: readImage,
  migrationCaptureSha256: readDigest,
  candidateInvocation: readInvocation,
  retainedInvocation: readInvocation,
});
const readBinary = decodeObject({
  invocation: readInvocation,
  semantics: decodeList(decodeLiteral('cross-project-dependencies-v1')),
});
const readReceipt = decodeObject({
  protocol: decodeLiteral('wbs-dependency-activation'),
  version: decodeLiteral(1),
  activationId: readText,
  databaseIdentity: readText,
  candidateImage: readImage,
  rollbackImage: readImage,
  participantProofSha256: readDigest,
  migrationCaptureSha256: readDigest,
  activatedAt: readInteger,
});
const readIdentity = decodeObject({ kind: readText, uid: readText, image: readImage });
const readProof = decodeObject({ source: readText, bytes: readText, sha256: readDigest });
const readParticipants = decodeObject({
  policy: decodeObject({
    id: readText,
    revision: readText,
    requiredRoles: decodeList(readText),
    body: readText,
  }),
  roster: decodeList(decodeObject({ id: readText, role: readText, identity: readIdentity })),
  entries: decodeList(
    decodeObject({
      participantId: readText,
      identity: readIdentity,
      claim: decodeChoice('fenced', 'compatible', 'unresolved'),
      proof: readProof,
    }),
  ),
  unresolved: decodeList(readText),
});
const readReceiptObservation = decodeObject({ invocation: readInvocation, receipt: readReceipt });
function readActivation(value: unknown) {
  const state = readRecord(value)['state'];
  if (state === 'not-requested')
    return decodeObject({ state: decodeLiteral('not-requested') })(value);
  if (state === 'durable-intent')
    return decodeObject({ state: decodeLiteral('durable-intent'), receipt: readReceipt })(value);
  return decodeObject({
    state: decodeLiteral('confirmed'),
    receipt: readReceipt,
    command: readReceiptObservation,
    readback: readReceiptObservation,
  })(value);
}
function readExposure(value: unknown) {
  const state = readRecord(value)['state'];
  if (state === 'not-started') return decodeObject({ state: decodeLiteral('not-started') })(value);
  if (state === 'durable-intent')
    return decodeObject({
      state: decodeLiteral('durable-intent'),
      intentId: readText,
      candidateImage: readImage,
    })(value);
  return decodeObject({
    state: decodeLiteral('confirmed'),
    intentId: readText,
    candidateImage: readImage,
    invocation: readInvocation,
  })(value);
}
function readStore(value: unknown) {
  if (readRecord(value)['state'] === 'incomplete')
    return decodeObject({ state: decodeLiteral('incomplete'), reason: readText })(value);
  return decodeObject({
    state: decodeLiteral('observed'),
    stage: decodeChoice('pre-migration', 'pre-exposure'),
    interval: decodeObject({
      id: readText,
      ownershipSha256: readDigest,
      startedAt: readInteger,
      observedAt: readInteger,
    }),
    source: readBinding,
    invocation: readInvocation,
    authority: decodeObject({
      protocol: decodeLiteral('wbs-dependency-preservation'),
      version: decodeLiteral(1),
      state: decodeLiteral('DISABLED'),
      externalRelationships: decodeLiteral(0),
    }),
    receipt: decodeObject({ state: decodeLiteral('absent') }),
  })(value);
}
const readPayload = decodeObject({
  format: decodeLiteral('wbs-k8s-dependency-evidence'),
  version: decodeLiteral(1),
  binding: readBinding,
  binaries: decodeObject({ candidate: readBinary, retained: readBinary }),
  store: readStore,
  participants: readParticipants,
  activation: readActivation,
  exposure: readExposure,
});

/** Externally pinned source and two independently invoked binary identities; never derived from the envelope. */
export type DependencyEvidenceBinding = ReturnType<typeof readBinding>;
/** Detached claims and explicit progress only. Participant claims do not establish exclusion authority. */
export type DependencyEvidencePayload = ReturnType<typeof readPayload>;
/** Canonical UTF-8 JSON text with an equality projection; SHA256 detects inconsistency, not forgery. */
export interface DependencyEvidence {
  payload: DependencyEvidencePayload;
  bytes: string;
  sha256: string;
}

function validateInvocation(
  invocation: ReturnType<typeof readInvocation>,
  namespace: string,
): void {
  assertEqual(invocation.namespace, namespace, 'invocation namespace');
  assertEqual(
    invocation.commandSha256,
    hashBytes(JSON.stringify(invocation.command)),
    'invocation command hash',
  );
  // Proof: empty-command fault admitted an empty command with a consistent hash and external pin.
  if (invocation.command.length === 0) throwInvalidEvidence('empty command');
}
// Proof: independent-invocation fault admitted separately tested repeated observation, Job name/UID and Pod UID.
function distinctInvocations(
  left: ReturnType<typeof readInvocation>,
  right: ReturnType<typeof readInvocation>,
): void {
  if (
    left.observationId === right.observationId ||
    left.jobUid === right.jobUid ||
    left.podUid === right.podUid ||
    left.jobName === right.jobName
  )
    throwInvalidEvidence('independent invocations required');
}
function assertUnique(values: readonly string[]): void {
  // Proof: duplicate fault admitted duplicate roster/entry identities; obligation guards still rejected absent claims.
  if (new Set(values).size !== values.length) throwInvalidEvidence('duplicate identity');
}
function validatePayload(
  payload: DependencyEvidencePayload,
  expected: DependencyEvidenceBinding,
): void {
  assertEqual(payload.binding, readBinding(expected), 'pinned binding');
  const { binding, binaries, participants, activation, exposure, store } = payload;
  assertEqual(binaries.candidate.invocation, binding.candidateInvocation, 'candidate invocation');
  assertEqual(binaries.retained.invocation, binding.retainedInvocation, 'retained invocation');
  assertEqual(binaries.candidate.invocation.image, binding.candidateImage, 'candidate image');
  assertEqual(binaries.retained.invocation.image, binding.retainedImage, 'retained image');
  distinctInvocations(binaries.candidate.invocation, binaries.retained.invocation);
  for (const binary of [binaries.candidate, binaries.retained]) {
    validateInvocation(binary.invocation, binding.namespace);
    assertUnique(binary.semantics);
  }
  assertUnique(participants.roster.map((member) => member.id));
  assertUnique(participants.entries.map((entry) => entry.participantId));
  assertUnique(participants.unresolved);
  assertUnique(participants.policy.requiredRoles);
  const ids = new Set(participants.roster.map((member) => member.id));
  // Proof: unresolved-foreign fault admitted an obligation outside the supplied roster.
  if (participants.unresolved.some((id) => !ids.has(id)))
    throwInvalidEvidence('foreign unresolved obligation');
  for (const entry of participants.entries) {
    const member = participants.roster.find((member) => member.id === entry.participantId);
    // Proof: foreign-claim fault lost the named refusal before dereferencing the absent roster member.
    if (member === undefined) throwInvalidEvidence('foreign participant claim');
    assertEqual(entry.identity, member.identity, 'participant identity');
    assertEqual(entry.proof.sha256, hashBytes(entry.proof.bytes), 'proof bytes');
  }
  for (const member of participants.roster) {
    const claim = participants.entries.find((entry) => entry.participantId === member.id);
    // Proof: unresolved-missing fault admitted missing and explicitly unresolved claims with no obligation.
    if (
      (claim === undefined || claim.claim === 'unresolved') &&
      !participants.unresolved.includes(member.id)
    )
      throwInvalidEvidence('missing unresolved obligation');
    // Proof: role fault admitted an extra foreign-role member while required roles remained covered.
    if (!participants.policy.requiredRoles.includes(member.role))
      throwInvalidEvidence('foreign participant role');
  }
  // Proof: missing-role fault admitted an uncovered gateway policy role with otherwise valid obligations.
  for (const role of participants.policy.requiredRoles)
    if (!participants.roster.some((member) => member.role === role))
      throwInvalidEvidence('missing policy role');
  if (store.state === 'observed') {
    assertEqual(store.source, binding, 'store source');
    validateInvocation(store.invocation, binding.namespace);
    assertEqual(store.invocation.image, binding.candidateImage, 'store image');
    // Proof: interval fault admitted a store observation preceding its B2 interval start.
    if (store.interval.observedAt < store.interval.startedAt)
      throwInvalidEvidence('store interval order');
  }
  if (activation.state !== 'not-requested') {
    // Proof: six separate receipt-field substitution faults admitted their corresponding foreign receipt negatives.
    const receipt = activation.receipt;
    assertEqual(
      {
        ...receipt,
        protocol: 'wbs-dependency-activation',
        version: 1,
        activationId: binding.transactionId,
        databaseIdentity: binding.databasePath,
        candidateImage: binding.candidateImage,
        rollbackImage: binding.retainedImage,
        participantProofSha256: hashBytes(encodeCanonical(participants)),
        migrationCaptureSha256: binding.migrationCaptureSha256,
      },
      receipt,
      'activation receipt binding',
    );
    if (activation.state === 'confirmed') {
      assertEqual(activation.command.receipt, receipt, 'command receipt');
      assertEqual(activation.readback.receipt, receipt, 'readback receipt');
      for (const observation of [activation.command, activation.readback]) {
        validateInvocation(observation.invocation, binding.namespace);
        assertEqual(observation.invocation.image, binding.candidateImage, 'activation image');
      }
      distinctInvocations(activation.command.invocation, activation.readback.invocation);
    }
  }
  if (exposure.state !== 'not-started') {
    assertEqual(exposure.candidateImage, binding.candidateImage, 'exposure image');
    if (exposure.state === 'confirmed') {
      validateInvocation(exposure.invocation, binding.namespace);
      assertEqual(exposure.invocation.image, binding.candidateImage, 'exposure invocation image');
    }
  }
}
/** Validates closed structure and bindings before sealing; performs no IO or semantic admission. */
export function sealDependencyEvidence(
  value: unknown,
  expected: DependencyEvidenceBinding,
): DependencyEvidence {
  const payload = readPayload(value);
  validatePayload(payload, expected);
  const bytes = encodeCanonical(payload);
  return { payload, bytes, sha256: hashBytes(bytes) };
}
/** Malformed trusted persisted evidence throws. No missing progress can become a dormant state. */
export function decodeDependencyEvidence(
  value: unknown,
  expected: DependencyEvidenceBinding,
): DependencyEvidence {
  const envelope = decodeObject({ payload: readPayload, bytes: readText, sha256: readDigest })(
    value,
  );
  const sealed = sealDependencyEvidence(JSON.parse(envelope.bytes), expected);
  assertEqual(envelope.bytes, sealed.bytes, 'canonical bytes');
  assertEqual(envelope.sha256, sealed.sha256, 'payload hash');
  assertEqual(envelope.payload, sealed.payload, 'payload projection');
  return sealed;
}
/** Absence/uncertainty is explicit evidence loss; malformed available evidence still throws. */
export type DependencyEvidenceAvailability =
  { state: 'available'; evidence: unknown } | { state: 'lost' | 'uncertain'; reason: string };
/** Conservative routing only: neither outcome grants rollback, activation, restoration or exposure. */
export function classifyDependencyRecovery(
  availability: DependencyEvidenceAvailability,
  expected: DependencyEvidenceBinding,
): 'requires-attended-recovery' | 'requires-dormant-admission' {
  // Proof: lost-recovery fault routed lost/uncertain evidence to dormant admission.
  if (availability.state !== 'available') {
    readText(availability.reason);
    return 'requires-attended-recovery';
  }
  const { payload } = decodeDependencyEvidence(availability.evidence, expected);
  // Proof: activation-recovery and exposure-recovery faults independently routed started operations to dormant admission.
  return payload.activation.state !== 'not-requested' || payload.exposure.state !== 'not-started'
    ? 'requires-attended-recovery'
    : 'requires-dormant-admission';
}
