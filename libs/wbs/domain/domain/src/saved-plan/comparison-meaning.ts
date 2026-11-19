import type { ComparablePlanInput } from './comparison-input';
import {
  readSavedCanonicalStage,
  type SavedCanonicalStageV2,
  type SavedOptimizationStage,
  type SavedOptimizationVariant,
  type SavedPlacement,
} from './connected-schedule';
import type { SavedConnectedDependencyHistory, SavedDependencyHistory } from './dependency-history';
import type { PlanScheduleValue, PlanSideSchedule } from './diff-plans';
import {
  compareHistoryKeys,
  historicalSliceKey,
  SavedHistoryError,
  serializeHistory,
} from './history-json';
import {
  readSavedConnectedScheduleBody,
  type SavedConnectedScheduleBody,
} from './versioned-schedule';

/** Detached dependency values for comparison; captured SavedInputEvidence never receives these identities. */
export type DependencyMeaning =
  | { readonly kind: 'unrecorded' }
  | { readonly kind: 'recorded'; readonly history: SavedDependencyHistory };
/** Captured step-identity sites, with unordered namespaces canonicalized independently of timing/configuration. */
interface StageIdentity {
  readonly nodes: SavedCanonicalStageV2['nodes'];
  readonly slices: readonly {
    readonly workItemId: string;
    readonly steps: readonly (string | null)[];
  }[];
  readonly relationships: readonly Pick<
    SavedCanonicalStageV2['relationships'][number],
    'id' | 'predecessor' | 'successor'
  >[];
  readonly starts: readonly string[];
  readonly finishes: readonly string[];
}
type Question = Extract<SavedOptimizationVariant, { state: 'ready' }>['candidate']['question'];
/** Decoded question plus its original packet identity, used only to justify paired digest normalization. */
export type QuestionMeaning = Question & {
  readonly stage: SavedCanonicalStageV2;
  readonly capturedIdentity: StageIdentity;
  readonly hasResolvedIdentity: boolean;
};
/** The selected outcome stays distinct, including failed/pending/certificate states and complete decision evidence. */
export type VariantMeaning =
  | Exclude<SavedOptimizationVariant, { state: 'ready' | 'boundary-infeasible' }>
  | (Omit<Extract<SavedOptimizationVariant, { state: 'ready' }>, 'candidate'> & {
      readonly candidate: {
        readonly question: QuestionMeaning;
        readonly starts: readonly (readonly [string, number])[];
      };
    })
  | (Omit<Extract<SavedOptimizationVariant, { state: 'boundary-infeasible' }>, 'certificate'> & {
      readonly certificate: Omit<
        Extract<SavedOptimizationVariant, { state: 'boundary-infeasible' }>['certificate'],
        'question'
      > & { readonly question: QuestionMeaning };
    });
/** Stage execution/configuration and its decoded value, never a replacement frozen wire packet. */
export type StageMeaning = Omit<SavedOptimizationStage, 'variants'> & {
  readonly stage: SavedCanonicalStageV2;
  readonly capturedIdentity: StageIdentity;
  readonly hasResolvedIdentity: boolean;
  readonly variants: { readonly pri: VariantMeaning; readonly time: VariantMeaning } | null;
};
export type ConnectedScheduleMeaning = Omit<SavedConnectedScheduleBody, 'connection'> & {
  readonly connection: Omit<SavedConnectedScheduleBody['connection'], 'stages'> & {
    readonly stages: readonly StageMeaning[];
  };
};
/** A comparison-only schedule; the connected arm cannot be passed to the frozen wire reader. */
export type ScheduleMeaning =
  | { readonly kind: 'plain'; readonly value: PlanSideSchedule }
  | {
      readonly kind: 'connected';
      readonly algorithmId: string;
      readonly body: ConnectedScheduleMeaning;
    };
/** Every side declares whether its values are captured or explicitly step-resolved. */
export type PlanComparison =
  | { readonly kind: 'captured' }
  | {
      readonly kind: 'step-resolved';
      readonly input: ComparablePlanInput;
      readonly dependencies: DependencyMeaning;
      readonly schedule: ScheduleMeaning;
    };

/** Map one declared namespace without silently merging independent facts. */
export function requireDistinctMeaning<T>(
  rows: readonly T[],
  key: (row: T) => string,
  path: string,
): readonly T[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const id = key(row);
    if (seen.has(id)) throw new SavedHistoryError('step_identity_collision', path);
    seen.add(id);
  }
  return rows;
}

/**
 * Sort only declared identity-keyed sets; workflow step order and stage execution are untouched.
 * Proof: the pre-sort projection failed the empty-diff assertions in
 * `step-resolved connected input canonicalizes identity-keyed sets while preserving workflow and stage order`
 * and `step-resolved connected schedule canonicalizes identity-keyed sets while preserving workflow and stage order`.
 * Their workflow and A/B stage-order controls had passed; raw-preservation tails were unreached.
 */
function sortMeaningByKey<T>(rows: readonly T[], key: (row: T) => string): readonly T[] {
  return [...rows].sort((left, right) => compareHistoryKeys(key(left), key(right)));
}
/** The canonical stage encoder's explicit record ordering; graph positions remain compared values. */
function readStageNodeOrder(node: SavedCanonicalStageV2['nodes'][number]): string {
  return JSON.stringify(
    node.kind === 'step'
      ? { kind: node.kind, workItemId: node.workItemId, stepId: node.stepId, at: node.at }
      : { kind: node.kind, workItemId: node.workItemId, at: node.at },
  );
}
/** Compare actual typed identities, not digest strings, raw whitespace or unrelated packet facts. */
function readStageIdentity(stage: SavedCanonicalStageV2): StageIdentity {
  return {
    nodes: sortMeaningByKey(stage.nodes, readStageNodeOrder),
    slices: sortMeaningByKey(
      stage.slices.map((row) => ({
        workItemId: row.workItemId,
        steps: row.steps.map((step) => step.stepId),
      })),
      (row) => row.workItemId,
    ),
    relationships: sortMeaningByKey(
      stage.relationships.map((relationship) => ({
        id: relationship.id,
        predecessor: relationship.predecessor,
        successor: relationship.successor,
      })),
      (relationship) => relationship.id,
    ),
    starts: [...stage.starts.map(([id]) => id)].sort(compareHistoryKeys),
    finishes: [...stage.finishes.map(([id]) => id)].sort(compareHistoryKeys),
  };
}

/** Resolve only typed graph/readiness/endpoints; labels, positions and relationship identities stay captured. */
export function projectDependencyMeaning(
  history: SavedDependencyHistory,
  resolve: (id: string) => string,
): SavedDependencyHistory {
  if (history.kind === 'local') return history;
  const projectGraphNode = (node: SavedConnectedDependencyHistory['graph']['nodes'][number]) =>
    node.kind === 'boundary'
      ? node
      : { ...node, ref: { ...node.ref, stepId: resolve(node.ref.stepId) } };
  const keys = new Map<string, string>(),
    nodeIds = new Map<string, string>();
  for (const node of history.graph.nodes) {
    if (node.kind === 'boundary')
      keys.set(
        historicalSliceKey(node.workItemId, null),
        historicalSliceKey(node.workItemId, null),
      );
    else {
      keys.set(
        historicalSliceKey(node.ref.workItemId, node.ref.stepId),
        historicalSliceKey(node.ref.workItemId, resolve(node.ref.stepId)),
      );
      nodeIds.set(
        `sn1.${node.ref.workItemId}.${node.ref.stepId}`,
        `sn1.${node.ref.workItemId}.${resolve(node.ref.stepId)}`,
      );
    }
  }
  const readRetainedIdentity = (map: ReadonlyMap<string, string>, id: string): string => {
    const translated = map.get(id);
    if (translated === undefined)
      throw new SavedHistoryError('step_identity_reference', '$.dependencyHistory');
    return translated;
  };
  const projectEndpoint = (
    end: SavedConnectedDependencyHistory['relationships'][number]['predecessor'],
  ) =>
    end.scope === 'whole'
      ? end
      : {
          ...end,
          stepId: resolve(end.stepId),
          step: { ...end.step, id: resolve(end.step.id) },
          stepNodeId:
            end.stepNodeId === null ? null : `sn1.${end.workItemId}.${resolve(end.stepId)}`,
        };
  const readiness = history.readiness.map((reading) => {
    const eligibility = {
      ...reading.eligibility,
      startBlockers: reading.eligibility.startBlockers.map((blocker) => ({
        ...blocker,
        predecessor: projectGraphNode(blocker.predecessor),
      })),
      finishBlockers: reading.eligibility.finishBlockers.map((blocker) => ({
        ...blocker,
        predecessor: projectGraphNode(blocker.predecessor),
      })),
    };
    return reading.kind === 'boundary'
      ? { ...reading, key: readRetainedIdentity(keys, reading.key), eligibility }
      : {
          ...reading,
          key: readRetainedIdentity(keys, reading.key),
          stepId: resolve(reading.stepId),
          eligibility,
          causes: reading.causes.map((cause) =>
            cause.kind === 'work-item'
              ? cause
              : { ...cause, nodeId: readRetainedIdentity(nodeIds, cause.nodeId) },
          ),
        };
  });
  return {
    ...history,
    workPackages: history.workPackages.map((member) => ({
      ...member,
      steps: requireDistinctMeaning(
        member.steps.map((step) => ({ ...step, id: resolve(step.id) })),
        (step) => step.id,
        '$.dependencyHistory.workPackages.steps',
      ),
    })),
    relationships: history.relationships.map((relationship) => ({
      ...relationship,
      predecessor: projectEndpoint(relationship.predecessor),
      successor: projectEndpoint(relationship.successor),
    })),
    graph: {
      ...history.graph,
      nodes: sortMeaningByKey(
        requireDistinctMeaning(
          history.graph.nodes.map(projectGraphNode),
          (node) =>
            node.kind === 'boundary'
              ? historicalSliceKey(node.workItemId, null)
              : historicalSliceKey(node.ref.workItemId, node.ref.stepId),
          '$.dependencyHistory.graph.nodes',
        ),
        (node) =>
          node.kind === 'boundary'
            ? historicalSliceKey(node.workItemId, null)
            : historicalSliceKey(node.ref.workItemId, node.ref.stepId),
      ),
    },
    readiness: sortMeaningByKey(
      requireDistinctMeaning(readiness, (reading) => reading.key, '$.dependencyHistory.readiness'),
      (reading) => reading.key,
    ),
  };
}

/** Re-key actual slices and known predecessor references without splitting opaque keys. */
export function projectMeaningSlices<
  Slice extends {
    readonly workItemId: string;
    readonly stepId: string | null;
    readonly resourcePredecessorId: string | null;
    readonly capacityPredecessorIds: readonly string[];
  },
>(
  slices: Readonly<Record<string, Slice>>,
  resolve: (id: string) => string,
): Readonly<Record<string, Slice>> {
  const keys = new Map<string, string>();
  const entries = Object.entries(slices);
  for (const [key, slice] of entries) {
    const stepId = slice.stepId === null ? null : resolve(slice.stepId);
    if (stepId !== slice.stepId && key !== historicalSliceKey(slice.workItemId, slice.stepId))
      throw new SavedHistoryError('step_identity_slice_key', '$.schedule.slices');
    keys.set(key, stepId === slice.stepId ? key : historicalSliceKey(slice.workItemId, stepId));
  }
  requireDistinctMeaning([...keys.values()], (id) => id, '$.schedule.slices');
  return Object.fromEntries(
    entries.map(([key, slice]) => {
      const translated = keys.get(key);
      if (translated === undefined) throw new Error('historical slice key was not retained');
      return [
        translated,
        {
          ...slice,
          stepId: slice.stepId === null ? null : resolve(slice.stepId),
          resourcePredecessorId:
            slice.resourcePredecessorId === null
              ? null
              : (keys.get(slice.resourcePredecessorId) ?? slice.resourcePredecessorId),
          capacityPredecessorIds: slice.capacityPredecessorIds.map((id) => keys.get(id) ?? id),
        },
      ];
    }),
  );
}
/** Placements retain every timing/score field; only declared slice identity changes. */
function projectPlacement<Placement extends SavedPlacement>(
  placement: Placement,
  resolve: (id: string) => string,
): Placement {
  return { ...placement, slices: projectMeaningSlices(placement.slices, resolve) };
}
/** Translate actual stage nodes/selectors and keys; graph leaf IDs and positional edge endpoints do not change. */
function projectStage(
  stage: SavedCanonicalStageV2,
  resolve: (id: string) => string,
): SavedCanonicalStageV2 {
  const keys = new Map<string, string>();
  for (const node of stage.nodes) {
    const workItemId = node.workItemId,
      stepId = node.kind === 'boundary' ? null : node.stepId;
    keys.set(
      historicalSliceKey(workItemId, stepId),
      historicalSliceKey(workItemId, stepId === null ? null : resolve(stepId)),
    );
  }
  const projectKeyedNumbers = (entries: readonly (readonly [string, number])[]) =>
    sortMeaningByKey(
      requireDistinctMeaning(
        entries.map(([id, value]) => {
          const translated = keys.get(id);
          if (translated === undefined)
            throw new SavedHistoryError('step_identity_reference', '$.schedule.stage');
          return [translated, value] as const;
        }),
        ([id]) => id,
        '$.schedule.stage.keys',
      ),
      ([id]) => id,
    );
  const projectSelector = (
    selected: SavedCanonicalStageV2['relationships'][number]['predecessor'],
  ): SavedCanonicalStageV2['relationships'][number]['predecessor'] =>
    selected[1] === 'whole'
      ? selected
      : [selected[0], selected[1], selected[2], resolve(selected[3])];
  return {
    ...stage,
    slices: stage.slices.map((row) => ({
      ...row,
      steps: requireDistinctMeaning(
        row.steps.map((step) => ({
          ...step,
          stepId: step.stepId === null ? null : resolve(step.stepId),
        })),
        (step) => JSON.stringify(step.stepId),
        '$.schedule.stage.slices',
      ),
    })),
    nodes: sortMeaningByKey(
      requireDistinctMeaning(
        stage.nodes.map((node) =>
          node.kind === 'boundary' ? node : { ...node, stepId: resolve(node.stepId) },
        ),
        (node) =>
          historicalSliceKey(node.workItemId, node.kind === 'boundary' ? null : node.stepId),
        '$.schedule.stage.nodes',
      ),
      readStageNodeOrder,
    ),
    relationships: stage.relationships.map((relationship) => ({
      ...relationship,
      predecessor: projectSelector(relationship.predecessor),
      successor: projectSelector(relationship.successor),
    })),
    starts: projectKeyedNumbers(stage.starts),
    finishes: projectKeyedNumbers(stage.finishes),
  };
}
/** Decode captured packets before resolution; the resulting object is never serialized as a saved body. */
export function readScheduleMeaning(
  schedule: PlanSideSchedule,
  resolve: (id: string) => string,
): ScheduleMeaning {
  if (!schedule.present) return { kind: 'plain', value: schedule };
  const raw = schedule.body;
  if (!(typeof raw === 'object' && raw !== null && !Array.isArray(raw)))
    throw new SavedHistoryError('comparison_shape', '$.schedule.body');
  if (!('version' in raw && (raw['version'] === 3 || raw['version'] === 4)))
    throw new SavedHistoryError('comparison_version', '$.schedule.body.version');
  if (raw['version'] === 3) return { kind: 'plain', value: schedule };
  const body = readSavedConnectedScheduleBody(raw);
  const stages = body.connection.stages.map((stage) => {
    const captured = readSavedCanonicalStage(stage.format, stage.stageBytes),
      projected = projectStage(captured, resolve);
    const keyMap = new Map(
      captured.nodes.map((node) => [
        historicalSliceKey(node.workItemId, node.kind === 'boundary' ? null : node.stepId),
        historicalSliceKey(node.workItemId, node.kind === 'boundary' ? null : resolve(node.stepId)),
      ]),
    );
    const projectQuestion = (capturedQuestion: Question): QuestionMeaning => {
      const packet = readSavedCanonicalStage(stage.format, capturedQuestion.stageBytes),
        resolved = projectStage(packet, resolve);
      return {
        ...capturedQuestion,
        stage: resolved,
        capturedIdentity: readStageIdentity(packet),
        hasResolvedIdentity:
          serializeHistory(readStageIdentity(packet)) !==
          serializeHistory(readStageIdentity(resolved)),
      };
    };
    const projectVariant = (capturedVariant: SavedOptimizationVariant): VariantMeaning => {
      if (capturedVariant.state === 'ready')
        return {
          ...capturedVariant,
          candidate: {
            ...capturedVariant.candidate,
            question: projectQuestion(capturedVariant.candidate.question),
            starts: sortMeaningByKey(
              requireDistinctMeaning(
                capturedVariant.candidate.starts.map(([id, at]) => {
                  const translated = keyMap.get(id);
                  if (translated === undefined)
                    throw new SavedHistoryError(
                      'step_identity_reference',
                      '$.schedule.candidate.starts',
                    );
                  return [translated, at] as const;
                }),
                ([id]) => id,
                '$.schedule.candidate.starts',
              ),
              ([id]) => id,
            ),
          },
          decision: {
            ...capturedVariant.decision,
            schedule: projectPlacement(capturedVariant.decision.schedule, resolve),
            baseline: projectPlacement(capturedVariant.decision.baseline, resolve),
          },
        };
      if (capturedVariant.state === 'boundary-infeasible')
        return {
          ...capturedVariant,
          certificate: {
            ...capturedVariant.certificate,
            question: projectQuestion(capturedVariant.certificate.question),
          },
        };
      return capturedVariant;
    };
    return {
      ...stage,
      stage: projected,
      capturedIdentity: readStageIdentity(captured),
      hasResolvedIdentity:
        serializeHistory(readStageIdentity(captured)) !==
        serializeHistory(readStageIdentity(projected)),
      variants:
        stage.variants === null
          ? null
          : { pri: projectVariant(stage.variants.pri), time: projectVariant(stage.variants.time) },
    };
  });
  return {
    kind: 'connected',
    algorithmId: schedule.algorithmId,
    body: {
      ...body,
      slices: projectMeaningSlices(body.slices, resolve),
      connection: {
        ...body.connection,
        baseline: projectPlacement(body.connection.baseline, resolve),
        composite: projectPlacement(body.connection.composite, resolve),
        stages,
      },
    },
  };
}
/** Render a detached comparison value, retaining captured digest fields until the paired policy explicitly resolves them. */
export function renderScheduleMeaning(meaning: ScheduleMeaning): PlanSideSchedule {
  if (meaning.kind === 'plain') return meaning.value;
  const projectQuestion = (selected: QuestionMeaning) => {
    const { stage, capturedIdentity, hasResolvedIdentity, ...captured } = selected;
    return { ...captured, stageBytes: stage };
  };
  const projectVariant = (selected: VariantMeaning) => {
    if (selected.state === 'ready')
      return {
        ...selected,
        candidate: {
          ...selected.candidate,
          question: projectQuestion(selected.candidate.question),
        },
      };
    if (selected.state === 'boundary-infeasible')
      return {
        ...selected,
        certificate: {
          ...selected.certificate,
          question: projectQuestion(selected.certificate.question),
        },
      };
    return selected;
  };
  const body = {
    ...meaning.body,
    connection: {
      ...meaning.body.connection,
      stages: meaning.body.connection.stages.map((selected) => {
        const { stage, capturedIdentity, hasResolvedIdentity, variants, ...captured } = selected;
        return {
          ...captured,
          stageBytes: stage,
          variants:
            variants === null
              ? null
              : { pri: projectVariant(variants.pri), time: projectVariant(variants.time) },
        };
      }),
    },
  };
  // Boundary: strict wire readers validated the complete finite JSON and only typed comparison identity fields changed.
  return {
    present: true,
    algorithmId: meaning.algorithmId,
    body: body as unknown as PlanScheduleValue,
  };
}
