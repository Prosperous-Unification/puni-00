import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import { parseOrThrow, type } from '@shared/validation';
import { Database } from 'bun:sqlite';

import { stageClaimRequest } from '../claim-history';
import {
  decodeClaimAcceptCommand,
  decodeClaimStageCommand,
  decodeScopedAttemptGuard,
  decodeTurnStageCommand,
} from '../execution-codecs';
import {
  assertInteger,
  decisionId,
  decodeAdmission,
  decodeAttemptGuard,
  decodeCompletion,
  decodeDecision,
  decodeExecutionCommand,
  decodeExecutionFact,
  decodeManifest,
  decodeOwnership,
  decodeReceipt,
  decodeRun,
  decodeRunGuard,
  executionCommandId,
  organizationId,
  ownerId,
} from '../record-codecs';
import type { RunStore } from '../run-store';
import {
  decodeRuntimeAcceptanceInput,
  decodeRuntimeGuard,
  decodeRuntimePin,
} from '../runtime-codecs';
import { FORMAT_HASH, MIGRATIONS, SCHEMA_VERSION } from '../sqlite/format';
import { bootstrapSqliteStores, openSqliteStores } from '../sqlite/open-stores';
import { createSqliteRunStore, isBusy } from '../sqlite/run-store';
import { configureDatabase, validateDatabase } from '../sqlite/schema';
import {
  admitExecution,
  createCompletion,
  createExecutionCommand,
  createManifest,
  FixtureClock,
  prepareClaimed,
  prepareSession,
  prepareTurn,
  unwrapReply,
} from './fixtures';
import type {
  Format4Capture,
  Format4Command,
  Format4Failure,
  Format4Mutation,
  Format4Population,
  Format4Response,
} from './format4-protocol';
import {
  correlateFormat4Request,
  decodeFormat4Command,
  decodeFormat4Payload,
  type Format4Payload,
  format4SourceEntries,
} from './format4-protocol';
import { authorityReceipt } from './runtime-history-contract';

const path = process.argv.at(2);
const sourceCommit = process.argv.at(3);
if (path === undefined || sourceCommit !== 'b3b594dab4f0153d2ef00a2989bbeb02ea0cbbda')
  throw new Error('pinned fixture arguments missing');
// This worker is copied under the immutable archived import root; these imports must load the actual predecessor before bootstrap.
function checkOriginalFormat(version: number, hash: string): void {
  if (version !== 4 || hash !== '7513eae970beb3028572e9720a8c6db1ed7d36d16f2d2def59c3d5f839a8a058')
    throw new Error('fixture did not load original format4 provider');
}
checkOriginalFormat(SCHEMA_VERSION, FORMAT_HASH);
const sourceFiles = format4SourceEntries.map((path) => ({
  path,
  sha256: new Bun.CryptoHasher('sha256')
    .update(readFileSync(new URL('../' + path, import.meta.url)))
    .digest('hex'),
}));
const clock = new FixtureClock();
const mode = process.argv.at(4);
const signals = parseOrThrow(type('string'), process.argv.at(5));
const initialized = await (mode === 'open' ? openSqliteStores : bootstrapSqliteStores)({
  path,
  organizationId: organizationId('organization'),
  capacity: 1,
  leaseMilliseconds: 100,
  clock,
  maxBusyAttempts: 15000,
  busyDelayMilliseconds: 1,
});
await initialized.close();
const connection = new Database(path, { create: false, strict: true });
try {
  configureDatabase(connection);
  validateDatabase(connection);
} catch (cause) {
  try {
    connection.close();
  } catch (cleanupCause) {
    throw new AggregateError(
      [cause, cleanupCause],
      'old connection initialization and cleanup failed',
      { cause: cleanupCause },
    );
  }
  throw cause;
}
const stores = {
  ...createSqliteRunStore(connection, { clock, maxBusyAttempts: 15000, busyDelayMilliseconds: 1 }),
  ownership: initialized.ownership,
};
const counts = new Map<string, number>();
function observe(event: string) {
  const count = (counts.get(event) ?? 0) + 1;
  counts.set(event, count);
  writeFileSync(join(signals, event + '.next'), String(count));
  renameSync(join(signals, event + '.next'), join(signals, event));
}
let pauseBusyAt: number | undefined;
function waitRelease(name: string) {
  const deadline = Date.now() + 15000;
  while (!existsSync(join(signals, name))) {
    if (Date.now() >= deadline) throw new Error('old ' + name + ' timed out');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
  }
}
const nativeRun = connection.run.bind(connection);
connection.run = function (sql, ...parameters) {
  if (sql === 'BEGIN IMMEDIATE') observe('attempt_entered');
  try {
    return nativeRun(sql, ...parameters);
  } catch (cause) {
    if (sql === 'BEGIN IMMEDIATE' && isBusy(cause)) {
      observe('busy');
      if (pauseBusyAt !== undefined && (counts.get('invoked') ?? 0) >= pauseBusyAt) {
        pauseBusyAt = undefined;
        observe('busy_paused');
        waitRelease('release_busy');
      }
    }
    throw cause;
  }
};
let armed = false;
function supportsFunction(
  connection: Database,
): connection is Database & { function(name: string, callback: () => number): void } {
  return 'function' in connection && typeof connection.function === 'function';
}
try {
  if (!supportsFunction(connection))
    throw new Error('native SQLite function registration unavailable');
  connection.function('hold_old_callback', () => {
    if (!armed) return 0;
    armed = false;
    observe('callback_entered');
    const deadline = Date.now() + 15000;
    while (!existsSync(join(signals, 'release_callback'))) {
      if (Date.now() >= deadline) throw new Error('old callback release timed out');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
    }
    return 0;
  });
} catch (cause) {
  try {
    await stores.close();
  } catch (cleanupCause) {
    throw new AggregateError(
      [cause, cleanupCause],
      'old callback initialization and cleanup failed',
      { cause: cleanupCause },
    );
  }
  throw cause;
}
let database: Database;
try {
  database = new Database(path, { create: false, strict: true, safeIntegers: true });
} catch (cause) {
  try {
    await stores.close();
  } catch (cleanupCause) {
    throw new AggregateError(
      [cause, cleanupCause],
      'old observer initialization and cleanup failed',
      { cause: cleanupCause },
    );
  }
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
function captureDatabase(): Format4Capture {
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
function sendReply(message: Format4Response): void {
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
function describeFailure(cause: unknown): Format4Failure {
  return cause instanceof Error
    ? {
        name: cause.name,
        message: cause.message,
        ...('code' in cause ? { code: parseOrThrow(type('string | number'), cause.code) } : {}),
        ...(cause instanceof AggregateError
          ? { errors: Array.from(cause.errors, (error: unknown) => describeFailure(error)) }
          : {}),
        cause: cause.cause === undefined ? null : describeFailure(cause.cause),
      }
    : { thrown: String(cause) };
}
async function populateHistory(population: Format4Population, ports = stores) {
  const stores = ports;
  const fixture = { ...stores, clock };
  if (population === 'queued') {
    const setup = await admitExecution(fixture);
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
      new TextEncoder().encode(JSON.stringify(authorityReceipt(original))),
      'application/json',
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

/** Stops immediately before the selected fresh call, preserving the real pinned predecessor that makes it eligible. */
async function prepareMutation(method: Format4Mutation): Promise<Format4Command> {
  let captured: Format4Command | undefined;
  const stop = new Error('selected fresh invocation captured');
  const runs = new Proxy(stores.runs, {
    get(target, property: keyof RunStore) {
      if (property !== method) return target[property].bind(target);
      return (...parameters: unknown[]) => {
        // The proxy only intercepts a typed pinned fixture's call; invokeMutation independently decodes transport input.
        captured = decodeFormat4Command({ method, parameters });
        throw stop;
      };
    },
  });
  try {
    const ports = { ...stores, runs };
    if (method === 'renewOwnership') {
      const ownership = unwrapReply(await runs.acquireOwnership(ownerId('owner'), 0));
      await runs.renewOwnership(ownership);
    } else if (method === 'receiveDecision' || method === 'consumeDecision') {
      await populateHistory('decision_consumed', ports);
    } else {
      await populateHistory('receipt_settled', ports);
    }
  } catch (cause) {
    if (cause !== stop) throw cause;
  }
  if (captured === undefined) throw new Error('fixture did not reach selected fresh mutation');
  return captured;
}
const mutationCodec = type(
  "'acquireOwnership' | 'renewOwnership' | 'retainManifest' | 'createRun' | 'admitAttempt' | 'pinRuntimeScope' | 'stageRuntimeRequest' | 'recordRuntimeAcceptance' | 'recordExecution' | 'stageClaim' | 'recordClaimAcceptance' | 'stageTurn' | 'receiveDecision' | 'consumeDecision' | 'commitOutcome' | 'reconcileReceipt'",
);
/** Every serialized command crosses its exact original guard/command codec before calling the original provider. */
async function invokeMutation(method: Format4Mutation, parameters: unknown[]) {
  if (parameters.length !== (method === 'renewOwnership' ? 1 : 2))
    throw new Error('old invocation arity differs');
  const [first, second] = parameters;
  switch (method) {
    case 'acquireOwnership': {
      const epoch = parseOrThrow(type('number'), second);
      assertInteger(epoch);
      return await stores.runs.acquireOwnership(ownerId(first), epoch);
    }
    case 'renewOwnership':
      return await stores.runs.renewOwnership(decodeOwnership(first));
    case 'retainManifest':
      return await stores.runs.retainManifest(decodeOwnership(first), decodeManifest(second));
    case 'createRun':
      return await stores.runs.createRun(decodeOwnership(first), decodeRun(second));
    case 'admitAttempt':
      return await stores.runs.admitAttempt(decodeRunGuard(first), decodeAdmission(second));
    case 'pinRuntimeScope':
      return await stores.runs.pinRuntimeScope(decodeOwnership(first), decodeRuntimePin(second));
    case 'stageRuntimeRequest':
      return await stores.runs.stageRuntimeRequest(
        decodeRuntimeGuard(first),
        parseOrThrow(type('string'), second),
      );
    case 'recordRuntimeAcceptance':
      return await stores.runs.recordRuntimeAcceptance(
        decodeRuntimeGuard(first),
        decodeRuntimeAcceptanceInput(second),
      );
    case 'recordExecution':
      return await stores.runs.recordExecution(
        decodeAttemptGuard(first),
        decodeExecutionCommand(second),
      );
    case 'stageClaim':
      return await stores.runs.stageClaim(
        decodeScopedAttemptGuard(first),
        decodeClaimStageCommand(second),
      );
    case 'recordClaimAcceptance':
      return await stores.runs.recordClaimAcceptance(
        decodeScopedAttemptGuard(first),
        decodeClaimAcceptCommand(second),
      );
    case 'stageTurn':
      return await stores.runs.stageTurn(
        decodeScopedAttemptGuard(first),
        decodeTurnStageCommand(second),
      );
    case 'receiveDecision':
      return await stores.runs.receiveDecision(decodeOwnership(first), decodeDecision(second));
    case 'consumeDecision':
      return await stores.runs.consumeDecision(decodeAttemptGuard(first), decisionId(second));
    case 'commitOutcome':
      return await stores.runs.commitOutcome(decodeAttemptGuard(first), decodeCompletion(second));
    case 'reconcileReceipt':
      return await stores.runs.reconcileReceipt(decodeAttemptGuard(first), decodeReceipt(second));
  }
}
const populationCodec = type(
  "'queued' | 'prepared' | 'authority_pending' | 'authority_accepted' | 'claim_pending' | 'claim_accepted' | 'decision_consumed' | 'outbox_pending' | 'receipt_settled' | 'ownership_takeover'",
);
const requestCodec = type({
  kind: "'populate'",
  requestId: 'string',
  population: populationCodec,
  'mutation?': mutationCodec,
})
  .or({ kind: "'invoke'", requestId: 'string', method: mutationCodec, parameters: 'unknown[]' })
  .or({ kind: "'retain_artifact'", requestId: 'string', base64: 'string', mediaType: 'string' })
  .or({ kind: "'advance_clock'", requestId: 'string', milliseconds: 'number' })
  .or({ kind: "'arm_callback'", requestId: 'string' })
  .or({ kind: "'arm_busy'", requestId: 'string', minimumInvoked: '1 | 2' })
  .or({ kind: "'capture' | 'hold_write' | 'release_write' | 'close'", requestId: 'string' })
  .onUndeclaredKey('reject');
let blocker: Database | undefined;
let closed = false;
const requests = new Set<Promise<void>>();
const requestFailures: unknown[] = [];
async function disposeWorker() {
  const failures: unknown[] = [];
  for (const release of [
    () => {
      if (blocker !== undefined) {
        try {
          if (blocker.inTransaction) blocker.run('ROLLBACK');
        } catch (cause) {
          failures.push(cause);
        }
        try {
          blocker.close();
        } catch (cause) {
          failures.push(cause);
        }
        blocker = undefined;
      }
    },
    async () => {
      const settlements = await Promise.allSettled(requests);
      for (const settlement of settlements)
        if (settlement.status === 'rejected') failures.push(settlement.reason);
    },
    async () => {
      await stores.close();
    },
    () => {
      database.close();
    },
  ]) {
    try {
      await Promise.resolve().then(release);
    } catch (cause) {
      failures.push(cause);
    }
  }
  for (const failure of requestFailures) if (!failures.includes(failure)) failures.push(failure);
  closed = true;
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'old worker cleanup failed');
}
async function processRequest(request: typeof requestCodec.infer) {
  try {
    let payload: Format4Payload;
    switch (request.kind) {
      case 'arm_busy':
        pauseBusyAt = (counts.get('invoked') ?? 0) + request.minimumInvoked;
        payload = { action: request.kind, value: 'armed' };
        break;
      case 'arm_callback':
        connection.run(
          'CREATE TEMP TRIGGER hold_old BEFORE UPDATE OF last_observed_at ON run_meta BEGIN SELECT hold_old_callback(); END',
        );
        armed = true;
        payload = { action: request.kind, value: 'armed' };
        break;
      case 'capture':
        payload = { action: 'capture', value: captureDatabase() };
        break;
      case 'populate':
        payload =
          request.mutation === undefined
            ? { action: 'populate', value: await populateHistory(request.population) }
            : { action: 'prepare', ...(await prepareMutation(request.mutation)) };
        break;
      case 'invoke':
        observe('invoked');
        payload = decodeFormat4Payload({
          action: 'invoke',
          method: request.method,
          value: await invokeMutation(request.method, request.parameters),
        });
        break;
      case 'retain_artifact':
        payload = {
          action: 'retain_artifact',
          value: await stores.artifacts.retainArtifact(
            new Uint8Array(Buffer.from(request.base64, 'base64')),
            request.mediaType,
          ),
        };
        break;
      case 'advance_clock':
        clock.advance(request.milliseconds);
        payload = { action: 'advance_clock', value: clock.read() };
        break;
      case 'hold_write':
        if (blocker !== undefined) throw new Error('blocker already held');
        blocker = new Database(path, { create: false, strict: true });
        blocker.run('BEGIN IMMEDIATE');
        payload = { action: 'hold_write', value: 'locked' };
        break;
      case 'release_write':
        if (blocker === undefined) throw new Error('blocker not held');
        blocker.run('ROLLBACK');
        blocker.close();
        blocker = undefined;
        payload = { action: 'release_write', value: 'released' };
        break;
      case 'close':
        throw new Error('close is owned by dispatcher');
    }
    sendReply({ kind: 'reply', requestId: request.requestId, payload });
  } catch (cause) {
    sendReply({
      kind: 'error',
      requestId: request.requestId,
      operation: correlateFormat4Request(request),
      error: describeFailure(cause),
    });
  }
}
try {
  sendReply({
    kind: 'ready',
    sourceCommit,
    sourceFiles,
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
    if (request.kind === 'close') {
      try {
        await disposeWorker();
        sendReply({
          kind: 'reply',
          requestId: request.requestId,
          payload: { action: 'close', value: null },
        });
      } catch (cause) {
        sendReply({
          kind: 'error',
          requestId: request.requestId,
          operation: correlateFormat4Request(request),
          error: describeFailure(cause),
        });
      }
      break;
    }
    const pending = processRequest(request);
    requests.add(pending);
    void pending.then(
      () => {
        requests.delete(pending);
      },
      (cause: unknown) => {
        requests.delete(pending);
        requestFailures.push(cause);
      },
    );
  }
} finally {
  if (!isClosed()) await disposeWorker();
}
function isClosed() {
  return closed;
}
