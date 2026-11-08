import { createHash } from 'node:crypto';

import { expect, spyOn, test } from 'bun:test';

import type * as ArchiveExports from './source-stageb-archive';
import {
  appendSourceArchiveMember,
  createSourceArchive,
  discardSourceArchive,
  finishSourceArchiveSlot,
  serializeSourceArchive,
} from './source-stageb-archive';

const slots = [
  'input-manifest',
  'approval-reference',
  'setup',
  'journal',
  'capture-fd4',
  'channel-transcript',
  'observer-backend',
  'observer-gateway',
  'observer-mcp',
  'observer-frontend',
  'instrument-finalization',
  'source-channel-settlement',
  'runner-settlement',
  'provider-cleanup',
  'failures',
] as const;
interface Envelope {
  format: string;
  version: number;
  index: {
    format: string;
    version: number;
    binding: ReturnType<typeof binding>;
    slots: { slot: string; status: string; count: number }[];
    members: { slot: string; ordinal: number; bytes: number; sha256: string }[];
  };
  members: { slot: string; ordinal: number; base64: string }[];
}
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const manifest = Buffer.from([0, 255, 128, 3]);
const binding = () => ({
  implementationSha: 'a'.repeat(40),
  workflowSha: 'b'.repeat(40),
  nonce: 'c'.repeat(32),
  inputManifestSha256: digest(manifest),
  recipientFingerprint: 'd'.repeat(64),
});
const create = () =>
  createSourceArchive({ binding: binding(), deadline: performance.now() + 10000 });

test('serializes actual private bytes in fixed order with independent decoded hashes', () => {
  const archive = create();
  const expected = new Map<string, Buffer[]>();
  for (const slot of [...slots].reverse()) {
    const bytes = slot === 'input-manifest' ? manifest : Buffer.from([0, 254, 128, slot.length]);
    const offset = Buffer.concat([Buffer.from([9]), bytes, Buffer.from([9])]).subarray(
      1,
      bytes.length + 1,
    );
    appendSourceArchiveMember(archive, { slot, ordinal: 0, bytes: offset });
    expected.set(slot, [Buffer.from(bytes)]);
    if (slot === 'capture-fd4') {
      appendSourceArchiveMember(archive, { slot, ordinal: 1, bytes: Buffer.from('second') });
      expected.get(slot)?.push(Buffer.from('second'));
    }
    finishSourceArchiveSlot(archive, { slot, status: 'recorded' });
    offset.fill(1);
  }
  const serialized = serializeSourceArchive(archive);
  const text = Buffer.from(serialized.bytes).toString('utf8');
  expect(text.endsWith('\n')).toBe(true);
  expect(text.endsWith('\n\n')).toBe(false);
  const envelope = JSON.parse(text) as Envelope;
  expect(Object.keys(envelope)).toEqual(['format', 'version', 'index', 'members']);
  expect(envelope.format).toBe('source-stageb-private-archive');
  expect(envelope.version).toBe(1);
  expect(envelope.index.format).toBe('source-stageb-private-index');
  expect(envelope.index.version).toBe(1);
  expect(envelope.index.slots).toEqual(
    slots.map((slot) => ({ slot, status: 'recorded', count: slot === 'capture-fd4' ? 2 : 1 })),
  );
  expect(envelope.index.members.length).toBe(16);
  expect(envelope.members.map((entry: { slot: string }) => entry.slot)).toEqual(
    slots.flatMap((slot) => (slot === 'capture-fd4' ? [slot, slot] : [slot])),
  );
  for (let index = 0; index < envelope.members.length; index++) {
    const payload = envelope.members[index];
    const decoded = Buffer.from(payload.base64, 'base64');
    const expectedBytes = expected.get(payload.slot)?.[payload.ordinal];
    if (expectedBytes === undefined) throw new Error('expected member absent');
    expect([...decoded]).toEqual([...expectedBytes]);
    expect(envelope.index.members[index]).toEqual({
      slot: payload.slot,
      ordinal: payload.ordinal,
      bytes: decoded.length,
      sha256: digest(decoded),
    });
  }
  expect(Object.keys(envelope.index)).toEqual(['format', 'version', 'binding', 'slots', 'members']);
  expect(serialized.indexSha256).toBe(digest(JSON.stringify(envelope.index)));
  expect(serialized.plaintextSha256).toBe(digest(serialized.bytes));
  expect(Object.keys(serialized)).toEqual(['evidence', 'bytes', 'indexSha256', 'plaintextSha256']);
  expect(serialized.evidence).toBe('private-serialized');
  expect(() => serializeSourceArchive(archive)).toThrow();
  discardSourceArchive(archive);
  discardSourceArchive(archive);
});

function complete(archive: ReturnType<typeof createSourceArchive>, recorded: string[] = []) {
  for (const slot of slots)
    finishSourceArchiveSlot(archive, {
      slot,
      status: recorded.includes(slot) ? 'recorded' : 'not-reached',
    });
}
function refusesMutation(request: unknown) {
  const archive = create();
  expect(() => {
    appendSourceArchiveMember(archive, request);
  }).toThrow(/^source archive /);
  expect(() => serializeSourceArchive(archive)).toThrow();
}
test('closed descriptor boundaries never invoke supplied getters', () => {
  let reads = 0;
  const accessor = {
    get slot() {
      reads++;
      return 'setup';
    },
    ordinal: 0,
    bytes: Buffer.from('private-sentinel'),
  };
  for (const request of [
    accessor,
    { slot: 'setup', ordinal: 0, bytes: Buffer.from('x'), extra: 1 },
    { slot: 'setup', ordinal: 0, bytes: Buffer.from('x'), [Symbol('sentinel')]: 1 },
    Object.create({ slot: 'setup' }),
    null,
  ])
    refusesMutation(request);
  for (const claim of [
    { ...binding(), extra: 'sentinel' },
    { ...binding(), nonce: '../secret' },
    { ...binding(), implementationSha: 'A'.repeat(40) },
    Object.defineProperty(binding(), 'workflowSha', {
      get() {
        reads++;
        return 'b'.repeat(40);
      },
    }),
  ])
    expect(() =>
      createSourceArchive({ binding: claim, deadline: performance.now() + 1000 }),
    ).toThrow();
  expect(reads).toBe(0);
});
test('slot ordinal byte ownership and original-token boundaries refuse', () => {
  for (const slot of ['unknown', '../setup', '/setup'])
    refusesMutation({ slot, ordinal: 0, bytes: Buffer.from('x') });
  for (const ordinal of [-1, 1, NaN, Infinity, 0.5])
    refusesMutation({ slot: 'setup', ordinal, bytes: Buffer.from('x') });
  for (const bytes of [
    [],
    'sentinel',
    new Uint16Array(2),
    new Uint8Array(new SharedArrayBuffer(3)),
    new Uint8Array(0),
  ])
    refusesMutation({ slot: 'setup', ordinal: 0, bytes });
  const detached = new Uint8Array(3);
  structuredClone(detached.buffer, { transfer: [detached.buffer] });
  refusesMutation({ slot: 'setup', ordinal: 0, bytes: detached });
  const archive = create();
  appendSourceArchiveMember(archive, { slot: 'setup', ordinal: 0, bytes: Buffer.from('x') });
  expect(() => {
    appendSourceArchiveMember(archive, { slot: 'setup', ordinal: 0, bytes: Buffer.from('y') });
  }).toThrow();
  expect(() => serializeSourceArchive(archive)).toThrow();
  for (const token of [{}, { ...create() }, Object.create(null)])
    expect(() => serializeSourceArchive(token as ReturnType<typeof createSourceArchive>)).toThrow();
  const original = create();
  discardSourceArchive(original);
  discardSourceArchive(original);
  expect(() => {
    appendSourceArchiveMember(original, { slot: 'setup', ordinal: 0, bytes: Buffer.from('x') });
  }).toThrow();
});
test('requires every explicit closure and consistent status membership', () => {
  expect(() => serializeSourceArchive(create())).toThrow();
  for (const request of [
    { slot: 'setup' },
    { slot: 'setup', status: 'unknown' },
    { slot: 'setup', status: 'recorded' },
    { slot: 'setup', status: 'unavailable', extra: 1 },
  ]) {
    const archive = create();
    expect(() => {
      finishSourceArchiveSlot(archive, request);
    }).toThrow();
    expect(() => serializeSourceArchive(archive)).toThrow();
  }
  const recorded = create();
  appendSourceArchiveMember(recorded, { slot: 'setup', ordinal: 0, bytes: Buffer.from('x') });
  expect(() => {
    finishSourceArchiveSlot(recorded, { slot: 'setup', status: 'unavailable' });
  }).toThrow();
  const closed = create();
  finishSourceArchiveSlot(closed, { slot: 'setup', status: 'unavailable' });
  expect(() => {
    finishSourceArchiveSlot(closed, { slot: 'setup', status: 'unavailable' });
  }).toThrow();
  const finished = create();
  finishSourceArchiveSlot(finished, { slot: 'setup', status: 'unavailable' });
  expect(() => {
    appendSourceArchiveMember(finished, { slot: 'setup', ordinal: 0, bytes: Buffer.from('x') });
  }).toThrow();
});
test('manifest equality is exact but coherently substituted claims remain unauthenticated', () => {
  refusesMutation({ slot: 'input-manifest', ordinal: 0, bytes: Buffer.from('substitution') });
  const substituted = Buffer.from('substitution');
  const claims = { ...binding(), inputManifestSha256: digest(substituted) };
  const archive = createSourceArchive({ binding: claims, deadline: performance.now() + 10000 });
  appendSourceArchiveMember(archive, { slot: 'input-manifest', ordinal: 0, bytes: substituted });
  claims.nonce = 'f'.repeat(32);
  complete(archive, ['input-manifest']);
  const serialized = serializeSourceArchive(archive);
  expect(
    (JSON.parse(Buffer.from(serialized.bytes).toString()) as Envelope).index.binding.nonce,
  ).toBe('c'.repeat(32));
  const second = createSourceArchive({
    binding: { ...binding(), nonce: 'e'.repeat(32) },
    deadline: performance.now() + 10000,
  });
  complete(second);
  const third = create();
  complete(third);
  expect(serializeSourceArchive(second).indexSha256).not.toBe(
    serializeSourceArchive(third).indexSha256,
  );
});
test('creation refuses invalid or extended original deadlines and private exceptions omit sentinels', () => {
  for (const deadline of [NaN, Infinity, -1, performance.now() - 1, performance.now() + 600001])
    expect(() => createSourceArchive({ binding: binding(), deadline })).toThrow();
  try {
    appendSourceArchiveMember(create(), {
      slot: 'PRIVATE-SENTINEL',
      ordinal: 0,
      bytes: Buffer.from('SECRET'),
    });
    throw new Error('accepted');
  } catch (cause) {
    expect(String(cause)).toMatch(/^Error: source archive /);
    expect(String(cause)).not.toContain('PRIVATE-SENTINEL');
    expect(String(cause)).not.toContain('SECRET');
  }
});

test('fixed arithmetic ceilings include every byte and reject invalid counters', async () => {
  const { reserveSourceArchiveMember: reserve } = await import('./source-stageb-archive');
  const zero = { count: 0, journalCount: 0, journalBytes: 0, rawBytes: 0, chargedBytes: 0 };
  expect(reserve('setup', 0, 8388608, zero).rawBytes).toBe(8388608);
  expect(() => reserve('setup', 0, 8388609, zero)).toThrow();
  expect(reserve('setup', 0, 1, { ...zero, count: 8191 }).count).toBe(8192);
  expect(() => reserve('setup', 0, 1, { ...zero, count: 8192 })).toThrow();
  expect(
    reserve('journal', 4095, 1, { ...zero, count: 8191, journalCount: 4095, journalBytes: 4194303 })
      .journalBytes,
  ).toBe(4194304);
  expect(() => reserve('journal', 4096, 1, { ...zero, count: 4096, journalCount: 4096 })).toThrow();
  expect(reserve('journal', 0, 16384, zero).journalBytes).toBe(16384);
  expect(() => reserve('journal', 0, 16385, zero)).toThrow();
  expect(() =>
    reserve('journal', 0, 1, { ...zero, count: 1, journalCount: 1, journalBytes: 4194304 }),
  ).toThrow();
  const cost = reserve('setup', 0, 1, zero).chargedBytes;
  expect(reserve('setup', 0, 1, { ...zero, chargedBytes: 134217728 - cost }).chargedBytes).toBe(
    134217728,
  );
  expect(() => reserve('setup', 0, 1, { ...zero, chargedBytes: 134217729 - cost })).toThrow();
  expect(() => reserve('setup', 0, 1, { ...zero, chargedBytes: 134217727 })).toThrow();
  for (const bytes of [0, -1, NaN, Infinity, 0.1, Number.MAX_SAFE_INTEGER + 1])
    expect(() => reserve('setup', 0, bytes, zero)).toThrow();
  for (const key of Object.keys(zero))
    for (const value of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])
      expect(() => reserve('setup', 0, 1, { ...zero, [key]: value })).toThrow();
  for (const bytes of [1, 2, 3, 4, 5, 6]) {
    const planned = reserve('setup', 0, bytes, zero).chargedBytes;
    const index = JSON.stringify({ slot: 'setup', ordinal: 0, bytes, sha256: '0'.repeat(64) });
    const payload = JSON.stringify({
      slot: 'setup',
      ordinal: 0,
      base64: Buffer.alloc(bytes).toString('base64'),
    });
    expect(planned).toBe(Buffer.byteLength(index) + Buffer.byteLength(payload));
  }
});
test('one real eight MiB append succeeds; one-over refuses before copying', () => {
  const archive = create();
  appendSourceArchiveMember(archive, { slot: 'setup', ordinal: 0, bytes: new Uint8Array(8388608) });
  discardSourceArchive(archive);
  refusesMutation({ slot: 'setup', ordinal: 0, bytes: new Uint8Array(8388609) });
});

type ArchiveApi = typeof ArchiveExports;
const sourceUrl = new URL('./source-stageb-archive.ts', import.meta.url);
let variantSequence = 0;
async function copiedApi(
  replacements: readonly (readonly [string, string])[] = [],
): Promise<ArchiveApi> {
  let source = await Bun.file(sourceUrl).text();
  for (const [before, after] of replacements) {
    const pattern = new RegExp(
      Array.from(before.replace(/\s/g, ''))
        .map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s*'),
      'g',
    );
    expect([...source.matchAll(pattern)].length).toBe(1);
    source = source.replace(pattern, after);
  }
  const fault = process.env['PUNI_ARCHIVE_FAULT'];
  if (fault !== undefined && replacements.length > 0)
    await Bun.write(
      `/tmp/puni-stageb-archive-tests/fault-${fault}.patch.txt`,
      JSON.stringify(replacements, null, 2),
    );
  const javascript = new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
  return (await import(
    `data:text/javascript;base64,${Buffer.from(javascript + `\n// copy ${String(variantSequence++)}`).toString('base64')}`
  )) as ArchiveApi;
}
function closeCopied(
  api: ArchiveApi,
  archive: ReturnType<ArchiveApi['createSourceArchive']>,
  recorded: string[] = [],
) {
  for (const slot of slots)
    api.finishSourceArchiveSlot(archive, {
      slot,
      status: recorded.includes(slot) ? 'recorded' : 'not-reached',
    });
}
const reduced = [
  ['const memberLimit = 8388608;', 'const memberLimit = 8;'],
  ['const countLimit = 8192;', 'const countLimit = 3;'],
  ['const journalCountLimit = 4096;', 'const journalCountLimit = 2;'],
  ['const journalMemberLimit = 16384;', 'const journalMemberLimit = 4;'],
  ['const journalByteLimit = 4194304;', 'const journalByteLimit = 6;'],
] as const;
test('privately reduced fixed-cap consumers reserve before copy and retain complete successful bytes', async () => {
  const api = await copiedApi(reduced);
  const make = () =>
    api.createSourceArchive({ binding: binding(), deadline: performance.now() + 10000 });
  const exact = make();
  api.appendSourceArchiveMember(exact, { slot: 'setup', ordinal: 0, bytes: new Uint8Array(8) });
  api.appendSourceArchiveMember(exact, { slot: 'journal', ordinal: 0, bytes: new Uint8Array(4) });
  api.appendSourceArchiveMember(exact, { slot: 'journal', ordinal: 1, bytes: new Uint8Array(2) });
  closeCopied(api, exact, ['setup', 'journal']);
  const serialized = api.serializeSourceArchive(exact);
  expect(
    (JSON.parse(Buffer.from(serialized.bytes).toString()) as Envelope).members.map(
      (member: { base64: string }) => Buffer.from(member.base64, 'base64').length,
    ),
  ).toEqual([8, 4, 2]);
  for (const [slot, lengths] of [
    ['setup', [9]],
    ['setup', [1, 1, 1, 1]],
    ['journal', [5]],
    ['journal', [2, 2, 2]],
    ['journal', [4, 3]],
  ] as const) {
    const archive = make();
    for (let ordinal = 0; ordinal < lengths.length - 1; ordinal++)
      api.appendSourceArchiveMember(archive, {
        slot,
        ordinal,
        bytes: new Uint8Array(lengths[ordinal]),
      });
    expect(() => {
      api.appendSourceArchiveMember(archive, {
        slot,
        ordinal: lengths.length - 1,
        bytes: new Uint8Array(lengths[lengths.length - 1]),
      });
    }).toThrow();
    expect(() => api.serializeSourceArchive(archive)).toThrow();
  }
});

interface Fault {
  name: string;
  replacements: readonly (readonly [string, string])[];
  oracle: (api: ArchiveApi) => void;
}
const faults: Fault[] = [
  {
    name: 'closed-fields',
    replacements: [['if (Reflect.ownKeys(descriptors).length !== names.length) refuse();', '']],
    oracle(api) {
      expect(() =>
        api.createSourceArchive({
          binding: binding(),
          deadline: performance.now() + 10000,
          extra: 'SENTINEL',
        }),
      ).toThrow();
    },
  },
  {
    name: 'binding-shape',
    replacements: [['claim.length !== length || !/^[0-9a-f]+$/.test(claim)', 'false']],
    oracle(api) {
      expect(() =>
        api.createSourceArchive({
          binding: { ...binding(), nonce: 'WRONG' },
          deadline: performance.now() + 10000,
        }),
      ).toThrow();
    },
  },
  {
    name: 'slot-cardinality',
    replacements: [
      ['return refuse();\n}\nfunction integer', "return 'setup';\n}\nfunction integer"],
    ],
    oracle(api) {
      const archive = api.createSourceArchive({
        binding: binding(),
        deadline: performance.now() + 10000,
      });
      expect(() => {
        api.appendSourceArchiveMember(archive, {
          slot: '../setup',
          ordinal: 0,
          bytes: Buffer.from('x'),
        });
      }).toThrow();
    },
  },
  {
    name: 'ordinal',
    replacements: [[' || ordinal !== closure.count', '']],
    oracle(api) {
      const archive = api.createSourceArchive({
        binding: binding(),
        deadline: performance.now() + 10000,
      });
      expect(() => {
        api.appendSourceArchiveMember(archive, {
          slot: 'setup',
          ordinal: 1,
          bytes: Buffer.from('x'),
        });
      }).toThrow();
    },
  },
  {
    name: 'manifest-hash',
    replacements: [
      [
        "if (slot === 'input-manifest' && sha256 !== collector.binding.inputManifestSha256) refuse();",
        '',
      ],
    ],
    oracle(api) {
      const archive = api.createSourceArchive({
        binding: binding(),
        deadline: performance.now() + 10000,
      });
      expect(() => {
        api.appendSourceArchiveMember(archive, {
          slot: 'input-manifest',
          ordinal: 0,
          bytes: Buffer.from('wrong'),
        });
      }).toThrow();
    },
  },
  {
    name: 'copy-ownership',
    replacements: [
      [
        'const bytes = Buffer.from(view);',
        'const bytes = Buffer.from(view.buffer,view.byteOffset,view.byteLength);',
      ],
    ],
    oracle(api) {
      const archive = api.createSourceArchive({
        binding: binding(),
        deadline: performance.now() + 10000,
      });
      const supplied = Buffer.from('x');
      api.appendSourceArchiveMember(archive, { slot: 'setup', ordinal: 0, bytes: supplied });
      supplied[0] = 121;
      closeCopied(api, archive, ['setup']);
      expect(() => api.serializeSourceArchive(archive)).not.toThrow();
    },
  },
  {
    name: 'final-completeness',
    replacements: [
      [
        'if (closure.status === undefined) refuse();',
        "if (closure.status === undefined) closure.status='not-reached';",
      ],
    ],
    oracle(api) {
      expect(() =>
        api.serializeSourceArchive(
          api.createSourceArchive({ binding: binding(), deadline: performance.now() + 10000 }),
        ),
      ).toThrow();
    },
  },
  {
    name: 'status-membership',
    replacements: [[" || (status === 'recorded') !== closure.count > 0", '']],
    oracle(api) {
      const archive = api.createSourceArchive({
        binding: binding(),
        deadline: performance.now() + 10000,
      });
      expect(() => {
        api.finishSourceArchiveSlot(archive, { slot: 'setup', status: 'recorded' });
      }).toThrow();
    },
  },
  {
    name: 'poison-failure',
    replacements: [['    drop(collector);\n    return refuse();', '    return refuse();']],
    oracle(api) {
      const archive = api.createSourceArchive({
        binding: binding(),
        deadline: performance.now() + 10000,
      });
      expect(() => {
        api.appendSourceArchiveMember(archive, {
          slot: 'setup',
          ordinal: 1,
          bytes: Buffer.from('x'),
        });
      }).toThrow();
      expect(() => {
        api.appendSourceArchiveMember(archive, {
          slot: 'setup',
          ordinal: 0,
          bytes: Buffer.from('x'),
        });
      }).toThrow();
    },
  },
  {
    name: 'replay',
    replacements: [['    drop(collector);\n    return {evidence:', '    return {evidence:']],
    oracle(api) {
      const archive = api.createSourceArchive({
        binding: binding(),
        deadline: performance.now() + 10000,
      });
      closeCopied(api, archive);
      api.serializeSourceArchive(archive);
      expect(() => api.serializeSourceArchive(archive)).toThrow();
    },
  },
  {
    name: 'discard',
    replacements: [
      [
        'export function discardSourceArchive(token: SourceArchive): void { drop(getCollector(token)); }',
        'export function discardSourceArchive(token: SourceArchive): void { getCollector(token); }',
      ],
    ],
    oracle(api) {
      const archive = api.createSourceArchive({
        binding: binding(),
        deadline: performance.now() + 10000,
      });
      api.discardSourceArchive(archive);
      expect(() => {
        api.appendSourceArchiveMember(archive, {
          slot: 'setup',
          ordinal: 0,
          bytes: Buffer.from('x'),
        });
      }).toThrow();
    },
  },
];
for (const fault of faults)
  test(`watched ${fault.name}`, async () => {
    const selected = process.env['PUNI_ARCHIVE_FAULT'];
    const api = await copiedApi(selected === fault.name ? fault.replacements : []);
    fault.oracle(api);
  });

test('original deadline expiry at final return refuses successful bytes', () => {
  const deadline = performance.now() + 10000;
  const archive = createSourceArchive({ binding: binding(), deadline });
  complete(archive);
  const clock = spyOn(performance, 'now')
    .mockImplementationOnce(() => deadline - 1)
    .mockImplementationOnce(() => deadline + 1);
  try {
    expect(() => serializeSourceArchive(archive)).toThrow();
  } finally {
    clock.mockRestore();
  }
  expect(() => serializeSourceArchive(archive)).toThrow();
});

const capFaults: Fault[] = [
  {
    name: 'member-cap',
    replacements: [['length > memberLimit', 'false']],
    oracle(api) {
      const archive = api.createSourceArchive({
        binding: binding(),
        deadline: performance.now() + 10000,
      });
      expect(() => {
        api.appendSourceArchiveMember(archive, {
          slot: 'setup',
          ordinal: 0,
          bytes: new Uint8Array(9),
        });
      }).toThrow();
    },
  },
  {
    name: 'count-cap',
    replacements: [['count >= countLimit', 'false']],
    oracle(api) {
      const archive = api.createSourceArchive({
        binding: binding(),
        deadline: performance.now() + 10000,
      });
      for (const slot of ['setup', 'approval-reference', 'capture-fd4'])
        api.appendSourceArchiveMember(archive, { slot, ordinal: 0, bytes: new Uint8Array(1) });
      expect(() => {
        api.appendSourceArchiveMember(archive, {
          slot: 'failures',
          ordinal: 0,
          bytes: new Uint8Array(1),
        });
      }).toThrow();
    },
  },
  {
    name: 'journal-count-cap',
    replacements: [['journalCount >= journalCountLimit', 'false']],
    oracle(api) {
      const archive = api.createSourceArchive({
        binding: binding(),
        deadline: performance.now() + 10000,
      });
      for (let ordinal = 0; ordinal < 2; ordinal++)
        api.appendSourceArchiveMember(archive, {
          slot: 'journal',
          ordinal,
          bytes: new Uint8Array(1),
        });
      expect(() => {
        api.appendSourceArchiveMember(archive, {
          slot: 'journal',
          ordinal: 2,
          bytes: new Uint8Array(1),
        });
      }).toThrow();
    },
  },
  {
    name: 'journal-member-cap',
    replacements: [['length > journalMemberLimit', 'false']],
    oracle(api) {
      const archive = api.createSourceArchive({
        binding: binding(),
        deadline: performance.now() + 10000,
      });
      expect(() => {
        api.appendSourceArchiveMember(archive, {
          slot: 'journal',
          ordinal: 0,
          bytes: new Uint8Array(5),
        });
      }).toThrow();
    },
  },
  {
    name: 'journal-byte-cap',
    replacements: [['journalBytes + length > journalByteLimit', 'false']],
    oracle(api) {
      const archive = api.createSourceArchive({
        binding: binding(),
        deadline: performance.now() + 10000,
      });
      api.appendSourceArchiveMember(archive, {
        slot: 'journal',
        ordinal: 0,
        bytes: new Uint8Array(4),
      });
      expect(() => {
        api.appendSourceArchiveMember(archive, {
          slot: 'journal',
          ordinal: 1,
          bytes: new Uint8Array(3),
        });
      }).toThrow();
    },
  },
];
for (const fault of capFaults)
  test(`watched ${fault.name}`, async () => {
    const selected = process.env['PUNI_ARCHIVE_FAULT'];
    const api = await copiedApi([
      ...reduced,
      ...(selected === fault.name ? fault.replacements : []),
    ]);
    fault.oracle(api);
  });
test('watched reservation-consumer', async () => {
  const empty = create();
  complete(empty);
  const baseline = serializeSourceArchive(empty).bytes.length + 45;
  const api = await copiedApi([
    ['const archiveLimit = 134217728;', `const archiveLimit = ${String(baseline)};`],
    ...(process.env['PUNI_ARCHIVE_FAULT'] === 'reservation-consumer'
      ? [
          [
            'const reservation = reserveSourceArchiveMember(slot,ordinal,view.byteLength,collector.counters,);',
            'const reservation = collector.counters;',
          ] as const,
        ]
      : []),
  ]);
  const archive = api.createSourceArchive({
    binding: binding(),
    deadline: performance.now() + 10000,
  });
  expect(() => {
    api.appendSourceArchiveMember(archive, { slot: 'setup', ordinal: 0, bytes: new Uint8Array(1) });
  }).toThrow();
});
test('watched emitted-bound', async () => {
  const empty = create();
  complete(empty);
  const baseline = serializeSourceArchive(empty).bytes.length + 45;
  const api = await copiedApi([
    ['const archiveLimit = 134217728;', `const archiveLimit = ${String(baseline + 1000)};`],
    [
      "JSON.stringify(envelope)+'\\n','utf8'",
      "JSON.stringify(envelope)+' '.repeat(2000)+'\\n','utf8'",
    ],
    ...(process.env['PUNI_ARCHIVE_FAULT'] === 'emitted-bound'
      ? [
          [
            'if (bytes.byteLength !== planned || bytes.byteLength > archiveLimit) refuse();',
            '',
          ] as const,
        ]
      : []),
  ]);
  const archive = api.createSourceArchive({
    binding: binding(),
    deadline: performance.now() + 10000,
  });
  closeCopied(api, archive);
  expect(() => api.serializeSourceArchive(archive)).toThrow();
});
test('watched deadline-final', async () => {
  const api = await copiedApi(
    process.env['PUNI_ARCHIVE_FAULT'] === 'deadline-final'
      ? [['    assertDeadline(collector);\n    drop(collector);', '    drop(collector);']]
      : [],
  );
  const deadline = performance.now() + 10000;
  const archive = api.createSourceArchive({ binding: binding(), deadline });
  closeCopied(api, archive);
  const clock = spyOn(performance, 'now')
    .mockImplementationOnce(() => deadline - 1)
    .mockImplementationOnce(() => deadline + 1);
  try {
    expect(() => api.serializeSourceArchive(archive)).toThrow();
  } finally {
    clock.mockRestore();
  }
});

const extraFaults: Fault[] = [
  {
    name: 'shared-view',
    replacements: [['if (!(buffer instanceof ArrayBuffer)) refuse();', '']],
    oracle(api) {
      const archive = api.createSourceArchive({
        binding: binding(),
        deadline: performance.now() + 10000,
      });
      expect(() => {
        api.appendSourceArchiveMember(archive, {
          slot: 'setup',
          ordinal: 0,
          bytes: new Uint8Array(new SharedArrayBuffer(1)),
        });
      }).toThrow();
    },
  },
  {
    name: 'view-kind',
    replacements: [
      [
        '(Object.getPrototypeOf(value) !== Uint8Array.prototype && Object.getPrototypeOf(value) !== Buffer.prototype)',
        'false',
      ],
    ],
    oracle(api) {
      const archive = api.createSourceArchive({
        binding: binding(),
        deadline: performance.now() + 10000,
      });
      expect(() => {
        api.appendSourceArchiveMember(archive, {
          slot: 'setup',
          ordinal: 0,
          bytes: new Uint16Array(1),
        });
      }).toThrow();
    },
  },
  {
    name: 'manifest-cardinality',
    replacements: [[" || (checkedSlot === 'input-manifest' && checkedOrdinal !== 0)", '']],
    oracle(api) {
      const archive = api.createSourceArchive({
        binding: binding(),
        deadline: performance.now() + 10000,
      });
      api.appendSourceArchiveMember(archive, {
        slot: 'input-manifest',
        ordinal: 0,
        bytes: manifest,
      });
      expect(() => {
        api.appendSourceArchiveMember(archive, {
          slot: 'input-manifest',
          ordinal: 1,
          bytes: manifest,
        });
      }).toThrow();
    },
  },
  {
    name: 'append-closed-slot',
    replacements: [
      ['closure.status !== undefined || ordinal !== closure.count', 'ordinal !== closure.count'],
    ],
    oracle(api) {
      const archive = api.createSourceArchive({
        binding: binding(),
        deadline: performance.now() + 10000,
      });
      api.finishSourceArchiveSlot(archive, { slot: 'setup', status: 'unavailable' });
      expect(() => {
        api.appendSourceArchiveMember(archive, {
          slot: 'setup',
          ordinal: 0,
          bytes: Buffer.from('x'),
        });
      }).toThrow();
    },
  },
  {
    name: 'duplicate-close',
    replacements: [
      [
        "closure === undefined || closure.status !== undefined || (status === 'recorded')",
        "closure === undefined || (status === 'recorded')",
      ],
    ],
    oracle(api) {
      const archive = api.createSourceArchive({
        binding: binding(),
        deadline: performance.now() + 10000,
      });
      api.finishSourceArchiveSlot(archive, { slot: 'setup', status: 'unavailable' });
      expect(() => {
        api.finishSourceArchiveSlot(archive, { slot: 'setup', status: 'not-reached' });
      }).toThrow();
    },
  },
  {
    name: 'status-enumeration',
    replacements: [
      [
        "if (status !== 'recorded' && status !== 'not-reached' && status !== 'unavailable') refuse();",
        '',
      ],
    ],
    oracle(api) {
      const archive = api.createSourceArchive({
        binding: binding(),
        deadline: performance.now() + 10000,
      });
      expect(() => {
        api.finishSourceArchiveSlot(archive, { slot: 'setup', status: 'SENTINEL' });
      }).toThrow();
    },
  },
  {
    name: 'deadline-creation-upper',
    replacements: [[' || deadline > entered+600000', '']],
    oracle(api) {
      expect(() =>
        api.createSourceArchive({ binding: binding(), deadline: performance.now() + 600001 }),
      ).toThrow();
    },
  },
  {
    name: 'deadline-operation',
    replacements: [
      [
        '    assertDeadline(collector);\n    return operation(collector);',
        '    performance.now(); return operation(collector);',
      ],
    ],
    oracle(api) {
      const deadline = performance.now() + 10000;
      const archive = api.createSourceArchive({ binding: binding(), deadline });
      const clock = spyOn(performance, 'now')
        .mockImplementationOnce(() => deadline + 1)
        .mockImplementationOnce(() => deadline - 1);
      try {
        expect(() => {
          api.appendSourceArchiveMember(archive, {
            slot: 'setup',
            ordinal: 0,
            bytes: Buffer.from('x'),
          });
        }).toThrow();
      } finally {
        clock.mockRestore();
      }
    },
  },
];
for (const fault of extraFaults)
  test(`watched ${fault.name}`, async () => {
    const api = await copiedApi(
      process.env['PUNI_ARCHIVE_FAULT'] === fault.name ? fault.replacements : [],
    );
    fault.oracle(api);
  });
test('watched retained-hash', async () => {
  const api = await copiedApi([
    [
      '    for (const member of ordered) if (member.bytes.length',
      '    if (ordered[0] !== undefined) ordered[0].bytes[0] ^= 1;\n    for (const member of ordered) if (member.bytes.length',
    ],
    ...(process.env['PUNI_ARCHIVE_FAULT'] === 'retained-hash'
      ? [['digest(member.bytes) !== member.sha256', 'false'] as const]
      : []),
  ]);
  const archive = api.createSourceArchive({
    binding: binding(),
    deadline: performance.now() + 10000,
  });
  api.appendSourceArchiveMember(archive, { slot: 'setup', ordinal: 0, bytes: Buffer.from('x') });
  closeCopied(api, archive, ['setup']);
  expect(() => api.serializeSourceArchive(archive)).toThrow();
});

test('byte intrinsic access ignores user getters and output is a mutable detached handoff', () => {
  let reads = 0;
  const supplied = new Uint8Array([1, 2, 3]);
  Object.defineProperty(supplied, 'byteLength', {
    get() {
      reads++;
      return 999;
    },
  });
  const archive = create();
  appendSourceArchiveMember(archive, { slot: 'setup', ordinal: 0, bytes: supplied });
  supplied.fill(9);
  complete(archive, ['setup']);
  const serialized = serializeSourceArchive(archive);
  expect(reads).toBe(0);
  const envelope = JSON.parse(Buffer.from(serialized.bytes).toString()) as Envelope;
  expect([...Buffer.from(envelope.members[0].base64, 'base64')]).toEqual([1, 2, 3]);
  const originalHash = serialized.plaintextSha256;
  serialized.bytes[0] = 0;
  expect(digest(serialized.bytes)).not.toBe(originalHash);
});
test('privately reduced oversized input is refused before the actual copy allocation', async () => {
  const api = (await copiedApi([
    ...reduced,
    ['const bytes = Buffer.from(view);', 'archiveCopies++; const bytes = Buffer.from(view);'],
    ['const memberLimit = 8;', 'export let archiveCopies=0; const memberLimit = 8;'],
  ])) as ArchiveApi & { archiveCopies: number };
  const archive = api.createSourceArchive({
    binding: binding(),
    deadline: performance.now() + 10000,
  });
  expect(() => {
    api.appendSourceArchiveMember(archive, { slot: 'setup', ordinal: 0, bytes: new Uint8Array(9) });
  }).toThrow();
  expect(api.archiveCopies).toBe(0);
});
test('watched safe-integer', async () => {
  const api = await copiedApi(
    process.env['PUNI_ARCHIVE_FAULT'] === 'safe-integer'
      ? [
          [
            "if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) refuse();",
            '',
          ],
        ]
      : [],
  );
  expect(() =>
    api.reserveSourceArchiveMember('setup', 0, 1, {
      count: 0,
      journalCount: 0,
      journalBytes: 0,
      rawBytes: -1,
      chargedBytes: 0,
    }),
  ).toThrow();
});
