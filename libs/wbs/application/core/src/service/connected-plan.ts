import {
  CalendarRangeError,
  type ConnectedProjectGraph,
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
  projectConnectedSchedule,
  restoreConnectedSchedule,
} from './connected-plan-projection';
import type { ConnectedPlanCapture } from './connected-plan-values';
import { prepareCapturedScheduleParts } from './schedule-parts';

function buildLocalGraph(
  projectId: string,
  input: ScheduleInput,
  relationships: readonly ScopedTypedDependency[],
): ConnectedProjectGraph {
  const tree = indexTree(input.rows);
  return {
    projectId,
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
  const members = [...capture.projects].sort(
    (a, b) =>
      a.rank - b.rank || (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0),
  );
  const locals = new Map<string, ScopedTypedDependency[]>();
  const external: ScopedTypedDependency[] = [];
  const projectIds = new Set(members.map((member) => member.projectId));
  for (const relationship of capture.relationships) {
    // Proof: removing owner equality failed `refuses wrong relationship ownership and mismatched local captured evidence` (accepted capture).
    if (relationship.projectId !== relationship.successor.projectId)
      throw new Error(`relationship ${relationship.id} has wrong owner`);
    // Proof (diagnostic): removing this guard failed `refuses foreign project rows, absent endpoint project and cross owned endpoint identity` (downstream graph refusal).
    if (
      !projectIds.has(relationship.predecessor.projectId) ||
      !projectIds.has(relationship.successor.projectId)
    )
      throw new Error(`relationship ${relationship.id} has uncaptured project`);
    if (relationship.predecessor.projectId !== relationship.successor.projectId)
      external.push(relationship);
    else {
      const projectId = relationship.projectId;
      const previous = locals.get(projectId) ?? [];
      previous.push(relationship);
      locals.set(projectId, previous);
    }
  }
  const prepared = new Map<string, ReturnType<typeof prepareCapturedScheduleParts>>();
  for (const member of members) {
    // Proof: removing identity failed `refuses corrupted project identity and nonfinite rank`; removing rank failed `validates rank before an engine refusal` (engine_unavailable).
    if (member.reads.project.id !== member.projectId || !Number.isFinite(member.rank))
      throw new Error(`invalid captured project ${member.projectId}`);
    // Proof: removing row ownership failed `refuses foreign project rows, absent endpoint project and cross owned endpoint identity` (accepted foreign row).
    if (member.reads.workItems.some((row) => row.projectId !== member.projectId))
      throw new Error(`foreign work item in ${member.projectId}`);
    const relationships = locals.get(member.projectId) ?? [];
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
      throw new Error(`local relationships disagree in ${member.projectId}`);
    prepared.set(member.projectId, prepareCapturedScheduleParts(member.reads));
  }
  const getProjectParts = (projectId: string) => {
    const parts = prepared.get(projectId);
    // Invariant diagnostic: every captured member is prepared before graph construction.
    if (parts === undefined) throw new Error(`missing prepared project ${projectId}`);
    return parts;
  };
  const authored = resolveConnectedGraph({
    projects: members.map((member) =>
      buildLocalGraph(
        member.projectId,
        getProjectParts(member.projectId).unreducedInput,
        locals.get(member.projectId) ?? [],
      ),
    ),
    external,
  });
  const projection = (
    placement: ConnectedPlanProjection['placement'],
  ): ConnectedPlanProjection => ({ kind: 'connected', capture, authored, placement });
  const required = members.filter(
    (member) =>
      member.reads.project.optimizationEnabled &&
      member.reads.project.scheduleEngine === 'optimized' &&
      getProjectParts(member.projectId).input.slices.length > 0,
  );
  // Proof: disabling this branch failed `inspects the nontarget required optimized member before calendar refusal` (dependency_calendar_missing).
  if (optimizer === null && required.length > 0)
    return projection({
      kind: 'engine_unavailable',
      engine: 'optimized',
      projects: required.map((member) => member.projectId),
      reason: scheduler.supports('optimized')
        ? 'connected_optimization_not_supported'
        : 'adapter_missing',
    });
  const inputs = new Map(
    members.map((member) => [member.projectId, getProjectParts(member.projectId).input]),
  );
  const calendar = resolveConnectedCalendar({ ...capture, projects: members }, inputs);
  if (calendar.kind === 'dependency_calendar_missing') return projection(calendar);
  const reduced = members.map((member) =>
    buildLocalGraph(
      member.projectId,
      getProjectParts(member.projectId).input,
      (locals.get(member.projectId) ?? []).filter((relationship) =>
        getProjectParts(member.projectId).input.typed.some((kept) => kept.id === relationship.id),
      ),
    ),
  );
  const hasSurvivingEndpoint = (projectId: string, workItemId: string) =>
    indexTree(getProjectParts(projectId).input.rows).leavesUnder.has(workItemId);
  const scheduling = resolveConnectedGraph({
    projects: reduced,
    external: external.filter(
      (relationship) =>
        hasSurvivingEndpoint(
          relationship.predecessor.projectId,
          relationship.predecessor.workItemId,
        ) &&
        hasSurvivingEndpoint(relationship.successor.projectId, relationship.successor.workItemId),
    ),
  });
  const getProjectShift = (projectId: string): number => {
    if (getProjectParts(projectId).input.slices.length === 0) return 0;
    const shift = calendar.shiftByProject.get(projectId);
    // Invariant diagnostic: calendar preparation guarantees every active project has a shift.
    if (shift === undefined) throw new Error(`missing calendar shift ${projectId}`);
    return shift;
  };
  const personByKey = new Map<string, string>();
  const teamByKey = new Map<string, string>();
  const resourceByKey = new Map<string, string>();
  const identities: ConnectedIdentities = {
    personByKey,
    teamByKey,
    resourceByKey,
    projectIdByWorkItem: authored.projectIdByWorkItem,
  };
  const poolSizes = new Map<string, number>();
  const resourceCapacities = new Map<string, number>();
  const notBefore = new Map<string, number>();
  const deadlines = new Map<string, number>();
  const slices: Slice[] = [];
  for (const member of members) {
    const input = getProjectParts(member.projectId).input;
    const encode = (kind: 'team' | 'resource' | 'person', id: string) => {
      // Proof: dropping each scope independently failed `uses own rounding...team capacity`, `keeps identical resource catalog IDs project local`, or `shares people only in shared mode` on real starts.
      const key =
        kind === 'person' && capture.mode === 'shared'
          ? id
          : JSON.stringify([kind, member.projectId, id]);
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
      const shift = getProjectShift(member.projectId);
      const translated = translateConnectedCalendar(input, shift);
      for (const [id, offset] of translated.notBefore) notBefore.set(id, offset);
      for (const [id, offset] of translated.deadlines) deadlines.set(id, offset);
    }
  }
  const input: ResolvedScheduleInput = {
    rows: members.flatMap((member) => [...getProjectParts(member.projectId).input.rows]),
    slices,
    graph: scheduling.graph,
    notBefore,
    deadlines,
    poolSizes,
    resourceCapacities,
    elsewhere: new Map(),
    order: {
      kind: 'connected',
      projectIdByWorkItem: scheduling.projectIdByWorkItem,
      rankByProject: new Map(members.map((member) => [member.projectId, member.rank])),
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
        projects: members.map((member) => ({
          projectId: member.projectId,
          rank: member.rank,
          anchorOrdinal:
            member.reads.project.startDate === null
              ? null
              : workdayOrdinalOf(member.reads.project.startDate),
          engine: member.reads.project.scheduleEngine,
          objective: member.reads.project.scheduleObjective,
          enabled: member.reads.project.optimizationEnabled,
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
      idleProjects: selected.idleProjects,
      identities,
      byProject: new Map(
        members.map((member) => [
          member.projectId,
          projectConnectedSchedule(
            combined,
            member.projectId,
            getProjectShift(member.projectId),
            authored.projectIdByWorkItem,
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
