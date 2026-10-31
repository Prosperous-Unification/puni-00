import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';

export const routeChecks = [
  'admission',
  'flux',
  'effective-pods-storage-network',
  'stored-logs',
  'stored-metrics',
  'stored-traces',
  'operator-views',
  'valid-invalid-auth',
  'cross-instance-isolation',
  'alerts',
  'process-recovery',
  'outage-loss-recovery',
  'retained-history',
  'backup-restore',
  'two-freshness-windows',
] as const;
const digest = /^[a-f0-9]{64}$/;
const revision = /^[a-f0-9]{40}$/;
export const RouteBinding = type({
  '+': 'reject',
  environment: "'dev'",
  sourceRevision: revision,
  candidateRevision: revision,
  observedRevision: revision,
  adapterRevision: revision,
  artifactSHA256: digest,
  target: digest,
  source: digest,
  stores: digest,
  routes: digest,
});
export const EvidenceReference = type({ '+': 'reject', path: 'string>0', sha256: digest });
const Check = type({
  '+': 'reject',
  check: 'string',
  capture: EvidenceReference,
  projection: EvidenceReference,
});
const Member = type({
  '+': 'reject',
  binding: RouteBinding,
  startedAt: 'number',
  completedAt: 'number',
  checks: Check.array(),
  windows: type({
    '+': 'reject',
    observationId: 'string>0',
    observedAt: 'number',
    capture: EvidenceReference,
  }).array(),
});
const Cohort = type({
  '+': 'reject',
  version: '1',
  kind: "'reviewed-observability-acceptance'",
  rehearsal: Member,
  staged: Member,
});
export type RouteBinding = typeof RouteBinding.infer;
export type EvidenceReference = typeof EvidenceReference.infer;
export type RouteAcceptance = typeof Cohort.infer;
export interface AcceptanceExpectation {
  rehearsal: RouteBinding;
  staged: RouteBinding;
  maxAgeMs: number;
  freshnessWindowMs: number;
}
/** Operator-reviewed evidence only. Exact independently supplied bindings, complete check closure and
 * actual advancing observation windows are required; this parser cannot establish honest operator review.
 */
export function readRouteAcceptance(
  wire: unknown,
  expected: AcceptanceExpectation,
  now: number,
): RouteAcceptance {
  // Proof: Task79 fault 01 bypassed cohort-parser; 'refuses source-only' failed; bytes restored.
  const cohort = Cohort(wire);
  if (cohort instanceof type.errors) throw new Error('route-acceptance-format');
  if (
    !Number.isFinite(now) ||
    !Number.isSafeInteger(expected.maxAgeMs) ||
    expected.maxAgeMs <= 0 ||
    expected.maxAgeMs > 86400000 ||
    !Number.isSafeInteger(expected.freshnessWindowMs) ||
    expected.freshnessWindowMs < 30000 ||
    expected.freshnessWindowMs > 120000 ||
    cohort.rehearsal.binding.target === cohort.staged.binding.target
  )
    // Proof: Task79 fault 02 bypassed cohort-bounds; 'refuses same-target' failed; bytes restored.
    throw new Error('route-acceptance-bounds');
  for (const role of ['rehearsal', 'staged'] as const) {
    const member = cohort[role];
    // Proof: Task79 fault 03 bypassed cohort-binding; 'refuses wrong-target' failed; bytes restored.
    if (!isDeepStrictEqual(member.binding, expected[role]))
      throw new Error('route-acceptance-binding');
    if (
      ![member.startedAt, member.completedAt].every(Number.isFinite) ||
      member.startedAt < 0 ||
      member.startedAt > member.completedAt ||
      member.completedAt > now ||
      now - member.completedAt > expected.maxAgeMs ||
      member.checks.length !== routeChecks.length ||
      new Set(member.checks.map((check) => check.check)).size !== routeChecks.length ||
      member.checks.some((check) => !routeChecks.some((known) => known === check.check))
    )
      // Proof: Task79 fault 04 bypassed cohort-closure; 'refuses missing-check' failed; bytes restored.
      throw new Error('route-acceptance-closure');
    const windows = member.windows;
    if (
      windows.length !== 2 ||
      windows[0].observationId === windows[1].observationId ||
      windows[0].capture.sha256 === windows[1].capture.sha256 ||
      windows.some(
        (window) =>
          !Number.isFinite(window.observedAt) ||
          window.observedAt < member.startedAt ||
          window.observedAt > member.completedAt,
      ) ||
      windows[1].observedAt - windows[0].observedAt < expected.freshnessWindowMs
    )
      // Proof: Task79 fault 05 bypassed cohort-windows; 'refuses same-window' failed; bytes restored.
      throw new Error('route-acceptance-windows');
  }
  return structuredClone(cohort);
}
export type RouteKind = 'switch' | 'rollback' | 'restore';
export interface RouteParent {
  operationId: string;
  kind: RouteKind;
  before: string;
  after: string;
  phase: 'completed' | 'uncertain';
}
/** Reverse exactly the captured transition; a restore follows a completed rollback, never stale success. */
export function assertRouteTransition(
  kind: RouteKind,
  before: string,
  after: string,
  parent?: RouteParent,
): void {
  // Proof: Task79 fault 06 bypassed transition; 'rollback and restore require' failed; bytes restored.
  if (!digest.test(before) || !digest.test(after) || before === after)
    throw new Error('route-transition');
  if (kind === 'switch') {
    // Proof: Task79 fault 07 bypassed parent-transition; 'rollback and restore require' failed; bytes restored.
    if (parent !== undefined) throw new Error('route-parent');
    return;
  }
  if (
    parent?.phase !== 'completed' ||
    parent.before !== after ||
    parent.after !== before ||
    // Proof: Task79 fault 07 bypassed parent-transition; 'rollback and restore require' failed; bytes restored.
    (kind === 'restore' ? parent.kind !== 'rollback' : parent.kind === 'rollback')
  )
    throw new Error('route-parent');
}
