import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import {
  inspectDependencyOwnerPublication,
  retainActivationRecord,
  withDependencyOwner,
} from './edge-ownership';
import { captureEdgeRecord } from './edge-policy';
import { envLayout } from './env';
import { readFields } from './managed-cohort';

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
