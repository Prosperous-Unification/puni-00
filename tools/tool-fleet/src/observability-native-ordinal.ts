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
import { readCronCalendar } from './observability-cron-syntax';
import { expandNativeCohorts } from './observability-native-cohorts';
import {
  deriveCronJobLifecycle,
  expandCronJob,
  readCronJob,
  readCronJobEnvelope,
  readCronJobHorizons,
  readUtcCadence,
  type RehearsalCronJobHorizons,
} from './observability-native-cronjob';
import {
  deriveDaemonLifecycle,
  expandDaemon,
  type NativeSourceContract,
  readDaemonObligations,
  readDaemonSet,
  readDaemonTopology,
  type RehearsalTopologyEvidence,
  selectDaemonWorkload,
  supportsDaemonPolicy,
} from './observability-native-daemon';
import {
  defaultFact,
  deriveJobLifecycle,
  expandJob,
  readJob,
  supportsJobPolicy,
} from './observability-native-job';
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
      if (
        specification[field] !== undefined &&
        !(entry.kind === 'Job' && field === 'activeDeadlineSeconds') &&
        // Proof: Task56 root/nested int64-exemption removals rejected valid safe deadlines above int32 in the exact-charge control.
        !(
          entry.kind === 'CronJob' &&
          ((specification === spec && field === 'startingDeadlineSeconds') ||
            (specification !== spec && field === 'activeDeadlineSeconds'))
        ) &&
        !Count.allows(specification[field])
      )
        refuse();
  }
  if (entry.category === 'claim') return null;
  // Proof: Task25c3b prepass-order removal let an earlier ordinal collision conceal malformed Deployment lifecycle state.
  if (entry.kind === 'Deployment') readDeployment(manifest);
  // Proof: Task25c3e prepass removal let an earlier ordinal claim collision mask a malformed later Job.
  if (entry.kind === 'Job') readJob(manifest);
  // Proof: Task25c3g prepass removal let an earlier ordinal claim collision conceal malformed daemon placement.
  const daemon = entry.kind === 'DaemonSet' ? readDaemonSet(manifest) : undefined;
  const pod = InventoryWorkloadSpec(
    daemon === undefined ? podSpecOf({ kind: entry.kind, spec }) : selectDaemonWorkload(daemon),
  );
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
  return expandNativeCohorts(input, replicas).map((charge) => ({
    ...charge,
    concurrency: {
      phase: 'immutable-source-deployment-replacement-wave' as const,
      ...charge.concurrency,
    },
  }));
}

function deriveNativeCosts(
  source: Pick<ReturnType<typeof readRehearsalSource>, 'inventory' | 'native'>,
  lock: Toolchain,
  topology?: ReturnType<typeof readDaemonTopology>,
  horizons?: ReturnType<typeof readCronJobHorizons>,
) {
  const entries: ReturnType<typeof expandNativeOwner> = [];
  const deploymentEntries: ReturnType<typeof expandDeployment> = [];
  const deploymentLifecycles: ReturnType<typeof deriveDeploymentLifecycle>[] = [];
  const daemonEntries: ReturnType<typeof expandDaemon> = [];
  const daemonLifecycles: ReturnType<typeof deriveDaemonLifecycle>[] = [];
  const jobEntries: ReturnType<typeof expandJob> = [];
  const jobLifecycles: ReturnType<typeof deriveJobLifecycle>[] = [];
  const cronJobEntries: ReturnType<typeof expandCronJob> = [];
  const cronJobLifecycles: ReturnType<typeof deriveCronJobLifecycle>[] = [];
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
  function deriveJob(view: ReturnType<typeof readRehearsalSource>['native'][number]) {
    const { entry, manifest } = view;
    const identity = `${entry.kind}:${entry.namespace ?? '_'}:${entry.name}`;
    const controller = readJob(manifest);
    const spec = controller.spec;
    // Proof: Task25c3e whole-attempt blocker omission failed both lifecycle and unbounded bucket controls.
    missing(
      identity,
      'whole-attempt-helm-install-upgrade-retry-remediation-hook-Job-UID-Flux-recreation-and-retained-Pod-device-log-history',
    );
    // Proof: Task25c3e identity bypass admitted UID/owner/deletion/generation/resourceVersion sources.
    if (hasRuntimeIdentity(manifest)) {
      missing(identity, 'source-controller-identity-and-generation');
      return;
    }
    // Proof: Task25c3e namespace bypass failed namespace and provider control.
    if (entry.namespace === null) {
      missing(identity, 'source-namespace');
      return;
    }
    // Proof: Task25c3e serial-policy/provider bypass failed ten unsupported/provider controls.
    if (!providerMatches || !supportsJobPolicy(controller)) {
      missing(identity, 'job-serial-policy');
      return;
    }
    // Proof: Task25c3e range removal admitted B256; hostile MaxInt32 was never run with the guard removed.
    if ((spec.backoffLimit ?? 6) > 255) {
      missing(identity, 'job-attempt-expansion-range');
      return;
    }
    const pod = NativeWorkloadSpec(spec.template.spec);
    if (pod instanceof type.errors) {
      // Proof: Task25c3e missing-bound blocker omission failed all four broad resource-absence controls.
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
      // Proof: Task25c3e normalization blocker omission failed unbounded bucket scratch.
      missing(identity, failure.message);
      return;
    }
    // Proof: Task25c3e claim lookup removal failed external claim owners remain namespace scoped.
    for (const volume of model.volumes.filter((volume) => volume.kind === 'claim'))
      missing(
        identity,
        claims.has(`PersistentVolumeClaim:${entry.namespace}:${volume.reference}`)
          ? `claim-owner-and-retention:${entry.namespace}/${volume.reference}`
          : `claim-source:${entry.namespace}/${volume.reference}`,
      );
    // Proof: Task25c3e ephemeral-obligation omission failed independent app and init writer controls.
    for (const container of [...pod.containers, ...(pod.initContainers ?? [])])
      if (container.resources.limits['ephemeral-storage'] === undefined)
        missing(
          identity,
          `ephemeral-storage-limit-absent:${container.name}; writable-logs-and-runtime-state-unobserved`,
        );
    jobEntries.push(
      ...expandJob(
        {
          identity,
          namespace: entry.namespace,
          name: entry.name,
          model,
          // Proof: Task25c3e frame and pointer substitutions independently failed backoff4 charge provenance.
          source: {
            owner: entry.owner,
            sha256: entry.source.frameSHA256,
            pointer: `${entry.pointer}/spec/template/spec`,
          },
        },
        spec.backoffLimit ?? 6,
      ),
    );
    // Proof: Task25c3e runtime blocker omission failed conditions and whole attempt history control.
    missing(identity, 'job-serial-runtime-binding');
    jobLifecycles.push(deriveJobLifecycle(controller, entry, identity));
  }
  function deriveCron(
    view: ReturnType<typeof readRehearsalSource>['native'][number],
    cron: ReturnType<typeof readCronJob>,
  ) {
    const { entry, manifest } = view;
    const identity = `${entry.kind}:${entry.namespace ?? '_'}:${entry.name}`;
    // Proof: Task56 runtime/history-obligation omissions lost independent blockers alongside full charges.
    missing(identity, 'cronjob-declared-horizon-runtime-binding');
    missing(
      identity,
      'cronjob-prior-missed-manual-adopted-recreated-Job-generations-and-retained-history',
    );
    const horizon = horizons?.get(identity);
    // Proof: Task56 controller-for-source substitution suppressed source UTC with declared Kyiv; effective-zone bypass charged unsupported Kyiv.
    const zone =
      cron.calendar.timeZone.kind === 'absent' ? horizon?.controllerZone : cron.calendar.timeZone;
    // Proof: Task56 outside-catalogue obligation omission concealed unknown effective controller knowledge.
    if (zone?.kind === 'outside-catalogue')
      missing(identity, 'cronjob-time-zone-outside-catalogue');
    let supported = true;
    // Proof: Task56 source-identity/namespace bypasses lost their named refusals; provider/Job/suspend/Replace bypasses charged unsupported sources.
    if (hasRuntimeIdentity(manifest)) {
      missing(identity, 'source-controller-identity-and-generation');
      supported = false;
    }
    if (entry.namespace === null) {
      missing(identity, 'source-namespace');
      supported = false;
    }
    if (
      !providerMatches ||
      !supportsJobPolicy(cron.job) ||
      cron.spec.suspend === true ||
      cron.spec.concurrencyPolicy === 'Replace'
    ) {
      missing(identity, 'cronjob-job-lifecycle-policy');
      supported = false;
    }
    if (horizon === undefined) {
      missing(identity, 'cronjob-declared-horizon');
      supported = false;
    }
    if (zone?.kind !== 'known' || zone.name !== 'UTC') {
      missing(identity, 'cronjob-time-zone-policy');
      supported = false;
    }
    const periodMs = readUtcCadence(cron.calendar.schedule);
    if (periodMs === undefined) {
      missing(identity, 'cronjob-calendar-policy');
      supported = false;
    }
    const envelope =
      horizon === undefined || periodMs === undefined
        ? undefined
        : readCronJobEnvelope(horizon, periodMs, cron.job.spec.backoffLimit ?? 6);
    if (horizon !== undefined && periodMs !== undefined && envelope === undefined) {
      missing(identity, 'cronjob-attempt-expansion-range');
      supported = false;
    }
    const pod = NativeWorkloadSpec(cron.job.spec.template.spec);
    if (pod instanceof type.errors) {
      missing(identity, 'workload-bounds-or-resource-policy');
      missing(identity, 'CronJob-lifecycle-unaccounted');
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
      missing(identity, failure.message);
      missing(identity, 'CronJob-lifecycle-unaccounted');
      return;
    }
    for (const volume of model.volumes.filter((volume) => volume.kind === 'claim'))
      missing(
        identity,
        claims.has(`PersistentVolumeClaim:${entry.namespace ?? '_'}:${volume.reference}`)
          ? `claim-owner-and-retention:${entry.namespace ?? '_'}/${volume.reference}`
          : `claim-source:${entry.namespace ?? '_'}/${volume.reference}`,
      );
    for (const container of [...pod.containers, ...(pod.initContainers ?? [])])
      if (container.resources.limits['ephemeral-storage'] === undefined)
        missing(
          identity,
          `ephemeral-storage-limit-absent:${container.name}; writable-logs-and-runtime-state-unobserved`,
        );
    if (
      !supported ||
      horizon === undefined ||
      periodMs === undefined ||
      envelope === undefined ||
      entry.namespace === null
    ) {
      missing(identity, 'CronJob-lifecycle-unaccounted');
      return;
    }
    cronJobEntries.push(
      ...expandCronJob(
        {
          identity,
          namespace: entry.namespace,
          name: entry.name,
          model,
          // Proof: Task56 Cron frame/pointer substitutions lost exact native charge provenance.
          source: {
            owner: entry.owner,
            sha256: entry.source.frameSHA256,
            pointer: `${entry.pointer}/spec/jobTemplate/spec/template/spec`,
          },
        },
        horizon,
        periodMs,
        envelope.ticks,
        cron.job.spec.backoffLimit ?? 6,
      ),
    );
    cronJobLifecycles.push(
      deriveCronJobLifecycle(cron, entry, horizon, periodMs, envelope.ticks, envelope.slots),
    );
  }
  function deriveDaemon(
    view: ReturnType<typeof readRehearsalSource>['native'][number],
    broadPod: NonNullable<ReturnType<typeof readNativeInput>>,
  ) {
    const { entry, manifest } = view;
    const identity = `${entry.kind}:${entry.namespace ?? '_'}:${entry.name}`;
    const controller = readDaemonSet(manifest);
    // Proof: Task25c3g runtime/history/independent-obligation omissions lost required facts even without topology or usable volumes.
    missing(identity, 'daemon-replacement-wave-runtime-binding');
    missing(identity, 'daemon-whole-attempt-generations-and-retained-history');
    for (const fact of readDaemonObligations(view, broadPod, claims)) missing(identity, fact);
    // Proof: Task25c3g daemon source-identity/provider bypasses admitted unsupported source identities and provider mismatches.
    let supported = true;
    if (hasRuntimeIdentity(manifest)) {
      missing(identity, 'source-controller-identity-and-generation');
      supported = false;
    }
    if (entry.namespace === null) {
      missing(identity, 'source-namespace');
      supported = false;
    }
    if (!providerMatches || !supportsDaemonPolicy(controller)) {
      missing(identity, 'daemon-replacement-wave-policy');
      supported = false;
    }
    // Proof: Task25c3g missing-topology omission hid its named fact; range removal charged N0/N129. Hostile MaxInt32 was never expanded under fault.
    if (topology === undefined) {
      missing(identity, 'daemon-candidate-topology');
      supported = false;
    } else if (topology.candidateNodes < 1 || topology.candidateNodes > 128) {
      missing(identity, 'daemon-candidate-expansion-range');
      supported = false;
    }
    const pod = NativeWorkloadSpec(selectDaemonWorkload(controller));
    // Proof: Task25c3g bounds-obligation omission hid absent/null resource maps.
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
      // Proof: Task25c3g normalizer-blocker omission hid the unsupported-volume fact alongside independent source obligations.
      missing(identity, failure.message);
      return;
    }
    if (!supported || entry.namespace === null || topology === undefined) return;
    // Proof: Task25c3g source-frame/pointer substitutions failed exact charge provenance.
    daemonEntries.push(
      ...expandDaemon(
        {
          identity,
          namespace: entry.namespace,
          name: entry.name,
          model,
          source: {
            owner: entry.owner,
            sha256: entry.source.frameSHA256,
            pointer: `${entry.pointer}/spec/template/spec`,
          },
        },
        topology.candidateNodes,
      ),
    );
    daemonLifecycles.push(deriveDaemonLifecycle(controller, entry, identity, topology));
  }
  // Proof: Task54 prepass-order omission let an earlier ordinal collision mask malformed late CronJob calendar fields.
  // Parsed calendars stay local: Task54 serialization injection failed the native no-bigint JSON controls.
  const validated = source.native.map((view) => {
    const calendar =
      view.entry.kind === 'CronJob' ? readCronCalendar(view.manifest['spec']) : undefined;
    return {
      ...view,
      // Proof: Task56 full-policy prepass omission let the invariant error replace malformed-policy refusal before lifecycle iteration.
      cron: calendar === undefined ? undefined : readCronJob(view.manifest, calendar),
      pod: readNativeInput(view),
    };
  });
  for (const { entry, manifest, cron, pod: broadPod } of validated) {
    const identity = `${entry.kind}:${entry.namespace ?? '_'}:${entry.name}`;
    if (entry.category === 'claim') {
      missing(identity, 'claim-owner-and-retention-unaccounted');
      continue;
    }
    if (entry.kind === 'DaemonSet') {
      if (broadPod === null) throw new Error('DaemonSet pod missing after validation');
      deriveDaemon({ entry, manifest }, broadPod);
      continue;
    }
    if (entry.kind === 'Deployment') {
      deriveDeployment({ entry, manifest });
      continue;
    }
    if (entry.kind === 'Job') {
      deriveJob({ entry, manifest });
      continue;
    }
    if (entry.kind === 'CronJob') {
      if (cron === undefined) throw new Error('Cron calendar missing after validation');
      deriveCron({ entry, manifest }, cron);
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
    daemonScope: 'immutable-source-daemon-replacement-wave' as const,
    daemonLifecycles,
    deploymentScope: 'immutable-source-deployment-replacement-wave' as const,
    deploymentLifecycles,
    jobScope: 'immutable-source-serial-job-attempts' as const,
    jobLifecycles,
    cronJobLifecycles,
    entries: [
      ...entries.map((entry) => ({
        ...entry,
        concurrency: { ...entry.concurrency, phase: 'immutable-source-ordinal' as const },
      })),
      ...deploymentEntries,
      ...jobEntries,
      ...cronJobEntries,
      ...daemonEntries,
    ],
    // Proof: Task25c3b combined-total omission lost both Deployment cohorts from shared sums.
    // Proof: Task25c3e Job-total omission failed shared init/overhead/emptyDir normalization control.
    // Proof: Task25c3g combined-total omission lost both full daemon cohorts from the shared sum.
    knownContributions: sumCapacity([
      ...entries,
      ...deploymentEntries,
      ...jobEntries,
      // Proof: Task56 Cron total omission lost full retry memory/CPU/disk from shared capacity sums.
      ...cronJobEntries,
      ...daemonEntries,
    ]),
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

/** Consume already validated source views; bind raw topology/horizons against their explicit independent contract before arithmetic. */
export function deriveRehearsalNativeCosts(
  source: Pick<ReturnType<typeof readRehearsalSource>, 'inventory' | 'native'>,
  contract: Parameters<typeof readDaemonTopology>[0],
  lock: Toolchain,
  topology?: RehearsalTopologyEvidence,
  horizons?: RehearsalCronJobHorizons,
) {
  return deriveNativeCosts(
    source,
    lock,
    readDaemonTopology(contract, topology),
    // Proof: Task56 native-horizon forwarding omission lost the actual fourteen-slot reader contribution.
    readCronJobHorizons(contract, source.native, horizons),
  );
}

/** Decode every independently bound source frame before conditional lifecycle accounting.
 * Reuses {@link normalizeNativeOwner} and {@link expandNativeOwner}; no filtered receipt or scenario assertion grants admission.
 * One full normalized Pod remains charged through process recovery and ordinary graceful same-template ordinal replacement.
 * Claim bytes are source reservations, not Bound storage, usage or filesystem quotas. Grace is defaulting metadata, not reclamation time.
 * Pinned defaults and render capability remain separate from actual version, ownership, placement, termination and enforcement prerequisites.
 * Deployment cohorts reserve initial plus first replacement Pods conditionally; source policy cannot enforce the required event exclusions.
 * Its accounting slots carry no observed Pod/ReplicaSet identity, and runtime-wave binding remains an owner-specific obligation.
 * Serial Job slots retain every full failed/terminating attempt conditionally; Helm/Flux generations and retained histories remain unobserved.
 * Supplied malformed fields throw before missing-bound/unsupported classifications. Other families and all runtime authority remain unresolved.
 */
export function readRehearsalNativeCosts(
  ...input: Parameters<typeof readRehearsalSource>
): ReturnType<typeof deriveNativeCosts>;
export function readRehearsalNativeCosts(
  stages: Parameters<typeof readRehearsalSource>[0],
  expansions: Parameters<typeof readRehearsalSource>[1],
  contract: NativeSourceContract,
  lock: Toolchain,
  bootstrap: Parameters<typeof readRehearsalSource>[4],
  topology: RehearsalTopologyEvidence,
): ReturnType<typeof deriveNativeCosts>;
export function readRehearsalNativeCosts(
  stages: Parameters<typeof readRehearsalSource>[0],
  expansions: Parameters<typeof readRehearsalSource>[1],
  contract: NativeSourceContract,
  lock: Toolchain,
  bootstrap: Parameters<typeof readRehearsalSource>[4],
  topology: RehearsalTopologyEvidence | undefined,
  horizons?: RehearsalCronJobHorizons,
): ReturnType<typeof deriveNativeCosts>;
export function readRehearsalNativeCosts(
  ...input: [
    ...Parameters<typeof readRehearsalSource>,
    topology?: RehearsalTopologyEvidence,
    horizons?: RehearsalCronJobHorizons,
  ]
) {
  const [stages, expansions, contract, lock, bootstrap, evidence, horizons] = input;
  const source = readRehearsalSource(stages, expansions, contract, lock, bootstrap);
  return deriveRehearsalNativeCosts(source, contract, lock, evidence, horizons);
}

/** Share the canonical eleven-stage producer once; horizons remain native-only declared accounting inputs. */
export async function deriveObservabilityRehearsalNativeCosts(
  ...input: [...Parameters<typeof prepareRehearsalInventory>, horizons?: RehearsalCronJobHorizons]
) {
  const [root, tools, request, directory, helmArchive, horizons] = input;
  const source = await prepareRehearsalInventory(root, tools, request, directory, helmArchive);
  return {
    ...deriveNativeCosts(
      source,
      source.lock,
      // Proof: Task56 topology forwarding omission hid changed bytes in the single-pass companion control.
      readDaemonTopology(source.inventory, source.topologyEvidence),
      // Proof: Task56 companion-horizon forwarding omission lost14slots and concealed changed binding; producer receives only its first5 arguments once.
      readCronJobHorizons(source.inventory, source.native, horizons),
    ),
    sourceInventorySHA256: source.inventory.inventorySHA256,
    provenance: source.inventory.provenance,
    obligations: source.inventory.obligations,
  };
}
