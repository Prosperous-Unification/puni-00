import { createHash } from 'node:crypto';

import { beforeAll, expect, test } from 'bun:test';

import {
  captureCompilerDerivative,
  type CompilerDerivative,
  type CompilerDerivativeMembers,
  listCompilerDerivativeMembers,
  readCompilerDerivativeProvenance,
} from './compiler-derivative-artifact';
import { createLimits, createMembers } from './compiler-derivative-fixture.test-support';

let members: CompilerDerivativeMembers;
beforeAll(() => {
  members = createMembers();
});
const names = ['LICENSE.txt', 'NOTICE', 'compiler.cjs', 'manifest.json'] as const;
const hash = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');

test('exact builder bytes bind independently calculated immutable provenance', () => {
  const artifact = captureCompilerDerivative(members, createLimits());
  const provenance = readCompilerDerivativeProvenance(artifact);
  const tuples = names.map((path) => ({
    path,
    identity: hash(members[path]),
    byteLength: members[path].byteLength,
  }));
  // Explicit key vectors avoid deriving identity with the production canonical helper.
  const artifactPreimage =
    '{"kind":"typescript-compiler-derivative","members":[' +
    tuples
      .map(
        (tuple) =>
          `{"byteLength":${String(tuple.byteLength)},"identity":"${tuple.identity}","path":"${tuple.path}"}`,
      )
      .join(',') +
    '],"schemaVersion":1,"upstreamIdentity":"569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39"}\n';
  expect(provenance).toMatchObject({
    schemaVersion: 1,
    kind: 'typescript-compiler-derivative',
    runtimeTrust: 'unverified',
  });
  expect(provenance.members).toEqual(tuples);
  expect(hash(members['manifest.json'])).toBe(
    '8b82b8fcaf4fe52d963152efacd98932cc41bb6cd3b701e4c5b47b71cea2d743',
  );
  expect(provenance.loaderPolicyIdentity).toBe(
    'd3a0a1bb071f7b6fb1b2892e45c06eaba82880a02aa108bf4c57a52be8b9a9df',
  );
  expect(provenance.compilerArtifactIdentity).toBe(hash(artifactPreimage));
  expect(provenance.compilerExecutionIdentity).toBe(
    hash(
      `{"artifactIdentity":"${hash(artifactPreimage)}","compilerVersion":"6.0.3","kind":"typescript-compiler-execution","loaderPolicyIdentity":"${provenance.loaderPolicyIdentity}","schemaVersion":1}\n`,
    ),
  );
  expect(Object.isFrozen(artifact)).toBe(true);
  expect(Object.isFrozen(provenance)).toBe(true);
  expect(Object.isFrozen(provenance.members)).toBe(true);
  expect(provenance.members.every(Object.isFrozen)).toBe(true);
  expect(provenance.runtimeTrust).toBe('unverified');
});

for (const name of names) {
  test(`absent ${name} refuses exact membership`, () => {
    const incomplete = { ...members };
    Reflect.deleteProperty(incomplete, name);
    expect(() => captureCompilerDerivative(incomplete, createLimits())).toThrow(
      'compiler derivative members differ',
    );
  });
  test(`altered ${name} refuses its raw pin`, () => {
    const altered = members[name].slice();
    altered[0] ^= 1;
    expect(() =>
      captureCompilerDerivative({ ...members, [name]: altered }, createLimits()),
    ).toThrow(`compiler derivative ${name} differs`);
  });
}
for (const manifest of [
  '{}',
  '{"unknown":true}',
  '{',
  '{"schemaVersion":1,"schemaVersion":1}',
  'semantic',
]) {
  test(`raw manifest rejects ${manifest}`, () => {
    const text =
      manifest === 'semantic'
        ? JSON.stringify(JSON.parse(new TextDecoder().decode(members['manifest.json'])))
        : manifest;
    expect(() =>
      captureCompilerDerivative(
        { ...members, 'manifest.json': new TextEncoder().encode(text) },
        createLimits(),
      ),
    ).toThrow('compiler derivative manifest.json differs');
  });
}
test('extra string and symbol members refuse', () => {
  expect(() =>
    captureCompilerDerivative(
      Object.assign({}, members, { extra: new Uint8Array() }),
      createLimits(),
    ),
  ).toThrow('members differ');
  expect(() =>
    captureCompilerDerivative({ ...members, [Symbol()]: new Uint8Array() }, createLimits()),
  ).toThrow('members differ');
});
test('owned provenance survives caller mutation', () => {
  const supplied = { ...members, 'compiler.cjs': members['compiler.cjs'].slice() };
  const artifact = captureCompilerDerivative(supplied, createLimits());
  const before = JSON.stringify(readCompilerDerivativeProvenance(artifact));
  supplied['compiler.cjs'].fill(0);
  expect(JSON.stringify(readCompilerDerivativeProvenance(artifact))).toBe(before);
});
test('forged copied proxied tokens refuse without property reads', () => {
  const artifact = captureCompilerDerivative(members, createLimits());
  let reads = 0;
  for (const token of [
    {},
    { ...artifact },
    new Proxy(artifact, {
      get() {
        reads++;
        throw new Error('getter');
      },
    }),
    Object.create(artifact),
  ]) {
    expect(() => readCompilerDerivativeProvenance(token as CompilerDerivative)).toThrow(
      'compiler derivative ownership differs',
    );
  }
  expect(reads).toBe(0);
});
test('captures member and limit getters once', () => {
  const reads: Record<string, number> = {};
  const supplied = Object.fromEntries(names.map((name) => [name, members[name]]));
  for (const name of names)
    Object.defineProperty(supplied, name, {
      enumerable: true,
      get() {
        reads[name] = (reads[name] ?? 0) + 1;
        if (reads[name] > 1) throw new Error('member reread');
        return members[name];
      },
    });
  const limits = createLimits();
  for (const name of Object.keys(limits) as (keyof typeof limits)[]) {
    const value = limits[name];
    Object.defineProperty(limits, name, {
      get() {
        reads[name] = (reads[name] ?? 0) + 1;
        if (reads[name] > 1) throw new Error('limit reread');
        return value;
      },
    });
  }
  captureCompilerDerivative(supplied as CompilerDerivativeMembers, limits);
  expect(Object.values(reads).every((count) => count === 1)).toBe(true);
});
for (const name of [
  'maximumMemberBytes',
  'maximumTotalBytes',
  'maximumOwnedBytes',
  'maximumLoadMilliseconds',
] as const) {
  for (const value of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
    test(`invalid ${name} ${String(value)} refuses`, () => {
      expect(() =>
        captureCompilerDerivative(members, { ...createLimits(), [name]: value }),
      ).toThrow(`compiler derivative ${name} must be a positive safe integer`);
    });
}
test('member total and retained allocation exact fit and shortage', () => {
  const total = Object.values(members).reduce((sum, bytes) => sum + bytes.byteLength, 0);
  const largest = Math.max(...Object.values(members).map((bytes) => bytes.byteLength));
  const limits = {
    ...createLimits(),
    maximumMemberBytes: largest,
    maximumTotalBytes: total,
    maximumOwnedBytes: total,
  };
  expect(() => captureCompilerDerivative(members, limits)).not.toThrow();
  for (const name of ['maximumMemberBytes', 'maximumTotalBytes', 'maximumOwnedBytes'] as const)
    expect(() =>
      captureCompilerDerivative(members, { ...limits, [name]: limits[name] - 1 }),
    ).toThrow(`compiler derivative ${name} exceeded`);
});

test('byte lengths are captured once and invalid byte inputs refuse', () => {
  const bytes = members['compiler.cjs'].slice();
  let reads = 0;
  Object.defineProperty(bytes, 'byteLength', {
    get() {
      reads++;
      if (reads > 1) throw new Error('byte length reread');
      return members['compiler.cjs'].byteLength;
    },
  });
  captureCompilerDerivative({ ...members, 'compiler.cjs': bytes }, createLimits());
  expect(reads).toBe(1);
  expect(() =>
    captureCompilerDerivative(
      { ...members, NOTICE: undefined as unknown as Uint8Array },
      createLimits(),
    ),
  ).toThrow('NOTICE is not bytes');
  const invalid = members.NOTICE.slice();
  Object.defineProperty(invalid, 'byteLength', { value: -1 });
  expect(() => captureCompilerDerivative({ ...members, NOTICE: invalid }, createLimits())).toThrow(
    'NOTICE length differs',
  );
});

test('short allowances refuse before any owned byte allocation', () => {
  const total = Object.values(members).reduce((sum, bytes) => sum + bytes.byteLength, 0);
  const Native = globalThis.Uint8Array;
  const forbidden = new Proxy(Native, {
    construct() {
      throw new Error('forbidden owned allocation');
    },
  });
  globalThis.Uint8Array = forbidden;
  try {
    for (const limits of [
      { ...createLimits(), maximumMemberBytes: 1 },
      { ...createLimits(), maximumTotalBytes: total - 1 },
      { ...createLimits(), maximumOwnedBytes: total - 1 },
    ])
      expect(() => captureCompilerDerivative(members, limits)).toThrow(
        /compiler derivative maximum(Member|Total|Owned)Bytes exceeded/,
      );
  } finally {
    globalThis.Uint8Array = Native;
  }
});

test('a forged same-version compiler is refused as executable bytes', () => {
  const forged = new TextEncoder().encode(
    'throw new Error("candidate code ran"); module.exports = { version: "6.0.3" };',
  );
  expect(() =>
    captureCompilerDerivative({ ...members, 'compiler.cjs': forged }, createLimits()),
  ).toThrow('compiler derivative compiler.cjs differs');
});

test('compiled member metadata is a closed independent immutable vector', () => {
  const expected = [
    {
      path: 'LICENSE.txt',
      identity: 'a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47',
      byteLength: 9197,
    },
    {
      path: 'NOTICE',
      identity: '2bc5ce9e6b7ca3e8cdee8a6593241646056d5018e5d6e21ea5df299f2a200555',
      byteLength: 37980,
    },
    {
      path: 'compiler.cjs',
      identity: '47bffa39459dbbb0797606506c790af1420a983ed6bc1d3ca4945a64ee782559',
      byteLength: 9144652,
    },
    {
      path: 'manifest.json',
      identity: '8b82b8fcaf4fe52d963152efacd98932cc41bb6cd3b701e4c5b47b71cea2d743',
      byteLength: 526,
    },
  ] as const;
  const contract = listCompilerDerivativeMembers();
  expect(contract).toEqual(expected);
  expect(Object.isFrozen(contract)).toBe(true);
  for (const member of contract) expect(Object.isFrozen(member)).toBe(true);
  expect(contract).toEqual(
    names.map((path) => ({
      path,
      identity: hash(members[path]),
      byteLength: members[path].byteLength,
    })),
  );
});
