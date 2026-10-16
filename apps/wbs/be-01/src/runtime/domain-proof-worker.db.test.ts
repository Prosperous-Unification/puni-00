import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DomainResolver } from '@wbs/core';
import { DomainClaimRepository } from '@wbs/store-sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { openConnection, openDatabase } from '../repository/db';
import { OPEN } from '../repository/gate';
import { runMigrations } from '../repository/migrate';
import { runDomainProofWorker, startDomainProofWorker } from './domain-proof-worker';

const DAY = 86_400_000;
const START = 1_000_000;
const migrations = new URL('../../drizzle', import.meta.url).pathname;
const policy = new URL('../../../../../libs/wbs/domain/domain/src/', import.meta.url).pathname;
let directory: string;
let sqlite: ReturnType<typeof openDatabase>;
let records: Map<string, string>;
let beforeReply: (() => void) | undefined;
let repository: DomainClaimRepository;
let connection: ReturnType<typeof openConnection>;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-domain-proof-worker-'));
  const path = join(directory, 'worker.db');
  runMigrations(path, migrations);
  sqlite = openDatabase(path);
  sqlite.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
  sqlite.run(
    "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
  );
  records = new Map();
  beforeReply = undefined;
  const resolver: DomainResolver = {
    lookupTxt: (name) => {
      beforeReply?.();
      const proof = records.get(name);
      return Promise.resolve(proof === undefined ? [] : [proof]);
    },
  };
  connection = openConnection(path);
  repository = new DomainClaimRepository(connection.db, OPEN, policy, resolver);
});

afterEach(() => {
  connection.close();
  sqlite.close();
  rmSync(directory, { recursive: true });
});

function plantProof(index: number, lastCheckedAt = START): string {
  const id = `claim-${index.toString().padStart(2, '0')}`;
  const domain = `${id}.example.org`;
  const value = `wbs-domain-verification=org-a:${domain}:${'a'.repeat(64)}`;
  const digest = createHash('sha256').update(value).digest('hex');
  sqlite.run(
    "INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, last_checked_at, created_at, updated_at) VALUES (?, 'org-a', ?, 'verified', ?, ?, ?, ?, ?)",
    [id, domain, digest, START, lastCheckedAt, START, START],
  );
  records.set(`_wbs-verification.${domain}`, value);
  return id;
}

describe('bounded retained proof scheduling against SQLite', () => {
  for (const matches of [true, false]) {
    test(`checks 65 due proofs in three bounded scheduled sweeps with matching TXT ${String(matches)}`, async () => {
      // Reverse insertion order makes the ID tie-break visible through the real store.
      for (let index = 64; index >= 0; index -= 1) plantProof(index);
      if (!matches) records.clear();
      let at = START + 7 * DAY;
      const counts: number[] = [];
      let waiting = Promise.withResolvers<undefined>();
      let advance = () => {
        throw new Error('scheduler is not waiting');
      };
      const worker = startDomainProofWorker({
        sweep: async (_signal, limit) => {
          const completed = await runDomainProofWorker(repository, at, () => at, limit);
          counts.push(completed.checked);
        },
        wait: (_milliseconds, signal) => {
          const tick = Promise.withResolvers<undefined>();
          advance = () => {
            signal.removeEventListener('abort', advance);
            tick.resolve(undefined);
          };
          signal.addEventListener('abort', advance, { once: true });
          waiting.resolve(undefined);
          return tick.promise;
        },
      });
      try {
        await Promise.race([waiting.promise, worker.completed]);
        expect(counts).toEqual([32]);
        expect(
          sqlite
            .query<{ id: string }, [number]>(
              'SELECT id FROM organization_domain_claim WHERE last_checked_at = ? ORDER BY id',
            )
            .all(at)
            .map((claim) => claim.id),
        ).toEqual(
          Array.from({ length: 32 }, (_, index) => `claim-${index.toString().padStart(2, '0')}`),
        );
        for (let tick = 0; tick < 2; tick += 1) {
          waiting = Promise.withResolvers<undefined>();
          at += 3_600_000;
          advance();
          await Promise.race([waiting.promise, worker.completed]);
        }
        expect(counts).toEqual([32, 32, 1]);
        if (!matches)
          expect(
            sqlite
              .query<{ preserved: number }, [number]>(
                "SELECT count(*) AS preserved FROM organization_domain_claim WHERE last_success_at = ? AND status = 'verified'",
              )
              .get(START),
          ).toEqual({ preserved: 65 });
        expect(
          sqlite
            .query<{ pending: number }, [number]>(
              'SELECT count(*) AS pending FROM organization_domain_claim WHERE last_checked_at < ?',
            )
            .get(START + 7 * DAY),
        ).toEqual({ pending: 0 });
      } finally {
        await worker.stop();
      }
    });
  }

  test('validates trusted proofs outside the bounded batch before any lookup commits', async () => {
    for (let index = 0; index < 65; index += 1) plantProof(index);
    sqlite.run("UPDATE organization_domain_claim SET last_checked_at = NULL WHERE id = 'claim-64'");
    const at = START + 7 * DAY;
    const failure = await runDomainProofWorker(repository, at, () => at, 32).catch(
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error('expected malformed trusted proof failure');
    expect(failure.message).toContain('claim-64 lacks retained proof state');
    expect(
      sqlite
        .query<{ checked: number }, [number]>(
          'SELECT count(*) AS checked FROM organization_domain_claim WHERE last_checked_at = ?',
        )
        .get(at),
    ).toEqual({ checked: 0 });
  });

  test('checks older due proofs before newer ones', async () => {
    plantProof(0, START);
    plantProof(1, START - DAY);
    const at = START + 7 * DAY;
    expect(await runDomainProofWorker(repository, at, () => at, 1)).toEqual({
      checked: 1,
      stale: 0,
    });
    expect(
      sqlite
        .query<{ id: string }, [number]>(
          'SELECT id FROM organization_domain_claim WHERE last_checked_at = ?',
        )
        .all(at),
    ).toEqual([{ id: 'claim-01' }]);
  });

  for (const change of ['digest', 'timestamp', 'release', 'activation'] as const) {
    test(`rejects the scheduled snapshot after ${change} changes during lookup`, async () => {
      const id = plantProof(0);
      const at = START + 7 * DAY;
      beforeReply = () => {
        if (change === 'digest')
          sqlite.run('UPDATE organization_domain_claim SET proof_digest = ? WHERE id = ?', [
            'b'.repeat(64),
            id,
          ]);
        if (change === 'timestamp')
          sqlite.run('UPDATE organization_domain_claim SET last_checked_at = ? WHERE id = ?', [
            START + 1,
            id,
          ]);
        if (change === 'release')
          sqlite.run('DELETE FROM organization_domain_claim WHERE id = ?', [id]);
        if (change === 'activation') {
          // Model a storage rollback that the production irreversible trigger refuses.
          sqlite.run('DROP TRIGGER organization_activation_no_revert');
          sqlite.run(
            "UPDATE organization_activation SET state = 'pre_activation', activated_at = NULL WHERE singleton = 1",
          );
        }
      };
      expect(await runDomainProofWorker(repository, at, () => at, 32)).toEqual({
        checked: 0,
        stale: 1,
      });
      expect(
        sqlite
          .query<{ last_success_at: number; last_checked_at: number }, [string]>(
            'SELECT last_success_at, last_checked_at FROM organization_domain_claim WHERE id = ?',
          )
          .get(id),
      ).toEqual(
        change === 'release'
          ? null
          : { last_success_at: START, last_checked_at: START + (change === 'timestamp' ? 1 : 0) },
      );
    });
  }
});
