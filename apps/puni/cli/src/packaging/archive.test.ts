import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { expect, it } from 'bun:test';

import { admitArchiveMembers } from './archive';

interface ArchiveMember {
  readonly path: string;
  readonly kind: 'file' | 'directory';
  readonly bytes: Uint8Array;
  readonly paxPath?: string;
  readonly prefix?: string;
}
const packageMetadata = '{"name":"raw-archive-control"}\n';
const packageMain = 'export const marker = "raw-archive-control";\n';
const collision = 'PUNI tar file and directory paths collide';

function createFile(
  path: string,
  contents: string | Uint8Array = 'member\n',
  paxPath?: string,
): ArchiveMember {
  return {
    path,
    kind: 'file',
    bytes: typeof contents === 'string' ? Buffer.from(contents) : contents,
    ...(paxPath === undefined ? {} : { paxPath }),
  };
}
function createDirectory(path: string, paxPath?: string): ArchiveMember {
  return {
    path,
    kind: 'directory',
    bytes: Buffer.alloc(0),
    ...(paxPath === undefined ? {} : { paxPath }),
  };
}
/** Independent ustar writer retains physical names/order; local PAX length is encoded in bytes. */
function createArchive(members: readonly ArchiveMember[]): Uint8Array {
  const blocks: Uint8Array[] = [];
  function appendMember(path: string, kind: '0' | '5' | 'x', bytes: Uint8Array, prefix = ''): void {
    const header = Buffer.alloc(512);
    function writeField(offset: number, width: number, text: string): void {
      const encoded = Buffer.from(text);
      if (encoded.length > width)
        throw new Error('independent tar fixture field exceeds its declared width');
      header.set(encoded, offset);
    }
    writeField(0, 100, path);
    writeField(100, 8, kind === '5' ? '0000755\0' : '0000644\0');
    writeField(108, 8, '0000000\0');
    writeField(116, 8, '0000000\0');
    writeField(124, 12, bytes.byteLength.toString(8).padStart(11, '0') + '\0');
    writeField(136, 12, '00000000000\0');
    header.fill(32, 148, 156);
    header[156] = kind.charCodeAt(0);
    writeField(257, 6, 'ustar\0');
    writeField(263, 2, '00');
    writeField(345, 155, prefix);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeField(148, 8, checksum.toString(8).padStart(6, '0') + '\0 ');
    blocks.push(header, bytes, Buffer.alloc((512 - (bytes.byteLength % 512)) % 512));
  }
  function createPaxPath(path: string): Uint8Array {
    const field = 'path=' + path + '\n';
    let length = Buffer.byteLength(field) + 2;
    for (let attempt = 0; attempt < 10; attempt++) {
      const encoded = Buffer.from(String(length) + ' ' + field);
      if (encoded.length === length) return encoded;
      length = encoded.length;
    }
    throw new Error('independent PAX fixture length did not converge');
  }
  const complete = [
    createFile('package/package.json', packageMetadata),
    createFile('package/dist/puni.mjs', packageMain),
    ...members,
  ];
  for (const [index, member] of complete.entries()) {
    if (
      member.kind === 'directory' &&
      (member.bytes.byteLength !== 0 || !member.path.endsWith('/'))
    )
      throw new Error('independent directory fixture must have a slash and empty body');
    if (member.paxPath !== undefined)
      appendMember(
        'package/PaxHeaders/' + String(index).padStart(5, '0'),
        'x',
        createPaxPath(member.paxPath),
      );
    appendMember(member.path, member.kind === 'directory' ? '5' : '0', member.bytes, member.prefix);
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks), { level: 1 });
}
async function readMember(files: ReadonlyMap<string, File>, name: string): Promise<Buffer> {
  const member = files.get(name);
  if (member === undefined)
    throw new Error('actual Bun archive omitted declared fixture member: ' + name);
  return Buffer.from(await member.arrayBuffer());
}
async function requireHealthyArchive(): Promise<void> {
  const archive = createArchive([]);
  expect(() => {
    admitArchiveMembers(archive);
  }).not.toThrow();
  const files = await new Bun.Archive(archive).files();
  expect([...files.keys()].sort()).toEqual(['package/dist/puni.mjs', 'package/package.json']);
  expect((await readMember(files, 'package/package.json')).toString()).toBe(packageMetadata);
  expect((await readMember(files, 'package/dist/puni.mjs')).toString()).toBe(packageMain);
}
async function requireAcceptedMembers(
  members: readonly ArchiveMember[],
  expectedPaths: readonly string[],
): Promise<void> {
  await requireHealthyArchive();
  const archive = createArchive(members);
  expect(() => {
    admitArchiveMembers(archive);
  }).not.toThrow();
  const files = await new Bun.Archive(archive).files();
  expect([...files.keys()].sort()).toEqual(
    ['package/package.json', 'package/dist/puni.mjs', ...expectedPaths].sort(),
  );
}

it('raw archive refuses an earlier effective file followed by a descendant file', async () => {
  await requireHealthyArchive();
  const archive = createArchive([createFile('package/a'), createFile('package/a/b')]);
  expect(() => {
    admitArchiveMembers(archive);
  }).toThrow(collision);
});
it('raw archive refuses an earlier effective file followed by a descendant directory', async () => {
  await requireHealthyArchive();
  const archive = createArchive([createFile('package/a'), createDirectory('package/a/b/')]);
  expect(() => {
    admitArchiveMembers(archive);
  }).toThrow(collision);
});
it('raw archive refuses a later effective file above an earlier descendant file', async () => {
  await requireHealthyArchive();
  const archive = createArchive([createFile('package/a/b'), createFile('package/a')]);
  expect(() => {
    admitArchiveMembers(archive);
  }).toThrow(collision);
});
it('raw archive refuses a later effective file above an earlier descendant directory', async () => {
  await requireHealthyArchive();
  const archive = createArchive([createDirectory('package/a/b/'), createFile('package/a')]);
  expect(() => {
    admitArchiveMembers(archive);
  }).toThrow(collision);
});
it('raw archive admits an explicit directory after its descendants', async () => {
  await requireAcceptedMembers(
    [createFile('package/a/b'), createDirectory('package/a/')],
    ['package/a/b'],
  );
});
it('raw archive admits an explicit directory before its descendants', async () => {
  await requireAcceptedMembers(
    [createDirectory('package/a/'), createFile('package/a/b')],
    ['package/a/b'],
  );
});
it('raw archive admits neighboring segments with an earlier short file', async () => {
  await requireAcceptedMembers(
    [createFile('package/a'), createFile('package/ab/b')],
    ['package/a', 'package/ab/b'],
  );
});
it('raw archive admits neighboring segments with a later short file', async () => {
  await requireAcceptedMembers(
    [createFile('package/ab/b'), createFile('package/a')],
    ['package/a', 'package/ab/b'],
  );
});
it('raw archive refuses repeated physical PAX paths with distinct effective names', async () => {
  await requireHealthyArchive();
  const archive = createArchive([
    createFile('package/physical', 'first', 'package/selected-a'),
    createFile('package/physical', 'second', 'package/selected-b'),
  ]);
  expect(() => {
    admitArchiveMembers(archive);
  }).toThrow('PUNI tar member is duplicated');
});
it('raw archive refuses distinct physical PAX paths with the same effective name', async () => {
  await requireHealthyArchive();
  const archive = createArchive([
    createFile('package/raw-one', 'first', 'package/selected'),
    createFile('package/raw-two', 'second', 'package/selected'),
  ]);
  expect(() => {
    admitArchiveMembers(archive);
  }).toThrow('PUNI tar member is duplicated');
});
it('raw archive refuses a PAX-selected file before a PAX-selected descendant', async () => {
  await requireHealthyArchive();
  const archive = createArchive([
    createFile('package/raw-one', 'first', 'package/selected'),
    createFile('package/raw-two', 'second', 'package/selected/child'),
  ]);
  expect(() => {
    admitArchiveMembers(archive);
  }).toThrow(collision);
});
it('raw archive refuses a PAX-selected file after its PAX-selected descendant', async () => {
  await requireHealthyArchive();
  const archive = createArchive([
    createFile('package/raw-one', 'first', 'package/selected/child'),
    createFile('package/raw-two', 'second', 'package/selected'),
  ]);
  expect(() => {
    admitArchiveMembers(archive);
  }).toThrow(collision);
});
it('raw archive admits physical prefix collisions with unrelated PAX effective names', async () => {
  await requireAcceptedMembers(
    [
      createFile('package/physical', 'first', 'package/left'),
      createFile('package/physical/child', 'second', 'package/right'),
    ],
    ['package/left', 'package/right'],
  );
});
it('raw archive admits reverse physical prefix collisions with unrelated PAX effective names', async () => {
  await requireAcceptedMembers(
    [
      createFile('package/physical/child', 'first', 'package/left'),
      createFile('package/physical', 'second', 'package/right'),
    ],
    ['package/left', 'package/right'],
  );
});
it('raw archive admits an explicit PAX directory after its selected descendants', async () => {
  await requireAcceptedMembers(
    [
      createFile('package/raw-child', 'first', 'package/selected/child'),
      createDirectory('package/raw-directory/', 'package/selected/'),
    ],
    ['package/selected/child'],
  );
});

for (const count of [4096, 16384] as const)
  it(
    'raw archive decodes every member of a deterministic ' + String(count) + '-file package',
    async () => {
      await requireHealthyArchive();
      const members: ArchiveMember[] = [],
        expectedNames = ['package/package.json', 'package/dist/puni.mjs'];
      for (let index = 0; index < count; index++) {
        const path =
          'package/content/group-' +
          String(index % 16).padStart(2, '0') +
          '/owned-' +
          String(index).padStart(5, '0') +
          '-long-sibling-payload.bin';
        const payload = Buffer.concat([
          Buffer.from('owned-' + String(index) + '\n'),
          Buffer.from([0, 128, 255]),
        ]);
        members.push(createFile(path, payload));
        expectedNames.push(path);
      }
      // These explicit directories deliberately follow their children; implicit trie nodes are not admitted members.
      for (let group = 0; group < 16; group++)
        members.push(
          createDirectory('package/content/group-' + String(group).padStart(2, '0') + '/'),
        );
      members.push(
        createDirectory('package/content/'),
        createDirectory('package/dist/'),
        createDirectory('package/'),
      );
      const archive = createArchive(members);
      const gzipSha256 = createHash('sha256').update(archive).digest('hex');
      console.log(
        JSON.stringify({
          archiveControl: count,
          gzipSha256,
          gzipBytes: archive.byteLength,
          declaredRegularMembers: count + 2,
        }),
      );
      const admissionStart = performance.now();
      expect(() => {
        admitArchiveMembers(archive);
      }).not.toThrow();
      const rawAdmissionMs = performance.now() - admissionStart;
      const decoderStart = performance.now();
      const files = await new Bun.Archive(archive).files();
      const archiveFilesMs = performance.now() - decoderStart;
      expect(files.size).toBe(count + 2);
      expect([...files.keys()].sort()).toEqual(expectedNames.sort());
      const samples: readonly (readonly [string, string])[] =
        count === 4096
          ? [
              ['package/content/group-00/owned-00000-long-sibling-payload.bin', 'owned-0\n'],
              ['package/content/group-00/owned-02048-long-sibling-payload.bin', 'owned-2048\n'],
              ['package/content/group-15/owned-04095-long-sibling-payload.bin', 'owned-4095\n'],
            ]
          : [
              ['package/content/group-00/owned-00000-long-sibling-payload.bin', 'owned-0\n'],
              ['package/content/group-00/owned-08192-long-sibling-payload.bin', 'owned-8192\n'],
              ['package/content/group-15/owned-16383-long-sibling-payload.bin', 'owned-16383\n'],
            ];
      for (const [path, text] of samples) {
        const expectedPayload = Buffer.concat([Buffer.from(text), Buffer.from([0, 128, 255])]);
        expect((await readMember(files, path)).toString('hex')).toBe(
          expectedPayload.toString('hex'),
        );
      }
      expect((await readMember(files, 'package/package.json')).toString()).toBe(packageMetadata);
      expect((await readMember(files, 'package/dist/puni.mjs')).toString()).toBe(packageMain);
      console.log(
        JSON.stringify({
          archiveControl: count,
          gzipSha256,
          regularMembers: files.size,
          rawAdmissionMs,
          archiveFilesMs,
        }),
      );
    },
    60000,
  );

/** Effective paths and physical fields reproduce the retained Bun1.4.4 package's first collisions.
 * Literal payloads independently distinguish decoder identity; they do not copy dependency code. */
const requiredPaxPair = [
  {
    name: 'exporter-logs-otlp-proto/node_modules/@opentelemetry/convert-legacy-browser-http-options.d.ts',
    prefix:
      'package/dist/toolkit/trusted-node-modules/@elysiajs/opentelemetry/node_modules/@opentelemetry/sdk-node/node_modules/@opentelemetry',
    selected:
      'package/dist/toolkit/trusted-node-modules/@elysiajs/opentelemetry/node_modules/@opentelemetry/sdk-node/node_modules/@opentelemetry/exporter-logs-otlp-proto/node_modules/@opentelemetry/otlp-exporter-base/build/esm/configuration/convert-legacy-browser-http-options.d.ts',
  },
  {
    name: 'exporter-logs-otlp-proto/node_modules/@opentelemetry/convert-legacy-browser-http-options.d.ts',
    prefix:
      'package/dist/toolkit/trusted-node-modules/@elysiajs/opentelemetry/node_modules/@opentelemetry/sdk-node/node_modules/@opentelemetry',
    selected:
      'package/dist/toolkit/trusted-node-modules/@elysiajs/opentelemetry/node_modules/@opentelemetry/sdk-node/node_modules/@opentelemetry/exporter-logs-otlp-proto/node_modules/@opentelemetry/otlp-exporter-base/build/esnext/configuration/convert-legacy-browser-http-options.d.ts',
  },
] as const;
const mixedPaxPair = [
  {
    name: 'exporter-metrics-otlp-grpc/node_modules/@opentelemetry/otlp-transformer/build/esm/logs/index.d.ts',
    prefix:
      'package/dist/toolkit/trusted-node-modules/@elysiajs/opentelemetry/node_modules/@opentelemetry/sdk-node/node_modules/@opentelemetry',
    selected:
      'package/dist/toolkit/trusted-node-modules/@elysiajs/opentelemetry/node_modules/@opentelemetry/sdk-node/node_modules/@opentelemetry/exporter-metrics-otlp-grpc/node_modules/@opentelemetry/otlp-transformer/build/esm/logs/index.d.ts',
  },
  {
    name: 'exporter-metrics-otlp-grpc/node_modules/@opentelemetry/otlp-transformer/build/esm/logs/index.d.ts',
    prefix:
      'package/dist/toolkit/trusted-node-modules/@elysiajs/opentelemetry/node_modules/@opentelemetry/sdk-node/node_modules/@opentelemetry',
    selected:
      'package/dist/toolkit/trusted-node-modules/@elysiajs/opentelemetry/node_modules/@opentelemetry/sdk-node/node_modules/@opentelemetry/exporter-metrics-otlp-grpc/node_modules/@opentelemetry/otlp-transformer/build/esm/logs/json/index.d.ts',
  },
] as const;

/** Decode exact declared names/payloads before the raw admission oracle, without normalizing headers. */
async function requirePaxFallbackArchive(members: readonly ArchiveMember[]): Promise<void> {
  await requireHealthyArchive();
  const archive = createArchive(members);
  const files = await new Bun.Archive(archive).files();
  expect([...files.keys()].sort()).toEqual(
    [
      'package/package.json',
      'package/dist/puni.mjs',
      ...members.map(
        (member) =>
          member.paxPath ??
          (member.prefix === undefined || member.prefix === ''
            ? member.path
            : member.prefix + '/' + member.path),
      ),
    ].sort(),
  );
  for (const member of members) {
    const selected =
      member.paxPath ??
      (member.prefix === undefined || member.prefix === ''
        ? member.path
        : member.prefix + '/' + member.path);
    expect((await readMember(files, selected)).toString('hex')).toBe(
      Buffer.from(member.bytes).toString('hex'),
    );
  }
  expect(() => {
    admitArchiveMembers(archive);
  }).not.toThrow();
}

for (const reversed of [false, true]) {
  it(
    'raw archive admits required long PAX fallbacks in ' +
      (reversed ? 'reverse' : 'native') +
      ' order',
    async () => {
      const members = requiredPaxPair.map((entry, index) => ({
        ...createFile(entry.name, 'required-pax-' + String(index), entry.selected),
        prefix: entry.prefix,
      }));
      await requirePaxFallbackArchive(reversed ? members.toReversed() : members);
    },
  );
  it(
    'raw archive admits a required long PAX fallback beside its ordinary header path in ' +
      (reversed ? 'reverse' : 'native') +
      ' order',
    async () => {
      const ordinary = mixedPaxPair[0],
        fallback = mixedPaxPair[1];
      const members = [
        { ...createFile(ordinary.name, 'ordinary-header'), prefix: ordinary.prefix },
        {
          ...createFile(fallback.name, 'required-pax', fallback.selected),
          prefix: fallback.prefix,
        },
      ];
      await requirePaxFallbackArchive(reversed ? members.toReversed() : members);
    },
  );
}

for (const [label, name, extended] of [
  ['ASCII', 'n'.repeat(100), 'n'.repeat(101)],
  ['UTF8', 'é'.repeat(50), 'é'.repeat(51)],
] as const) {
  const prefix = 'package/' + 'p'.repeat(147);
  for (const reversed of [false, true])
    it(
      'raw archive owns the 155-byte prefix and 100-byte ' +
        label +
        ' name boundary in ' +
        (reversed ? 'reverse' : 'native') +
        ' order',
      async () => {
        expect(Buffer.byteLength(prefix)).toBe(155);
        expect(Buffer.byteLength(name)).toBe(100);
        expect(Buffer.byteLength(extended)).toBeGreaterThan(100);
        const members = [
          { ...createFile(name, 'boundary-ordinary'), prefix },
          { ...createFile(name, 'boundary-pax', prefix + '/' + extended), prefix },
        ];
        await requirePaxFallbackArchive(reversed ? members.toReversed() : members);
      },
    );
  it(
    'raw archive still refuses repeated physical PAX aliases representable at the ' +
      label +
      ' USTAR boundary',
    async () => {
      await requireHealthyArchive();
      const archive = createArchive([
        createFile('package/physical-boundary', 'first', prefix + '/' + name),
        createFile('package/physical-boundary', 'second', prefix + '/' + name.slice(0, -1) + 'q'),
      ]);
      expect(() => {
        admitArchiveMembers(archive);
      }).toThrow('PUNI tar member is duplicated');
    },
  );
}

it('raw archive refuses two ordinary identities separated by a required long PAX placeholder', async () => {
  await requireHealthyArchive();
  const ordinary = mixedPaxPair[0],
    fallback = mixedPaxPair[1];
  const archive = createArchive([
    { ...createFile(ordinary.name, 'first'), prefix: ordinary.prefix },
    { ...createFile(fallback.name, 'placeholder', fallback.selected), prefix: fallback.prefix },
    { ...createFile(ordinary.name, 'second'), prefix: ordinary.prefix },
  ]);
  expect(() => {
    admitArchiveMembers(archive);
  }).toThrow('PUNI tar member is duplicated');
});

it('raw archive remembers short PAX physical identities across a long placeholder', async () => {
  await requireHealthyArchive();
  const ordinary = mixedPaxPair[0],
    fallback = mixedPaxPair[1];
  const archive = createArchive([
    { ...createFile(ordinary.name, 'first', 'package/short-first'), prefix: ordinary.prefix },
    { ...createFile(fallback.name, 'placeholder', fallback.selected), prefix: fallback.prefix },
    { ...createFile(ordinary.name, 'second', 'package/short-second'), prefix: ordinary.prefix },
  ]);
  const files = await new Bun.Archive(archive).files();
  expect([...files.keys()].sort()).toEqual(
    [
      'package/package.json',
      'package/dist/puni.mjs',
      'package/short-first',
      fallback.selected,
      'package/short-second',
    ].sort(),
  );
  expect((await readMember(files, 'package/short-first')).toString()).toBe('first');
  expect((await readMember(files, 'package/short-second')).toString()).toBe('second');
  expect(() => {
    admitArchiveMembers(archive);
  }).toThrow('PUNI tar member is duplicated');
});

it('raw archive refuses a repeated long effective PAX name', async () => {
  await requireHealthyArchive();
  const selected = requiredPaxPair[0].selected;
  const archive = createArchive([
    createFile('package/long-one', 'first', selected),
    createFile('package/long-two', 'second', selected),
  ]);
  expect(() => {
    admitArchiveMembers(archive);
  }).toThrow('PUNI tar member is duplicated');
});

for (const identity of ['package/package.json', 'package/dist/puni.mjs'])
  it(
    'raw archive refuses a required long PAX placeholder at critical identity ' + identity,
    async () => {
      await requireHealthyArchive();
      const archive = createArchive([createFile(identity, 'alias', requiredPaxPair[0].selected)]);
      expect(() => {
        admitArchiveMembers(archive);
      }).toThrow();
    },
  );

/** Bun omits directory entries from its file map; duplicate directory headers still own
 * physical identities because only regular-file required-PAX headers are placeholders. */
async function requireRepeatedPaxDirectories(members: readonly ArchiveMember[]): Promise<void> {
  await requireHealthyArchive();
  const archive = createArchive(members);
  const files = await new Bun.Archive(archive).files();
  expect([...files.keys()].sort()).toEqual(['package/dist/puni.mjs', 'package/package.json']);
  expect(() => {
    admitArchiveMembers(archive);
  }).toThrow('PUNI tar member is duplicated');
}

it('raw archive refuses repeated long PAX directory physical headers', async () => {
  await requireRepeatedPaxDirectories([
    createDirectory('package/directory-placeholder/', 'package/' + 'a'.repeat(101) + '/'),
    createDirectory('package/directory-placeholder/', 'package/' + 'b'.repeat(101) + '/'),
  ]);
});
for (const reversed of [false, true])
  it(
    'raw archive refuses mixed ordinary and long PAX directory physical headers in ' +
      (reversed ? 'reverse' : 'native') +
      ' order',
    async () => {
      const members = [
        createDirectory('package/directory-placeholder/'),
        createDirectory('package/directory-placeholder/', 'package/' + 'a'.repeat(101) + '/'),
      ];
      await requireRepeatedPaxDirectories(reversed ? members.toReversed() : members);
    },
  );
