import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { afterAll, expect, it } from 'bun:test';

import { createLintFixture } from '../testing/lint-fixtures';
import { prepareActivation, prepareBunActivation, verifyPreparationBase } from './activation';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function createBase(version: 3 | 4) {
  const fixture = createLintFixture('export {};');
  roots.push(fixture.root);
  const base =
    version === 4
      ? fixture.prepared
      : prepareActivation({
          ...fixture.prepared.request,
          destination: join(fixture.archive, 'legacy'),
        });
  return { ...fixture, base };
}
for (const version of [3, 4] as const) {
  it('verifies external regular base' + String(version) + ' without executing its roles', () => {
    const fixture = createBase(version);
    expect(
      verifyPreparationBase(fixture.base.directory, fixture.candidate).manifest.schemaVersion,
    ).toBe(version);
  });
  for (const path of [
    'manifest.json',
    'checksums.sha256',
    'active-v1',
    'ci-binding-path',
    'evidence-path',
    'launcher-path',
    'local-binding-path',
    'snapshotter-path',
    'validator-path',
    'artifacts/policy.json',
  ]) {
    it(
      'refuses FIFO base' + String(version) + ' member ' + path + ' before blocking byte reads',
      () => {
        const fixture = createBase(version);
        const member = join(fixture.base.directory, path);
        rmSync(member);
        const fifo = Bun.spawnSync(['mkfifo', member], { stdout: 'pipe', stderr: 'pipe' });
        expect(fifo.exitCode, fifo.stderr.toString()).toBe(0);
        const program =
          'import{verifyPreparationBase}from ' +
          JSON.stringify(join(import.meta.dir, 'activation.ts')) +
          ';try{verifyPreparationBase(' +
          JSON.stringify(fixture.base.directory) +
          ',' +
          JSON.stringify(fixture.candidate) +
          ');throw new Error("unexpected accepted FIFO");}catch(cause){process.stdout.write(String(cause.message));}';
        const entrypoint = join(fixture.root, 'read-base.ts');
        writeFileSync(entrypoint, program);
        const child = Bun.spawnSync([...createLaunch(process.execPath, entrypoint)], {
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 3000,
        });
        expect(child.exitCode, child.stderr.toString()).toBe(0);
        expect(child.stdout.toString()).toBe(
          'relocation base member is not a regular file: ' + path,
        );
      },
    );
  }
  it('refuses candidate-owned role targets inside ancestor base' + String(version), () => {
    const fixture = createBase(version);
    const candidate = join(fixture.base.directory, 'candidate');
    mkdirSync(candidate);
    const authority = join(fixture.base.directory, 'artifacts/authority.json');
    copyFileSync(authority, join(candidate, 'authority.json'));
    rmSync(authority);
    symlinkSync(join(candidate, 'authority.json'), authority);
    expect(() => verifyPreparationBase(fixture.base.directory, candidate)).toThrow(
      'relocation base member must be outside the candidate repository: artifacts/authority.json',
    );
  });
  it('refuses escaped metadata inside base' + String(version), () => {
    const fixture = createBase(version);
    const marker = join(fixture.base.directory, 'active-v1');
    const outside = join(fixture.root, 'outside-marker');
    copyFileSync(marker, outside);
    rmSync(marker);
    symlinkSync(outside, marker);
    expect(() => verifyPreparationBase(fixture.base.directory, fixture.candidate)).toThrow(
      'relocation base member escapes activation root: active-v1',
    );
  });
}

for (const version of [3, 4] as const) {
  it(
    'retains complete digest verification after base' + String(version) + ' member preflight',
    () => {
      const fixture = createBase(version);
      const authority = join(fixture.base.directory, 'artifacts/authority.json');
      chmodSync(authority, 0o600);
      writeFileSync(authority, Buffer.concat([readFileSync(authority), Buffer.from('\n')]));
      expect(() => verifyPreparationBase(fixture.base.directory, fixture.candidate)).toThrow(
        'activation artifact digest mismatch: artifacts/authority.json',
      );
    },
  );
}

it('selects native base authority for a symlink-parent operand with two valid bases', () => {
  const fixture = createBase(4);
  mkdirSync(join(fixture.root, 'branch/inside'), { recursive: true });
  const native = prepareBunActivation({
    ...fixture.base.request,
    destination: join(fixture.root, 'branch/base'),
    sourceRevision: 'b'.repeat(40),
  });
  prepareBunActivation({
    ...fixture.base.request,
    destination: join(fixture.root, 'base'),
    sourceRevision: 'c'.repeat(40),
  });
  symlinkSync(join(fixture.root, 'branch/inside'), join(fixture.root, 'alias'));
  const selected = verifyPreparationBase(
    join(fixture.root, 'alias') + '/../base',
    fixture.candidate,
  );
  expect(selected.directory).toBe(native.directory);
  expect(selected.manifest.sourceRevision).toBe('b'.repeat(40));
});
