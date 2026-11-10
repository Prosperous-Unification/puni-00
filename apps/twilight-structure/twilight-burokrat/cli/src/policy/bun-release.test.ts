import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ValidationError } from '@shared/validation';
import { afterEach, expect, it } from 'bun:test';

import { type BunToolkitRequest, bunToolkitRoles, planBunToolkit } from './bun-release';
import { planToolkit, type ToolkitPlanRequest } from './release';
import { readBunToolkit } from './toolkit';
import { hashTrustedModules } from './trusted-modules';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni-bun-plan-'));
  roots.push(root);
  const closure = join(root, 'trusted-node-modules');
  mkdirSync(join(closure, 'typescript'), { recursive: true });
  writeFileSync(
    join(closure, 'typescript/package.json'),
    '{"name":"typescript","version":"6.0.2"}\n',
  );
  const request: BunToolkitRequest = {
    tag: 'puni-v0.3.0',
    sourceRevision: 'a'.repeat(40),
    bunVersion: Bun.version,
    roleBytes: {
      'launcher.mjs': Buffer.from('launcher\n'),
      'snapshotter.ts': Buffer.from('snapshotter\n'),
      'validator.mjs': Buffer.from('validator\n'),
      'prepare-activation.mjs': Buffer.from('prepare\n'),
      'prepare-relocation-activation.mjs': Buffer.from('relocate\n'),
    },
    trustedNodeModules: ['typescript'],
    trustedNodeModulesIdentity: hashTrustedModules(closure),
  };
  return { root, request };
}

it('plans exactly the current Bun roster and original-byte identity consumable by the strict reader', () => {
  const { root, request } = createFixture(),
    plan = planBunToolkit(request);
  expect(bunToolkitRoles).toEqual([
    'launcher.mjs',
    'snapshotter.ts',
    'validator.mjs',
    'prepare-activation.mjs',
    'prepare-relocation-activation.mjs',
  ]);
  for (const role of bunToolkitRoles) writeFileSync(join(root, role), request.roleBytes[role]);
  writeFileSync(join(root, 'toolkit.json'), plan.descriptor);
  writeFileSync(join(root, 'SHA256SUMS'), plan.checksums);
  const verified = readBunToolkit(root);
  expect(verified.schemaVersion).toBe(2);
  expect(verified.tag).toBe('puni-v0.3.0');
  expect(verified.digest).toBe(sha(plan.descriptor));
  expect(Object.keys(verified.roleBytes).sort()).toEqual([...bunToolkitRoles].sort());
  const descriptor: unknown = JSON.parse(Buffer.from(plan.descriptor).toString());
  expect(descriptor).toMatchObject({
    schemaVersion: 2,
    tag: request.tag,
    sourceRevision: request.sourceRevision,
    bunVersion: Bun.version,
    trustedNodeModules: ['typescript'],
    trustedNodeModulesIdentity: request.trustedNodeModulesIdentity,
  });
  const lines = Buffer.from(plan.checksums).toString().split('\n');
  expect(lines).toHaveLength(7);
  expect(lines.at(-1)).toBe('');
  for (const [index, role] of bunToolkitRoles.entries()) {
    expect(lines[index]).toBe(sha(readFileSync(join(root, role))) + '  ./' + role);
    expect(plan.digests[role]).toBe(sha(request.roleBytes[role]));
  }
  expect(lines[5]).toBe(sha(plan.descriptor) + '  ./toolkit.json');
});

it('canonicalizes unordered metadata and changes identity for every changed role', () => {
  const { request } = createFixture();
  const first = planBunToolkit({ ...request, trustedNodeModules: ['zeta', 'alpha'] });
  const second = planBunToolkit({
    ...request,
    trustedNodeModules: ['alpha', 'zeta'],
    roleBytes: Object.fromEntries(
      Object.entries(request.roleBytes).reverse(),
    ) as BunToolkitRequest['roleBytes'],
  });
  expect(first.descriptor).toEqual(second.descriptor);
  expect(first.checksums).toEqual(second.checksums);
  for (const role of bunToolkitRoles) {
    const changed = planBunToolkit({
      ...request,
      roleBytes: { ...request.roleBytes, [role]: Buffer.from('different ' + role) },
    });
    expect(changed.digests[role]).not.toBe(planBunToolkit(request).digests[role]);
    expect(changed.descriptor).not.toEqual(planBunToolkit(request).descriptor);
  }
});

for (const tag of [
  'wiki-v0.3.0',
  'twilight-burokrat-v0.3.0',
  'puni-v1',
  'puni-v01.2.3',
  'puni-v1.2.3-beta',
  '',
  'puni-v1.2.3' + String.fromCharCode(10),
])
  it('refuses current release tag ' + JSON.stringify(tag) + ' before producing descriptors', () => {
    const { request } = createFixture();
    expect(() => planBunToolkit({ ...request, tag })).toThrow();
  });

for (const [field, value] of [
  ['sourceRevision', 'not-a-commit'],
  ['bunVersion', ''],
  ['trustedNodeModulesIdentity', 'not-a-digest'],
] as const)
  it('refuses invalid current toolkit ' + field + ' before producing descriptors', () => {
    const { request } = createFixture();
    expect(() => planBunToolkit({ ...request, [field]: value })).toThrow();
  });

it('keeps historical toolkit1 descriptor and checksum bytes unchanged', () => {
  const fixture = JSON.parse(
    readFileSync(join(import.meta.dir, 'testing/toolkit-plan.v1.json'), 'utf8'),
  ) as {
    request: Omit<ToolkitPlanRequest, 'roleBytes'> & {
      roleBytes: Record<keyof ToolkitPlanRequest['roleBytes'], string>;
    };
    descriptor: string;
    checksums: string;
  };
  const plan = planToolkit({
    ...fixture.request,
    roleBytes: {
      'launcher.sh': Buffer.from(fixture.request.roleBytes['launcher.sh']),
      'snapshotter.ts': Buffer.from(fixture.request.roleBytes['snapshotter.ts']),
      'validator.mjs': Buffer.from(fixture.request.roleBytes['validator.mjs']),
      'prepare-activation.mjs': Buffer.from(fixture.request.roleBytes['prepare-activation.mjs']),
      'prepare-relocation-activation.mjs': Buffer.from(
        fixture.request.roleBytes['prepare-relocation-activation.mjs'],
      ),
    },
  });
  expect(Buffer.from(plan.descriptor).toString()).toBe(fixture.descriptor);
  expect(Buffer.from(plan.checksums).toString()).toBe(fixture.checksums);
});

for (const field of [
  'tag',
  'sourceRevision',
  'bunVersion',
  'trustedNodeModules',
  'trustedNodeModulesIdentity',
] as const)
  it('refuses absent claimed ' + field + ' without inventing metadata', () => {
    const { request } = createFixture();
    const absent = { ...request };
    Reflect.deleteProperty(absent, field);
    expect(() => planBunToolkit(absent)).toThrow();
  });

for (const [label, names] of [
  ['non-array', 'typescript'],
  ['malformed-member', [7]],
] as const)
  it('refuses ' + label + ' dependency names at the claimed metadata boundary', () => {
    const { request } = createFixture();
    // A JavaScript caller can cross this typed boundary with a malformed claimed array.
    const invalid = { ...request, trustedNodeModules: names } as unknown as BunToolkitRequest;
    expect(() => planBunToolkit(invalid)).toThrow(ValidationError);
  });
