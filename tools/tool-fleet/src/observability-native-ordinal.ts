import { createHash } from 'node:crypto';

import { type } from 'arktype';

import type { Toolchain } from './contracts';
import { readCPUMilli, readMemoryMiB, sumCapacity } from './observability-capacity';
import {
  expandNativeOwner,
  expandNativeVolumes,
  normalizeNativeOwner,
  UnsupportedNativeWorkload,
} from './observability-cold-start';
import {
  prepareRehearsalInventory,
  readRehearsalSource,
} from './observability-rehearsal-inventory';
import { observabilityRenderCapabilities } from './observability-render';
import {
  assertInventoryWorkload,
  InventoryWorkloadSpec,
  NativeWorkloadSpec,
} from './observability-workload';
import { podSpecOf } from './platform-manifests';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
// Proof: Task25c3a count-domain widening lost the negative/fractional replica and negative Job count refusals.
const Count = type('number.integer>=0').atMost(2147483647);
const Claim = type({
  metadata: { name: 'string>0' },
  spec: {
    'storageClassName?': 'string',
    resources: { requests: { storage: 'string>0' } },
  },
});
// Proof: Task25c3a claim-storage-bound weakening lost the absent storage-class obligation.
const BoundClaim = Claim.and({ spec: { storageClassName: 'string>0' } });
class UnboundedSource extends Error {}
const Controller = type({
  spec: {
    'replicas?': Count,
    'podManagementPolicy?': 'string>0',
    'ordinals?': { start: Count },
    'updateStrategy?': {
      'type?': 'string>0',
      'rollingUpdate?': { 'partition?': Count, 'maxUnavailable?': 'number|string' },
    },
    'strategy?': 'unknown',
    'volumeClaimTemplates?': Claim.array(),
    template: { spec: 'unknown' },
  },
});
// Proof: Task25c3a grace-domain widening admitted negative grace before unsupported policy.
const Grace = type({ 'terminationGracePeriodSeconds?': 'number.integer>=0' });
function refuse(): never {
  throw new Error('Native ordinal source malformed');
}
function defaultFact<Value extends string | number>(declared: Value | undefined, fallback: Value) {
  return {
    declared: declared ?? 'absent',
    effective: declared ?? fallback,
    basis: declared === undefined ? ('kubernetes-v1.36.4-default' as const) : ('declared' as const),
  };
}
// Proof: Task25c3b deployment-schema widening lost paused/strategy/progress malformed-source refusals.
const Deployment = type({
  spec: {
    'replicas?': Count,
    'paused?': 'boolean',
    'minReadySeconds?': Count,
    'revisionHistoryLimit?': Count,
    'progressDeadlineSeconds?': Count,
    'strategy?': {
      'type?': "''|'Recreate'|'RollingUpdate'",
      'rollingUpdate?': { 'maxSurge?': 'number|string', 'maxUnavailable?': 'number|string' },
    },
    template: { spec: 'unknown' },
  },
});
/** Validate Deployment policy before any missing-bound or unsupported-scenario shortcut.
 * v1.36.4 apps defaulting/validation permit surge percentages above 100, but not unavailable percentages.
 * These fields describe rollout policy; none establishes a physical replacement or reclamation bound.
 */
function readDeployment(manifest: Record<string, unknown>) {
  const controller = Deployment(manifest);
  if (controller instanceof type.errors) refuse();
  const spec = controller.spec;
  // Proof: Task25c3b foreign-field omissions each lost the corresponding Deployment lifecycle contradiction refusal.
  if (
    ['updateStrategy', 'podManagementPolicy', 'ordinals', 'volumeClaimTemplates'].some((field) =>
      Object.hasOwn(spec, field),
    )
  )
    refuse();
  const strategy = spec.strategy;
  // Proof: Task25c3b array-shape removal admitted strategy and rolling arrays behind absent bounds.
  if (Array.isArray(strategy) || Array.isArray(strategy?.rollingUpdate)) refuse();
  // Proof: Task25c3b recreate-contradiction removal admitted rolling fields under Recreate.
  if (strategy?.type === 'Recreate' && strategy.rollingUpdate !== undefined) refuse();
  const rolling = strategy?.rollingUpdate;
  // Proof: Task25c3b surge-input/unavailable-input omissions and numeric-domain/percent-grammar weakening lost malformed quantity refusals.
  for (const quantity of [rolling?.maxSurge, rolling?.maxUnavailable])
    if (
      quantity !== undefined &&
      !(typeof quantity === 'number' ? Count.allows(quantity) : /^[0-9]+%$/.test(quantity))
    )
      refuse();
  const surge = rolling?.maxSurge ?? '25%';
  const unavailable = rolling?.maxUnavailable ?? '25%';
  const readAmount = (quantity: number | string) =>
    typeof quantity === 'number' ? quantity : Number(quantity.slice(0, -1));
  // Proof: Task25c3b unavailable-bound removal admitted 101%; rolling-zero removal admitted both zero.
  if (typeof unavailable === 'string' && readAmount(unavailable) > 100) refuse();
  if (readAmount(surge) === 0 && readAmount(unavailable) === 0) refuse();
  // Proof: Task25c3b deadline-relation removal lost zero deadline and default-deadline/readiness refusals.
  if ((spec.progressDeadlineSeconds ?? 600) <= (spec.minReadySeconds ?? 0)) refuse();
  return controller;
}
function readNativeInput(view: ReturnType<typeof readRehearsalSource>['native'][number]) {
  const { entry, manifest } = view;
  const spec = type('Record<string,unknown>')(manifest['spec']);
  if (spec instanceof type.errors || Array.isArray(spec)) refuse();
  const specifications = [spec];
  if (entry.kind === 'CronJob') {
    const cron = type({ jobTemplate: { spec: 'Record<string,unknown>' } })(spec);
    if (cron instanceof type.errors) refuse();
    specifications.push(cron.jobTemplate.spec);
  }
  for (const specification of specifications) {
    for (const field of [
      'replicas',
      'parallelism',
      'completions',
      'backoffLimit',
      'backoffLimitPerIndex',
      'activeDeadlineSeconds',
      'minReadySeconds',
      'revisionHistoryLimit',
      'successfulJobsHistoryLimit',
      'failedJobsHistoryLimit',
      'startingDeadlineSeconds',
      'ttlSecondsAfterFinished',
    ])
      if (specification[field] !== undefined && !Count.allows(specification[field])) refuse();
  }
  if (entry.category === 'claim') return null;
  // Proof: Task25c3b prepass-order removal let an earlier ordinal collision conceal malformed Deployment lifecycle state.
  if (entry.kind === 'Deployment') readDeployment(manifest);
  const pod = InventoryWorkloadSpec(podSpecOf({ kind: entry.kind, spec }));
  if (pod instanceof type.errors) refuse();
  const templates = type({ 'volumeClaimTemplates?': Claim.array() })(spec);
  if (templates instanceof type.errors) refuse();
  const volumes = expandNativeVolumes(
    pod.volumes ?? [],
    templates.volumeClaimTemplates ?? [],
    entry.kind,
  );
  // Proof: Task25c3a prepass-ordering bypass hid contradictory volumes behind absent bounds and unsupported management.
  assertInventoryWorkload(
    { ...pod, volumes },
    {
      memory: (quantity) => readMemoryMiB(quantity, refuse),
      cpu: (quantity) => readCPUMilli(quantity, refuse),
      refuse,
      refuseMalformed: refuse,
    },
  );
  const grace = Grace(pod);
  if (grace instanceof type.errors) refuse();
  if (entry.kind === 'StatefulSet') {
    const controller = Controller(manifest);
    if (controller instanceof type.errors) refuse();
    // Proof: Task25c3a strategy-contradiction/unavailable-domain removals admitted contradictory or fractional update fields.
    const strategy = controller.spec.updateStrategy;
    if (
      controller.spec.strategy !== undefined ||
      (strategy?.type === 'OnDelete' && strategy.rollingUpdate !== undefined)
    )
      refuse();
    const unavailable = strategy?.rollingUpdate?.maxUnavailable;
    if (
      unavailable !== undefined &&
      !(typeof unavailable === 'number'
        ? Count.allows(unavailable)
        : /^(?:100|[0-9]{1,2})%$/.test(unavailable))
    )
      refuse();
  }
  return pod;
}

function hasRuntimeIdentity(manifest: Record<string, unknown>) {
  const metadata = type({ metadata: 'Record<string,unknown>' })(manifest);
  if (metadata instanceof type.errors) refuse();
  return (
    ['ownerReferences', 'deletionTimestamp', 'uid', 'generation', 'resourceVersion'].some(
      (field) => metadata.metadata[field] !== undefined,
    ) || manifest['status'] !== undefined
  );
}
function deriveDeploymentLifecycle(
  controller: ReturnType<typeof readDeployment>,
  entry: ReturnType<typeof readRehearsalSource>['native'][number]['entry'],
  identity: string,
  replicas: number,
) {
  const spec = controller.spec;
  const declared = spec.strategy?.type;
  // Proof: Task25c3b default-strategy substitution changed the fixed source policy control.
  const strategy =
    declared === ''
      ? { ...defaultFact(undefined, 'RollingUpdate'), declared }
      : defaultFact(declared, 'RollingUpdate');
  const grace = Grace(spec.template.spec);
  if (grace instanceof type.errors) refuse();
  return {
    owner: identity,
    // Proof: Task25c3b template-binding substitution made changed same-owner templates share a hash.
    templateSHA256: hash(JSON.stringify(spec.template)),
    source: entry,
    replicas,
    strategy,
    // Proof: Task25c3b default-rolling substitution failed declared-absence/default provenance assertions.
    rolling:
      strategy.effective === 'Recreate'
        ? null
        : {
            maxSurge: defaultFact(spec.strategy?.rollingUpdate?.maxSurge, '25%'),
            maxUnavailable: defaultFact(spec.strategy?.rollingUpdate?.maxUnavailable, '25%'),
          },
    minReadySeconds: defaultFact(spec.minReadySeconds, 0),
    revisionHistoryLimit: defaultFact(spec.revisionHistoryLimit, 10),
    progressDeadlineSeconds: defaultFact(spec.progressDeadlineSeconds, 600),
    grace: {
      ...defaultFact(grace.terminationGracePeriodSeconds, 30),
      reclamationDeadline: false as const,
    },
    scenario: 'immutable-source-single-replicaset-first-replacement-wave' as const,
    initialPods: replicas,
    replacementPods: replicas,
    maximumPodSlots: 2 * replicas,
    // Proof: Task25c3b runtime-conditions/replacement-condition omissions and runtime-observation forgery failed unobserved event-contract assertions.
    conditions: {
      source: 'fresh-immutable-attempt',
      identity: 'one-deployment-UID-one-replicaset-UID-one-template-unchanged-scale',
      history: 'complete-successful-and-uncertain-creation-history',
      initial: 'no-prior-work-or-adoption-and-no-unaccounted-create-retries',
      replacements: 'at-most-one-per-initial-Pod-no-replacement-of-replacement',
      controller: 'reachable-cooperative-creation-observations-and-expectations-reconciled',
      excluded: [
        'rollout',
        'scale-change',
        'controller-recreation',
        'foreign-mutation',
        'forced-deletion',
        'lost-node-execution',
      ],
      retention: 'full-initial-and-replacement-demand-without-assumed-reclamation',
      admission: 'independently-bind-and-enforce-event-constraints-before-creation',
      runtimeObserved: false as const,
    },
    runtimeObserved: false as const,
  };
}
/** Expand two full same-template accounting cohorts; slots are not observed Pod names, UIDs or ordinals. */
function expandDeployment(
  input: Omit<Parameters<typeof expandNativeOwner>[0], 'templates' | 'claimPointer' | 'pods'>,
  replicas: number,
) {
  // Proof: Task25c3b cohort-count removal lost full first-replacement charges; initial-charge/replacement-charge zeroing failed the per-slot ledger.
  return expandNativeOwner({
    ...input,
    pods: 2 * replicas,
    templates: [],
    claimPointer: () => {
      throw new Error('Deployment claim template impossible');
    },
  }).map((charge, index) => {
    // Proof: Task25c3b slot-identity/cohort-identity substitutions triggered duplicate charge refusal in first-wave controls.
    const cohort = index < replicas ? ('initial' as const) : ('replacement' as const);
    const slot = index % replicas;
    return {
      ...charge,
      kind: 'pod' as const,
      identity: `${input.identity}/${cohort}/${String(slot)}`,
      concurrency: {
        phase: 'immutable-source-deployment-replacement-wave' as const,
        pods: 2 * replicas,
        cohort,
        slot,
      },
    };
  });
}
function deriveNativeCosts(source: ReturnType<typeof readRehearsalSource>, lock: Toolchain) {
  const entries: ReturnType<typeof expandNativeOwner> = [];
  const deploymentEntries: ReturnType<typeof expandDeployment> = [];
  const deploymentLifecycles: ReturnType<typeof deriveDeploymentLifecycle>[] = [];
  const blockers: { owner: string; missingFact: string }[] = [];
  const lifecycles: {
    owner: string;
    templateSHA256: string;
    management: ReturnType<typeof defaultFact<string>>;
    update: ReturnType<typeof defaultFact<string>>;
    grace: ReturnType<typeof defaultFact<number>> & { reclamationDeadline: false };
    scenario: string;
    runtimeObserved: false;
    source: ReturnType<typeof readRehearsalSource>['inventory']['entries'][number];
  }[] = [];
  const missing = (owner: string, missingFact: string) => blockers.push({ owner, missingFact });
  // Proof: Task25c3a provider-pin bypass granted charges to mismatched intended k3s/node versions.
  const providerMatches =
    lock.binaries.k3s.version === 'v1.36.4+k3s1' &&
    lock.runtimeImages.k3dNode.name === 'docker.io/rancher/k3s:v1.36.4-k3s1';
  if (!providerMatches) missing('provider', 'pinned-defaulting-contract');
  const claims = new Set(
    source.native
      .filter(({ entry }) => entry.category === 'claim')
      .map(({ entry }) => `PersistentVolumeClaim:${entry.namespace ?? '_'}:${entry.name}`),
  );
  function deriveDeployment(view: ReturnType<typeof readRehearsalSource>['native'][number]) {
    const { entry, manifest } = view;
    const identity = `${entry.kind}:${entry.namespace ?? '_'}:${entry.name}`;
    const controller = readDeployment(manifest);
    const spec = controller.spec;
    // Proof: Task25c3b source-runtime-identity bypass admitted live/deleting/foreign source identities.
    if (hasRuntimeIdentity(manifest)) {
      missing(identity, 'source-controller-identity-and-generation');
      return;
    }
    // Proof: Task25c3b namespace bypass lost the unresolved source namespace obligation.
    if (entry.namespace === null) {
      missing(identity, 'source-namespace');
      return;
    }
    // Proof: Task25c3b provider/paused bypasses admitted unsupported first-wave sources.
    if (!providerMatches || spec.paused === true) {
      missing(identity, 'deployment-replacement-wave-policy');
      return;
    }
    // Proof: Task25c3b replica-obligation removal hid absent/zero declared counts.
    if (spec.replicas === undefined || spec.replicas === 0) {
      missing(identity, 'replica-count');
      return;
    }
    const pod = NativeWorkloadSpec(spec.template.spec);
    // Proof: Task25c3b missing-bounds removal hid valid absent/null resource obligations.
    if (pod instanceof type.errors) {
      missing(identity, 'workload-bounds-or-resource-policy');
      return;
    }
    let model: ReturnType<typeof normalizeNativeOwner>;
    try {
      model = normalizeNativeOwner(pod, [], entry.kind, entry.owner, identity, (reason) => {
        throw new UnboundedSource(reason);
      });
    } catch (failure) {
      if (!(failure instanceof UnsupportedNativeWorkload) && !(failure instanceof UnboundedSource))
        throw failure;
      // Proof: Task25c3b normalization-obligation removal hid unbounded emptyDir/root and unsupported hostPath facts.
      missing(identity, failure.message);
      return;
    }
    deploymentEntries.push(
      ...expandDeployment(
        {
          identity,
          namespace: entry.namespace,
          name: entry.name,
          model,
          // Proof: Task25c3b source-frame/source-pointer substitutions failed exact charge provenance assertions.
          source: {
            owner: entry.owner,
            sha256: entry.source.frameSHA256,
            pointer: `${entry.pointer}/spec/template/spec`,
          },
        },
        spec.replicas,
      ),
    );
    // Proof: Task25c3b claim-reference omission and claim-namespace substitution lost exact external-claim obligations.
    for (const volume of model.volumes.filter((volume) => volume.kind === 'claim'))
      missing(
        identity,
        claims.has(`PersistentVolumeClaim:${entry.namespace}:${volume.reference}`)
          ? `claim-owner-and-retention:${entry.namespace}/${volume.reference}`
          : `claim-source:${entry.namespace}/${volume.reference}`,
      );
    // Proof: Task25c3b ephemeral-app/ephemeral-init omissions lost absent-limit writer obligations.
    for (const container of [...pod.containers, ...(pod.initContainers ?? [])])
      if (container.resources.limits['ephemeral-storage'] === undefined)
        missing(
          identity,
          `ephemeral-storage-limit-absent:${container.name}; writable-logs-and-runtime-state-unobserved`,
        );
    // Proof: Task25c3b runtime-binding removal made conditional cohorts lose their required per-owner admission blocker.
    missing(identity, 'deployment-replacement-wave-runtime-binding');
    deploymentLifecycles.push(
      deriveDeploymentLifecycle(controller, entry, identity, spec.replicas),
    );
  }
  const validated = source.native.map((view) => ({ ...view, pod: readNativeInput(view) }));
  for (const { entry, manifest } of validated) {
    const identity = `${entry.kind}:${entry.namespace ?? '_'}:${entry.name}`;
    if (entry.category === 'claim') {
      missing(identity, 'claim-owner-and-retention-unaccounted');
      continue;
    }
    if (entry.kind === 'Deployment') {
      deriveDeployment({ entry, manifest });
      continue;
    }
    if (entry.kind !== 'StatefulSet') {
      missing(identity, `${entry.kind}-lifecycle-unaccounted`);
      continue;
    }
    const controller = Controller(manifest);
    if (controller instanceof type.errors) refuse();
    const spec = controller.spec;
    // Proof: Task25c3a source-generation bypass admitted ownerReferences and deleting-source identities to the fixed scenario.
    if (hasRuntimeIdentity(manifest)) {
      missing(identity, 'source-controller-identity-and-generation');
      continue;
    }
    const pod = NativeWorkloadSpec(spec.template.spec);
    if (pod instanceof type.errors) {
      // Proof: Task25c3a missing-map-policy strict substitution rejected valid absent/null declarations instead of retaining their obligations.
      missing(identity, 'workload-bounds-or-resource-policy');
      continue;
    }
    const grace = Grace(spec.template.spec);
    if (grace instanceof type.errors) refuse();
    // Proof: Task25c3a default-substitution replaced OrderedReady with Parallel; default lifecycle charges/provenance assertions failed.
    const management = defaultFact(spec.podManagementPolicy, 'OrderedReady');
    const update = defaultFact(spec.updateStrategy?.type, 'RollingUpdate');
    // Proof: Task25c3a namespace-obligation bypass invented charges for an unresolved native namespace.
    if (entry.namespace === null) {
      missing(identity, 'source-namespace');
      continue;
    }
    if (
      // Proof: Task25c3a management/update/ordinal/partition/unavailable-policy bypasses each admitted an unsupported lifecycle.
      !providerMatches ||
      management.effective !== 'OrderedReady' ||
      update.effective !== 'RollingUpdate' ||
      spec.ordinals !== undefined ||
      (spec.updateStrategy?.rollingUpdate?.partition !== undefined &&
        spec.updateStrategy.rollingUpdate.partition !== 0) ||
      spec.updateStrategy?.rollingUpdate?.maxUnavailable !== undefined ||
      spec.strategy !== undefined
    ) {
      missing(identity, 'stateful-ordinal-lifecycle-policy');
      continue;
    }
    // Proof: Task25c3a count-obligation bypass lost explicit absent/zero replica obligations.
    if (spec.replicas === undefined || spec.replicas === 0) {
      missing(identity, 'replica-count');
      continue;
    }
    let model: ReturnType<typeof normalizeNativeOwner>;
    const templates = BoundClaim.array()(spec.volumeClaimTemplates ?? []);
    if (templates instanceof type.errors) {
      missing(identity, 'claim-storage-class-unresolved');
      continue;
    }
    try {
      model = normalizeNativeOwner(pod, templates, entry.kind, entry.owner, identity, (reason) => {
        throw new UnboundedSource(reason);
      });
    } catch (failure) {
      if (!(failure instanceof UnsupportedNativeWorkload) && !(failure instanceof UnboundedSource))
        throw failure;
      missing(identity, failure.message);
      continue;
    }
    const charges = expandNativeOwner({
      identity,
      namespace: entry.namespace,
      name: entry.name,
      pods: spec.replicas,
      templates,
      model,
      source: {
        owner: entry.owner,
        // Proof: Task25c3a source-hash/source-pointer substitutions failed exact charge frame and document provenance assertions.
        sha256: entry.source.frameSHA256,
        pointer: `${entry.pointer}/spec/template/spec`,
      },
      claimPointer: (_template, index) =>
        `${entry.pointer}/spec/volumeClaimTemplates/${String(index)}`,
    });
    // Proof: Task25c3a claim-collision bypass admitted both equal-size and conflicting explicit ordinal PVCs.
    for (const charge of charges)
      if (charge.kind === 'claim' && claims.has(charge.identity))
        throw new Error('Native ordinal claim-identity-collision');
    // Proof: Task25c3a pod-double/claim-double injection failed the full ordinal ledger control through shared duplicate-charge refusal.
    entries.push(...charges);
    for (const volume of model.volumes.filter((volume) => volume.kind === 'claim')) {
      if (templates.some((template) => template.metadata.name === volume.name)) continue;
      missing(
        identity,
        // Proof: Task25c3a claim-namespace substitution borrowed a prod claim for a dev owner; the missing-source assertion failed.
        claims.has(`PersistentVolumeClaim:${entry.namespace}:${volume.reference}`)
          ? `claim-owner-and-retention:${entry.namespace}/${volume.reference}`
          : `claim-source:${entry.namespace}/${volume.reference}`,
      );
    }
    // Proof: Task25c3a ephemeral-obligation removal hid absent limits behind read-only-root zero arithmetic.
    for (const container of [...pod.containers, ...(pod.initContainers ?? [])])
      if (container.resources.limits['ephemeral-storage'] === undefined)
        missing(
          identity,
          `ephemeral-storage-limit-absent:${container.name}; writable-logs-and-runtime-state-unobserved`,
        );
    lifecycles.push({
      owner: identity,
      // Proof: Task25c3a template-binding substitution made changed same-owner templates share one binding; the control failed.
      templateSHA256: hash(JSON.stringify(spec.template)),
      management,
      update,
      grace: {
        ...defaultFact(grace.terminationGracePeriodSeconds, 30),
        reclamationDeadline: false,
      },
      scenario: 'immutable-source-process-recovery-or-graceful-same-template-ordinal-replacement',
      runtimeObserved: false,
      source: entry,
    });
  }
  for (const entry of source.inventory.entries)
    if (entry.category === 'provider-input' || entry.category === 'unclassified')
      missing(
        `${entry.kind}:${entry.namespace ?? '_'}:${entry.name}`,
        'provider-or-unclassified-demand',
      );
  return {
    scope: 'immutable-source-native-ordinal-lifecycle' as const,
    // Proof: Task25c3a completeness/creation-authority/runtime-authority forgeries failed the conditional-ledger authority assertions.
    state: 'incomplete' as const,
    creationAuthority: false as const,
    runtimeAuthority: false as const,
    deploymentScope: 'immutable-source-deployment-replacement-wave' as const,
    deploymentLifecycles,
    entries: [
      ...entries.map((entry) => ({
        ...entry,
        concurrency: { ...entry.concurrency, phase: 'immutable-source-ordinal' as const },
      })),
      ...deploymentEntries,
    ],
    // Proof: Task25c3b combined-total omission lost both Deployment cohorts from shared sums.
    knownContributions: sumCapacity([...entries, ...deploymentEntries]),
    blockers,
    lifecycles,
    sourceInventorySHA256: hash(JSON.stringify(source.inventory)),
    sourceFrames: source.inventory.frames,
    sourceUnresolved: source.inventory.unresolved,
    provider: {
      kubernetesDefaultVersion: 'v1.36.4' as const,
      intendedK3sVersion: lock.binaries.k3s.version,
      intendedNodeImage: lock.runtimeImages.k3dNode,
      // Proof: Task25c3a render-observation/runtime-observation forgeries failed separate source-capability and intended-provider assertions.
      sourceRenderCapability: observabilityRenderCapabilities,
      runtimeObserved: false as const,
    },
    // Proof: Task25c3a excluded-lifecycle removal lost forced/lost/foreign/unbound/generation exclusions in the lifecycle control.
    unsupportedScenarios: [
      'forced-deletion',
      'lost-node-execution',
      'foreign-mutation',
      'unbound-old-new-templates',
      'unaccounted-controller-generations',
    ],
    runtimePrerequisites: [
      'actual-version-and-feature-equality',
      'cooperative-reachable-controller',
      'actual-UID-owner-template-node-equality',
      'actual-termination-and-enforcement',
      'writable-logs-and-runtime-state',
    ],
    excludedContributors: [
      'operator-generated Pods',
      'system/runtime',
      'host/retained services',
      'images/archive/transients',
      'hostPath growth',
    ],
  };
}

/** Decode every independently bound source frame before conditional lifecycle accounting.
 * Reuses {@link normalizeNativeOwner} and {@link expandNativeOwner}; no filtered receipt or scenario assertion grants admission.
 * One full normalized Pod remains charged through process recovery and ordinary graceful same-template ordinal replacement.
 * Claim bytes are source reservations, not Bound storage, usage or filesystem quotas. Grace is defaulting metadata, not reclamation time.
 * Pinned defaults and render capability remain separate from actual version, ownership, placement, termination and enforcement prerequisites.
 * Deployment cohorts reserve initial plus first replacement Pods conditionally; source policy cannot enforce the required event exclusions.
 * Its accounting slots carry no observed Pod/ReplicaSet identity, and runtime-wave binding remains an owner-specific obligation.
 * Supplied malformed fields throw before missing-bound/unsupported classifications. Other families and all runtime authority remain unresolved.
 */
export function readRehearsalNativeCosts(...input: Parameters<typeof readRehearsalSource>) {
  const source = readRehearsalSource(...input);
  return deriveNativeCosts(source, input[3]);
}

/** Share the canonical eleven-stage producer with inventory; this companion does not rerender or serialize raw native bodies. */
export async function deriveObservabilityRehearsalNativeCosts(
  ...input: Parameters<typeof prepareRehearsalInventory>
) {
  const source = await prepareRehearsalInventory(...input);
  return {
    ...deriveNativeCosts(source, source.lock),
    sourceInventorySHA256: source.inventory.inventorySHA256,
    provenance: source.inventory.provenance,
    obligations: source.inventory.obligations,
  };
}
