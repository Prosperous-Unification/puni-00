import { isHold, isReadiness } from '@wbs/domain';

import type { Repositioned } from '../ports/work-item-store';
import type { FirstChildBlockage, FirstChildRecord } from './first-child';

function readClosedRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`first child ${label} is not an object`);
  const fields = Object.keys(value);
  if (fields.length !== keys.length || fields.some((field) => !keys.includes(field)))
    throw new Error(`first child ${label} has unknown or missing fields`);
  return Object.fromEntries(fields.map((field) => [field, Reflect.get(value, field)]));
}

function readId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error('first child history has an invalid identity');
  return value;
}

function readText(value: unknown): string {
  if (typeof value !== 'string') throw new Error('first child history has invalid text');
  return value;
}

function readFinite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('first child history has an invalid number');
  return value;
}

function readStatements(value: unknown): FirstChildRecord['parentStatements'] {
  const row = readClosedRecord(value, ['readiness', 'hold'], 'statements');
  if (row['readiness'] !== null && !isReadiness(row['readiness']))
    throw new Error('first child history has an invalid readiness');
  if (row['hold'] !== null && !isHold(row['hold']))
    throw new Error('first child history has an invalid hold');
  return { readiness: row['readiness'], hold: row['hold'] };
}

/** Validates exact sparse facts at the journal and adapter boundaries and orders them by step identity. */
export function readFirstChildBlockages(value: unknown): FirstChildBlockage[] {
  if (!Array.isArray(value)) throw new Error('first child blockages are not an array');
  const entries: readonly unknown[] = value;
  const seen = new Set<string>();
  // Proof: map skipped an empty slot and the malformed direct Source history did not throw.
  return Array.from(entries, (entry) => {
    const row = readClosedRecord(entry, ['stepId', 'blockedAt'], 'blockage');
    const stepId = readId(row['stepId']);
    if (seen.has(stepId)) throw new Error('first child history duplicates a blockage');
    seen.add(stepId);
    const blockedAt = row['blockedAt'];
    if (typeof blockedAt !== 'number' || !Number.isSafeInteger(blockedAt))
      throw new Error('first child blocked time is malformed');
    return { stepId, blockedAt };
  }).sort((left, right) => (left.stepId < right.stepId ? -1 : left.stepId > right.stepId ? 1 : 0));
}

/**
 * Closed current journal boundary. Only the scalar shape a fresh first child
 * actually receives can be replayed: no labels, deadlines or copied type are
 * invented from omitted historical fields. Older restore/delete journal arms
 * keep their separate historical decoder and never receive this descriptor.
 */
export function readFirstChildRecord(value: unknown): FirstChildRecord {
  const version =
    typeof value === 'object' && value !== null && 'version' in value ? value.version : undefined;
  if (version !== 1 && version !== 2) throw new Error('first child history version is unknown');
  const fields = ['version', 'child', 'parentStatements', 'stepIds'];
  if (version === 2) fields.push('blockages');
  const record = readClosedRecord(value, fields, 'record');
  const row = readClosedRecord(
    record['child'],
    [
      'id',
      'workPackageId',
      'parentId',
      'position',
      'name',
      'notes',
      'frozenNumber',
      'startNoEarlierThan',
      'startNoEarlierThanReason',
      'deadline',
      'factStart',
      'factEnd',
      'readiness',
      'hold',
      'priority',
      'serviceTeamId',
      'serviceId',
      'maxParallel',
      'revision',
    ],
    'child',
  );
  for (const field of [
    'frozenNumber',
    'startNoEarlierThan',
    'startNoEarlierThanReason',
    'deadline',
    'factStart',
    'factEnd',
    'serviceTeamId',
    'serviceId',
  ])
    if (row[field] !== null) throw new Error(`first child history has unexpected ${field}`);
  if (row['maxParallel'] !== 1 || row['revision'] !== 0)
    throw new Error('first child history does not describe a newly created row');
  if (
    row['priority'] !== null &&
    (typeof row['priority'] !== 'number' ||
      !Number.isSafeInteger(row['priority']) ||
      row['priority'] < 1)
  )
    throw new Error('first child history has invalid priority');
  const inherited = readStatements({ readiness: row['readiness'], hold: row['hold'] });
  const parentStatements = readStatements(record['parentStatements']);
  if (
    inherited.readiness !== parentStatements.readiness ||
    inherited.hold !== parentStatements.hold
  )
    throw new Error('first child statement history is inconsistent');
  if (!Array.isArray(record['stepIds']))
    throw new Error('first child history has no step identities');
  const rawStepIds: readonly unknown[] = record['stepIds'];
  // Proof: map skipped a missing step identity and accepted the sparse direct v1 record.
  const stepIds = Array.from(rawStepIds, readId);
  const transferred = new Set(stepIds);
  if (transferred.size !== stepIds.length) throw new Error('first child history duplicates a step');
  const childId = readId(row['id']),
    parentId = readId(row['parentId']);
  if (childId === parentId) throw new Error('first child history names itself as parent');
  const blockages = version === 2 ? readFirstChildBlockages(record['blockages']) : [];
  if (blockages.some(({ stepId }) => !transferred.has(stepId)))
    throw new Error('first child blockage references an untransferred step');
  return {
    ...(version === 1 ? { version: 1 as const } : { version: 2 as const, blockages }),
    parentStatements,
    stepIds,
    child: {
      id: childId,
      workPackageId: readId(row['workPackageId']),
      parentId,
      position: readFinite(row['position']),
      name: readText(row['name']),
      notes: readText(row['notes']),
      frozenNumber: null,
      startNoEarlierThan: null,
      startNoEarlierThanReason: null,
      deadline: null,
      factStart: null,
      factEnd: null,
      ...inherited,
      priority: row['priority'],
      serviceTeamId: null,
      serviceId: null,
      maxParallel: 1,
      revision: 0,
    },
  };
}

/** Exact placement rows retained by current first-child history; no arbitrary extra payload survives decoding. */
export function readFirstChildPositions(value: unknown): Repositioned[] {
  if (!Array.isArray(value)) throw new Error('first child history has no placements');
  const rows: readonly unknown[] = value;
  const seen = new Set<string>();
  return rows.map((candidate) => {
    const row = readClosedRecord(candidate, ['id', 'position'], 'placement');
    const owner = readId(row['id']);
    if (seen.has(owner)) throw new Error('first child history duplicates a placement');
    seen.add(owner);
    return { id: owner, position: readFinite(row['position']) };
  });
}
