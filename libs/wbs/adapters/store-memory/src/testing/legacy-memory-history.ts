import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { JournalEntry, PlanEvent } from '@wbs/core';
import { bindFixtureSteps } from '@wbs/core/testing/bound-package-fixture';
import { parseOrThrow, type } from '@wbs/validation';
import { expect } from 'bun:test';

import { type MemorySourceFixture, openMemorySourceFixture } from '../source';
import provenance from './fixtures/legacy-memory-history.json';
import laundering from './fixtures/legacy-memory-laundering.json';

export type LegacyMemoryKind = keyof typeof provenance.cases | keyof typeof laundering.cases;
export type LegacyMemoryPhase = 'after-move' | 'before-final-redo';

// Proof: widening this boundary accepted unrecorded joined labels (memory-history-fault-joins-v1).
const empty = type('never[]');
const storedRow = type({
  id: 'string > 0',
  projectId: 'string > 0',
  parentId: 'string | null',
  position: 'number',
  name: 'string',
  notes: 'string',
  frozenNumber: 'null',
  startNoEarlierThan: 'null',
  startNoEarlierThanReason: 'null',
  deadline: 'null',
  factStart: 'null',
  factEnd: 'null',
  readiness: 'null',
  hold: 'null',
  priority: 'null',
  serviceTeamId: 'null',
  serviceId: 'null',
  maxParallel: '1',
  revision: '0',
  teamIds: empty,
  tagIds: empty,
  serviceIds: empty,
  typeIds: empty,
  externalRefs: empty,
}).onUndeclaredKey('reject');
const progress = type({
  workItemId: 'string > 0',
  stepId: 'string > 0',
  state: "'done' | 'in_progress'",
  statedAt: 'number',
}).onUndeclaredKey('reject');
const blockage = type({
  workItemId: 'string > 0',
  stepId: 'string > 0',
  blockedAt: 'number',
}).onUndeclaredKey('reject');
const facts = type({
  rows: storedRow.array(),
  progress: progress.array(),
  blockages: blockage.array(),
}).onUndeclaredKey('reject');
const step = type({
  id: 'string > 0',
  projectId: 'string > 0',
  name: 'string > 0',
  code: 'string > 0',
  position: 'number',
  allowancePercent: '0',
  estimateUnit: "'workdays'",
}).onUndeclaredKey('reject');
const account = type({
  id: 'string > 0',
  username: 'string > 0',
  passwordHash: 'string',
  createdAt: 'number',
}).onUndeclaredKey('reject');
const project = type({
  id: 'string > 0',
  name: 'string > 0',
  abbreviation: 'string > 0',
  ownerId: 'string > 0',
  restricted: 'boolean',
  estimateMethod: "'pert'",
  depReach: "'whole-item'",
  pertWeights: type({
    optimistic: 'number',
    realistic: 'number',
    pessimistic: 'number',
  }).onUndeclaredKey('reject'),
  estimateRounding: "'ceil'",
  startDate: 'null',
  solutionRef: 'null',
  revision: '0',
  createdAt: 'number',
  optimizationEnabled: 'false',
  scheduleEngine: "'fast'",
  scheduleObjective: "'pri'",
  budgetFactor: '1',
}).onUndeclaredKey('reject');
const metadata = type({
  organizationId: 'string > 0',
  project,
  account,
  steps: step.array(),
  allowanceRevisions: type(['string', '0']).array(),
  priorityBands: type({ startsAt: 'number', label: 'string', defaultValue: 'number' })
    .onUndeclaredKey('reject')
    .array(),
  timezone: 'string > 0',
}).onUndeclaredKey('reject');
const journal = type({
  id: 'string > 0',
  projectId: 'string > 0',
  userId: 'string > 0',
  personId: 'string | null',
  kind: 'string > 0',
  payload: 'object',
  inverse: 'object',
  preconditions: 'object',
  createdAt: 'number',
  seq: 'number.integer > 0',
  undone: 'boolean',
}).onUndeclaredKey('reject');
const event = type({
  id: 'string > 0',
  projectId: 'string > 0',
  userId: 'string > 0',
  kind: 'string > 0',
  label: 'string',
  workItemId: 'string | null',
  stepId: 'string | null',
  before: 'object',
  after: 'object',
  createdAt: 'number',
}).onUndeclaredKey('reject');
const stage = type({
  phase: "'before-prior' | 'after-move' | 'before-final-redo'",
  metadata,
  facts,
  journal: journal.array(),
  history: event.array(),
}).onUndeclaredKey('reject');
const archive = type({
  // Proof: widening this dispatch accepted an unsupported recorded schema (memory-history-fault-schema-v1).
  schema: "'puni-genuine-memory-history-v5'",
  runtime: type({ version: 'string > 0', revision: 'string > 0' }).onUndeclaredKey('reject'),
  sourceCommit: "'c8018843e6ff6827f7d97b67ff986cc717656578'",
  kind: "'rename' | 'progress' | 'extra-qa' | 'mixed-progress-patch'",
  chronology: stage.array(),
  outcome: type({
    ok: 'false',
    reason: "'stale_undo'",
    detail: 'string',
    entryId: 'string > 0',
  }).onUndeclaredKey('reject'),
  after: facts,
  afterHistory: event.array(),
  qualification: 'string > 0',
}).onUndeclaredKey('reject');

/** Strict boundary for the genuine archived arrangements; unsupported metadata is not defaulted. */
export function decodeLegacyMemoryHistory(input: unknown) {
  return parseOrThrow(archive, input);
}

/** Checks the actual predecessor archive and frozen producer before current metadata/history is authored. */
export function readLegacyMemoryHistory(kind: LegacyMemoryKind) {
  const { manifest, selected } =
    kind === 'rename' || kind === 'progress'
      ? { manifest: provenance, selected: provenance.cases[kind] }
      : { manifest: laundering, selected: laundering.cases[kind] };
  const compressed = readFileSync(new URL('./fixtures/' + selected.file, import.meta.url));
  // Proof: valid gzip metadata drift failed this independent compressed pin (memory-history-fault-compressed-v1).
  expect(createHash('sha256').update(compressed).digest('hex')).toBe(selected.gzipSha256);
  const bytes = Bun.gunzipSync(compressed);
  // Proof: breaking only the original digest failed here (memory-history-fault-original-v1).
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(selected.sha256);
  const script = readFileSync(new URL('./fixtures/' + manifest.producer, import.meta.url));
  // Proof: changing only the frozen producer bytes failed this dependency (memory-history-fault-producer-v1).
  expect(createHash('sha256').update(script).digest('hex')).toBe(manifest.producerSha256);
  const captured = decodeLegacyMemoryHistory(JSON.parse(new TextDecoder().decode(bytes)));
  // Proof: selecting the other genuine archive failed at this profile boundary (memory-history-fault-profile-v1).
  expect(captured.kind).toBe(kind);
  return captured;
}

/**
 * Materializes and checks real current metadata/leaf facts from a genuine old capture.
 * Original journal/event rows are returned separately: no fake append or historical admission is inferred.
 * The caller owns the returned Source; any failed setup closes its acquired owner.
 */
export async function prepareLegacyMemoryHistory(
  kind: LegacyMemoryKind,
  phase: LegacyMemoryPhase,
  fixture: MemorySourceFixture = openMemorySourceFixture(),
) {
  const source = fixture.source;
  try {
    const captured = readLegacyMemoryHistory(kind),
      selected = captured.chronology.find((checkpoint) => checkpoint.phase === phase);
    // Proof: omitting this throw lost source context but still rejected at destructuring; diagnostic only (memory-history-fault-missing-phase-v1).
    if (selected === undefined) throw new Error('Genuine Memory checkpoint is missing: ' + phase);
    const { metadata: capturedMetadata } = selected;
    const { organizationId, account: creator } = capturedMetadata;
    const author = creator.id,
      stamp = { at: capturedMetadata.project.createdAt, by: author };
    expect(capturedMetadata.project.ownerId).toBe(author);
    expect(await source.stores.users.create(creator, stamp)).toEqual(creator);
    fixture.addOrganization(organizationId, { legacy: true });
    fixture.setPackageCreationMembers(organizationId, [author]);
    const projectId = 'legacy-memory-engagement-' + kind;
    fixture.seedPackageParent({
      id: projectId,
      organizationId,
      name: projectId,
      revision: 0,
      createdAt: stamp.at,
      createdBy: author,
      updatedAt: null,
      spaceId: null,
      spacePosition: null,
    });
    await bindFixtureSteps(
      source,
      organizationId,
      capturedMetadata.steps.map((step) => ({
        definition: {
          id: step.id,
          code: step.code,
          name: step.name,
          position: step.position,
          defaultEstimateUnit: step.estimateUnit,
          defaultAllowancePercent: step.allowancePercent,
        },
        binding: {
          bindingId: 'legacy-memory-binding-' + step.id,
          scopeKind: 'project',
          scopeId: projectId,
          workItemTypeId: null,
          position: step.position,
        },
      })),
      stamp,
    );
    const { ownerId, ...oldPackage } = capturedMetadata.project;
    expect(ownerId).toBe(author);
    const expectedPackage = { ...oldPackage, projectId };
    const created = await source.stores.workPackages.createWithSteps(expectedPackage, stamp, {
      kind: 'legacy',
    });
    if (typeof created === 'string')
      throw new Error('Current Memory predecessor package refused: ' + created);
    const workPackageId = created.workPackage.id;
    expect(created.workPackage).toEqual(expectedPackage);
    expect(created.steps).toEqual(
      capturedMetadata.steps.map(({ projectId, ...step }) => ({
        workPackageId: projectId,
        ...step,
      })),
    );
    expect([...(await source.stores.workPackages.stepAllowanceRevisions(workPackageId))]).toEqual(
      capturedMetadata.allowanceRevisions,
    );
    expect(await source.stores.priorityBands.listFor(workPackageId)).toEqual(
      capturedMetadata.priorityBands,
    );
    expect(await source.stores.workPackages.timezoneOf(workPackageId)).toBe(
      capturedMetadata.timezone,
    );
    for (const original of selected.facts.rows) {
      const { projectId, teamIds, tagIds, serviceIds, typeIds, externalRefs, ...row } = original;
      expect(projectId).toBe(workPackageId);
      expect([teamIds, tagIds, serviceIds, typeIds, externalRefs]).toEqual([[], [], [], [], []]);
      await source.stores.workItems.insert({ ...row, workPackageId: projectId }, [], stamp);
    }
    for (const fact of selected.facts.progress)
      expect(await source.stores.progress.set(fact, stamp)).toBe('written');
    for (const fact of selected.facts.blockages)
      expect(await source.stores.blockages.set(fact, stamp)).toBe('written');
    const snapshot = async () => ({
      rows: await source.stores.workItems.listByWorkPackage(workPackageId),
      progress: await source.stores.progress.listByWorkPackage(workPackageId),
      blockages: await source.stores.blockages.listByWorkPackage(workPackageId),
    });
    expect(await snapshot()).toEqual({
      ...selected.facts,
      rows: selected.facts.rows.map(({ projectId, ...row }) => ({
        ...row,
        workPackageId: projectId,
      })),
    });
    const entries: JournalEntry[] = selected.journal.map(({ projectId, ...entry }) => ({
      ...entry,
      workPackageId: projectId,
    }));
    const events: PlanEvent[] = selected.history.map(({ projectId, ...recorded }) => ({
      ...recorded,
      workPackageId: projectId,
    }));
    return {
      fixture,
      source,
      captured,
      selected,
      workPackageId,
      author,
      checkpoint: { workPackageId, entries, events },
      snapshot,
      close: () => source.close(),
    };
  } catch (primary: unknown) {
    try {
      await source.close();
    } catch (cleanup: unknown) {
      throw new AggregateError([primary, cleanup], 'Genuine Memory setup and close failed', {
        cause: cleanup,
      });
    }
    throw primary;
  }
}

/** Loads only actual predecessor journal/event records into the existing current Source fixture. */
export async function openLegacyMemoryHistory(
  kind: LegacyMemoryKind,
  phase: LegacyMemoryPhase,
  fixture?: MemorySourceFixture,
) {
  const prepared = await prepareLegacyMemoryHistory(kind, phase, fixture);
  try {
    await prepared.fixture.restoreCommandHistory(prepared.checkpoint);
    return prepared;
  } catch (primary: unknown) {
    try {
      await prepared.close();
    } catch (cleanup: unknown) {
      throw new AggregateError([primary, cleanup], 'Genuine Memory restore and close failed', {
        cause: cleanup,
      });
    }
    throw primary;
  }
}
