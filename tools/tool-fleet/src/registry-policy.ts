import { type } from 'arktype';

// Proof: normalizing invalid usedBytes to zero failed all missing/NaN/negative/infinite capacity negatives.
const Count = type('number.integer >= 0').narrow(Number.isSafeInteger);
// Proof: removing positivity failed the zero-budget admission negative.
const PositiveCount = Count.narrow((count) => count > 0);
const Identity = type('string > 0');
// Proof: accepting arbitrary strings failed the matching mutable-root/digest negative.
const Digest = type(/^sha256:[0-9a-f]{64}$/);
// Proof: accepting every timestamp failed the malformed/normalized-calendar receipt negative.
const Timestamp = type('string').narrow((stamp) => {
  const milliseconds = Date.parse(stamp);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === stamp;
});
const Capacity = type({
  maximumBytes: PositiveCount,
  usableBytes: PositiveCount,
  usedBytes: Count,
  totalInodes: PositiveCount,
  usedInodes: Count,
  rootFreeBytes: Count,
});
// Proof: making inode envelope optional failed the missing-inodes admission negative.
const Envelope = type({ bytes: Count, inodes: Count });
const Reservation = type({ operationId: Identity, bytes: Count, inodes: Count });
const Bundle = type({
  operationId: Identity,
  product: Identity,
  roots: Digest.array(),
  receipt: {
    state: "'promoted'|'completed'|'abandoned'|'unfinished'",
    at: Timestamp,
  },
});
const GraphNode = type({
  digest: Digest,
  bytes: Count,
  inodes: Count,
  dependencies: Digest.array(),
});
const Protection = type({
  owner: Identity,
  reason: Identity,
  roots: Digest.array().atLeastLength(1),
});
const History = type.or(
  { environment: Identity, state: "'first-install'", at: Timestamp },
  {
    environment: Identity,
    state: "'successful'",
    // Proof: accepting false failed the incomplete-successful-history retirement negative.
    complete: 'true',
    releases: Identity.array().atLeastLength(1),
  },
);
const Admission = type({
  capacity: Capacity,
  reservations: Reservation.array(),
  envelope: Envelope,
});
const Inventory = type({
  now: Timestamp,
  capacity: Capacity,
  mode: "'nightly'|'pressure'",
  // Proof: accepting false failed the incomplete-graph retirement negative.
  graph: { complete: 'true', nodes: GraphNode.array() },
  bundles: Bundle.array(),
  protections: Protection.array(),
  registeredEnvironments: Identity.array(),
  histories: History.array(),
  'retiredOperations?': Identity.array(),
  'partialOperations?': Identity.array(),
  'staging?': type({ operationId: Identity, bytes: Count, inodes: Count }).array(),
  'unreferencedContent?': type({
    digest: Digest,
    bytes: Count,
    inodes: Count,
    operations: Identity.array().atLeastLength(1),
  }).array(),
});

/** Allocated filesystem measurements, including staging; root reserve is on the host filesystem. */
export type RegistryCapacity = typeof Capacity.infer;
/** Conservative physical upload/staging/metadata upper bounds, without deduplication savings. */
export type PublicationEnvelope = typeof Envelope.infer;
/** Unreconciled reservations remain charged even after a publisher crashes or its lease expires. */
export type PublicationReservation = typeof Reservation.infer;
/** Complete publication closure roots; only promoted receipts participate in successful release history. */
export type ReleaseBundle = typeof Bundle.infer;
/** One content-addressed manifest, index, config or layer, counted once across repositories. */
export type RegistryGraphNode = typeof GraphNode.infer;
/** Durable owner obligations protect the entire transitive closure of their roots. */
export type ImageProtection = typeof Protection.infer;
/** Current-first successful environment history; complete attests that no intervening receipts are missing. */
export type EnvironmentHistory = typeof History.infer;
export type PublicationAdmissionInput = typeof Admission.infer;
/** The caller supplies a fresh, revision-bound census; this pure policy performs no IO or live verification. */
export type RetirementInput = typeof Inventory.infer;
export type RegistryPressure = 'normal' | 'warn' | 'retire' | 'fenced';
export type AdmissionReason = 'bytes' | 'inodes' | 'root-reserve' | 'publisher-busy';
export type PublicationAdmission =
  | { readonly status: 'admitted'; readonly pressure: RegistryPressure }
  | {
      readonly status: 'refused';
      readonly pressure: RegistryPressure;
      readonly reasons: readonly AdmissionReason[];
      readonly requiredBytes: number;
      readonly requiredInodes: number;
    };

/** Exact digest removals are advisory until the maintenance authority revalidates the inventory revision. */
export interface RetirementPlan {
  readonly retireOperations: readonly string[];
  readonly retireDigests: readonly string[];
  readonly retained: readonly {
    readonly operationId: string;
    readonly reasons: readonly string[];
  }[];
  readonly estimatedReclaimableBytes: number;
  readonly estimatedReclaimableInodes: number;
  readonly protectedBytes: number;
  readonly protectedOwners: readonly string[];
  readonly unmetBytes: number;
  readonly unmetInodes: number;
  readonly targetReached: boolean;
}

const rootReserve = 20 * 1024 ** 3;
const abandonmentDelay = 7 * 24 * 60 * 60 * 1000;

function budgetBytes(capacity: RegistryCapacity): number {
  // Proof: using configured capacity alone failed actual-usable-capacity admission.
  return Math.min(capacity.maximumBytes, capacity.usableBytes);
}

/** Round the percentage up exactly; validated safe-integer capacity bounds the converted answer. */
function threshold(capacity: number, percent: 70 | 80 | 90): number {
  // Proof: restoring floating multiplication failed all four safe-integer byte/inode/pressure regressions.
  return Number((BigInt(capacity) * BigInt(percent) + 99n) / 100n);
}

function assessPressure(capacity: RegistryCapacity): RegistryPressure {
  const bytes = budgetBytes(capacity);
  // Proof: raising byte/inode stop cutoffs to 91% failed actual-stop-pressure admission negatives.
  if (
    capacity.usedBytes >= threshold(bytes, 90) ||
    capacity.usedInodes >= threshold(capacity.totalInodes, 90) ||
    capacity.rootFreeBytes < rootReserve
  )
    return 'fenced';
  // Proof: raising cleanup pressure to 81% failed exact-80% pressure admission.
  if (
    capacity.usedBytes >= threshold(bytes, 80) ||
    capacity.usedInodes >= threshold(capacity.totalInodes, 80)
  )
    return 'retire';
  // Proof: raising warning pressure to 71% failed exact-70% pressure admission.
  if (
    capacity.usedBytes >= threshold(bytes, 70) ||
    capacity.usedInodes >= threshold(capacity.totalInodes, 70)
  )
    return 'warn';
  return 'normal';
}

/**
 * Validate one admission boundary and reserve neither space nor authority here. Known pressure
 * returns a typed refusal; missing/malformed measurements or envelopes throw. A journal caller
 * must serialize admission and preserve reservations until server-side uploads are reconciled.
 */
export function admitPublication(input: unknown): PublicationAdmission {
  const admission = Admission(input);
  // Proof: invalid-capacity normalization and optional inode-envelope mutations failed admission negatives.
  if (admission instanceof type.errors)
    throw new Error(`Malformed publication admission: ${admission.summary}`);
  const { capacity, reservations, envelope } = admission;
  // Proof: removing reservation byte/inode charges independently failed charges-existing-reservations.
  const bytes =
    capacity.usedBytes +
    envelope.bytes +
    reservations.reduce((sum, reservation) => sum + reservation.bytes, 0);
  const inodes =
    capacity.usedInodes +
    envelope.inodes +
    reservations.reduce((sum, reservation) => sum + reservation.inodes, 0);
  const requiredBytes = Math.max(0, bytes - threshold(budgetBytes(capacity), 90) + 1);
  const requiredInodes = Math.max(0, inodes - threshold(capacity.totalInodes, 90) + 1);
  const reasons: AdmissionReason[] = [];
  // Proof: bypassing the byte cutoff failed rejects-publication-crossing-ninety-percent.
  if (requiredBytes > 0) reasons.push('bytes');
  // Proof: bypassing the inode cutoff failed rejects-inode-envelopes-reaching-ninety-percent.
  if (requiredInodes > 0) reasons.push('inodes');
  // Proof: bypassing host reserve failed fences-writes-at-low-host-reserve.
  if (capacity.rootFreeBytes < rootReserve) reasons.push('root-reserve');
  // Proof: bypassing the occupied slot failed retains-crash-reservations.
  if (reservations.length > 0) reasons.push('publisher-busy');
  const pressure = assessPressure(capacity);
  return reasons.length === 0
    ? { status: 'admitted', pressure }
    : { status: 'refused', pressure, reasons, requiredBytes, requiredInodes };
}

function requireUnique(identities: readonly string[], boundary: string): void {
  // Proof: bypassing uniqueness failed duplicate graph/environment/history retirement negatives.
  if (new Set(identities).size !== identities.length) throw new Error(`Duplicate ${boundary}`);
}

function compareReceipts(left: ReleaseBundle, right: ReleaseBundle): number {
  const difference = Date.parse(left.receipt.at) - Date.parse(right.receipt.at);
  return difference === 0
    ? left.operationId < right.operationId
      ? -1
      : left.operationId === right.operationId
        ? 0
        : 1
    : difference;
}

function collectClosure(
  roots: readonly string[],
  nodes: ReadonlyMap<string, RegistryGraphNode>,
): Set<string> {
  const closure = new Set<string>();
  function visit(digest: string, ancestors: ReadonlySet<string>): void {
    // Proof: removing ancestor-cycle refusal failed rejects-cyclic-dependencies.
    if (ancestors.has(digest)) throw new Error(`Cyclic dependency ${digest}`);
    if (closure.has(digest)) return;
    const node = nodes.get(digest);
    // Proof: ignoring absent dependencies failed incomplete-graph/unknown-reference retirement negatives.
    if (node === undefined) throw new Error(`Unknown dependency ${digest}`);
    closure.add(digest);
    for (const dependency of node.dependencies) visit(dependency, new Set([...ancestors, digest]));
  }
  for (const root of roots) visit(root, new Set());
  return closure;
}

function requireInventory(inventory: RetirementInput): Map<string, RegistryGraphNode> {
  requireUnique(
    inventory.graph.nodes.map((node) => node.digest),
    'graph digest',
  );
  requireUnique(
    inventory.bundles.map((bundle) => bundle.operationId),
    'operation ID',
  );
  requireUnique(inventory.registeredEnvironments, 'registered environment');
  requireUnique(
    inventory.histories.map((history) => history.environment),
    'environment history',
  );
  // Proof: bypassed partial ownership failed refuses-partial-operations-without-an-abandoned-owning-bundle.
  const partial = new Set(inventory.partialOperations ?? []);
  requireUnique(inventory.partialOperations ?? [], 'partial operation');
  if (
    [...partial].some(
      (operationId) =>
        !inventory.bundles.some(
          (bundle) => bundle.operationId === operationId && bundle.receipt.state === 'abandoned',
        ),
    )
  )
    throw new Error('Partial content lacks reconciled abandonment');
  // Proof: bypassed retired identities/empty roots failed refuses-unknown-unfinished-or-empty-root-retired-declarations.
  const retired = new Set(inventory.retiredOperations ?? []);
  requireUnique(inventory.retiredOperations ?? [], 'retired operation');
  if (
    [...retired].some(
      (operationId) =>
        !inventory.bundles.some(
          (bundle) => bundle.operationId === operationId && bundle.receipt.state !== 'unfinished',
        ),
    ) ||
    inventory.bundles.some(
      (bundle) =>
        bundle.roots.length === 0 &&
        !retired.has(bundle.operationId) &&
        !partial.has(bundle.operationId),
    )
  )
    throw new Error('Unknown retired operation or empty required roots');
  const nodes = new Map(inventory.graph.nodes.map((node) => [node.digest, node]));
  const owned = collectClosure(
    [
      ...inventory.bundles.flatMap((bundle) => bundle.roots),
      ...inventory.protections.flatMap((protection) => protection.roots),
    ],
    nodes,
  );
  for (const node of nodes.values()) {
    // Proof: removing owner refusal failed throws-for-unknown-owner.
    if (!owned.has(node.digest)) throw new Error(`Unknown owner of ${node.digest}`);
  }
  // Proof: duplicate, foreign and graph-overlapping content faults failed refuses-duplicate-physical-content-owners-and-unknown-or-graph-overlapping-content.
  const unreferenced = inventory.unreferencedContent ?? [];
  requireUnique(
    unreferenced.map((content) => content.digest),
    'unreferenced content',
  );
  for (const content of unreferenced) {
    requireUnique(content.operations, 'content owner');
    if (
      nodes.has(content.digest) ||
      content.operations.some(
        (operationId) => !inventory.bundles.some((bundle) => bundle.operationId === operationId),
      )
    )
      throw new Error('Invalid unreferenced physical content ownership');
  }
  // Proof: removing the owner refusal failed refuses-staged-content-without-an-owning-bundle.
  if (
    (inventory.staging ?? []).some(
      (upload) => !inventory.bundles.some((bundle) => bundle.operationId === upload.operationId),
    )
  )
    throw new Error('Unowned staged content');
  const currentTime = Date.parse(inventory.now);
  for (const bundle of inventory.bundles) {
    // Proof: accepting future publication receipts failed the future-publication retirement negative.
    if (Date.parse(bundle.receipt.at) > currentTime) throw new Error('Future publication receipt');
  }
  for (const environment of inventory.registeredEnvironments) {
    // Proof: skipping absent history failed absent-or-incomplete-history retirement.
    if (!inventory.histories.some((history) => history.environment === environment))
      throw new Error(`Missing history for ${environment}`);
  }
  const bundles = new Map(inventory.bundles.map((bundle) => [bundle.operationId, bundle]));
  for (const history of inventory.histories) {
    // Proof: ignoring unregistered histories failed future-publication/unregistered-history negatives.
    if (!inventory.registeredEnvironments.includes(history.environment))
      throw new Error('Unregistered environment history');
    if (history.state === 'first-install') {
      // Proof: removing first-install time refusal failed the future-first-install receipt negative.
      if (Date.parse(history.at) > currentTime) throw new Error('Future first-install receipt');
      continue;
    }
    requireUnique(history.releases, 'environment release');
    for (const operationId of history.releases) {
      // Proof: skipping successful-release lookup failed the unknown-historical-release negative.
      if (bundles.get(operationId)?.receipt.state !== 'promoted')
        throw new Error(`Unknown successful release ${operationId}`);
    }
  }
  return nodes;
}

function retainBundles(
  inventory: RetirementInput,
  nodes: ReadonlyMap<string, RegistryGraphNode>,
): Map<string, string[]> {
  const reasons = new Map<string, string[]>();
  const protections = inventory.protections.map((protection) => ({
    ...protection,
    closure: collectClosure(protection.roots, nodes),
  }));
  const protectedImages = new Set(protections.flatMap((protection) => [...protection.closure]));
  const retain = (operationId: string, reason: string) => {
    const previous = reasons.get(operationId);
    if (previous === undefined) reasons.set(operationId, [reason]);
    else previous.push(reason);
  };
  const products = new Set(inventory.bundles.map((bundle) => bundle.product));
  for (const product of products) {
    const successful = inventory.bundles
      .filter((bundle) => bundle.product === product && bundle.receipt.state === 'promoted')
      // Proof: removing receipt sort failed keeps-ten-complete-bundles with reversed input history.
      .sort(compareReceipts)
      .reverse();
    // Proof: retaining nine instead of ten failed keeps-ten-complete-bundles.
    for (const bundle of successful.slice(0, 10)) retain(bundle.operationId, 'newest-ten');
  }
  for (const history of inventory.histories) {
    if (history.state === 'successful') {
      // Proof: retaining only current plus one prior failed preserves-older-environment-rollback.
      // Proof: current-consumer shared-tier history keeps prior releases1/2 outside newest5–14; reducing this cutoff to one failed preserves-older-environment-rollback.
      for (const operationId of history.releases.slice(0, 3))
        retain(operationId, `environment:${history.environment}`);
    }
  }
  for (const bundle of inventory.bundles) {
    // Proof: bypassed retained-history refusal failed refuses-retired-releases-still-required-by-successful-history.
    if (inventory.retiredOperations?.includes(bundle.operationId)) {
      if (reasons.has(bundle.operationId))
        throw new Error('Retired bundle remains required by release history');
      continue;
    }
    // Proof: skipping unfinished retention failed retains-unfinished-work-regardless-of-age.
    if (bundle.receipt.state === 'unfinished') retain(bundle.operationId, 'unfinished');
    // Proof: reducing grace to six days failed waits-seven-days-after-abandonment.
    else if (
      bundle.receipt.state !== 'promoted' &&
      Date.parse(inventory.now) - Date.parse(bundle.receipt.at) < abandonmentDelay
    )
      retain(bundle.operationId, 'seven-day-grace');
    // Proof: old any-shared-digest retention failed the fourteen-release/current-consumer regression; exact deployment/recovery/consumer roots still survive.
    if (bundle.roots.length > 0 && bundle.roots.every((root) => protectedImages.has(root)))
      for (const protection of protections)
        if (bundle.roots.some((root) => protection.closure.has(root)))
          retain(bundle.operationId, `protection:${protection.owner}:${protection.reason}`);
  }
  return reasons;
}

/**
 * Plan oldest-first retirement from a caller-proven complete, fresh census. Invalid identities,
 * unknown ownership/dependencies, missing consumer history and malformed/future receipts throw.
 * Successful bundles retain ten per product plus current/two prior environment releases;
 * unfinished work and explicit protections never expire. Nightly plans retire all eligible content;
 * pressure plans activate at 80% and target strictly below 70% without weakening retention.
 * Physical byte/inode estimates count unique digests and exclude every retained dependency.
 */
export function planRetirement(input: unknown): RetirementPlan {
  const inventory = Inventory(input);
  // Proof: incomplete graph/history and malformed receipt schema mutations failed retirement negatives.
  if (inventory instanceof type.errors)
    throw new Error(`Malformed retirement inventory: ${inventory.summary}`);
  const nodes = requireInventory(inventory);
  const reasons = retainBundles(inventory, nodes);
  const protectedRoots = [
    ...inventory.protections.flatMap((protection) => protection.roots),
    ...inventory.bundles
      .filter((bundle) => reasons.has(bundle.operationId))
      .flatMap((bundle) => bundle.roots),
  ];
  const protectedDigests = collectClosure(protectedRoots, nodes);
  const pressure = assessPressure(inventory.capacity);
  const isActive = inventory.mode === 'nightly' || pressure === 'retire' || pressure === 'fenced';
  // Proof: selecting protected operations failed all-protected-exhaustion; ignoring retired identities failed does-not-retire-an-already-retired-abandoned-operation-again.
  const eligible = inventory.bundles
    .filter(
      (bundle) =>
        !reasons.has(bundle.operationId) &&
        !inventory.retiredOperations?.includes(bundle.operationId),
    )
    .sort(compareReceipts);
  const retired = isActive ? eligible : [];
  const candidateDigests = collectClosure(
    retired.flatMap((bundle) => bundle.roots),
    nodes,
  );
  const released = new Set([
    ...retired.map((bundle) => bundle.operationId),
    ...(inventory.retiredOperations ?? []),
  ]);
  // Proof: replacing every owner with some failed retains-shared-unreferenced-content-until-every-owning-operation-releases-it.
  const orphanRetirements = (inventory.unreferencedContent ?? []).filter((content) =>
    content.operations.every((operationId) => released.has(operationId)),
  );
  const retireDigests = [...candidateDigests, ...orphanRetirements.map((content) => content.digest)]
    // Proof: ignoring retained reverse references failed shared-blob retirement accounting.
    .filter((digest) => !protectedDigests.has(digest))
    .sort();
  let estimatedReclaimableBytes = 0;
  let estimatedReclaimableInodes = 0;
  let protectedBytes = 0;
  for (const node of nodes.values()) {
    if (protectedDigests.has(node.digest)) protectedBytes += node.bytes;
    if (retireDigests.includes(node.digest)) {
      estimatedReclaimableBytes += node.bytes;
      estimatedReclaimableInodes += node.inodes;
    }
  }
  for (const content of inventory.unreferencedContent ?? []) {
    if (retireDigests.includes(content.digest)) {
      estimatedReclaimableBytes += content.bytes;
      estimatedReclaimableInodes += content.inodes;
    } else protectedBytes += content.bytes;
  }
  for (const upload of inventory.staging ?? []) {
    if (released.has(upload.operationId)) {
      estimatedReclaimableBytes += upload.bytes;
      estimatedReclaimableInodes += upload.inodes;
    } else protectedBytes += upload.bytes;
  }
  // Proof: changing byte target to 80% failed all-protected exhaustion's unmet-capacity assertion.
  const unmetBytes = Math.max(
    0,
    inventory.capacity.usedBytes -
      estimatedReclaimableBytes -
      threshold(budgetBytes(inventory.capacity), 70) +
      1,
  );
  // Proof: changing inode target to 80% failed targets-below-seventy-percent.
  const unmetInodes = Math.max(
    0,
    inventory.capacity.usedInodes -
      estimatedReclaimableInodes -
      threshold(inventory.capacity.totalInodes, 70) +
      1,
  );
  return {
    retireOperations: retired.map((bundle) => bundle.operationId),
    retireDigests,
    retained: [...reasons].map(([operationId, retainedReasons]) => ({
      operationId,
      reasons: retainedReasons,
    })),
    estimatedReclaimableBytes,
    estimatedReclaimableInodes,
    protectedBytes,
    protectedOwners: [
      ...new Set([
        ...inventory.protections.map((protection) => protection.owner),
        ...inventory.bundles
          .filter(
            (bundle) =>
              reasons
                .get(bundle.operationId)
                ?.some((reason) => !reason.startsWith('protection:')) === true,
          )
          .map((bundle) => bundle.operationId),
      ]),
    ].sort(),
    unmetBytes,
    unmetInodes,
    targetReached:
      unmetBytes === 0 && unmetInodes === 0 && inventory.capacity.rootFreeBytes >= rootReserve,
  };
}
