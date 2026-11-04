import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { mock, spyOn } from 'bun:test';

import type { RegistryBackupReservation } from './registry-backup-reservation';
import { modelRegistryBackupEffects } from './registry-backup-reservation.fixture';
import { invokeRegistryCallback } from './registry-callback';
import type { RegistryMaintenanceJournal } from './registry-journal';
import type { RegistryMaintenanceInstallation } from './registry-maintenance-installation';
import {
  encodedPrefix,
  uploads,
  version,
  versioning,
  versions,
} from './registry-s3-census.fixture';

const scenario = process.argv[2];
const durable = scenario.startsWith('durable-');
const fixtureUid = process.getuid?.();
const durableRoot = durable ? await mkdtemp(join(tmpdir(), 'registry-durable-delete-')) : undefined;
const journalPath =
  durableRoot === undefined ? '/installed-journal' : join(durableRoot, 'contents');
let durablePath: string | undefined;
if (durableRoot !== undefined) {
  await mkdir(journalPath);
  const directory = join(durableRoot, 'backup-effects');
  await mkdir(directory, { mode: 0o700 });
  durablePath = join(directory, 'state.json');
  await writeFile(
    durablePath,
    JSON.stringify({
      schemaVersion: 1,
      scope: 'effect-lineage-only',
      generation: 0,
      binding: null,
      snapshot: null,
      inspection: false,
      attempts: [],
      effects: [],
      closedOperationId: null,
    }) + '\n',
    { mode: 0o600 },
  );
  await writeFile(join(directory, 'state.lock'), '', { mode: 0o600 });
}

const isSnapshot = scenario.startsWith('snapshot-');
const retention = new AbortController();
const ciphertext =
  scenario === 'ciphertext-bound' ? Buffer.alloc(8 * 1024 ** 2, 7) : Buffer.from('ciphertext');
const hash = createHash('sha256').update(ciphertext).digest('hex');
const key = `locks/${hash}`;
const journal = {
  revision: 7,
  maintenance: { operationId: 'owned-backup', owner: 'root', token: 'owned-token' },
  enrollment: { rootPath: '/different-root' },
} as unknown as RegistryMaintenanceJournal;
const controller = new AbortController();
let lockCalls = 0;
let deleted = false;
let censusCalls = 0;
let versioningCalls = 0;
let lostLock = false;
let expireCycle: (() => void) | undefined;
if (scenario === 'cycle-deadline' || scenario === 'snapshot-cycle-deadline') {
  const schedule = globalThis.setTimeout;
  // Timer boundary: production uses function callbacks; Bun's token also carries the unused DOM numeric overload.
  spyOn(globalThis, 'setTimeout').mockImplementation(
    Object.assign(
      (callback: TimerHandler, milliseconds?: number, ...args: unknown[]) => {
        if (milliseconds === 60000 && expireCycle === undefined)
          expireCycle = () => {
            assert.equal(typeof callback, 'function');
            if (typeof callback !== 'function') throw new Error('Unexpected timer text');
            Reflect.apply(callback, undefined, args);
          };
        return schedule(callback, milliseconds, ...args);
      },
      { __promisify__: schedule.__promisify__ },
    ) as typeof setTimeout,
  );
}
const requests: { method: string; path: string; version: string | null }[] = [];
spyOn(process, 'getuid').mockReturnValue(scenario === 'uid' ? 1000 : 0);
// Explicit boundary model: this neither executes root nor establishes a kernel lock.
await mock.module('./registry-maintenance-process', () => ({
  assertRegistryMaintenanceLock: (path: string, descriptor: number, uid: number) =>
    invokeRegistryCallback(() => {
      assert.equal(path, journalPath);
      assert.equal(descriptor, 19);
      assert.equal(uid, 59001);
      lockCalls++;
      if (lostLock || scenario === 'lock' || (scenario === 'lost-lock' && lockCalls > 2))
        throw new Error('modeled absent authority');
    }),
}));
const configuration = {
  repositoryId: 'f'.repeat(64),
  recoveryPins: [],
  sourceLimits: {
    registry: {
      maximumLogicalBytes: 1125899906842624,
      maximumEntries: 1000000,
      maximumDepth: 128,
      maximumMetadataBytes: 268435456,
      maximumFanout: 1000000,
    },
    journal: {
      maximumLogicalBytes: 1125899906842624,
      maximumEntries: 1000000,
      maximumDepth: 128,
      maximumMetadataBytes: 268435456,
      maximumFanout: 1000000,
    },
  },
  binary: {
    path: '/root/.puni/tools/restic-0.19.1' as const,
    sha256: '20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639' as const,
  },
  password: { path: '/root/.puni/registry/restic.password' as const, sha256: 'a'.repeat(64) },
  environment: {
    RESTIC_REPOSITORY: 's3:https://objects.example.invalid/registry-backup/backups/registry',
    AWS_ACCESS_KEY_ID: 'fixture-access',
    AWS_SECRET_ACCESS_KEY: 'fixture-secret',
    AWS_DEFAULT_REGION: 'eu-test-1',
  },
};
const badRepositories: Record<string, string> = {
  unsupported: '/local/repository',
  query: `${configuration.environment.RESTIC_REPOSITORY}?secret=x`,
  userinfo: 's3:https://user:secret@objects.example.invalid/registry-backup/backups/registry',
  encoded: 's3:https://objects.example.invalid/registry-backup/backups/%2e%2e/registry',
  normalized: 's3:https://objects.example.invalid/registry-backup/backups/../registry',
};
if (scenario in badRepositories)
  configuration.environment.RESTIC_REPOSITORY = badRepositories[scenario] ?? '';
if (scenario === 'credentials') configuration.environment.AWS_SECRET_ACCESS_KEY = '';
if (scenario === 'region') configuration.environment.AWS_DEFAULT_REGION = '';
if (scenario === 'abort') controller.abort();
if (scenario === 'ownership') journal.maintenance = null;
const fetchWire = (input: RequestInfo | URL) => {
  assert(input instanceof Request);
  const url = new URL(input.url);
  requests.push({
    method: input.method,
    path: url.pathname,
    version: url.searchParams.get('versionId'),
  });
  assert.equal(url.origin, 'https://objects.example.invalid');
  assert.match(input.headers.get('authorization') ?? '', /^AWS4-HMAC-SHA256 /);
  const xml = (body: string) =>
    new Response(body, { headers: { 'content-type': 'application/xml' } });
  if (url.searchParams.has('versioning')) {
    versioningCalls++;
    if (versioningCalls === 9 && scenario === 'remove-lock-before-delete') lostLock = true;
    if (versioningCalls === 9 && scenario === 'remove-owner-before-delete') journal.revision++;
    return xml(versioning);
  }
  if (url.searchParams.has('versions')) {
    if (!url.searchParams.has('key-marker')) censusCalls++;
    if (scenario === 'empty' || scenario === 'snapshot-empty') return xml(versions());
    if (isSnapshot) {
      if (scenario === 'snapshot-root-abort-io') controller.abort();
      if (scenario === 'snapshot-retention-abort-io') retention.abort();
      if (scenario === 'snapshot-owner-io') journal.revision++;
      if (scenario === 'snapshot-lock-between-pages') lostLock = true;
      if (scenario === 'snapshot-cycle-deadline') {
        assert(expireCycle);
        expireCycle();
      }
      const snapshot = `snapshots/${'b'.repeat(64)}`;
      const current = version(
        scenario === 'snapshot-name' ? 'snapshots/unknown' : snapshot,
        'current',
        'true',
      );
      const history = version(
        scenario === 'snapshot-history-name' ? 'snapshots/short' : snapshot,
        'history',
        'false',
      );
      if (!url.searchParams.has('key-marker'))
        return xml(
          versions(
            current + history,
            `<IsTruncated>true</IsTruncated><NextKeyMarker>${encodedPrefix}${snapshot}</NextKeyMarker><NextVersionIdMarker>history</NextVersionIdMarker>`,
          ),
        );
      const markerName =
        scenario === 'snapshot-marker-name' ? 'snapshots/unknown' : `snapshots/${'c'.repeat(64)}`;
      return xml(
        versions(
          `<DeleteMarker><Key>${encodedPrefix}${markerName}</Key><VersionId>marker</VersionId><IsLatest>true</IsLatest></DeleteMarker>` +
            version(`zz-snapshots/${'d'.repeat(64)}`, 'unrelated', 'true'),
          `<KeyMarker>${encodedPrefix}${snapshot}</KeyMarker><VersionIdMarker>history</VersionIdMarker><IsTruncated>false</IsTruncated>`,
        ),
      );
    }
    if (scenario === 'lock-between-pages') lostLock = true;
    const name = key;
    const current = deleted
      ? ''
      : version(
          name,
          (scenario === 'changed' && censusCalls > 1) ||
            (scenario === 'remove-changed' && censusCalls > 2)
            ? 'replaced'
            : 'current',
          'true',
          `<Size>${String(scenario === 'size' ? 11 : ciphertext.length)}</Size>`,
        );
    const history = version(
      name,
      'history',
      deleted ? 'true' : 'false',
      `<Size>${String(ciphertext.length)}</Size>`,
    );
    const marker = `<DeleteMarker><Key>${encodedPrefix}${scenario === 'name' ? 'locks%2Funknown' : `locks%2F${'a'.repeat(64)}`}</Key><VersionId>marker</VersionId><IsLatest>true</IsLatest></DeleteMarker>`;
    if (scenario === 'ciphertext-bound')
      return xml(
        versions(
          Array.from({ length: 9 }, (_, index) =>
            version(
              key,
              index === 0 ? 'current' : `old-${String(index)}`,
              index === 0 ? 'true' : 'false',
              `<Size>${String(ciphertext.length)}</Size>`,
            ),
          ).join(''),
        ),
      );
    if (!url.searchParams.has('key-marker'))
      return xml(
        versions(
          current + history,
          `<IsTruncated>true</IsTruncated><NextKeyMarker>${encodedPrefix}${name}</NextKeyMarker><NextVersionIdMarker>history</NextVersionIdMarker>`,
        ),
      );
    return xml(
      versions(
        marker + version('ordinary-pack', 'pack', 'true'),
        `<KeyMarker>${encodedPrefix}${name}</KeyMarker><VersionIdMarker>history</VersionIdMarker><IsTruncated>false</IsTruncated>`,
      ),
    );
  }
  if (url.searchParams.has('uploads'))
    return xml(
      uploads(
        scenario === 'lock-upload' || scenario === 'snapshot-upload'
          ? `<Upload><Key>${encodedPrefix}${isSnapshot ? `snapshots/${'b'.repeat(64)}` : key}</Key><UploadId>partial-lock</UploadId></Upload>`
          : '',
      ),
    );
  if (url.searchParams.has('uploadId'))
    return xml(
      `<ListPartsResult><Bucket>registry-backup</Bucket><Key>backups/registry/${isSnapshot ? `snapshots/${'b'.repeat(64)}` : key}</Key><UploadId>partial-lock</UploadId><IsTruncated>false</IsTruncated></ListPartsResult>`,
    );
  assert.equal(url.pathname, `/registry-backup/backups/registry/${key}`);
  if (input.method === 'DELETE') {
    assert.equal(url.searchParams.get('versionId'), 'current');
    if (durablePath !== undefined) {
      // Boundary: the real reservation writer validated this ordinary fixture record; this assertion observes pre-DELETE durability only.
      const stored = JSON.parse(readFileSync(durablePath, 'utf8')) as RegistryBackupReservation;
      assert.equal(stored.effects.length, 1);
      assert.equal(stored.effects[0].state, 'consumed');
      assert.equal(stored.effects[0].slot, 'exact-lock-delete');
    }
    if (scenario === 'durable-response-loss') throw new Error('controlled lost DELETE response');
    deleted = scenario !== 'delete-retained';
    return new Response(null, { status: 204, headers: { 'x-amz-version-id': 'current' } });
  }
  assert.equal(input.method, 'GET');
  if (scenario === 'missing-body')
    return new Response(null, {
      headers: {
        'x-amz-version-id': url.searchParams.get('versionId') ?? '',
        'content-length': String(ciphertext.length),
      },
    });
  if (scenario === 'abort-io') controller.abort();
  if (scenario === 'cycle-deadline' || scenario === 'snapshot-cycle-deadline') {
    assert(expireCycle);
    expireCycle();
  }
  if (scenario === 'ownership-io') journal.revision++;
  if (scenario === 'maintenance-io' && journal.maintenance !== null)
    journal.maintenance.owner = 'changed-owner';
  return new Response(scenario === 'hash' ? 'corruption' : ciphertext, {
    headers: {
      'x-amz-version-id': url.searchParams.get('versionId') ?? '',
      'content-length': String(ciphertext.length),
    },
  });
};
spyOn(globalThis, 'fetch').mockImplementation(
  Object.assign((input: RequestInfo | URL) => invokeRegistryCallback(() => fetchWire(input)), {
    preconnect: () => undefined,
  }),
);
if (
  scenario === 'sdk-count' ||
  scenario === 'sdk-metadata' ||
  scenario.startsWith('snapshot-sdk-')
) {
  // Deliberately broken producer: real SDK bounds are independently tested at the wire.
  const physical = Array.from(
    {
      length:
        scenario === 'snapshot-sdk-count'
          ? 8193
          : scenario === 'snapshot-sdk-bytes'
            ? 2
            : scenario === 'snapshot-sdk-metadata'
              ? 8192
              : scenario === 'sdk-count'
                ? 65537
                : 60000,
    },
    (_, index) => ({
      key: `backups/registry/${isSnapshot ? `snapshots/${'b'.repeat(64)}` : key}`,
      ...(scenario === 'snapshot-sdk-bytes'
        ? { kind: 'object' as const, bytes: Number.MAX_SAFE_INTEGER }
        : { kind: 'delete-marker' as const }),
      versionId: String(index).padStart(
        scenario === 'sdk-metadata' || scenario === 'snapshot-sdk-metadata' ? 1024 : 6,
        'v',
      ),
      visible: index === 0,
    }),
  );
  await mock.module('./registry-s3-census', () => ({
    createRegistryS3Store: () => ({
      census: () =>
        Promise.resolve({
          versions: physical,
          uploads: [],
          payloadBytes: 0,
          accounting: 'payload-only',
        }),
      readVersion: () => Promise.reject(new Error('Unexpected modeled read')),
      deleteVersion: () => Promise.reject(new Error('Unexpected modeled delete')),
    }),
  }));
}
let outcome: unknown;
try {
  if (scenario === 'caller') {
    await mock.module('./registry-maintenance-installation', () => ({
      requireRegistryRecoveryInstallation: () => {
        throw new Error('Unexpected restore');
      },
      verifyRegistryHostArtifact: () => Promise.resolve(Buffer.from(JSON.stringify(configuration))),
    }));
    await mock.module('./registry-backup-store', () => ({ createRegistryBackupStore: () => ({}) }));
    const { executeRegistryBackupAction } = await import('./registry-maintenance-backup');
    const sentinel = new Error('captured caller');
    await assert.rejects(
      executeRegistryBackupAction({
        effects: modelRegistryBackupEffects(),
        action: 'backup-reconcile',
        installed: {
          journalPath: '/installed-journal',
        } as unknown as RegistryMaintenanceInstallation,
        journal,
        descriptor: 19,
        signal: controller.signal,
        lifetime: 'worker',
        admit: () => Promise.reject(new Error('Unexpected admission')),
        openVersions: (_configuration, authority) =>
          invokeRegistryCallback(() => {
            assert.equal(authority.journalPath, '/installed-journal');
            assert.equal(authority.signal, controller.signal);
            assert.equal(authority.journal, journal);
            assert.equal(authority.authorityDescriptor, 19);
            throw sentinel;
          }),
      }),
      (error) => error === sentinel,
    );
    outcome = { caller: true };
  } else {
    const { openRegistryBackupVersions } = await import('./registry-backup-provider');
    let effects = modelRegistryBackupEffects();
    if (durablePath !== undefined) {
      const { openRegistryBackupReservation } = await import('./registry-backup-reservation');
      effects = openRegistryBackupReservation({
        requireLineage: () => Promise.resolve(),
        journalPath,
        authorityDescriptor: 19,
        authorityUid: 59001,
        uid: fixtureUid,
        journalMaximumBytes: 1073741824,
        binding: {
          operationId: 'owned-backup',
          tokenSha256: 'a'.repeat(64),
          registryId: 'fixture',
          storageId: 'fixture',
          repositoryId: configuration.repositoryId,
          configurationSha256: 'b'.repeat(64),
          profileSha256: 'c'.repeat(64),
        },
        attempt: { id: 'e'.repeat(64), revision: 7, action: 'backup-reconcile' },
        signal: controller.signal,
        measure: () =>
          Promise.resolve({
            usableBytes: 1073741824,
            usedBytes: 1024,
            allocationUnitBytes: 4096,
            usedInodes: 10,
            totalInodes: 100000,
          }),
      });
      await effects.bindPhase({ phase: 'inspection' });
      if (scenario === 'durable-missing') await unlink(durablePath);
    }
    const authority = {
      effects,
      journal,
      authorityDescriptor: 19,
      journalPath,
      signal: controller.signal,
    };
    if (scenario === 'journal-absent') Reflect.deleteProperty(authority, 'journalPath');
    if (scenario === 'journal-relative') authority.journalPath = 'relative';
    if (scenario === 'descriptor') authority.authorityDescriptor = -1;
    if (scenario === 'signal-invalid') Object.assign(authority, { signal: {} });
    const store = await openRegistryBackupVersions(configuration, authority);
    if (isSnapshot) {
      if (scenario === 'snapshot-abort') retention.abort();
      const retentionSignal =
        scenario === 'snapshot-signal-invalid'
          ? ({} as AbortSignal)
          : scenario === 'snapshot-signal-absent'
            ? (undefined as unknown as AbortSignal)
            : retention.signal;
      const before = await store.snapshotVersions(retentionSignal);
      outcome = { before };
    } else {
      const before = await store.census();
      if (
        [
          'remove',
          'durable-delete',
          'durable-response-loss',
          'durable-missing',
          'delete-retained',
          'remove-history',
          'remove-marker',
          'remove-forged',
          'remove-changed',
          'remove-abort',
          'remove-lock-before-delete',
          'remove-owner-before-delete',
        ].includes(scenario)
      ) {
        const selected = before.find(
          (candidate) =>
            candidate.versionId ===
            (scenario === 'remove-history'
              ? 'history'
              : scenario === 'remove-marker'
                ? 'marker'
                : 'current'),
        );
        assert(selected);
        if (scenario === 'remove-abort') controller.abort();
        const remove = () =>
          store.removeVersion(
            scenario === 'remove-forged' && selected.kind === 'object'
              ? { ...selected, bytes: 11 }
              : selected,
          );
        if (scenario === 'durable-response-loss') {
          await assert.rejects(remove(), /Registry S3 operation refused: unavailable/);
          assert.equal(requests.filter((request) => request.method === 'DELETE').length, 1);
          assert(durablePath);
          assert.equal(
            (JSON.parse(await readFile(durablePath, 'utf8')) as RegistryBackupReservation)
              .effects[0].state,
            'consumed',
          );
          await remove();
          throw new Error('Spent DELETE unexpectedly replayed');
        }
        await remove();
        if (durablePath !== undefined)
          assert.equal(
            (JSON.parse(await readFile(durablePath, 'utf8')) as RegistryBackupReservation)
              .effects[0].state,
            'terminal',
          );
        outcome = { before, after: await store.census() };
      } else outcome = scenario.startsWith('sdk-') ? { count: before.length } : { before };
    }
  }
  console.log(JSON.stringify({ ok: true, outcome, requests, lockCalls }));
} catch (failure) {
  console.log(
    JSON.stringify({
      ok: false,
      message: failure instanceof Error ? failure.message : 'unknown',
      requests,
      lockCalls,
    }),
  );
} finally {
  if (durableRoot !== undefined) await rm(durableRoot, { recursive: true });
}
