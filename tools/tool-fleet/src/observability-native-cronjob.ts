import { createHash } from 'node:crypto';

import { type } from 'arktype';

import { type CronCalendar, type CronSchedule, readCronFields } from './observability-cron-syntax';
import { readCronTimeZone } from './observability-cron-zone';
import type { NativeSourceContract } from './observability-native-daemon';
import {
  defaultFact,
  deriveJobPolicyFacts,
  expandJob,
  readJobSpec,
} from './observability-native-job';
import type {
  readRehearsalSource,
  RehearsalFrameContract,
} from './observability-rehearsal-inventory';
import { assertRehearsalSource } from './observability-rehearsal-sources';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
type NativeView = ReturnType<typeof readRehearsalSource>['native'][number];
/** Declared scheduling coordinates supply conditional accounting inputs, never controller observations or admission. */
export interface RehearsalCronJobHorizons {
  readonly basis: 'declared';
  readonly selection: NativeSourceContract['provenance'];
  readonly windows: readonly {
    readonly owner: string;
    readonly frameSHA256: string;
    readonly pointer: string;
    readonly jobTemplateSHA256: string;
    readonly fromExclusive: string;
    readonly toInclusive: string;
    readonly controllerTimeZone: string;
  }[];
}
const SHA256 = /^[a-f0-9]{64}$/;
// Proof: Task56 selection/window/root closed-schema widening, coherent revision/artifact widening and declared-basis widening each lost their native horizon refusal.
const Selection = type({ sourceRevision: /^[a-f0-9]{40}$/, artifactSHA256: SHA256, '+': 'reject' });
const Source = type({ sourcePath: 'string>0', artifactPath: 'string>0', sha256: SHA256 });
const Window = type({
  owner: 'string>0',
  frameSHA256: SHA256,
  pointer: 'string>0',
  jobTemplateSHA256: SHA256,
  fromExclusive: 'string',
  toInclusive: 'string',
  controllerTimeZone: 'string',
  '+': 'reject',
});
const Horizons = type({
  basis: "'declared'",
  selection: Selection,
  windows: Window.array(),
  '+': 'reject',
});
// Proof: Task56 annotation/label map widening admitted typed-invalid maps; concurrency/suspend/deadline schema widening lost full-policy prepass refusals.
const Metadata = type({
  'annotations?': 'Record<string,string>|null',
  'labels?': 'Record<string,string>',
});
const CronJob = type({
  metadata: Metadata,
  spec: {
    'concurrencyPolicy?': "''|'Allow'|'Forbid'|'Replace'",
    'suspend?': 'boolean',
    'successfulJobsHistoryLimit?': type('number.integer>=0').atMost(2147483647),
    'failedJobsHistoryLimit?': type('number.integer>=0').atMost(2147483647),
    'startingDeadlineSeconds?': type('number.integer>=0').atMost(Number.MAX_SAFE_INTEGER),
    jobTemplate: { 'metadata?': Metadata, spec: 'unknown' },
  },
});
function refuse(): never {
  throw new Error('CronJob source or horizon malformed');
}
/** Validate all known Cron/JobTemplate policy before unsupported scenarios; no child metadata or UID is synthesized.
 * Pinned Kubernetes1.36.4 validateCronJobSpec/ValidateJobTemplateSpec permit safe nonnegative int64 deadlines,
 * forbid template selectors and manualSelector=true; ordinary Job decoding remains {@link readJobSpec}.
 */
export function readCronJob(manifest: Record<string, unknown>, calendar: CronCalendar) {
  // Proof: Task56 cron-shape guard removal lost the controlled full-policy malformed-source refusal.
  const cron = CronJob(manifest);
  if (cron instanceof type.errors) return refuse();
  const template = cron.spec.jobTemplate;
  // Proof: Task56 metadata-array guard removal admitted JobTemplate metadata, annotations and labels arrays.
  if (
    [
      cron.metadata,
      cron.metadata.annotations,
      cron.metadata.labels,
      cron.spec,
      template,
      template.metadata,
      template.metadata?.annotations,
      template.metadata?.labels,
    ].some(Array.isArray)
  )
    return refuse();
  // Proof: Task56 nested-job decoder substitution concealed malformed nested completionMode before provider/collision decisions.
  const job = readJobSpec(template.spec);
  // Proof: Task56 selector/manualSelector guard removals each admitted its forbidden Cron JobTemplate policy.
  if (job.spec.selector !== undefined || job.spec.manualSelector === true) return refuse();
  return { ...cron, calendar, job };
}
function readTimestamp(value: string) {
  // Proof: Task56 grammar removal admitted expanded +010000; roundtrip removal admitted future February30; invalid-date guard removal leaked RangeError.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return refuse();
  // Finite millisecond parses within the four-digit-year grammar are safe integers; invalid parses must refuse before toISOString can throw RangeError.
  const milliseconds = Date.parse(value);
  if (Number.isNaN(milliseconds) || new Date(milliseconds).toISOString() !== value) return refuse();
  return milliseconds;
}
/** Omission reads no new source anchors. Supplied closed bindings are all decoded before lifecycle iteration.
 * Full JobTemplate bytes (including optional metadata) and inventory document pointers are distinct from Pod template hashes.
 * Accepted caller coordinates are detached snapshots; no selected adapter revision becomes an owning source revision.
 */
export function readCronJobHorizons(
  contract: RehearsalFrameContract,
  native: readonly NativeView[],
  supplied: RehearsalCronJobHorizons | undefined,
) {
  // Proof: Task56 omission getter-trap control permits legacy four/five calls without reading source anchors.
  if (supplied === undefined) return undefined;
  // Proof: Task56 anchor/horizon shape guard removals lost controlled absence/null refusals; coordinate guard removal accepted a relocated anchor.
  const anchor = type({
    bootstrapSources: Source.array(),
    provenance: { sourceRevision: /^[a-f0-9]{40}$/, artifactSHA256: SHA256 },
  })(contract);
  const horizons = Horizons(supplied);
  if (
    anchor instanceof type.errors ||
    horizons instanceof type.errors ||
    Array.isArray(supplied) ||
    Array.isArray(horizons.selection)
  )
    return refuse();
  for (const source of anchor.bootstrapSources) assertRehearsalSource(source);
  // Proof: Task56 independent revision/artifact binding removals each admitted the corresponding changed selection.
  if (
    horizons.selection.sourceRevision !== anchor.provenance.sourceRevision ||
    horizons.selection.artifactSHA256 !== anchor.provenance.artifactSHA256
  )
    return refuse();
  const windows = new Map<string, BoundCronJobHorizon>();
  for (const window of horizons.windows) {
    // Proof: Task56 duplicate guard removal admitted repeated owners; kind guard removal admitted a coherently bound StatefulSet/template/window.
    if (Array.isArray(window) || windows.has(window.owner)) return refuse();
    const view = native.find(
      ({ entry }) => `${entry.kind}:${entry.namespace ?? '_'}:${entry.name}` === window.owner,
    );
    if (view?.entry.kind !== 'CronJob') return refuse();
    const template = type({ spec: { jobTemplate: 'unknown' } })(view.manifest);
    if (template instanceof type.errors) return refuse();
    // Proof: Task56 frame/pointer/full-template binding removals each admitted its changed native coordinate.
    if (
      window.frameSHA256 !== view.entry.source.frameSHA256 ||
      window.pointer !== view.entry.pointer ||
      window.jobTemplateSHA256 !== hash(JSON.stringify(template.spec.jobTemplate))
    )
      return refuse();
    const fromMs = readTimestamp(window.fromExclusive);
    const toMs = readTimestamp(window.toInclusive);
    // Proof: Task56 order guard removal accepted an equal-endpoint window.
    if (fromMs >= toMs) return refuse();
    // Proof: Task56 controller-zone substitution admitted Local even when explicit source UTC made the declaration inactive.
    const controllerZone = readCronTimeZone(window.controllerTimeZone);
    windows.set(
      window.owner,
      // Proof: Task56 snapshot removal at both output boundaries let caller selection mutation rewrite the lifecycle.
      structuredClone({
        ...window,
        basis: horizons.basis,
        selection: horizons.selection,
        fromMs,
        toMs,
        controllerZone,
      }),
    );
  }
  return windows;
}
type BoundCronJobHorizon = RehearsalCronJobHorizons['windows'][number] & {
  basis: 'declared';
  selection: RehearsalCronJobHorizons['selection'];
  fromMs: number;
  toMs: number;
  controllerZone: ReturnType<typeof readCronTimeZone>;
};
/** Charging subset only: validated expression origin with an all-minute or positive divisor-of60 minute step.
 * Positive decimal steps retain the pinned optional plus and zero padding; original source remains provenance.
 * Shares Go whitespace with the syntax decoder; equivalent descriptor/mask/irregular source forms stay unsupported.
 */
export function readUtcCadence(schedule: CronSchedule) {
  // Proof: Task56 origin dependency corruption suppressed supported ticks; other-field/divisor removals admitted unsupported expressions; split substitution lost Go NEL cadence.
  if (schedule.kind !== 'fields' || schedule.origin !== 'expression') return undefined;
  const [minute, ...remaining] = readCronFields(schedule.source);
  if (remaining.some((field) => field !== '*')) return undefined;
  if (minute === '*') return 60000;
  // Proof: Task56 signed-step native RED observed zero against14 slots with this optional plus omitted.
  const step = /^\*\/(\+?[0-9]+)$/.exec(minute);
  if (step === null) return undefined;
  const divisor = Number(step[1]);
  return divisor > 0 && 60 % divisor === 0 ? 60000 * divisor : undefined;
}
/** Safe aggregate envelope precedes allocation; zero ticks admit any valid backoff without standalone B<=255. */
export function readCronJobEnvelope(
  horizon: BoundCronJobHorizon,
  periodMs: number,
  backoff: number,
) {
  // Proof: Task56 floor-to-ceil substitution lost boundary tick counts; retry multiplier removal lost full slots; 256 guard removal materialized257.
  // Proof: Task56 safe-integer dependency corruption suppressed supported14; this is distinct from guard removal and uses no hostile allocation.
  const ticks = Math.floor(horizon.toMs / periodMs) - Math.floor(horizon.fromMs / periodMs);
  const retries = backoff + 1;
  const slots = ticks * retries;
  // Ordered four-digit dates and positive cadence bound ticks; the int32 backoff bounds retries. Their product still requires a safe-integer check.
  if (!Number.isSafeInteger(slots) || slots > 256) return undefined;
  return { ticks, slots };
}
/** Preserve conditional Job policy plus source/controller knowledge and the independent whole-attempt obligations. */
export function deriveCronJobLifecycle(
  cron: ReturnType<typeof readCronJob>,
  entry: NativeView['entry'],
  horizon: BoundCronJobHorizon,
  periodMs: number,
  ticks: number,
  slots: number,
) {
  // Proof: Task56 Allow/suspend/history3/history1 substitutions lost default provenance; metadata-absence substitution fabricated child metadata.
  // Proof: Task56 fresh-condition/whole-attempt omission lost exact declared-window and per-Job prerequisite facts.
  const policy = cron.spec.concurrencyPolicy;
  return structuredClone({
    owner: horizon.owner,
    source: entry,
    hooks: entry.hooks,
    annotations: cron.metadata.annotations === undefined ? 'absent' : cron.metadata.annotations,
    annotationSource: entry.annotationSource,
    jobTemplateMetadata: cron.spec.jobTemplate.metadata ?? 'absent',
    jobTemplateSHA256: horizon.jobTemplateSHA256,
    templateSHA256: hash(JSON.stringify(cron.job.spec.template)),
    horizon,
    sourceTimeZone: cron.calendar.timeZone,
    effectiveTimeZone:
      cron.calendar.timeZone.kind === 'absent' ? horizon.controllerZone : cron.calendar.timeZone,
    schedule: cron.calendar.schedule.source,
    periodMs,
    nominalTicks: ticks,
    maximumPodSlots: slots,
    concurrencyPolicy:
      policy === ''
        ? { ...defaultFact(undefined, 'Allow'), declared: '' }
        : defaultFact(policy, 'Allow'),
    suspend: defaultFact(cron.spec.suspend, false),
    successfulJobsHistoryLimit: defaultFact(cron.spec.successfulJobsHistoryLimit, 3),
    failedJobsHistoryLimit: defaultFact(cron.spec.failedJobsHistoryLimit, 1),
    startingDeadlineSeconds: {
      declared: cron.spec.startingDeadlineSeconds ?? 'absent',
      reclamationDeadline: false as const,
    },
    jobPolicy: deriveJobPolicyFacts(cron.job),
    conditions: {
      freshCreation: 'fresh-CronJob-creation-after-fromExclusive',
      controllerClock: 'controller-clock-at-or-before-toInclusive-while-creation-remains-possible',
      stable: 'unchanged-source-calendar-timezone-controller-generation',
      identity: 'one-Job-UID-per-nominal-tick-with-all-per-Job-conditions',
      retention: 'full-failed-terminating-Pod-demand-no-Forbid-deadline-history-TTL-cleanup-credit',
      runtimeObserved: false as const,
    },
    wholeAttempt: {
      required: [
        'prior-and-missed-before-fromExclusive-Jobs',
        'manual-adopted-and-recreated-Job-generations',
        'Helm-Flux-generations',
        'retained-Pod-log-device-claim-writer-history',
        'actual-stop-and-window-enforcement',
      ],
      cleanupCredit: false as const,
      runtimeObserved: false as const,
    },
    runtimeObserved: false as const,
  });
}
/** Reuse actual Job retry expansion per nominal tick; logical coordinates never claim observed Job/Pod identities. */
export function expandCronJob(
  input: Parameters<typeof expandJob>[0],
  horizon: BoundCronJobHorizon,
  periodMs: number,
  ticks: number,
  backoff: number,
) {
  return Array.from({ length: ticks }, (_, tick) => {
    // Proof: Task56 nominal-time shift failed exact tick coordinates; full memory/CPU/disk and shared normalizer totals remain charged per retry.
    const nominalTime = new Date(
      (Math.floor(horizon.fromMs / periodMs) + tick + 1) * periodMs,
    ).toISOString();
    return expandJob({ ...input, identity: `${input.identity}/tick/${nominalTime}` }, backoff).map(
      (charge, retry) => ({
        ...charge,
        owner: input.identity,
        concurrency: {
          ...charge.concurrency,
          phase: 'immutable-source-cronjob-declared-horizon' as const,
          tick,
          retry,
          nominalTime,
        },
        cronJob: {
          owner: input.identity,
          jobTemplateSHA256: horizon.jobTemplateSHA256,
          horizon: structuredClone(horizon),
          tick,
          retry,
          nominalTime,
        },
      }),
    );
  }).flat();
}
