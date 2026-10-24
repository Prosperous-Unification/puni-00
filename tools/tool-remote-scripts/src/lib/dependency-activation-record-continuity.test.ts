import { lstat, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { participantActivationFixture } from '../fixtures/dependency-participant-restoration';
import { roots } from '../fixtures/source-startup';
import {
  activateCompleteDependenciesUnderOwner,
  prepareActivatedParticipantsUnderOwner,
  releasePreparedDependencyActivation,
} from './complete-dependency-exclusion';
import * as ownership from './edge-ownership';
import { readFields } from './managed-cohort';

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  delete process.env['WBS_EDGE_STATE'];
});

for (const boundary of ['capture', 'fenced-only', 'preparation'] as const)
  test(`original numbered publication refuses same-byte replacement at ${boundary} return boundary`, async () => {
    const fixture = await participantActivationFixture();
    process.env['WBS_EDGE_STATE'] = fixture.root;
    const policy = await readFile(join(fixture.root, 'edge-policy.json'), 'utf8');
    const retain = ownership.retainActivationRecord;
    let injected = false;
    let expectedReceipt: string | undefined;
    const publication = spyOn(ownership, 'retainActivationRecord').mockImplementation(
      async (owner, layouts, label, record) => {
        const original = await retain(owner, layouts, label, record);
        if (label === 'committed') expectedReceipt = JSON.stringify(readFields(record)['receipt']);
        if (label === (boundary === 'capture' ? 'capture' : 'fenced-complete')) {
          const before = await lstat(original.path, { bigint: true });
          await rename(original.path, original.path + '.PRIVATE_original');
          await writeFile(original.path, original.contents, { flag: 'wx', mode: 0o600 });
          const after = await lstat(original.path, { bigint: true });
          expect(`${String(after.dev)}:${String(after.ino)}`).not.toBe(
            `${String(before.dev)}:${String(before.ino)}`,
          );
          expect(await readFile(original.path, 'utf8')).toBe(original.contents);
          injected = true;
        }
        return original;
      },
    );
    let refusal: unknown;
    try {
      await ownership.withDependencyOwner(
        fixture.request.owner,
        async (owner) => {
          try {
            const parameters = [
              owner,
              fixture.request,
              fixture.layouts,
              performance.now() + 300000,
              fixture.root,
              fixture.ports,
            ] as const;
            if (boundary === 'preparation') {
              const prepared = await prepareActivatedParticipantsUnderOwner(...parameters);
              releasePreparedDependencyActivation(owner, prepared);
            } else {
              await activateCompleteDependenciesUnderOwner(...parameters);
            }
          } catch (cause) {
            refusal = cause;
          }
        },
        fixture.root,
      );
    } finally {
      publication.mockRestore();
    }
    expect(injected).toBe(true);
    expect(refusal).toBeInstanceOf(Error);
    expect(String(refusal)).toContain(
      boundary === 'capture' ? 'stage=capture;' : 'stage=exclusion-or-finalizer;',
    );
    for (const [path, enabled] of [
      [fixture.prodPath, boundary !== 'capture'],
      [fixture.devPath, false],
    ] as const) {
      const database = new Database(path, { create: false, readonly: true });
      try {
        expect(
          database.query('SELECT state FROM cross_project_dependency_activation').all(),
        ).toEqual([{ state: enabled ? 'ENABLED' : 'DISABLED' }]);
        expect(
          database.query('SELECT * FROM cross_project_dependency_activation_receipt').all().length,
        ).toBe(enabled ? 1 : 0);
        if (enabled) {
          expect(expectedReceipt).toBeDefined();
          expect(
            database.query('SELECT receipt FROM cross_project_dependency_activation_receipt').all(),
          ).toEqual([{ receipt: expectedReceipt }]);
        }
      } finally {
        database.close();
      }
    }
    const names = await readdir(fixture.root);
    if (boundary === 'capture') {
      expect(
        names.some(
          (name) =>
            name.includes('activation-intent') || name.includes('activation-fenced-complete'),
        ),
      ).toBe(false);
      const attempt = names.find((name) => name.startsWith('dependency-activation-'));
      if (attempt === undefined) throw new Error('actual storage attempt absent');
      expect(
        (await readdir(join(fixture.root, attempt))).some((name) =>
          name.endsWith('.before.sqlite'),
        ),
      ).toBe(false);
    }
    expect(await readFile(join(fixture.root, 'edge-policy.json'), 'utf8')).toBe(policy);
    expect(fixture.source.State.Running).toBe(false);
    expect(fixture.backend.State.Running).toBe(false);
    expect(fixture.gateway.State.Running).toBe(false);
    expect(fixture.commands.some((args) => ['start', 'restart', 'rm'].includes(args[0]))).toBe(
      false,
    );
  }, 300000);
