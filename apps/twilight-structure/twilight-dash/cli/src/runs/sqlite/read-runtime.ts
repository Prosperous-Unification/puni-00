import { parseOrThrow, type } from '@shared/validation';
import type { Database } from 'bun:sqlite';

import { auditRuntimeCatalog, type RuntimeCatalog } from '../plan-runtime';
import type { OwnershipStatus } from '../records';
import {
  decodeRuntimeAcceptance,
  decodeRuntimeIntent,
  decodeRuntimePin,
  readRuntimeRequest,
  runtimeScopeKey,
} from '../runtime-codecs';
import { readRecoveryCatalog } from './read-recovery';
import { CURRENT_FORMAT, type FormatDescriptor, validateFormatSchema } from './schema';

const integer = type('number.integer >= 0').atMost(Number.MAX_SAFE_INTEGER);
const markerCodec = type({
  singleton: '1',
  bundle_hash: 'string',
  scope_count: integer,
  intent_count: integer,
  acceptance_count: integer,
}).onUndeclaredKey('reject');
const scopeRowCodec = type({
  scope_key: 'string',
  pin: 'string',
  revision: integer,
}).onUndeclaredKey('reject');
const commandRowCodec = type({
  command_id: 'string',
  scope_key: 'string',
  record: 'string',
}).onUndeclaredKey('reject');

/** Audits complete marker counts, physical keys, owned rows and reconstructed histories inside the caller's snapshot or transaction. Whole-family deletion never becomes absence. */
export function readRuntimeCatalog(database: Database, ownership: OwnershipStatus): RuntimeCatalog {
  return readRuntimeCatalogForFormat(database, ownership, CURRENT_FORMAT);
}
/** Transition-only reader requires its private compiled descriptor explicitly. */
export function readRuntimeCatalogForFormat(
  database: Database,
  ownership: OwnershipStatus,
  format: FormatDescriptor,
): RuntimeCatalog {
  // Proof: R2F42 removed only this new call; both after-open version and physical-schema corruptions reached public reads. Exact restoration passed.
  validateFormatSchema(database, format);
  const markers = database.query('SELECT * FROM run_format').all();
  // Proof: F51 ignored an extra format singleton; 'trusted runtime extra marker' failed and exact restoration passed.
  if (markers.length !== 1) throw new Error('corrupt runtime format marker');
  const marker = parseOrThrow(markerCodec, markers[0]);
  // Proof: F22 bypassed the complete bundle hash comparison; 'current format complete bundle hash' failed and exact restoration passed.
  if (marker.bundle_hash !== format.identity.bundleHash)
    throw new Error('incompatible sqlite format bundle hash');
  const scopes = database
    .query('SELECT * FROM run_runtime_scope')
    .all()
    .map((input) => {
      const row = parseOrThrow(scopeRowCodec, input);
      const pin = decodeRuntimePin(JSON.parse(row.pin));
      // Proof: F16 ignored the physical scope key; 'trusted runtime scope physical key' failed and exact restoration passed.
      if (row.scope_key !== runtimeScopeKey(pin.scope))
        throw new Error('corrupt runtime scope key');
      return { pin, revision: row.revision };
    });
  const intents = database
    .query('SELECT * FROM run_runtime_intent')
    .all()
    .map((input) => {
      const row = parseOrThrow(commandRowCodec, input);
      const intent = decodeRuntimeIntent(JSON.parse(row.record));
      if (
        // Proof: F17 ignored the physical intent command key; 'trusted runtime intent physical command' failed and exact restoration passed.
        row.command_id !== intent.commandId ||
        // Proof: F18 ignored the physical intent scope key; 'trusted runtime intent physical scope' failed and exact restoration passed.
        row.scope_key !== runtimeScopeKey(readRuntimeRequest(intent.canonicalRequest).scope)
      )
        throw new Error('corrupt runtime intent key');
      return intent;
    });
  const acceptances = database
    .query('SELECT * FROM run_runtime_acceptance')
    .all()
    .map((input) => {
      const row = parseOrThrow(commandRowCodec, input);
      const acceptance = decodeRuntimeAcceptance(JSON.parse(row.record));
      const intent = intents.find((candidate) => candidate.commandId === acceptance.commandId);
      if (
        // Proof: F19 ignored the physical acceptance command key; 'trusted runtime acceptance physical command' failed and exact restoration passed.
        row.command_id !== acceptance.commandId ||
        intent === undefined ||
        // Proof: F20 ignored the physical acceptance scope key; 'trusted runtime acceptance physical scope' failed and exact restoration passed.
        row.scope_key !== runtimeScopeKey(readRuntimeRequest(intent.canonicalRequest).scope)
      )
        throw new Error('corrupt runtime acceptance key');
      return acceptance;
    });
  if (
    // Proof: F21 bypassed retained row counts; 'trusted runtime lost whole runtime family' failed and exact restoration passed.
    marker.scope_count !== scopes.length ||
    marker.intent_count !== intents.length ||
    marker.acceptance_count !== acceptances.length
  )
    throw new Error('corrupt runtime retained counts');
  const catalog: RuntimeCatalog = {
    scopes,
    intents,
    acceptances,
    recovery:
      format.identity.version === 4
        ? readRecoveryCatalog(database)
        : {
            histories: [],
            barriers: [],
            active: [],
            counts: {
              journals: 0,
              fences: 0,
              observations: 0,
              closures: 0,
              barriers: 0,
              active: 0,
            },
          },
  };
  auditRuntimeCatalog(catalog, ownership);
  return catalog;
}
