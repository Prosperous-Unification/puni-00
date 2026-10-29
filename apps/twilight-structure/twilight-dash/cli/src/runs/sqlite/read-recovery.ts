import { parseOrThrow, type } from '@shared/validation';
import type { Database } from 'bun:sqlite';

import type { RecoveryCatalog } from '../plan-recovery-history';
import { decodeRecoveryHistory } from '../recovery-codecs';
import { decodeRuntimeScope, readRuntimeRequest, runtimeScopeKey } from '../runtime-codecs';

function parseRecord(record: string): unknown {
  return JSON.parse(record);
}
const integer = type('number.integer >= 0').atMost(Number.MAX_SAFE_INTEGER);
const markerCodec = type({
  singleton: '1',
  journal_count: integer,
  fence_count: integer,
  observation_count: integer,
  closure_count: integer,
  barrier_count: integer,
  active_count: integer,
}).onUndeclaredKey('reject');
const journalCodec = type({
  recovery_id: 'string',
  command_id: 'string',
  scope_key: 'string',
  revision: integer,
  record: 'string',
}).onUndeclaredKey('reject');
const fenceCodec = type({
  recovery_id: 'string',
  ordinal: integer,
  command_id: 'string',
  revision: integer,
  record: 'string',
}).onUndeclaredKey('reject');
const observationCodec = type({
  recovery_id: 'string',
  ordinal: integer,
  revision: integer,
  record: 'string',
}).onUndeclaredKey('reject');
const closureCodec = type({
  recovery_id: 'string',
  revision: integer,
  record: 'string',
}).onUndeclaredKey('reject');
const barrierCodec = type({
  scope_key: 'string',
  scope_after: integer,
  recovery_id: 'string',
  record: 'string',
}).onUndeclaredKey('reject');
const activeCodec = type({ scope_key: 'string', recovery_id: 'string' }).onUndeclaredKey('reject');
const barrierValueCodec = type({
  recoveryId: 'string',
  scope: 'unknown',
  scopeBefore: integer,
  scopeAfter: integer,
  generationFloor: integer,
}).onUndeclaredKey('reject');

/** Reads every physical recovery family and independent key/count witness. Missing families and markers are corruption, never an empty catalog. The complete logical audit belongs to the enclosing history reader. */
export function readRecoveryCatalog(database: Database): RecoveryCatalog {
  const markers = database.query('SELECT * FROM run_recovery_format').all();
  // Proof: T3P1 removed this check; a corrupt public scope read resolved in the matching recovery contract; exact restoration passed.
  if (markers.length !== 1) throw new Error('corrupt recovery format marker');
  const marker = parseOrThrow(markerCodec, markers[0]);
  const journals = database
    .query('SELECT * FROM run_recovery_journal')
    .all()
    .map((row) => parseOrThrow(journalCodec, row));
  const fences = database
    .query('SELECT * FROM run_recovery_fence ORDER BY ordinal')
    .all()
    .map((row) => parseOrThrow(fenceCodec, row));
  const observations = database
    .query('SELECT * FROM run_recovery_observation ORDER BY ordinal')
    .all()
    .map((row) => parseOrThrow(observationCodec, row));
  const closures = database
    .query('SELECT * FROM run_recovery_closure')
    .all()
    .map((row) => parseOrThrow(closureCodec, row));
  const histories = journals.map((row) => {
    const ownedFences = fences.filter((fence) => fence.recovery_id === row.recovery_id);
    const ownedObservations = observations.filter(
      (observation) => observation.recovery_id === row.recovery_id,
    );
    const closure = closures.find((entry) => entry.recovery_id === row.recovery_id);
    const history = decodeRecoveryHistory({
      version: 1,
      intent: parseRecord(row.record),
      revision: row.revision,
      fences: ownedFences.map((fence) => parseRecord(fence.record)),
      observations: ownedObservations.map((observation) => parseRecord(observation.record)),
      closure: closure === undefined ? null : parseRecord(closure.record),
    });
    // Proof: T3P3 removed this check; a corrupt public scope read resolved in the matching recovery contract; exact restoration passed.
    if (
      row.recovery_id !== history.intent.recoveryId ||
      row.command_id !== history.intent.target.original.commandId ||
      row.scope_key !==
        runtimeScopeKey(readRuntimeRequest(history.intent.target.original.canonicalRequest).scope)
    )
      throw new Error('corrupt recovery journal physical key');
    for (const [index, fence] of history.fences.entries()) {
      const physical = ownedFences.at(index);
      // Proof: T3P4F removed this check; a corrupt public scope read resolved in the matching recovery contract; exact restoration passed.
      if (
        physical?.ordinal !== fence.ordinal ||
        physical.revision !== fence.stagedRevision ||
        physical.command_id !== readRuntimeRequest(fence.canonicalRequest).operation.commandId ||
        physical.recovery_id !== fence.recoveryId
      )
        throw new Error('corrupt recovery fence physical key');
    }
    for (const [index, observation] of history.observations.entries()) {
      const physical = ownedObservations.at(index);
      // Proof: T3P4O removed this check; a corrupt public scope read resolved in the matching recovery contract; exact restoration passed.
      if (
        physical?.ordinal !== observation.fence.ordinal ||
        physical.revision !== observation.observedRevision ||
        physical.recovery_id !== observation.fence.recoveryId
      )
        throw new Error('corrupt recovery observation physical key');
    }
    // Proof: T3P4C removed this check; a corrupt public scope read resolved in the matching recovery contract; exact restoration passed.
    if (
      closure !== undefined &&
      (closure.recovery_id !== history.closure?.recoveryId ||
        closure.revision !== history.closure.resolvedRevision)
    )
      throw new Error('corrupt recovery closure physical key');
    return history;
  });
  if (
    [...fences, ...observations, ...closures].some(
      (row) => !journals.some((journal) => journal.recovery_id === row.recovery_id),
    )
  )
    throw new Error('orphan recovery physical row');
  const barriers = database
    .query('SELECT * FROM run_recovery_barrier')
    .all()
    .map((input) => {
      const row = parseOrThrow(barrierCodec, input);
      const value = parseOrThrow(barrierValueCodec, parseRecord(row.record));
      const barrier = { ...value, scope: decodeRuntimeScope(value.scope) };
      // Proof: T3P4B removed this check; a corrupt public scope read resolved in the matching recovery contract; exact restoration passed.
      if (
        row.scope_key !== runtimeScopeKey(barrier.scope) ||
        row.recovery_id !== barrier.recoveryId ||
        row.scope_after !== barrier.scopeAfter
      )
        throw new Error('corrupt recovery barrier physical key');
      return barrier;
    });
  const active = database
    .query('SELECT * FROM run_recovery_active')
    .all()
    .map((input) => {
      const row = parseOrThrow(activeCodec, input);
      const journal = histories.find((history) => history.intent.recoveryId === row.recovery_id);
      if (journal === undefined) throw new Error('orphan active recovery');
      const scope = readRuntimeRequest(journal.intent.target.original.canonicalRequest).scope;
      // Proof: T3P5 removed this check; a corrupt public scope read resolved in the matching recovery contract; exact restoration passed.
      if (row.scope_key !== runtimeScopeKey(scope))
        throw new Error('corrupt active recovery physical key');
      return { scope, recoveryId: row.recovery_id };
    });
  // Proof: T3P2DIAG removing physical count refinement reached the complete catalog count rejection; diagnostic-only; exact restoration passed.
  if (
    marker.journal_count !== journals.length ||
    marker.fence_count !== fences.length ||
    marker.observation_count !== observations.length ||
    marker.closure_count !== closures.length ||
    marker.barrier_count !== barriers.length ||
    marker.active_count !== active.length
  )
    throw new Error('corrupt recovery physical counts');
  return {
    histories,
    barriers,
    active,
    counts: {
      journals: marker.journal_count,
      fences: marker.fence_count,
      observations: marker.observation_count,
      closures: marker.closure_count,
      barriers: marker.barrier_count,
      active: marker.active_count,
    },
  };
}
