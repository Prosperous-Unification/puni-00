import { rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as filesystem from 'node:fs';
import { link, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { inspectDependencyActivation } from '@wbs/store-sqlite/cross-project-dependency-activation';
import * as storeConnections from '@wbs/store-sqlite/db';
import { openReadOnlyConnection } from '@wbs/store-sqlite/db';
import * as migrationSets from '@wbs/store-sqlite/migration-set';
import { afterEach, expect, spyOn, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { participantActivationFixture } from '../fixtures/dependency-participant-restoration';
import { roots } from '../fixtures/source-startup';
import {
  assertParticipantRestorationContext,
  consumePreparedDependencyActivation,
  prepareActivatedParticipantsUnderOwner,
  prepareInitialDependencyHandoffUnderOwner,
  releasePreparedDependencyActivation,
} from './complete-dependency-exclusion';
import type {
  ActivationRecordByLabel,
  ActivationRecordReference,
} from './dependency-activation-records';
import * as storage from './dependency-activation-storage';
import { retainActivationDatabase } from './dependency-activation-storage';
import * as ownership from './edge-ownership';
import { withDependencyOwner } from './edge-ownership';
import * as edgePolicy from './edge-policy';
import * as environment from './env';
import * as initialGraph from './initial-handoff-graph';
import * as managedCohort from './managed-cohort';
import * as migrationCapture from './migration-capture-file';
import * as sourceExclusion from './source-dev-exclusion';

async function database() {
  const root = scratchSync('activation-storage-');
  const host = `${root}/store.sqlite`;
  await writeFile(host, 'existing main');
  const parent = await lstat(root, { bigint: true });
  const main = await lstat(host, { bigint: true });
  return {
    path: '/data/store.sqlite',
    host,
    directoryIdentity: `${String(parent.dev)}:${String(parent.ino)}`,
    fileIdentity: `${String(main.dev)}:${String(main.ino)}`,
  };
}
test('retained database boundary refuses main replacement between census and next storage call', async () => {
  const binding = await database();
  const anchored = retainActivationDatabase(binding);
  try {
    anchored.inspect();
    await rename(binding.host, binding.host + '.original');
    await writeFile(binding.host, 'existing main');
    expect(() => {
      anchored.inspect();
    }).toThrow();
  } finally {
    anchored.close();
  }
});
test('retained database boundary refuses parent replacement despite same main inode', async () => {
  const binding = await database();
  const anchored = retainActivationDatabase(binding);
  const parent = binding.host.slice(0, binding.host.lastIndexOf('/'));
  try {
    await rename(parent, parent + '.moved');
    await mkdir(parent);
    await link(parent + '.moved/store.sqlite', binding.host);
    expect(() => {
      anchored.inspect();
    }).toThrow();
  } finally {
    anchored.close();
    await rm(parent, { recursive: true });
    await rename(parent + '.moved', parent);
  }
});

afterEach(async () => {
  restoreFixtureLayouts?.();
  restoreFixtureLayouts = undefined;
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  delete process.env['WBS_EDGE_STATE'];
});

let restoreFixtureLayouts: (() => void) | undefined;
const realEnvLayout = environment.envLayout;

/** Gives the raw decoder an independent expected layout pair for this completed scratch fixture. */
function bindFixtureLayouts(fixture: Awaited<ReturnType<typeof participantActivationFixture>>) {
  if (restoreFixtureLayouts !== undefined) throw new Error('fixture layouts already bound');
  const layouts = structuredClone(fixture.layouts);
  const provider = spyOn(environment, 'envLayout').mockImplementation((name) => {
    if (name === 'prod' || name === 'dev') return layouts[name];
    return realEnvLayout(name);
  });
  restoreFixtureLayouts = () => {
    provider.mockRestore();
    // Proof: omitting mockRestore failed the healthy prod afterEach identity assertion.
    expect(environment.envLayout).toBe(realEnvLayout);
  };
}

const digest = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function readEnvelope<Label extends 'participants' | 'intent' | 'committed' | 'backup'>(
  root: string,
  reference: ActivationRecordReference,
  label: Label,
): Promise<{ owner: string; record: ActivationRecordByLabel[Label] }> {
  const bytes = await readFile(join(root, reference.name));
  expect(digest(bytes)).toBe(reference.sha256);
  const envelope = JSON.parse(bytes.toString('utf8')) as {
    owner: string;
    record: ActivationRecordByLabel[Label];
  };
  const formats = {
    participants: 'complete-dependency-participants',
    intent: 'dependency-activation-intent',
    committed: 'dependency-activation-committed',
    backup: 'dependency-activation-backup',
  } as const;
  expect(envelope.record.format).toBe(formats[label]);
  return envelope;
}

for (const roster of [['prod'], ['dev'], ['prod', 'dev']] as const)
  test(`real selected ${roster.join('+')} intent references retain exact producer evidence and authority`, async () => {
    const fixture = await participantActivationFixture(roster);
    process.env['WBS_EDGE_STATE'] = fixture.root;
    await withDependencyOwner(
      fixture.request.owner,
      async (owner) => {
        const pending = await readFile(join(fixture.root, 'edge-owner.pending'), 'utf8');
        const prepared = await prepareActivatedParticipantsUnderOwner(
          owner,
          fixture.request,
          fixture.layouts,
          performance.now() + 180000,
          fixture.root,
          fixture.ports,
        );
        try {
          const context = await consumePreparedDependencyActivation(owner, prepared);
          expect(context.storage.intentRecords.map((entry) => entry.environment)).toEqual([
            ...roster,
          ]);
          expect(context.storage.commitRecords.map((entry) => entry.environment)).toEqual([
            ...roster,
          ]);
          const participants = await readEnvelope(
            fixture.root,
            context.storage.participantRecord,
            'participants',
          );
          expect(participants.owner).toBe(pending);
          expect(participants.record).toEqual(context.participants);
          for (const [position, environment] of roster.entries()) {
            const intentReference = context.storage.intentRecords[position];
            const commitReference = context.storage.commitRecords[position];
            const intent = await readEnvelope(fixture.root, intentReference.reference, 'intent');
            const committed = await readEnvelope(
              fixture.root,
              commitReference.reference,
              'committed',
            );
            expect(intent.owner).toBe(pending);
            expect(committed.owner).toBe(pending);
            expect(intent.record.format).toBe('dependency-activation-intent');
            expect(intent.record.version).toBe(1);
            expect(intent.record.environment).toBe(environment);
            expect(committed.record.environment).toBe(environment);
            expect(intent.record.receipt).toEqual(committed.record.receipt);
            expect(context.storage.receipts[position]).toEqual({
              environment,
              receipt: intent.record.receipt,
            });
            expect(intent.record.participantRecord).toEqual(context.storage.participantRecord);
            expect(intent.record.receipt.participantProofSha256).toBe(
              context.storage.participantRecord.sha256,
            );
            expect(intent.record.migrationManifestSha256).toBe(
              fixture.request.migrations.manifestSha256,
            );
            expect(committed.record.migrationManifestSha256).toBe(
              fixture.request.migrations.manifestSha256,
            );
            const backup = await readEnvelope(fixture.root, intent.record.backup, 'backup');
            expect(backup.owner).toBe(pending);
            expect(backup.record.environment).toBe(environment);
            expect(backup.record.databaseIdentity).toBe(intent.record.receipt.databaseIdentity);
            expect(backup.record.captureSha256).toBe(intent.record.capture.sha256);
            expect(committed.record.captureSha256).toBe(intent.record.capture.sha256);
            expect(intent.record.receipt.migrationCaptureSha256).toBe(intent.record.capture.sha256);
            const evidence = join(fixture.root, `dependency-activation-${context.attempt}`);
            const captureBytes = await readFile(join(evidence, intent.record.capture.name));
            expect(digest(captureBytes)).toBe(intent.record.capture.sha256);
            const capture = JSON.parse(captureBytes.toString('utf8')) as {
              target: string;
              candidate: string;
              pending: unknown[];
            };
            expect(capture.target).toBe(intent.record.receipt.databaseIdentity);
            expect(capture.candidate).toBe(intent.record.receipt.candidateImage);
            expect(capture.pending).toEqual([]);
            const backupBytes = await readFile(join(evidence, backup.record.snapshot.name));
            expect(backupBytes.length).toBe(backup.record.snapshot.bytes);
            expect(digest(backupBytes)).toBe(backup.record.snapshot.sha256);
          }
          for (const [environment, path] of [
            ['prod', fixture.prodPath],
            ['dev', fixture.devPath],
          ] as const) {
            const connection = openReadOnlyConnection(path);
            try {
              const selected = context.storage.receipts.find(
                (entry) => entry.environment === environment,
              );
              expect(inspectDependencyActivation(connection.db)).toEqual(
                selected === undefined
                  ? { state: 'DISABLED', receipt: null }
                  : { state: 'ENABLED', receipt: selected.receipt },
              );
            } finally {
              connection.close();
            }
          }
          await context.storage.evidence.inspect();
          const first = context.storage.intentRecords[0];
          const path = join(fixture.root, first.reference.name);
          const bytes = await readFile(path);
          if (roster.length === 2) {
            const before = await lstat(path, { bigint: true });
            await rename(path, path + '.original');
            await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
            const after = await lstat(path, { bigint: true });
            expect(`${String(after.dev)}:${String(after.ino)}`).not.toBe(
              `${String(before.dev)}:${String(before.ino)}`,
            );
            expect(await readFile(path)).toEqual(bytes);
          } else {
            await writeFile(path, Buffer.concat([bytes, Buffer.from('changed')]));
            expect(digest(await readFile(path))).not.toBe(first.reference.sha256);
          }
          await rejects(context.storage.evidence.inspect());
        } finally {
          releasePreparedDependencyActivation(owner, prepared);
        }
      },
      fixture.root,
    );
  }, 180000);

for (const roster of [['prod'], ['dev'], ['prod', 'dev']] as const)
  test(`initial handoff ${roster.join('+')} retains genuine bounded original evidence`, async () => {
    const fixture = await participantActivationFixture(roster);
    bindFixtureLayouts(fixture);
    process.env['WBS_EDGE_STATE'] = fixture.root;
    await withDependencyOwner(
      fixture.request.owner,
      async (owner) => {
        const prepared = await prepareInitialDependencyHandoffUnderOwner(
          owner,
          fixture.request,
          fixture.layouts,
          performance.now() + 180000,
          fixture.root,
          fixture.ports,
        );
        let released = false;
        try {
          await rejects(consumePreparedDependencyActivation(owner, { ...prepared }));
          const context = await consumePreparedDependencyActivation(owner, prepared);
          expect(context.purpose).toBe('initial-handoff');
          if (context.purpose !== 'initial-handoff')
            throw new Error('mandatory initial evidence absent');
          expect(context.storage.purpose).toBe('initial-handoff');
          expect(context.storage.artifacts.selected.map(({ environment }) => environment)).toEqual([
            ...roster,
          ]);
          const labels = context.storage.records.map(
            ({ contents }) =>
              (JSON.parse(contents) as { record: { format: string } }).record.format,
          );
          expect(labels).toEqual([
            ...roster.flatMap(() => [
              'dependency-activation-capture',
              'dependency-activation-backup',
            ]),
            'complete-dependency-participants',
            ...roster.flatMap(() => [
              'dependency-activation-intent',
              'dependency-activation-committed',
            ]),
          ]);
          const pending = await readFile(join(fixture.root, 'edge-owner.pending'), 'utf8');
          expect(context.pending.contents).toBe(pending);
          const participants = await readEnvelope(
            fixture.root,
            context.storage.participantRecord,
            'participants',
          );
          expect(participants.owner).toBe(pending);
          expect(participants.record).toEqual(context.participants);
          for (const [position, environment] of roster.entries()) {
            const intentReference = context.storage.intentRecords.at(position);
            const commitReference = context.storage.commitRecords.at(position);
            if (intentReference === undefined || commitReference === undefined)
              throw new Error('selected provenance absent');
            const intent = await readEnvelope(fixture.root, intentReference.reference, 'intent');
            const committed = await readEnvelope(
              fixture.root,
              commitReference.reference,
              'committed',
            );
            const backup = await readEnvelope(fixture.root, intent.record.backup, 'backup');
            expect(intent.owner).toBe(pending);
            expect(committed.owner).toBe(pending);
            expect(backup.owner).toBe(pending);
            expect(intent.record.environment).toBe(environment);
            expect(committed.record.receipt).toEqual(intent.record.receipt);
            expect(context.storage.receipts[position]).toEqual({
              environment,
              receipt: intent.record.receipt,
            });
            expect(intent.record.participantRecord).toEqual(context.storage.participantRecord);
            expect(intent.record.receipt.participantProofSha256).toBe(
              context.storage.participantRecord.sha256,
            );
            expect(intent.record.receipt.migrationCaptureSha256).toBe(intent.record.capture.sha256);
            expect(backup.record.captureSha256).toBe(intent.record.capture.sha256);
            expect(committed.record.captureSha256).toBe(intent.record.capture.sha256);
            expect(intent.record.migrationManifestSha256).toBe(
              fixture.request.migrations.manifestSha256,
            );
            expect(committed.record.migrationManifestSha256).toBe(
              fixture.request.migrations.manifestSha256,
            );
            const evidence = join(fixture.root, `dependency-activation-${context.attempt}`);
            const captured = await readFile(join(evidence, intent.record.capture.name), 'utf8');
            const selected = context.storage.artifacts.selected.find(
              (entry) => entry.environment === environment,
            );
            if (selected === undefined) throw new Error('selected original raw projection absent');
            expect(selected.captureContents).toBe(captured);
            expect(digest(captured)).toBe(intent.record.capture.sha256);
            expect(selected.backup).toEqual({
              name: backup.record.snapshot.name,
              sha256: backup.record.snapshot.sha256,
              bytes: backup.record.snapshot.bytes,
            });
            const bytes = await readFile(join(evidence, selected.backup.name));
            expect(bytes.length).toBe(selected.backup.bytes);
            expect(digest(bytes)).toBe(selected.backup.sha256);
            const capture = migrationSets.parseMigrationSetCapture(JSON.parse(captured), {
              target: intent.record.receipt.databaseIdentity,
              attempt: `${context.attempt}:${environment}`,
              candidate: intent.record.receipt.candidateImage,
            });
            expect(capture.target).toBe(intent.record.receipt.databaseIdentity);
            expect(capture.candidate).toBe(intent.record.receipt.candidateImage);
            expect(capture.pending).toEqual([]);
            const ledger = openReadOnlyConnection(join(evidence, selected.backup.name));
            try {
              const namesAndHashes = ledger.db.all<{ name: string; hash: string }>(
                sql.raw('SELECT name,hash FROM __drizzle_migrations ORDER BY created_at,name'),
              );
              expect(namesAndHashes).toEqual(capture.applied);
            } finally {
              ledger.close();
            }
          }
          for (const publication of context.storage.records)
            expect(await readFile(publication.path, 'utf8')).toBe(publication.contents);
          for (const [environment, path] of [
            ['prod', fixture.prodPath],
            ['dev', fixture.devPath],
          ] as const) {
            const connection = openReadOnlyConnection(path);
            try {
              const selected = context.storage.receipts.find(
                (entry) => entry.environment === environment,
              );
              expect(inspectDependencyActivation(connection.db)).toEqual(
                selected === undefined
                  ? { state: 'DISABLED', receipt: null }
                  : { state: 'ENABLED', receipt: selected.receipt },
              );
            } finally {
              connection.close();
            }
          }
          await rejects(assertParticipantRestorationContext({ ...context }));
          await rejects(consumePreparedDependencyActivation(owner, prepared));
          await context.storage.evidence.inspect();
          expect(Object.isFrozen(context.storage.artifacts.selected)).toBe(true);
          expect(Object.isFrozen(context.storage.records)).toBe(true);
          const first = context.storage.artifacts.selected[0];
          expect(() => {
            Object.assign(first.backup, { sha256: '0'.repeat(64) });
          }).toThrow();
          const path = join(
            fixture.root,
            `dependency-activation-${context.attempt}`,
            first.backup.name,
          );
          await rename(path, path + '.original');
          await writeFile(path, await readFile(path + '.original'), { flag: 'wx', mode: 0o600 });
          await rejects(context.storage.evidence.inspect());
          releasePreparedDependencyActivation(owner, prepared);
          released = true;
          await rejects(assertParticipantRestorationContext(context));
          await rejects(context.storage.evidence.inspect());
        } finally {
          if (!released) releasePreparedDependencyActivation(owner, prepared);
        }
      },
      fixture.root,
    );
  }, 180000);

function inspectStores(fixture: Awaited<ReturnType<typeof participantActivationFixture>>) {
  return [fixture.prodPath, fixture.devPath].map((path) => {
    const connection = openReadOnlyConnection(path);
    try {
      return inspectDependencyActivation(connection.db);
    } finally {
      connection.close();
    }
  });
}
function assertSafeFailure(failure: unknown, stage?: string): asserts failure is Error {
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw new Error('expected actual refusal');
  expect(failure.message).not.toContain('PRIVATE_');
  expect(failure.cause).toBeUndefined();
  if (stage !== undefined) expect(failure.message).toContain(`stage=${stage}`);
}

for (const fault of ['anchor-close', 'operation-two-cleanups'] as const)
  test(`initial preparation ${fault} retains commits and closes directly owned original descriptors`, async () => {
    const fixture = await participantActivationFixture(['prod']);
    bindFixtureLayouts(fixture);
    process.env['WBS_EDGE_STATE'] = fixture.root;
    await withDependencyOwner(
      fixture.request.owner,
      async (owner) => {
        const open = filesystem.openSync;
        const close = filesystem.closeSync;
        const capture = edgePolicy.captureEdgeRecord;
        const activate = storage.activateDependencyStores;
        const live = new Map<number, string>();
        let withinStorage = false;
        let anchor: number | undefined;
        let stateDescriptor: number | undefined;
        let evidenceDescriptor: number | undefined;
        let committed = false;
        let cleanupFaults = 0;
        const opened = spyOn(filesystem, 'openSync').mockImplementation(
          (...args: Parameters<typeof open>) => {
            const descriptor = open(...args);
            const path = filesystem.readlinkSync(`/proc/self/fd/${String(descriptor)}`);
            live.set(descriptor, path);
            if (withinStorage && anchor === undefined && path === dirname(fixture.prodPath))
              anchor = descriptor;
            if (withinStorage && stateDescriptor === undefined && path === fixture.root)
              stateDescriptor = descriptor;
            if (
              withinStorage &&
              evidenceDescriptor === undefined &&
              dirname(path) === fixture.root &&
              path.slice(fixture.root.length + 1).startsWith('dependency-activation-')
            )
              evidenceDescriptor = descriptor;
            return descriptor;
          },
        );
        const closing = spyOn(filesystem, 'closeSync').mockImplementation((descriptor) => {
          close(descriptor);
          live.delete(descriptor);
          if (
            fault === 'anchor-close' &&
            committed &&
            descriptor === anchor &&
            cleanupFaults === 0
          ) {
            cleanupFaults++;
            throw new Error('PRIVATE_ANCHOR_CLOSE');
          }
          if (
            fault === 'operation-two-cleanups' &&
            committed &&
            cleanupFaults < 2 &&
            (descriptor === stateDescriptor || descriptor === evidenceDescriptor)
          ) {
            cleanupFaults++;
            throw new Error('PRIVATE_CLEANUP_' + String(cleanupFaults));
          }
        });
        const entry = spyOn(storage, 'activateDependencyStores').mockImplementation(
          async (...args) => {
            withinStorage = true;
            try {
              return await activate(...args);
            } finally {
              withinStorage = false;
            }
          },
        );
        const records = spyOn(edgePolicy, 'captureEdgeRecord').mockImplementation(
          async (...args) => {
            const observed = await capture(...args);
            if (args[1].endsWith('-activation-committed.json')) committed = true;
            if (
              fault === 'operation-two-cleanups' &&
              args[1].endsWith('-activation-fenced-complete.json')
            )
              throw new Error('PRIVATE_PRIMARY_FENCE_READ');
            return observed;
          },
        );
        let failure: unknown;
        try {
          await prepareInitialDependencyHandoffUnderOwner(
            owner,
            fixture.request,
            fixture.layouts,
            performance.now() + 180000,
            fixture.root,
            fixture.ports,
          );
        } catch (cause) {
          failure = cause;
        } finally {
          opened.mockRestore();
          closing.mockRestore();
          entry.mockRestore();
          records.mockRestore();
        }
        assertSafeFailure(
          failure,
          fault === 'anchor-close' ? 'anchor-finalizers' : 'exclusion-or-finalizer',
        );
        expect(cleanupFaults).toBe(fault === 'anchor-close' ? 1 : 2);
        // Only directly owned closes are faulted; raw.closeFiles itself is allowed to settle normally.
        expect([...live.values()]).toEqual([]);
        const authorities = inspectStores(fixture);
        expect(authorities[0].state).toBe('ENABLED');
        expect(authorities[0].receipt).not.toBeNull();
        expect(authorities[1]).toEqual({ state: 'DISABLED', receipt: null });
        expect(
          filesystem
            .readdirSync(fixture.root)
            .some((name) => name.endsWith('-activation-committed.json')),
        ).toBe(true);
      },
      fixture.root,
    );
  }, 180000);

test('initial preparation closes raw evidence after the actual final awaited fenced capture', async () => {
  const fixture = await participantActivationFixture(['prod']);
  bindFixtureLayouts(fixture);
  process.env['WBS_EDGE_STATE'] = fixture.root;
  const capture = edgePolicy.captureEdgeRecord;
  let injected = false;
  let fencedCaptures = 0;
  const boundary = spyOn(edgePolicy, 'captureEdgeRecord').mockImplementation(async (...args) => {
    const observed = await capture(...args);
    if (args[1].endsWith('-activation-fenced-complete.json') && ++fencedCaptures === 2) {
      const evidence = filesystem
        .readdirSync(fixture.root)
        .find((name) => name.startsWith('dependency-activation-'));
      if (evidence === undefined) throw new Error('actual evidence directory absent');
      filesystem.appendFileSync(
        join(fixture.root, evidence, 'prod.before.sqlite'),
        'changed after awaited fence',
      );
      injected = true;
    }
    return observed;
  });
  let failure: unknown;
  try {
    await withDependencyOwner(
      fixture.request.owner,
      (owner) =>
        prepareInitialDependencyHandoffUnderOwner(
          owner,
          fixture.request,
          fixture.layouts,
          performance.now() + 180000,
          fixture.root,
          fixture.ports,
        ),
      fixture.root,
    );
  } catch (cause) {
    failure = cause;
  } finally {
    boundary.mockRestore();
  }
  assertSafeFailure(failure);
  expect(injected).toBe(true);
  expect(fencedCaptures).toBe(2);
  const authorities = inspectStores(fixture);
  expect(authorities[0].state).toBe('ENABLED');
  expect(authorities[0].receipt).not.toBeNull();
  expect(authorities[1]).toEqual({ state: 'DISABLED', receipt: null });
}, 180000);

for (const boundary of ['first-readback', 'incomplete-roster'] as const)
  test(`initial capture growth at ${boundary} is refused before whole-file allocation`, async () => {
    const fixture = await participantActivationFixture(['prod', 'dev']);
    bindFixtureLayouts(fixture);
    process.env['WBS_EDGE_STATE'] = fixture.root;
    const publish = migrationCapture.writeNewMigrationCapture;
    let injected = false;
    let grownPath: string | undefined;
    let forbiddenReads = 0;
    let oversizedAllocations = 0;
    const allocate = Buffer.alloc.bind(Buffer);
    const allocation = spyOn(Buffer, 'alloc').mockImplementation(
      (...args: Parameters<typeof allocate>) => {
        if (injected && args[0] > 4194304) oversizedAllocations++;
        return allocate(...args);
      },
    );
    const whole = managedCohort.readRecord;
    const reread = spyOn(managedCohort, 'readRecord').mockImplementation(async (path) => {
      if (path.endsWith('/prod.capture.json')) forbiddenReads++;
      return whole(path);
    });
    const publication = spyOn(migrationCapture, 'writeNewMigrationCapture').mockImplementation(
      async (...args) => {
        await publish(...args);
        const [path] = args;
        if (
          !injected &&
          (boundary === 'first-readback'
            ? path.endsWith('/prod.capture.json')
            : path.endsWith('-activation-backup.json'))
        ) {
          const evidence = filesystem
            .readdirSync(fixture.root)
            .find((name) => name.startsWith('dependency-activation-'));
          if (evidence === undefined) throw new Error('actual evidence directory absent');
          grownPath = join(fixture.root, evidence, 'prod.capture.json');
          const descriptor = filesystem.openSync(grownPath, 'r+');
          try {
            filesystem.ftruncateSync(descriptor, 4194305);
          } finally {
            filesystem.closeSync(descriptor);
          }
          injected = true;
        }
      },
    );
    let failure: unknown;
    try {
      await withDependencyOwner(
        fixture.request.owner,
        (owner) =>
          prepareInitialDependencyHandoffUnderOwner(
            owner,
            fixture.request,
            fixture.layouts,
            performance.now() + 180000,
            fixture.root,
            fixture.ports,
          ),
        fixture.root,
      );
    } catch (cause) {
      failure = cause;
    } finally {
      publication.mockRestore();
      reread.mockRestore();
      allocation.mockRestore();
    }
    assertSafeFailure(failure);
    expect(injected).toBe(true);
    expect(forbiddenReads).toBe(0);
    expect(oversizedAllocations).toBe(0);
    if (grownPath === undefined) throw new Error('growth path absent');
    expect(filesystem.statSync(grownPath).size).toBe(4194305);
    expect(inspectStores(fixture)).toEqual([
      { state: 'DISABLED', receipt: null },
      { state: 'DISABLED', receipt: null },
    ]);
    expect(
      filesystem
        .readdirSync(fixture.root)
        .some((name) => /-activation-(intent|committed)\.json$/.test(name)),
    ).toBe(false);
  }, 180000);

for (const fault of ['capture-bytes', 'backup-bytes', 'backup-identity'] as const)
  test(`initial actual raw observer refuses ${fault} before any intent or activation`, async () => {
    const fixture = await participantActivationFixture(['prod']);
    bindFixtureLayouts(fixture);
    process.env['WBS_EDGE_STATE'] = fixture.root;
    const observe = initialGraph.captureInitialHandoffArtifacts;
    let reached = false;
    const observation = spyOn(initialGraph, 'captureInitialHandoffArtifacts').mockImplementation(
      (...args) => {
        reached = true;
        const evidence = filesystem
          .readdirSync(fixture.root)
          .find((name) => name.startsWith('dependency-activation-'));
        if (evidence === undefined) throw new Error('actual evidence directory absent');
        const path = join(
          fixture.root,
          evidence,
          fault === 'capture-bytes' ? 'prod.capture.json' : 'prod.before.sqlite',
        );
        if (fault === 'backup-identity') {
          const original = join(fixture.root, 'PRIVATE-original-backup');
          filesystem.renameSync(path, original);
          filesystem.symlinkSync(original, path);
        } else filesystem.appendFileSync(path, 'raw-observer fault');
        return observe(...args);
      },
    );
    let failure: unknown;
    try {
      await withDependencyOwner(
        fixture.request.owner,
        (owner) =>
          prepareInitialDependencyHandoffUnderOwner(
            owner,
            fixture.request,
            fixture.layouts,
            performance.now() + 180000,
            fixture.root,
            fixture.ports,
          ),
        fixture.root,
      );
    } catch (cause) {
      failure = cause;
    } finally {
      observation.mockRestore();
    }
    assertSafeFailure(failure, 'initial-raw-observation');
    expect(reached).toBe(true);
    expect(inspectStores(fixture)).toEqual([
      { state: 'DISABLED', receipt: null },
      { state: 'DISABLED', receipt: null },
    ]);
    expect(
      filesystem
        .readdirSync(fixture.root)
        .some((name) => /-activation-(intent|committed)\.json$/.test(name)),
    ).toBe(false);
  }, 180000);

for (const fault of [
  'capture-bytes',
  'backup-bytes',
  'backup-identity',
  'parent-identity',
  'extra-child',
  'absent',
  'unreadable',
  'expiry',
] as const)
  test(`initial between-dispatch ${fault} preserves the first actual receipt and refuses the second DML`, async () => {
    const fixture = await participantActivationFixture(['prod', 'dev']);
    bindFixtureLayouts(fixture);
    process.env['WBS_EDGE_STATE'] = fixture.root;
    const publish = migrationCapture.writeNewMigrationCapture;
    const now = performance.now.bind(performance);
    let expired = false;
    const clock = spyOn(performance, 'now').mockImplementation(
      () => now() + (expired ? 180001 : 0),
    );
    let injected = false;
    let moved: string | undefined;
    let unreadable: string | undefined;
    const publication = spyOn(migrationCapture, 'writeNewMigrationCapture').mockImplementation(
      async (...args) => {
        await publish(...args);
        if (injected || !args[0].endsWith('-activation-committed.json')) return;
        const authorities = inspectStores(fixture);
        expect(authorities[0].state).toBe('ENABLED');
        expect(authorities[0].receipt).not.toBeNull();
        expect(authorities[1]).toEqual({ state: 'DISABLED', receipt: null });
        const evidence = filesystem
          .readdirSync(fixture.root)
          .find((name) => name.startsWith('dependency-activation-'));
        if (evidence === undefined) throw new Error('actual evidence directory absent');
        const folder = join(fixture.root, evidence);
        const path = join(
          folder,
          fault === 'capture-bytes' ? 'prod.capture.json' : 'prod.before.sqlite',
        );
        if (fault === 'expiry') expired = true;
        else if (fault === 'extra-child')
          filesystem.writeFileSync(join(folder, 'unselected-evidence'), 'extra');
        else if (fault === 'absent') filesystem.unlinkSync(path);
        else if (fault === 'unreadable') {
          filesystem.chmodSync(path, 0);
          unreadable = path;
        } else if (fault === 'backup-identity') {
          const original = join(fixture.root, 'PRIVATE-original-backup');
          filesystem.renameSync(path, original);
          filesystem.copyFileSync(original, path);
        } else if (fault === 'parent-identity') {
          moved = folder;
          filesystem.renameSync(folder, folder + '.original');
          filesystem.mkdirSync(folder, { mode: 0o700 });
          for (const name of filesystem.readdirSync(folder + '.original'))
            filesystem.linkSync(join(folder + '.original', name), join(folder, name));
        } else filesystem.appendFileSync(path, 'between-dispatch fault');
        injected = true;
      },
    );
    let failure: unknown;
    try {
      await withDependencyOwner(
        fixture.request.owner,
        (owner) =>
          prepareInitialDependencyHandoffUnderOwner(
            owner,
            fixture.request,
            fixture.layouts,
            performance.now() + 180000,
            fixture.root,
            fixture.ports,
          ),
        fixture.root,
      );
    } catch (cause) {
      failure = cause;
    } finally {
      publication.mockRestore();
      clock.mockRestore();
      if (unreadable !== undefined) filesystem.chmodSync(unreadable, 0o600);
      if (moved !== undefined) {
        filesystem.rmSync(moved, { recursive: true });
        filesystem.renameSync(moved + '.original', moved);
      }
    }
    assertSafeFailure(failure);
    expect(injected).toBe(true);
    const authorities = inspectStores(fixture);
    expect(authorities[0].state).toBe('ENABLED');
    expect(authorities[0].receipt).not.toBeNull();
    expect(authorities[1]).toEqual({ state: 'DISABLED', receipt: null });
    const commits = filesystem
      .readdirSync(fixture.root)
      .filter((name) => name.endsWith('-activation-committed.json'));
    expect(commits).toHaveLength(1);
    const envelope = JSON.parse(
      filesystem.readFileSync(join(fixture.root, commits[0]), 'utf8'),
    ) as {
      record: ActivationRecordByLabel['committed'];
    };
    expect(envelope.record.environment).toBe('prod');
    expect(authorities[0].receipt).toEqual(envelope.record.receipt);
  }, 180000);

for (const fault of ['capture-multibyte', 'capture-LF', 'envelope-LF', 'publisher-return'] as const)
  test(`initial ${fault} publication admission uses exact UTF-8 bytes including LF`, async () => {
    const fixture = await participantActivationFixture(['prod']);
    bindFixtureLayouts(fixture);
    process.env['WBS_EDGE_STATE'] = fixture.root;
    const capture = migrationSets.captureAppliedMigrationSet;
    const retain = ownership.retainActivationRecord;
    const publish = migrationCapture.writeNewMigrationCapture;
    let capturePublications = 0;
    let envelopePublications = 0;
    let injected = false;
    const captureBoundary = spyOn(migrationSets, 'captureAppliedMigrationSet').mockImplementation(
      (...args) => {
        const captured = capture(...args);
        if (fault === 'publisher-return') return captured;
        const field = fault === 'envelope-LF' ? 'target' : 'attempt';
        const maximum = fault === 'envelope-LF' ? 65536 : 4194304;
        const modified = { ...captured, [field]: '' };
        if (fault === 'capture-multibyte') modified[field] = 'я'.repeat(2097152);
        else if (fault === 'envelope-LF') {
          const record = {
            format: 'dependency-activation-capture',
            version: 1,
            environment: 'prod',
            databaseIdentity: '',
            capture: { name: 'prod.capture.json', sha256: '0'.repeat(64) },
          };
          const pending = filesystem.readFileSync(join(fixture.root, 'edge-owner.pending'), 'utf8');
          const overhead = Buffer.byteLength(JSON.stringify({ owner: pending, record }), 'utf8');
          modified[field] = 'x'.repeat(maximum - overhead);
        } else {
          const overhead = Buffer.byteLength(JSON.stringify(modified), 'utf8');
          modified[field] = 'x'.repeat(maximum - overhead);
          expect(Buffer.byteLength(JSON.stringify(modified), 'utf8')).toBe(maximum);
        }
        injected = true;
        return modified;
      },
    );
    const writes = spyOn(migrationCapture, 'writeNewMigrationCapture').mockImplementation(
      async (...args) => {
        if (args[0].endsWith('/prod.capture.json')) capturePublications++;
        if (args[0].endsWith('-activation-capture.json')) envelopePublications++;
        return publish(...args);
      },
    );
    const returned = spyOn(ownership, 'retainActivationRecord').mockImplementation(
      async (...args) => {
        const publication = await retain(...args);
        if (fault === 'publisher-return' && args[2] === 'capture') {
          injected = true;
          return { ...publication, contents: publication.contents + 'PRIVATE_RETURN_MISMATCH' };
        }
        return publication;
      },
    );
    let failure: unknown;
    try {
      await withDependencyOwner(
        fixture.request.owner,
        (owner) =>
          prepareInitialDependencyHandoffUnderOwner(
            owner,
            fixture.request,
            fixture.layouts,
            performance.now() + 180000,
            fixture.root,
            fixture.ports,
          ),
        fixture.root,
      );
    } catch (cause) {
      failure = cause;
    } finally {
      captureBoundary.mockRestore();
      writes.mockRestore();
      returned.mockRestore();
    }
    assertSafeFailure(failure);
    expect(injected).toBe(true);
    expect(capturePublications).toBe(fault.startsWith('capture-') ? 0 : 1);
    expect(envelopePublications).toBe(fault === 'publisher-return' ? 1 : 0);
    expect(inspectStores(fixture)).toEqual([
      { state: 'DISABLED', receipt: null },
      { state: 'DISABLED', receipt: null },
    ]);
  }, 180000);

for (const fault of [
  'expired-consume',
  'expired-release',
  'failed-consume',
  'foreign-owner',
  'expired-owner',
] as const)
  test(`initial original preparation ${fault} preserves one-shot authority and releases actual raw descriptions`, async () => {
    const fixture = await participantActivationFixture(['prod']);
    const foreign =
      fault === 'foreign-owner' ? await participantActivationFixture(['prod']) : undefined;
    bindFixtureLayouts(fixture);
    process.env['WBS_EDGE_STATE'] = fixture.root;
    const observe = initialGraph.captureInitialHandoffArtifacts;
    const open = filesystem.openSync;
    const close = filesystem.closeSync;
    const rawDescriptions = new Set<number>();
    let observing = false;
    const opened = spyOn(filesystem, 'openSync').mockImplementation(
      (...args: Parameters<typeof open>) => {
        const descriptor = open(...args);
        if (observing) rawDescriptions.add(descriptor);
        return descriptor;
      },
    );
    const closed = spyOn(filesystem, 'closeSync').mockImplementation((descriptor) => {
      close(descriptor);
      if (observing) rawDescriptions.delete(descriptor);
    });
    const raw = spyOn(initialGraph, 'captureInitialHandoffArtifacts').mockImplementation(
      (...args) => {
        observing = true;
        try {
          return observe(...args);
        } finally {
          observing = false;
        }
      },
    );
    const now = performance.now.bind(performance);
    let expired = false;
    const clock = spyOn(performance, 'now').mockImplementation(
      () => now() + (expired ? 180001 : 0),
    );
    let retained:
      | {
          owner: ownership.DependencyOwner;
          prepared: Awaited<ReturnType<typeof prepareInitialDependencyHandoffUnderOwner>>;
        }
      | undefined;
    let released = false;
    try {
      await withDependencyOwner(
        fixture.request.owner,
        async (owner) => {
          const prepared = await prepareInitialDependencyHandoffUnderOwner(
            owner,
            fixture.request,
            fixture.layouts,
            performance.now() + 180000,
            fixture.root,
            fixture.ports,
          );
          retained = { owner, prepared };
          expect(rawDescriptions.size).toBeGreaterThan(0);
          if (fault === 'expired-owner') return;
          if (fault === 'foreign-owner') {
            if (foreign === undefined) throw new Error('foreign actual fixture absent');
            await withDependencyOwner(
              foreign.request.owner,
              (foreignOwner) =>
                rejects(consumePreparedDependencyActivation(foreignOwner, prepared)),
              foreign.root,
            );
            const context = await consumePreparedDependencyActivation(owner, prepared);
            expect(context.owner).toBe(owner);
          } else if (fault === 'expired-consume') {
            expired = true;
            await rejects(consumePreparedDependencyActivation(owner, prepared));
            released = true;
          } else if (fault === 'failed-consume') {
            const folder = filesystem
              .readdirSync(fixture.root)
              .find((name) => name.startsWith('dependency-activation-'));
            if (folder === undefined) throw new Error('actual evidence directory absent');
            filesystem.appendFileSync(
              join(fixture.root, folder, 'prod.capture.json'),
              'consume fault',
            );
            await rejects(consumePreparedDependencyActivation(owner, prepared));
            released = true;
          } else expired = true;
          if (!released) {
            releasePreparedDependencyActivation(owner, prepared);
            released = true;
          }
          for (const descriptor of rawDescriptions)
            expect(() => filesystem.fstatSync(descriptor)).toThrow();
          await rejects(consumePreparedDependencyActivation(owner, prepared));
        },
        fixture.root,
      );
      if (fault === 'expired-owner') {
        if (retained === undefined) throw new Error('actual retained preparation absent');
        await rejects(consumePreparedDependencyActivation(retained.owner, retained.prepared));
        released = true;
        for (const descriptor of rawDescriptions)
          expect(() => filesystem.fstatSync(descriptor)).toThrow();
      }
    } finally {
      clock.mockRestore();
      if (retained !== undefined && !released)
        releasePreparedDependencyActivation(retained.owner, retained.prepared);
      raw.mockRestore();
      opened.mockRestore();
      closed.mockRestore();
    }
    expect(inspectStores(fixture)[0].state).toBe('ENABLED');
    expect(inspectStores(fixture)[1]).toEqual({ state: 'DISABLED', receipt: null });
  }, 180000);

for (const fault of ['missing-evidence', 'wrong-purpose', 'physical-finalizer'] as const)
  test(`initial ${fault} refuses preparation after real storage and closes actual retained evidence`, async () => {
    const fixture = await participantActivationFixture(['prod']);
    bindFixtureLayouts(fixture);
    process.env['WBS_EDGE_STATE'] = fixture.root;
    const activate = storage.activateDependencyStores;
    const exclude = sourceExclusion.withSourceDevExcluded;
    let held: Awaited<ReturnType<typeof activate>> | undefined;
    let afterStorage = false;
    const storageBoundary = spyOn(storage, 'activateDependencyStores').mockImplementation(
      async (...args) => {
        const activated = await activate(...args);
        held = activated;
        if (fault === 'wrong-purpose')
          return {
            ...activated,
            purpose: 'restoration' as const,
            artifacts: undefined,
            records: undefined,
          };
        if (fault === 'missing-evidence') {
          // Inject the private required-field fault after genuine storage; retain and close its actual original resource below.
          return { ...activated, evidence: undefined } as unknown as typeof activated;
        }
        return activated;
      },
    );
    const finalizer = spyOn(sourceExclusion, 'withSourceDevExcluded').mockImplementation(
      async (owner, layouts, sha, docker, deadline, action) =>
        exclude(owner, layouts, sha, docker, deadline, async (token) => {
          const completion = await action(token);
          afterStorage = true;
          return completion;
        }),
    );
    const docker: typeof fixture.ports.docker = (args, signal) => {
      if (fault === 'physical-finalizer' && afterStorage && args[0] === 'inspect')
        throw new Error('PRIVATE_FINALIZER');
      return fixture.ports.docker(args, signal);
    };
    let failure: unknown;
    try {
      await withDependencyOwner(
        fixture.request.owner,
        (owner) =>
          prepareInitialDependencyHandoffUnderOwner(
            owner,
            fixture.request,
            fixture.layouts,
            performance.now() + 180000,
            fixture.root,
            { ...fixture.ports, docker },
          ),
        fixture.root,
      );
    } catch (cause) {
      failure = cause;
    } finally {
      storageBoundary.mockRestore();
      finalizer.mockRestore();
    }
    assertSafeFailure(failure);
    if (held === undefined) throw new Error('genuine storage was not reached');
    if (fault === 'missing-evidence') held.evidence.close();
    await rejects(held.evidence.inspect());
    expect(inspectStores(fixture)[0].state).toBe('ENABLED');
    expect(inspectStores(fixture)[1]).toEqual({ state: 'DISABLED', receipt: null });
  }, 180000);

test('initial incomplete roster rejects first backup growth before reopening SQLite or whole-file allocation', async () => {
  const fixture = await participantActivationFixture(['prod', 'dev']);
  bindFixtureLayouts(fixture);
  process.env['WBS_EDGE_STATE'] = fixture.root;
  const publish = migrationCapture.writeNewMigrationCapture;
  const open = storeConnections.openReadOnlyConnection;
  let injected = false;
  let semanticAfterGrowth = 0;
  const semantic = spyOn(storeConnections, 'openReadOnlyConnection').mockImplementation(
    (...args) => {
      if (injected && args[0].endsWith('/prod.before.sqlite')) semanticAfterGrowth++;
      return open(...args);
    },
  );
  const publication = spyOn(migrationCapture, 'writeNewMigrationCapture').mockImplementation(
    async (...args) => {
      await publish(...args);
      if (!injected && args[0].endsWith('-activation-backup.json')) {
        const folder = filesystem
          .readdirSync(fixture.root)
          .find((name) => name.startsWith('dependency-activation-'));
        if (folder === undefined) throw new Error('actual evidence directory absent');
        const descriptor = filesystem.openSync(
          join(fixture.root, folder, 'prod.before.sqlite'),
          'r+',
        );
        try {
          filesystem.ftruncateSync(descriptor, 1073741825);
        } finally {
          filesystem.closeSync(descriptor);
        }
        injected = true;
      }
    },
  );
  let failure: unknown;
  try {
    await withDependencyOwner(
      fixture.request.owner,
      (owner) =>
        prepareInitialDependencyHandoffUnderOwner(
          owner,
          fixture.request,
          fixture.layouts,
          performance.now() + 180000,
          fixture.root,
          fixture.ports,
        ),
      fixture.root,
    );
  } catch (cause) {
    failure = cause;
  } finally {
    publication.mockRestore();
    semantic.mockRestore();
  }
  assertSafeFailure(failure);
  expect(injected).toBe(true);
  expect(semanticAfterGrowth).toBe(0);
  expect(inspectStores(fixture)).toEqual([
    { state: 'DISABLED', receipt: null },
    { state: 'DISABLED', receipt: null },
  ]);
}, 180000);

test('initial fenced envelope LF is admitted before the actual fenced publication', async () => {
  const fixture = await participantActivationFixture(['prod']);
  bindFixtureLayouts(fixture);
  process.env['WBS_EDGE_STATE'] = fixture.root;
  const activate = storage.activateDependencyStores;
  const retain = ownership.retainActivationRecord;
  let injected = false;
  let fencedPublications = 0;
  const storageBoundary = spyOn(storage, 'activateDependencyStores').mockImplementation(
    async (...args) => {
      const activated = await activate(...args);
      const first = activated.receipts.at(0);
      if (first === undefined) throw new Error('actual committed receipt absent');
      const receipts = [{ ...first, receipt: { ...first.receipt, activationId: '' } }];
      const pending = filesystem.readFileSync(join(fixture.root, 'edge-owner.pending'), 'utf8');
      const record = {
        format: 'dependency-activation-fenced-complete',
        version: 1,
        activated: receipts,
        exposure: 'closed',
        controllers: 'fenced',
      };
      const overhead = Buffer.byteLength(JSON.stringify({ owner: pending, record }), 'utf8');
      receipts[0].receipt.activationId = 'x'.repeat(65536 - overhead);
      expect(Buffer.byteLength(JSON.stringify({ owner: pending, record }), 'utf8')).toBe(65536);
      injected = true;
      return { ...activated, receipts };
    },
  );
  const publication = spyOn(ownership, 'retainActivationRecord').mockImplementation(
    async (...args) => {
      if (args[2] === 'fenced-complete') fencedPublications++;
      return retain(...args);
    },
  );
  let failure: unknown;
  try {
    await withDependencyOwner(
      fixture.request.owner,
      (owner) =>
        prepareInitialDependencyHandoffUnderOwner(
          owner,
          fixture.request,
          fixture.layouts,
          performance.now() + 180000,
          fixture.root,
          fixture.ports,
        ),
      fixture.root,
    );
  } catch (cause) {
    failure = cause;
  } finally {
    storageBoundary.mockRestore();
    publication.mockRestore();
  }
  assertSafeFailure(failure);
  expect(injected).toBe(true);
  expect(fencedPublications).toBe(0);
  expect(inspectStores(fixture)[0].state).toBe('ENABLED');
  expect(inspectStores(fixture)[1]).toEqual({ state: 'DISABLED', receipt: null });
}, 180000);

for (const disposition of ['drop', 'release'] as const)
  for (const expiry of ['live', 'expired'] as const)
    test(`UC2 original ${disposition} ${expiry} closes genuine raw originals at owner return`, async () => {
      const fixture = await participantActivationFixture(['prod']);
      bindFixtureLayouts(fixture);
      process.env['WBS_EDGE_STATE'] = fixture.root;
      const capture = initialGraph.captureInitialHandoffArtifacts;
      const open = filesystem.openSync;
      const close = filesystem.closeSync;
      const now = performance.now.bind(performance);
      const originals: { descriptor: number; attempts: number; closed: boolean }[] = [];
      const active = new Map<number, (typeof originals)[number]>();
      let acquiring = false;
      let expired = false;
      let captures = 0;
      let releaseEntered = false;
      const hasReleaseEntered = () => releaseEntered;
      let primaryFailure: { cause: unknown } | undefined;
      const cleanupFailures: unknown[] = [];
      let retained:
        | {
            owner: ownership.DependencyOwner;
            prepared: Awaited<ReturnType<typeof prepareInitialDependencyHandoffUnderOwner>>;
          }
        | undefined;
      const opened = spyOn(filesystem, 'openSync').mockImplementation(
        (...args: Parameters<typeof open>) => {
          const descriptor = open(...args);
          if (acquiring) {
            const original = { descriptor, attempts: 0, closed: false };
            originals.push(original);
            active.set(descriptor, original);
          }
          return descriptor;
        },
      );
      const closed = spyOn(filesystem, 'closeSync').mockImplementation((descriptor) => {
        const original = active.get(descriptor);
        if (original !== undefined) original.attempts++;
        close(descriptor);
        if (original !== undefined) {
          original.closed = true;
          active.delete(descriptor);
        }
      });
      const graph = spyOn(initialGraph, 'captureInitialHandoffArtifacts').mockImplementation(
        (...args) => {
          acquiring = true;
          captures++;
          try {
            return capture(...args);
          } finally {
            acquiring = false;
          }
        },
      );
      const clock = spyOn(performance, 'now').mockImplementation(
        () => now() + (expired ? 180001 : 0),
      );
      try {
        await withDependencyOwner(
          fixture.request.owner,
          async (owner) => {
            const prepared = await prepareInitialDependencyHandoffUnderOwner(
              owner,
              fixture.request,
              fixture.layouts,
              performance.now() + 180000,
              fixture.root,
              fixture.ports,
            );
            // Fixture-only fallback retains identity; the action returns no preparation to its owner.
            retained = { owner, prepared };
            expect(captures).toBe(1);
            expect(active.size).toBeGreaterThan(0);
            if (disposition === 'release')
              await consumePreparedDependencyActivation(owner, prepared);
            expired = expiry === 'expired';
            if (disposition === 'release') {
              releaseEntered = true;
              releasePreparedDependencyActivation(owner, prepared);
            }
          },
          fixture.root,
        );
        // This assertion precedes fixture fallback: callback return must settle enrolled originals.
        expect(originals.length).toBeGreaterThan(0);
        expect(originals.every((original) => original.closed && original.attempts === 1)).toBe(
          true,
        );
        expect(inspectStores(fixture)[0].state).toBe('ENABLED');
        expect(inspectStores(fixture)[1]).toEqual({ state: 'DISABLED', receipt: null });
      } catch (cause) {
        primaryFailure = { cause };
      }
      try {
        clock.mockRestore();
      } catch (cause) {
        cleanupFailures.push(cause);
      }
      try {
        // Only the drop route can first-enter release for fixture fallback.
        if (disposition === 'drop' && retained !== undefined && active.size > 0) {
          if (
            hasReleaseEntered() ||
            [...active.values()].some((original) => original.attempts !== 0)
          )
            throw new Error('uncontained fixture close outcome; no fallback release is eligible');
          releaseEntered = true;
          releasePreparedDependencyActivation(retained.owner, retained.prepared);
        }
      } catch (cause) {
        cleanupFailures.push(cause);
      }
      try {
        expect(active.size).toBe(0);
        expect(originals.every((original) => original.closed && original.attempts === 1)).toBe(
          true,
        );
      } catch (cause) {
        cleanupFailures.push(cause);
      }
      for (const restore of [
        () => {
          graph.mockRestore();
        },
        () => {
          opened.mockRestore();
        },
        () => {
          closed.mockRestore();
        },
      ]) {
        try {
          restore();
        } catch (cause) {
          cleanupFailures.push(cause);
        }
      }
      // Restoring test spies is not native UNKNOWN containment or production HOLD settlement.
      if (primaryFailure !== undefined) {
        if (cleanupFailures.length > 0)
          throw new AggregateError(
            [primaryFailure.cause, ...cleanupFailures],
            'UC2 primary failure with fixture cleanup failure',
          );
        throw primaryFailure.cause;
      }
      if (cleanupFailures.length > 0)
        throw new AggregateError(cleanupFailures, 'UC2 fixture cleanup failure');
    }, 180000);

interface PrehelperReportModel {
  setupCause: unknown;
  writer: unknown;
  descriptor: number;
  buffer: Buffer;
  offset: number;
  length: number;
  position: unknown;
  state: string;
  returned: unknown;
  cause: unknown;
  reportingFailure: unknown;
  failures: readonly unknown[];
}
interface PrehelperRefusalModel {
  cause: unknown;
  setupFailure: Error;
  holdFailure: Error;
  stopped: boolean;
  spawnEntered: boolean;
  childCount: number;
  terminal: boolean;
  timer: unknown;
  keeper: unknown;
  clears: { kind: string; token: unknown }[];
  operations: {
    original: unknown;
    returned: unknown;
    cause: unknown;
    promise: unknown;
    observer: unknown;
    state: string;
    joined: boolean;
    observerSettled: boolean;
  }[];
  savedOperationEvidence: {
    promise: unknown;
    observer: unknown;
    returned: unknown;
    cause: unknown;
    outcome: PromiseSettledResult<unknown>;
    observerOutcome: PromiseSettledResult<unknown>;
  }[];
  replacementReturned: unknown;
  mismatchFailure: Error;
  writeAPI: unknown;
  buildAPI: unknown;
  returnedWrite: unknown;
  returnedBuild: unknown;
  originalObservers: unknown[];
  retainedCauses: unknown[];
  cleanup: PromiseSettledResult<unknown>[];
  nonPromiseValue: unknown;
  replacementObserver: unknown;
  observerFailure: Error;
  pendingAtEntry: { observer: unknown; observerSettled: boolean } | undefined;
  clockRecord: { state: string; tick: unknown } | undefined;
  clockRecords: unknown[];
  reportCalls: {
    writer: unknown;
    descriptor: unknown;
    buffer: unknown;
    offset: unknown;
    length: unknown;
    position: unknown;
    reportAtEntry: unknown;
    stateAtEntry: unknown;
  }[];
  reportRecord: PrehelperReportModel | undefined;
  reportWriter: unknown;
  reportDescriptor: number;
  reportReturned: unknown;
  reportThrown: unknown;
  reportPendingAtEntry: boolean;
  reportProjection: unknown;
  hostileTouches: number;
  privateSentinel: string;
  syntheticOperationCount: number;
  syntheticFailureCount: number;
}

/** Compile only the selected private source boundaries into finite lexical model ports. */
async function observePrehelperRefusal(
  mode:
    | 'terminal'
    | 'pending'
    | 'missing-observer'
    | 'spawn-entered'
    | 'empty-roster'
    | 'fulfilled-only'
    | 'synchronous-refusal'
    | 'non-promise'
    | 'missing-original'
    | 'changed-returned'
    | 'cause-mismatch'
    | 'pending-observer'
    | 'rejected-observer'
    | 'entered-clock'
    | 'diagnostic-complete'
    | 'diagnostic-short'
    | 'diagnostic-throw'
    | 'diagnostic-unsupported'
    | 'diagnostic-undefined'
    | 'diagnostic-negative'
    | 'diagnostic-fractional'
    | 'diagnostic-promise'
    | 'diagnostic-unknown-setup'
    | 'diagnostic-projection',
): Promise<PrehelperRefusalModel> {
  const source = await readFile(
    new URL('../fixtures/dependency-owner-custody.ts', import.meta.url),
    'utf8',
  );
  function between(start: string, end: string): string {
    if (source.split(start).length !== 2 || source.split(end).length !== 2)
      throw new Error('UC2 finite source declaration boundary differs');
    const begin = source.indexOf(start);
    const finish = source.indexOf(end, begin + start.length);
    if (finish <= begin) throw new Error('UC2 finite source declaration order differs');
    return source.slice(begin, finish);
  }
  const state = between('interface ParentPipe {', '\nfunction stop(');
  const admission = between('function assertParentStart(): void {', 'const PARENT_CAPS:');
  const operation = between('const PARENT_CAPS:', 'function joinPrehelperRefusal()');
  const refusal = between(
    'function joinPrehelperRefusal()',
    'async function joinOuterOperations()',
  );
  const catchStart =
    '  } catch (cause) {\n    if (parent.stopped || parent.originals.some((original) => !original.known))';
  if (source.split(catchStart).length !== 2)
    throw new Error('UC2 finite source catch boundary differs');
  const catchFinally = source.slice(source.indexOf(catchStart)).trimEnd();
  if (!catchFinally.endsWith('\n}')) throw new Error('UC2 finite source tail differs');
  const image = [
    state,
    admission,
    operation,
    refusal,
    `
const mode = ${JSON.stringify(mode)};
let setupFailure = new Error('UC2_MODELED_SETUP_REFUSAL');
const holdFailure = new Error('UC2_MODELED_HOLD_SENTINEL');
const timerToken = {kind:'parent-timeout-token'};
const keeperToken = {kind:'parent-interval-token'};
const clears = [];
const savedObservers = [];
const savedOperationEvidence = [];
let replacementReturned,replacementReturnedObserver;
const mismatchFailure=new Error('UC2_MODELED_DIFFERENT_REJECTION');
let returnedWrite, returnedBuild, resolveBuild;
const nonPromiseValue={kind:'retained-non-Promise-return'};
const observerFailure=new Error('UC2_MODELED_OBSERVER_REFUSAL');
let replacementObserver,replacementObservation,resolveObserver,pendingAtEntry,clockRecord;
let readiness,markReady,rejectReadiness,readySignaled=false;
if(mode==='pending-observer'||mode==='diagnostic-promise')readiness=new Promise((resolve,reject)=>{
  markReady=()=>{readySignaled=true;resolve();};rejectReadiness=reject;
});
const privateSentinel='UC2_PRIVATE_DIAGNOSTIC_SENTINEL';
let hostileTouches=0;
function hostileFailure(){
  const failure=new Error('private');
  for(const name of ['message','name','stack','cause','errors'])
    Object.defineProperty(failure,name,{configurable:true,get(){hostileTouches++;return privateSentinel;}});
  Object.defineProperty(failure,'toJSON',{value(){hostileTouches++;return privateSentinel;}});
  return failure;
}
if(mode==='diagnostic-complete'||mode==='diagnostic-projection')setupFailure=hostileFailure();
const reportThrown=hostileFailure();
const reportCalls=[];
let reportReturned,reportReturnedObserver,resolveReportReturn,reportPendingAtEntry=false,reportProjection;
let syntheticOperationCount=0,syntheticFailureCount=0;
const prehelperStderr=2;
const prehelperWriteSync=modeledDiagnosticWriteSync;
function modeledDiagnosticWriteSync(descriptor,buffer,offset,length,position){
  reportCalls.push({writer:prehelperWriteSync,descriptor,buffer,offset,length,position,
    reportAtEntry:parent.report,stateAtEntry:parent.report?.state});
  if(mode==='diagnostic-throw')throw reportThrown;
  if(mode==='diagnostic-promise'){
    reportReturned=new Promise(resolve=>{resolveReportReturn=resolve;});
    reportReturnedObserver=reportReturned.then(()=>undefined,()=>undefined);
    reportPendingAtEntry=true;markReady();return reportReturned;
  }
  reportReturned=mode==='diagnostic-short'?length-1:
    mode==='diagnostic-unsupported'?length+1:
    mode==='diagnostic-undefined'?undefined:
    mode==='diagnostic-negative'?-1:
    mode==='diagnostic-fractional'?0.5:length;
  return reportReturned;
}
function readKernelTick(){ return 1n; }
function clearTimeout(token){ clears.push({kind:'timeout',token}); }
function clearInterval(token){ clears.push({kind:'interval',token}); }
function modeledWrite(){ returnedWrite=Promise.resolve('written'); return returnedWrite; }
function modeledBuild(){
  if(mode==='synchronous-refusal')throw setupFailure;
  if(mode==='non-promise'){returnedBuild=nonPromiseValue;return returnedBuild;}
  returnedBuild=mode==='pending'
    ?new Promise(resolve=>{resolveBuild=resolve;})
    :Promise.reject(setupFailure);
  return returnedBuild;
}
async function stop(cause){
  parent.failures.push(cause); parent.stopped=true;
  throw holdFailure;
}
async function runParentBoundary(){
  const timer=timerToken, keeper=keeperToken;
  parent.timer=timer;parent.keeper=keeper;
  parent.allocationStart=0n;parent.allocationEnd=18000n;
  if(mode==='diagnostic-short'||mode==='diagnostic-throw')parent.failures.push(new Error('earlier retained failure'));
  try {
    if(['empty-roster','fulfilled-only','synchronous-refusal','non-promise',
      'pending-observer','rejected-observer','entered-clock',
      'missing-original','changed-returned','cause-mismatch'].includes(mode)){
      if(mode==='empty-roster'){parent.stopped=true;throw setupFailure;}
      await outerOperation('outer.fs.writeFile',modeledWrite,undefined,[]);
      if(parent.operations[0].observer===undefined)throw Error('modeled write observer missing');
      savedObservers.push(parent.operations[0].observer);
      if(mode==='fulfilled-only'){parent.stopped=true;throw setupFailure;}
      let pending;
      try{pending=outerOperation('outer.Bun.build',modeledBuild,undefined,[]);}
      catch(failure){setupFailure=failure;throw failure;}
      const record=parent.operations[1];
      if(record.observer===undefined)throw Error('modeled build observer missing');
      savedObservers.push(record.observer);
      const settled=await Promise.allSettled([pending]);
      if(settled[0].status!=='rejected'||settled[0].reason!==setupFailure)
        throw Error('modeled build original rejection differs');
      if(['missing-original','changed-returned','cause-mismatch'].includes(mode)){
        for(const original of parent.operations){
          if(!(original.promise instanceof Promise)||!(original.observer instanceof Promise))
            throw Error('modeled original evidence absent before perturbation');
          const outcomes=await Promise.allSettled([original.promise,original.observer]);
          savedOperationEvidence.push({promise:original.promise,observer:original.observer,
            returned:original.returned,cause:original.cause,outcome:outcomes[0],observerOutcome:outcomes[1]});
        }
        if(mode==='missing-original')record.promise=undefined;
        if(mode==='changed-returned'){
          replacementReturned=Promise.resolve('written');
          replacementReturnedObserver=replacementReturned.then(()=>undefined,()=>undefined);
          parent.operations[0].returned=replacementReturned;
        }
        if(mode==='cause-mismatch')record.cause=mismatchFailure;
      }
      if(mode==='pending-observer'||mode==='rejected-observer'){
        replacementObserver=mode==='pending-observer'
          ?new Promise(resolve=>{resolveObserver=resolve;})
          :Promise.reject(observerFailure);
        replacementObservation=replacementObserver.then(()=>undefined,()=>undefined);
        record.observer=replacementObserver;
        record.observerSettled=mode==='rejected-observer';
        if(mode==='rejected-observer')await replacementObservation;
      }
      if(mode==='entered-clock'){
        clockRecord={state:'entered',returned:undefined,cause:undefined,tick:undefined};
        parent.clockOperations.push(clockRecord);
      }
      if(mode==='pending-observer'){
        pendingAtEntry={observer:record.observer,observerSettled:record.observerSettled};
        markReady();
      }
      throw setupFailure;
    }
    await outerOperation('outer.fs.writeFile',modeledWrite,undefined,[]);
    parent.spawnEntered=mode==='spawn-entered';
    const pending=outerOperation('outer.Bun.build',modeledBuild,undefined,[]);
    for(const captured of parent.operations){
      if(captured.observer===undefined)throw Error('modeled captured observer missing');
      savedObservers.push(captured.observer);
    }
    if(mode==='missing-observer'||mode==='diagnostic-unknown-setup')parent.operations[1].observer=undefined;
    if(mode==='pending'){parent.stopped=true;throw setupFailure;}
    await pending;
`,
    catchFinally,
    `
export async function observe(){
  let cause,controllerFailure,controllerFailed=false;
  const controllerPromises=[];
  const expectedRejections=new Map();
  if(mode==='diagnostic-projection'){
    syntheticOperationCount=129;syntheticFailureCount=9;
    parent.stopped=true;
    parent.operations=Array.from({length:129},(_,index)=>({
      label:index===0?privateSentinel:'outer.Bun.build',
      state:index===0?privateSentinel:'rejected',original:modeledBuild,receiver:undefined,args:[privateSentinel],
      returned:undefined,value:undefined,cause:setupFailure,promise:undefined,observer:undefined,
      observerSettled:false,joined:false,
    }));
    parent.failures=Array.from({length:8},()=>hostileFailure());
    reportProjection=projectPrehelperRefusal(setupFailure);
  }else if(mode==='pending-observer'||mode==='diagnostic-promise'){
    const invocation=runParentBoundary();
    const invocationObserver=invocation.then(
      ()=>{if(!readySignaled)rejectReadiness(Error('model invocation missed readiness'));},
      failure=>{cause=failure;if(!readySignaled)rejectReadiness(failure);},
    );
    const controller=(async()=>{
      try{await readiness;}
      finally{
        if(typeof resolveObserver==='function'){
          resolveObserver();parent.operations[1].observerSettled=true;
        }
        if(typeof resolveReportReturn==='function')resolveReportReturn('fixture-settled');
      }
    })();
    try{await controller;}catch(failure){controllerFailed=true;controllerFailure=failure;}
    // Controller finally settles the dependency BEFORE this invocation join.
    await invocationObserver;
    controllerPromises.push(invocation,invocationObserver,readiness,controller);
    if(cause!==undefined)expectedRejections.set(invocation,cause);
    if(controllerFailed){
      expectedRejections.set(controller,controllerFailure);
      if(!readySignaled)expectedRejections.set(readiness,controllerFailure);
    }
  }else{
    try{await runParentBoundary();}catch(failure){cause=failure;}
  }
  const captured={cause,setupFailure,holdFailure,stopped:parent.stopped,
    spawnEntered:parent.spawnEntered,childCount:parent.originals.length,
    terminal:parent.prehelperRefusalTerminal,timer:timerToken,keeper:keeperToken,
    clears:[...clears],operations:parent.operations.map(record=>({...record})),
    writeAPI:modeledWrite,buildAPI:modeledBuild,returnedWrite,returnedBuild,
    savedOperationEvidence:[...savedOperationEvidence],replacementReturned,mismatchFailure,
    originalObservers:[...savedObservers],retainedCauses:[...parent.failures],
    nonPromiseValue,replacementObserver,observerFailure,pendingAtEntry,clockRecord,
    clockRecords:[...parent.clockOperations],reportCalls:[...reportCalls],reportRecord:parent.report,
    reportWriter:prehelperWriteSync,reportDescriptor:prehelperStderr,reportReturned,reportThrown,
    reportPendingAtEntry,reportProjection,hostileTouches,privateSentinel,
    syntheticOperationCount,syntheticFailureCount};
  if(mode==='diagnostic-projection')return {...captured,cleanup:[]};
  if(mode==='pending'){
    if(typeof resolveBuild!=='function')throw Error('modeled pending resolver missing');
    resolveBuild('fixture-settled');
  }
  const originals=[];
  if(['missing-original','changed-returned','cause-mismatch'].includes(mode)){
    for(const saved of savedOperationEvidence){
      originals.push(saved.promise);
      if(saved.outcome.status==='rejected')expectedRejections.set(saved.promise,saved.outcome.reason);
    }
  }else{
  for(const record of parent.operations){
    if(record.promise instanceof Promise){
      originals.push(record.promise);
      if(record.state==='rejected')expectedRejections.set(record.promise,record.cause);
    }else if(!['synchronous-refusal','non-promise'].includes(mode)){
      throw Error('modeled original Promise absent');
    }
  }
  }
  const expectedOriginals=mode==='empty-roster'?0:
    ['fulfilled-only','synchronous-refusal','non-promise'].includes(mode)?1:2;
  if(originals.length!==expectedOriginals||savedObservers.length!==expectedOriginals)
    throw Error('modeled original/observer cleanup census differs');
  const extra=[];
  if(replacementReturned!==undefined)extra.push(replacementReturned,replacementReturnedObserver);
  if(reportReturned instanceof Promise)extra.push(reportReturned,reportReturnedObserver);
  if(replacementObserver!==undefined){
    extra.push(replacementObserver,replacementObservation);
    if(mode==='rejected-observer')expectedRejections.set(replacementObserver,observerFailure);
  }
  const cleanupPromises=[...originals,...savedObservers,...extra,...controllerPromises];
  const cleanup=await Promise.allSettled(cleanupPromises);
  for(let index=0;index<cleanup.length;index++){
    const outcome=cleanup[index],original=cleanupPromises[index];
    if(expectedRejections.has(original)){
      if(outcome.status!=='rejected'||outcome.reason!==expectedRejections.get(original))
        throw Error('modeled original rejection identity differs');
    }else if(outcome.status!=='fulfilled')throw Error('modeled fixture observer unsettled');
  }
  if(controllerFailed)throw controllerFailure;
  return {...captured,cleanup};
}
`,
  ].join('\n');
  const emitted = new Bun.Transpiler({ loader: 'ts', target: 'bun' }).transformSync(image);
  const namespace: unknown = await import(
    'data:text/javascript;base64,' + Buffer.from(emitted).toString('base64')
  );
  if (
    typeof namespace !== 'object' ||
    namespace === null ||
    !('observe' in namespace) ||
    typeof namespace.observe !== 'function'
  )
    throw new Error('UC2 finite source image consumer absent');
  // This test-only boundary imports solely the checked private cuts and lexical model ports above.
  const model = namespace as { observe(): Promise<PrehelperRefusalModel> };
  return await model.observe();
}

function assertPrehelperOriginals(observed: PrehelperRefusalModel): void {
  expect(observed.operations).toHaveLength(2);
  expect(observed.operations[0]?.original).toBe(observed.writeAPI);
  expect(observed.operations[1]?.original).toBe(observed.buildAPI);
  expect(observed.operations[0]?.promise).toBe(observed.returnedWrite);
  expect(observed.operations[1]?.promise).toBe(observed.returnedBuild);
  expect(observed.cleanup).toHaveLength(4);
}

test('UC2 pre-helper known build refusal retires only parent timers', async () => {
  const observed = await observePrehelperRefusal('terminal');
  assertPrehelperOriginals(observed);
  expect(observed.operations).toHaveLength(2);
  expect(observed.operations[0]?.original).toBe(observed.writeAPI);
  expect(observed.operations[1]?.original).toBe(observed.buildAPI);
  expect(observed.operations[0]?.promise).toBe(observed.returnedWrite);
  expect(observed.operations[1]?.promise).toBe(observed.returnedBuild);
  expect(observed.operations[0]?.observer).toBe(observed.originalObservers[0]);
  expect(observed.operations[1]?.observer).toBe(observed.originalObservers[1]);
  expect(observed.operations.every((operation) => operation.observerSettled)).toBe(true);
  expect(observed.cause, 'UC2_PARENT_KNOWN_REFUSAL_REMAINED_HELD').toBe(observed.setupFailure);
  expect(observed.stopped).toBe(true);
  expect(observed.spawnEntered).toBe(false);
  expect(observed.childCount).toBe(0);
  expect(observed.terminal).toBe(true);
  expect(observed.clears).toHaveLength(2);
  expect(observed.clears[0]?.kind).toBe('timeout');
  expect(observed.clears[0]?.token).toBe(observed.timer);
  expect(observed.clears[1]?.kind).toBe('interval');
  expect(observed.clears[1]?.token).toBe(observed.keeper);
  expect(observed.operations).toHaveLength(2);
  expect(observed.operations[0]?.original).toBe(observed.writeAPI);
  expect(observed.operations[1]?.original).toBe(observed.buildAPI);
  expect(observed.operations[0]?.promise).toBe(observed.returnedWrite);
  expect(observed.operations[1]?.promise).toBe(observed.returnedBuild);
  expect(observed.operations.every((operation) => operation.joined)).toBe(true);
  expect(observed.operations.every((operation) => operation.observerSettled)).toBe(true);
});

test('UC2 pre-helper pending original retains parent timers', async () => {
  const observed = await observePrehelperRefusal('pending');
  assertPrehelperOriginals(observed);
  expect(observed.cause).toBe(observed.holdFailure);
  expect(observed.retainedCauses).toHaveLength(1);
  expect(observed.retainedCauses[0]).toBe(observed.setupFailure);
  expect(observed.stopped).toBe(true);
  expect(observed.spawnEntered).toBe(false);
  expect(observed.childCount).toBe(0);
  expect(observed.terminal).toBe(false);
  expect(observed.clears).toEqual([]);
  expect(observed.operations[1]?.state).toBe('pending');
  expect(observed.operations[1]?.promise).toBe(observed.returnedBuild);
  expect(observed.cleanup.every((outcome) => outcome.status === 'fulfilled')).toBe(true);
});

test('UC2 pre-helper absent observer retains parent timers', async () => {
  const observed = await observePrehelperRefusal('missing-observer');
  assertPrehelperOriginals(observed);
  expect(observed.cause).toBe(observed.holdFailure);
  expect(observed.retainedCauses).toHaveLength(1);
  expect(observed.retainedCauses[0]).toBe(observed.setupFailure);
  expect(observed.stopped).toBe(true);
  expect(observed.terminal).toBe(false);
  expect(observed.clears).toEqual([]);
  expect(observed.operations[1]?.observer).toBeUndefined();
  expect(observed.operations[1]?.original).toBe(observed.buildAPI);
  expect(observed.operations[1]?.promise).toBe(observed.returnedBuild);
  expect(observed.cleanup).toHaveLength(4);
});

test('UC2 pre-helper spawn entry without child retains parent timers', async () => {
  const observed = await observePrehelperRefusal('spawn-entered');
  assertPrehelperOriginals(observed);
  expect(observed.cause).toBe(observed.holdFailure);
  expect(observed.retainedCauses).toHaveLength(1);
  expect(observed.retainedCauses[0]).toBe(observed.setupFailure);
  expect(observed.stopped).toBe(true);
  expect(observed.spawnEntered).toBe(true);
  expect(observed.childCount).toBe(0);
  expect(observed.terminal).toBe(false);
  expect(observed.clears).toEqual([]);
  expect(observed.operations).toHaveLength(2);
  expect(observed.operations[1]?.original).toBe(observed.buildAPI);
  expect(observed.operations[1]?.promise).toBe(observed.returnedBuild);
  expect(observed.cleanup).toHaveLength(4);
});

function assertPrehelperHold(observed: PrehelperRefusalModel, oracle: string): void {
  expect(observed.cause, oracle).toBe(observed.holdFailure);
  expect(observed.retainedCauses).toHaveLength(1);
  expect(observed.retainedCauses[0]).toBe(observed.setupFailure);
  expect(observed.stopped).toBe(true);
  expect(observed.terminal).toBe(false);
  expect(observed.clears).toEqual([]);
  expect(observed.childCount).toBe(0);
  expect(observed.spawnEntered).toBe(false);
}

test('UC2 pre-helper empty operation roster retains parent timers', async () => {
  const observed = await observePrehelperRefusal('empty-roster');
  expect(observed.operations).toEqual([]);
  expect(observed.cleanup).toEqual([]);
  assertPrehelperHold(observed, 'UC2_PARENT_EMPTY_ROSTER_RETIRED');
});

test('UC2 pre-helper fulfilled-only roster retains parent timers', async () => {
  const observed = await observePrehelperRefusal('fulfilled-only');
  expect(observed.operations).toHaveLength(1);
  expect(observed.operations[0]?.original).toBe(observed.writeAPI);
  expect(observed.operations[0]?.promise).toBe(observed.returnedWrite);
  expect(observed.operations[0]?.observer).toBe(observed.originalObservers[0]);
  expect(observed.operations[0]?.state).toBe('fulfilled');
  expect(observed.cleanup.every((outcome) => outcome.status === 'fulfilled')).toBe(true);
  assertPrehelperHold(observed, 'UC2_PARENT_FULFILLED_ONLY_RETIRED');
});

test('UC2 pre-helper synchronous delegate refusal retains parent timers', async () => {
  const observed = await observePrehelperRefusal('synchronous-refusal');
  expect(observed.operations).toHaveLength(2);
  expect(observed.operations[1]?.original).toBe(observed.buildAPI);
  expect(observed.operations[1]?.state).toBe('threw');
  expect(observed.operations[1]?.cause).toBe(observed.setupFailure);
  expect(observed.operations[1]?.returned).toBeUndefined();
  expect(observed.operations[1]?.promise).toBeUndefined();
  expect(observed.operations[1]?.observer).toBeUndefined();
  expect(observed.cleanup).toHaveLength(2);
  assertPrehelperHold(observed, 'UC2_PARENT_SYNC_REFUSAL_RETIRED');
});

test('UC2 pre-helper non-Promise delegate return retains parent timers', async () => {
  const observed = await observePrehelperRefusal('non-promise');
  expect(observed.operations).toHaveLength(2);
  expect(observed.operations[1]?.original).toBe(observed.buildAPI);
  expect(observed.operations[1]?.state).toBe('threw');
  expect(observed.operations[1]?.returned).toBe(observed.nonPromiseValue);
  expect(observed.returnedBuild).toBe(observed.nonPromiseValue);
  expect(observed.operations[1]?.cause).toBe(observed.setupFailure);
  expect(observed.setupFailure.message).toBe('UC2 fixed outer API did not return its Promise');
  expect(observed.operations[1]?.promise).toBeUndefined();
  expect(observed.operations[1]?.observer).toBeUndefined();
  expect(observed.cleanup).toHaveLength(2);
  assertPrehelperHold(observed, 'UC2_PARENT_NON_PROMISE_RETIRED');
});

test('UC2 pre-helper pending observer retains parent timers', async () => {
  const observed = await observePrehelperRefusal('pending-observer');
  expect(observed.operations).toHaveLength(2);
  expect(observed.operations[1]?.original).toBe(observed.buildAPI);
  expect(observed.operations[1]?.promise).toBe(observed.returnedBuild);
  expect(observed.operations[1]?.observer).toBe(observed.replacementObserver);
  expect(observed.originalObservers[1]).not.toBe(observed.replacementObserver);
  expect(observed.pendingAtEntry?.observer).toBe(observed.replacementObserver);
  expect(observed.pendingAtEntry?.observerSettled).toBe(false);
  assertPrehelperHold(observed, 'UC2_PARENT_PENDING_OBSERVER_RETIRED');
});

test('UC2 pre-helper rejected observer retains parent timers', async () => {
  const observed = await observePrehelperRefusal('rejected-observer');
  expect(observed.operations).toHaveLength(2);
  expect(observed.operations[1]?.original).toBe(observed.buildAPI);
  expect(observed.operations[1]?.promise).toBe(observed.returnedBuild);
  expect(observed.operations[1]?.observer).toBe(observed.replacementObserver);
  expect(observed.originalObservers[1]).not.toBe(observed.replacementObserver);
  expect(observed.operations[1]?.observerSettled).toBe(true);
  expect(
    observed.cleanup.some(
      (outcome) => outcome.status === 'rejected' && outcome.reason === observed.observerFailure,
    ),
  ).toBe(true);
  assertPrehelperHold(observed, 'UC2_PARENT_REJECTED_OBSERVER_RETIRED');
});

test('UC2 pre-helper entered clock boundary retains parent timers', async () => {
  const observed = await observePrehelperRefusal('entered-clock');
  expect(observed.operations).toHaveLength(2);
  expect(observed.operations[1]?.original).toBe(observed.buildAPI);
  expect(observed.operations[1]?.promise).toBe(observed.returnedBuild);
  expect(observed.clockRecords).toHaveLength(1);
  expect(observed.clockRecords[0]).toBe(observed.clockRecord);
  expect(observed.clockRecord?.state).toBe('entered');
  expect(observed.clockRecord?.tick).toBeUndefined();
  assertPrehelperHold(observed, 'UC2_PARENT_ENTERED_CLOCK_RETIRED');
});

test('UC2 pre-helper missing original Promise retains timers', async () => {
  const observed = await observePrehelperRefusal('missing-original');
  expect(observed.savedOperationEvidence).toHaveLength(2);
  expect(observed.savedOperationEvidence[1]?.promise).toBe(observed.returnedBuild);
  expect(observed.savedOperationEvidence[1]?.observer).toBe(observed.originalObservers[1]);
  expect(observed.savedOperationEvidence[1]?.outcome).toEqual({
    status: 'rejected',
    reason: observed.setupFailure,
  });
  expect(observed.savedOperationEvidence[1]?.observerOutcome).toEqual({
    status: 'fulfilled',
    value: undefined,
  });
  expect(observed.operations[1]?.promise).toBeUndefined();
  expect(observed.operations[1]?.returned).toBe(observed.returnedBuild);
  expect(observed.cleanup).toHaveLength(4);
  assertPrehelperHold(observed, 'UC2_PREFLIGHT_MISSING_ORIGINAL_RETIRED');
});

test('UC2 pre-helper changed returned original retains timers', async () => {
  const observed = await observePrehelperRefusal('changed-returned');
  expect(observed.savedOperationEvidence).toHaveLength(2);
  expect(observed.savedOperationEvidence[0]?.promise).toBe(observed.returnedWrite);
  expect(observed.savedOperationEvidence[0]?.returned).toBe(observed.returnedWrite);
  expect(observed.savedOperationEvidence[0]?.observer).toBe(observed.originalObservers[0]);
  expect(observed.savedOperationEvidence[0]?.outcome).toEqual({
    status: 'fulfilled',
    value: 'written',
  });
  expect(observed.operations[0]?.returned).toBe(observed.replacementReturned);
  expect(observed.replacementReturned).not.toBe(observed.returnedWrite);
  expect(await observed.replacementReturned).toBe('written');
  expect(observed.operations[0]?.promise).toBe(observed.returnedWrite);
  expect(observed.operations[0]?.observer).toBe(observed.originalObservers[0]);
  expect(observed.cleanup).toHaveLength(6);
  assertPrehelperHold(observed, 'UC2_PREFLIGHT_CHANGED_RETURNED_RETIRED');
});

test('UC2 pre-helper rejected cause mismatch retains timers', async () => {
  const observed = await observePrehelperRefusal('cause-mismatch');
  expect(observed.savedOperationEvidence).toHaveLength(2);
  expect(observed.savedOperationEvidence[1]?.promise).toBe(observed.returnedBuild);
  expect(observed.savedOperationEvidence[1]?.observer).toBe(observed.originalObservers[1]);
  expect(observed.savedOperationEvidence[1]?.cause).toBe(observed.setupFailure);
  expect(observed.savedOperationEvidence[1]?.outcome).toEqual({
    status: 'rejected',
    reason: observed.setupFailure,
  });
  expect(observed.operations[1]?.cause).toBe(observed.mismatchFailure);
  expect(observed.mismatchFailure).not.toBe(observed.setupFailure);
  expect(observed.operations[1]?.promise).toBe(observed.returnedBuild);
  expect(observed.cleanup).toHaveLength(4);
  assertPrehelperHold(observed, 'UC2_PREFLIGHT_REJECTED_CAUSE_MISMATCH_RETIRED');
});

function prehelperProjectionRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('UC2 projected plain record absent');
  // This test boundary validates parsed JSON shape before inspecting fixed projection fields.
  return value as Record<string, unknown>;
}

function readPrehelperDiagnostic(value: unknown): Record<string, unknown> {
  expect(Buffer.isBuffer(value)).toBe(true);
  if (!Buffer.isBuffer(value)) throw new Error('UC2 projected diagnostic Buffer absent');
  expect(value.byteLength).toBeLessThanOrEqual(32768);
  const text = value.toString('utf8');
  const prefix = 'UC2_PREFLIGHT_FAILURE:';
  expect(text.startsWith(prefix)).toBe(true);
  expect(text.endsWith('\n')).toBe(true);
  const projected: unknown = JSON.parse(text.slice(prefix.length, -1));
  const record = prehelperProjectionRecord(projected);
  expect(record['schema']).toBe('uc2-prehelper-failure');
  expect(record['version']).toBe(1);
  expect(record['sourceEpoch']).toBe('uc2-prehelper-report-v1');
  expect(record['phase']).toBe('pre-helper');
  expect(record['disposition']).toBe('terminal-setup-refusal');
  return record;
}

function prehelperReportRecord(observed: PrehelperRefusalModel): PrehelperReportModel {
  expect(observed.reportRecord).toBeDefined();
  if (observed.reportRecord === undefined) throw new Error('UC2 original report record absent');
  return observed.reportRecord;
}

function assertPrehelperReportRetirement(observed: PrehelperRefusalModel): void {
  expect(observed.stopped).toBe(true);
  expect(observed.terminal).toBe(true);
  expect(observed.childCount).toBe(0);
  expect(observed.spawnEntered).toBe(false);
  expect(observed.clears).toHaveLength(2);
  expect(observed.clears[0]?.kind).toBe('timeout');
  expect(observed.clears[0]?.token).toBe(observed.timer);
  expect(observed.clears[1]?.kind).toBe('interval');
  expect(observed.clears[1]?.token).toBe(observed.keeper);
}

test('UC2 pre-helper complete diagnostic preserves setup identity', async () => {
  const observed = await observePrehelperRefusal('diagnostic-complete');
  expect(observed.reportCalls.length, 'UC2_PREFLIGHT_REQUIRED_SINGLE_DIAGNOSTIC_CALL').toBe(1);
  const record = prehelperReportRecord(observed);
  expect(record.setupCause).toBe(observed.setupFailure);
  expect(record.writer).toBe(observed.reportWriter);
  expect(record.descriptor).toBe(2);
  expect(record.descriptor).toBe(observed.reportDescriptor);
  expect(observed.reportCalls[0]?.writer).toBe(record.writer);
  expect(observed.reportCalls[0]?.descriptor).toBe(record.descriptor);
  expect(observed.reportCalls[0]?.buffer).toBe(record.buffer);
  expect(observed.reportCalls[0]?.offset).toBe(0);
  expect(observed.reportCalls[0]?.length).toBe(record.buffer.byteLength);
  expect(observed.reportCalls[0]?.position).toBeNull();
  expect(observed.reportCalls[0]?.reportAtEntry).toBe(record);
  expect(observed.reportCalls[0]?.stateAtEntry).toBe('entered');
  expect(record.offset).toBe(0);
  expect(record.length).toBe(record.buffer.byteLength);
  expect(record.position).toBeNull();
  expect(record.state).toBe('returned');
  expect(record.returned).toBe(record.buffer.byteLength);
  const projected = readPrehelperDiagnostic(record.buffer);
  expect(projected['spawnEntered']).toBe(false);
  expect(projected['children']).toBe(0);
  expect(record.buffer.toString('utf8')).not.toContain(observed.privateSentinel);
  expect(observed.hostileTouches).toBe(0);
  expect(observed.cause).toBe(observed.setupFailure);
  assertPrehelperReportRetirement(observed);
});

test('UC2 pre-helper short diagnostic retains both failures', async () => {
  const observed = await observePrehelperRefusal('diagnostic-short');
  expect(observed.reportCalls).toHaveLength(1);
  const record = prehelperReportRecord(observed);
  expect(record.state).toBe('returned');
  expect(record.returned).toBe(record.buffer.byteLength - 1);
  expect(record.reportingFailure).toBeInstanceOf(Error);
  expect(record.failures).toHaveLength(2);
  expect(record.failures[0]).toBe(observed.setupFailure);
  expect(record.failures[1]).toBe(record.reportingFailure);
  expect(observed.cause).toBeInstanceOf(Error);
  if (!(observed.cause instanceof Error)) throw new Error('UC2 safe infrastructure failure absent');
  expect(observed.cause.message).toBe('UC2 setup and diagnostic publication failed');
  expect('cause' in observed.cause).toBe(false);
  expect('errors' in observed.cause).toBe(false);
  assertPrehelperReportRetirement(observed);
});

test('UC2 pre-helper thrown diagnostic retains both failures', async () => {
  const observed = await observePrehelperRefusal('diagnostic-throw');
  expect(observed.reportCalls).toHaveLength(1);
  const record = prehelperReportRecord(observed);
  expect(record.state).toBe('threw');
  expect(record.returned).toBeUndefined();
  expect(record.cause).toBe(observed.reportThrown);
  expect(record.reportingFailure).toBe(observed.reportThrown);
  expect(record.failures).toHaveLength(2);
  expect(record.failures[0]).toBe(observed.setupFailure);
  expect(record.failures[1]).toBe(observed.reportThrown);
  expect(observed.cause).toBeInstanceOf(Error);
  if (!(observed.cause instanceof Error)) throw new Error('UC2 safe infrastructure failure absent');
  expect(observed.cause.message).toBe('UC2 setup and diagnostic publication failed');
  expect('cause' in observed.cause).toBe(false);
  expect('errors' in observed.cause).toBe(false);
  expect(observed.hostileTouches).toBe(0);
  assertPrehelperReportRetirement(observed);
});

test('UC2 pre-helper unsupported diagnostic count retains timers', async () => {
  const observed = await observePrehelperRefusal('diagnostic-unsupported');
  expect(observed.reportCalls).toHaveLength(1);
  const record = prehelperReportRecord(observed);
  expect(record.state).toBe('returned');
  expect(record.returned).toBe(record.buffer.byteLength + 1);
  assertPrehelperHold(observed, 'UC2_PREFLIGHT_UNSUPPORTED_REPORT_RETIRED');
});

test('UC2 pre-helper undefined diagnostic return retains timers', async () => {
  const observed = await observePrehelperRefusal('diagnostic-undefined');
  expect(observed.reportCalls).toHaveLength(1);
  const record = prehelperReportRecord(observed);
  expect(record.setupCause).toBe(observed.setupFailure);
  expect(record.writer).toBe(observed.reportWriter);
  expect(observed.reportCalls[0]?.writer).toBe(record.writer);
  expect(observed.reportCalls[0]?.reportAtEntry).toBe(record);
  expect(observed.reportCalls[0]?.stateAtEntry).toBe('entered');
  expect(record.state).toBe('returned');
  expect(record.returned).toBe(observed.reportReturned);
  expect(record.returned).toBe(undefined);
  assertPrehelperOriginals(observed);
  expect(observed.operations[0]?.observer).toBe(observed.originalObservers[0]);
  expect(observed.operations[1]?.observer).toBe(observed.originalObservers[1]);
  assertPrehelperHold(observed, 'UC2_PREFLIGHT_UNDEFINED_REPORT_RETIRED');
});

test('UC2 pre-helper negative diagnostic return retains timers', async () => {
  const observed = await observePrehelperRefusal('diagnostic-negative');
  expect(observed.reportCalls).toHaveLength(1);
  const record = prehelperReportRecord(observed);
  expect(record.setupCause).toBe(observed.setupFailure);
  expect(record.writer).toBe(observed.reportWriter);
  expect(observed.reportCalls[0]?.writer).toBe(record.writer);
  expect(observed.reportCalls[0]?.reportAtEntry).toBe(record);
  expect(observed.reportCalls[0]?.stateAtEntry).toBe('entered');
  expect(record.state).toBe('returned');
  expect(record.returned).toBe(observed.reportReturned);
  expect(record.returned).toBe(-1);
  assertPrehelperOriginals(observed);
  expect(observed.operations[0]?.observer).toBe(observed.originalObservers[0]);
  expect(observed.operations[1]?.observer).toBe(observed.originalObservers[1]);
  assertPrehelperHold(observed, 'UC2_PREFLIGHT_NEGATIVE_REPORT_RETIRED');
});

test('UC2 pre-helper fractional diagnostic return retains timers', async () => {
  const observed = await observePrehelperRefusal('diagnostic-fractional');
  expect(observed.reportCalls).toHaveLength(1);
  const record = prehelperReportRecord(observed);
  expect(record.setupCause).toBe(observed.setupFailure);
  expect(record.writer).toBe(observed.reportWriter);
  expect(observed.reportCalls[0]?.writer).toBe(record.writer);
  expect(observed.reportCalls[0]?.reportAtEntry).toBe(record);
  expect(observed.reportCalls[0]?.stateAtEntry).toBe('entered');
  expect(record.state).toBe('returned');
  expect(record.returned).toBe(observed.reportReturned);
  expect(record.returned).toBe(0.5);
  assertPrehelperOriginals(observed);
  expect(observed.operations[0]?.observer).toBe(observed.originalObservers[0]);
  expect(observed.operations[1]?.observer).toBe(observed.originalObservers[1]);
  assertPrehelperHold(observed, 'UC2_PREFLIGHT_FRACTIONAL_REPORT_RETIRED');
});

test('UC2 pre-helper Promise diagnostic return retains timers', async () => {
  const observed = await observePrehelperRefusal('diagnostic-promise');
  expect(observed.reportCalls).toHaveLength(1);
  const record = prehelperReportRecord(observed);
  expect(record.state).toBe('returned');
  expect(record.returned).toBe(observed.reportReturned);
  expect(record.returned).toBeInstanceOf(Promise);
  expect(observed.reportPendingAtEntry).toBe(true);
  assertPrehelperHold(observed, 'UC2_PREFLIGHT_PROMISE_REPORT_RETIRED');
});

test('UC2 pre-helper unknown setup never gains release from reporting', async () => {
  const observed = await observePrehelperRefusal('diagnostic-unknown-setup');
  expect(observed.operations[1]?.observer).toBeUndefined();
  expect(observed.operations[1]?.promise).toBe(observed.returnedBuild);
  expect(observed.reportCalls).toEqual([]);
  expect(observed.reportRecord).toBeUndefined();
  assertPrehelperHold(observed, 'UC2_PREFLIGHT_UNKNOWN_SETUP_REPORTED');
});

test('UC2 pre-helper diagnostic projection is bounded', async () => {
  const observed = await observePrehelperRefusal('diagnostic-projection');
  const projected = readPrehelperDiagnostic(observed.reportProjection);
  expect(observed.syntheticOperationCount).toBe(129);
  expect(observed.syntheticFailureCount).toBe(9);
  expect(observed.operations).toHaveLength(129);
  expect(observed.retainedCauses).toHaveLength(8);
  expect(projected['operationCount']).toBe(129);
  expect(projected['failureCount']).toBe(9);
  expect(projected['operationsTruncated']).toBe(true);
  expect(projected['failuresTruncated']).toBe(true);
  const operations: unknown = projected['operations'];
  const failures: unknown = projected['failures'];
  if (!Array.isArray(operations) || !Array.isArray(failures))
    throw new Error('UC2 projected summaries absent');
  expect(operations).toHaveLength(128);
  expect(failures).toHaveLength(8);
  expect(prehelperProjectionRecord(operations[0])['label']).toBe('unsupported');
  expect(prehelperProjectionRecord(operations[0])['state']).toBe('unsupported');
  const operationSummaries: readonly unknown[] = operations;
  const failureSummaries: readonly unknown[] = failures;
  for (const summary of [...operationSummaries, ...failureSummaries]) {
    const serialized = JSON.stringify(summary);
    if (typeof serialized !== 'string')
      throw new Error('UC2 projected summary serialization absent');
    expect(Buffer.byteLength(serialized, 'utf8')).toBeLessThanOrEqual(512);
  }
  for (const summary of failureSummaries) {
    const failure = prehelperProjectionRecord(summary);
    const role = failure['role'];
    if (typeof role !== 'string') throw new Error('UC2 projected failure role absent');
    expect(['setup', 'reporting']).toContain(role);
    expect(failure['category']).toBe('object');
  }
  if (!Buffer.isBuffer(observed.reportProjection)) throw new Error('UC2 projected bytes absent');
  expect(observed.reportProjection.toString('utf8')).not.toContain(observed.privateSentinel);
  expect(observed.hostileTouches).toBe(0);
  expect(observed.reportCalls).toEqual([]);
});

interface ActualPrehelperBuild {
  cause: unknown;
  root: string;
  marker: string;
  entry: string;
  priorBytes: Buffer;
  invalidBytes: Buffer;
  buildPromise: unknown;
  buildObserver: unknown;
  operations: {
    label: string;
    original: unknown;
    receiver: unknown;
    args: readonly unknown[];
    returned: unknown;
    promise: unknown;
    observer: unknown;
    state: string;
    cause: unknown;
    joined: boolean;
    observerSettled: boolean;
  }[];
  clocks: { state: string; tick: unknown }[];
  stopped: boolean;
  terminal: boolean;
  spawnEntered: boolean;
  childCount: number;
  timer: unknown;
  keeper: unknown;
  parentTimer: unknown;
  parentKeeper: unknown;
  report:
    | {
        setupCause: unknown;
        writer: unknown;
        descriptor: number;
        buffer: Buffer;
        offset: number;
        length: number;
        position: null;
        state: string;
        returned: unknown;
      }
    | undefined;
  mkdtempAPI: unknown;
  writeAPI: unknown;
  buildAPI: unknown;
  reportAPI: unknown;
  descriptor: number;
  buildConfig: unknown;
}
let actualPrehelperBuild: Promise<ActualPrehelperBuild> | undefined;

/** Retains one actual private-boundary preparation, including rejection or HOLD; never retries. */
function prepareActualPrehelperBuild(): Promise<ActualPrehelperBuild> {
  actualPrehelperBuild ??= observeActualPrehelperBuild();
  return actualPrehelperBuild;
}

/** Extracts current private custody cuts; acquires no subject constructor, plugin or child. */
async function observeActualPrehelperBuild(): Promise<ActualPrehelperBuild> {
  const source = await readFile(
    new URL('../fixtures/dependency-owner-custody.ts', import.meta.url),
    'utf8',
  );
  function between(start: string, end: string): string {
    if (source.split(start).length !== 2 || source.split(end).length !== 2)
      throw new Error('UC2 actual build source boundary differs');
    const begin = source.indexOf(start);
    const finish = source.indexOf(end, begin + start.length);
    if (finish <= begin) throw new Error('UC2 actual build source order differs');
    return source.slice(begin, finish);
  }
  const catchStart =
    '  } catch (cause) {\n    if (parent.stopped || parent.originals.some((original) => !original.known))';
  if (source.split(catchStart).length !== 2)
    throw new Error('UC2 actual build catch boundary differs');
  const catchFinally = source.slice(source.indexOf(catchStart)).trimEnd();
  if (!catchFinally.endsWith('\n}')) throw new Error('UC2 actual build tail differs');
  const image = [
    `import {readFileSync,writeSync} from 'node:fs';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
interface CustodyObservation {pass:boolean;oracle:string;}
const process={platform:globalThis.process.platform,stderr:globalThis.process.stderr,env:{} as Record<string,string>};`,
    between('interface ParentPipe {', '\nfunction stop('),
    between('function stop(', 'function replaceOnce('),
    between('const prehelperWriteSync = writeSync;', 'const PARENT_CAPS:'),
    between('const PARENT_CAPS:', 'function joinPrehelperRefusal()'),
    between('function joinPrehelperRefusal()', 'async function joinOuterOperations()'),
    `export async function observe(){
let root,marker,entry,buildPromise,buildObserver,buildConfig,cause,retainedTimer,retainedKeeper;
const priorBytes=Buffer.from('UC2 prior write retained\\n');
const invalidBytes=Buffer.from('export const broken = ;\\n');
async function execute(){`,
    between(
      '  const allocation = readAllocation();',
      '  try {\n    for (const row of dependencyOwnerCustodyCases.filter',
    ),
    `retainedTimer=timer;retainedKeeper=keeper;
try {
root=await outerOperation('outer.fs.mkdtemp',mkdtemp,undefined,[join(tmpdir(),'uc2-invalid-build-')]);
if(typeof root!=='string')throw new Error('UC2 actual build directory return differs');
marker=join(root,'prior-write.txt');entry=join(root,'invalid-entry.ts');
await outerOperation('outer.fs.writeFile',writeFile,undefined,[marker,priorBytes]);
await outerOperation('outer.fs.writeFile',writeFile,undefined,[entry,invalidBytes]);
buildConfig={entrypoints:[entry],target:'bun'};
buildPromise=outerOperation('outer.Bun.build',Bun.build,Bun,[buildConfig]);
const record=parent.operations.at(-1);
if(record===undefined||record.promise!==buildPromise)throw new Error('UC2 actual build original absent');
buildObserver=record.observer;
await buildPromise;
return await stop(new Error('UC2 actual invalid build did not reject'));`,
    catchFinally,
    `const uptime=readFileSync('/proc/uptime');
const fields=/^([0-9]{1,20})\\.([0-9]{2}) ([0-9]{1,20})\\.([0-9]{2})\\n$/.exec(uptime.toString('latin1'));
if(uptime.length>128||fields===null)throw new Error('UC2 ordinary allocation kernel sample malformed');
const start=BigInt(fields[1])*100n+BigInt(fields[2]);
// Proof: omitting only this fixture START refused admission before all original operations and clocks.
process.env['PUNI_UC2_ALLOCATION_START_CS']=String(start);
process.env['PUNI_UC2_ALLOCATION_END_CS']=String(start+18000n);
process.env['PUNI_UC2_ALLOCATION_LOWER_CS']=String(start);
try{await execute();}catch(failure){cause=failure;}
return {cause,root,marker,entry,priorBytes,invalidBytes,buildPromise,buildObserver,
operations:parent.operations,clocks:parent.clockOperations,stopped:parent.stopped,
terminal:parent.prehelperRefusalTerminal,spawnEntered:parent.spawnEntered,
childCount:parent.originals.length,timer:retainedTimer,keeper:retainedKeeper,
parentTimer:parent.timer,parentKeeper:parent.keeper,report:parent.report,
mkdtempAPI:mkdtemp,writeAPI:writeFile,buildAPI:Bun.build,reportAPI:writeSync,
descriptor:process.stderr.fd,buildConfig};
}`,
  ].join('\n');
  const emitted = new Bun.Transpiler({ loader: 'ts', target: 'bun' }).transformSync(image);
  const namespace: unknown = await import(
    'data:text/javascript;base64,' + Buffer.from(emitted).toString('base64')
  );
  if (
    typeof namespace !== 'object' ||
    namespace === null ||
    !('observe' in namespace) ||
    typeof namespace.observe !== 'function'
  )
    throw new Error('UC2 actual build extracted consumer absent');
  // Test-only module boundary contains solely checked private cuts and real lexical APIs.
  const provider = namespace as { observe(): Promise<ActualPrehelperBuild> };
  return await provider.observe();
}

const actualPrehelperExpectedDiagnostic = Buffer.from(
  'UC2_PREFLIGHT_FAILURE:{"schema":"uc2-prehelper-failure","version":1,"sourceEpoch":"uc2-prehelper-report-v1","phase":"pre-helper","disposition":"terminal-setup-refusal","spawnEntered":false,"children":0,"operationCount":4,"operationsTruncated":false,"operations":[{"index":0,"label":"outer.fs.mkdtemp","state":"fulfilled","original":true,"promise":true,"observer":true,"joined":true,"observerSettled":true},{"index":1,"label":"outer.fs.writeFile","state":"fulfilled","original":true,"promise":true,"observer":true,"joined":true,"observerSettled":true},{"index":2,"label":"outer.fs.writeFile","state":"fulfilled","original":true,"promise":true,"observer":true,"joined":true,"observerSettled":true},{"index":3,"label":"outer.Bun.build","state":"rejected","original":true,"promise":true,"observer":true,"joined":true,"observerSettled":true}],"failureCount":1,"failuresTruncated":false,"failures":[{"role":"setup","category":"object"}],"clockCount":5,"clocksTruncated":false,"clocks":[{"state":"returned","validated":true},{"state":"returned","validated":true},{"state":"returned","validated":true},{"state":"returned","validated":true},{"state":"returned","validated":true}]}\n',
  'utf8',
);

test('UC2 actual invalid build retires pre-helper parent after original rejection and complete diagnostic', async () => {
  const preparation = prepareActualPrehelperBuild();
  const observed = await preparation;
  expect(prepareActualPrehelperBuild()).toBe(preparation);
  expect(observed.operations.map((operation) => operation.label)).toEqual([
    'outer.fs.mkdtemp',
    'outer.fs.writeFile',
    'outer.fs.writeFile',
    'outer.Bun.build',
  ]);
  expect(observed.operations.map((operation) => operation.state)).toEqual([
    'fulfilled',
    'fulfilled',
    'fulfilled',
    'rejected',
  ]);
  const directory = observed.operations.at(0);
  const prior = observed.operations.at(1);
  const invalid = observed.operations.at(2);
  const build = observed.operations.at(3);
  if (
    directory === undefined ||
    prior === undefined ||
    invalid === undefined ||
    build === undefined
  )
    throw new Error('UC2 actual build required originals absent');
  expect(directory.original).toBe(observed.mkdtempAPI);
  expect(directory.receiver).toBeUndefined();
  expect(directory.args).toHaveLength(1);
  expect(prior.original).toBe(observed.writeAPI);
  expect(prior.receiver).toBeUndefined();
  expect(prior.args).toEqual([observed.marker, observed.priorBytes]);
  expect(prior.args[1]).toBe(observed.priorBytes);
  expect(invalid.original).toBe(observed.writeAPI);
  expect(invalid.receiver).toBeUndefined();
  expect(invalid.args).toEqual([observed.entry, observed.invalidBytes]);
  expect(invalid.args[1]).toBe(observed.invalidBytes);
  expect(build.original).toBe(observed.buildAPI);
  expect(build.receiver).toBe(Bun);
  expect(build.args).toEqual([observed.buildConfig]);
  expect(build.args[0]).toBe(observed.buildConfig);
  expect(build.promise).toBe(observed.buildPromise);
  expect(build.observer).toBe(observed.buildObserver);
  expect(observed.cause).toBe(build.cause);
  expect(await Promise.allSettled([observed.buildPromise])).toEqual([
    { status: 'rejected', reason: observed.cause },
  ]);
  for (const operation of observed.operations) {
    expect(operation.promise).toBeInstanceOf(Promise);
    expect(operation.returned).toBe(operation.promise);
    expect(operation.observer).toBeInstanceOf(Promise);
    expect(operation.observerSettled).toBe(true);
    expect(operation.joined).toBe(true);
    expect(await Promise.allSettled([operation.observer])).toEqual([
      { status: 'fulfilled', value: undefined },
    ]);
  }
  expect(observed.stopped).toBe(true);
  expect(observed.terminal).toBe(true);
  expect(observed.spawnEntered).toBe(false);
  expect(observed.childCount).toBe(0);
  expect(observed.clocks).toHaveLength(5);
  expect(observed.cause).not.toBeNull();
  expect(typeof observed.cause).toBe('object');
  for (const clock of observed.clocks) {
    expect(clock.state).toBe('returned');
    expect(typeof clock.tick).toBe('bigint');
  }
  expect(observed.timer).toBeDefined();
  expect(observed.keeper).toBeDefined();
  expect(observed.parentTimer).toBe(observed.timer);
  expect(observed.parentKeeper).toBe(observed.keeper);
  const report = observed.report;
  if (report === undefined) throw new Error('UC2 actual build diagnostic record absent');
  expect(report.setupCause).toBe(observed.cause);
  expect(report.writer).toBe(observed.reportAPI);
  expect(report.descriptor).toBe(observed.descriptor);
  expect(report.descriptor).toBe(2);
  expect(report.state).toBe('returned');
  expect(report.offset).toBe(0);
  expect(report.length).toBe(report.buffer.byteLength);
  expect(report.position).toBeNull();
  expect(report.returned).toBe(report.buffer.byteLength);
  expect(report.buffer.toString('utf8').startsWith('UC2_PREFLIGHT_FAILURE:')).toBe(true);
  expect(report.buffer.at(-1)).toBe(10);
  expect(report.buffer.equals(actualPrehelperExpectedDiagnostic)).toBe(true);
}, 10000);

interface ParentStopModel {
  returnedPromise: boolean;
  stopped: boolean;
  retainedCause: boolean;
  keeper: boolean;
  intervalCalls: number;
  emissions: readonly string[];
  snapshot: unknown;
  hostileTouches: number;
}

/** Evaluates only actual parent declarations and STOP, with inert diagnostic/timer ports. */
function observeParentStop(): ParentStopModel {
  const source = filesystem.readFileSync(
    new URL('../fixtures/dependency-owner-custody.ts', import.meta.url),
    'utf8',
  );
  const start = 'interface ParentPipe {';
  const end = '\nfunction replaceOnce(';
  if (source.split(start).length !== 2 || source.split(end).length !== 2)
    throw new Error('UC2 parent STOP source boundary differs');
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin + start.length);
  if (finish <= begin) throw new Error('UC2 parent STOP source boundary order differs');
  const declarations = source.slice(begin, finish);
  const capsStart = 'const PARENT_CAPS:';
  const capsEnd = '\nfunction outerOperation<';
  if (source.split(capsStart).length !== 2 || source.split(capsEnd).length !== 2)
    throw new Error('UC2 parent STOP cap declaration boundary differs');
  const caps = source.slice(source.indexOf(capsStart), source.indexOf(capsEnd));
  const image = [
    '"use strict";',
    'const prehelperWriteSync = writeSync;',
    'const prehelperStderr = process.stderr.fd;',
    caps,
    declarations,
    `
function observe() {
  const pending = new Promise(() => undefined);
  parent.allocationStart = 10000n;
  parent.allocationEnd = 28000n;
  parent.lastTick = 10025n;
  parent.spawnEntered = true;
  parent.operations.push({
    label:'outer.Bun.build',state:'pending',returned:pending,value:undefined,
    original:undefined,receiver:undefined,args:[],cause:undefined,
    promise:pending,observer:pending,observerSettled:false,joined:false,
  });
  parent.clockOperations.push({state:'returned',returned:'100.25 1.00\\n',cause:undefined,tick:10025n});
  parent.originals.push({
    child:undefined,exit:pending,known:false,
    stdout:{stream:undefined,reader:undefined,closedPromise:pending,closedObserver:pending,
      closedState:'pending',closedCause:undefined,pump:pending,eof:false},
    stderr:undefined,
  });
  const returned = stop(cause, 'helper-outcome-catch');
  return {
    returnedPromise:returned instanceof Promise,stopped:parent.stopped,
    retainedCause:parent.failures[0]===cause,keeper:parent.keeper===timerToken,
  };
};`,
  ].join('\n');
  const emitted = new Bun.Transpiler({ loader: 'ts', target: 'bun' }).transformSync(image);
  const emissions: string[] = [];
  let intervalCalls = 0;
  let hostileTouches = 0;
  const timerToken = Object.freeze({ inert: 'UC2-parent-stop-interval' });
  const cause = new Proxy(Object.create(null) as object, {
    get() {
      hostileTouches++;
      throw new Error('UC2 private cause property touched');
    },
    ownKeys() {
      hostileTouches++;
      throw new Error('UC2 private cause keys touched');
    },
  });
  const processPort = {
    stderr: {
      fd: 2,
      write(text: string) {
        emissions.push(text);
        return true;
      },
    },
  };
  const intervalPort = () => {
    intervalCalls++;
    return timerToken;
  };
  const writerPort = (
    descriptor: number,
    buffer: Buffer,
    offset: number,
    length: number,
    position: number | null,
  ) => {
    if (descriptor !== 2 || offset !== 0 || length !== buffer.length || position !== null)
      throw new Error('UC2 parent STOP writer call differs');
    emissions.push(buffer.toString('utf8'));
    return length;
  };
  // This test-only Function receives only the exact transpiled private cut and inert lexical ports.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- This test evaluates only the bounded private source cut with inert ports.
  const evaluate = new Function(
    'process',
    'setInterval',
    'writeSync',
    'Buffer',
    'cause',
    'timerToken',
    emitted + '\nreturn observe;',
  ) as (
    process: typeof processPort,
    interval: typeof intervalPort,
    writer: typeof writerPort,
    buffer: typeof Buffer,
    failure: object,
    token: typeof timerToken,
  ) => () => Omit<ParentStopModel, 'intervalCalls' | 'emissions' | 'snapshot' | 'hostileTouches'>;
  const observe = evaluate(processPort, intervalPort, writerPort, Buffer, cause, timerToken);
  const observed = observe();
  const text = emissions.at(0);
  const opening = text?.indexOf('{') ?? -1;
  // Legacy STOP has no JSON body: leave the missing diagnostic as an assertion value, not a parse error.
  const snapshot: unknown =
    text !== undefined && opening >= 0 ? JSON.parse(text.slice(opening)) : undefined;
  return { ...observed, intervalCalls, emissions, snapshot, hostileTouches };
}

test('UC2 parent STOP publishes first-site retained parent context', () => {
  const observed = observeParentStop();
  expect(observed.returnedPromise).toBe(true);
  expect(observed.stopped).toBe(true);
  expect(observed.retainedCause).toBe(true);
  expect(observed.keeper).toBe(true);
  expect(observed.intervalCalls).toBe(1);
  expect(observed.emissions).toHaveLength(1);
  expect(observed.emissions[0]).toStartWith(
    'UC2 parent STOP: original helper or reader outcomes incomplete',
  );
  expect(observed.hostileTouches).toBe(0);
  expect(observed.snapshot).toMatchObject({
    schema: 'uc2-parent-stop',
    version: 1,
    site: 'helper-outcome-catch',
    causeCategory: 'object',
    spawnEntered: true,
    allocation: { startPresent: true, endPresent: true, lastTickPresent: true },
    operationCount: 1,
    operationsTruncated: false,
    operations: [
      {
        index: 0,
        label: 'outer.Bun.build',
        state: 'pending',
        originalPresent: false,
        promisePresent: true,
        observerPresent: true,
        observerSettled: false,
        joined: false,
      },
    ],
    clockOperationCount: 1,
    clockOperationsTruncated: false,
    clockOperations: [{ state: 'returned', validated: true }],
    childCount: 1,
    childrenTruncated: false,
    children: [
      {
        index: 0,
        known: false,
        exitPresent: true,
        stdout: {
          present: true,
          readerPresent: false,
          pumpPresent: true,
          closedPromisePresent: true,
          closedObserverPresent: true,
          closedState: 'pending',
          eof: false,
        },
        stderr: { present: false },
      },
    ],
  });
});

function observeStopWrite(mode: 'full' | 'short' | 'throw' | 'unsupported' | 'prepare-throw') {
  const source = filesystem.readFileSync(
    new URL('../fixtures/dependency-owner-custody.ts', import.meta.url),
    'utf8',
  );
  const parentStart = source.indexOf('interface ParentPipe {');
  const parentEnd = source.indexOf('\nfunction replaceOnce(', parentStart);
  const capsStart = source.indexOf('const PARENT_CAPS:');
  const capsEnd = source.indexOf('\nfunction outerOperation<', capsStart);
  if (parentStart < 0 || parentEnd < 0 || capsStart < 0 || capsEnd < 0)
    throw new Error('UC2 parent STOP source cut unavailable');
  const image = [
    '"use strict";',
    'const prehelperWriteSync = writeSync;',
    'const prehelperStderr = process.stderr.fd;',
    source.slice(capsStart, capsEnd),
    source.slice(parentStart, parentEnd),
    `
function observe(first, second) {
  const originalKeeper = Object.freeze({inert:'keeper'});
  parent.keeper = originalKeeper;
  const originalTimer = Object.freeze({inert:'deadline'});
  parent.timer = originalTimer;
  for (let index=0; index<129; index++) {
    parent.operations.push({label:'outer.Bun.build',state:'pending',original:undefined,
      promise:undefined,observer:undefined,observerSettled:false,joined:false});
    parent.clockOperations.push({state:'returned',tick:123n});
  }
  for (let index=0; index<2; index++)
    parent.originals.push({child:undefined,exit:undefined,known:false,
      stdout:undefined,stderr:undefined});
  const firstPromise = stop(first, 'helper-outcome-catch');
  const firstReport = parent.stopReport;
  parent.operations[0].state = 'fulfilled';
  parent.originals[0].known = true;
  const secondPromise = stop(second, 'parent-catch');
  return {parent, firstPromise, secondPromise, firstReport, originalKeeper, originalTimer};
}`,
  ].join('\n');
  const emitted = new Bun.Transpiler({ loader: 'ts', target: 'bun' }).transformSync(image);
  const calls: {
    descriptor: number;
    buffer: Buffer;
    offset: number;
    length: number;
    position: null;
  }[] = [];
  const writeFailure = new Error('inert diagnostic refusal');
  const unsupportedReturn = Promise.resolve(7);
  const writer = (
    descriptor: number,
    buffer: Buffer,
    offset: number,
    length: number,
    position: null,
  ) => {
    calls.push({ descriptor, buffer, offset, length, position });
    if (mode === 'throw') throw writeFailure;
    if (mode === 'short') return length - 1;
    if (mode === 'unsupported') return unsupportedReturn;
    return length;
  };
  let intervalCalls = 0;
  const interval = () => {
    intervalCalls++;
    throw new Error('unexpected interval');
  };
  let hostileTouches = 0;
  const first = new Proxy(Object.create(null) as object, {
    get() {
      hostileTouches++;
      throw new Error('cause getter touched');
    },
    ownKeys() {
      hostileTouches++;
      throw new Error('cause keys touched');
    },
  });
  const second = new Error('later cause');
  const processPort = {
    stderr: {
      fd: 2,
      write() {
        throw new Error('legacy stderr port used');
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- This test evaluates only the bounded private source cut with inert ports.
  const evaluate = new Function(
    'process',
    'setInterval',
    'writeSync',
    'Buffer',
    emitted + '\nreturn observe;',
  ) as (
    processInput: typeof processPort,
    intervalPort: typeof interval,
    writerPort: typeof writer,
    buffer: typeof Buffer,
  ) => (
    first: object,
    second: Error,
  ) => {
    parent: {
      failures: unknown[];
      stopped: boolean;
      keeper: unknown;
      timer: unknown;
      stopReport: unknown;
      stopContext: { site: string; cause: unknown };
      prehelperRefusalTerminal: boolean;
      report: unknown;
    };
    firstPromise: Promise<never>;
    secondPromise: Promise<never>;
    firstReport: unknown;
    originalKeeper: unknown;
    originalTimer: unknown;
  };
  const bufferPort =
    mode === 'prepare-throw'
      ? ({
          from() {
            throw writeFailure;
          },
        } as unknown as typeof Buffer)
      : Buffer;
  const observe = evaluate(processPort, interval, writer, bufferPort);
  return {
    ...observe(first, second),
    first,
    second,
    calls,
    intervalCalls,
    hostileTouches,
    writer,
    writeFailure,
    unsupportedReturn,
  };
}

test('UC2 parent STOP write outcomes retain one first record and permanent HOLD', () => {
  for (const mode of ['full', 'short', 'throw', 'unsupported', 'prepare-throw'] as const) {
    const observed = observeStopWrite(mode);
    const report = observed.firstReport as {
      cause: unknown;
      site: string;
      snapshot: { site: string };
      writer: unknown;
      descriptor: number;
      buffer: Buffer;
      offset: number;
      length: number;
      position: null;
      state: string;
      returned: unknown;
      writeCause: unknown;
    };
    expect(observed.firstPromise).toBeInstanceOf(Promise);
    expect(observed.secondPromise).toBeInstanceOf(Promise);
    expect(observed.parent.stopped).toBe(true);
    expect(observed.parent.keeper).toBe(observed.originalKeeper);
    expect(observed.parent.timer).toBe(observed.originalTimer);
    expect(observed.intervalCalls).toBe(0);
    expect(observed.hostileTouches).toBe(0);
    expect(observed.parent.failures[0]).toBe(observed.first);
    expect(observed.parent.failures.at(-1)).toBe(observed.second);
    expect(observed.parent.stopContext.site).toBe('helper-outcome-catch');
    expect(observed.parent.stopContext.cause).toBe(observed.first);
    expect(observed.parent.prehelperRefusalTerminal).toBe(false);
    expect(observed.parent.report).toBeUndefined();
    if (mode === 'prepare-throw') {
      expect(observed.firstReport).toBeUndefined();
      expect(observed.parent.stopReport).toBeUndefined();
      expect(observed.parent.failures[1]).toBe(observed.writeFailure);
      expect(observed.calls).toHaveLength(0);
      continue;
    }
    expect(observed.parent.stopReport).toBe(report);
    expect(report.cause).toBe(observed.first);
    expect(report.site).toBe('helper-outcome-catch');
    expect(report.snapshot.site).toBe('helper-outcome-catch');
    const snapshot = report.snapshot as typeof report.snapshot & {
      operationCount: number;
      operationsTruncated: boolean;
      operations: { state: string }[];
      clockOperationCount: number;
      clockOperationsTruncated: boolean;
      clockOperations: unknown[];
      childCount: number;
      childrenTruncated: boolean;
      children: { known: boolean }[];
    };
    expect(snapshot.operationCount).toBe(129);
    expect(snapshot.operationsTruncated).toBe(true);
    expect(snapshot.operations.length).toBeLessThanOrEqual(128);
    expect(snapshot.operations[0]?.state).toBe('pending');
    expect(snapshot.clockOperationCount).toBe(129);
    expect(snapshot.clockOperationsTruncated).toBe(true);
    expect(snapshot.clockOperations.length).toBeLessThanOrEqual(128);
    expect(snapshot.childCount).toBe(2);
    expect(snapshot.childrenTruncated).toBe(true);
    expect(snapshot.children).toHaveLength(1);
    expect(snapshot.children[0]?.known).toBe(false);
    expect(report.writer).toBe(observed.writer);
    expect(report.descriptor).toBe(2);
    expect(report.offset).toBe(0);
    expect(report.length).toBe(report.buffer.length);
    expect(report.length).toBeLessThanOrEqual(32768);
    expect(report.position).toBeNull();
    expect(observed.calls).toHaveLength(1);
    expect(observed.calls[0]?.buffer).toBe(report.buffer);
    expect(report.buffer.toString('utf8')).toStartWith(
      'UC2 parent STOP: original helper or reader outcomes incomplete\nUC2_PARENT_STOP:',
    );
    if (mode === 'throw') {
      expect(report.state).toBe('threw');
      expect(report.writeCause).toBe(observed.writeFailure);
      expect(observed.parent.failures[1]).toBe(observed.writeFailure);
    } else {
      expect(report.state).toBe('returned');
      if (mode === 'full') expect(report.returned).toBe(report.length);
      if (mode === 'short') expect(report.returned).toBe(report.length - 1);
      if (mode === 'unsupported') expect(report.returned).toBe(observed.unsupportedReturn);
    }
  }
});
