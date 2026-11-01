import { rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { link, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { inspectDependencyActivation } from '@wbs/store-sqlite/cross-project-dependency-activation';
import { openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { afterEach, expect, test } from 'bun:test';

import { participantActivationFixture } from '../fixtures/dependency-participant-restoration';
import { roots } from '../fixtures/source-startup';
import {
  consumePreparedDependencyActivation,
  prepareActivatedParticipantsUnderOwner,
  releasePreparedDependencyActivation,
} from './complete-dependency-exclusion';
import type {
  ActivationRecordByLabel,
  ActivationRecordReference,
} from './dependency-activation-records';
import { retainActivationDatabase } from './dependency-activation-storage';
import { withDependencyOwner } from './edge-ownership';

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
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  delete process.env['WBS_EDGE_STATE'];
});

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
