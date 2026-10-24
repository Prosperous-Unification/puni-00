import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, spyOn, test } from 'bun:test';

import {
  inspectDependencyOwnerPublication,
  retainActivationRecord,
  withDependencyOwner,
} from './edge-ownership';
import { captureEdgeRecord } from './edge-policy';
import { envLayout } from './env';
import { readFields } from './managed-cohort';
import * as migrationCapture from './migration-capture-file';

test('retains activation evidence under exact live joint owner and refuses copied or expired authority', async () => {
  const root = scratchSync('activation-record-');
  const layouts = {
    prod: { ...envLayout('prod'), root: `${root}/prod`, stateDir: `${root}/prod` },
    dev: { ...envLayout('dev'), root: `${root}/dev`, stateDir: `${root}/dev` },
  };
  await mkdir(layouts.prod.root);
  await mkdir(layouts.dev.root);
  const plan = { sha: 'a'.repeat(40), layouts: [layouts.prod, layouts.dev] };
  const owner = await withDependencyOwner(
    plan,
    async (owner) => {
      const publication = await inspectDependencyOwnerPublication(owner, layouts);
      expect(publication.plan).toEqual(plan);
      const record = await retainActivationRecord(owner, layouts, 'fenced-complete', {
        format: 'dependency-activation-fenced-complete',
        version: 1,
        activated: [],
        exposure: 'closed',
        controllers: 'fenced',
      });
      expect(record).toEqual(await captureEdgeRecord(root, basename(record.path), 65536));
      expect(Object.keys(record).sort()).toEqual(
        ['path', 'device', 'inode', 'parentDevice', 'parentInode', 'mode', 'contents'].sort(),
      );
      const retained: unknown = JSON.parse(await readFile(record.path, 'utf8'));
      expect(readFields(retained)['owner']).toBe(
        await readFile(`${root}/edge-owner.pending`, 'utf8'),
      );
      expect(inspectDependencyOwnerPublication({ ...owner }, layouts)).rejects.toThrow('live');
      await writeFile(
        `${root}/edge-owner.pending`,
        JSON.stringify({ ...publication, attempt: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }) + '\n',
      );
      expect(inspectDependencyOwnerPublication(owner, layouts)).rejects.toThrow(
        'publication changed',
      );
      return owner;
    },
    root,
  );
  expect(inspectDependencyOwnerPublication(owner, layouts)).rejects.toThrow('live');
});

test('activation record readback admits every closed label and rejects sibling paths', async () => {
  const directory = scratchSync('activation-record-readback-');
  for (const label of [
    'participants',
    'capture',
    'backup',
    'intent',
    'committed',
    'fenced-complete',
    'participant-restore-intent',
    'participant-start-intent',
    'participant-ready',
    'participant-policy-intent',
    'participants-restored',
  ]) {
    const name = `edge-owner-000001-activation-${label}.json`;
    await writeFile(`${directory}/${name}`, '{}\n', { mode: 0o600 });
    expect((await captureEdgeRecord(directory, name, 65536)).contents).toBe('{}\n');
  }
  for (const name of [
    'edge-owner-000001-activation-unknown.json',
    '../edge-owner-000001-activation-intent.json',
    'edge-owner-1-activation-intent.json',
  ]) {
    expect(captureEdgeRecord(directory, name, 65536)).rejects.toThrow('unsupported edge record');
  }
});

for (const fault of [
  'directory-sync',
  'private-readback',
  'public-readback',
  'exclusive-name',
] as const)
  test(`actual owner activation publication refuses ${fault}`, async () => {
    const root = scratchSync('activation-publication-fault-');
    const layouts = {
      prod: { ...envLayout('prod'), root: `${root}/prod`, stateDir: `${root}/prod` },
      dev: { ...envLayout('dev'), root: `${root}/dev`, stateDir: `${root}/dev` },
    };
    await mkdir(layouts.prod.root);
    await mkdir(layouts.dev.root);
    const write = migrationCapture.writeNewMigrationCapture;
    let injected = false;
    const publication = spyOn(migrationCapture, 'writeNewMigrationCapture').mockImplementation(
      async (path, contents, sync) => {
        if (!path.includes('-activation-fenced-complete.json')) return write(path, contents, sync);
        injected = true;
        if (fault === 'directory-sync')
          return write(path, contents, () =>
            Promise.reject(new Error('injected actual publication directory sync failure')),
          );
        if (fault === 'exclusive-name')
          await writeFile(path, 'original evidence\n', { mode: 0o600 });
        await write(path, contents, sync);
        if (fault === 'private-readback') await chmod(path, 0o000);
        if (fault === 'public-readback') await chmod(path, 0o644);
      },
    );
    try {
      await withDependencyOwner(
        { sha: 'a'.repeat(40), layouts: [layouts.prod, layouts.dev] },
        (owner) => {
          expect(
            retainActivationRecord(owner, layouts, 'fenced-complete', {
              format: 'dependency-activation-fenced-complete',
              version: 1,
              activated: [],
              exposure: 'closed',
              controllers: 'fenced',
            }),
          ).rejects.toThrow();
          return Promise.resolve();
        },
        root,
      );
    } finally {
      publication.mockRestore();
    }
    expect(injected).toBe(true);
    if (fault === 'exclusive-name')
      expect(
        await readFile(`${root}/edge-owner-000001-activation-fenced-complete.json`, 'utf8'),
      ).toBe('original evidence\n');
  });
