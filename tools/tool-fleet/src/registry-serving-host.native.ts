import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

import { type } from 'arktype';

import { RegistryDeletionPublication } from './registry-deletion.fixture';
import { completeRegistryFixture } from './registry-fixture-completion.fixture';
import { describeRegistryGuardObservationFailure } from './registry-guard-observation.fixture';
import { prepareRegistryIndexReaders } from './registry-index-authority.fixture';
import { parseRegistryCommandResponse } from './registry-journal';
import { startRegistryFixtureGuard } from './registry-maintenance-guard.fixture';
import { prepareRegistryHostFixture } from './registry-maintenance-host.fixture';
import { readRegistryIndexPublication, verifyPresent } from './registry-maintenance-index.native';
import type { runRegistryServingCli } from './registry-serving-cli.fixture';
import { readRegistryBytes } from './registry-stream';

const Backup = type([
  {
    operationId: 'string > 0',
    owner: "'operator'",
    kind: "'backup'",
    status: "'starting'",
    '+': 'reject',
  },
  { operationId: 'string > 0', status: "'completed-fenced'", '+': 'reject' },
]);
type RunOwner = (mode: string) => Promise<{ code: number; stdout: string; stderr: string }>;

/** Actual fixed ordinary CLI backup/status/reopen and cold startup guard in the owned fixture. A fresh verified backup keeps writes fenced until explicit low-water reopen; fresh managed publication and every old/new digest read follow actual writable observation. Bootstrap Kubernetes/consumer/history/provider ports remain modeled. This does not activate a recovered volume or any installed live service. */
export async function proveRegistryServingHost(
  run: RunOwner,
  cli: typeof runRegistryServingCli,
): Promise<void> {
  let stage = 'setup';
  let guard: Awaited<ReturnType<typeof startRegistryFixtureGuard>> | undefined;
  try {
    const proof = await completeRegistryFixture(async () => {
      const { installed } = await prepareRegistryHostFixture();
      await prepareRegistryIndexReaders(installed);
      await writeFile('/root/task8-fixture/admission', 'fixture', { mode: 0o600 });
      const invoke = async (mode: string, expected: string) => {
        const finished = await run(mode);
        // Proof (serving): assert omission failed bootstrap-code in registry-serving-host.test.ts.
        assert.equal(finished.code, 0, 'Serving owner failed');
        // Proof (serving): assert omission failed bootstrap-receipt in registry-serving-host.test.ts.
        assert.equal(finished.stdout.trim(), expected, 'Serving owner receipt differs');
      };
      const canonical = async () => {
        const encoded: unknown = JSON.parse(
          await readFile(installed.journalPath + '/journal.json', 'utf8'),
        );
        return parseRegistryCommandResponse({ state: encoded }).state;
      };
      stage = 'bootstrap';
      await invoke('initialize', 'initialized');
      await invoke('backup', 'verified-native-backup');
      await writeFile(
        '/etc/puni/ordinary-writer.json',
        JSON.stringify({
          version: 0.1,
          log: { level: 'error' },
          storage: {
            filesystem: { rootdirectory: installed.ordinary.path },
            delete: { enabled: false },
            maintenance: { uploadpurging: { enabled: false } },
          },
          http: { addr: '127.0.0.1:5052', secret: 'owned-serving-seed' },
        }),
        { mode: 0o644, flag: 'wx' },
      );
      stage = 'seed';
      guard = await startRegistryFixtureGuard(installed, {
        signal: new AbortController().signal,
        initialMode: 'readonly',
        interceptPermissionReads: false,
      });
      await invoke('index-reopen', 'population-writable-permitted');
      await guard.waitMode('writable');
      const published = await run('deletion-publish-protected');
      // Proof (serving): assert omission failed seed-owner in registry-serving-host.test.ts.
      assert.equal(published.code, 0, 'Serving protected publication failed');
      const seed = RegistryDeletionPublication.assert(JSON.parse(published.stdout));
      // Proof (serving): assert omission failed seed-kind in registry-serving-host.test.ts.
      assert.equal(seed.kind, 'protected');
      // Proof (serving): assert omission failed seed-repository in registry-serving-host.test.ts.
      assert.equal(seed.repository, 'retained/index');
      // Proof (serving): assert omission failed seed-count in registry-serving-host.test.ts.
      assert.deepEqual(
        {
          manifests: seed.manifests.length,
          blobs: seed.blobs.length,
          rootIncluded: seed.manifests.includes(seed.root),
        },
        { manifests: 3, blobs: 4, rootIncluded: true },
      );
      await writeFile('/etc/puni/registry-deletion-protected.json', JSON.stringify(seed), {
        mode: 0o644,
        flag: 'wx',
      });
      await invoke('deletion-protect', 'index-explicitly-protected');
      await guard.close();
      guard = undefined;
      stage = 'backup';
      const seeded = await canonical();
      // Proof (serving): assert omission failed seed-schema in registry-serving-host.test.ts.
      assert(
        seeded.schemaVersion === 4 && seeded.lastVerifiedBackup !== null,
        'Serving seed lacks bootstrap backup',
      );
      // Proof (serving): assert omission failed seed-protection in registry-serving-host.test.ts.
      assert(
        seeded.protections.some((protection) => protection.roots.includes(seed.root)),
        'Serving seed is not protected',
      );
      const backup = await cli({ action: 'backup' });
      // Proof (serving): assert omission failed backup-stderr in registry-serving-host.test.ts.
      assert.equal(backup.stderr, '', 'Ordinary backup CLI diagnostic is not empty');
      const [started, completed] = Backup.assert(
        backup.stdout
          .trim()
          .split('\n')
          .map((line): unknown => JSON.parse(line)),
      );
      // Proof (serving): assert omission failed backup-identity in registry-serving-host.test.ts.
      assert.equal(
        completed.operationId,
        started.operationId,
        'Ordinary backup CLI changed ownership',
      );
      const before = await canonical();
      // Proof (serving): assert omission failed before-schema in registry-serving-host.test.ts.
      assert(
        before.schemaVersion === 4 && before.lastVerifiedBackup !== null,
        'Ordinary backup lacks canonical snapshot',
      );
      // Proof (serving): assert omission failed before-unfenced in registry-serving-host.test.ts.
      assert.deepEqual(
        {
          fenced: before.fenced,
          reason: before.fenceReason,
          maintenanceVerified: before.maintenanceVerified,
          maintenance: before.maintenance,
          publication: before.publication,
          reservations: before.reservations,
        },
        {
          fenced: true,
          reason: 'maintenance',
          maintenanceVerified: true,
          maintenance: null,
          publication: null,
          reservations: [],
        },
      );
      // Proof (serving): assert omission failed backup-revision in registry-serving-host.test.ts.
      assert(before.revision > seeded.revision, 'Ordinary backup did not advance revision');
      // Proof (serving): assert omission failed backup-target in registry-serving-host.test.ts.
      assert.deepEqual(before.enrollment, seeded.enrollment, 'Ordinary backup changed target');
      // Proof (serving): assert omission failed backup-lineage in registry-serving-host.test.ts.
      assert(
        before.maintenanceEvidence !== null &&
          before.maintenanceEvidence.operationId === started.operationId,
        'Ordinary backup operation differs from canonical lineage',
      );
      // Proof (serving): assert omission failed backup-pair in registry-serving-host.test.ts.
      assert.deepEqual(
        before.maintenanceEvidence.backup,
        before.lastVerifiedBackup,
        'Ordinary backup differs from verified canonical pair',
      );
      // Proof (serving): assert omission failed backup-reused in registry-serving-host.test.ts.
      assert.notEqual(
        before.lastVerifiedBackup.snapshotId,
        seeded.lastVerifiedBackup.snapshotId,
        'Ordinary backup reused bootstrap snapshot',
      );
      // Proof (serving): assert omission failed backup-protection in registry-serving-host.test.ts.
      assert.deepEqual(
        before.protections,
        seeded.protections,
        'Ordinary backup changed protections',
      );
      // Proof (serving): assert omission failed backup-bundles in registry-serving-host.test.ts.
      assert.deepEqual(
        before.bundles,
        seeded.bundles,
        'Ordinary backup changed publication receipts',
      );
      stage = 'cold-start';
      guard = await startRegistryFixtureGuard(installed, {
        signal: new AbortController().signal,
        initialMode: 'readonly',
        interceptPermissionReads: false,
      });
      const refused = await fetch('http://127.0.0.1:5052/v2/retained/index/blobs/uploads/', {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
      await readRegistryBytes(refused.body, 4096, 'Serving initial write refusal');
      // Proof (serving): assert omission failed initial-write in registry-serving-host.test.ts.
      assert.equal(
        refused.status,
        405,
        'Cold ordinary guard accepted a write before explicit reopen',
      );
      const status = async (state: typeof before) => {
        const reply = await cli({ action: 'status' });
        // Proof (serving): assert omission failed status-stderr in registry-serving-host.test.ts.
        assert.equal(reply.stderr, '', 'Ordinary status CLI diagnostic is not empty');
        const encoded: unknown = JSON.parse(reply.stdout);
        // Proof (serving): assert omission failed status-extra in registry-serving-host.test.ts.
        assert.deepEqual(encoded, {
          registryId: state.enrollment.registryId,
          storageId: state.enrollment.storageId,
          registryPath: state.enrollment.registryPath,
          revision: state.revision,
          fenced: state.fenced,
          reason: state.fenceReason,
          operation: null,
          recoveryTarget: installed.recovery.state,
          verifiedBackup: state.lastVerifiedBackup?.snapshotId,
        });
      };
      stage = 'status-before';
      await status(before);
      stage = 'reopen';
      const response = await cli({ action: 'reopen', revision: before.revision });
      // Proof (serving): assert omission failed reopen-stderr in registry-serving-host.test.ts.
      assert.equal(response.stderr, '', 'Ordinary reopen CLI diagnostic is not empty');
      const encoded: unknown = JSON.parse(response.stdout);
      const reopened = parseRegistryCommandResponse(encoded).state;
      // Proof (serving): assert omission failed reopen-schema in registry-serving-host.test.ts.
      assert(reopened.schemaVersion === 4, 'Ordinary reopen returned a legacy journal');
      // Proof (serving): assert omission failed reopen-revision in registry-serving-host.test.ts.
      assert(
        reopened.revision > before.revision,
        'Ordinary reopen did not advance canonical revision',
      );
      // Proof (serving): assert omission failed reopen-fenced in registry-serving-host.test.ts.
      assert.deepEqual(
        {
          fenced: reopened.fenced,
          reason: reopened.fenceReason,
          maintenance: reopened.maintenance,
          publication: reopened.publication,
          reservations: reopened.reservations,
          enrollment: reopened.enrollment,
          protections: reopened.protections,
          bundles: reopened.bundles,
          backup: reopened.lastVerifiedBackup,
        },
        {
          fenced: false,
          reason: null,
          maintenance: null,
          publication: null,
          reservations: [],
          enrollment: before.enrollment,
          protections: before.protections,
          bundles: before.bundles,
          backup: before.lastVerifiedBackup,
        },
      );
      await guard.waitMode('writable');
      stage = 'publication';
      const fresh = readRegistryIndexPublication(4, await run('index-publish-4'), (line) => {
        console.log(line);
      });
      // Proof (serving): assert omission failed fresh-root in registry-serving-host.test.ts.
      assert.notEqual(fresh.root, seed.root, 'Serving fresh publication reused the seed');
      stage = 'verify';
      const after = await canonical();
      // Proof (serving): assert omission failed final-schema in registry-serving-host.test.ts.
      assert(after.schemaVersion === 4, 'Serving publication returned a legacy journal');
      // Proof (serving): assert omission failed final-backup in registry-serving-host.test.ts.
      assert.deepEqual(
        after.lastVerifiedBackup,
        before.lastVerifiedBackup,
        'Serving publication changed verified backup',
      );
      // Proof (serving): assert omission failed final-fenced in registry-serving-host.test.ts.
      assert.deepEqual(
        { fenced: after.fenced, publication: after.publication, reservations: after.reservations },
        { fenced: false, publication: null, reservations: [] },
      );
      // Proof (serving): assert omission failed final-protection in registry-serving-host.test.ts.
      assert.deepEqual(
        after.protections,
        before.protections,
        'Serving publication changed protection',
      );
      for (const kept of before.bundles)
        // Proof (serving): assert omission failed final-prior in registry-serving-host.test.ts.
        assert.deepEqual(
          after.bundles.find((bundle) => bundle.operationId === kept.operationId),
          kept,
          'Serving publication changed prior receipt',
        );
      const bundle = after.bundles.find((bundle) => bundle.operationId === fresh.operationId);
      // Proof (serving): assert omission failed final-receipt in registry-serving-host.test.ts.
      assert(
        bundle?.receipt.state === 'completed' && bundle.roots.includes(fresh.root),
        'Serving publication lacks exact completed ownership',
      );
      for (const publication of [seed, fresh]) {
        // Proof (serving): manifest-read omission loses protected-missing; blob-read omission loses14required reads in none.
        for (const digest of publication.manifests) await verifyPresent('manifests', digest);
        // Proof (serving): blob-read omission fails the required14read positive.
        for (const digest of publication.blobs) await verifyPresent('blobs', digest);
      }
      stage = 'status-after';
      await status(after);
      stage = 'completed';
      return {
        proof: 'ordinary-cli-writable-serving',
        ordinaryCliBackup: true,
        ordinaryCliStatus: true,
        ordinaryCliReopen: true,
        initialWriteStatus: refused.status,
        freshPublicationCompleted: true,
        protectedReads: seed.manifests.length + seed.blobs.length,
        freshReads: fresh.manifests.length + fresh.blobs.length,
        recoveryActivationPending: true,
        synthetic:
          'Kubernetes/consumer/history/provider; ordinary CLIs, authority, Distribution, mounts and guard actual',
      };
    }, [
      async () => {
        // Proof (serving): guard-cleanup omission falsely completes the modeled cleanup refusal.
        if (guard !== undefined) await guard.close();
      },
    ]);
    console.log(JSON.stringify(proof));
  } catch (cause) {
    const failures: unknown[] = [cause];
    try {
      console.log(
        JSON.stringify({
          servingFailure: {
            stage,
            observation: describeRegistryGuardObservationFailure(
              cause instanceof AggregateError ? cause.cause : cause,
            ),
          },
        }),
      );
    } catch (reporting) {
      failures.push(reporting);
    }
    // Proof (serving): report-refusal, original-cause removal and reversed order fail the compound reporter case.
    if (failures.length > 1)
      throw new AggregateError(failures, 'Serving proof and reporting failed', { cause });
    throw cause;
  }
}
