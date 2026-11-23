import { rejects } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { withinClaimFixture } from '@wbs/core/testing/current-claim-observation';
import { expect, spyOn, test } from 'bun:test';

import * as sources from '../source';
import { seedCurrentProjectFixture } from './current-project-fixture';

function request(directory: string) {
  const definition = {
    id: 'current-fixture-dev',
    code: 'dev',
    name: 'Dev',
    position: 10,
    defaultEstimateUnit: 'workdays' as const,
    defaultAllowancePercent: 0,
  };
  return {
    path: join(directory, 'source.db'),
    directory,
    organizationId: 'current-fixture-organization',
    projectId: 'current-fixture-project',
    stamp: { at: 1, by: 'current-fixture-actor' },
    definitions: [definition, { ...definition, id: 'duplicate-dev', name: 'Duplicate Dev' }],
  };
}

test('current project fixture refuses an actual authored duplicate code and settles its Source', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'current-project-refusal-'));
  const custody = { hasUnknownOwner: false };
  await withinClaimFixture(
    () => {
      rmSync(directory, { recursive: true });
      return Promise.resolve();
    },
    async () => {
      await rejects(
        seedCurrentProjectFixture(request(directory), custody),
        /current project fixture definition refused: code_taken/,
      );
      expect(custody.hasUnknownOwner).toBe(false);
    },
  );
});

test('current project fixture retains unknown close custody and both original failures', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'current-project-close-'));
  const custody = { hasUnknownOwner: false };
  const open = sources.openSqliteSource;
  const closeFailure = new Error('injected current fixture close refusal');
  let owner: sources.SqliteSource | undefined;
  const intercepted = spyOn(sources, 'openSqliteSource').mockImplementation((options) => {
    const source = open(options);
    owner = source;
    return { ...source, close: () => Promise.reject(closeFailure) };
  });
  await withinClaimFixture(
    async () => {
      intercepted.mockRestore();
      if (owner !== undefined) await owner.close();
      rmSync(directory, { recursive: true });
    },
    async () => {
      await rejects(seedCurrentProjectFixture(request(directory), custody), (cause: unknown) => {
        expect(cause).toBeInstanceOf(AggregateError);
        if (!(cause instanceof AggregateError))
          throw new Error('expected paired seed/close failure');
        expect(cause.errors[0]).toMatchObject({
          message: 'current project fixture definition refused: code_taken',
        });
        expect(cause.errors[1]).toBe(closeFailure);
        expect(cause.cause).toBe(closeFailure);
        return true;
      });
      expect(custody.hasUnknownOwner).toBe(true);
    },
  );
});

test('current project fixture retains unknown acquisition custody and its original cause', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'current-project-acquisition-'));
  const custody = { hasUnknownOwner: false };
  const acquisitionFailure = new Error('injected current fixture acquisition refusal');
  const intercepted = spyOn(sources, 'openSqliteSource').mockImplementation(() => {
    throw acquisitionFailure;
  });
  await withinClaimFixture(
    () => {
      intercepted.mockRestore();
      rmSync(directory, { recursive: true });
      return Promise.resolve();
    },
    async () => {
      await rejects(seedCurrentProjectFixture(request(directory), custody), (cause: unknown) => {
        expect(cause).toBeInstanceOf(Error);
        expect(cause).toMatchObject({ cause: acquisitionFailure });
        return true;
      });
      expect(custody.hasUnknownOwner).toBe(true);
    },
  );
});

test('current project fixture preserves undefined operation and null close failures', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'current-project-unknown-failures-'));
  const custody = { hasUnknownOwner: false };
  const open = sources.openSqliteSource;
  let owner: sources.SqliteSource | undefined;
  const intercepted = spyOn(sources, 'openSqliteSource').mockImplementation((options) => {
    const source = open(options);
    owner = source;
    const stores = source.stores;
    const users = new Proxy(stores.users, {
      get(target, key): unknown {
        if (key === 'create')
          return () => {
            const rejection = Promise.withResolvers<never>();
            rejection.reject(undefined);
            return rejection.promise;
          };
        return Reflect.get(target, key, target);
      },
    });
    return {
      ...source,
      stores: { ...stores, users },
      close: () => {
        const rejection = Promise.withResolvers<never>();
        rejection.reject(null);
        return rejection.promise;
      },
    };
  });
  await withinClaimFixture(
    async () => {
      intercepted.mockRestore();
      if (owner !== undefined) await owner.close();
      rmSync(directory, { recursive: true });
    },
    async () => {
      await rejects(seedCurrentProjectFixture(request(directory), custody), (cause: unknown) => {
        expect(cause).toBeInstanceOf(AggregateError);
        if (!(cause instanceof AggregateError))
          throw new Error('expected arbitrary paired failures');
        expect(cause.errors).toEqual([undefined, null]);
        expect(cause.cause).toBeNull();
        return true;
      });
      expect(custody.hasUnknownOwner).toBe(true);
    },
  );
});
