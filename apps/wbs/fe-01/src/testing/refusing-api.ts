import type {
  ClientInput,
  ClientReply,
  EndpointShape,
  PreflightInput,
  RequestPreflight,
  TransportInput,
} from '@wbs/contracts';
import {
  applyDirectoryCommands,
  applyWorkPackageCommands,
  clientFromShapes,
  createCalendarMarker,
  createProject,
  createWorkPackage,
  exportWorkPackage,
  getWorkItems,
  importWorkPackage,
  listCalendarMarkers,
  listExternalSystems,
  listMeasures,
  listPeople,
  listProjects,
  listServices,
  listTags,
  listTeams,
  listWorkItemTypes,
  listWorkPackages,
  patchWorkPackage,
  patchWorkPackageStepValues,
  preflightRequest,
  readClaimHistory,
  readTimezones,
  readWorkPackage,
  readWorkPackageClaims,
  readWorkPackageResources,
  recordWorkPackageOpen,
  redoWorkPackage,
  removeCalendarMarker,
  retryWorkPackageOptimization,
  undoWorkPackage,
  updateCalendarMarker,
} from '@wbs/contracts';
import { allowanceHundredthsOf } from '@wbs/domain/estimate';

import {
  type CalendarMarkerView,
  type DeleteOptions,
  type PlanRead,
  stepViewOf,
  type WbsOperationId,
  type WorkPackageApi,
} from '@/lib/wbs-api';

function boundaryFailure(failure: { code: string; cause?: unknown }): never {
  if (failure.code === 'transport') throw failure.cause;
  throw new Error(`fake_${failure.code}`);
}

function isFacadeSuccess<Answer extends { readonly ok: boolean }>(
  answer: Answer,
): answer is Extract<Answer, { readonly ok: true }> {
  const discriminator: unknown = answer.ok;
  // Proof: treating a truthy "yes" as success made the undo boundary test resolve
  // { ok: true, done: "rename", detail: null } instead of fake_invalid_response.
  return discriminator === true;
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return typeof value === 'object' && value !== null && 'then' in value;
}

function requireValidRequest<Shape extends EndpointShape>(
  preflight: RequestPreflight<Shape>,
): PreflightInput<Shape> {
  if (preflight.kind === 'failure') boundaryFailure(preflight.failure);
  return preflight.input;
}

function preflightFakeRequest<Shape extends EndpointShape>(
  shape: Shape,
  input: Partial<TransportInput>,
): PreflightInput<Shape> | Promise<PreflightInput<Shape>> {
  const preflight = preflightRequest(shape, input);
  if (isPromiseLike(preflight))
    return Promise.resolve(preflight).then((completed) => requireValidRequest(completed));
  return requireValidRequest(preflight);
}

interface StartedMutation<Shape extends EndpointShape, Answer> {
  prepared: PreflightInput<Shape>;
  mutation: Promise<Answer>;
}

function startMutation<Shape extends EndpointShape, Answer>(
  shape: Shape,
  input: Partial<TransportInput>,
  mutate: (prepared: PreflightInput<Shape>) => Promise<Answer>,
): StartedMutation<Shape, Answer> | Promise<StartedMutation<Shape, Answer>> {
  const preflight = preflightFakeRequest(shape, input);
  const start = (prepared: PreflightInput<Shape>): StartedMutation<Shape, Answer> => ({
    prepared,
    // Proof: letting clientFromShapes start createCalendarMarker passed color: undefined;
    // the focused exact-call test received that key instead of the normalized marker.
    mutation: mutate(prepared),
  });
  return isPromiseLike(preflight) ? Promise.resolve(preflight).then(start) : start(preflight);
}

function requiredNormalized<Value>(value: Value | undefined): Value {
  // Proof: without this guard, normalized-away marker name/color values reached their
  // mutations; the focused negatives received fake_invalid_response or resolved successfully.
  if (value === undefined) throw new Error('fake_invalid_request');
  return value;
}

function emptyWhenUndefined<Value>(value: Value | undefined, empty: Value): Value {
  if (value === undefined) return empty;
  return value;
}

function markerWire(workPackageId: string, marker: CalendarMarkerView) {
  return { ...marker, workPackageId, createdAt: 0 };
}

function markerView(marker: CalendarMarkerView): CalendarMarkerView {
  return { id: marker.id, date: marker.date, name: marker.name, color: marker.color };
}

type WorkPackagePatch = ClientInput<typeof patchWorkPackage>['body'];
type WorkPackageCommand = ClientInput<typeof applyWorkPackageCommands>['body']['commands'][number];
type DirectoryCommand = ClientInput<typeof applyDirectoryCommands>['body']['commands'][number];
type WorkPackageCommandResult = Extract<
  ClientReply<typeof applyWorkPackageCommands>,
  { kind: 'success' }
>['body']['results'][number];
type DirectoryCommandResult = Extract<
  ClientReply<typeof applyDirectoryCommands>,
  { kind: 'success' }
>['body']['results'][number];

// Proof: deleting removeDependency made the spec typecheck fail with TS1360:
// "Property 'removeDependency' is missing" from this Record<keyof WorkPackageApi, ...>.
const WORK_PACKAGE_API_OPERATIONS = {
  listWorkPackages: 'getApiWorkPackages',
  listProjects: 'getApiProjects',
  createProjectWithWorkPackage: 'postApiProjects',
  createWorkPackage: 'postApiWorkPackages',
  openWorkPackage: 'postApiWorkPackagesByIdOpened',
  renameWorkPackage: 'patchApiWorkPackagesById',
  setAbbreviation: 'patchApiWorkPackagesById',
  tree: 'getApiWorkPackagesByIdWork-items',
  exportPlan: 'getApiWorkPackagesByIdExport',
  importPlan: 'postApiWorkPackagesImport',
  undo: 'postApiWorkPackagesByIdUndo',
  redo: 'postApiWorkPackagesByIdRedo',
  setEstimateMethod: 'patchApiWorkPackagesById',
  setEstimateArithmetic: 'patchApiWorkPackagesById',
  setDepReach: 'patchApiWorkPackagesById',
  setOptimizationSettings: 'patchApiWorkPackagesById',
  retryOptimization: 'postApiWorkPackagesByIdOptimizationRetry',
  setStartDate: 'patchApiWorkPackagesById',
  setTimezone: 'patchApiWorkPackagesById',
  listTimezones: 'getApiTimezones',
  listCalendarMarkers: 'getApiWorkPackagesByIdCalendar-markers',
  readClaims: 'getApiWorkPackagesByIdClaims',
  readClaimHistory: 'getApiWorkPackagesByIdClaim-history',
  createCalendarMarker: 'postApiWorkPackagesByIdCalendar-markers',
  renameCalendarMarker: 'patchApiWorkPackagesByIdCalendar-markersByMarkerId',
  recolorCalendarMarker: 'patchApiWorkPackagesByIdCalendar-markersByMarkerId',
  deleteCalendarMarker: 'deleteApiWorkPackagesByIdCalendar-markersByMarkerId',
  setTeamCapacity: 'postApiWorkPackagesByIdCommands',
  setPriorityBands: 'postApiWorkPackagesByIdCommands',
  steps: 'getApiWorkPackagesById',
  setStepAllowance: 'patchWorkPackageStepValues',
  setStepUnit: 'patchWorkPackageStepValues',
  createWorkItem: 'postApiWorkPackagesByIdCommands',
  patchWorkItem: 'postApiWorkPackagesByIdCommands',
  setStatus: 'postApiWorkPackagesByIdCommands',
  setProgress: 'postApiWorkPackagesByIdCommands',
  clearProgress: 'postApiWorkPackagesByIdCommands',
  setStepBlocked: 'postApiWorkPackagesByIdCommands',
  startAttempt: 'postApiWorkPackagesByIdCommands',
  endAttempt: 'postApiWorkPackagesByIdCommands',
  removeAttempt: 'postApiWorkPackagesByIdCommands',
  listTeams: 'getApiTeams',
  listTags: 'getApiTags',
  listServices: 'getApiServices',
  addService: 'postApiDirectoryCommands',
  listWorkItemTypes: 'getApiWork-item-types',
  addWorkItemType: 'postApiDirectoryCommands',
  listExternalSystems: 'getApiExternal-systems',
  addTag: 'postApiDirectoryCommands',
  renameTag: 'postApiDirectoryCommands',
  removeTag: 'postApiDirectoryCommands',
  addTeam: 'postApiDirectoryCommands',
  listPeople: 'getApiPeople',
  addPerson: 'postApiDirectoryCommands',
  assignPerson: 'postApiWorkPackagesByIdCommands',
  moveWorkItem: 'postApiWorkPackagesByIdCommands',
  duplicateWorkItem: 'postApiWorkPackagesByIdCommands',
  removeWorkItem: 'postApiWorkPackagesByIdCommands',
  setEstimate: 'postApiWorkPackagesByIdCommands',
  clearEstimate: 'postApiWorkPackagesByIdCommands',
  listMeasures: 'getApiMeasures',
  setMeasureEstimate: 'postApiWorkPackagesByIdCommands',
  clearMeasureEstimate: 'postApiWorkPackagesByIdCommands',
  setMeasure: 'postApiWorkPackagesByIdCommands',
  clearMeasure: 'postApiWorkPackagesByIdCommands',
  setBudget: 'postApiWorkPackagesByIdCommands',
  clearBudget: 'postApiWorkPackagesByIdCommands',
  arrangeBySchedule: 'postApiWorkPackagesByIdCommands',
  freezeWorkPackage: 'postApiWorkPackagesByIdCommands',
  unfreezeWorkPackage: 'postApiWorkPackagesByIdCommands',
  unfreezeWorkItem: 'postApiWorkPackagesByIdCommands',
  claimWorkItem: 'postApiWorkPackagesByIdCommands',
  releaseWorkItem: 'postApiWorkPackagesByIdCommands',
  addDependency: 'postApiWorkPackagesByIdCommands',
  removeDependency: 'postApiWorkPackagesByIdCommands',
  addTypedDependency: 'postApiWorkPackagesByIdCommands',
  updateTypedDependency: 'postApiWorkPackagesByIdCommands',
  removeTypedDependency: 'postApiWorkPackagesByIdCommands',
  readResources: 'getApiWorkPackagesByIdResources',
  setDemands: 'postApiWorkPackagesByIdCommands',
} as const satisfies Record<keyof WorkPackageApi, WbsOperationId>;

function isWorkPackageApiMethod(key: PropertyKey): key is keyof WorkPackageApi {
  return Object.hasOwn(WORK_PACKAGE_API_OPERATIONS, key);
}

/** Explicit transport-only parent metadata for facade methods which do not return a package. */
export interface WorkPackageTransportContext {
  projectIdOf(workPackageId: string): string;
}

function workPackageWire(workPackageId: string, projectId: string, patch: WorkPackagePatch = {}) {
  return {
    id: workPackageId,
    abbreviation: 'FAKE',
    name: patch.name ?? 'Fake work package',
    projectId,
    restricted: patch.restricted ?? false,
    estimateMethod: patch.estimateMethod ?? 'pert',
    depReach: patch.depReach ?? 'whole-item',
    pertWeights: patch.pertWeights ?? { optimistic: 1, realistic: 4, pessimistic: 1 },
    estimateRounding: patch.estimateRounding ?? 'ceil',
    startDate: patch.startDate ?? null,
    solutionRef: patch.solutionRef ?? null,
    revision: 0,
    optimizationEnabled: patch.optimizationEnabled ?? false,
    scheduleEngine: patch.scheduleEngine ?? 'fast',
    scheduleObjective: patch.scheduleObjective ?? 'pri',
    createdAt: 0,
  } as const;
}

/**
 * Restores only the transport fields absent from {@link PlanRead} before the
 * shared response shape checks a stated tree. Required facade fields flow
 * through unchanged. The four optional label/reference lists and undefined
 * assignee entries are the documented old-server swap shape; they normalize
 * to the same empty/absent values as `toTree` before entering the current wire.
 */
function planWire(workPackageId: string, plan: PlanRead) {
  return {
    waitingForPerson: 0,
    waitingForCapacity: 0,
    ...plan,
    workItems: plan.workItems.map((row, position) => ({
      workPackageId,
      position,
      serviceId: null,
      actuals: {},
      measures: {},
      ...row,
      // Proof: nullish fallback turned tagIds: null into []; the focused tree test
      // resolved a complete plan instead of rejecting with fake_invalid_response.
      tagIds: emptyWhenUndefined(row.tagIds, []),
      serviceIds: emptyWhenUndefined(row.serviceIds, []),
      typeIds: emptyWhenUndefined(row.typeIds, []),
      externalRefs: emptyWhenUndefined(row.externalRefs, []),
      assignees: Object.fromEntries(
        Object.entries(row.assignees).filter((entry): entry is [string, string] => {
          const [, personId] = entry;
          return personId !== undefined;
        }),
      ),
    })),
    steps: plan.steps.map((step, position) => ({ workPackageId, position, ...step })),
  };
}

async function throughWorkPackagePatch<Patch extends WorkPackagePatch>(
  workPackageId: string,
  patch: Patch,
  mutate: (normalizedWorkPackageId: string, normalizedPatch: Patch) => Promise<void>,
  projectIdOf: (workPackageId: string) => string,
): Promise<void> {
  // Proof: bypassing this client made the malformed setDepReach case receive
  // { outcome: "resolved", after: "fake_invalid_response" } after it corrupted depReach.
  // Proof: schema-only preflight let an empty work package id mutate depReach; the state-window
  // test failed on expected "whole-item", received "anchor-slice" after the rejection.
  const preflight = preflightFakeRequest(patchWorkPackage, {
    params: { id: workPackageId },
    body: patch,
  });
  const prepared = isPromiseLike(preflight) ? await preflight : preflight;
  // The shared request boundary permits only undefined-key omission, without
  // transforms or defaults, so the accepted patch remains within Patch.
  const normalizedPatch = prepared.body as Patch;
  const projectId = projectIdOf(prepared.params.id);
  const mutation = mutate(prepared.params.id, normalizedPatch);
  const client = clientFromShapes([patchWorkPackage], async () => {
    await mutation;
    return {
      kind: 'json' as const,
      status: 200,
      body: { workPackage: workPackageWire(prepared.params.id, projectId, normalizedPatch) },
    };
  });
  const reply = await client.patchApiWorkPackagesById({
    params: prepared.params,
    body: normalizedPatch,
  });
  if (reply.kind === 'failure') boundaryFailure(reply.failure);
  if (reply.kind === 'refusal') throw new Error(reply.body.error);
}

class CapturedAnswer<T> {
  private state: { called: false } | { called: true; answer: T } = { called: false };

  set(answer: T): void {
    this.state = { called: true, answer };
  }

  get(boundary: string): T {
    if (!this.state.called)
      throw new Error(`validated fake ${boundary} did not invoke its mutation`);
    return this.state.answer;
  }
}

function throughWorkPackageCommand<Command extends WorkPackageCommand, Answer>(
  workPackageId: string,
  command: Command,
  mutate: (normalizedWorkPackageId: string, normalizedCommand: Command) => Promise<Answer>,
  resultOf: (answer: Answer) => WorkPackageCommandResult,
): Promise<void>;
function throughWorkPackageCommand<Command extends WorkPackageCommand, Answer, Facade>(
  workPackageId: string,
  command: Command,
  mutate: (normalizedWorkPackageId: string, normalizedCommand: Command) => Promise<Answer>,
  resultOf: (answer: Answer) => WorkPackageCommandResult,
  facadeOf: (validated: WorkPackageCommandResult) => Facade,
): Promise<Facade>;
async function throughWorkPackageCommand<Command extends WorkPackageCommand, Answer, Facade>(
  workPackageId: string,
  command: Command,
  mutate: (normalizedWorkPackageId: string, normalizedCommand: Command) => Promise<Answer>,
  resultOf: (answer: Answer) => WorkPackageCommandResult,
  facadeOf?: (validated: WorkPackageCommandResult) => Facade,
): Promise<Facade | undefined> {
  const input = { params: { id: workPackageId }, body: { commands: [command] } };
  // Proof: schema-only preflight let a dot-segment work package id create a row; the state-window
  // test failed on expected length 0, received 1 after the rejection.
  const preflight = preflightFakeRequest(applyWorkPackageCommands, input);
  const prepared = isPromiseLike(preflight) ? await preflight : preflight;
  const normalized = prepared.body.commands.at(0);
  if (normalized?.kind !== command.kind)
    throw new Error('validated fake work package command changed identity');
  // The exact shared union validation and unchanged discriminant establish the
  // caller's command arm after JSON removes optional undefined fields.
  const normalizedCommand = normalized as Command;
  // Proof: deferring a valid fake mutation until clientFromShapes' async transport made three
  // plan-cards capacity cases fail because their deliberately unawaited assignment was absent.
  // Proof: mutating the original patchWorkItem command wrote name: undefined; its accepted
  // call then made the next shaped tree fail with "fake_invalid_response".
  const mutation = mutate(prepared.params.id, normalizedCommand);
  // Proof: bypassing this client made malformed setEstimate resolve undefined instead of reject;
  // a numeric createWorkItem id likewise resolved as { id: 7 } instead of fake_invalid_response.
  const client = clientFromShapes([applyWorkPackageCommands], async () => {
    const answer = await mutation;
    return {
      kind: 'json' as const,
      status: 200,
      body: { results: [resultOf(answer)], undoable: false, redoable: false },
    };
  });
  const reply = await client.postApiWorkPackagesByIdCommands({
    params: prepared.params,
    body: prepared.body,
  });
  if (reply.kind === 'failure') boundaryFailure(reply.failure);
  if (reply.kind === 'refusal') throw new Error(reply.body.error);
  const validated = reply.body.results.at(0);
  if (validated === undefined) throw new Error('fake_invalid_response');
  // Proof: returning the mutation answer leaked unchecked: true; the focused create
  // test received { id: "work-1", unchecked: true } instead of { id: "work-1" }.
  return facadeOf?.(validated);
}

async function throughDirectorySuccess<Command extends DirectoryCommand, Answer, Facade>(
  command: Command,
  mutate: (normalizedCommand: Command) => Promise<Answer>,
  resultOf: (answer: Answer) => DirectoryCommandResult,
  facadeOf: (validated: DirectoryCommandResult) => Facade,
): Promise<Facade> {
  const body = { commands: [command] };
  const preflight = preflightFakeRequest(applyDirectoryCommands, { body });
  const prepared = isPromiseLike(preflight) ? await preflight : preflight;
  const normalized = prepared.body.commands.at(0);
  if (normalized?.kind !== command.kind)
    throw new Error('validated fake directory command changed identity');
  // The exact shared union validation and unchanged discriminant establish the
  // caller's command arm after JSON removes optional undefined fields.
  const normalizedCommand = normalized as Command;
  const mutation = mutate(normalizedCommand);
  // Proof: bypassing this client made addPerson with numeric team ids resolve
  // { id: "person-1", name: "Ada", kind: "person", teamIds: [] } instead of reject.
  const client = clientFromShapes([applyDirectoryCommands], async () => {
    const answer = await mutation;
    return { kind: 'json' as const, status: 200, body: { results: [resultOf(answer)] } };
  });
  const reply = await client.postApiDirectoryCommands({ body: prepared.body });
  if (reply.kind === 'failure') boundaryFailure(reply.failure);
  if (reply.kind === 'refusal') throw new Error(reply.body.error);
  const validated = reply.body.results.at(0);
  if (validated === undefined) throw new Error('fake_invalid_response');
  // Proof: returning the mutation answer leaked unchecked: true; the focused directory
  // test received it beside the validated tag id and name.
  return facadeOf(validated);
}

const VOID_COMMAND_RESULT = { index: 0 };
const FAKE_WORK_PACKAGE_ID = 'fake-work-package';

function checkedAnswers(
  answers: Partial<WorkPackageApi>,
  context?: WorkPackageTransportContext,
): Partial<WorkPackageApi> {
  const projectIdOf = (workPackageId: string): string => {
    if (context === undefined) throw new Error('fake_missing_project_context');
    return context.projectIdOf(workPackageId);
  };
  const checked: Partial<WorkPackageApi> = {};
  const listProjectsAnswer = answers.listProjects;
  if (listProjectsAnswer !== undefined) {
    checked.listProjects = async () => {
      const client = clientFromShapes([listProjects], async () => ({
        kind: 'json' as const,
        status: 200,
        body: { projects: await listProjectsAnswer() },
      }));
      const reply = await client.getApiProjects({});
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return reply.body.projects;
    };
  }
  const combinedCreationAnswer = answers.createProjectWithWorkPackage;
  if (combinedCreationAnswer !== undefined) {
    checked.createProjectWithWorkPackage = async (projectName, workPackageName) => {
      const started = startMutation(
        createProject,
        { body: { name: projectName, workPackage: { name: workPackageName } } },
        (prepared) =>
          combinedCreationAnswer(
            prepared.body.name,
            requiredNormalized(prepared.body.workPackage).name,
          ),
      );
      const { prepared, mutation } = isPromiseLike(started) ? await started : started;
      const client = clientFromShapes([createProject], async () => ({
        kind: 'json' as const,
        status: 201,
        body: await mutation,
      }));
      const reply = await client.postApiProjects({ body: prepared.body });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      const creation = reply.body;
      const workPackage = creation.workPackage;
      const steps = creation.steps;
      if (
        workPackage === undefined ||
        steps === undefined ||
        workPackage.projectId !== creation.project.id
      )
        throw new Error('fake_invalid_response');
      return {
        project: creation.project,
        workPackage,
        steps,
      };
    };
  }
  const listWorkPackagesAnswer = answers.listWorkPackages;
  if (listWorkPackagesAnswer !== undefined) {
    checked.listWorkPackages = async () => {
      // Proof: bypassing this client let listWorkPackages resolve a work package whose createdAt was
      // "yesterday" instead of rejecting it with fake_invalid_response. Supplying missing name
      // through workPackageWire's default also resolved as name: "Fake work package" in the focused test.
      const client = clientFromShapes([listWorkPackages], async () => {
        const workPackages = await listWorkPackagesAnswer();
        return {
          kind: 'json' as const,
          status: 200,
          body: {
            workPackages: workPackages.map((workPackage) => ({
              ...workPackageWire(workPackage.id, workPackage.projectId),
              ...workPackage,
              projectId: workPackage.projectId,
              id: workPackage.id,
              name: workPackage.name,
              abbreviation: workPackage.abbreviation,
              restricted: workPackage.restricted,
              startDate: workPackage.startDate,
              createdAt: workPackage.createdAt,
              createdByName: workPackage.createdByName,
              lastOpenedAt: workPackage.lastOpenedAt,
            })),
          },
        };
      });
      const reply = await client.getApiWorkPackages({});
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return reply.body.workPackages.map((workPackage) => ({
        projectId: workPackage.projectId,
        id: workPackage.id,
        name: workPackage.name,
        abbreviation: workPackage.abbreviation,
        restricted: workPackage.restricted,
        startDate: workPackage.startDate,
        createdAt: workPackage.createdAt,
        createdByName: workPackage.createdByName,
        lastOpenedAt: workPackage.lastOpenedAt,
      }));
    };
  }

  const createWorkPackageAnswer = answers.createWorkPackage;
  if (createWorkPackageAnswer !== undefined) {
    checked.createWorkPackage = async (projectId, name) => {
      const started = startMutation(createWorkPackage, { body: { projectId, name } }, (prepared) =>
        createWorkPackageAnswer(prepared.body.projectId, prepared.body.name),
      );
      const { prepared, mutation } = isPromiseLike(started) ? await started : started;
      // Proof: bypassing this client made createWorkPackage(7) resolve
      // { id: "work-package-1", name: "Plan", restricted: false } instead of reject. Defaulting a
      // missing restricted likewise resolved it as false instead of fake_invalid_response.
      const client = clientFromShapes([createWorkPackage], async () => {
        const made = await mutation;
        return {
          kind: 'json' as const,
          status: 200,
          body: {
            workPackage: {
              ...workPackageWire(made.id, made.projectId),
              ...made,
              projectId: made.projectId,
              id: made.id,
              name: made.name,
              abbreviation: made.abbreviation,
              restricted: made.restricted,
            },
            steps: [],
          },
        };
      });
      const reply = await client.postApiWorkPackages({ body: prepared.body });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return {
        projectId: reply.body.workPackage.projectId,
        id: reply.body.workPackage.id,
        name: reply.body.workPackage.name,
        abbreviation: reply.body.workPackage.abbreviation,
        restricted: reply.body.workPackage.restricted,
      };
    };
  }

  const openWorkPackageAnswer = answers.openWorkPackage;
  if (openWorkPackageAnswer !== undefined) {
    checked.openWorkPackage = async (workPackageId) => {
      const started = startMutation(
        recordWorkPackageOpen,
        { params: { id: workPackageId } },
        (prepared) => openWorkPackageAnswer(prepared.params.id),
      );
      const { prepared, mutation } = isPromiseLike(started) ? await started : started;
      const client = clientFromShapes([recordWorkPackageOpen], async () => {
        await mutation;
        return { kind: 'empty' as const, status: 204 };
      });
      const reply = await client.postApiWorkPackagesByIdOpened({ params: prepared.params });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
    };
  }

  const treeAnswer = answers.tree;
  if (treeAnswer !== undefined) {
    checked.tree = async (workPackageId) => {
      const completed = new CapturedAnswer<PlanRead>();
      // Proof: the former global exemption made a direct tree with seq: "next" resolve the
      // malformed PlanRead; refusing-api.test.ts observed the complete object instead of rejection.
      const client = clientFromShapes([getWorkItems], async () => {
        const plan = await treeAnswer(workPackageId);
        completed.set(plan);
        return { kind: 'json' as const, status: 200, body: planWire(workPackageId, plan) };
      });
      const reply = await client['getApiWorkPackagesByIdWork-items']({
        params: { id: workPackageId },
      });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      const plan = completed.get('tree');
      const { optimization: wireOptimization, ...body } = reply.body;
      return {
        ...body,
        ...plan,
        // Missing optional fields stay absent across nested checked facades.
        ...(wireOptimization === undefined ? {} : { optimization: plan.optimization }),
        workItems: reply.body.workItems.map((row, position) => {
          const facadeRow = plan.workItems.at(position);
          if (facadeRow === undefined) throw new Error('validated tree lost a work item');
          return {
            ...row,
            ...facadeRow,
            teamIds: [...row.teamIds],
            tagIds: [...row.tagIds],
            serviceIds: [...row.serviceIds],
            typeIds: [...row.typeIds],
            externalRefs: row.externalRefs.map((reference) => ({ ...reference })),
          };
        }),
      };
    };
  }

  const exportPlanAnswer = answers.exportPlan;
  if (exportPlanAnswer !== undefined) {
    checked.exportPlan = async (workPackageId) => {
      const client = clientFromShapes([exportWorkPackage], async () => ({
        kind: 'json' as const,
        status: 200,
        body: await exportPlanAnswer(workPackageId),
      }));
      const reply = await client.getApiWorkPackagesByIdExport({
        params: { id: workPackageId },
        query: { format: 'json' },
      });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      if (reply.representation !== 'json') throw new Error('fake_invalid_response');
      return reply.body;
    };
  }

  const importPlanAnswer = answers.importPlan;
  if (importPlanAnswer !== undefined) {
    checked.importPlan = async (projectId, document, options) => {
      const retained = structuredClone(document);
      const defineMissing = options.defineMissing;
      const client = clientFromShapes([importWorkPackage], async () => ({
        kind: 'json' as const,
        status: 201,
        body: await importPlanAnswer(projectId, retained, { defineMissing }),
      }));
      const reply = await client.postApiWorkPackagesImport({
        body: { projectId, document: retained, defineMissing },
      });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return reply.body;
    };
  }

  const setAbbreviationAnswer = answers.setAbbreviation;
  if (setAbbreviationAnswer !== undefined) {
    checked.setAbbreviation = async (workPackageId, abbreviation) => {
      const preflight = preflightFakeRequest(patchWorkPackage, {
        params: { id: workPackageId },
        body: { abbreviation },
      });
      const prepared = isPromiseLike(preflight) ? await preflight : preflight;
      const projectId = projectIdOf(prepared.params.id);
      const canonical = await setAbbreviationAnswer(prepared.params.id, abbreviation);
      const client = clientFromShapes([patchWorkPackage], () =>
        Promise.resolve({
          kind: 'json' as const,
          status: 200,
          body: {
            workPackage: workPackageWire(prepared.params.id, projectId, {
              abbreviation: canonical,
            }),
          },
        }),
      );
      const reply = await client.patchApiWorkPackagesById({
        params: prepared.params,
        body: prepared.body,
      });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return reply.body.workPackage.abbreviation;
    };
  }

  const renameWorkPackageAnswer = answers.renameWorkPackage;
  if (renameWorkPackageAnswer !== undefined) {
    checked.renameWorkPackage = (workPackageId, name) =>
      throughWorkPackagePatch(
        workPackageId,
        { name },
        (normalizedWorkPackageId, normalizedPatch) =>
          renameWorkPackageAnswer(normalizedWorkPackageId, normalizedPatch.name),
        projectIdOf,
      );
  }

  const setEstimateMethodAnswer = answers.setEstimateMethod;
  if (setEstimateMethodAnswer !== undefined) {
    checked.setEstimateMethod = (workPackageId, method) =>
      throughWorkPackagePatch(
        workPackageId,
        { estimateMethod: method },
        (normalizedWorkPackageId, patch) =>
          setEstimateMethodAnswer(normalizedWorkPackageId, patch.estimateMethod),
        projectIdOf,
      );
  }

  const setEstimateArithmeticAnswer = answers.setEstimateArithmetic;
  if (setEstimateArithmeticAnswer !== undefined) {
    checked.setEstimateArithmetic = (workPackageId, arithmetic) =>
      throughWorkPackagePatch(
        workPackageId,
        arithmetic,
        (normalizedWorkPackageId, normalizedArithmetic) =>
          setEstimateArithmeticAnswer(normalizedWorkPackageId, normalizedArithmetic),
        projectIdOf,
      );
  }

  const setDepReachAnswer = answers.setDepReach;
  if (setDepReachAnswer !== undefined) {
    checked.setDepReach = (workPackageId, reach) =>
      throughWorkPackagePatch(
        workPackageId,
        { depReach: reach },
        (normalizedWorkPackageId, patch) =>
          setDepReachAnswer(normalizedWorkPackageId, patch.depReach),
        projectIdOf,
      );
  }

  const setOptimizationSettingsAnswer = answers.setOptimizationSettings;
  if (setOptimizationSettingsAnswer !== undefined) {
    checked.setOptimizationSettings = (workPackageId, patch) =>
      throughWorkPackagePatch(
        workPackageId,
        patch,
        (normalizedWorkPackageId, normalizedPatch) =>
          setOptimizationSettingsAnswer(normalizedWorkPackageId, normalizedPatch),
        projectIdOf,
      );
  }

  const retryOptimizationAnswer = answers.retryOptimization;
  if (retryOptimizationAnswer !== undefined) {
    // Through the real shape like every wrapper here, so a test cannot assert
    // on a body be-01 would have refused. The 202 carries the variant back;
    // the caller ignores it and re-reads, which is what the screen does.
    checked.retryOptimization = async (workPackageId, objective, inputHash) => {
      const client = clientFromShapes([retryWorkPackageOptimization], async () => {
        await retryOptimizationAnswer(workPackageId, objective, inputHash);
        return {
          kind: 'json' as const,
          status: 202,
          body: { state: 'retrying' as const, generation: 1, inputHash },
        };
      });
      const reply = await client.postApiWorkPackagesByIdOptimizationRetry({
        params: { id: workPackageId },
        body: { objective, inputHash },
      });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') {
        throw new Error('code' in reply.body ? reply.body.code : reply.body.error);
      }
    };
  }

  const setStartDateAnswer = answers.setStartDate;
  if (setStartDateAnswer !== undefined) {
    checked.setStartDate = (workPackageId, startDate) =>
      throughWorkPackagePatch(
        workPackageId,
        { startDate },
        (normalizedWorkPackageId, patch) =>
          setStartDateAnswer(normalizedWorkPackageId, patch.startDate),
        projectIdOf,
      );
  }

  const setTimezoneAnswer = answers.setTimezone;
  if (setTimezoneAnswer !== undefined) {
    checked.setTimezone = (workPackageId, timezone) =>
      throughWorkPackagePatch(
        workPackageId,
        { timezone },
        (normalizedWorkPackageId, patch) =>
          setTimezoneAnswer(normalizedWorkPackageId, patch.timezone),
        projectIdOf,
      );
  }

  const listTimezonesAnswer = answers.listTimezones;
  if (listTimezonesAnswer !== undefined) {
    checked.listTimezones = async () => {
      const client = clientFromShapes([readTimezones], async () => ({
        kind: 'json',
        status: 200,
        body: { timezones: await listTimezonesAnswer() },
      }));
      const reply = await client.getApiTimezones({});
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return reply.body.timezones;
    };
  }

  const stepsAnswer = answers.steps;
  if (stepsAnswer !== undefined) {
    checked.steps = async (workPackageId) => {
      const client = clientFromShapes([readWorkPackage], async () => ({
        kind: 'json' as const,
        status: 200,
        body: {
          workPackage: workPackageWire(workPackageId, projectIdOf(workPackageId)),
          // A distinct placeholder code per position: the read requires one,
          // and the screens this checks read only ids and names.
          steps: (await stepsAnswer(workPackageId)).map((step, position) => ({
            ...step,
            workPackageId,
            position,
            code: `fake-${String(position + 1)}`,
          })),
        },
      }));
      const reply = await client.getApiWorkPackagesById({ params: { id: workPackageId } });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return reply.body.steps.map(stepViewOf);
    };
  }

  const undoAnswer = answers.undo;
  if (undoAnswer !== undefined) {
    checked.undo = async (workPackageId) => {
      const started = startMutation(
        undoWorkPackage,
        { params: { id: workPackageId } },
        (prepared) => undoAnswer(prepared.params.id),
      );
      const { prepared, mutation } = isPromiseLike(started) ? await started : started;
      // Proof: bypassing this client let stale_undo detail 7 resolve instead of rejecting
      // the malformed modeled refusal with fake_invalid_response. Returning the raw checked
      // answer also leaked unchecked: true; the exact-equality case observed that extra key.
      const client = clientFromShapes([undoWorkPackage], async () => {
        const answer = await mutation;
        return isFacadeSuccess(answer)
          ? {
              kind: 'json' as const,
              status: 200,
              body: { ...answer, done: answer.done, detail: answer.detail },
            }
          : {
              kind: 'json' as const,
              status: 409,
              body: { ...answer, error: answer.reason, detail: answer.detail },
            };
      });
      const reply = await client.postApiWorkPackagesByIdUndo({ params: prepared.params });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'success')
        return { ok: true, done: reply.body.done, detail: reply.body.detail };
      if (reply.body.error === 'nothing_to_undo' || reply.body.error === 'stale_undo')
        return { ok: false, reason: reply.body.error, detail: reply.body.detail };
      throw new Error(reply.body.error);
    };
  }

  const redoAnswer = answers.redo;
  if (redoAnswer !== undefined) {
    checked.redo = async (workPackageId) => {
      const started = startMutation(
        redoWorkPackage,
        { params: { id: workPackageId } },
        (prepared) => redoAnswer(prepared.params.id),
      );
      const { prepared, mutation } = isPromiseLike(started) ? await started : started;
      // Proof: returning the raw checked redo answer leaked unchecked: true; the shared
      // exact-equality case observed that extra key beside ok, done, and detail.
      const client = clientFromShapes([redoWorkPackage], async () => {
        const answer = await mutation;
        return isFacadeSuccess(answer)
          ? {
              kind: 'json' as const,
              status: 200,
              body: { ...answer, done: answer.done, detail: answer.detail },
            }
          : {
              kind: 'json' as const,
              status: 409,
              body: { ...answer, error: answer.reason, detail: answer.detail },
            };
      });
      const reply = await client.postApiWorkPackagesByIdRedo({ params: prepared.params });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'success')
        return { ok: true, done: reply.body.done, detail: reply.body.detail };
      if (reply.body.error === 'nothing_to_undo' || reply.body.error === 'stale_undo')
        return { ok: false, reason: reply.body.error, detail: reply.body.detail };
      throw new Error(reply.body.error);
    };
  }

  const listTeamsAnswer = answers.listTeams;
  if (listTeamsAnswer !== undefined) {
    checked.listTeams = async () => {
      const client = clientFromShapes([listTeams], async () => ({
        kind: 'json',
        status: 200,
        body: { teams: await listTeamsAnswer() },
      }));
      const reply = await client.getApiTeams({});
      // Proof: returning a team without serviceIds made this call reject with
      // fake_invalid_response in refusing-api.test.ts instead of reaching a screen.
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return reply.body.teams;
    };
  }

  const listPeopleAnswer = answers.listPeople;
  if (listPeopleAnswer !== undefined) {
    checked.listPeople = async () => {
      const client = clientFromShapes([listPeople], async () => ({
        kind: 'json',
        status: 200,
        body: { people: await listPeopleAnswer() },
      }));
      const reply = await client.getApiPeople({});
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return reply.body.people;
    };
  }

  const listTagsAnswer = answers.listTags;
  if (listTagsAnswer !== undefined) {
    checked.listTags = async () => {
      const client = clientFromShapes([listTags], async () => ({
        kind: 'json',
        status: 200,
        body: { tags: await listTagsAnswer() },
      }));
      const reply = await client.getApiTags({});
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return reply.body.tags;
    };
  }

  const listServicesAnswer = answers.listServices;
  if (listServicesAnswer !== undefined) {
    checked.listServices = async () => {
      const client = clientFromShapes([listServices], async () => ({
        kind: 'json',
        status: 200,
        body: { services: await listServicesAnswer() },
      }));
      const reply = await client.getApiServices({});
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return reply.body.services;
    };
  }

  const listWorkItemTypesAnswer = answers.listWorkItemTypes;
  if (listWorkItemTypesAnswer !== undefined) {
    checked.listWorkItemTypes = async () => {
      const client = clientFromShapes([listWorkItemTypes], async () => ({
        kind: 'json',
        status: 200,
        body: { workItemTypes: await listWorkItemTypesAnswer() },
      }));
      const reply = await client['getApiWork-item-types']({});
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return reply.body.workItemTypes;
    };
  }

  const listExternalSystemsAnswer = answers.listExternalSystems;
  if (listExternalSystemsAnswer !== undefined) {
    checked.listExternalSystems = async () => {
      const client = clientFromShapes([listExternalSystems], async () => ({
        kind: 'json',
        status: 200,
        body: { externalSystems: await listExternalSystemsAnswer() },
      }));
      const reply = await client['getApiExternal-systems']({});
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return reply.body.externalSystems;
    };
  }

  const listCalendarMarkersAnswer = answers.listCalendarMarkers;
  if (listCalendarMarkersAnswer !== undefined) {
    checked.listCalendarMarkers = async (workPackageId) => {
      const client = clientFromShapes([listCalendarMarkers], async () => ({
        kind: 'json',
        status: 200,
        body: {
          markers: (await listCalendarMarkersAnswer(workPackageId)).map((marker) =>
            markerWire(workPackageId, marker),
          ),
        },
      }));
      const reply = await client['getApiWorkPackagesByIdCalendar-markers']({
        params: { id: workPackageId },
      });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return reply.body.markers.map(markerView);
    };
  }

  const readClaimsAnswer = answers.readClaims;
  if (readClaimsAnswer !== undefined) {
    checked.readClaims = async (workPackageId) => {
      const client = clientFromShapes([readWorkPackageClaims], async () => ({
        kind: 'json',
        status: 200,
        body: await readClaimsAnswer(workPackageId),
      }));
      const reply = await client.getApiWorkPackagesByIdClaims({ params: { id: workPackageId } });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return reply.body;
    };
  }

  const readResourcesAnswer = answers.readResources;
  if (readResourcesAnswer !== undefined) {
    checked.readResources = async (workPackageId) => {
      const client = clientFromShapes([readWorkPackageResources], async () => ({
        kind: 'json',
        status: 200,
        body: await readResourcesAnswer(workPackageId),
      }));
      const reply = await client.getApiWorkPackagesByIdResources({ params: { id: workPackageId } });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return reply.body;
    };
  }

  const setDemandsAnswer = answers.setDemands;
  if (setDemandsAnswer !== undefined) {
    checked.setDemands = async (workPackageId, statements) => {
      const commands = statements.map(({ workItemId, resourceId, units }) => ({
        kind: 'setDemand' as const,
        workItemId,
        resourceId,
        units,
      }));
      const preflight = preflightFakeRequest(applyWorkPackageCommands, {
        params: { id: workPackageId },
        body: { commands },
      });
      const prepared = isPromiseLike(preflight) ? await preflight : preflight;
      const mutation = setDemandsAnswer(prepared.params.id, statements);
      const client = clientFromShapes([applyWorkPackageCommands], async () => {
        await mutation;
        return {
          kind: 'json' as const,
          status: 200,
          body: {
            results: commands.map((_, index) => ({ index })),
            undoable: true,
            redoable: false,
          },
        };
      });
      const reply = await client.postApiWorkPackagesByIdCommands({
        params: prepared.params,
        body: prepared.body,
      });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
    };
  }

  const readClaimHistoryAnswer = answers.readClaimHistory;
  if (readClaimHistoryAnswer !== undefined) {
    checked.readClaimHistory = async (workPackageId) => {
      const client = clientFromShapes([readClaimHistory], async () => ({
        kind: 'json',
        status: 200,
        body: { events: await readClaimHistoryAnswer(workPackageId) },
      }));
      const reply = await client['getApiWorkPackagesByIdClaim-history']({
        params: { id: workPackageId },
        query: {},
      });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return reply.body.events;
    };
  }

  const createCalendarMarkerAnswer = answers.createCalendarMarker;
  if (createCalendarMarkerAnswer !== undefined) {
    checked.createCalendarMarker = async (workPackageId, marker) => {
      const started = startMutation(
        createCalendarMarker,
        { params: { id: workPackageId }, body: marker },
        (prepared) => createCalendarMarkerAnswer(prepared.params.id, prepared.body),
      );
      const { prepared, mutation } = isPromiseLike(started) ? await started : started;
      const client = clientFromShapes([createCalendarMarker], async () => ({
        kind: 'json',
        status: 201,
        body: {
          marker: markerWire(prepared.params.id, await mutation),
        },
      }));
      const reply = await client['postApiWorkPackagesByIdCalendar-markers']({
        params: prepared.params,
        body: prepared.body,
      });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return markerView(reply.body.marker);
    };
  }

  const renameCalendarMarkerAnswer = answers.renameCalendarMarker;
  if (renameCalendarMarkerAnswer !== undefined) {
    checked.renameCalendarMarker = async (workPackageId, markerId, name) => {
      const started = startMutation(
        updateCalendarMarker,
        { params: { id: workPackageId, markerId }, body: { name } },
        (prepared) =>
          // The facade requires name and JSON normalization cannot omit a string value.
          renameCalendarMarkerAnswer(
            prepared.params.id,
            prepared.params.markerId,
            requiredNormalized(prepared.body.name),
          ),
      );
      const { prepared, mutation } = isPromiseLike(started) ? await started : started;
      const client = clientFromShapes([updateCalendarMarker], async () => ({
        kind: 'json',
        status: 200,
        body: {
          marker: markerWire(prepared.params.id, await mutation),
        },
      }));
      const reply = await client['patchApiWorkPackagesByIdCalendar-markersByMarkerId']({
        params: prepared.params,
        body: prepared.body,
      });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return markerView(reply.body.marker);
    };
  }

  const recolorCalendarMarkerAnswer = answers.recolorCalendarMarker;
  if (recolorCalendarMarkerAnswer !== undefined) {
    checked.recolorCalendarMarker = async (workPackageId, markerId, color) => {
      const started = startMutation(
        updateCalendarMarker,
        { params: { id: workPackageId, markerId }, body: { color } },
        (prepared) =>
          // The facade supplies color and JSON normalization retains string and null values.
          recolorCalendarMarkerAnswer(
            prepared.params.id,
            prepared.params.markerId,
            requiredNormalized(prepared.body.color),
          ),
      );
      const { prepared, mutation } = isPromiseLike(started) ? await started : started;
      const client = clientFromShapes([updateCalendarMarker], async () => ({
        kind: 'json',
        status: 200,
        body: {
          marker: markerWire(prepared.params.id, await mutation),
        },
      }));
      const reply = await client['patchApiWorkPackagesByIdCalendar-markersByMarkerId']({
        params: prepared.params,
        body: prepared.body,
      });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return markerView(reply.body.marker);
    };
  }

  const deleteCalendarMarkerAnswer = answers.deleteCalendarMarker;
  if (deleteCalendarMarkerAnswer !== undefined) {
    checked.deleteCalendarMarker = async (workPackageId, markerId) => {
      const started = startMutation(
        removeCalendarMarker,
        { params: { id: workPackageId, markerId } },
        (prepared) => deleteCalendarMarkerAnswer(prepared.params.id, prepared.params.markerId),
      );
      const { prepared, mutation } = isPromiseLike(started) ? await started : started;
      const client = clientFromShapes([removeCalendarMarker], async () => {
        await mutation;
        return { kind: 'empty', status: 204 };
      });
      const reply = await client['deleteApiWorkPackagesByIdCalendar-markersByMarkerId']({
        params: prepared.params,
      });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
    };
  }
  const setStepAllowanceAnswer = answers.setStepAllowance;
  if (setStepAllowanceAnswer !== undefined) {
    checked.setStepAllowance = async (workPackageId, stepId, allowancePercent) => {
      // Proof: rounding this admission failed the fractional facade case and the real fake's unchanged-step refusal.
      const allowanceBps = allowanceHundredthsOf(allowancePercent);
      // Proof: omission lost four exact invalid_allowance outcomes; lower wire validation still blocked malformed bodies (step-values-boundary.test.ts).
      if (allowanceBps === null) throw new RangeError('invalid_allowance');
      const started = startMutation(
        patchWorkPackageStepValues,
        // Proof: zeroing the encoded allowance changed the admitted mutation; exact precision observation failed in step-values-boundary.test.ts.
        { params: { id: workPackageId, stepId }, body: { allowanceBps } },
        (prepared) =>
          setStepAllowanceAnswer(
            prepared.params.id,
            prepared.params.stepId,
            requiredNormalized(prepared.body.allowanceBps) / 100,
          ),
      );
      const { prepared, mutation } = isPromiseLike(started) ? await started : started;
      const client = clientFromShapes([patchWorkPackageStepValues], async () => {
        try {
          const step = await mutation;
          return {
            kind: 'json',
            status: 200,
            body: { step: { ...step, workPackageId, position: 0 } },
          };
        } catch (cause) {
          if (!(cause instanceof Error)) throw cause;
          if (cause.message === 'not_found')
            return { kind: 'json', status: 404, body: { error: 'not_found' } };
          throw cause;
        }
      });
      const reply = await client.patchWorkPackageStepValues({
        params: prepared.params,
        body: prepared.body,
      });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return stepViewOf(reply.body.step);
    };
  }

  const setStepUnitAnswer = answers.setStepUnit;
  if (setStepUnitAnswer !== undefined) {
    checked.setStepUnit = async (workPackageId, stepId, estimateUnit) => {
      const started = startMutation(
        // Proof: reverting preflight to renameStep let hours reach the stated answer before transport refusal; the no-mutation case failed.
        patchWorkPackageStepValues,
        { params: { id: workPackageId, stepId }, body: { estimateUnit } },
        (prepared) =>
          // Proof: omitting required normalization admitted an absent facade unit; step-values-boundary.test.ts failed.
          setStepUnitAnswer(
            prepared.params.id,
            prepared.params.stepId,
            requiredNormalized(prepared.body.estimateUnit),
          ),
      );
      const { prepared, mutation } = isPromiseLike(started) ? await started : started;
      const client = clientFromShapes([patchWorkPackageStepValues], async () => {
        try {
          const step = await mutation;
          return {
            kind: 'json',
            status: 200,
            body: { step: { ...step, workPackageId, position: 0 } },
          };
        } catch (cause) {
          if (!(cause instanceof Error)) throw cause;
          if (cause instanceof EstimateUnitConflict)
            return {
              kind: 'json',
              status: 409,
              body: { error: 'estimates_present', count: cause.count },
            };
          if (cause.message === 'not_found')
            return { kind: 'json', status: 404, body: { error: 'not_found' } };
          throw cause;
        }
      });
      const reply = await client.patchWorkPackageStepValues({
        params: prepared.params,
        body: prepared.body,
      });
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') throw new Error(reply.body.error);
      return stepViewOf(reply.body.step);
    };
  }

  const setTeamCapacityAnswer = answers.setTeamCapacity;
  if (setTeamCapacityAnswer !== undefined) {
    checked.setTeamCapacity = (workPackageId, teamId, size) =>
      throughWorkPackageCommand(
        workPackageId,
        { kind: 'setCapacity', teamId, size },
        (normalizedWorkPackageId, normalized) =>
          setTeamCapacityAnswer(normalizedWorkPackageId, normalized.teamId, normalized.size),
        () => VOID_COMMAND_RESULT,
      );
  }

  const setPriorityBandsAnswer = answers.setPriorityBands;
  if (setPriorityBandsAnswer !== undefined) {
    checked.setPriorityBands = (workPackageId, bands) =>
      throughWorkPackageCommand(
        workPackageId,
        { kind: 'setPriorityBands', bands: [...bands] },
        (normalizedWorkPackageId, normalized) =>
          setPriorityBandsAnswer(normalizedWorkPackageId, normalized.bands),
        () => VOID_COMMAND_RESULT,
      );
  }

  const createWorkItemAnswer = answers.createWorkItem;
  if (createWorkItemAnswer !== undefined) {
    checked.createWorkItem = (workPackageId, input) =>
      throughWorkPackageCommand(
        workPackageId,
        { kind: 'createWorkItem', ...input },
        (normalizedWorkPackageId, normalized) =>
          createWorkItemAnswer(normalizedWorkPackageId, {
            parentId: normalized.parentId,
            ...(normalized.afterId === undefined ? {} : { afterId: normalized.afterId }),
            ...(normalized.name === undefined ? {} : { name: normalized.name }),
          }),
        (made) => ({ index: 0, id: made.id }),
        (validated) => {
          if (validated.id === undefined) throw new Error('fake_invalid_response');
          // Proof: passing the normalized wire command leaked kind: "createWorkItem" into
          // the facade spy; its exact-call test expected only { parentId: null }.
          return { id: validated.id };
        },
      );
  }

  const patchWorkItemAnswer = answers.patchWorkItem;
  if (patchWorkItemAnswer !== undefined) {
    checked.patchWorkItem = (workItemId, patch) => {
      const { teamIds, tagIds, serviceIds, typeIds, externalRefs, ...fields } = patch;
      return throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        {
          kind: 'patchWorkItem',
          workItemId,
          patch: {
            ...fields,
            ...(teamIds === undefined ? {} : { teamIds: [...teamIds] }),
            ...(tagIds === undefined ? {} : { tagIds: [...tagIds] }),
            ...(serviceIds === undefined ? {} : { serviceIds: [...serviceIds] }),
            ...(typeIds === undefined ? {} : { typeIds: [...typeIds] }),
            ...(externalRefs === undefined
              ? {}
              : { externalRefs: externalRefs.map((reference) => ({ ...reference })) }),
          },
        },
        (_normalizedWorkPackageId, normalized) =>
          patchWorkItemAnswer(normalized.workItemId, normalized.patch),
        () => VOID_COMMAND_RESULT,
      );
    };
  }

  const setStatusAnswer = answers.setStatus;
  if (setStatusAnswer !== undefined) {
    checked.setStatus = (workItemId, status, on, factStart) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        {
          kind: 'setStatus',
          workItemId,
          status,
          on,
          ...(factStart === undefined ? {} : { factStart }),
        },
        // `on` off the call rather than off the normalised command: the wire
        // shape has it optional, this client always sends it, and the fake's
        // answer wants the day as a string.
        (_normalizedWorkPackageId, normalized) =>
          setStatusAnswer(normalized.workItemId, status, on, factStart),
        () => VOID_COMMAND_RESULT,
      );
  }

  const setStepBlockedAnswer = answers.setStepBlocked;
  if (setStepBlockedAnswer !== undefined) {
    checked.setStepBlocked = (workItemId, stepId, isBlocked) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        { kind: 'setStepBlocked', workItemId, stepId, isBlocked },
        () => setStepBlockedAnswer(workItemId, stepId, isBlocked),
        () => VOID_COMMAND_RESULT,
      );
  }
  const startAttemptAnswer = answers.startAttempt;
  if (startAttemptAnswer !== undefined) {
    checked.startAttempt = (workItemId, stepId, executorPersonId) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        {
          kind: 'startAttempt',
          workItemId,
          stepId,
          ...(executorPersonId === undefined ? {} : { executorPersonId }),
        },
        () =>
          executorPersonId === undefined
            ? startAttemptAnswer(workItemId, stepId)
            : startAttemptAnswer(workItemId, stepId, executorPersonId),
        () => VOID_COMMAND_RESULT,
      );
  }

  const endAttemptAnswer = answers.endAttempt;
  if (endAttemptAnswer !== undefined) {
    checked.endAttempt = (workItemId, stepId, outcome, reference) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        {
          kind: 'endAttempt',
          workItemId,
          stepId,
          outcome,
          ...(reference === undefined ? {} : { reference }),
        },
        () =>
          reference === undefined
            ? endAttemptAnswer(workItemId, stepId, outcome)
            : endAttemptAnswer(workItemId, stepId, outcome, reference),
        () => VOID_COMMAND_RESULT,
      );
  }

  const removeAttemptAnswer = answers.removeAttempt;
  if (removeAttemptAnswer !== undefined) {
    checked.removeAttempt = (workItemId, stepId, attemptNumber) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        { kind: 'removeAttempt', workItemId, stepId, attemptNumber },
        () => removeAttemptAnswer(workItemId, stepId, attemptNumber),
        () => VOID_COMMAND_RESULT,
      );
  }

  const assignPersonAnswer = answers.assignPerson;
  if (assignPersonAnswer !== undefined) {
    checked.assignPerson = (workItemId, stepId, personId) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        { kind: 'setAssignee', workItemId, stepId, personId },
        (_normalizedWorkPackageId, normalized) =>
          assignPersonAnswer(normalized.workItemId, normalized.stepId, normalized.personId),
        () => VOID_COMMAND_RESULT,
      );
  }

  const moveWorkItemAnswer = answers.moveWorkItem;
  if (moveWorkItemAnswer !== undefined) {
    checked.moveWorkItem = (workItemId, parentId, afterId) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        { kind: 'moveWorkItem', workItemId, parentId, afterId },
        (_normalizedWorkPackageId, normalized) =>
          moveWorkItemAnswer(normalized.workItemId, normalized.parentId, normalized.afterId),
        () => VOID_COMMAND_RESULT,
      );
  }

  const duplicateWorkItemAnswer = answers.duplicateWorkItem;
  if (duplicateWorkItemAnswer !== undefined) {
    checked.duplicateWorkItem = (workItemId) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        { kind: 'duplicateWorkItem', workItemId },
        (_normalizedWorkPackageId, normalized) => duplicateWorkItemAnswer(normalized.workItemId),
        (made) => ({ index: 0, id: made.id }),
        (validated) => {
          if (validated.id === undefined) throw new Error('fake_invalid_response');
          return { id: validated.id };
        },
      );
  }

  const removeWorkItemAnswer = answers.removeWorkItem;
  if (removeWorkItemAnswer !== undefined) {
    checked.removeWorkItem = (workItemId, options) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        {
          kind: 'deleteWorkItem',
          workItemId,
          ...(options?.strategy === undefined ? {} : { strategy: options.strategy }),
        },
        (_normalizedWorkPackageId, normalized) => {
          // The facade distinguishes an omitted options argument from a supplied
          // object whose optional strategy leaves the JSON wire. Reconstruct only
          // that container/key presence; the value still comes from validated input.
          // Proof: reconstructing solely from normalized.strategy made the focused
          // boundary spy receive undefined instead of { strategy: undefined }.
          const normalizedOptions: DeleteOptions | undefined =
            options === undefined
              ? undefined
              : Object.hasOwn(options, 'strategy')
                ? { strategy: normalized.strategy }
                : {};
          return removeWorkItemAnswer(normalized.workItemId, normalizedOptions);
        },
        () => VOID_COMMAND_RESULT,
      );
  }

  const setEstimateAnswer = answers.setEstimate;
  if (setEstimateAnswer !== undefined) {
    checked.setEstimate = (workItemId, stepId, days) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        { kind: 'setEstimate', workItemId, stepId, days },
        (_normalizedWorkPackageId, normalized) =>
          setEstimateAnswer(normalized.workItemId, normalized.stepId, normalized.days),
        () => VOID_COMMAND_RESULT,
      );
  }

  const listMeasuresAnswer = answers.listMeasures;
  if (listMeasuresAnswer !== undefined) {
    // Through the real shape, so a definition be-01 could not send is refused
    // here, and `organization_required` travels as the 409 it is on the wire.
    checked.listMeasures = async () => {
      const client = clientFromShapes([listMeasures], async () => {
        const directory = await listMeasuresAnswer();
        return directory.kind === 'ready'
          ? { kind: 'json' as const, status: 200, body: { measures: directory.measures } }
          : { kind: 'json' as const, status: 409, body: { error: 'organization_required' } };
      });
      const reply = await client.getApiMeasures({});
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'success') return { kind: 'ready', measures: reply.body.measures };
      if (reply.body.error === 'organization_required') return { kind: 'organization_required' };
      throw new Error(reply.body.error);
    };
  }

  const setMeasureEstimateAnswer = answers.setMeasureEstimate;
  if (setMeasureEstimateAnswer !== undefined) {
    checked.setMeasureEstimate = (workItemId, stepId, measure, estimate, rateCardDigest) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        {
          kind: 'setMeasureEstimate',
          workItemId,
          stepId,
          measure,
          estimate: { ...estimate },
          ...(rateCardDigest === undefined ? {} : { rateCardDigest }),
        },
        (_normalizedWorkPackageId, normalized) =>
          setMeasureEstimateAnswer(
            workItemId,
            stepId,
            normalized.measure,
            normalized.estimate,
            normalized.rateCardDigest,
          ),
        () => VOID_COMMAND_RESULT,
      );
  }

  const clearMeasureEstimateAnswer = answers.clearMeasureEstimate;
  if (clearMeasureEstimateAnswer !== undefined) {
    checked.clearMeasureEstimate = (workItemId, stepId, measure) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        { kind: 'clearMeasureEstimate', workItemId, stepId, measure },
        (_normalizedWorkPackageId, normalized) =>
          clearMeasureEstimateAnswer(workItemId, stepId, normalized.measure),
        () => VOID_COMMAND_RESULT,
      );
  }

  const setMeasureAnswer = answers.setMeasure;
  if (setMeasureAnswer !== undefined) {
    checked.setMeasure = (workItemId, stepId, metric, value, rateCardDigest) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        {
          kind: 'setMeasure',
          workItemId,
          stepId,
          metric,
          value,
          ...(rateCardDigest === undefined ? {} : { rateCardDigest }),
        },
        (_normalizedWorkPackageId, normalized) =>
          setMeasureAnswer(
            workItemId,
            stepId,
            normalized.metric,
            normalized.value,
            normalized.rateCardDigest,
          ),
        () => VOID_COMMAND_RESULT,
      );
  }

  const clearMeasureAnswer = answers.clearMeasure;
  if (clearMeasureAnswer !== undefined) {
    checked.clearMeasure = (workItemId, stepId, metric) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        { kind: 'clearMeasure', workItemId, stepId, metric },
        (_normalizedWorkPackageId, normalized) =>
          clearMeasureAnswer(workItemId, stepId, normalized.metric),
        () => VOID_COMMAND_RESULT,
      );
  }

  const setBudgetAnswer = answers.setBudget;
  if (setBudgetAnswer !== undefined) {
    checked.setBudget = (workItemId, measure, budget) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        {
          kind: 'setBudget',
          workItemId,
          measure,
          cap: budget.cap,
          policy: budget.policy,
          ...(budget.holdPerAttempt === undefined ? {} : { holdPerAttempt: budget.holdPerAttempt }),
        },
        (_normalizedWorkPackageId, normalized) =>
          setBudgetAnswer(workItemId, normalized.measure, {
            cap: normalized.cap,
            policy: normalized.policy,
            ...(normalized.holdPerAttempt === undefined
              ? {}
              : { holdPerAttempt: normalized.holdPerAttempt }),
          }),
        () => VOID_COMMAND_RESULT,
      );
  }

  const clearBudgetAnswer = answers.clearBudget;
  if (clearBudgetAnswer !== undefined) {
    checked.clearBudget = (workItemId, measure) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        { kind: 'clearBudget', workItemId, measure },
        (_normalizedWorkPackageId, normalized) => clearBudgetAnswer(workItemId, normalized.measure),
        () => VOID_COMMAND_RESULT,
      );
  }

  const clearEstimateAnswer = answers.clearEstimate;
  if (clearEstimateAnswer !== undefined) {
    checked.clearEstimate = (workItemId, stepId) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        { kind: 'clearEstimate', workItemId, stepId },
        (_normalizedWorkPackageId, normalized) =>
          clearEstimateAnswer(normalized.workItemId, normalized.stepId),
        () => VOID_COMMAND_RESULT,
      );
  }

  const arrangeByScheduleAnswer = answers.arrangeBySchedule;
  if (arrangeByScheduleAnswer !== undefined) {
    checked.arrangeBySchedule = (workPackageId) =>
      throughWorkPackageCommand(
        workPackageId,
        { kind: 'arrangeBySchedule' },
        (normalizedWorkPackageId) => arrangeByScheduleAnswer(normalizedWorkPackageId),
        () => VOID_COMMAND_RESULT,
      );
  }

  const freezeWorkPackageAnswer = answers.freezeWorkPackage;
  if (freezeWorkPackageAnswer !== undefined) {
    checked.freezeWorkPackage = (workPackageId) =>
      throughWorkPackageCommand(
        workPackageId,
        { kind: 'freezeWorkPackage' },
        (normalizedWorkPackageId) => freezeWorkPackageAnswer(normalizedWorkPackageId),
        () => VOID_COMMAND_RESULT,
      );
  }

  const unfreezeWorkPackageAnswer = answers.unfreezeWorkPackage;
  if (unfreezeWorkPackageAnswer !== undefined) {
    checked.unfreezeWorkPackage = (workPackageId) =>
      throughWorkPackageCommand(
        workPackageId,
        { kind: 'unfreezeWorkPackage' },
        (normalizedWorkPackageId) => unfreezeWorkPackageAnswer(normalizedWorkPackageId),
        () => VOID_COMMAND_RESULT,
      );
  }

  const unfreezeWorkItemAnswer = answers.unfreezeWorkItem;
  if (unfreezeWorkItemAnswer !== undefined) {
    checked.unfreezeWorkItem = (workItemId) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        { kind: 'unfreezeWorkItem', workItemId },
        (_normalizedWorkPackageId, normalized) => unfreezeWorkItemAnswer(normalized.workItemId),
        () => VOID_COMMAND_RESULT,
      );
  }

  const claimWorkItemAnswer = answers.claimWorkItem;
  if (claimWorkItemAnswer !== undefined) {
    checked.claimWorkItem = (workItemId, personId) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        { kind: 'claimWorkItem', workItemId, personId },
        (_normalizedWorkPackageId, normalized) =>
          claimWorkItemAnswer(normalized.workItemId, personId),
        () => VOID_COMMAND_RESULT,
      );
  }

  const releaseWorkItemAnswer = answers.releaseWorkItem;
  if (releaseWorkItemAnswer !== undefined) {
    checked.releaseWorkItem = (workItemId, personId) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        { kind: 'releaseWorkItem', workItemId, personId },
        (_normalizedWorkPackageId, normalized) =>
          releaseWorkItemAnswer(normalized.workItemId, personId),
        () => VOID_COMMAND_RESULT,
      );
  }

  const addDependencyAnswer = answers.addDependency;
  if (addDependencyAnswer !== undefined) {
    checked.addDependency = (workItemId, predecessorId) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        { kind: 'addDependency', workItemId, predecessorId },
        (_normalizedWorkPackageId, normalized) =>
          addDependencyAnswer(normalized.workItemId, normalized.predecessorId),
        () => VOID_COMMAND_RESULT,
      );
  }

  const removeDependencyAnswer = answers.removeDependency;
  if (removeDependencyAnswer !== undefined) {
    checked.removeDependency = (workItemId, predecessorId) =>
      throughWorkPackageCommand(
        FAKE_WORK_PACKAGE_ID,
        { kind: 'removeDependency', workItemId, predecessorId },
        (_normalizedWorkPackageId, normalized) =>
          removeDependencyAnswer(normalized.workItemId, normalized.predecessorId),
        () => VOID_COMMAND_RESULT,
      );
  }

  const addTypedDependencyAnswer = answers.addTypedDependency;
  if (addTypedDependencyAnswer !== undefined) {
    checked.addTypedDependency = (workPackageId, predecessor, successor, type) =>
      throughWorkPackageCommand(
        workPackageId,
        { kind: 'addTypedDependency', predecessor, successor, type },
        (normalizedWorkPackageId, normalized) =>
          addTypedDependencyAnswer(
            normalizedWorkPackageId,
            normalized.predecessor,
            normalized.successor,
            normalized.type,
          ),
        () => VOID_COMMAND_RESULT,
      );
  }
  const updateTypedDependencyAnswer = answers.updateTypedDependency;
  if (updateTypedDependencyAnswer !== undefined) {
    checked.updateTypedDependency = (workPackageId, dependencyId, predecessor, successor, type) =>
      throughWorkPackageCommand(
        workPackageId,
        { kind: 'updateTypedDependency', dependencyId, predecessor, successor, type },
        (normalizedWorkPackageId, normalized) =>
          updateTypedDependencyAnswer(
            normalizedWorkPackageId,
            normalized.dependencyId,
            normalized.predecessor,
            normalized.successor,
            normalized.type,
          ),
        () => VOID_COMMAND_RESULT,
      );
  }
  const removeTypedDependencyAnswer = answers.removeTypedDependency;
  if (removeTypedDependencyAnswer !== undefined) {
    checked.removeTypedDependency = (workPackageId, dependencyId) =>
      throughWorkPackageCommand(
        workPackageId,
        { kind: 'removeTypedDependency', dependencyId },
        (normalizedWorkPackageId, normalized) =>
          removeTypedDependencyAnswer(normalizedWorkPackageId, normalized.dependencyId),
        () => VOID_COMMAND_RESULT,
      );
  }

  const addServiceAnswer = answers.addService;
  if (addServiceAnswer !== undefined) {
    checked.addService = (name) =>
      throughDirectorySuccess(
        { kind: 'createService', name },
        (normalized) => addServiceAnswer(normalized.name),
        (service) => ({ index: 0, entity: service }),
        (validated) => {
          if (validated.entity === undefined) throw new Error('fake_invalid_response');
          return { id: validated.entity.id, name: validated.entity.name };
        },
      );
  }

  const addWorkItemTypeAnswer = answers.addWorkItemType;
  if (addWorkItemTypeAnswer !== undefined) {
    checked.addWorkItemType = (name) =>
      throughDirectorySuccess(
        { kind: 'createWorkItemType', name },
        (normalized) => addWorkItemTypeAnswer(normalized.name),
        (workItemType) => ({ index: 0, entity: workItemType }),
        (validated) => {
          if (validated.entity === undefined) throw new Error('fake_invalid_response');
          return { id: validated.entity.id, name: validated.entity.name };
        },
      );
  }

  const addTagAnswer = answers.addTag;
  if (addTagAnswer !== undefined) {
    checked.addTag = (name) =>
      throughDirectorySuccess(
        { kind: 'createTag', name },
        (normalized) => addTagAnswer(normalized.name),
        (tag) => ({ index: 0, entity: tag }),
        (validated) => {
          if (validated.entity === undefined) throw new Error('fake_invalid_response');
          return { id: validated.entity.id, name: validated.entity.name };
        },
      );
  }

  const addTeamAnswer = answers.addTeam;
  if (addTeamAnswer !== undefined) {
    checked.addTeam = (name) =>
      throughDirectorySuccess(
        { kind: 'createTeam', name },
        (normalized) => addTeamAnswer(normalized.name),
        (team) => ({ index: 0, entity: team }),
        (validated) => {
          if (validated.entity?.serviceIds === undefined) throw new Error('fake_invalid_response');
          return {
            id: validated.entity.id,
            name: validated.entity.name,
            serviceIds: [...validated.entity.serviceIds],
          };
        },
      );
  }

  const addPersonAnswer = answers.addPerson;
  if (addPersonAnswer !== undefined) {
    checked.addPerson = (name, teamIds) =>
      throughDirectorySuccess(
        { kind: 'createPerson', name, teamIds: [...teamIds] },
        (normalized) => addPersonAnswer(normalized.name, normalized.teamIds),
        (person) => ({ index: 0, entity: person }),
        // A create answers the identity and not the memberships: `personEntity`
        // in `work-item.routes.ts` is `{ id, name, kind }`, and the batch entity
        // in `work-item-shapes.ts` declares `'teamIds?'`. Requiring `teamIds`
        // here made the fake refuse the one shape be-01 sends — the same defect
        // production carried until 732614df, which this stood in for.
        (validated) => {
          const kind = validated.entity?.kind;
          if (validated.entity === undefined || (kind !== 'person' && kind !== 'agent'))
            throw new Error('fake_invalid_response');
          return { id: validated.entity.id, name: validated.entity.name, kind };
        },
      );
  }

  const renameTagAnswer = answers.renameTag;
  if (renameTagAnswer !== undefined) {
    checked.renameTag = async (tagId, name) => {
      const command = { kind: 'patchTag' as const, tagId, name };
      const started = startMutation(
        applyDirectoryCommands,
        { body: { commands: [command] } },
        (prepared) => {
          const normalized = prepared.body.commands.at(0);
          if (normalized?.kind !== command.kind)
            throw new Error('validated fake directory command changed identity');
          // The facade requires tagId and JSON normalization cannot omit a string value.
          return renameTagAnswer(requiredNormalized(normalized.tagId), normalized.name);
        },
      );
      const { prepared, mutation } = isPromiseLike(started) ? await started : started;
      const client = clientFromShapes([applyDirectoryCommands], async () => {
        const answer = await mutation;
        return isFacadeSuccess(answer)
          ? {
              kind: 'json' as const,
              status: 200,
              body: { results: [{ index: 0, entity: answer.entry }], ...answer },
            }
          : {
              kind: 'json' as const,
              status: 409,
              body: {
                ...answer,
                error: answer.reason,
                at: 0,
                kind: 'patchTag' as const,
                name: answer.survivingName,
              },
            };
      });
      const reply = await client.postApiDirectoryCommands({
        body: prepared.body,
      });
      // Proof: hard-coding error: "taken" let a facade reason: "in_use" resolve unchanged;
      // refusing-api.test.ts observed that object instead of fake_invalid_response.
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') {
        if (reply.body.error === 'taken')
          return { ok: false, reason: 'taken', survivingName: reply.body.name };
        throw new Error(reply.body.error);
      }
      const entity = reply.body.results.at(0)?.entity;
      if (entity === undefined) throw new Error('fake_invalid_response');
      return { ok: true, entry: { id: entity.id, name: entity.name } };
    };
  }

  const removeTagAnswer = answers.removeTag;
  if (removeTagAnswer !== undefined) {
    checked.removeTag = async (tagId, cascade) => {
      const command = { kind: 'deleteTag' as const, tagId, cascade };
      const started = startMutation(
        applyDirectoryCommands,
        { body: { commands: [command] } },
        (prepared) => {
          const normalized = prepared.body.commands.at(0);
          if (normalized?.kind !== command.kind)
            throw new Error('validated fake directory command changed identity');
          // The facade requires tagId and JSON normalization cannot omit a string value.
          return removeTagAnswer(requiredNormalized(normalized.tagId), normalized.cascade ?? false);
        },
      );
      const { prepared, mutation } = isPromiseLike(started) ? await started : started;
      const client = clientFromShapes([applyDirectoryCommands], async () => {
        const answer = await mutation;
        return isFacadeSuccess(answer)
          ? {
              kind: 'json' as const,
              status: 200,
              body: { results: [{ index: 0 }], ...answer },
            }
          : {
              kind: 'json' as const,
              status: 409,
              body: {
                ...answer,
                error: answer.reason,
                at: 0,
                kind: 'deleteTag' as const,
                usage: answer.usage,
              },
            };
      });
      const reply = await client.postApiDirectoryCommands({
        body: prepared.body,
      });
      // Proof: hard-coding error: "in_use" let a facade reason: "taken" resolve unchanged;
      // refusing-api.test.ts observed that object instead of fake_invalid_response.
      if (reply.kind === 'failure') boundaryFailure(reply.failure);
      if (reply.kind === 'refusal') {
        if (reply.body.error === 'in_use')
          return { ok: false, reason: 'in_use', usage: reply.body.usage };
        throw new Error(reply.body.error);
      }
      return { ok: true };
    };
  }
  return checked;
}

/**
 * A {@link WorkPackageApi} whose every method refuses, except the ones a test
 * states.
 *
 * Four suites had each written this stand-in out by hand — `app-router`,
 * `page-shortcuts`, `work-package-page`, `plan-cards` — and every copy had drifted
 * the same way: seven methods the interface has grown since
 * (`setPriorityBands`, `setTeamCapacity`, `setDepReach`,
 * `setEstimateArithmetic`, `renameTag`, `removeTag`, `addWorkItemType`) were
 * missing from all four, and three carried stubs under names it had renamed
 * away (`create`, `patch`, `assign`, `move`, `remove`, `duplicate`, `freeze`,
 * `unfreeze`). No `typecheck` target compiled a test file here until
 * 2026-09-02, so nothing said so.
 *
 * One of those dead names made a **shipped proof vacuous**:
 * `page-shortcuts.test.tsx` asserts that a command chord behind a modal never
 * reaches the write, and it was watching a spy named `create` — a method
 * `WorkPackageApi` stopped having. The recorded proof says that assertion was once
 * seen failing on "`api.create` called once", and it could not have failed
 * again after the rename.
 *
 * A `Proxy` rather than 43 written-out refusals, so it cannot drift again:
 * anything the interface grows is refused here the day it is added, and a test
 * that reaches a method it did not state says so out loud instead of passing
 * against a silent default.
 *
 * Only declared method names are callable; unsupported members, including promise
 * protocol names, are absent. Explicit fixture properties remain available.
 *
 * Stated methods whose client view maps directly onto an endpoint run through
 * {@link clientFromShapes} with the answer as their in-process transport. The
 * same request, response, and refusal shapes therefore guard both this focused
 * fake and {@link fakeWorkPackageApi}; a fixture cannot teach a screen a payload
 * the HTTP client would refuse.
 */
export function refusingApi<Answers extends Partial<WorkPackageApi>>(
  answers: Answers,
  context?: WorkPackageTransportContext,
): WorkPackageApi & Answers {
  return new Proxy(answers as WorkPackageApi, {
    get(target, key) {
      // Proof: replacing this lookup with `undefined` made all three boundary cases in
      // refusing-api.test.ts resolve instead of reject: malformed request, response, and refusal.
      const shaped: unknown = Reflect.get(checkedAnswers(target, context), key);
      if (shaped !== undefined) return shaped;
      const stated: unknown = Reflect.get(target, key);
      if (stated !== undefined && isWorkPackageApiMethod(key)) {
        // Proof: deleting removeDependency's wrapper made the exhaustive fake boundary test
        // fail with Received "Error: missing fake shape boundary: removeDependency".
        throw new Error(`missing fake shape boundary: ${key}`);
      }
      if (stated !== undefined) return stated;
      // Absent, not refused, for anything that is not a method name this api
      // could have. `then` is the one that matters: a proxy handing back a
      // function for it **is** a thenable, so awaiting anything that holds this
      // object calls it — 34 of `plan-cards.test.tsx`'s 118 cases failed on
      // `api.then is not one this test answers`, watched 2026-09-02, before
      // this line existed.
      // Proof: omitting this census exposed callable retired methods; the fake-surface case failed. Its healthy control also checks unknown symbols, awaiting the proxy and a declared missing answer.
      if (!isWorkPackageApiMethod(key)) return undefined;
      return () => Promise.reject(new Error(`api.${key} is not one this test answers`));
    },
  }) as WorkPackageApi & Answers;
}

/** The modeled unit-edit conflict carries the stored estimate count. */
export class EstimateUnitConflict extends Error {
  constructor(readonly count: number) {
    super('estimates_present');
  }
}
