import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { decodeOwnership, organizationId } from '../record-codecs';
import { createManifest, FixtureClock } from '../testing/fixtures';
import { createFormat3Fixture } from '../testing/format3-fixture';
import { upgradeSqliteStores } from './migrate-recovery';

test('loaded original BB14 writer refuses fresh manifest on physically version4 successor', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'recovery-old-writer-'));
  const path = join(directory, 'runs.sqlite');
  const old = await createFormat3Fixture(path);
  try {
    const ownership = decodeOwnership(await old.populate('authority_pending'));
    await upgradeSqliteStores({
      path,
      organizationId: organizationId('organization'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock: new FixtureClock(),
      maxBusyAttempts: 20,
      busyDelayMilliseconds: 1,
    });
    const before = await old.capture();
    const meta = before.tables.find((table) => table.name === 'run_meta');
    if (meta === undefined) throw new Error('missing captured metadata');
    expect(meta.rows[0]?.[meta.columns.indexOf('schema_version')]).toBe(4n);
    expect(before.schema.some((entry) => entry.name === 'run_recovery_journal')).toBe(true);
    let mutation: unknown;
    try {
      mutation = await old.retainManifest(
        ownership,
        createManifest({ executorVersions: { fresh: '2' } }),
      );
    } catch (cause) {
      mutation = cause;
    }
    const after = await old.capture();
    expect(after.tables.find((table) => table.name === 'run_manifest')).toEqual(
      before.tables.find((table) => table.name === 'run_manifest'),
    );
    expect(mutation).toBeInstanceOf(Error);
    expect(String(mutation)).toContain('incompatible sqlite format bundle hash');
    expect(after).toEqual(before);
  } finally {
    await old.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

import { copyFileSync, cpSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Database } from 'bun:sqlite';

import { FORMAT4_IDENTITY } from './format';
import { bootstrapSqliteStores } from './open-stores';

for (const artifact of ['migration.sql', 'down.sql'] as const)
  test(`fresh source with edited 0004 ${artifact} refuses ordinary open and unused down despite identical statements`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'recovery-artifact-identity-'));
    const cli = 'apps/twilight-structure/twilight-dash/cli';
    const options = {
      path: join(directory, 'runs.sqlite'),
      organizationId: organizationId('organization'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock: new FixtureClock(),
      maxBusyAttempts: 2,
      busyDelayMilliseconds: 1,
    };
    let stores: Awaited<ReturnType<typeof bootstrapSqliteStores>> | undefined;
    let observer: Database | undefined;
    let child: ReturnType<typeof Bun.spawn> | undefined;
    let output: Promise<string> | undefined;
    let diagnostic: Promise<string> | undefined;
    try {
      stores = await bootstrapSqliteStores(options);
      await stores.close();
      observer = new Database(options.path);
      const before = observer.query('SELECT * FROM run_format').all();
      const source = join(directory, 'source');
      cpSync(resolve(cli), join(source, cli), { recursive: true });
      copyFileSync(resolve('tsconfig.base.json'), join(source, 'tsconfig.base.json'));
      symlinkSync(
        resolve('apps/twilight-structure/twilight-burokrat'),
        join(source, 'apps/twilight-structure/twilight-burokrat'),
        'dir',
      );
      symlinkSync(resolve('libs'), join(source, 'libs'), 'dir');
      symlinkSync(resolve('node_modules'), join(source, 'node_modules'), 'dir');
      const path = join(source, cli, 'src/runs/sqlite/migrations/0004-runtime-recovery', artifact);
      const original = readFileSync(path, 'utf8');
      const edited = '\n' + original;
      expect(edited.split('--> statement-breakpoint').map((statement) => statement.trim())).toEqual(
        original.split('--> statement-breakpoint').map((statement) => statement.trim()),
      );
      expect(new Bun.CryptoHasher('sha256').update(edited).digest('hex')).not.toBe(
        new Bun.CryptoHasher('sha256').update(original).digest('hex'),
      );
      writeFileSync(path, edited);
      const worker = join(source, cli, 'src/runs/testing/edited-artifact-probe.ts');
      writeFileSync(
        worker,
        `
import { openSqliteStores } from '../sqlite/open-stores';
import { downgradeUnusedSqliteStores } from '../sqlite/migrate-recovery';
import { FORMAT4_IDENTITY } from '../sqlite/format';
import { organizationId } from '../record-codecs';
const options = { path: ${JSON.stringify(options.path)}, organizationId: organizationId('organization'), capacity: 1, leaseMilliseconds: 100, clock: { read: () => 1000 }, maxBusyAttempts: 2, busyDelayMilliseconds: 1 };
const failures = [];
for (const operation of [openSqliteStores, downgradeUnusedSqliteStores]) {
  try {
    const response = await operation(options);
    if ('close' in response) await response.close();
    throw new Error('edited artifact was admitted');
  } catch (cause) {
    if (!(cause instanceof Error) || !('failure' in cause)) throw cause;
    failures.push({ failure: cause.failure, cause: String(cause.cause) });
  }
}
process.stdout.write(JSON.stringify({ identity: FORMAT4_IDENTITY, failures }));
`,
      );
      const workerProcess = Bun.spawn([process.execPath, worker], {
        cwd: source,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 15000,
      });
      child = workerProcess;
      output = new Response(workerProcess.stdout).text();
      diagnostic = new Response(workerProcess.stderr).text();
      const exit = await workerProcess.exited;
      expect(await diagnostic).toBe('');
      expect(exit).toBe(0);
      const observed: unknown = JSON.parse(await output);
      expect(observed).toMatchObject({
        failures: [
          { failure: 'incompatible', cause: 'Error: incompatible sqlite format bundle hash' },
          { failure: 'incompatible', cause: 'Error: incompatible sqlite format bundle hash' },
        ],
      });
      expect(observed).not.toMatchObject({ identity: { bundleHash: FORMAT4_IDENTITY.bundleHash } });
      expect(observer.query('SELECT * FROM run_format').all()).toEqual(before);
      expect(
        observer.query<{ schema_version: number }, []>('SELECT schema_version FROM run_meta').get()
          ?.schema_version,
      ).toBe(4);
    } finally {
      if (child !== undefined) {
        if (child.exitCode === null) child.kill('SIGKILL');
        await child.exited;
        await Promise.all([output, diagnostic]);
      }
      try {
        observer?.close();
      } finally {
        try {
          await stores?.close();
        } finally {
          rmSync(directory, { recursive: true, force: true });
        }
      }
    }
  });
