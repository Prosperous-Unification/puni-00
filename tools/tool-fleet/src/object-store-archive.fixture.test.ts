import { createHash } from 'node:crypto';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown) => Buffer.from(JSON.stringify(value));
const image = 'docker.io/puni-local/object-store:release';
const manifestType = 'application/vnd.oci.image.manifest.v1+json';
const configType = 'application/vnd.oci.image.config.v1+json';
const layerType = 'application/vnd.oci.image.layer.v1.tar+gzip';

function tar(entries: readonly { name: string; bytes: Buffer; kind?: string }[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512);
    header.write(entry.name);
    header.write('0000600\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(entry.bytes.length.toString(8).padStart(11, '0') + '\0', 124);
    header.write('00000000000\0', 136);
    header.fill(32, 148, 156);
    header.write(entry.kind ?? '0', 156);
    header.write('ustar\0' + '00', 257);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(header, entry.bytes, Buffer.alloc((512 - (entry.bytes.length % 512)) % 512));
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}

export function archiveFixture(fault = '') {
  const layer = Buffer.from('locked compressed layer');
  const config = json({
    architecture: fault === 'config-platform' ? 'arm64' : 'amd64',
    os: 'linux',
    config: { User: '1000' },
    ...(fault === 'metadata' ? { padding: 'a'.repeat(1024 * 1024) } : {}),
  });
  const manifest = Buffer.from(
    JSON.stringify(
      {
        schemaVersion: 2,
        mediaType: fault === 'manifest-media' ? 'foreign' : manifestType,
        config: {
          mediaType: fault === 'config-media' ? 'foreign' : configType,
          digest: `sha256:${sha(config)}`,
          size: config.length + (fault === 'config-size' ? 1 : 0),
        },
        layers:
          fault === 'manifest-shape'
            ? []
            : [
                {
                  mediaType: fault === 'layer-media' ? 'foreign' : layerType,
                  digest: `sha256:${sha(layer)}`,
                  size: layer.length + (fault === 'layer-size' ? 1 : 0),
                },
              ],
      },
      null,
      2,
    ),
  );
  const lock = { image, digest: `sha256:${sha(manifest)}` };
  const entries = [
    { name: 'blobs/', bytes: Buffer.alloc(0), kind: '5' },
    { name: 'blobs/sha256/', bytes: Buffer.alloc(0), kind: '5' },
    {
      name: `blobs/sha256/${sha(config)}`,
      bytes: fault === 'config' ? Buffer.from(config.toString().replace('1000', '1001')) : config,
    },
    {
      name: `blobs/sha256/${sha(layer)}`,
      bytes: fault === 'layer' ? Buffer.alloc(layer.length, 33) : layer,
    },
    {
      name: `blobs/sha256/${sha(manifest)}`,
      bytes:
        fault === 'manifest'
          ? Buffer.concat([manifest.subarray(0, 1), Buffer.from([32]), manifest.subarray(2)])
          : manifest,
    },
    {
      name: 'index.json',
      bytes: json({
        schemaVersion: 2,
        mediaType: fault === 'index-media' ? 'foreign' : 'application/vnd.oci.image.index.v1+json',
        manifests: [
          {
            mediaType: fault === 'descriptor-media' ? 'foreign' : manifestType,
            digest: fault === 'pin' ? `sha256:${'a'.repeat(64)}` : lock.digest,
            size: manifest.length + (fault === 'size' ? 1 : 0),
            annotations: {
              'io.containerd.image.name':
                fault === 'reference' ? 'docker.io/foreign:release' : image,
              'org.opencontainers.image.ref.name': 'release',
              'org.opencontainers.image.created': 'created',
            },
            platform: { os: 'linux', architecture: fault === 'platform' ? 'arm64' : 'amd64' },
          },
        ],
      }),
    },
    {
      name: 'manifest.json',
      bytes: json([
        {
          Config: `blobs/sha256/${sha(config)}`,
          RepoTags: [
            fault === 'docker-reference' ? 'foreign:release' : 'puni-local/object-store:release',
          ],
          Layers:
            fault === 'manifest-shape'
              ? []
              : [fault === 'docker-layer' ? 'blobs/sha256/foreign' : `blobs/sha256/${sha(layer)}`],
        },
      ]),
    },
    { name: 'oci-layout', bytes: json({ imageLayoutVersion: '1.0.0' }) },
  ];
  if (fault === 'index-json')
    entries[5].bytes = Buffer.concat([entries[5].bytes, Buffer.from('x')]);
  if (fault === 'index-utf8') {
    const marker = Buffer.from('"org.opencontainers.image.created":"created"');
    entries[5].bytes[entries[5].bytes.indexOf(marker) + marker.length - 8] = 255;
  }
  if (fault === 'manifest-shape') entries.splice(3, 1);
  if (fault === 'index-multiple') {
    const index = JSON.parse(entries[5].bytes.toString()) as { manifests: unknown[] };
    index.manifests.push(index.manifests[0]);
    entries[5].bytes = json(index);
  }
  if (fault === 'docker-multiple') {
    const compatibility = JSON.parse(entries[6].bytes.toString()) as unknown[];
    compatibility.push(compatibility[0]);
    entries[6].bytes = json(compatibility);
  }
  if (fault === 'duplicate') entries.push(entries[5]);
  if (fault === 'unsafe') entries.push({ name: '../escape', bytes: Buffer.alloc(0) });
  if (fault === 'symlink') entries[2].kind = '2';
  if (fault === 'directory-type') entries[0].kind = '0';
  if (fault === 'unreferenced')
    entries.push({ name: `blobs/sha256/${'9'.repeat(64)}`, bytes: Buffer.from('unreferenced') });
  if (fault.startsWith('missing-')) {
    const names: Record<string, string> = {
      'missing-index': 'index.json',
      'missing-config': `blobs/sha256/${sha(config)}`,
      'missing-layer': `blobs/sha256/${sha(layer)}`,
      'missing-layout': 'oci-layout',
    };
    entries.splice(
      entries.findIndex((entry) => entry.name === names[fault]),
      1,
    );
  }
  if (fault === 'extra') entries.push({ name: 'repositories', bytes: json({ foreign: true }) });
  if (fault === 'many')
    for (let count = 0; count < 32; count++)
      entries.push({
        name: `blobs/sha256/${count.toString(16).padStart(64, '0')}`,
        bytes: Buffer.alloc(0),
      });
  const bytes = tar(entries);
  if (fault === 'checksum') bytes[148] = 55;
  if (fault === 'padding') bytes[1536 + config.length] = 1;
  if (
    [
      'octal',
      'header-prefix',
      'header-linkname',
      'header-magic',
      'ambiguous-name',
      'ascii-path',
      'member-bounds',
    ].includes(fault)
  ) {
    if (fault === 'octal') bytes[124] = 57;
    if (fault === 'header-prefix') bytes.write('outside', 345);
    if (fault === 'header-linkname') bytes.write('target', 157);
    if (fault === 'header-magic') bytes.write('other', 257);
    if (fault === 'ambiguous-name') bytes.write('hidden', 6);
    if (fault === 'ascii-path') bytes[0] = 226;
    if (fault === 'member-bounds') {
      bytes.write('77777777777\0', 124);
      bytes[156] = 48;
    }
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
  if (fault === 'terminator') bytes.fill(1, bytes.length - 512);
  if (fault === 'truncated') return { bytes: bytes.subarray(0, bytes.length - 1024), lock };
  return { bytes: fault === 'json' ? Buffer.from('not a tar archive') : bytes, lock };
}
