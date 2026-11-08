import { createHash } from 'node:crypto';

import { type } from 'arktype';

import { expandNativeOwner } from './observability-cold-start';
import type { readRehearsalSource } from './observability-rehearsal-inventory';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const Count = type('number.integer>=0').atMost(2147483647);
const Grace = type({ 'terminationGracePeriodSeconds?': 'number.integer>=0' });
function refuse(): never {
  throw new Error('Native ordinal source malformed');
}
/** Retain declared absence separately from pinned Kubernetes default provenance. */
export function defaultFact<Value extends string | number | boolean>(
  declared: Value | undefined,
  fallback: Value,
) {
  return {
    declared: declared ?? 'absent',
    effective: declared ?? fallback,
    basis: declared === undefined ? ('kubernetes-v1.36.4-default' as const) : ('declared' as const),
  };
}
// Proof: Task25c3e record-only schema failed eight malformed mode/boolean/restart/replacement/failure-rule negatives.
const JobSpec = type({
  'parallelism?': Count,
  'completions?': Count,
  'backoffLimit?': Count,
  'backoffLimitPerIndex?': Count,
  'maxFailedIndexes?': Count,
  // Proof: Task25c3e deadline widening failed malformed deadline negative and unsafe tests.
  'activeDeadlineSeconds?': type('number.integer>=0').atMost(Number.MAX_SAFE_INTEGER),
  'ttlSecondsAfterFinished?': Count,
  'completionMode?': "'NonIndexed'|'Indexed'",
  'suspend?': 'boolean',
  'manualSelector?': 'boolean',
  'managedBy?': 'string>0',
  'podReplacementPolicy?': "'TerminatingOrFailed'|'Failed'",
  'podFailurePolicy?': {
    'rules?': type({
      action: "'Count'|'FailJob'|'Ignore'|'FailIndex'",
      'onExitCodes?': {
        'containerName?': 'string>0',
        operator: "'In'|'NotIn'",
        values: type('number.integer')
          .atLeast(-2147483648)
          .atMost(2147483647)
          .array()
          .atLeastLength(1)
          .atMostLength(255),
      },
      'onPodConditions?': type({ type: 'string>0', 'status?': "''|'True'|'False'|'Unknown'" })
        .array()
        .atMostLength(20),
    })
      .array()
      .atMostLength(20),
  },
  'successPolicy?': {
    rules: type({ 'succeededCount?': Count, 'succeededIndexes?': 'string<=65536' })
      .array()
      .atLeastLength(1)
      .atMostLength(20),
  },
  'selector?': {
    'matchLabels?': 'Record<string,string>',
    'matchExpressions?': type({
      key: 'string>0',
      operator: "'In'|'NotIn'|'Exists'|'DoesNotExist'",
      'values?': 'string[]',
    }).array(),
  },
  template: {
    'metadata?': { 'labels?': 'Record<string,string>' },
    spec: {
      restartPolicy: "'Never'|'OnFailure'",
      containers: type({ name: 'string>0' }).array(),
      'initContainers?': type({ name: 'string>0' }).array(),
    },
  },
});
const Job = type({ metadata: { 'annotations?': 'Record<string,string>|null' }, spec: 'unknown' });
function isJobLabel(value: string) {
  return value.length <= 63 && /^(?:[A-Za-z0-9](?:[-_.A-Za-z0-9]*[A-Za-z0-9])?)?$/.test(value);
}
function isJobKey(value: string) {
  const parts = value.split('/');
  const name = parts.pop();
  return (
    name !== undefined &&
    name !== '' &&
    isJobLabel(name) &&
    (parts.length === 0 ||
      (parts.length === 1 &&
        parts[0].length <= 253 &&
        parts[0]
          .split('.')
          .every((label) => label.length <= 63 && /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(label))))
  );
}
/** Decode known Job policy before unsupported/default-provider or resource-bound decisions.
 * Source declarations precede server-generated selectors; absent counts use the conditional v1.36.4 batch defaults.
 * This is a narrow source decoder, not API admission or controller execution.
 */
export function readJobSpec(value: unknown) {
  const spec = JobSpec(value);
  if (spec instanceof type.errors) refuse();
  const rules = spec.podFailurePolicy?.rules ?? [];
  const labels = spec.template.metadata?.labels ?? {};
  // Proof: Task25c3e object-array bypass failed malformed selector array/labels array and failure shape tests.
  if (
    [
      spec,
      spec.template.metadata,
      spec.template.metadata?.labels,
      spec.selector,
      spec.selector?.matchLabels,
      spec.podFailurePolicy,
      spec.successPolicy,
      ...rules,
      ...rules.map((rule) => rule.onExitCodes),
      ...rules.flatMap((rule) => rule.onPodConditions ?? []),
      ...(spec.successPolicy?.rules ?? []),
      ...(spec.selector?.matchExpressions ?? []),
    ].some(Array.isArray)
  )
    refuse();
  // Proof: Task25c3e foreign-field check removal failed foreign replicas/strategy/claims tests.
  if (
    [
      'replicas',
      'strategy',
      'updateStrategy',
      'podManagementPolicy',
      'ordinals',
      'volumeClaimTemplates',
    ].some((field) => Object.hasOwn(spec, field))
  )
    refuse();
  // Proof: Task25c3e unconditional completions1 admitted the valid unsupported workqueue test.
  const completions = spec.completions ?? (spec.parallelism === undefined ? 1 : undefined);
  // Proof: Task25c3e Indexed relationship bypass failed indexed work queue and parallel cap negatives.
  if (
    spec.completionMode === 'Indexed' &&
    (completions === undefined || (spec.parallelism ?? 1) > 100000)
  )
    refuse();
  if (
    // Proof: Task25c3e Indexed-policy bypass admitted per index nonindexed and success nonindexed negatives.
    (spec.backoffLimitPerIndex !== undefined || spec.successPolicy !== undefined) &&
    spec.completionMode !== 'Indexed'
  )
    refuse();
  if (
    // Proof: Task25c3e max-index bypass failed max failed without index and indexed max failures tests.
    spec.maxFailedIndexes !== undefined &&
    (spec.backoffLimitPerIndex === undefined ||
      completions === undefined ||
      spec.maxFailedIndexes > completions ||
      spec.maxFailedIndexes > 100000)
  )
    refuse();
  if (
    completions !== undefined &&
    // Proof: Task25c3e high-count guard bypass failed indexed large missing max failures.
    completions > 100000 &&
    spec.backoffLimitPerIndex !== undefined &&
    (spec.maxFailedIndexes === undefined ||
      spec.maxFailedIndexes > 10000 ||
      (spec.parallelism ?? 1) > 10000)
  )
    refuse();
  if (
    // Proof: Task25c3e restart/replacement bypass failed OnFailure and failure replacement contradiction tests.
    spec.podFailurePolicy !== undefined &&
    (spec.template.spec.restartPolicy !== 'Never' ||
      (spec.podReplacementPolicy !== undefined && spec.podReplacementPolicy !== 'Failed'))
  )
    refuse();
  if (
    // Proof: Task25c3e managedBy validation bypass failed malformed managed controller domain.
    spec.managedBy !== undefined &&
    (spec.managedBy.length > 63 ||
      // Proof: Task25c3e DNS-label bypass failed malformed managed controller empty domain label.
      !isJobKey(spec.managedBy.split('/')[0] + '/controller') ||
      !/^[a-z0-9](?:[-.a-z0-9]*[a-z0-9])?\/[A-Za-z0-9/_.~%!$&'()*+,;=:-]+$/.test(spec.managedBy))
  )
    refuse();
  for (const rule of rules) {
    const codes = rule.onExitCodes;
    const conditions = rule.onPodConditions ?? [];
    // Proof: Task25c3e matcher bypass failed failure rule neither and both matchers tests.
    if ((codes === undefined) === (conditions.length === 0)) refuse();
    // Proof: Task25c3e qualified-condition check removal failed malformed condition type.
    if (conditions.some((condition) => !isJobKey(condition.type))) refuse();
    // Proof: Task25c3e per-index prerequisite removal failed failure index contradiction.
    if (rule.action === 'FailIndex' && spec.backoffLimitPerIndex === undefined) refuse();
    if (codes !== undefined) {
      if (
        // Proof: Task25c3e exit-code content bypass failed zero, duplicate and unordered negatives.
        codes.values.some(
          (code, index) =>
            (codes.operator === 'In' && code === 0) ||
            (index > 0 && codes.values[index - 1] >= code),
        )
      )
        refuse();
      if (
        // Proof: Task25c3e container lookup bypass failed failure container unknown.
        codes.containerName !== undefined &&
        ![...spec.template.spec.containers, ...(spec.template.spec.initContainers ?? [])].some(
          (container) => container.name === codes.containerName,
        )
      )
        refuse();
    }
  }
  for (const rule of spec.successPolicy?.rules ?? []) {
    // Proof: Task25c3e required-rule removal failed success empty rule.
    if (rule.succeededCount === undefined && rule.succeededIndexes === undefined) refuse();
    let count = 0;
    let previous = -1;
    for (const interval of rule.succeededIndexes === undefined || rule.succeededIndexes === ''
      ? []
      : rule.succeededIndexes.split(',')) {
      // Proof: Task25c3e grammar removal admitted success index exponent independently of numeric bounds.
      if (!/^[0-9]+(?:-[0-9]+)?$/.test(interval)) refuse();
      const [first, last = first] = interval.split('-').map(Number);
      if (
        // Proof: Task25c3e interval guard removal failed success indexes overlap and bound tests.
        !Number.isSafeInteger(last) ||
        first <= previous ||
        last < first ||
        completions === undefined ||
        last >= completions
      )
        refuse();
      count += last - first + 1;
      previous = last;
    }
    if (
      // Proof: Task25c3e count-bound removal failed success count exceeds indexes.
      rule.succeededCount !== undefined &&
      (completions === undefined ||
        rule.succeededCount > completions ||
        (rule.succeededIndexes !== undefined && rule.succeededCount > count))
    )
      refuse();
  }
  // Proof: Task25c3e label guard removal failed selector invalid key/value and mismatched template tests.
  for (const [key, value] of Object.entries(spec.selector?.matchLabels ?? {}))
    if (!isJobKey(key) || !isJobLabel(value) || labels[key] !== value) refuse();
  for (const expression of spec.selector?.matchExpressions ?? []) {
    // Proof: Task25c3e expression grammar removal admitted the matching invalid-label selector test.
    if (!isJobKey(expression.key) || expression.values?.some((value) => !isJobLabel(value)))
      refuse();
    const value = Object.hasOwn(labels, expression.key) ? labels[expression.key] : undefined;
    if (
      // Proof: Task25c3e template-match removal failed In, NotIn, Exists and DoesNotExist controls.
      expression.operator === 'In'
        ? value === undefined || !expression.values?.includes(value)
        : expression.operator === 'NotIn'
          ? value !== undefined && expression.values?.includes(value)
          : expression.operator === 'Exists'
            ? value === undefined
            : value !== undefined
    )
      refuse();
    const hasValues = (expression.values?.length ?? 0) > 0;
    // Proof: Task25c3e value-cardinality removal admitted Exists with values.
    if ((expression.operator === 'In' || expression.operator === 'NotIn') !== hasValues) refuse();
  }
  return { spec, completions };
}

/** Retains the ordinary Job required-root-metadata boundary and legacy output field order. */
export function readJob(manifest: Record<string, unknown>) {
  const controller = Job(manifest);
  if (controller instanceof type.errors) refuse();
  const decoded = readJobSpec(controller.spec);
  return { ...controller, spec: decoded.spec, completions: decoded.completions };
}
/** The existing conditional serial NonIndexed policy; provider and allocation bounds belong to callers. */
export function supportsJobPolicy(controller: ReturnType<typeof readJobSpec>) {
  const spec = controller.spec;
  return (
    controller.completions === 1 &&
    (spec.parallelism ?? 1) === 1 &&
    (spec.completionMode ?? 'NonIndexed') === 'NonIndexed' &&
    spec.suspend !== true &&
    spec.manualSelector !== true &&
    spec.selector === undefined &&
    spec.podFailurePolicy === undefined &&
    spec.successPolicy === undefined &&
    spec.backoffLimitPerIndex === undefined &&
    (spec.podReplacementPolicy ?? 'TerminatingOrFailed') === 'TerminatingOrFailed' &&
    (spec.managedBy === undefined || spec.managedBy === 'kubernetes.io/job-controller')
  );
}

/** Keep default provenance and the conditional one-UID envelope separate from runtime admission.
 * At most 256 accounting slots are materialized by this adapter (backoff 0..255), a computational
 * representation limit rather than a Kubernetes, hardware or physical safety bound.
 * Failed/terminating attempts retain full demand; restarts reuse a slot but cumulative logs remain unbounded.
 */
export function deriveJobLifecycle(
  controller: ReturnType<typeof readJob>,
  entry: ReturnType<typeof readRehearsalSource>['native'][number]['entry'],
  identity: string,
) {
  const spec = controller.spec;
  return {
    owner: identity,
    // Proof: Task25c3e owner-only template hash failed the full-template/changed-label condition control.
    templateSHA256: hash(JSON.stringify(spec.template)),
    source: entry,
    hooks: entry.hooks,
    annotations:
      controller.metadata.annotations === undefined
        ? ('absent' as const)
        : controller.metadata.annotations,
    annotationSource: entry.annotationSource,
    ...deriveJobPolicyFacts(controller),
  };
}

/** Materialize full normalized retry accounting slots, never observed Pod names or UIDs. */
export function expandJob(
  input: Omit<Parameters<typeof expandNativeOwner>[0], 'templates' | 'claimPointer' | 'pods'>,
  backoff: number,
) {
  // Proof: Task25c3e B+1 removal failed backoff0/4/6/10 full-attempt controls.
  const pods = backoff + 1;
  return expandNativeOwner({
    ...input,
    pods,
    templates: [],
    claimPointer: () => {
      throw new Error('Job claim template impossible');
    },
  }).map((charge, slot) => ({
    ...charge,
    kind: 'pod' as const,
    // Proof: Task25c3e slot shift and zeroed retry memory/CPU/disk failed backoff4 full-charge control.
    identity: `${input.identity}/attempt/${String(slot)}`,
    concurrency: { phase: 'immutable-source-serial-job-attempts' as const, pods, slot },
  }));
}

/** Shared source-policy/default/grace facts describe one conditional Job UID, without fabricating metadata. */
export function deriveJobPolicyFacts(controller: ReturnType<typeof readJobSpec>) {
  const spec = controller.spec;
  const grace = Grace(spec.template.spec);
  if (grace instanceof type.errors) refuse();
  return {
    parallelism: defaultFact(spec.parallelism, 1),
    completions: defaultFact(spec.completions, 1),
    // Proof: Task25c3e default backoff7 substitution failed declared-absence/provider provenance control.
    backoffLimit: defaultFact(spec.backoffLimit, 6),
    completionMode: defaultFact(spec.completionMode, 'NonIndexed'),
    suspend: defaultFact(spec.suspend, false),
    manualSelector: defaultFact(spec.manualSelector, false),
    podReplacementPolicy: defaultFact(spec.podReplacementPolicy, 'TerminatingOrFailed'),
    podFailurePolicy: 'absent' as const,
    successPolicy: 'absent' as const,
    managedBy: {
      declared: spec.managedBy ?? 'absent',
      effective: 'kubernetes.io/job-controller' as const,
      basis:
        spec.managedBy === undefined
          ? ('kubernetes-v1.36.4-controller' as const)
          : ('declared' as const),
    },
    restartPolicy: spec.template.spec.restartPolicy,
    activeDeadlineSeconds: {
      declared: spec.activeDeadlineSeconds ?? 'absent',
      reclamationDeadline: false as const,
    },
    ttlSecondsAfterFinished: {
      declared: spec.ttlSecondsAfterFinished ?? 'absent',
      reclamationDeadline: false as const,
    },
    grace: {
      ...defaultFact(grace.terminationGracePeriodSeconds, 30),
      reclamationDeadline: false as const,
    },
    maximumPodSlots: (spec.backoffLimit ?? 6) + 1,
    scenario: 'immutable-source-single-uid-serial-nonindexed-job' as const,
    // Proof: Task25c3e success-condition omission failed conditions and whole attempt history control.
    conditions: {
      source: 'fresh-immutable-attempt',
      identity: 'one-Job-UID-one-template-unchanged-counts-and-policies',
      history: 'complete-successful-and-uncertain-creation-reconciliation',
      initial: 'no-prior-work-or-adoption-and-no-unaccounted-creation',
      failures:
        'every-replaced-nonsuccessful-Pod-durably-counted-once-before-next-create-including-finalizers',
      success: 'no-further-creation-after-first-success',
      controller: 'reachable-cooperative-controller-with-reconciled-expectations',
      excluded: [
        'foreign-mutation',
        'forced-deletion',
        'lost-node-execution',
        'controller-recreation',
      ],
      retention: 'full-failed-terminating-and-current-Pod-demand-without-cleanup-credit',
      restarts: 'reuse-Pod-slot-cumulative-restart-logs-remain-unbounded',
      admission: 'independently-bind-and-enforce-event-constraints-before-creation',
      runtimeObserved: false as const,
    },
    wholeAttempt: {
      required: [
        'Helm-install-upgrade-retry-remediation-invocation-identities',
        'hook-created-Job-UID-generations',
        'Flux-forced-recreation-generations',
        'retained-predecessor-Pod-device-log-histories',
      ],
      // Proof: Task25c3e forged multiplier one failed conditions and whole attempt history control.
      generationMultiplier: 'unobserved' as const,
      cleanupCredit: false as const,
      runtimeObserved: false as const,
    },
    // Proof: Task25c3e runtimeObserved forgery failed conditions and whole attempt history control.
    runtimeObserved: false as const,
  };
}
