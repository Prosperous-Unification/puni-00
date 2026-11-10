import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import { planBunToolkit } from '../policy/bun-release';
import { hashTrustedModules } from '../policy/trusted-modules';
import { readInstalledPuniToolkit } from './installed';
import { packageManifestBytes } from './manifest';
import { createPuniManifest, puniVersion } from './puni-manifest';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function createFixture(
  options: { readonly tag?: string; readonly revision?: string; readonly bun?: string } = {},
) {
  const root = mkdtempSync(join(tmpdir(), 'puni current package identity '));
  roots.push(root);
  const directory = join(root, 'dist'),
    toolkit = join(directory, 'toolkit'),
    closure = join(toolkit, 'trusted-node-modules');
  mkdirSync(closure, { recursive: true });
  // Structural identity fixture only; these inert roles are never executed or presented as a usable producer.
  const roleBytes = {
    'launcher.mjs': Buffer.from('export{};'),
    'snapshotter.ts': Buffer.from('export{};'),
    'validator.mjs': Buffer.from('export{};'),
    'prepare-activation.mjs': Buffer.from('export{};'),
    'prepare-relocation-activation.mjs': Buffer.from('export{};'),
  };
  for (const [role, bytes] of Object.entries(roleBytes)) writeFileSync(join(toolkit, role), bytes);
  const revision = options.revision ?? 'a'.repeat(40);
  const plan = planBunToolkit({
    tag: options.tag ?? 'puni-v0.3.0',
    sourceRevision: revision,
    bunVersion: options.bun ?? Bun.version,
    roleBytes,
    trustedNodeModules: [],
    trustedNodeModulesIdentity: hashTrustedModules(closure),
  });
  writeFileSync(join(toolkit, 'toolkit.json'), plan.descriptor);
  const identity = hashBytes(plan.descriptor),
    manifest = join(directory, 'package-manifest.json');
  writeFileSync(manifest, createPuniManifest(revision, identity));
  return { root, directory, toolkit, manifest, identity, revision, roleBytes };
}

it('creates the distinct canonical PUNI0.3.0 package identity without changing manifest schema or historical bytes', () => {
  const source = '1'.repeat(40),
    toolkit = '2'.repeat(64);
  expect(puniVersion).toBe('0.3.0');
  expect(Buffer.from(createPuniManifest(source, toolkit)).toString()).toBe(
    serializeCanonical({
      packageVersion: '0.3.0',
      schemaVersion: 1,
      sourceRevision: source,
      toolkitIdentity: toolkit,
    }),
  );
  expect(Buffer.from(packageManifestBytes(source, toolkit)).toString()).toBe(
    serializeCanonical({
      packageVersion: '0.2.1',
      schemaVersion: 1,
      sourceRevision: source,
      toolkitIdentity: toolkit,
    }),
  );
});

it('reads current PUNI profile with toolkit2 and matching independent metadata', () => {
  const fixture = createFixture(),
    current = readInstalledPuniToolkit(fixture.directory, fixture.toolkit);
  expect(current.schemaVersion).toBe(2);
  expect(current.digest).toBe(fixture.identity);
  expect(current.sourceRevision).toBe(fixture.revision);
});

it('refuses historical package profile before touching an absent toolkit', () => {
  const fixture = createFixture();
  writeFileSync(fixture.manifest, packageManifestBytes(fixture.revision, fixture.identity));
  expect(() =>
    readInstalledPuniToolkit(fixture.directory, join(fixture.root, 'absent-toolkit')),
  ).toThrow('installed PUNI package manifest is invalid');
});

it('refuses package-bound toolkit with a different captured source revision', () => {
  const fixture = createFixture();
  writeFileSync(fixture.manifest, createPuniManifest('b'.repeat(40), fixture.identity));
  expect(() => readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
    'installed toolkit source differs from PUNI package manifest',
  );
});

it('refuses package-bound toolkit with a different release tag', () => {
  const fixture = createFixture({ tag: 'puni-v0.4.0' });
  expect(() => readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
    'installed toolkit release differs from PUNI package version',
  );
});

it('refuses a self-consistent toolkit whose descriptor differs from the selected package identity', () => {
  const fixture = createFixture();
  writeFileSync(fixture.manifest, createPuniManifest(fixture.revision, 'b'.repeat(64)));
  expect(() => readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
    'installed toolkit differs from PUNI package manifest',
  );
});

it('preserves native symlink-parent selection of a different valid PUNI installation', () => {
  const lexical = createFixture(),
    native = createFixture({ revision: 'b'.repeat(40) });
  const child = join(native.directory, 'child');
  mkdirSync(child);
  const alias = join(lexical.directory, 'alias');
  symlinkSync(child, alias);
  expect(readInstalledPuniToolkit(alias + '/..', alias + '/../toolkit').digest).toBe(
    native.identity,
  );
});

for (const kind of ['absent', 'directory', 'malformed', 'invalid-utf8', 'unknown-field'] as const) {
  it('refuses ' + kind + ' current package state before toolkit access', () => {
    const fixture = createFixture();
    if (kind === 'absent' || kind === 'directory') {
      rmSync(fixture.manifest);
      if (kind === 'directory') mkdirSync(fixture.manifest);
    } else if (kind === 'malformed') writeFileSync(fixture.manifest, '{');
    else if (kind === 'invalid-utf8')
      writeFileSync(
        fixture.manifest,
        Buffer.concat([Buffer.from('{"sourceRevision":"'), Buffer.from([0xff]), Buffer.from('"}')]),
      );
    else
      writeFileSync(
        fixture.manifest,
        JSON.stringify({
          ...JSON.parse(readFileSync(fixture.manifest, 'utf8')),
          unknown: 'not-admitted',
        }),
      );
    expect(() =>
      readInstalledPuniToolkit(fixture.directory, join(fixture.root, 'absent-toolkit')),
    ).toThrow(
      kind === 'absent' || kind === 'directory'
        ? 'installed PUNI package manifest is unreadable'
        : kind === 'unknown-field'
          ? 'installed PUNI package manifest is invalid'
          : 'installed PUNI package manifest is malformed',
    );
  });
}

it('refuses historical toolkit layout under a current package even with matching Bun and metadata', () => {
  const fixture = createFixture(),
    path = join(fixture.toolkit, 'toolkit.json');
  const descriptor = JSON.parse(readFileSync(path, 'utf8')) as {
    schemaVersion: number;
    roles: Record<string, string>;
  };
  const launcher = readFileSync(join(fixture.toolkit, 'launcher.mjs'));
  writeFileSync(join(fixture.toolkit, 'launcher.sh'), launcher);
  descriptor.schemaVersion = 1;
  const roles = { ...descriptor.roles, 'launcher.sh': hashBytes(launcher) };
  Reflect.deleteProperty(roles, 'launcher.mjs');
  descriptor.roles = roles;
  const bytes = Buffer.from(serializeCanonical(descriptor));
  writeFileSync(path, bytes);
  writeFileSync(fixture.manifest, createPuniManifest(fixture.revision, hashBytes(bytes)));
  expect(() => readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
    'Bun execution requires toolkit schema 2',
  );
});

it('refuses current toolkit runtime drift before execution', () => {
  const fixture = createFixture({ bun: '0.0.0' });
  expect(() => readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
    'toolkit was built with another Bun',
  );
});

it('refuses changed current role bytes before metadata admission', () => {
  const fixture = createFixture();
  writeFileSync(join(fixture.toolkit, 'validator.mjs'), 'throw new Error("must never execute");');
  expect(() => readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
    'toolkit role differs from toolkit.json: validator.mjs',
  );
});

it('refuses changed current closure bytes before metadata admission', () => {
  const fixture = createFixture();
  writeFileSync(join(fixture.toolkit, 'trusted-node-modules/changed'), 'changed closure');
  expect(() => readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
    'toolkit runtime closure differs from toolkit.json',
  );
});

for (const [source, toolkit] of [
  ['invalid', '2'.repeat(64)],
  ['1'.repeat(40), 'invalid'],
]) {
  it('refuses malformed current serialization facts ' + source + '/' + toolkit, () => {
    expect(() => createPuniManifest(source, toolkit)).toThrow();
  });
}

it('refuses a native FIFO current manifest before synchronous input acquisition can block', async () => {
  const fixture = createFixture();
  rmSync(fixture.manifest);
  const created = Bun.spawnSync(['/usr/bin/mkfifo', fixture.manifest], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(created.exitCode, created.stderr.toString()).toBe(0);
  const entry = join(fixture.root, 'fifo-reader.ts');
  writeFileSync(
    entry,
    'import{readInstalledPuniToolkit}from ' +
      JSON.stringify(join(import.meta.dir, 'installed.ts')) +
      ';try{readInstalledPuniToolkit(' +
      JSON.stringify(fixture.directory) +
      ',' +
      JSON.stringify(join(fixture.root, 'absent-toolkit')) +
      ');throw new Error("FIFO admitted");}catch(cause){if(!(cause instanceof Error)||!cause.message.includes("installed PUNI package manifest is unreadable"))throw cause;process.stdout.write("nonregular refused");}',
  );
  const child = Bun.spawn([process.execPath, '--no-env-file', '--config=/dev/null', entry], {
      cwd: fixture.root,
      env: { PATH: '/usr/bin:/bin' },
      stdout: 'pipe',
      stderr: 'pipe',
    }),
    outward = new Response(child.stdout).bytes(),
    diagnostic = new Response(child.stderr).bytes();
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
  }, 2000);
  try {
    const [status, stdout, stderr] = await Promise.all([child.exited, outward, diagnostic]);
    expect(status, Buffer.from(stderr).toString()).toBe(0);
    expect(Buffer.from(stdout).toString()).toBe('nonregular refused');
  } finally {
    clearTimeout(timer);
    child.kill('SIGKILL');
    await child.exited;
  }
});
it('refuses an old package profile even when every current toolkit byte and join fact is otherwise valid', () => {
  const fixture = createFixture();
  writeFileSync(fixture.manifest, packageManifestBytes(fixture.revision, fixture.identity));
  expect(() => readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
    'installed PUNI package manifest is invalid',
  );
});
it('refuses undeclared current package fields with an otherwise valid native toolkit', () => {
  const fixture = createFixture();
  const manifest: unknown = JSON.parse(readFileSync(fixture.manifest, 'utf8'));
  if (typeof manifest !== 'object' || manifest === null)
    throw new Error('controlled current manifest absent');
  writeFileSync(fixture.manifest, JSON.stringify({ ...manifest, unexpected: 'not admitted' }));
  expect(() => readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
    'installed PUNI package manifest is invalid',
  );
});

it('refuses package schema2 with all current toolkit and digest facts otherwise valid', () => {
  const fixture = createFixture();
  const manifest = JSON.parse(readFileSync(fixture.manifest, 'utf8')) as Record<string, unknown>;
  manifest['schemaVersion'] = 2;
  writeFileSync(fixture.manifest, JSON.stringify(manifest));
  expect(() => readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
    'installed PUNI package manifest is invalid',
  );
});

it('refuses an unreadable current package manifest with the installed boundary context', () => {
  const fixture = createFixture();
  chmodSync(fixture.manifest, 0o000);
  try {
    expect(() => readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
      'installed PUNI package manifest is unreadable',
    );
  } finally {
    chmodSync(fixture.manifest, 0o644);
  }
});
for (const field of ['sourceRevision', 'toolkitIdentity']) {
  it(
    'refuses malformed current installed ' + field + ' with every toolkit byte otherwise valid',
    () => {
      const fixture = createFixture(),
        manifest = JSON.parse(readFileSync(fixture.manifest, 'utf8')) as Record<string, unknown>;
      manifest[field] = 'invalid';
      writeFileSync(fixture.manifest, JSON.stringify(manifest));
      expect(() => readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
        'installed PUNI package manifest is invalid',
      );
    },
  );
}
