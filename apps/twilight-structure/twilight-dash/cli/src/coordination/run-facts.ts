import { parseOrThrow, type } from '@shared/validation';
import { formatStepNodeId, type StepNodeRef, type StepState } from '@wbs/domain';

import type { RunSnapshot } from '../runs/records';
import type { prepareCoordination } from './topology';

/** Internal projection of complete validated WBS reads, never local outcomes or receipts.
 * Callers supply the run's leaf identity, complete current step catalog, all current progress
 * statements and advisory eligibility. An absent progress statement is unfinished work.
 * This is neither a wire response nor remote claim/write authority.
 */
export interface WbsCoordinationFacts {
  readonly projectId: string;
  readonly workItemId: string;
  readonly steps: readonly { readonly id: string; readonly position: number }[];
  readonly progress: readonly { readonly stepId: string; readonly state: StepState }[];
  readonly eligibleStepIds: readonly string[];
}
export type CoordinationDag = ReturnType<typeof prepareCoordination>;

const Facts = type({
  projectId: 'string > 0',
  workItemId: 'string > 0',
  steps: type({ id: 'string > 0', position: 'number' }).array(),
  progress: type({ stepId: 'string > 0', state: '"in_progress" | "done"' }).array(),
  eligibleStepIds: 'string[]',
});
const StepNode = type({ workItemId: 'string > 0', stepId: 'string > 0' });

/** Captures opaque CTT vertex content before the first await; never reinterprets mutable data. */
export function captureActivities(dag: CoordinationDag): ReadonlyMap<string, StepNodeRef> {
  const activities = new Map<string, StepNodeRef>();
  // Proof: bypassing omission rejection exposed an executable first ticket in
  // `omitted native prerequisites cannot satisfy undeclared WBS activity work`.
  if (
    dag.definition.omittedIds.length !== 0 ||
    dag.definition.vertices.some((vertex) =>
      vertex.slots.some((slot) => slot.kind === 'omitted'),
    ) ||
    (dag.definition.entry.kind === 'roots' &&
      dag.definition.entry.slots.some((slot) => slot.kind === 'omitted'))
  )
    throw new Error('coordination topology contains omitted activities');
  for (const vertex of dag.definition.vertices) {
    // Proof: retaining caller data by reference borrowed another step's eligibility
    // across the initial WBS barrier in `shallow caller mutation cannot borrow`.
    const node = parseOrThrow(StepNode, structuredClone(vertex.data));
    // Proof: bypassing identity matching exposed two tickets for duplicate step
    // mappings in `complete activity mappings reject missing duplicate omitted and foreign vertices`.
    if (vertex.vertexId !== formatStepNodeId(node) || activities.has(vertex.vertexId))
      throw new Error('coordination activity identity differs');
    activities.set(vertex.vertexId, node);
  }
  return activities;
}

/** Throws on inconsistent trusted reads/history; preserves original occurrence IDs by refusal. */
export function readCoordinationFacts(
  input: WbsCoordinationFacts,
  snapshot: RunSnapshot,
  activities: ReadonlyMap<string, StepNodeRef>,
) {
  // Proof: bypassing this schema exposed a ready ticket from an unknown progress
  // state in `malformed WBS progress cannot become an executable unfinished step`.
  const facts = parseOrThrow(Facts, structuredClone(input));
  // Proof: bypassing scope matching exposed a ticket in `inconsistent project scope`.
  if (facts.projectId !== snapshot.run.projectId || facts.workItemId !== snapshot.run.workItemId)
    throw new Error('coordination WBS scope differs');
  const steps = new Set(facts.steps.map((step) => step.id));
  // Proof: bypassing complete membership exposed a ticket from a missing activity
  // mapping in `complete activity mappings reject missing duplicate omitted and foreign vertices`.
  if (
    steps.size !== facts.steps.length ||
    steps.size !== activities.size ||
    [...activities.values()].some(
      (node) => node.workItemId !== facts.workItemId || !steps.has(node.stepId),
    )
  )
    throw new Error('coordination rebuild required: complete step catalog differs');
  const progress = new Set<string>();
  const completed = new Set<string>();
  for (const statement of facts.progress) {
    // Proof: bypassing membership/uniqueness exposed executable tickets in the
    // independent `inconsistent duplicate progress` and `inconsistent foreign progress` cases.
    if (!steps.has(statement.stepId) || progress.has(statement.stepId))
      throw new Error('coordination progress catalog differs');
    progress.add(statement.stepId);
    // Proof: accepting every statement released the successor in `in-progress WBS
    // statements never seed accepted completion`.
    if (statement.state === 'done')
      completed.add(formatStepNodeId({ workItemId: facts.workItemId, stepId: statement.stepId }));
  }
  const eligible = new Set(facts.eligibleStepIds);
  // Proof: bypassing this check exposed executable tickets in the duplicate and
  // foreign eligibility cases of `inconsistent ... never exposes executable tickets`.
  if (
    eligible.size !== facts.eligibleStepIds.length ||
    [...eligible].some((stepId) => !steps.has(stepId))
  )
    throw new Error('coordination eligibility catalog differs');
  // Proof: bypassing history identity exposed a ready ticket over an arbitrary
  // retained occurrence in `reconstruction excludes unfinished attempts`.
  if (
    snapshot.attempts.some(
      (attempt) =>
        attempt.identity.runId !== snapshot.run.runId ||
        !activities.has(attempt.identity.occurrenceId),
    )
  )
    throw new Error('coordination retained occurrence differs from topology');
  const catalog = JSON.stringify(
    [...facts.steps]
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
      .map((step) => [step.id, step.position]),
  );
  return { completed, eligible, catalog };
}
