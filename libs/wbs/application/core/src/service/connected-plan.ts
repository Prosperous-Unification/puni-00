import {
  CalendarRangeError,
  type ConnectedWorkPackageGraph,
  formatTypedDependencyKey,
  groupSlicesByLeaf,
  indexTree,
  resolveConnectedGraph,
  type ResolvedScheduleInput,
  resolveScheduleInput,
  type Schedule,
  ScheduleCycleError,
  type ScopedTypedDependency,
  type Slice,
} from '@wbs/domain';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { workdayOrdinalOf } from '@wbs/domain/workday';

import type { CapturedScheduler, ConnectedOptimizedCapturedAdapter } from '../ports/scheduler';
import { selectConnectedOptimizations } from './connected-optimization';
import { resolveConnectedCalendar, translateConnectedCalendar } from './connected-plan-calendar';
import {
  type ConnectedIdentities,
  type ConnectedPlanProjection,
  restoreConnectedSchedule,
  workPackageConnectedSchedule,
} from './connected-plan-projection';
import type { ConnectedPlanCapture } from './connected-plan-values';
import { prepareCapturedScheduleParts } from './schedule-parts';

function buildLocalGraph(
  workPackageId: string,
  input: ScheduleInput,
  relationships: readonly ScopedTypedDependency[],
): ConnectedWorkPackageGraph {
  const tree = indexTree(input.rows);
  return {
    workPackageId,
    tree,
    slicesByLeaf: groupSlicesByLeaf(tree.leafIds, input.slices),
    graph: resolveScheduleInput(input).graph,
    relationships,
  };
}

/**
 * Derive a component from combined Fast and bounded captured selection. Cache
 * reads are synchronous and non-admitting under the caller's snapshot lifetime.
 * Authored graph validation precedes modeled engine/calendar refusal; only known
 * cycle/calendar failures are recovered.
 */
export function deriveConnectedPlan(
  capture: ConnectedPlanCapture,
  scheduler: Pick<CapturedScheduler, 'supports'>,
  scheduleFast: (input: ResolvedScheduleInput) => Schedule,
  optimizer: ConnectedOptimizedCapturedAdapter | null = null,
): ConnectedPlanProjection {
  const members = [...capture.workPackages].sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.workPackageId < b.workPackageId ? -1 : a.workPackageId > b.workPackageId ? 1 : 0),
  );
  const locals = new Map<string, ScopedTypedDependency[]>();
  const external: ScopedTypedDependency[] = [];
  const workPackageIds = new Set(members.map((member) => member.workPackageId));
  for (const relationship of capture.relationships) {
    // Proof: removing owner equality failed `refuses wrong relationship ownership and mismatched local captured evidence` (accepted capture).
    if (relationship.workPackageId !== relationship.successor.workPackageId)
      throw new Error(`relationship ${relationship.id} has wrong owner`);
    // Proof (diagnostic): removing this guard failed `refuses foreign workPackage rows, absent endpoint workPackage and cross owned endpoint identity` (downstream graph refusal).
    if (
      !workPackageIds.has(relationship.predecessor.workPackageId) ||
      !workPackageIds.has(relationship.successor.workPackageId)
    )
      throw new Error(`relationship ${relationship.id} has uncaptured work package`);
    if (relationship.predecessor.workPackageId !== relationship.successor.workPackageId)
      external.push(relationship);
    else {
      const workPackageId = relationship.workPackageId;
      const previous = locals.get(workPackageId) ?? [];
      previous.push(relationship);
      locals.set(workPackageId, previous);
    }
  }
  const prepared = new Map<string, ReturnType<typeof prepareCapturedScheduleParts>>();
  for (const member of members) {
    // Proof: removing identity failed `refuses corrupted workPackage identity and nonfinite rank`; removing rank failed `validates rank before an engine refusal` (engine_unavailable).
    if (member.reads.workPackage.id !== member.workPackageId || !Number.isFinite(member.rank))
      throw new Error(`invalid captured work package ${member.workPackageId}`);
    // Proof: removing row ownership failed `refuses foreign workPackage rows, absent endpoint workPackage and cross owned endpoint identity` (accepted foreign row).
    if (member.reads.workItems.some((row) => row.workPackageId !== member.workPackageId))
      throw new Error(`foreign work item in ${member.workPackageId}`);
    const relationships = locals.get(member.workPackageId) ?? [];
    const expected = new Map(
      relationships.map((relationship) => [
        relationship.id,
        formatTypedDependencyKey(relationship),
      ]),
    );
    const actual = new Map(
      member.reads.typedDependencies.map((relationship) => [
        relationship.id,
        formatTypedDependencyKey(relationship),
      ]),
    );
    // Proof: removing captured-local equality failed `refuses wrong relationship ownership and mismatched local captured evidence` (modeled cycle instead of throw).
    if (expected.size !== actual.size || [...expected].some(([id, key]) => actual.get(id) !== key))
      throw new Error(`local relationships disagree in ${member.workPackageId}`);
    prepared.set(member.workPackageId, prepareCapturedScheduleParts(member.reads));
  }
  const getWorkPackageParts = (workPackageId: string) => {
    const parts = prepared.get(workPackageId);
    // Invariant diagnostic: every captured member is prepared before graph construction.
    if (parts === undefined) throw new Error(`missing prepared work package ${workPackageId}`);
    return parts;
  };
  const authored = resolveConnectedGraph({
    workPackages: members.map((member) =>
      buildLocalGraph(
        member.workPackageId,
        getWorkPackageParts(member.workPackageId).unreducedInput,
        locals.get(member.workPackageId) ?? [],
      ),
    ),
    external,
  });
  const projection = (
    placement: ConnectedPlanProjection['placement'],
  ): ConnectedPlanProjection => ({ kind: 'connected', capture, authored, placement });
  const required = members.filter(
    (member) =>
      member.reads.workPackage.optimizationEnabled &&
      member.reads.workPackage.scheduleEngine === 'optimized' &&
      getWorkPackageParts(member.workPackageId).input.slices.length > 0,
  );
  // Proof: disabling this branch failed `inspects the nontarget required optimized member before calendar refusal` (dependency_calendar_missing).
  if (optimizer === null && required.length > 0)
    return projection({
      kind: 'engine_unavailable',
      engine: 'optimized',
      workPackages: required.map((member) => member.workPackageId),
      reason: scheduler.supports('optimized')
        ? 'connected_optimization_not_supported'
        : 'adapter_missing',
    });
  const inputs = new Map(
    members.map((member) => [
      member.workPackageId,
      getWorkPackageParts(member.workPackageId).input,
    ]),
  );
  const calendar = resolveConnectedCalendar({ ...capture, workPackages: members }, inputs);
  if (calendar.kind === 'dependency_calendar_missing') return projection(calendar);
  const reduced = members.map((member) =>
    buildLocalGraph(
      member.workPackageId,
      getWorkPackageParts(member.workPackageId).input,
      (locals.get(member.workPackageId) ?? []).filter((relationship) =>
        getWorkPackageParts(member.workPackageId).input.typed.some(
          (kept) => kept.id === relationship.id,
        ),
      ),
    ),
  );
  const hasSurvivingEndpoint = (workPackageId: string, workItemId: string) =>
    indexTree(getWorkPackageParts(workPackageId).input.rows).leavesUnder.has(workItemId);
  const scheduling = resolveConnectedGraph({
    workPackages: reduced,
    external: external.filter(
      (relationship) =>
        hasSurvivingEndpoint(
          relationship.predecessor.workPackageId,
          relationship.predecessor.workItemId,
        ) &&
        hasSurvivingEndpoint(
          relationship.successor.workPackageId,
          relationship.successor.workItemId,
        ),
    ),
  });
  const getWorkPackageShift = (workPackageId: string): number => {
    if (getWorkPackageParts(workPackageId).input.slices.length === 0) return 0;
    const shift = calendar.shiftByWorkPackage.get(workPackageId);
    // Invariant diagnostic: calendar preparation guarantees every active work package has a shift.
    if (shift === undefined) throw new Error(`missing calendar shift ${workPackageId}`);
    return shift;
  };
  const personByKey = new Map<string, string>();
  const teamByKey = new Map<string, string>();
  const resourceByKey = new Map<string, string>();
  const identities: ConnectedIdentities = {
    personByKey,
    teamByKey,
    resourceByKey,
    workPackageIdByWorkItem: authored.workPackageIdByWorkItem,
  };
  const poolSizes = new Map<string, number>();
  const resourceCapacities = new Map<string, number>();
  const notBefore = new Map<string, number>();
  const deadlines = new Map<string, number>();
  const slices: Slice[] = [];
  for (const member of members) {
    const input = getWorkPackageParts(member.workPackageId).input;
    const encode = (kind: 'team' | 'resource' | 'person', id: string) => {
      // Proof: dropping each scope independently failed `uses own rounding...team capacity`, `keeps identical resource catalog IDs workPackage local`, or `shares people only in shared mode` on real starts.
      const key =
        kind === 'person' && capture.mode === 'shared'
          ? id
          : JSON.stringify([kind, member.workPackageId, id]);
      const reverse =
        kind === 'team' ? teamByKey : kind === 'resource' ? resourceByKey : personByKey;
      reverse.set(key, id);
      return key;
    };
    for (const [id, units] of input.poolSizes) poolSizes.set(encode('team', id), units);
    for (const [id, units] of input.resourceCapacities ?? [])
      resourceCapacities.set(encode('resource', id), units);
    for (const slice of input.slices)
      slices.push({
        ...slice,
        personId: slice.personId === null ? null : encode('person', slice.personId),
        poolIds: slice.poolIds.map((id) => encode('team', id)),
        ...(slice.demands === undefined
          ? {}
          : {
              demands: slice.demands.map((demand) => ({
                ...demand,
                resourceId: encode('resource', demand.resourceId),
              })),
            }),
      });
    if (input.slices.length > 0) {
      const shift = getWorkPackageShift(member.workPackageId);
      const translated = translateConnectedCalendar(input, shift);
      for (const [id, offset] of translated.notBefore) notBefore.set(id, offset);
      for (const [id, offset] of translated.deadlines) deadlines.set(id, offset);
    }
  }
  const input: ResolvedScheduleInput = {
    rows: members.flatMap((member) => [...getWorkPackageParts(member.workPackageId).input.rows]),
    slices,
    graph: scheduling.graph,
    notBefore,
    deadlines,
    poolSizes,
    resourceCapacities,
    elsewhere: new Map(),
    order: {
      kind: 'connected',
      workPackageIdByWorkItem: scheduling.workPackageIdByWorkItem,
      rankByWorkPackage: new Map(members.map((member) => [member.workPackageId, member.rank])),
    },
  };
  try {
    // Proof: skipping selection failed `selects actual mixed-engine stages...` on the selected start and later boundary.
    const selected = selectConnectedOptimizations(
      {
        mode: capture.mode,
        originOrdinal: calendar.originOrdinal,
        input,
        relationships: capture.relationships,
        workPackages: members.map((member) => ({
          workPackageId: member.workPackageId,
          rank: member.rank,
          anchorOrdinal:
            member.reads.workPackage.startDate === null
              ? null
              : workdayOrdinalOf(member.reads.workPackage.startDate),
          engine: member.reads.workPackage.scheduleEngine,
          objective: member.reads.workPackage.scheduleObjective,
          enabled: member.reads.workPackage.optimizationEnabled,
        })),
      },
      scheduleFast(input),
      optimizer,
    );
    if (selected.kind === 'engine_unavailable')
      return projection({ ...selected, reason: 'connected_optimization_not_supported' });
    const combined = restoreConnectedSchedule(selected.placement, identities);
    return projection({
      kind: 'scheduled',
      engine: 'fast',
      originOrdinal: calendar.originOrdinal,
      combined,
      baseline: restoreConnectedSchedule(selected.baseline, identities),
      stages: selected.stages,
      idleWorkPackages: selected.idleWorkPackages,
      identities,
      byWorkPackage: new Map(
        members.map((member) => [
          member.workPackageId,
          workPackageConnectedSchedule(
            combined,
            member.workPackageId,
            getWorkPackageShift(member.workPackageId),
            authored.workPackageIdByWorkItem,
          ),
        ]),
      ),
    });
  } catch (failure) {
    if (failure instanceof ScheduleCycleError)
      return projection({ kind: 'unavailable', reason: 'cycle' });
    if (failure instanceof CalendarRangeError)
      return projection({ kind: 'unavailable', reason: 'calendar_range' });
    throw failure;
  }
}
