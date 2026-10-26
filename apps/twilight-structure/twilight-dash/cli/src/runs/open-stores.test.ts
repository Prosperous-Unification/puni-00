import { rejects } from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';
import ts from 'typescript';

import { openStores, type SqliteConfiguration } from './open-stores';
import { organizationId, ownerId } from './record-codecs';
import { acceptRuntimeReceipt } from './runtime-history';
import { bootstrapSqliteStores } from './sqlite/open-stores';
import {
  createCompletion,
  createManifest,
  createRun,
  FixtureClock,
  stageFixtureTurn,
  unwrapReply,
} from './testing/fixtures';
import {
  authorityReceipt,
  authorityRequest,
  runtimePin,
  runtimeScope,
} from './testing/runtime-history-contract';
import { prepareWait } from './testing/signals-contract';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function configuration(): SqliteConfiguration {
  const directory = mkdtempSync(join(tmpdir(), 'runs-production-'));
  directories.push(directory);
  return {
    provider: 'sqlite',
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    maxBusyAttempts: 3,
    busyDelayMilliseconds: 1,
  };
}
test('production SQLite selection reopens persisted ports and ownership', async () => {
  const settings = configuration();
  const clock = new FixtureClock();
  const initial = await bootstrapSqliteStores({ ...settings, clock });
  const ownership = unwrapReply(await initial.runs.acquireOwnership(ownerId('owner'), 0));
  unwrapReply(await initial.runs.retainManifest(ownership, createManifest()));
  unwrapReply(await initial.runs.createRun(ownership, createRun()));
  const retained = await initial.artifacts.retainArtifact(new Uint8Array([4, 2]), 'test/bytes');
  if (retained.kind !== 'retained') throw new Error('fixture artifact refused');
  initial.close();
  const stores = await openStores(settings, clock);
  try {
    expect(stores.ownership.owner).toEqual(ownership);
    expect((await stores.runs.readRun(createRun().runId)).run).toEqual(createRun());
    expect(await stores.artifacts.readArtifact(retained.reference)).toEqual(new Uint8Array([4, 2]));
  } finally {
    stores.close();
  }
});
for (const provider of ['memory', 'unknown', '', null, undefined, 1])
  test(`production selection rejects provider ${String(provider)}`, async () => {
    const settings = configuration();
    const clock = new FixtureClock();
    (await bootstrapSqliteStores({ ...settings, clock })).close();
    expect(existsSync(settings.path)).toBe(true);
    await rejects(async () => {
      const stores = await openStores({ ...settings, provider } as SqliteConfiguration, clock);
      stores.close();
    }, /Validation failed/);
  });
const malformed: readonly (readonly [string, unknown])[] = [
  ['path', ''],
  ['path', 1],
  ['organizationId', ''],
  ['organizationId', 1],
  ['capacity', 0],
  ['capacity', 1.5],
  ['capacity', Number.MAX_SAFE_INTEGER + 1],
  ['leaseMilliseconds', 0],
  ['maxBusyAttempts', 0],
  ['busyDelayMilliseconds', -1],
];
for (const [field, invalid] of malformed)
  test(`production configuration rejects malformed ${field} ${String(invalid)}`, async () => {
    const settings = configuration();
    const clock = new FixtureClock();
    (await bootstrapSqliteStores({ ...settings, clock })).close();
    await rejects(openStores({ ...settings, [field]: invalid }, clock));
  });
for (const field of [
  'path',
  'organizationId',
  'capacity',
  'leaseMilliseconds',
  'maxBusyAttempts',
  'busyDelayMilliseconds',
] as const)
  test(`production configuration requires ${field}`, async () => {
    const settings = configuration();
    const clock = new FixtureClock();
    (await bootstrapSqliteStores({ ...settings, clock })).close();
    const missing = Object.fromEntries(Object.entries(settings).filter(([name]) => name !== field));
    await rejects(openStores(missing as SqliteConfiguration, clock));
  });
test('production configuration rejects nullish input and malformed clock', async () => {
  const settings = configuration();
  const clock = new FixtureClock();
  (await bootstrapSqliteStores({ ...settings, clock })).close();
  for (const input of [null, undefined, 1])
    await rejects(openStores(input as unknown as SqliteConfiguration, clock));
  await rejects(openStores(settings, {} as FixtureClock));
});
test('production open never bootstraps absent trusted state', async () => {
  const settings = configuration();
  await rejects(openStores(settings, new FixtureClock()), /absent/);
  expect(existsSync(settings.path)).toBe(false);
});
for (const [field, changed] of [
  ['organizationId', 'foreign'],
  ['capacity', 2],
  ['leaseMilliseconds', 101],
] as const)
  test(`production open refuses changed persisted ${field}`, async () => {
    const settings = configuration();
    const clock = new FixtureClock();
    (await bootstrapSqliteStores({ ...settings, clock })).close();
    await rejects(openStores({ ...settings, [field]: changed }, clock), /configuration/);
  });

test('production close is idempotent and every public operation refuses closed despite a retained connection', async () => {
  const settings = configuration();
  const clock = new FixtureClock();
  (await bootstrapSqliteStores({ ...settings, clock })).close();
  const stores = await openStores(settings, clock);
  const setup = await prepareWait({ ...stores, clock });
  const { ownership, decision, claim, quiescence, command, admission, run } = setup;
  unwrapReply(await stores.runs.receiveDecision(ownership, decision));
  const consumptionGuard = await setup.currentGuard();
  unwrapReply(await stores.runs.consumeDecision(consumptionGuard, decision.decisionId));
  await stageFixtureTurn(
    setup,
    { kind: 'decision', decisionId: decision.decisionId },
    'continuation',
  );
  const completion = createCompletion(claim, quiescence);
  const outcomeGuard = await setup.currentGuard();
  unwrapReply(await stores.runs.commitOutcome(outcomeGuard, completion));
  const receipt = {
    version: 2 as const,
    commandId: completion.intent.commandId,
    commandDigest: completion.intent.commandDigest,
    claim,
    acceptedWbsRevision: 'accepted',
    evidence: quiescence.evidence,
  };
  const receiptGuard = await setup.currentGuard();
  unwrapReply(await stores.runs.reconcileReceipt(receiptGuard, receipt));
  unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
  const runtimeScopeBefore = await stores.runs.readRuntimeScope(runtimeScope);
  if (runtimeScopeBefore.kind !== 'pinned') throw new Error('expected retained runtime scope');
  const runtimeGuard = {
    ownership,
    scope: runtimeScope,
    expectedRevision: runtimeScopeBefore.revision,
  };
  const runtimeIntent = unwrapReply(
    await stores.runs.stageRuntimeRequest(runtimeGuard, authorityRequest('acquire', 1)),
  );
  const receiptArtifact = await stores.artifacts.retainArtifact(
    new TextEncoder().encode(JSON.stringify(authorityReceipt(runtimeIntent))),
    'application/json',
  );
  if (receiptArtifact.kind !== 'retained') throw new Error('fixture runtime receipt refused');
  const acceptanceGuard = { ...runtimeGuard, expectedRevision: runtimeGuard.expectedRevision + 1 };
  unwrapReply(
    await acceptRuntimeReceipt(
      stores.runs,
      stores.artifacts,
      acceptanceGuard,
      runtimeIntent,
      receiptArtifact.reference,
    ),
  );
  const history = await stores.runs.readExecutionHistory(run.runId, admission.attemptId);
  const claimStage = history.executions.find(
    (entry) => entry.command.kind === 'stage_claim',
  )?.command;
  const claimAcceptance = history.executions.find(
    (entry) => entry.command.kind === 'accept_claim',
  )?.command;
  const turnStage = history.executions.find(
    (entry) => entry.command.kind === 'stage_turn',
  )?.command;
  if (
    claimStage?.kind !== 'stage_claim' ||
    claimAcceptance?.kind !== 'accept_claim' ||
    turnStage?.kind !== 'stage_turn'
  )
    throw new Error('required fixture execution commands missing');
  const scopedGuard = { ...setup.guard, scope: setup.scope, expectedScopeRevision: 0 };
  const operations = {
    stageClaim: () => stores.runs.stageClaim(scopedGuard, claimStage),
    recordClaimAcceptance: () => stores.runs.recordClaimAcceptance(scopedGuard, claimAcceptance),
    stageTurn: () => stores.runs.stageTurn(scopedGuard, turnStage),
    readExecutionHistory: () => stores.runs.readExecutionHistory(run.runId, admission.attemptId),
    pinRuntimeScope: () => stores.runs.pinRuntimeScope(ownership, runtimePin),
    readRuntimeScope: () => stores.runs.readRuntimeScope(runtimeScope),
    stageRuntimeRequest: () =>
      stores.runs.stageRuntimeRequest(runtimeGuard, authorityRequest('acquire', 1)),
    recordRuntimeAcceptance: () =>
      stores.runs.recordRuntimeAcceptance(acceptanceGuard, {
        intent: runtimeIntent,
        evidence: receiptArtifact.reference,
      }),
    acquireOwnership: () => stores.runs.acquireOwnership(ownerId('owner'), ownership.epoch),
    renewOwnership: () => stores.runs.renewOwnership(ownership),
    retainManifest: () => stores.runs.retainManifest(ownership, createManifest()),
    readManifest: () => stores.runs.readManifest(run.manifestDigest),
    createRun: () => stores.runs.createRun(ownership, createRun()),
    readRun: () => stores.runs.readRun(run.runId),
    admitAttempt: () =>
      stores.runs.admitAttempt({ ownership, runId: run.runId, expectedRevision: 0 }, admission),
    recordExecution: () => stores.runs.recordExecution(setup.guard, command),
    commitOutcome: () => stores.runs.commitOutcome(outcomeGuard, completion),
    receiveDecision: () => stores.runs.receiveDecision(ownership, decision),
    consumeDecision: () => stores.runs.consumeDecision(consumptionGuard, decision.decisionId),
    reconcileReceipt: () => stores.runs.reconcileReceipt(receiptGuard, receipt),
    retainArtifact: () => stores.artifacts.retainArtifact(new Uint8Array([1]), 'test/bytes'),
    readArtifact: () => stores.artifacts.readArtifact(quiescence.evidence),
  };
  for (const operation of Object.values(operations)) await operation();
  expect(Object.keys(operations).sort()).toEqual(
    [...Object.keys(stores.runs), ...Object.keys(stores.artifacts)].sort(),
  );
  const descriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'close');
  if (descriptor === undefined) throw new Error('Database.close descriptor absent');
  const connections: Database[] = [];
  Object.defineProperty(Database.prototype, 'close', {
    ...descriptor,
    value(this: Database) {
      connections.push(this);
    },
  });
  try {
    stores.close();
    stores.close();
    for (const [name, operation] of Object.entries(operations))
      await rejects(operation(), /closed/, `${name} must refuse a closed store`);
    expect(connections).toHaveLength(1);
  } finally {
    Object.defineProperty(Database.prototype, 'close', descriptor);
    for (const connection of new Set(connections)) connection.close();
    stores.close();
  }
});

function portableImports(path: string): string[] {
  const file = ts.createSourceFile(
    path,
    readFileSync(join(import.meta.dir, path), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const dependencies: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      dependencies.push(node.moduleSpecifier.text);
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      dependencies.push(node.argument.literal.text);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    )
      for (const argument of node.arguments)
        dependencies.push(ts.isStringLiteral(argument) ? argument.text : '<computed import>');
    ts.forEachChild(node, visit);
  };
  visit(file);
  return dependencies;
}
test('portable ports and core records exclude adapter dependencies structurally', () => {
  // Proof: D01R/D02R/D03R injected records/live-port/aggregate edges into each new owner, and D04R restored the runtime aggregate edge; this structural test named each forbidden path and failed.
  const allowed: Readonly<Record<string, readonly string[]>> = {
    'run-store.ts': ['./records', './runtime-records', './execution-records'],
    'artifact-store.ts': ['./records'],
    'records.ts': ['./record-codecs', './claim-records', './execution-records'],
    'record-codecs.ts': [
      '@shared/validation',
      '@twilight-burokrat/contracts',
      './value-codecs',
      './execution-codecs',
    ],
    'runtime-records.ts': ['./records', '@wbs/contracts'],
    'runtime-codecs.ts': [
      'node:crypto',
      '@shared/validation',
      '@wbs/contracts',
      './value-codecs',
      './runtime-records',
    ],
    'execution-records.ts': [
      '../agents/execution-records',
      './claim-records',
      './records',
      './runtime-records',
    ],
    'claim-records.ts': [
      '@wbs/contracts',
      '../agents/execution-records',
      './records',
      './runtime-records',
    ],
    'execution-codecs.ts': [
      '@shared/validation',
      '../agents/execution-codecs',
      './runtime-codecs',
      './value-codecs',
    ],
    'value-codecs.ts': ['@shared/validation'],
    '../agents/execution-records.ts': ['@twilight-burokrat/contracts', '../runs/records'],
    '../agents/execution-codecs.ts': [
      '@shared/validation',
      '../runs/value-codecs',
      './execution-records',
    ],
  };
  // Proof: F66 injecting './sqlite/run-store' into actual runtime-records.ts named that forbidden dependency here; exact restoration passed.
  const violations = Object.entries(allowed).flatMap(([path, dependencies]) =>
    portableImports(path)
      .filter((dependency) => !dependencies.includes(dependency))
      .map((dependency) => ({ path, dependency })),
  );
  // Proof: eight real port-source injections (provider/path/schema imports, export, import type, dynamic/computed import and require) each named the forbidden dependency here.
  expect(violations).toEqual([]);
});
