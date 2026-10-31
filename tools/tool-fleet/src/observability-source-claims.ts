import { type } from 'arktype';

import { readMemoryMiB, sumCapacity } from './observability-capacity';
import { readClaimStorage, type readRehearsalSource } from './observability-rehearsal-inventory';

// Proof: Task64 map-arrays admitted selector/status/labels arrays in the malformed-late reader negatives.
const Mapping = type('Record<string,unknown>').narrow((record) => !Array.isArray(record));
// Proof: Task64 access-enum/access-nonempty widening admitted malformed modes/statusModes and emptyModes.
const Modes = type("'ReadWriteOnce'|'ReadOnlyMany'|'ReadWriteMany'|'ReadWriteOncePod'")
  .array()
  .atLeastLength(1);
// Proof: Task64 selector-values/operator widening admitted their malformed-late production-reader negatives.
const Selector = Mapping.and({
  'matchLabels?': type('Record<string,string>').and(Mapping),
  'matchExpressions?': type({
    key: 'string>0',
    operator: "'In'|'NotIn'|'Exists'|'DoesNotExist'",
    'values?': 'string[]',
  }).array(),
});
// Proof: Task64 source-name/group/kind/namespace widening admitted the corresponding otherwise valid source-reference negatives.
const Reference = type({ 'apiGroup?': 'string|null', kind: 'string>0', name: 'string>0' });
// Proof: Task64 class/attributes/volume-name/mode schema widening admitted the corresponding malformed-late negatives.
const Spec = type({
  accessModes: Modes,
  'storageClassName?': 'string|null',
  'volumeMode?': "'Filesystem'|'Block'",
  resources: type({
    requests: type({ storage: 'string>0' }),
    'limits?': Mapping.and({ 'storage?': 'string>0' }),
  }),
  'selector?': Selector,
  'volumeName?': 'string',
  'dataSource?': Reference,
  'dataSourceRef?': Reference.and({ 'namespace?': 'string>0' }),
  'volumeAttributesClassName?': 'string|null',
});
// Proof: Task64 uid/version/generation/created/deleted/grace/finalizers/owner/status schema faults each admitted its malformed-late reader negative.
const Claim = type({
  metadata: {
    'uid?': 'string>0',
    'resourceVersion?': 'string>0',
    'generation?': 'number.integer>=0',
    'creationTimestamp?': 'string|null',
    'deletionTimestamp?': 'string|null',
    'deletionGracePeriodSeconds?': 'number.integer>=0',
    'finalizers?': 'string[]',
    'labels?': type('Record<string,string>').and(Mapping).or('null'),
    'ownerReferences?': type({
      apiVersion: 'string>0',
      kind: 'string>0',
      name: 'string>0',
      uid: 'string>0',
      'controller?': 'boolean',
      'blockOwnerDeletion?': 'boolean',
    }).array(),
  },
  spec: Spec,
  'status?': Mapping.and({
    'phase?': "'Pending'|'Bound'|'Lost'",
    'accessModes?': Modes,
    'capacity?': Mapping.and({ 'storage?': 'string>0' }),
  }),
});
const conditions = [
  'fresh-immutable-attempt-same-declaration-claim-reuse',
  'no-prior-adopted-deleted-recreated-resized-unrelated-or-hidden-claims',
  'claim-history-and-retention',
  'claim-physical-identity-and-enforcement',
] as const;
const supportedFields = new Set([
  'accessModes',
  'storageClassName',
  'volumeMode',
  'resources',
  'selector',
  'volumeName',
  'dataSource',
  'dataSourceRef',
]);
const runtimeFields = [
  'uid',
  'resourceVersion',
  'generation',
  'creationTimestamp',
  'deletionTimestamp',
  'deletionGracePeriodSeconds',
  'ownerReferences',
  'finalizers',
];

/** Reserve declarations independently of Pod normalization and consumer cardinality.
 * The supplied views belong to the existing validated traversal; all recognized claim state is decoded before classification.
 * Reservations describe a fresh immutable attempt and conditional logical reuse, never actual binding, ownership, mounts,
 * quota, backing-device separation or physical deduplication. Unknown spec surfaces stay named and uncharged.
 * Returned declaration and reference origins are independent snapshots, including declared absence of Filesystem defaults.
 */
export function deriveStandaloneClaims(source: ReturnType<typeof readRehearsalSource>) {
  const validated = source.resources
    .filter(({ entry }) => entry.category === 'claim')
    .map((view) => {
      const claim = Claim.assert(view.manifest);
      const requestedStorage = readClaimStorage(claim.spec);
      const requestedMiB = readMemoryMiB(requestedStorage, () => {
        throw new Error('Standalone claim storage differs');
      });
      // Proof: Task64 secondary-quantity dependency omission admitted invalid late limits and status capacity.
      for (const storage of [claim.spec.resources.limits?.storage, claim.status?.capacity?.storage])
        if (storage !== undefined) readClaimStorage({ resources: { requests: { storage } } });
      return { view, claim, requestedStorage, requestedMiB };
    });
  const blockers: { owner: string; missingFact: string }[] = [];
  const standaloneClaims = validated.map(
    ({ view: { entry, manifest }, claim, requestedStorage, requestedMiB }) => {
      const identity = `PersistentVolumeClaim:${entry.namespace ?? '_'}:${entry.name}`;
      const missingFacts: string[] = [];
      // Proof: Task64 namespace-support removal reserved an unresolved declaration; exact joins/orphan negative failed.
      if (entry.namespace === null) missingFacts.push('source-namespace');
      // Proof: Task64 class-support removal charged absent/null/empty classes in their unsupported reader cases.
      if (
        claim.spec.storageClassName === undefined ||
        claim.spec.storageClassName === null ||
        claim.spec.storageClassName === ''
      )
        missingFacts.push('storage-class');
      // Proof: Task64 access-support removal charged ReadWriteMany; its unsupported reader case failed.
      if (claim.spec.accessModes.length !== 1 || claim.spec.accessModes[0] !== 'ReadWriteOnce')
        missingFacts.push('access-mode');
      // Proof: Task64 mode-support removal charged Block; its unsupported reader case failed.
      if (claim.spec.volumeMode !== undefined && claim.spec.volumeMode !== 'Filesystem')
        missingFacts.push('volume-mode');
      // Proof: Task64 binding-support removal charged selector/prebound/clone/reference declarations; their reader cases failed.
      for (const [field, fact] of [
        ['selector', 'selector'],
        ['volumeName', 'volume-name'],
        ['dataSource', 'data-source'],
        ['dataSourceRef', 'data-source-ref'],
      ] as const)
        if (Object.hasOwn(claim.spec, field)) missingFacts.push(fact);
      // Proof: Task64 unknown-spec removal charged the future-binding declaration; its unsupported reader case failed.
      for (const field of Object.keys(claim.spec))
        if (!supportedFields.has(field)) missingFacts.push(`unsupported-spec:${field}`);
      // Proof: Task64 runtime-support removal charged UID/Bound source state; both unsupported reader cases failed.
      if (
        Object.hasOwn(manifest, 'status') ||
        runtimeFields.some((field) => Object.hasOwn(claim.metadata, field))
      )
        missingFacts.push('runtime-identity-or-status');
      // Proof: Task64 conditions omission lost the explicit fresh-attempt/history obligations in the reservations reader case.
      blockers.push(
        ...[...missingFacts, ...conditions].map((missingFact) => ({
          owner: identity,
          missingFact,
        })),
      );
      return {
        identity,
        namespace: entry.namespace,
        name: entry.name,
        requestedStorage,
        requestedMiB,
        supported: missingFacts.length === 0,
        missingFacts,
        storageClass: {
          value: claim.spec.storageClassName ?? null,
          origin: Object.hasOwn(claim.spec, 'storageClassName')
            ? ('explicit' as const)
            : ('absent' as const),
        },
        volumeMode: {
          value: claim.spec.volumeMode ?? 'Filesystem',
          origin:
            claim.spec.volumeMode === undefined
              ? ('absent-source-default' as const)
              : ('explicit' as const),
        },
        // Proof: Task64 declaration-snapshot omission let borrowed prepared origin mutation alter the canonical return.
        declaration: structuredClone({ entry, manifest }),
        conditions: [...conditions],
        runtimeObserved: false as const,
      };
    },
  );
  const declarations = new Map(standaloneClaims.map((claim) => [claim.identity, claim]));
  const claimConsumers = source.inventory.entries
    // Proof: Task64 consumer-families substitution lost Pod references independently of normalization; the family reader case failed.
    .filter((entry) => entry.category === 'native-template')
    .flatMap((entry) =>
      entry.claims
        // Proof: Task64 reference-kind removal admitted a native claim template as a consumer; its reader case failed.
        .filter((reference) => reference.kind === 'reference')
        .map((reference) => {
          const owner = `${entry.kind}:${entry.namespace ?? '_'}:${entry.name}`;
          const identity =
            entry.namespace === null
              ? null
              : `PersistentVolumeClaim:${entry.namespace}:${reference.name}`;
          // Proof: Task64 consumer-join name-only substitution joined a foreign namespace; the exact joins reader case failed.
          const declaration = identity === null ? undefined : declarations.get(identity);
          const missingFacts =
            entry.namespace === null
              ? [`claim-consumer-source-namespace:${reference.name}`]
              : declaration === undefined
                ? [`claim-declaration-missing:${entry.namespace}/${reference.name}`]
                : [];
          // Proof: Task64 consumer-obligations omission lost missing/unresolved consumer blockers in the exact joins reader case.
          blockers.push(...missingFacts.map((missingFact) => ({ owner, missingFact })));
          // Proof: Task64 consumer-snapshot omission let borrowed prepared reference mutation alter the canonical return.
          return structuredClone({
            owner,
            namespace: entry.namespace,
            reference,
            source: entry.source,
            pointer: entry.pointer,
            declarationIdentity: declaration?.identity ?? null,
            missingFacts,
            runtimeObserved: false as const,
          });
        }),
    );
  // Proof: Task64 omit-charges/double-charges dependencies lost or doubled the existing combined 71680Mi reservation.
  const standaloneEntries = standaloneClaims
    .filter((claim) => claim.supported)
    .map((claim) => ({
      identity: claim.identity,
      owner: claim.identity,
      kind: 'claim' as const,
      memoryMiB: 0,
      cpuMilli: 0,
      diskMiB: claim.requestedMiB,
      source: structuredClone({
        ...claim.declaration.entry.source,
        pointer: `${claim.declaration.entry.pointer}/spec`,
      }),
      coordinate: 'logical-standalone-claim' as const,
    }));
  return {
    standaloneClaims,
    claimConsumers,
    standaloneEntries,
    standaloneKnownContributions: sumCapacity(standaloneEntries),
    blockers,
  };
}
