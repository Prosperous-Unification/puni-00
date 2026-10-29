import { createInterface } from 'node:readline';

import { parseOrThrow, type } from '@shared/validation';
import { Database } from 'bun:sqlite';

import { stageClaimRequest } from '../claim-history';
import {
  decodeDecision,
  decodeExecutionFact,
  decodeManifest,
  decodeOwnership,
  decodeReceipt,
  executionCommandId,
  organizationId,
  ownerId,
} from '../record-codecs';
import { FORMAT_HASH, MIGRATIONS, SCHEMA_VERSION } from '../sqlite/format';
import { bootstrapSqliteStores } from '../sqlite/open-stores';
import {
  createCompletion,
  createExecutionCommand,
  createManifest,
  FixtureClock,
  prepareAttempt,
  prepareClaimed,
  prepareSession,
  prepareTurn,
  unwrapReply,
} from './fixtures';
import type { Format3Capture, Format3Population } from './format3-fixture';

const path = process.argv.at(2);
const sourceCommit = process.argv.at(3);
if (path === undefined || sourceCommit !== 'bb14bb1cf3afc0559e4d0864374e11c652751751')
  throw new Error('pinned fixture arguments missing');
// This worker is copied under the immutable archived import root; these imports must load the actual predecessor before bootstrap.
function checkOriginalFormat(version: number, hash: string): void {
  if (version !== 3 || hash !== 'd11130ee5ca84e51cb843daf8fbfc5695b704e3aecea1fb6d7c00234b2f43aed')
    throw new Error('fixture did not load original format3 provider');
}
checkOriginalFormat(SCHEMA_VERSION, FORMAT_HASH);
const clock = new FixtureClock();
const stores = await bootstrapSqliteStores({
  path,
  organizationId: organizationId('organization'),
  capacity: 1,
  leaseMilliseconds: 100,
  clock,
  maxBusyAttempts: 20,
  busyDelayMilliseconds: 1,
});
const fixture = { ...stores, clock };
let database: Database;
try {
  database = new Database(path, { create: false, strict: true, safeIntegers: true });
} catch (cause) {
  await stores.close();
  throw cause;
}
const schemaCodec = type({
  type: 'string',
  name: 'string',
  tbl_name: 'string',
  sql: 'string | null',
});
const columnCodec = type({ name: 'string' });
const cellsCodec = type('null | string | number | bigint')
  .or(type.instanceOf(Uint8Array))
  .array()
  .array();
function quoteIdentifier(name: string): string {
  return '"' + name.replaceAll('"', '""') + '"';
}
function captureDatabase(): Format3Capture {
  const schema = (['main', 'temp'] as const).flatMap((namespace) =>
    database
      .query(`SELECT type,name,tbl_name,sql FROM ${namespace}.sqlite_schema ORDER BY type,name`)
      .all()
      .map((candidate) => {
        const entry = parseOrThrow(schemaCodec, candidate);
        return {
          database: namespace,
          type: entry.type,
          name: entry.name,
          table: entry.tbl_name,
          sql: entry.sql,
        };
      }),
  );
  return {
    schema,
    tables: schema
      .filter((entry) => entry.database === 'main' && entry.type === 'table')
      .map((entry) => ({
        name: entry.name,
        columns: database
          .query(`PRAGMA table_info(${quoteIdentifier(entry.name)})`)
          .all()
          .map((candidate) => parseOrThrow(columnCodec, candidate).name),
        rows: parseOrThrow(
          cellsCodec,
          database.query(`SELECT * FROM ${quoteIdentifier(entry.name)} ORDER BY rowid`).values(),
        ),
      })),
  };
}
function sendReply(message: unknown): void {
  process.stdout.write(
    JSON.stringify(message, (_key, value: unknown) =>
      typeof value === 'bigint'
        ? { kind: 'sqlite_bigint', decimal: String(value) }
        : value instanceof Uint8Array
          ? { kind: 'sqlite_blob', base64: Buffer.from(value).toString('base64') }
          : value,
    ) + '\n',
  );
}
function describeFailure(cause: unknown): unknown {
  return cause instanceof Error
    ? {
        name: cause.name,
        message: cause.message,
        ...('code' in cause ? { code: cause.code } : {}),
        cause: cause.cause === undefined ? null : describeFailure(cause.cause),
      }
    : { thrown: String(cause) };
}
async function populateHistory(population: Format3Population) {
  if (population === 'queued') {
    const setup = await prepareAttempt(fixture);
    return setup.ownership;
  }
  if (population === 'prepared') {
    const setup = await prepareSession(fixture);
    return setup.ownership;
  }
  if (population === 'claim_pending') {
    const setup = await prepareSession(fixture);
    unwrapReply(
      await stageClaimRequest(stores.runs, stores.artifacts, await setup.scopedGuard(), {
        commandId: executionCommandId('stage-claim'),
        canonicalRequest: setup.canonicalRequest,
        stateEvidence: setup.preparationInput.stateEvidence,
      }),
    );
    return setup.ownership;
  }
  if (population === 'claim_accepted') {
    const setup = await prepareClaimed(fixture);
    return setup.ownership;
  }
  if (population === 'decision_consumed') {
    const setup = await prepareTurn(fixture);
    unwrapReply(
      await stores.runs.recordExecution(
        await setup.currentGuard(),
        createExecutionCommand(
          decodeExecutionFact({
            kind: 'waiting',
            wait: {
              version: 1,
              correlationKey: 'wait-1',
              prompt: setup.quiescence.evidence,
              choices: ['yes', 'no'],
            },
            quiescence: setup.quiescence,
          }),
          'wait-command',
        ),
      ),
    );
    const decision = decodeDecision({
      version: 1,
      decisionId: 'decision',
      attemptId: setup.admission.attemptId,
      correlationKey: 'wait-1',
      choice: 'yes',
      actorId: 'actor',
      authorizationEvidence: setup.quiescence.evidence,
    });
    unwrapReply(await stores.runs.receiveDecision(setup.ownership, decision));
    unwrapReply(await stores.runs.consumeDecision(await setup.currentGuard(), decision.decisionId));
    return setup.ownership;
  }
  if (population === 'outbox_pending' || population === 'receipt_settled') {
    const setup = await prepareTurn(fixture);
    const completion = createCompletion(setup.claim, setup.quiescence);
    unwrapReply(await stores.runs.commitOutcome(await setup.currentGuard(), completion));
    if (population === 'receipt_settled')
      unwrapReply(
        await stores.runs.reconcileReceipt(
          await setup.currentGuard(),
          decodeReceipt({
            version: 2,
            commandId: completion.intent.commandId,
            commandDigest: completion.intent.commandDigest,
            claim: setup.claim,
            acceptedWbsRevision: 'wbs-2',
            evidence: setup.quiescence.evidence,
          }),
        ),
      );
    return setup.ownership;
  }
  if (population === 'ownership_takeover') {
    const setup = await prepareSession(fixture);
    clock.advance(101);
    return unwrapReply(
      await stores.runs.acquireOwnership(ownerId('successor'), setup.ownership.epoch),
    );
  }
  const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('owner'), 0));
  const scope = { organizationId: 'organization', projectId: 'project', personId: 'person' };
  unwrapReply(await stores.runs.retainManifest(ownership, createManifest()));
  unwrapReply(
    await stores.runs.pinRuntimeScope(ownership, { version: 1, scope, ledgerId: 'ledger' }),
  );
  // Fixed fixture bytes emitted by the unchanged canonicalRuntimeRequest owner; the pinned provider decodes them again.
  const canonical =
    '{"schemaVersion":1,"expectedLedgerId":"ledger","scope":{"organizationId":"organization","projectId":"project","personId":"person"},"commandId":"original","operation":{"kind":"authority","ownerId":"receiver-owner","expectedGeneration":null}}';
  const original = unwrapReply(
    await stores.runs.stageRuntimeRequest({ ownership, scope, expectedRevision: 0 }, canonical),
  );
  if (population === 'authority_accepted') {
    const retained = await stores.artifacts.retainArtifact(
      new TextEncoder().encode('original authority evidence'),
      'text/plain',
    );
    if (retained.kind !== 'retained') throw new Error('fixture artifact refused');
    unwrapReply(
      await stores.runs.recordRuntimeAcceptance(
        { ownership, scope, expectedRevision: 1 },
        { intent: original, evidence: retained.reference },
      ),
    );
  }
  return ownership;
}
const populationCodec = type(
  "'queued' | 'prepared' | 'authority_pending' | 'authority_accepted' | 'claim_pending' | 'claim_accepted' | 'decision_consumed' | 'outbox_pending' | 'receipt_settled' | 'ownership_takeover'",
);
const requestCodec = type({ kind: "'populate'", requestId: 'string', population: populationCodec })
  .or({
    kind: "'invoke'",
    requestId: 'string',
    method: "'retainManifest'",
    parameters: ['unknown', 'unknown'],
  })
  .or({ kind: "'capture'", requestId: 'string' })
  .or({ kind: "'close'", requestId: 'string' })
  .onUndeclaredKey('reject');
let closed = false;
try {
  sendReply({
    kind: 'ready',
    sourceCommit,
    format: {
      version: SCHEMA_VERSION,
      bundleHash: FORMAT_HASH,
      migrations: MIGRATIONS.map(({ name, forwardHash, downHash }) => ({
        name,
        forwardHash,
        downHash,
      })),
    },
  });
  for await (const line of createInterface({ input: process.stdin })) {
    const request = parseOrThrow(requestCodec, JSON.parse(line));
    try {
      if (request.kind === 'close') {
        try {
          await stores.close();
        } finally {
          database.close();
          closed = true;
        }
        sendReply({ kind: 'reply', requestId: request.requestId, value: null });
        break;
      }
      const value =
        request.kind === 'capture'
          ? captureDatabase()
          : request.kind === 'populate'
            ? await populateHistory(request.population)
            : await stores.runs.retainManifest(
                decodeOwnership(request.parameters[0]),
                decodeManifest(request.parameters[1]),
              );
      sendReply({ kind: 'reply', requestId: request.requestId, value });
    } catch (cause) {
      sendReply({ kind: 'error', requestId: request.requestId, error: describeFailure(cause) });
    }
  }
} finally {
  if (!closed) {
    try {
      await stores.close();
    } finally {
      database.close();
    }
  }
}
