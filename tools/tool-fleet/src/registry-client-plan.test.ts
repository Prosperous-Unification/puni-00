import { chmod, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { imageConfigType } from './registry-client-layout.fixture';
import { planRegistryClientPulls } from './registry-client-plan';
import { createRegistryClientPlanFixture } from './registry-client-plan.fixture';
import type { RegistryJournal } from './registry-managed-journal';
import { requireRejection } from './registry-rejection.fixture';

const signal = () => new AbortController().signal;
test('physical client plan covers every untagged repository revision and both index platforms', async () => {
  const fixture = await createRegistryClientPlanFixture();
  const amd = await fixture.image('kept/image');
  const arm = await fixture.image('kept/image', { os: 'linux', architecture: 'arm64' });
  const index = await fixture.index('kept/image', [
    { ...amd.descriptor, platform: { os: 'linux', architecture: 'amd64' } },
    { ...arm.descriptor, platform: { os: 'linux', architecture: 'arm64' } },
  ]);
  await fixture.image('another/image');
  Object.defineProperty(fixture.journal, 'consumers', {
    get() {
      throw new Error('root must never inspect consumer readers');
    },
  });
  const plan = await planRegistryClientPulls(fixture.journal, 4096, signal());
  expect(
    plan.pulls
      .map((p) => [
        p.repository,
        p.reference,
        p.selection.digest,
        p.selection.platform.architecture,
      ])
      .sort(),
  ).toEqual(
    [
      ['another/image', amd.descriptor.digest, amd.descriptor.digest, 'amd64'],
      ['kept/image', amd.descriptor.digest, amd.descriptor.digest, 'amd64'],
      ['kept/image', arm.descriptor.digest, arm.descriptor.digest, 'arm64'],
      ['kept/image', index.digest, amd.descriptor.digest, 'amd64'],
      ['kept/image', index.digest, arm.descriptor.digest, 'arm64'],
    ].sort(),
  );
  expect(plan.pulls.every((p) => p.envelope.bytes === 8544256 && p.envelope.inodes === 38)).toBe(
    true,
  );
  expect(plan.binding).toMatchObject({
    journalRevision: 7,
    storageId: 'proof',
    registryPath: fixture.directory,
  });
  expect(plan.binding.censusSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(await planRegistryClientPulls(fixture.journal, 4096, signal())).toEqual(plan);
});
test('empty verified physical registry produces exact empty coverage', async () => {
  const fixture = await createRegistryClientPlanFixture();
  const plan = await planRegistryClientPulls(fixture.journal, 4096, signal());
  expect(plan.pulls).toEqual([]);
  expect(plan.revisions).toEqual([]);
});
for (const field of [
  'missing',
  'os',
  'architecture',
  'variant',
  'os.version',
  'os.features',
] as const)
  test('physical plan refuses index platform ' + field, async () => {
    const fixture = await createRegistryClientPlanFixture();
    const image = await fixture.image('kept', {
      os: 'linux',
      architecture: 'arm64',
      variant: 'v8',
      'os.version': '1.0',
      'os.features': ['one'],
    });
    const platform = {
      os: 'linux',
      architecture: 'arm64',
      variant: 'v8',
      'os.version': '1.0',
      'os.features': ['one'],
    };
    if (field === 'os') platform.os = 'windows';
    if (field === 'architecture') platform.architecture = 'amd64';
    if (field === 'variant') platform.variant = 'v9';
    if (field === 'os.version') platform['os.version'] = '2.0';
    if (field === 'os.features') platform['os.features'] = ['two'];
    await fixture.index('kept', [
      field === 'missing' ? image.descriptor : { ...image.descriptor, platform },
    ]);
    await requireRejection(planRegistryClientPulls(fixture.journal, 4096, signal()));
  });
test('physical plan preserves index-only variant hints when config omits them', async () => {
  const fixture = await createRegistryClientPlanFixture();
  const image = await fixture.image('kept', { os: 'linux', architecture: 'arm64' });
  const index = await fixture.index('kept', [
    { ...image.descriptor, platform: { os: 'linux', architecture: 'arm64', variant: 'v8' } },
  ]);
  const plan = await planRegistryClientPulls(fixture.journal, 4096, signal());
  expect(plan.pulls.find((p) => p.reference === index.digest)?.selection.platform).toEqual({
    os: 'linux',
    architecture: 'arm64',
    variant: 'v8',
  });
});
test('physical plan refuses first-match ambiguity even when features differ', async () => {
  const fixture = await createRegistryClientPlanFixture();
  const one = await fixture.image('kept', {
    os: 'linux',
    architecture: 'amd64',
    features: ['one'],
  });
  const two = await fixture.image('kept', {
    os: 'linux',
    architecture: 'amd64',
    features: ['two'],
  });
  await fixture.index('kept', [
    { ...one.descriptor, platform: { os: 'linux', architecture: 'amd64', features: ['one'] } },
    { ...two.descriptor, platform: { os: 'linux', architecture: 'amd64', features: ['two'] } },
  ]);
  const refused = await requireRejection(planRegistryClientPulls(fixture.journal, 4096, signal()));
  expect(refused.throwCause).toThrow('Ambiguous');
});
test('physical plan requires repository-qualified index child revision', async () => {
  const fixture = await createRegistryClientPlanFixture();
  const image = await fixture.image('other');
  await fixture.index('kept', [
    { ...image.descriptor, platform: { os: 'linux', architecture: 'amd64' } },
  ]);
  const refused = await requireRejection(planRegistryClientPulls(fixture.journal, 4096, signal()));
  expect(refused.throwCause).toThrow('repository revision');
});
for (const fault of [
  'size',
  'media',
  'urls',
  'artifact',
  'missing-config',
  'corrupt-layer',
  'subject',
  'config-platform',
  'rootfs',
] as const)
  test('physical plan refuses ' + fault, async () => {
    const fixture = await createRegistryClientPlanFixture();
    const image = await fixture.image('kept');
    if (fault === 'size')
      await fixture.index('kept', [
        {
          ...image.descriptor,
          size: image.descriptor.size + 1,
          platform: { os: 'linux', architecture: 'amd64' },
        },
      ]);
    if (fault === 'media')
      await fixture.index('kept', [
        {
          ...image.descriptor,
          mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
          platform: { os: 'linux', architecture: 'amd64' },
        },
      ]);
    if (fault === 'urls')
      await fixture.index('kept', [
        {
          ...image.descriptor,
          urls: ['https://example.invalid'],
          platform: { os: 'linux', architecture: 'amd64' },
        },
      ]);
    if (fault === 'artifact')
      await fixture.index('kept', [
        {
          ...image.descriptor,
          artifactType: 'application/vnd.example',
          platform: { os: 'linux', architecture: 'amd64' },
        },
      ]);
    if (fault === 'missing-config') await rm(fixture.blobPath(image.config.digest));
    if (fault === 'corrupt-layer')
      await writeFile(fixture.blobPath(image.layer.digest), Buffer.alloc(image.layer.size));
    if (fault === 'subject')
      await fixture.register('kept', { ...image.manifest, subject: image.config });
    if (fault === 'config-platform' || fault === 'rootfs') {
      const config = await fixture.store(
        JSON.stringify({
          os: 'linux',
          ...(fault === 'rootfs' ? { architecture: 'amd64' } : {}),
          rootfs: { type: 'layers', diff_ids: [] },
        }),
        imageConfigType,
      );
      await fixture.put(
        join(fixture.base, 'repositories/kept/_layers/sha256', config.digest.slice(7), 'link'),
        config.digest,
      );
      await fixture.register('kept', { ...image.manifest, config });
    }
    await requireRejection(planRegistryClientPulls(fixture.journal, 4096, signal()));
  });
test('physical plan recursively covers a selectable nested index without host defaults', async () => {
  const fixture = await createRegistryClientPlanFixture();
  const image = await fixture.image('kept');
  const platform = { os: 'linux', architecture: 'amd64' };
  const child = await fixture.index('kept', [{ ...image.descriptor, platform }]);
  const root = await fixture.index('kept', [{ ...child, platform }]);
  const plan = await planRegistryClientPulls(fixture.journal, 4096, signal());
  expect(plan.pulls.map((p) => p.reference).sort()).toEqual(
    [image.descriptor.digest, child.digest, root.digest].sort(),
  );
});
for (const allocation of [0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER])
  test('physical plan refuses unsafe scratch allocation ' + String(allocation), async () => {
    const fixture = await createRegistryClientPlanFixture();
    await fixture.image('kept');
    await requireRejection(planRegistryClientPulls(fixture.journal, allocation, signal()));
  });
test('physical plan rejects an unreadable storage tree', async () => {
  const fixture = await createRegistryClientPlanFixture();
  await fixture.image('kept');
  await chmod(fixture.base, 0);
  try {
    await requireRejection(planRegistryClientPulls(fixture.journal, 4096, signal()));
  } finally {
    await chmod(fixture.base, 0o700);
  }
});
test('physical plan retains the exact cancellation reason before touching absent storage', async () => {
  const fixture = await createRegistryClientPlanFixture();
  await rm(fixture.base, { recursive: true });
  const controller = new AbortController();
  const cause = new Error('owned-plan-cancellation');
  controller.abort(cause);
  expect(
    (await requireRejection(planRegistryClientPulls(fixture.journal, 4096, controller.signal)))
      .cause,
  ).toBe(cause);
});

test('physical plan checks the final outer selector against every nested index', async () => {
  const fixture = await createRegistryClientPlanFixture();
  const image = await fixture.image('kept', { os: 'linux', architecture: 'arm64' });
  const inner = await fixture.index('kept', [
    { ...image.descriptor, platform: { os: 'linux', architecture: 'arm64' } },
  ]);
  await fixture.index('kept', [
    { ...inner, platform: { os: 'linux', architecture: 'arm64', variant: 'v8' } },
  ]);
  const refused = await requireRejection(planRegistryClientPulls(fixture.journal, 4096, signal()));
  expect(refused.throwCause).toThrow('selectable');
});

test('physical plan rejects owned staging before opening its unreadable body', async () => {
  const fixture = await createRegistryClientPlanFixture();
  const uuid = '00000000-0000-4000-8000-000000000001',
    digest = 'sha256:' + 'a'.repeat(64);
  const upload = join(fixture.base, 'repositories/kept/_uploads', uuid);
  await fixture.put(join(upload, 'data'), Buffer.alloc(1024 ** 2));
  await chmod(join(upload, 'data'), 0);
  await fixture.put(join(upload, 'startedat'), '2026-10-31T00:00:00Z');
  const state = Buffer.alloc(108);
  state.write('sha', 0);
  state[3] = 3;
  await fixture.put(join(upload, 'hashstates/sha256/0'), state);
  const journal: RegistryJournal = {
    ...fixture.journal,
    schemaVersion: 4,
    maintenanceEvidence: null,
    lastVerifiedBackup: null,
    retirements: [],
    publicationEvidence: [
      {
        operationId: 'owned-upload',
        declaredAt: '2026-10-31T00:00:00.000Z',
        contents: [
          {
            repository: 'kept',
            digest,
            size: 1024 ** 2,
            mediaType: 'application/vnd.oci.image.layer.v1.tar',
            isManifest: false,
            dependencies: [],
          },
        ],
        writes: [
          {
            repository: 'kept',
            digest,
            uploadId: uuid,
            phase: 'writing',
            at: '2026-10-31T00:00:00.000Z',
          },
        ],
      },
    ],
  };
  try {
    const refused = await requireRejection(planRegistryClientPulls(journal, 4096, signal()));
    expect(refused.throwCause).toThrow('upload-free retained storage');
  } finally {
    await chmod(join(upload, 'data'), 0o600);
  }
});

test('physical client plan refuses a changed census during bounded metadata reads', async () => {
  const fixture = await createRegistryClientPlanFixture();
  const image = await fixture.image('kept');
  const filesystem = await import('node:fs/promises');
  const { spyOn } = await import('bun:test');
  const actualOpen = filesystem.open;
  let opened = 0;
  const observed = spyOn(filesystem, 'open').mockImplementation(async (...parameters) => {
    const descriptor = await actualOpen(...parameters);
    if (parameters[0] === fixture.blobPath(image.descriptor.digest)) {
      opened++;
      if (opened === 2)
        await fixture.store('new physical orphan', 'application/vnd.oci.image.layer.v1.tar');
    }
    return descriptor;
  });
  try {
    const refused = await requireRejection(
      planRegistryClientPulls(fixture.journal, 4096, signal()),
    );
    expect(refused.throwCause).toThrow('census changed');
  } finally {
    observed.mockRestore();
  }
});

test('physical plan refuses one stored digest declared as both config and layer', async () => {
  const fixture = await createRegistryClientPlanFixture();
  const image = await fixture.image('kept');
  await fixture.register('kept', {
    ...image.manifest,
    layers: [{ ...image.config, mediaType: 'application/vnd.oci.image.layer.v1.tar' }],
  });
  const refused = await requireRejection(planRegistryClientPulls(fixture.journal, 4096, signal()));
  expect(refused.throwCause).toThrow('descriptor media type');
});
for (const fault of ['utf8', 'maximum'] as const)
  test('physical metadata refuses ' + fault + ' before platform acknowledgment', async () => {
    const fixture = await createRegistryClientPlanFixture();
    const image = await fixture.image('kept');
    const bytes = Buffer.from(
      JSON.stringify({
        os: 'linux',
        architecture: 'amd64',
        rootfs: { type: 'layers', diff_ids: ['sha256:' + 'b'.repeat(64)] },
        comment: fault === 'utf8' ? 'x' : 'x'.repeat(4 * 1024 ** 2),
      }),
    );
    if (fault === 'utf8') bytes[bytes.lastIndexOf('x')] = 255;
    const config = await fixture.store(bytes, 'application/vnd.oci.image.config.v1+json');
    await fixture.put(
      join(fixture.base, 'repositories/kept/_layers/sha256', config.digest.slice(7), 'link'),
      config.digest,
    );
    await fixture.register('kept', { ...image.manifest, config });
    await requireRejection(planRegistryClientPulls(fixture.journal, 4096, signal()));
  });

test('physical plan rejects first-match ambiguity between omitted and declared variants', async () => {
  const fixture = await createRegistryClientPlanFixture();
  const one = await fixture.image('kept');
  const two = await fixture.image('kept', {
    os: 'linux',
    architecture: 'amd64',
    created: '2026-10-31T00:00:00Z',
  });
  await fixture.index('kept', [
    { ...one.descriptor, platform: { os: 'linux', architecture: 'amd64' } },
    { ...two.descriptor, platform: { os: 'linux', architecture: 'amd64', variant: 'v8' } },
  ]);
  const refused = await requireRejection(planRegistryClientPulls(fixture.journal, 4096, signal()));
  expect(refused.throwCause).toThrow('Ambiguous');
});
