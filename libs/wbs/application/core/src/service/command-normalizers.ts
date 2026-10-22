import type { commandDefinitions, PlanCommandKind } from '@wbs/contracts';
import { EstimateTrio } from '@wbs/domain';
import { parseOrThrow } from '@wbs/validation';

import { capacityOf } from '../http/capacity-body';
import { ladderOf } from '../http/priority-ladder-body';
import {
  asIdOrNull,
  asMeasureKey,
  asMeasureKind,
  asMeasureScale,
  asMeasureUnit,
  asOptionalCurrency,
  asOptionalFlag,
  asOptionalId,
  asOptionalIds,
  asOptionalInstant,
  asOptionalMeasureOrder,
  asOptionalPriority,
  asOptionalResourceUnits,
  asOptionalRunId,
  asOptionalStepIds,
  asOptionalText,
  asOptionalTypeIds,
  asResourceKind,
  assertRecord,
  asText,
  asUnitLabel,
  type CommandInput,
  CommandNormalizationError,
  MOST_SERVICES_ON_ONE_ITEM,
  MOST_TAGS_ON_ONE_ITEM,
  MOST_TEAMS_ON_ONE_ITEM,
  normalizedRef,
  normalizedTarget,
  normalizeNamed,
  normalizeStepAddress,
  normalizeTypedEndpoint,
  parseActual,
  parseAttemptNumber,
  parseFactStart,
  parseMeasure,
  parseOn,
  parseOutcome,
  parsePatch,
  parseProgress,
  parseStatus,
  present,
  ref,
  refuseDerivedFields,
  resourceUnitsOf,
  stepAllowanceOf,
  target,
} from './command-fields';

export {
  CommandNormalizationError,
  MOST_CHARACTERS_IN_A_REF_NAME,
  MOST_REFS_ON_ONE_ITEM,
  MOST_SERVICES_ON_ONE_ITEM,
  MOST_TAGS_ON_ONE_ITEM,
  MOST_TEAMS_ON_ONE_ITEM,
  MOST_TYPES_ON_ONE_ITEM,
} from './command-fields';

interface StructuralCommandDefinition {
  readonly schema: { readonly infer: { readonly kind: string } };
}

/** One discriminator-preserving semantic normalizer for every structural definition. */
export type CommandNormalizerRecord<
  Definitions extends Record<string, StructuralCommandDefinition>,
> = {
  readonly [Kind in keyof Definitions & string]: (raw: Definitions[Kind]['schema']['infer']) => {
    readonly kind: Kind;
  };
};

/**
 * Pure semantic normalization for every structural command kind. Each return
 * retains its literal discriminator so {@link PlanCommand} can be inferred from this record.
 * Proof: adding `temporaryCommand` to the structural definitions without an entry here failed
 * core typecheck with TS2741 at this record.
 */
export const commandNormalizers = {
  createWorkItem(raw: CommandInput<'createWorkItem'>) {
    refuseDerivedFields(raw);
    const parentId = asIdOrNull(raw.parentId, 'parentId');
    const afterId = asIdOrNull(raw.afterId, 'afterId');
    const name = asOptionalText(raw.name, 'name');
    const notes = asOptionalText(raw.notes, 'notes');
    const priority = asOptionalPriority(raw.priority, 'priority');
    return present({
      kind: 'createWorkItem' as const,
      ...ref(raw),
      parentId,
      parentRef: asOptionalId(raw.parentRef, 'parentRef'),
      afterId,
      afterRef: asOptionalId(raw.afterRef, 'afterRef'),
      name,
      notes,
      // Absent stays absent for the service's middle rung; explicit null stays unprioritised.
      priority,
    });
  },
  patchWorkItem(raw: CommandInput<'patchWorkItem'>) {
    const patchRaw = raw.patch;
    assertRecord(patchRaw);
    return {
      kind: 'patchWorkItem' as const,
      ...target(raw),
      patch: present({
        ...parsePatch(patchRaw),
        serviceRefs: asOptionalIds(patchRaw.serviceRefs, 'serviceRefs', MOST_SERVICES_ON_ONE_ITEM),
        tagRefs: asOptionalIds(patchRaw.tagRefs, 'tagRefs', MOST_TAGS_ON_ONE_ITEM),
        typeRefs: asOptionalTypeIds(patchRaw.typeRefs, 'typeRefs'),
        teamRefs: asOptionalIds(patchRaw.teamRefs, 'teamRefs', MOST_TEAMS_ON_ONE_ITEM),
      }),
    };
  },
  moveWorkItem(raw: CommandInput<'moveWorkItem'>) {
    const parentId = asIdOrNull(raw.parentId, 'parentId');
    const afterId = asIdOrNull(raw.afterId, 'afterId');
    return present({
      kind: 'moveWorkItem' as const,
      ...target(raw),
      parentId,
      parentRef: asOptionalId(raw.parentRef, 'parentRef'),
      afterId,
      afterRef: asOptionalId(raw.afterRef, 'afterRef'),
    });
  },
  duplicateWorkItem: (raw: CommandInput<'duplicateWorkItem'>) => ({
    kind: 'duplicateWorkItem' as const,
    ...target(raw),
    ...ref(raw),
  }),
  deleteWorkItem(raw: CommandInput<'deleteWorkItem'>) {
    const candidate: unknown = raw.strategy;
    if (candidate !== undefined && candidate !== 'cascade' && candidate !== 'promote') {
      throw new CommandNormalizationError('unknown_strategy');
    }
    const strategy: 'cascade' | 'promote' | undefined = candidate;
    return present({ kind: 'deleteWorkItem' as const, ...target(raw), strategy });
  },
  setEstimate: (raw: CommandInput<'setEstimate'>) => ({
    kind: 'setEstimate' as const,
    ...normalizeStepAddress(raw),
    days: parseOrThrow(EstimateTrio, raw.days),
  }),
  clearEstimate: (raw: CommandInput<'clearEstimate'>) => ({
    kind: 'clearEstimate' as const,
    ...normalizeStepAddress(raw),
  }),
  setActual: (raw: CommandInput<'setActual'>) => ({
    kind: 'setActual' as const,
    ...normalizeStepAddress(raw),
    days: parseActual(raw),
  }),
  clearActual: (raw: CommandInput<'clearActual'>) => ({
    kind: 'clearActual' as const,
    ...normalizeStepAddress(raw),
  }),
  setProgress: (raw: CommandInput<'setProgress'>) => ({
    kind: 'setProgress' as const,
    ...normalizeStepAddress(raw),
    state: parseProgress(raw),
  }),
  setStepBlocked: (raw: CommandInput<'setStepBlocked'>) => {
    // Proof: removing flag check accepted missing/nonboolean intent in the normalizer negative; watched 2026-10-14.
    if (typeof raw.isBlocked !== 'boolean')
      throw new CommandNormalizationError('isBlocked_must_be_true_or_false');
    return {
      kind: 'setStepBlocked' as const,
      ...normalizeStepAddress(raw),
      isBlocked: raw.isBlocked,
    };
  },
  clearProgress: (raw: CommandInput<'clearProgress'>) => ({
    kind: 'clearProgress' as const,
    ...normalizeStepAddress(raw),
  }),
  startAttempt: (raw: CommandInput<'startAttempt'>) =>
    present({
      kind: 'startAttempt' as const,
      ...normalizeStepAddress(raw),
      at: asOptionalInstant(raw.at),
      executorPersonId: asOptionalId(raw.executorPersonId, 'executorPersonId'),
      reference: asOptionalText(raw.reference, 'reference'),
      note: asOptionalText(raw.note, 'note'),
    }),
  endAttempt: (raw: CommandInput<'endAttempt'>) =>
    present({
      kind: 'endAttempt' as const,
      ...normalizeStepAddress(raw),
      outcome: parseOutcome(raw),
      at: asOptionalInstant(raw.at),
      reference: asOptionalText(raw.reference, 'reference'),
      note: asOptionalText(raw.note, 'note'),
    }),
  removeAttempt: (raw: CommandInput<'removeAttempt'>) => ({
    kind: 'removeAttempt' as const,
    ...normalizeStepAddress(raw),
    attemptNumber: parseAttemptNumber(raw),
  }),
  setStatus: (raw: CommandInput<'setStatus'>) =>
    present({
      kind: 'setStatus' as const,
      ...target(raw),
      status: parseStatus(raw),
      on: parseOn(raw),
      factStart: parseFactStart(raw),
    }),
  setMeasure: (raw: CommandInput<'setMeasure'>) => ({
    kind: 'setMeasure' as const,
    ...normalizeStepAddress(raw),
    metric: asText(raw.metric, 'metric'),
    value: parseMeasure(raw),
  }),
  clearMeasure: (raw: CommandInput<'clearMeasure'>) => ({
    kind: 'clearMeasure' as const,
    ...normalizeStepAddress(raw),
    metric: asText(raw.metric, 'metric'),
  }),
  setAssignee: (raw: CommandInput<'setAssignee'>) =>
    present({
      kind: 'setAssignee' as const,
      ...normalizeStepAddress(raw),
      personId: asIdOrNull(raw.personId, 'personId'),
      personRef: asOptionalId(raw.personRef, 'personRef'),
    }),
  assignSubtree: (raw: CommandInput<'assignSubtree'>) =>
    present({
      kind: 'assignSubtree' as const,
      ...target(raw),
      stepId: asText(raw.stepId, 'stepId'),
      personId: asIdOrNull(raw.personId, 'personId'),
      personRef: asOptionalId(raw.personRef, 'personRef'),
    }),
  claimWorkItem: (raw: CommandInput<'claimWorkItem'>) =>
    present({
      kind: 'claimWorkItem' as const,
      ...target(raw),
      personId: asOptionalId(raw.personId, 'personId'),
      personRef: asOptionalId(raw.personRef, 'personRef'),
      steps: asOptionalStepIds(raw.steps),
      runId: asOptionalRunId(raw.runId),
      parentClaim: asOptionalId(raw.parentClaim, 'parentClaim'),
      // The schema admits only a boolean; absent stays absent and reads as false.
      assign: raw.assign,
      resources: asOptionalResourceUnits(raw.resources),
    }),
  releaseWorkItem: (raw: CommandInput<'releaseWorkItem'>) =>
    present({
      kind: 'releaseWorkItem' as const,
      ...target(raw),
      personId: asOptionalId(raw.personId, 'personId'),
      personRef: asOptionalId(raw.personRef, 'personRef'),
      steps: asOptionalStepIds(raw.steps),
    }),
  addDependency: (raw: CommandInput<'addDependency'>) =>
    present({
      kind: 'addDependency' as const,
      ...target(raw),
      predecessorId: asOptionalId(raw.predecessorId, 'predecessorId'),
      predecessorRef: asOptionalId(raw.predecessorRef, 'predecessorRef'),
    }),
  removeDependency: (raw: CommandInput<'removeDependency'>) =>
    present({
      kind: 'removeDependency' as const,
      ...target(raw),
      predecessorId: asOptionalId(raw.predecessorId, 'predecessorId'),
      predecessorRef: asOptionalId(raw.predecessorRef, 'predecessorRef'),
    }),
  addTypedDependency: (raw: CommandInput<'addTypedDependency'>) => ({
    kind: 'addTypedDependency' as const,
    predecessor: normalizeTypedEndpoint(raw.predecessor),
    successor: normalizeTypedEndpoint(raw.successor),
    type: asText(raw.type, 'type'),
  }),
  updateTypedDependency: (raw: CommandInput<'updateTypedDependency'>) => ({
    kind: 'updateTypedDependency' as const,
    dependencyId: asText(raw.dependencyId, 'dependencyId'),
    predecessor: normalizeTypedEndpoint(raw.predecessor),
    successor: normalizeTypedEndpoint(raw.successor),
    type: asText(raw.type, 'type'),
  }),
  removeTypedDependency: (raw: CommandInput<'removeTypedDependency'>) => ({
    kind: 'removeTypedDependency' as const,
    dependencyId: asText(raw.dependencyId, 'dependencyId'),
  }),
  arrangeBySchedule: (_raw: CommandInput<'arrangeBySchedule'>) => ({
    kind: 'arrangeBySchedule' as const,
  }),
  freezeProject: (_raw: CommandInput<'freezeProject'>) => ({ kind: 'freezeProject' as const }),
  unfreezeProject: (_raw: CommandInput<'unfreezeProject'>) => ({
    kind: 'unfreezeProject' as const,
  }),
  unfreezeWorkItem: (raw: CommandInput<'unfreezeWorkItem'>) => ({
    kind: 'unfreezeWorkItem' as const,
    ...target(raw),
  }),
  setCapacity: (raw: CommandInput<'setCapacity'>) =>
    present({
      kind: 'setCapacity' as const,
      teamId: asOptionalId(raw.teamId, 'teamId'),
      teamRef: asOptionalId(raw.teamRef, 'teamRef'),
      size: capacityOf(raw),
    }),
  setStepAllowance: (raw: CommandInput<'setStepAllowance'>) => ({
    kind: 'setStepAllowance' as const,
    stepId: raw.stepId,
    allowancePercent: stepAllowanceOf(raw.allowancePercent),
  }),
  setPriorityBands: (raw: CommandInput<'setPriorityBands'>) => ({
    kind: 'setPriorityBands' as const,
    bands: ladderOf(raw),
  }),
  createTeam: (raw: CommandInput<'createTeam'>) => normalizeNamed('createTeam', raw),
  patchTeam(raw: CommandInput<'patchTeam'>) {
    const patch = raw.patch;
    assertRecord(patch);
    return present({
      kind: 'patchTeam' as const,
      teamId: asOptionalId(raw.teamId, 'teamId'),
      teamRef: asOptionalId(raw.teamRef, 'teamRef'),
      patch: present({
        name: asOptionalText(patch.name, 'name'),
        serviceIds: asOptionalIds(patch.serviceIds, 'serviceIds', MOST_SERVICES_ON_ONE_ITEM),
      }),
    });
  },
  deleteTeam: (raw: CommandInput<'deleteTeam'>) =>
    present({
      kind: 'deleteTeam' as const,
      teamId: asOptionalId(raw.teamId, 'teamId'),
      teamRef: asOptionalId(raw.teamRef, 'teamRef'),
      cascade: asOptionalFlag(raw.cascade, 'cascade'),
    }),
  createPerson: (raw: CommandInput<'createPerson'>) =>
    present({
      ...normalizeNamed('createPerson', raw),
      teamIds: asOptionalIds(raw.teamIds, 'teamIds', MOST_TEAMS_ON_ONE_ITEM),
      teamRefs: asOptionalIds(raw.teamRefs, 'teamRefs', MOST_TEAMS_ON_ONE_ITEM),
    }),
  patchPerson(raw: CommandInput<'patchPerson'>) {
    const patch = raw.patch;
    assertRecord(patch);
    return present({
      kind: 'patchPerson' as const,
      personId: asOptionalId(raw.personId, 'personId'),
      personRef: asOptionalId(raw.personRef, 'personRef'),
      patch: present({
        name: asOptionalText(patch.name, 'name'),
        teamIds: asOptionalIds(patch.teamIds, 'teamIds', MOST_TEAMS_ON_ONE_ITEM),
        kind: asOptionalText(patch.kind, 'kind'),
        // Absent leaves the binding alone; null unbinds.
        accountId:
          patch.accountId === undefined ? undefined : asIdOrNull(patch.accountId, 'accountId'),
      }),
    });
  },
  deletePerson: (raw: CommandInput<'deletePerson'>) =>
    present({
      kind: 'deletePerson' as const,
      personId: asOptionalId(raw.personId, 'personId'),
      personRef: asOptionalId(raw.personRef, 'personRef'),
      cascade: asOptionalFlag(raw.cascade, 'cascade'),
    }),
  createTag: (raw: CommandInput<'createTag'>) => normalizeNamed('createTag', raw),
  patchTag: (raw: CommandInput<'patchTag'>) =>
    present({
      kind: 'patchTag' as const,
      tagId: asOptionalId(raw.tagId, 'tagId'),
      tagRef: asOptionalId(raw.tagRef, 'tagRef'),
      name: asText(raw.name, 'name'),
    }),
  deleteTag: (raw: CommandInput<'deleteTag'>) =>
    present({
      kind: 'deleteTag' as const,
      tagId: asOptionalId(raw.tagId, 'tagId'),
      tagRef: asOptionalId(raw.tagRef, 'tagRef'),
      cascade: asOptionalFlag(raw.cascade, 'cascade'),
    }),
  createService: (raw: CommandInput<'createService'>) => normalizeNamed('createService', raw),
  patchService: (raw: CommandInput<'patchService'>) =>
    present({
      kind: 'patchService' as const,
      serviceId: asOptionalId(raw.serviceId, 'serviceId'),
      serviceRef: asOptionalId(raw.serviceRef, 'serviceRef'),
      name: asText(raw.name, 'name'),
    }),
  deleteService: (raw: CommandInput<'deleteService'>) =>
    present({
      kind: 'deleteService' as const,
      serviceId: asOptionalId(raw.serviceId, 'serviceId'),
      serviceRef: asOptionalId(raw.serviceRef, 'serviceRef'),
      cascade: asOptionalFlag(raw.cascade, 'cascade'),
    }),
  createWorkItemType: (raw: CommandInput<'createWorkItemType'>) =>
    normalizeNamed('createWorkItemType', raw),
  patchWorkItemType: (raw: CommandInput<'patchWorkItemType'>) =>
    present({
      kind: 'patchWorkItemType' as const,
      typeId: asOptionalId(raw.typeId, 'typeId'),
      typeRef: asOptionalId(raw.typeRef, 'typeRef'),
      name: asText(raw.name, 'name'),
    }),
  deleteWorkItemType: (raw: CommandInput<'deleteWorkItemType'>) =>
    present({
      kind: 'deleteWorkItemType' as const,
      typeId: asOptionalId(raw.typeId, 'typeId'),
      typeRef: asOptionalId(raw.typeRef, 'typeRef'),
      cascade: asOptionalFlag(raw.cascade, 'cascade'),
    }),
  setResourceCapacity: (raw: CommandInput<'setResourceCapacity'>) =>
    present({
      kind: 'setResourceCapacity' as const,
      resourceId: asOptionalId(raw.resourceId, 'resourceId'),
      resourceRef: asOptionalId(raw.resourceRef, 'resourceRef'),
      units: resourceUnitsOf(raw, 0),
    }),
  setDemand: (raw: CommandInput<'setDemand'>) =>
    present({
      kind: 'setDemand' as const,
      ...target(raw),
      resourceId: asOptionalId(raw.resourceId, 'resourceId'),
      resourceRef: asOptionalId(raw.resourceRef, 'resourceRef'),
      units: resourceUnitsOf(raw, 1),
    }),
  createResource: (raw: CommandInput<'createResource'>) => ({
    ...normalizeNamed('createResource', raw),
    resourceKind: asResourceKind(raw.resourceKind),
    unitLabel: asUnitLabel(raw.unitLabel),
  }),
  patchResource(raw: CommandInput<'patchResource'>) {
    const patch = raw.patch;
    assertRecord(patch);
    // Proof: with this refusal removed, `refuses a patch naming the kind at the
    // command boundary` (resource-command.test.ts) normalized the patch instead
    // of throwing; watched 2026-10-20.
    if ('resourceKind' in patch) throw new CommandNormalizationError('kind_is_immutable');
    return present({
      kind: 'patchResource' as const,
      resourceId: asOptionalId(raw.resourceId, 'resourceId'),
      resourceRef: asOptionalId(raw.resourceRef, 'resourceRef'),
      patch: present({
        name: asOptionalText(patch.name, 'name'),
        unitLabel: patch.unitLabel === undefined ? undefined : asUnitLabel(patch.unitLabel),
      }),
    });
  },
  deleteResource: (raw: CommandInput<'deleteResource'>) =>
    present({
      kind: 'deleteResource' as const,
      resourceId: asOptionalId(raw.resourceId, 'resourceId'),
      resourceRef: asOptionalId(raw.resourceRef, 'resourceRef'),
      cascade: asOptionalFlag(raw.cascade, 'cascade'),
    }),
  createMeasure: (raw: CommandInput<'createMeasure'>) =>
    present({
      kind: 'createMeasure' as const,
      ...ref(raw),
      key: asMeasureKey(raw.key),
      name: asText(raw.name, 'name'),
      unit: asMeasureUnit(raw.unit),
      measureKind: asMeasureKind(raw.measureKind),
      scale: asMeasureScale(raw.scale),
      threePoint: asOptionalFlag(raw.threePoint, 'threePoint'),
      showByDefault: asOptionalFlag(raw.showByDefault, 'showByDefault'),
      schedulesWork: asOptionalFlag(raw.schedulesWork, 'schedulesWork'),
      order: asOptionalMeasureOrder(raw.order),
      currency: asOptionalCurrency(raw.currency),
    }),
  patchMeasure(raw: CommandInput<'patchMeasure'>) {
    const patch = raw.patch;
    assertRecord(patch);
    return present({
      kind: 'patchMeasure' as const,
      measureId: asOptionalId(raw.measureId, 'measureId'),
      measureRef: asOptionalId(raw.measureRef, 'measureRef'),
      patch: present({
        key: patch.key === undefined ? undefined : asMeasureKey(patch.key),
        name: asOptionalText(patch.name, 'name'),
        unit: patch.unit === undefined ? undefined : asMeasureUnit(patch.unit),
        kind: patch.measureKind === undefined ? undefined : asMeasureKind(patch.measureKind),
        scale: patch.scale === undefined ? undefined : asMeasureScale(patch.scale),
        threePoint: asOptionalFlag(patch.threePoint, 'threePoint'),
        showByDefault: asOptionalFlag(patch.showByDefault, 'showByDefault'),
        schedulesWork: asOptionalFlag(patch.schedulesWork, 'schedulesWork'),
        order: asOptionalMeasureOrder(patch.order),
        currency: asOptionalCurrency(patch.currency),
      }),
    });
  },
  deleteMeasure: (raw: CommandInput<'deleteMeasure'>) =>
    present({
      kind: 'deleteMeasure' as const,
      measureId: asOptionalId(raw.measureId, 'measureId'),
      measureRef: asOptionalId(raw.measureRef, 'measureRef'),
    }),
} as const satisfies CommandNormalizerRecord<typeof commandDefinitions>;

/** The normalized command union, inferred from every normalizer's return type. */
export type PlanCommand = ReturnType<(typeof commandNormalizers)[PlanCommandKind]>;

/**
 * Applies the semantic normalizer selected by a structurally admitted command kind.
 * Common target and create-ref fields stay eager, including when a structural
 * mismatch means the mounted boundary is choosing the legacy semantic refusal.
 */
export function normalizeCommand(kind: PlanCommandKind, raw: Record<string, unknown>): PlanCommand {
  normalizedTarget(raw['workItemId'], raw['workItemRef']);
  normalizedRef(raw['ref']);
  // A known discriminator selects this function, but rejected structural bodies deliberately
  // remain raw here so their values receive the legacy semantic refusal before invalid_body.
  const rawNormalizers = commandNormalizers as unknown as Readonly<
    Record<PlanCommandKind, (command: Record<string, unknown>) => PlanCommand>
  >;
  return rawNormalizers[kind](raw);
}
