import { rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { captureObjectStoreArchive } from './object-store-archive';
import { readObjectStoreLayerFacts } from './object-store-layer-facts';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown) => Buffer.from(JSON.stringify(value));
interface Entry {
  name: string;
  bytes?: Buffer;
  kind?: string;
  link?: string;
  gnu?: boolean;
  prefix?: string;
}

function tar(entries: readonly Entry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const payload = entry.bytes ?? Buffer.alloc(0);
    const header = Buffer.alloc(512);
    header.write(entry.name);
    header.write('0000600\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(payload.length.toString(8).padStart(11, '0') + '\0', 124);
    header.write('00000000000\0', 136);
    header.fill(32, 148, 156);
    header.write(entry.kind ?? '0', 156);
    header.write(entry.link ?? '', 157);
    header.write(entry.gnu ? 'ustar  \0' : 'ustar\0' + '00', 257);
    header.write(entry.prefix ?? '', 345);
    header.write(
      header
        .reduce((sum, byte) => sum + byte, 0)
        .toString(8)
        .padStart(6, '0') + '\0 ',
      148,
    );
    blocks.push(header, payload, Buffer.alloc((512 - (payload.length % 512)) % 512));
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}

async function prepare(streams: readonly Buffer[], compressed = false) {
  const directory = await scratchAsync('layer-facts-');
  const layers = streams.map((stream) => (compressed ? stream : gzipSync(stream)));
  const config = json({ architecture: 'amd64', os: 'linux' });
  const manifest = json({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: {
      mediaType: 'application/vnd.oci.image.config.v1+json',
      digest: `sha256:${sha(config)}`,
      size: config.length,
    },
    layers: layers.map((layer) => ({
      mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
      digest: `sha256:${sha(layer)}`,
      size: layer.length,
    })),
  });
  const lock = {
    image: 'docker.io/puni-local/object-store:release',
    digest: `sha256:${sha(manifest)}`,
  };
  const index = json({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.index.v1+json',
    manifests: [
      {
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        digest: lock.digest,
        size: manifest.length,
        annotations: {
          'io.containerd.image.name': lock.image,
          'org.opencontainers.image.ref.name': 'release',
        },
        platform: { os: 'linux', architecture: 'amd64' },
      },
    ],
  });
  const bytes = tar([
    { name: 'oci-layout', bytes: json({ imageLayoutVersion: '1.0.0' }) },
    { name: 'index.json', bytes: index },
    ...[config, manifest, ...layers].map((blob) => ({
      name: `blobs/sha256/${sha(blob)}`,
      bytes: blob,
    })),
  ]);
  const source = join(directory, 'source.oci');
  await writeFile(source, bytes);
  const archive = await captureObjectStoreArchive(source, directory, lock);
  return { archive, lock, layers };
}

it('counts complete ordered GNU and ustar layers without snapshot deletion credits', async () => {
  const fixture = await prepare([
    tar([
      { name: './', kind: '5', gnu: true },
      { name: 'bin/', kind: '5', gnu: true },
      { name: 'bin/a', bytes: Buffer.from('abc'), gnu: true },
      { name: 'bin/b', kind: '1', link: 'bin/a', gnu: true },
      { name: 'bin/c', kind: '2', link: '../bin/a', gnu: true },
    ]),
    tar([
      { name: 'bin/a', bytes: Buffer.from('hello') },
      { name: 'bin/.wh.a' },
      { name: 'bin/.wh..wh..opq' },
    ]),
  ]);
  const facts = await readObjectStoreLayerFacts(fixture.archive, fixture.lock);
  expect(facts.archive).toEqual({
    sha256: fixture.archive.sha256,
    size: fixture.archive.size,
    image: fixture.lock.image,
    digest: fixture.lock.digest,
    config: fixture.archive.config,
    platform: 'linux/amd64',
  });
  expect(
    facts.layers.map((layer) => [
      layer.digest,
      layer.compressedBytes,
      layer.decodedBytes,
      layer.logicalFileBytes,
      layer.entries,
    ]),
  ).toEqual([
    [fixture.archive.layers[0]?.digest, fixture.layers[0]?.length, 4096, 3, 5],
    [fixture.archive.layers[1]?.digest, fixture.layers[1]?.length, 3072, 5, 3],
  ]);
  expect(facts.totals).toEqual({
    compressedBytes: fixture.layers.reduce((sum, layer) => sum + layer.length, 0),
    decodedBytes: 7168,
    logicalFileBytes: 8,
    entries: 8,
    regularFiles: 2,
    directories: 2,
    hardlinks: 1,
    symlinks: 1,
    whiteouts: 2,
  });
  expect(facts.unknown).toEqual({
    physicalAllocationBytes: 'unknown',
    inodeMetadataBytes: 'unknown',
    heapBytes: 'unknown',
    importMemoryBytes: 'unknown',
    unpackBytes: 'unknown',
  });
  expect(fixture.archive.unpackBytes).toBe('unknown');
});

for (const field of [
  'size',
  'sha256',
  'config',
  'layers',
  'verificationBufferBytes',
  'metadataBytes',
] as const) {
  it(`refuses forged receipt ${field}`, async () => {
    const fixture = await prepare([
      tar([{ name: 'a', bytes: Buffer.from('a') }]),
      tar([{ name: 'b' }]),
    ]);
    const forged = { ...fixture.archive };
    if (field === 'layers') forged.layers = [...forged.layers].reverse();
    else if (field === 'config') forged.config = `sha256:${'f'.repeat(64)}`;
    else if (field === 'sha256') forged.sha256 = 'f'.repeat(64);
    else forged[field] += 1;
    await rejects(readObjectStoreLayerFacts(forged, fixture.lock), /changed|receipt/);
  });
}

it('refuses changed layer bytes even with a caller-updated whole archive receipt', async () => {
  const fixture = await prepare([tar([{ name: 'a' }])]);
  const bytes = await readFile(fixture.archive.path);
  const offset = bytes.indexOf(fixture.layers[0] ?? Buffer.alloc(0));
  bytes[offset + 12] ^= 1;
  await chmod(fixture.archive.path, 0o600);
  await writeFile(fixture.archive.path, bytes);
  await rejects(
    readObjectStoreLayerFacts({ ...fixture.archive, sha256: sha(bytes) }, fixture.lock),
    /blob identity/,
  );
});

const malformed: readonly [string, () => Buffer, RegExp][] = [
  [
    'tar truncation',
    () => tar([{ name: 'a', bytes: Buffer.from('abc') }]).subarray(0, 1024),
    /incomplete/,
  ],
  ['single end block', () => tar([]).subarray(0, 512), /incomplete/],
  ['nonzero tail', () => Buffer.concat([tar([]), Buffer.alloc(512, 1)]), /terminator/],
  ['partial tail', () => Buffer.concat([tar([]), Buffer.alloc(1)]), /incomplete/],
  [
    'checksum',
    () => {
      const bytes = tar([{ name: 'a' }]);
      bytes[0] ^= 1;
      return bytes;
    },
    /checksum/,
  ],
  [
    'ambiguous header',
    () => {
      const bytes = tar([{ name: 'a' }]);
      bytes[2] = 97;
      repair(bytes);
      return bytes;
    },
    /ambiguous/,
  ],
  [
    'octal',
    () => {
      const bytes = tar([{ name: 'a' }]);
      bytes[124] = 57;
      repair(bytes);
      return bytes;
    },
    /octal/,
  ],
  [
    'dialect',
    () => {
      const bytes = tar([{ name: 'a' }]);
      bytes[257] = 120;
      repair(bytes);
      return bytes;
    },
    /dialect/,
  ],
  [
    'GNU extended metadata',
    () => {
      const bytes = tar([{ name: 'a', gnu: true }]);
      bytes[400] = 1;
      repair(bytes);
      return bytes;
    },
    /extended/,
  ],
  [
    'nonzero padding',
    () => {
      const bytes = tar([{ name: 'a', bytes: Buffer.from('a') }]);
      bytes[513] = 1;
      return bytes;
    },
    /padding/,
  ],
  ['traversal', () => tar([{ name: '../a' }]), /path/],
  ['absolute path', () => tar([{ name: '/a' }]), /path/],
  ['duplicate path', () => tar([{ name: './a' }, { name: 'a' }]), /duplicate/],
  ['symlink escape', () => tar([{ name: 'a', kind: '2', link: '../outside' }]), /link/],
  ['hardlink absent target', () => tar([{ name: 'a', kind: '1', link: 'absent' }]), /hardlink/],
  ['directory payload', () => tar([{ name: 'a/', kind: '5', bytes: Buffer.from('a') }]), /payload/],
  ['regular link metadata', () => tar([{ name: 'a', link: 'b' }]), /link/],
  ['unsupported sparse', () => tar([{ name: 'a', kind: 'S' }]), /type/],
  [
    'unsupported PAX',
    () => tar([{ name: 'PaxHeader/a', kind: 'x', bytes: Buffer.from('10 path=a\n') }]),
    /type/,
  ],
  ['whiteout payload', () => tar([{ name: '.wh.a', bytes: Buffer.from('x') }]), /whiteout/],
  ['ambiguous whiteout', () => tar([{ name: '.wh.' }]), /whiteout/],
  [
    'symlink ancestor',
    () => tar([{ name: 'dir', kind: '2', link: 'target' }, { name: 'dir/a' }]),
    /ancestor/,
  ],
];
function repair(bytes: Buffer) {
  bytes.fill(32, 148, 156);
  bytes.write(
    bytes
      .subarray(0, 512)
      .reduce((sum, byte) => sum + byte, 0)
      .toString(8)
      .padStart(6, '0') + '\0 ',
    148,
  );
}
for (const [name, stream, reason] of malformed) {
  it(`refuses ${name}`, async () => {
    const fixture = await prepare([stream()]);
    await rejects(readObjectStoreLayerFacts(fixture.archive, fixture.lock), reason);
  });
}
for (const fault of ['truncated', 'crc', 'trailing'] as const) {
  it(`refuses gzip ${fault}`, async () => {
    let compressed = gzipSync(tar([{ name: 'a' }]));
    if (fault === 'truncated') compressed = compressed.subarray(0, compressed.length - 4);
    if (fault === 'crc') compressed[compressed.length - 8] ^= 1;
    if (fault === 'trailing') compressed = Buffer.concat([compressed, Buffer.from('junk')]);
    const fixture = await prepare([compressed], true);
    await rejects(readObjectStoreLayerFacts(fixture.archive, fixture.lock));
  });
}

it('refuses bounded decoded expansion before complete output', async () => {
  const fixture = await prepare([tar([{ name: 'a', bytes: Buffer.alloc(4096) }])]);
  await rejects(
    readObjectStoreLayerFacts(fixture.archive, fixture.lock, { decodedLayerBytes: 2048 }),
    /expansion/,
  );
});
it('refuses aggregate expansion across independently bounded layers', async () => {
  const fixture = await prepare([tar([{ name: 'a' }]), tar([{ name: 'b' }])]);
  await rejects(
    readObjectStoreLayerFacts(fixture.archive, fixture.lock, { decodedTotalBytes: 2048 }),
    /expansion/,
  );
});
it('refuses bounded aggregate members', async () => {
  const fixture = await prepare([tar([{ name: 'a' }]), tar([{ name: 'b' }])]);
  await rejects(readObjectStoreLayerFacts(fixture.archive, fixture.lock, { entries: 1 }), /member/);
});
it('refuses expanded declared member size before reading its payload', async () => {
  const bytes = tar([{ name: 'a' }]);
  bytes.write('77777777777\0', 124);
  repair(bytes);
  const fixture = await prepare([bytes]);
  await rejects(readObjectStoreLayerFacts(fixture.archive, fixture.lock), /member size/);
});
it('refuses path bounds and caller-expanded or malformed limits', async () => {
  const fixture = await prepare([tar([{ name: 'longpath' }])]);
  await rejects(readObjectStoreLayerFacts(fixture.archive, fixture.lock, { pathBytes: 2 }), /path/);
  for (const limits of [{ entries: 100001 }, { entries: 0 }, { entries: NaN }, { extra: 1 }]) {
    await rejects(readObjectStoreLayerFacts(fixture.archive, fixture.lock, limits), /limit/);
  }
});

it('binds output to verified identities when the caller edits its receipt during decoding', async () => {
  const fixture = await prepare([tar([{ name: 'a', bytes: Buffer.alloc(70000) }])]);
  const claim = { ...fixture.archive };
  const pending = readObjectStoreLayerFacts(claim, fixture.lock);
  claim.sha256 = 'f'.repeat(64);
  claim.digest = `sha256:${'f'.repeat(64)}`;
  const facts = await pending;
  expect(facts.archive.sha256).toBe(fixture.archive.sha256);
  expect(facts.archive.digest).toBe(fixture.lock.digest);
});

it('refuses malformed receipt schema before opening its claimed path', async () => {
  const fixture = await prepare([tar([{ name: 'a' }])]);
  await rejects(
    readObjectStoreLayerFacts(
      {
        ...fixture.archive,
        path: '/task25c1-absent',
        unpackBytes: 0,
      } as unknown as typeof fixture.archive,
      fixture.lock,
    ),
    /unpackBytes/,
  );
});

it('refuses absent and unreadable retained inputs through the facts reader', async () => {
  const fixture = await prepare([tar([{ name: 'a' }])]);
  await rejects(
    readObjectStoreLayerFacts({ ...fixture.archive, path: '/task25c1-absent' }, fixture.lock),
    /ENOENT/,
  );
  await chmod(fixture.archive.path, 0o000);
  try {
    await rejects(readObjectStoreLayerFacts(fixture.archive, fixture.lock), /EACCES/);
  } finally {
    await chmod(fixture.archive.path, 0o400);
  }
});

it('refuses unsafe symlink text before lexical resolution', async () => {
  const fixture = await prepare([tar([{ name: 'a', kind: '2', link: '/absolute' }])]);
  await rejects(readObjectStoreLayerFacts(fixture.archive, fixture.lock), /unsafe symlink/);
});

it('refuses directory spelling for non-directory types', async () => {
  const fixture = await prepare([tar([{ name: 'a/', kind: '2', link: 'b' }])]);
  await rejects(readObjectStoreLayerFacts(fixture.archive, fixture.lock), /path/);
});

it('refuses a decoder dependency yielding non-byte chunks', async () => {
  const fixture = await prepare([tar([{ name: 'a' }])]);
  const script = `
    const zlib = require('node:zlib');
    const { Transform } = require('node:stream');
    zlib.createGunzip = () => new Transform({ readableObjectMode: true, transform(chunk, encoding, callback) { callback(null, 'not bytes'); } });
    const { readObjectStoreLayerFacts } = await import(${JSON.stringify(join(import.meta.dir, 'object-store-layer-facts.ts'))});
    await readObjectStoreLayerFacts(${JSON.stringify(fixture.archive)}, ${JSON.stringify(fixture.lock)});
  `;
  const execution = Bun.spawnSync([process.execPath, '-e', script]);
  expect(execution.exitCode).not.toBe(0);
  expect(execution.stderr.toString()).toContain('decoder returned non-byte');
});

it('refuses ignored compressed zero padding after gzip termination', async () => {
  const fixture = await prepare(
    [Buffer.concat([gzipSync(tar([{ name: 'a' }])), Buffer.alloc(8)])],
    true,
  );
  await rejects(readObjectStoreLayerFacts(fixture.archive, fixture.lock), /gzip.*consumption/);
});
it('uses POSIX prefix paths and refuses prefix traversal', async () => {
  const fixture = await prepare([
    tar([
      { name: 'a', prefix: 'one' },
      { name: 'a', prefix: 'two' },
    ]),
  ]);
  const facts = await readObjectStoreLayerFacts(fixture.archive, fixture.lock);
  expect(facts.totals.entries).toBe(2);
  const unsafe = await prepare([tar([{ name: 'a', prefix: '../outside' }])]);
  await rejects(readObjectStoreLayerFacts(unsafe.archive, unsafe.lock), /path/);
});
