import {
  type EstimateUnit,
  isDependencyEndpointScope,
  isEstimateUnit,
  isRelationshipType,
  type ScopedDependencyEndpoint,
} from '@wbs/domain';

import type { ScopedRevision, WorkItemAddress } from '../ports/dependency-context';
import type { ProgressKey, StoredProgress } from '../ports/progress-store';
import type { StoredAttempt } from '../ports/step-node-attempt-store';
import type { StoredTypedDependency } from '../ports/typed-dependency-store';
import type { Reparented } from '../ports/work-item-store';
import type { CommandSubject, CompensatingCommand, JournalPayload } from './compensating-command';

export type {
  AttemptKey,
  Batch,
  CommandSubject,
  CompensatingCommand,
  DeleteSubtree,
  DeletionState,
  JournalPayload,
  RestoreSubtree,
} from './compensating-command';

/**
 * `{workItemId: revision}`, for one moment in one entity's life — and, under
 * {@link stepRevisionKey}, a step's allowance revision.
 */
export type Revisions = Record<string, number>;

const STEP_REVISION_PREFIX = 'step:';

/**
 * The {@link Revisions} key a step's allowance revision is held under.
 * Work item ids are UUIDs, so the prefix cannot collide with one.
 */
export function stepRevisionKey(stepId: string): string {
  return `${STEP_REVISION_PREFIX}${stepId}`;
}

/** The step a {@link Revisions} key names, or `null` for a work item's key. */
export function stepOfRevisionKey(key: string): string | null {
  return key.startsWith(STEP_REVISION_PREFIX) ? key.slice(STEP_REVISION_PREFIX.length) : null;
}

/**
 * What an entry checks before it applies, and what lets the entry below it
 * still apply afterwards.
 *
 * `expected` is the condition: every entity the last-applied direction touched,
 * at the revision it left them. Nothing applies unless all of them still read
 * exactly that.
 *
 * `from` is what those entities read **before** that direction ran, and it
 * exists for one reason: an undo is itself a write. Undoing a rename moves the
 * row again, so the entry below — the rename before it — would be checking
 * against a revision that this account's own undo has just walked past, and a
 * second press of the key would refuse for no reason a reader could accept.
 *
 * `from` is what makes the difference between that and a genuine conflict
 * visible. After undoing E, the row holds exactly what the entry below left it
 * holding **if and only if** `E.from` is what that entry recorded as its
 * `expected` — nobody wrote between the two. When it matches, the entry below
 * is re-stamped to the revision the undo produced and stays usable; when
 * somebody else did write in between it does not match, is not re-stamped, and
 * refuses. See `openspec/changes/conditional-undo/design.md`.
 */
export interface ExternalRevisionPreconditions {
  readonly expected: readonly ScopedRevision[];
  readonly from: readonly ScopedRevision[];
}

export interface Preconditions {
  externalRevisions?: ExternalRevisionPreconditions;
  /** Exact destination progress sets checked before any move replay batch can clear them. */
  moveProgress?: Record<string, StoredProgress[]>;
  /** Immutable units from the original write; absent only in legacy workday-only journals. */
  estimateUnits?: Record<string, EstimateUnit>;
  expected: Revisions;
  from: Revisions;
}

export const STEP_BLOCKAGE_REPLAY_KINDS = ['replace_blockage'] as const;

/** Persisted replay semantics understood by this image, distinct from command discriminators. */
export const STEP_BLOCKAGE_REPLAY_CAPABILITIES = [
  'replace_blockage',
  'move_progress_v1',
  'delete_state_v1',
] as const;

const COMMANDS = [
  'patch',
  'set_estimate',
  'clear_estimate',
  'set_actual',
  'clear_actual',
  'set_measure',
  'clear_measure',
  'set_progress',
  'clear_progress',
  ...STEP_BLOCKAGE_REPLAY_KINDS,
  'assign',
  'set_demand',
  'add_claims',
  'remove_claims',
  'move_claims',
  'restore_attempt',
  'remove_attempt',
  'add_dependency',
  'remove_dependency',
  'add_typed_dependency',
  'remove_typed_dependency',
  'update_typed_dependency',
  'move',
  'set_frozen',
  'set_step_allowance',
  'set_positions',
  'delete_subtree',
  'restore_subtree',
  'batch',
] as const;

/**
 * A stored command, checked far enough to be dispatched on.
 *
 * The discriminator is checked recursively through batches so an older
 * release cannot silently skip a nested command. The conditional blockage
 * variant validates its pair and nullable safe-integer times, deletion snapshots
 * validate parent/root binding and complete owner-bound fact sets, and move snapshots
 * validate exact destination ownership, stored state/time and unique steps before
 * replay; malformed trusted history must not read as an absent fact. Other
 * fields were written by this process from typed values one statement earlier,
 * and a second schema for every legacy command would be a second definition.
 *
 * @throws for missing/unknown commands or malformed conditional blockage/progress/deletion metadata.
 */
export function readCommand(value: unknown): CompensatingCommand {
  if (typeof value !== 'object' || value === null || !('do' in value)) {
    throw new Error(`a journal entry holds no command: ${JSON.stringify(value)}`);
  }
  // `'do' in value` has already narrowed `value` to an object that has it.
  const named: unknown = value.do;
  if (typeof named !== 'string' || !(COMMANDS as readonly string[]).includes(named)) {
    throw new Error(`a journal entry names a command this release cannot apply: ${String(named)}`);
  }
  if (named === 'batch') {
    if (!('steps' in value) || !Array.isArray(value.steps))
      throw new Error('a journal batch has no steps');
    return { do: 'batch', steps: value.steps.map((step: unknown) => readCommand(step)) };
  }
  if (named === 'add_typed_dependency' || named === 'remove_typed_dependency') {
    if (!('dependency' in value)) throw new Error('journal typed dependency is missing');
    return { do: named, dependency: readJournalDependency(value.dependency) };
  }
  if (named === 'update_typed_dependency') {
    if (!('from' in value) || !('to' in value))
      throw new Error('journal typed dependency update is missing');
    return {
      do: named,
      from: readJournalDependency(value.from),
      to: readJournalDependency(value.to),
    };
  }
  if (named === 'replace_blockage') {
    const blockedTime = (time: unknown): boolean =>
      time === null || (typeof time === 'number' && Number.isSafeInteger(time));
    if (
      !('workItemId' in value) ||
      typeof value.workItemId !== 'string' ||
      !('stepId' in value) ||
      typeof value.stepId !== 'string' ||
      !('expectedBlockedAt' in value) ||
      !blockedTime(value.expectedBlockedAt) ||
      !('replacementBlockedAt' in value) ||
      !blockedTime(value.replacementBlockedAt)
    )
      throw new Error('a journal blockage replacement is malformed');
  }
  if (named === 'set_demand') {
    const units: unknown = 'units' in value ? value.units : undefined;
    // Proof: with this check removed, `refuses a malformed demand replay` in
    // compensating.test.ts read a demand of 0 units back; watched 2026-10-20.
    if (
      !('workItemId' in value) ||
      typeof value.workItemId !== 'string' ||
      !('resourceId' in value) ||
      typeof value.resourceId !== 'string' ||
      !(units === null || (typeof units === 'number' && Number.isSafeInteger(units) && units >= 1))
    )
      throw new Error('a journal demand replay is malformed');
  }
  if (named === 'restore_subtree' && 'demands' in value) {
    // Proof: with this call removed, `refuses a malformed restored demand` in
    // compensating.test.ts did not throw; watched 2026-10-20.
    readRestoredDemands(value);
  }
  if (named === 'add_claims' || named === 'remove_claims') {
    // Proof: with this call removed, `refuses a malformed claim replay` in
    // compensating.test.ts did not throw; watched 2026-10-19.
    readClaimReplay(value, named === 'add_claims' ? 'stated' : 'cleared');
  }
  if (named === 'move_claims') {
    // Proof: with this call removed, `refuses a malformed claim move` in
    // compensating.test.ts did not throw; watched 2026-10-20.
    readClaimMove(value);
  }
  if (named === 'move' && 'expectedProgress' in value) {
    // Proof: removing this boundary admitted a mounted guarded move with no destination; watched 2026-10-14.
    if (!('parentId' in value) || typeof value.parentId !== 'string')
      throw new Error('a journal move progress snapshot has no destination');
    readMoveProgress(value.expectedProgress, value.parentId);
  }
  if ((named === 'delete_subtree' || named === 'restore_subtree') && 'deletionState' in value) {
    // Proof: malformed persisted deletion metadata refuses before subtree insertion; watched owner/time/duplicate omissions call insertSubtree, 2026-10-14.
    const state = value.deletionState;
    if (
      typeof state !== 'object' ||
      state === null ||
      !('parentId' in state) ||
      (state.parentId !== null &&
        (typeof state.parentId !== 'string' || state.parentId.length === 0)) ||
      !('parentBlockages' in state) ||
      !('restoredParentProgress' in state) ||
      !('blockages' in state)
    )
      throw new Error('journal deletion state is malformed');
    const owners: string[] = [];
    if (named === 'delete_subtree') {
      if (!('remove' in value) || !Array.isArray(value.remove))
        throw new Error('journal deletion state has no removed owners');
      const removedOwners: readonly unknown[] = value.remove;
      for (const owner of removedOwners) {
        if (typeof owner !== 'string')
          throw new Error('journal deletion state has a malformed removed owner');
        owners.push(owner);
      }
    } else {
      if (!('rows' in value) || !Array.isArray(value.rows))
        throw new Error('journal deletion state has no restored owners');
      // Proof: removing parent binding admitted the wrong restoration parent in decoder test; watched 2026-10-14.
      const restoredRows: readonly unknown[] = value.rows;
      const root = restoredRows.at(0);
      if (
        typeof root !== 'object' ||
        root === null ||
        !('parentId' in root) ||
        root.parentId !== state.parentId
      )
        throw new Error('journal deletion state names the wrong restoration parent');
      for (const row of restoredRows) {
        if (typeof row !== 'object' || row === null || !('id' in row) || typeof row.id !== 'string')
          throw new Error('journal deletion state has malformed restored owners');
        owners.push(row.id);
      }
    }
    readDeletionBlockages(state.blockages, owners);
    if ('handedBlockages' in state)
      readDeletionBlockages(state.handedBlockages, state.parentId === null ? [] : [state.parentId]);
    readDeletionBlockages(state.parentBlockages, state.parentId === null ? [] : [state.parentId]);
    if (state.parentId === null) {
      if (!Array.isArray(state.restoredParentProgress) || state.restoredParentProgress.length !== 0)
        throw new Error('journal deletion state has progress without a parent');
    } else {
      readMoveProgress(state.restoredParentProgress, state.parentId);
    }
  }
  // The one cast in this file: known discriminators and nested commands have
  // been checked, and conditional blockage/move progress fields have their boundary
  // validation. Legacy fields remain this process's own writing.
  return value as CompensatingCommand;
}

/**
 * Historical local relationships have neither endpoint project; current records have both.
 * A partial or malformed scoped record must never fall back to legacy interpretation.
 * Proof: removing required relationship shape, endpoint shape, project type, step type,
 * whole/step pairing, mixed-scope refusal or successor-owner agreement separately
 * made `refuses partial scoped history and malformed new scoped history` accept its
 * malformed payload (2026-10-22).
 */
function readJournalDependency(value: unknown): StoredTypedDependency {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !('projectId' in value) ||
    typeof value.projectId !== 'string' ||
    !('predecessor' in value) ||
    !('successor' in value) ||
    !('type' in value) ||
    !isRelationshipType(value.type)
  ) {
    throw new Error('journal typed dependency is malformed');
  }
  const hasProject = (endpoint: unknown): boolean =>
    typeof endpoint === 'object' && endpoint !== null && 'projectId' in endpoint;
  const isScoped = hasProject(value.predecessor);
  if (isScoped !== hasProject(value.successor))
    throw new Error('journal typed dependency has partial project scope');
  const endpoint = (candidate: unknown): ScopedDependencyEndpoint => {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      !('scope' in candidate) ||
      !isDependencyEndpointScope(candidate.scope) ||
      !('workItemId' in candidate) ||
      typeof candidate.workItemId !== 'string'
    )
      throw new Error('journal typed dependency endpoint is malformed');
    const projectId: unknown =
      isScoped && 'projectId' in candidate ? candidate.projectId : value.projectId;
    if (typeof projectId !== 'string')
      throw new Error('journal typed dependency project is malformed');
    if (candidate.scope === 'whole') {
      if ('stepId' in candidate)
        throw new Error('journal typed dependency whole endpoint has a step');
      return { scope: candidate.scope, workItemId: candidate.workItemId, projectId };
    }
    if (!('stepId' in candidate) || typeof candidate.stepId !== 'string')
      throw new Error('journal typed dependency step is malformed');
    return {
      scope: candidate.scope,
      workItemId: candidate.workItemId,
      stepId: candidate.stepId,
      projectId,
    };
  };
  const predecessor = endpoint(value.predecessor);
  const successor = endpoint(value.successor);
  if (successor.projectId !== value.projectId)
    throw new Error('journal typed dependency successor owner disagrees');
  return { id: value.id, projectId: value.projectId, predecessor, successor, type: value.type };
}

/** Validates exact blockage identities and safe times within the deletion boundary. */
function readDeletionBlockages(value: unknown, owners: readonly string[]): void {
  if (!Array.isArray(value)) throw new Error('journal deletion blockages are not an array');
  const pairs = new Set<string>();
  const facts: readonly unknown[] = value;
  for (const fact of facts) {
    // Proof: removing owner membership or safe-time validation attempted mounted subtree insertion for malformed history; watched 2026-10-14.
    if (
      typeof fact !== 'object' ||
      fact === null ||
      !('workItemId' in fact) ||
      typeof fact.workItemId !== 'string' ||
      !owners.includes(fact.workItemId) ||
      !('stepId' in fact) ||
      typeof fact.stepId !== 'string' ||
      fact.stepId.length === 0 ||
      !('blockedAt' in fact) ||
      typeof fact.blockedAt !== 'number' ||
      !Number.isSafeInteger(fact.blockedAt)
    )
      throw new Error('journal deletion blockage is malformed');
    const pair = JSON.stringify([fact.workItemId, fact.stepId]);
    // Proof: removing duplicate refusal attempted mounted subtree insertion before failing later; watched 2026-10-14.
    if (pairs.has(pair)) throw new Error('journal deletion blockages repeat a pair');
    pairs.add(pair);
  }
}

/** Validates one complete sparse progress set bound to its recorded owner. */
function readMoveProgress(value: unknown, owner: string): StoredProgress[] {
  // Proof: bypassing array validation changed named refusal to a raw iteration failure; watched 2026-10-14.
  if (!Array.isArray(value)) throw new Error('a journal move progress snapshot is not an array');
  const facts: readonly unknown[] = value;
  const steps = new Set<string>();
  return facts.map((fact) => {
    // Proof: skipping field validation admitted malformed persisted snapshot fields; watched 2026-10-14.
    if (
      typeof fact !== 'object' ||
      fact === null ||
      !('workItemId' in fact) ||
      fact.workItemId !== owner ||
      !('stepId' in fact) ||
      typeof fact.stepId !== 'string' ||
      fact.stepId.length === 0 ||
      !('state' in fact) ||
      (fact.state !== 'done' && fact.state !== 'in_progress') ||
      !('statedAt' in fact) ||
      typeof fact.statedAt !== 'number' ||
      !Number.isSafeInteger(fact.statedAt)
    )
      throw new Error('a journal move progress snapshot is malformed');
    // Proof: accepting duplicate steps failed the mounted duplicate-snapshot case; watched 2026-10-14.
    if (steps.has(fact.stepId)) throw new Error('a journal move progress snapshot repeats a step');
    steps.add(fact.stepId);
    return { workItemId: owner, stepId: fact.stepId, state: fact.state, statedAt: fact.statedAt };
  });
}

/** Validates snapshot owner keys as well as each complete owner-bound progress set. */
function readMoveProgressOwners(value: unknown): Record<string, StoredProgress[]> {
  // Proof: bypassing map validation changed named trusted-history refusal to a raw error; watched 2026-10-14.
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('journal move progress owners are not a map');
  return Object.fromEntries(
    Object.entries(value).map(([owner, facts]) => {
      // Proof: skipping owner validation admitted an empty owner key; watched 2026-10-14.
      if (owner.length === 0) throw new Error('journal move progress has an empty owner');
      return [owner, readMoveProgress(facts, owner)];
    }),
  );
}

/** The `{label, forward}` a journal entry's payload is, checked the same far and no further. */
export function readPayload(value: unknown): JournalPayload {
  if (typeof value !== 'object' || value === null || !('forward' in value) || !('label' in value)) {
    throw new Error(`a journal entry holds no payload: ${JSON.stringify(value)}`);
  }
  const { label, forward }: { label: unknown; forward: unknown } = value;
  if (typeof label !== 'string') throw new Error('a journal entry has no label');
  return { label, forward: readCommand(forward) };
}

/** Stored replay preconditions, validating revisions and optional unit/progress metadata. */
export function readPreconditions(value: unknown): Preconditions {
  if (typeof value !== 'object' || value === null || !('expected' in value) || !('from' in value)) {
    throw new Error(`a journal entry holds no preconditions: ${JSON.stringify(value)}`);
  }
  return {
    ...('externalRevisions' in value
      ? { externalRevisions: readExternalRevisions(value.externalRevisions) }
      : {}),
    expected: readRevisions(value.expected),
    from: readRevisions(value.from),
    ...('moveProgress' in value
      ? { moveProgress: readMoveProgressOwners(value.moveProgress) }
      : {}),
    ...('estimateUnits' in value ? { estimateUnits: readEstimateUnits(value.estimateUnits) } : {}),
  };
}

/** Stable pair key; neither row IDs nor display references replace scoped identity. */
export function scopedRevisionKey(address: WorkItemAddress): string {
  return JSON.stringify([address.projectId, address.workItemId]);
}

function readExternalRevisions(value: unknown): ExternalRevisionPreconditions {
  // Proof: metadata-object-shape bypass failed `replay refuses missing-from trusted`'s selected assertion
  // (named diagnostic; later guards also refuse; watched 2026-10-22).
  if (typeof value !== 'object' || value === null || !('expected' in value) || !('from' in value))
    throw new Error('journal external revisions are malformed');
  const read = (entries: unknown): ScopedRevision[] => {
    // Proof: metadata-list-shape bypass failed `replay refuses non-list trusted`'s selected assertion
    // (named diagnostic; later guards also refuse; watched 2026-10-22).
    if (!Array.isArray(entries)) throw new Error('journal external revisions are not a list');
    const revisions: ScopedRevision[] = [];
    const seen = new Set<string>();
    const candidates: readonly unknown[] = entries;
    for (const entry of candidates) {
      // Proof: metadata-revision-value bypass failed `replay refuses invalid-revision trusted`'s selected assertion
      // (named diagnostic; later guards also refuse; watched 2026-10-22).
      if (
        typeof entry !== 'object' ||
        entry === null ||
        !('projectId' in entry) ||
        !('workItemId' in entry) ||
        !('revision' in entry) ||
        typeof entry.projectId !== 'string' ||
        entry.projectId.length === 0 ||
        typeof entry.workItemId !== 'string' ||
        entry.workItemId.length === 0 ||
        typeof entry.revision !== 'number' ||
        !Number.isSafeInteger(entry.revision) ||
        entry.revision < 0
      )
        throw new Error('journal external revision is malformed');
      const key = scopedRevisionKey({ projectId: entry.projectId, workItemId: entry.workItemId });
      // Proof: metadata-duplicate bypass failed `replay refuses duplicate trusted`'s selected assertion
      // (named diagnostic; later guards also refuse; watched 2026-10-22).
      if (seen.has(key)) throw new Error('journal external revisions contain a duplicate');
      seen.add(key);
      revisions.push({
        projectId: entry.projectId,
        workItemId: entry.workItemId,
        revision: entry.revision,
      });
    }
    return revisions;
  };
  return { expected: read(value.expected), from: read(value.from) };
}

/**
 * Owner-local typed add/update endpoints supplied by an earlier restore in the
 * selected replay direction's nested application order. This predicts missing
 * rows only; replay still authorizes restored rows and validates steps/shapes.
 */
export function restoredTypedAddressesOf(
  command: CompensatingCommand,
  ownerId: string,
): Set<string> {
  const restored = new Set<string>();
  const allowed = new Set<string>();
  const visit = (step: CompensatingCommand): void => {
    if (step.do === 'batch') {
      // Proof: precollecting later restores changed the real SQLite later-restore
      // refusal from not_found to application-time stale_undo (round1 ordering diagnostic).
      for (const nested of step.steps) visit(nested);
      return;
    }
    if (step.do === 'restore_subtree') {
      // Proof: removing the row-project condition failed the pure scanner's foreign
      // restore oracle; SQLite restored-row authority is independently retained.
      for (const row of step.rows) if (row.projectId === ownerId) restored.add(row.id);
    }
    // Proof: omitting UPDATE made both real mounted create/update redo regressions
    // return 409 instead of 200 (round1 compatibility failure).
    if (step.do === 'add_typed_dependency' || step.do === 'update_typed_dependency')
      for (const endpoint of referencesOf(step).scopedEndpoints) {
        // Proof: weakening exact membership changed SQLite different-address
        // not_found to stale_undo. Removing endpoint project equality failed the
        // pure remote-address oracle (ordering/classification, not unsafe writes).
        if (endpoint.projectId === ownerId && restored.has(endpoint.workItemId))
          allowed.add(scopedRevisionKey(endpoint));
      }
  };
  visit(command);
  return allowed;
}

/** Exact external address union named by forward and inverse, including nested batches. */
export function externalAddressesOf(
  commands: readonly CompensatingCommand[],
  ownerId: string,
): WorkItemAddress[] {
  const addresses = new Map<string, WorkItemAddress>();
  for (const command of commands)
    for (const endpoint of referencesOf(command).scopedEndpoints) {
      if (endpoint.projectId === ownerId) continue;
      addresses.set(scopedRevisionKey(endpoint), {
        projectId: endpoint.projectId,
        workItemId: endpoint.workItemId,
      });
    }
  return [...addresses.values()];
}

/** Trusted history cannot omit external preconditions or carry extra/local address authority. */
export function requireExternalRevisions(
  preconditions: Preconditions,
  ownerId: string,
  commands: readonly CompensatingCommand[],
): ExternalRevisionPreconditions | null {
  const required = new Set(externalAddressesOf(commands, ownerId).map(scopedRevisionKey));
  const external = preconditions.externalRevisions;
  if (external === undefined) {
    // Proof: missing-external-history-metadata bypass failed `history refuses missing external revision metadata`'s selected assertion
    // (actual SQLite boundary; watched 2026-10-22).
    if (required.size > 0) throw new Error('journal external revision coverage is missing');
    return null;
  }
  for (const entries of [external.expected, external.from]) {
    const keys = new Set(entries.map(scopedRevisionKey));
    // Proof: metadata-exact-coverage bypass failed `replay refuses omitted trusted`'s selected assertion
    // (actual SQLite boundary; watched 2026-10-22).
    // Proof: bypassing this consumer failed `omitted final remote revision`
    // at its real SQLite refusal assertion; zero partial effects also checked (2026-10-22).
    if (
      entries.some((entry) => entry.projectId === ownerId) ||
      keys.size !== entries.length ||
      keys.size !== required.size ||
      [...keys].some((key) => !required.has(key))
    )
      throw new Error('journal external revision coverage is not exact');
  }
  return external;
}

/** Validates a present binding map; malformed trusted history never means legacy history. */
function readEstimateUnits(value: unknown): Record<string, EstimateUnit> {
  // Proof: bypassing shape validation changed null's named trusted-state failure to a raw TypeError (compensating.test.ts, 2026-10-12).
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('journal estimate units are not a map');
  const units: Record<string, EstimateUnit> = {};
  for (const [stepId, unit] of Object.entries(value)) {
    // Proof: skipping vocabulary validation admitted hours (compensating.test.ts binding-map case, 2026-10-12).
    if (!isEstimateUnit(unit))
      throw new Error(`journal estimate units name an unknown unit for step ${stepId}`);
    units[stepId] = unit;
  }
  return units;
}

/** Every step whose estimate meaning either direction of a journal entry carries. */
export function estimateStepsOf(commands: readonly CompensatingCommand[]): Set<string> {
  const steps = new Set<string>();
  for (const command of commands) {
    switch (command.do) {
      case 'set_estimate':
      case 'clear_estimate':
        steps.add(command.stepId);
        break;
      // Proof: omitting this array lost handed-up from the nested coverage case (compensating.test.ts, 2026-10-12).
      case 'delete_subtree':
        for (const estimate of command.setEstimates) steps.add(estimate.stepId);
        break;
      // Proof: omitting subtree arrays restored an estimate under another unit, 200 vs 409 (mounted deleted-subtree case, 2026-10-12).
      case 'restore_subtree':
        for (const estimate of [...command.estimates, ...command.removedEstimates])
          steps.add(estimate.stepId);
        break;
      // Proof: skipping recursion let the mixed inverse batch restore and rename, 200 vs 409 (mounted replay case, 2026-10-12).
      case 'batch':
        for (const stepId of estimateStepsOf(command.steps)) steps.add(stepId);
        break;
    }
  }
  return steps;
}

/** Binds legacy history to workdays explicitly and refuses incomplete modern bindings. */
export function boundEstimateUnits(
  preconditions: Preconditions,
  commands: readonly CompensatingCommand[],
): Record<string, EstimateUnit> {
  const steps = estimateStepsOf(commands);
  // Proof: treating legacy as minutes made its workday replay refuse 409 instead of 200 (mounted legacy case, 2026-10-12).
  if (preconditions.estimateUnits === undefined)
    return Object.fromEntries([...steps].map((stepId) => [stepId, 'workdays' as const]));
  for (const stepId of steps) {
    // Proof: skipping coverage let a present empty map replay, 200 instead of trusted-state 500 (mounted legacy/malformed case, 2026-10-12).
    if (!Object.hasOwn(preconditions.estimateUnits, stepId))
      throw new Error(`journal estimate units have no binding for step ${stepId}`);
  }
  return preconditions.estimateUnits;
}

function readRevisions(value: unknown): Revisions {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`a journal entry holds revisions that are not a map: ${JSON.stringify(value)}`);
  }
  const out: Revisions = {};
  for (const [id, revision] of Object.entries(value)) {
    if (typeof revision !== 'number') {
      throw new Error(`a journal entry expects ${id} at a revision that is not a number`);
    }
    out[id] = revision;
  }
  return out;
}

/** Exact progress pairs written by this command, including explicit structural rows and nested batches. */
export function progressKeysOf(command: CompensatingCommand): ProgressKey[] {
  switch (command.do) {
    case 'set_progress':
    case 'clear_progress':
      return [{ workItemId: command.workItemId, stepId: command.stepId }];
    case 'restore_subtree':
      // Proof: omitting removedProgress failed exact structural write attribution; watched 2026-10-14.
      return [
        ...command.progress,
        ...command.removedProgress,
        ...(command.deletionState?.restoredParentProgress ?? []),
      ].map(({ workItemId, stepId }) => ({
        workItemId,
        stepId,
      }));
    case 'add_claims':
      return command.stated.map(({ workItemId, stepId }) => ({ workItemId, stepId }));
    case 'remove_claims':
      return command.cleared.map(({ workItemId, stepId }) => ({ workItemId, stepId }));
    case 'delete_subtree':
      // Proof: omitting these writes failed exact delete progress attribution; watched 2026-10-14.
      return command.setProgress.map(({ workItemId, stepId }) => ({ workItemId, stepId }));
    case 'batch':
      // Proof: skipping nested keys failed the nested progress attribution case; watched 2026-10-14.
      return command.steps.flatMap(progressKeysOf);
    default:
      return [];
  }
}

/**
 * Every work item a command writes or whose historical progress it promises to preserve.
 *
 * This is what the **next** set of preconditions is read from, so it has to
 * name everything and may name rows that will not exist afterwards — the ones
 * a `delete_subtree` removes. The caller reads the revisions of whichever of
 * them are still there; an id that is gone is not a precondition anybody can
 * hold.
 */
export function touchedBy(command: CompensatingCommand): string[] {
  switch (command.do) {
    case 'patch':
    case 'set_estimate':
    case 'clear_estimate':
    case 'set_actual':
    case 'clear_actual':
    case 'set_measure':
    case 'clear_measure':
    case 'set_progress':
    case 'clear_progress':
    case 'replace_blockage':
    case 'assign':
    case 'set_demand':
    case 'remove_attempt':
      // Proof: omitting assignment owners made the SQLite assignment-only redo
      // conflict test fail at `Expected: 409, Received: 200`; watched 2026-09-27.
      return [command.workItemId];
    case 'add_claims':
    case 'remove_claims':
      // Proof: returning [] here made `refuses a redo of a claim after the leaf
      // moved on` (claim-race.db.test.ts) apply the redo; watched 2026-10-19.
      return [...new Set(command.claims.map(({ workItemId }) => workItemId))];
    case 'move_claims':
      // Redundant today: the one writer, a first child's create, names both
      // ids in its touched set already, so no production negative can fail here.
      return [command.fromWorkItemId, command.toWorkItemId];
    case 'restore_attempt':
      return [command.attempt.workItemId];
    case 'add_dependency':
    case 'remove_dependency':
      return [command.successorId, command.predecessorId];
    case 'add_typed_dependency':
    case 'remove_typed_dependency':
      return [command.dependency.predecessor, command.dependency.successor]
        .filter((endpoint) => endpoint.projectId === command.dependency.projectId)
        .map((endpoint) => endpoint.workItemId);
    case 'update_typed_dependency':
      return [
        ...new Set([
          ...[command.from.predecessor, command.from.successor]
            .filter((endpoint) => endpoint.projectId === command.from.projectId)
            .map((endpoint) => endpoint.workItemId),
          ...[command.to.predecessor, command.to.successor]
            .filter((endpoint) => endpoint.projectId === command.to.projectId)
            .map((endpoint) => endpoint.workItemId),
        ]),
      ];
    case 'move':
      return [...new Set([command.workItemId, ...expectedProgressOwnersOf(command)])];
    case 'set_frozen':
      return command.updates.map((each) => each.id);
    case 'set_step_allowance':
      return [stepRevisionKey(command.stepId)];
    case 'set_positions':
      // The rows whose place changed, never every placement: the respaced ones
      // kept their place, took no revision, and must not have a peer's undo
      // refused on their behalf.
      return command.moved;
    case 'delete_subtree':
      return [
        ...command.remove,
        ...command.reparented.map((each) => each.id),
        ...command.setEstimates.map((each) => each.workItemId),
        ...command.setActuals.map((each) => each.workItemId),
        ...command.setProgress.map((each) => each.workItemId),
        ...command.setMeasures.map((each) => each.workItemId),
        ...(command.setAttempts ?? []).map((each) => each.workItemId),
      ];
    case 'restore_subtree':
      return [
        ...command.rows.map((row) => row.id),
        ...command.reparented.map((each) => each.id),
        ...command.removedEstimates.map((each) => each.workItemId),
        ...command.removedActuals.map((each) => each.workItemId),
        ...command.removedProgress.map((each) => each.workItemId),
        ...command.removedMeasures.map((each) => each.workItemId),
        ...(command.removedAttempts ?? []).map((each) => each.workItemId),
        ...command.externalDependencies.flatMap((edge) => [edge.predecessorId, edge.successorId]),
      ];
    case 'batch':
      // Every entity any step wrote to, once: a step left out here is a row an
      // undo would overwrite without checking its revision.
      return [...new Set(command.steps.flatMap(touchedBy))];
  }
}

/**
 * Owners whose unchanged historical progress a move promises to retain. Both
 * journal directions must track them across flip/rebase even when only the
 * inverse move carries the snapshot. Other command owners are excluded.
 */
export function expectedProgressOwnersOf(command: CompensatingCommand): string[] {
  if (command.do === 'batch') return [...new Set(command.steps.flatMap(expectedProgressOwnersOf))];
  if (
    (command.do === 'delete_subtree' || command.do === 'restore_subtree') &&
    command.deletionState?.parentId != null
  )
    // Proof: omitting this owner accepted a peer parent revision after flip (200 vs 409); watched 2026-10-14.
    return [command.deletionState.parentId];
  return command.do === 'move'
    ? [...new Set((command.expectedProgress ?? []).map(({ workItemId }) => workItemId))]
    : [];
}

/**
 * Every identity one compensating command names, nested batches included:
 * the rows it writes or places against, the projects its restored rows and
 * dependencies claim, the steps its per-step rows sit on, and the directory
 * entries its labels, links and assignments name.
 *
 * Not {@link touchedBy}, which is the revision-tracked set and leaves out
 * restored satellites, placement siblings and every directory id: an
 * authorization check needs the whole write set.
 */
export interface CompensatingReferences {
  workItems: string[];
  projects: string[];
  steps: string[];
  people: string[];
  teams: string[];
  services: string[];
  tags: string[];
  types: string[];
  systems: string[];
  resources: string[];
  scopedEndpoints: ScopedDependencyEndpoint[];
}

/** {@link CompensatingReferences} of one command. */
export function referencesOf(command: CompensatingCommand): CompensatingReferences {
  const found: CompensatingReferences = {
    workItems: [],
    projects: [],
    steps: [],
    people: [],
    teams: [],
    services: [],
    tags: [],
    types: [],
    systems: [],
    resources: [],
    scopedEndpoints: [],
  };
  collectReferences(command, found);
  return found;
}

function collectReferences(command: CompensatingCommand, found: CompensatingReferences): void {
  const rows = (...ids: (string | null)[]): void => {
    for (const id of ids) if (id !== null) found.workItems.push(id);
  };
  const onStep = (each: { workItemId: string; stepId: string }): void => {
    rows(each.workItemId);
    found.steps.push(each.stepId);
  };
  const placed = (each: Reparented): void => {
    rows(each.id, each.parentId);
  };
  const attempted = (each: StoredAttempt): void => {
    onStep(each);
    if (each.executorPersonId !== null) found.people.push(each.executorPersonId);
  };
  // Proof: omitting metadata references lost the empty parent and recorded step in the replay reference test; watched 2026-10-14.
  if (
    (command.do === 'delete_subtree' || command.do === 'restore_subtree') &&
    command.deletionState !== undefined
  ) {
    rows(command.deletionState.parentId);
    [
      ...command.deletionState.blockages,
      ...command.deletionState.parentBlockages,
      ...(command.deletionState.handedBlockages ?? []),
      ...command.deletionState.restoredParentProgress,
    ].forEach(onStep);
  }
  switch (command.do) {
    case 'add_typed_dependency':
    case 'remove_typed_dependency':
      found.scopedEndpoints.push(command.dependency.predecessor, command.dependency.successor);
      return;
    case 'update_typed_dependency':
      found.scopedEndpoints.push(
        command.from.predecessor,
        command.from.successor,
        command.to.predecessor,
        command.to.successor,
      );
      return;
    case 'patch': {
      rows(command.workItemId);
      const { patch } = command;
      if (patch.serviceTeamId !== undefined && patch.serviceTeamId !== null) {
        found.teams.push(patch.serviceTeamId);
      }
      found.teams.push(...(patch.teamIds ?? []));
      found.services.push(...(patch.serviceIds ?? []));
      found.tags.push(...(patch.tagIds ?? []));
      found.types.push(...(patch.typeIds ?? []));
      found.systems.push(...(patch.externalRefs ?? []).map((each) => each.systemId));
      return;
    }
    case 'set_estimate':
    case 'clear_estimate':
    case 'set_actual':
    case 'clear_actual':
    case 'set_measure':
    case 'clear_measure':
    case 'set_progress':
    case 'clear_progress':
    case 'replace_blockage':
      onStep(command);
      return;
    case 'assign':
      onStep(command);
      if (command.personId !== null) found.people.push(command.personId);
      return;
    case 'set_demand':
      rows(command.workItemId);
      found.resources.push(command.resourceId);
      return;
    case 'add_claims':
    case 'remove_claims':
      for (const each of command.claims) {
        rows(each.workItemId);
        if (each.stepId !== null) found.steps.push(each.stepId);
        found.people.push(each.personId);
      }
      [...('stated' in command ? command.stated : command.cleared)].forEach(onStep);
      // Proof: with this line removed, `reads both directions back and names
      // their rows, steps, people and progress` (compensating.test.ts) read no
      // resource off the occupancy; watched 2026-10-20.
      if (command.do === 'add_claims')
        found.resources.push(...(command.occupancy ?? []).map(({ resourceId }) => resourceId));
      return;
    case 'move_claims':
      rows(command.fromWorkItemId, command.toWorkItemId);
      for (const each of command.claims) {
        if (each.stepId !== null) found.steps.push(each.stepId);
        found.people.push(each.personId);
      }
      return;
    case 'restore_attempt':
      attempted(command.attempt);
      return;
    case 'remove_attempt':
      onStep(command);
      return;
    case 'add_dependency':
    case 'remove_dependency':
      rows(command.successorId, command.predecessorId);
      return;
    case 'move':
      rows(command.workItemId, command.parentId, command.afterId);
      // Proof: omitting snapshot references returned 409 instead of scoped 404 for a foreign step; watched 2026-10-14.
      (command.expectedProgress ?? []).forEach(onStep);
      return;
    case 'set_positions':
      command.placements.forEach(placed);
      rows(...command.moved);
      return;
    case 'set_frozen':
      rows(...command.updates.map((each) => each.id));
      return;
    case 'delete_subtree':
      rows(command.rootId, ...command.expectedSubtree, ...command.remove);
      command.reparented.forEach(placed);
      [
        ...command.setEstimates,
        ...command.setActuals,
        ...command.setProgress,
        ...command.setMeasures,
      ].forEach(onStep);
      (command.setAttempts ?? []).forEach(attempted);
      return;
    case 'restore_subtree':
      for (const row of command.rows) {
        rows(row.id, row.parentId);
        found.projects.push(row.projectId);
        if (row.serviceTeamId !== null) found.teams.push(row.serviceTeamId);
        if (row.serviceId !== null) found.services.push(row.serviceId);
        found.teams.push(...(row.teamIds ?? []));
        // Proof: dropping this line made `… a restored row carrying a foreign
        // type, cleared again in the same replay` in
        // `command-organization.controller.db.test.ts` answer 200 instead of
        // 404; watched 2026-09-27.
        found.types.push(...(row.typeIds ?? []));
      }
      command.reparented.forEach(placed);
      [
        ...command.estimates,
        ...command.actuals,
        ...command.progress,
        ...command.measures,
        ...command.removedEstimates,
        ...command.removedActuals,
        ...command.removedProgress,
        ...command.removedMeasures,
        ...(command.removedAttempts ?? []),
      ].forEach(onStep);
      (command.attempts ?? []).forEach(attempted);
      for (const assignment of command.assignments) {
        onStep(assignment);
        found.people.push(assignment.personId);
      }
      // Proof: with this loop removed, `names the resources a restore's demands
      // name` (compensating.test.ts) read no resource; watched 2026-10-20.
      for (const demand of command.demands ?? []) {
        rows(demand.workItemId);
        found.resources.push(demand.resourceId);
      }
      for (const edge of [...command.internalDependencies, ...command.externalDependencies]) {
        rows(edge.predecessorId, edge.successorId);
        found.projects.push(edge.projectId);
      }
      return;
    case 'batch':
      for (const step of command.steps) collectReferences(step, found);
      return;
  }
}

/**
 * What a command was aimed at, for the plan's history to be filtered by.
 *
 * Deliberately **not** {@link touchedBy}. That answers "every row whose revision
 * becomes a precondition" and is a set; this answers "the row somebody was
 * looking at when they did this", which is what "how did *this* estimate move"
 * filters on. A dependency touches two work items and is aimed at the successor —
 * the row the request named, and the subject of the label `record` writes. A
 * freeze is aimed at the plan and has no single row, which is what `null` is for:
 * a project's whole history still holds it, and no item's history claims it.
 *
 * A subtree command names its root. The rows beneath it are gone or restored with
 * it, and an event per row would turn one act into forty entries in a reader
 * nobody could use.
 */
export function subjectOf(command: CompensatingCommand): CommandSubject {
  switch (command.do) {
    case 'set_estimate':
    case 'clear_estimate':
    case 'set_actual':
    case 'clear_actual':
    case 'set_measure':
    case 'clear_measure':
    case 'set_progress':
    case 'clear_progress':
    case 'replace_blockage':
    case 'assign':
    case 'remove_attempt':
      return { workItemId: command.workItemId, stepId: command.stepId };
    case 'set_demand':
      return { workItemId: command.workItemId, stepId: null };
    case 'add_claims':
    case 'remove_claims': {
      // One claim command addresses one work item; several steps of it name none.
      const first = command.claims.at(0);
      return {
        workItemId: first?.workItemId ?? null,
        stepId: command.claims.length === 1 ? (first?.stepId ?? null) : null,
      };
    }
    case 'move_claims':
      // Part of a first child's create or its undo; the work item the claims land on.
      return { workItemId: command.toWorkItemId, stepId: null };
    case 'restore_attempt':
      return { workItemId: command.attempt.workItemId, stepId: command.attempt.stepId };
    case 'patch':
    case 'move':
      return { workItemId: command.workItemId, stepId: null };
    case 'add_dependency':
    case 'remove_dependency':
      return { workItemId: command.successorId, stepId: null };
    case 'add_typed_dependency':
    case 'remove_typed_dependency':
      return { workItemId: command.dependency.successor.workItemId, stepId: null };
    case 'update_typed_dependency':
      return { workItemId: command.to.successor.workItemId, stepId: null };
    case 'delete_subtree':
      return { workItemId: command.rootId, stepId: null };
    case 'restore_subtree':
      // Ancestors first, so the first row is the branch's root. An empty `rows`
      // is refused by `applyRestore` before it can be journalled, and would be a
      // restore of nothing.
      return { workItemId: command.rows.at(0)?.id ?? null, stepId: null };
    case 'set_step_allowance':
      // A project setting aimed at one step: an item's history does not claim
      // it, and a step's history does.
      return { workItemId: null, stepId: command.stepId };
    case 'set_frozen':
      // The whole plan, even when one row's number moved: freezing is a project
      // act and the label says so. Naming `updates[0]` would make a plan-wide
      // event read as one item's.
      return { workItemId: null, stepId: null };
    case 'set_positions':
      // Plan-wide for `set_frozen`'s reason exactly: arranging is one act over
      // the whole project, and naming the first row it happened to move would
      // make the history read as though somebody dragged that one row.
      return { workItemId: null, stepId: null };
    case 'batch': {
      // The row the first step was aimed at, as `restore_subtree` names its
      // root: a batch is journalled only with two or more steps, so an empty
      // one is a shape nothing writes, answered rather than thrown for the
      // history reader's sake.
      const first = command.steps.at(0);
      return first === undefined ? { workItemId: null, stepId: null } : subjectOf(first);
    }
  }
}

/**
 * A work item's name as a sentence can carry it, shortened and quoted.
 *
 * The **name**, never the derived number: a number is recomputed from the
 * whole tree on every read, so “Undid: rename 020” could name a different row
 * by the time it is on screen. An unnamed row says so rather than quoting
 * nothing.
 */
export function quoteName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') return 'an unnamed work item';
  return `“${trimmed.length > 40 ? `${trimmed.slice(0, 39)}…` : trimmed}”`;
}

/**
 * Checks a stored claim replay: every claim whole, and every progress key a
 * pair of strings. A claim with a missing field would otherwise be inserted as
 * a row nobody wrote.
 *
 * @throws for any malformed claim or key.
 */
/**
 * A restore's `demands`: each a whole number of units from 1 on a resource, on
 * one of the rows the restore writes. A demand on any other row would be
 * written onto work the entry does not put back.
 */
function readRestoredDemands(value: object): void {
  const demands: unknown = Reflect.get(value, 'demands');
  const rows: unknown = Reflect.get(value, 'rows');
  if (!Array.isArray(demands) || !Array.isArray(rows))
    throw new Error('a journal restore holds demands that are not a list');
  const listedRows: readonly unknown[] = rows;
  const owners = new Set<unknown>();
  for (const row of listedRows)
    if (typeof row === 'object' && row !== null && 'id' in row) owners.add(row.id);
  const listed: readonly unknown[] = demands;
  for (const demand of listed) {
    const units: unknown =
      typeof demand === 'object' && demand !== null ? Reflect.get(demand, 'units') : undefined;
    if (
      typeof demand !== 'object' ||
      demand === null ||
      !('workItemId' in demand) ||
      typeof demand.workItemId !== 'string' ||
      !owners.has(demand.workItemId) ||
      !('resourceId' in demand) ||
      typeof demand.resourceId !== 'string' ||
      demand.resourceId.length === 0 ||
      typeof units !== 'number' ||
      !Number.isSafeInteger(units) ||
      units < 1
    )
      throw new Error('a journal restore holds a malformed demand');
  }
}

function readClaimMove(value: object): void {
  const text = (field: unknown): field is string => typeof field === 'string' && field.length > 0;
  if (
    !('fromWorkItemId' in value) ||
    !text(value.fromWorkItemId) ||
    !('toWorkItemId' in value) ||
    !text(value.toWorkItemId)
  )
    throw new Error('a journal claim move names no work items');
  const from = value.fromWorkItemId;
  const claims = readClaims(value);
  if (claims.some((each) => Reflect.get(each, 'workItemId') !== from))
    throw new Error('a journal claim move holds a claim of another work item');
}

function readClaimReplay(value: object, keys: 'stated' | 'cleared'): void {
  const text = (field: unknown): boolean => typeof field === 'string' && field.length > 0;
  const claims = readClaims(value);
  const pairs: unknown = keys in value ? Reflect.get(value, keys) : undefined;
  if (!Array.isArray(pairs)) throw new Error(`a journal claim replay has no ${keys} progress`);
  const listed: readonly unknown[] = pairs;
  for (const pair of listed) {
    if (
      typeof pair !== 'object' ||
      pair === null ||
      !('workItemId' in pair) ||
      !text(pair.workItemId) ||
      !('stepId' in pair) ||
      !text(pair.stepId)
    )
      throw new Error('a journal claim replay holds a malformed progress key');
  }
  if (keys === 'cleared') return;
  // Absent `occupancy` is the shape written before `20261020130000_add_claim_occupancy`
  // (a claim of claims slice 1, a release's undo, or an outgoing colour mid-swap):
  // those claims held nothing, so the replay re-adds them holding nothing.
  // Proof: with absence refused, `reads a claim replay written before occupancy
  // as holding nothing` (compensating.test.ts) threw, and `undoes a release and
  // redoes a claim journalled before claim occupancy` (claim-race.db.test.ts)
  // failed its undo; watched 2026-10-20.
  if (!('occupancy' in value)) return;
  const occupancy: unknown = value.occupancy;
  // Proof: with this check answering early, `refuses a claim replay whose
  // occupancy is malformed or names a claim it does not carry`
  // (compensating.test.ts) did not throw; watched 2026-10-20.
  if (!Array.isArray(occupancy)) throw new Error('a journal claim replay has no occupancy list');
  const ids = new Set<unknown>(claims.map((each): unknown => Reflect.get(each, 'id')));
  const rows: readonly unknown[] = occupancy;
  for (const row of rows) {
    if (
      typeof row !== 'object' ||
      row === null ||
      !('claimId' in row) ||
      !ids.has(row.claimId) ||
      !('resourceId' in row) ||
      !text(row.resourceId) ||
      !('units' in row) ||
      typeof row.units !== 'number' ||
      !Number.isSafeInteger(row.units) ||
      row.units < 1
    )
      throw new Error('a journal claim replay holds a malformed occupancy');
  }
}

/** The non-empty `claims` of a stored claim command, each claim checked field by field. */
function readClaims(value: object): readonly object[] {
  const text = (field: unknown): boolean => typeof field === 'string' && field.length > 0;
  const nullableText = (field: unknown): boolean => field === null || text(field);
  if (!('claims' in value) || !Array.isArray(value.claims) || value.claims.length === 0)
    throw new Error('a journal claim replay has no claims');
  const claims: readonly unknown[] = value.claims;
  const checked: object[] = [];
  for (const each of claims) {
    if (
      typeof each !== 'object' ||
      each === null ||
      !('id' in each) ||
      !text(each.id) ||
      !('workItemId' in each) ||
      !text(each.workItemId) ||
      !('stepId' in each) ||
      !nullableText(each.stepId) ||
      !('personId' in each) ||
      !text(each.personId) ||
      !('runId' in each) ||
      !nullableText(each.runId) ||
      !('parentClaimId' in each) ||
      !nullableText(each.parentClaimId) ||
      !('accountId' in each) ||
      !text(each.accountId)
    )
      throw new Error('a journal claim replay holds a malformed claim');
    checked.push(each);
  }
  return checked;
}
