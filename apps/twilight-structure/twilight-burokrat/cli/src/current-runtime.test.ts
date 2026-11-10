import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { afterAll, beforeAll, expect, it } from 'bun:test';

import { hashBytes } from './evidence/content-manifest';
import { packageManifestBytes } from './packaging/manifest';
import { createPuniManifest } from './packaging/puni-manifest';
import { planBunToolkit } from './policy/bun-release';
import { buildValidatorBundle, hashTrustedModules } from './policy/trusted-modules';
import { executeCurrentRequest } from './runtime-facade';

const roots: string[] = [];
let validator: Uint8Array;
beforeAll(async () => {
  validator = await buildValidatorBundle(join(import.meta.dir, 'cli.ts'));
});
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function createFixture(bytes = validator) {
  const root = mkdtempSync(join(tmpdir(), 'puni current ordinary runtime '));
  roots.push(root);
  const directory = join(root, 'dist'),
    toolkit = join(directory, 'toolkit'),
    caller = join(root, 'caller');
  mkdirSync(caller);
  const closure = join(toolkit, 'trusted-node-modules');
  mkdirSync(closure, { recursive: true });
  // Ordinary execution fixture: the actual validator or an explicit binary-status peer executes;
  // other structural roles are inert and do not establish all-five-role producer usability.
  const roleBytes = {
    'launcher.mjs': Buffer.from('export{};'),
    'snapshotter.ts': Buffer.from('export{};'),
    'validator.mjs': bytes,
    'prepare-activation.mjs': Buffer.from('export{};'),
    'prepare-relocation-activation.mjs': Buffer.from('export{};'),
  };
  for (const [role, contents] of Object.entries(roleBytes))
    writeFileSync(join(toolkit, role), contents);
  const plan = planBunToolkit({
    tag: 'puni-v0.3.0',
    sourceRevision: 'a'.repeat(40),
    bunVersion: Bun.version,
    roleBytes,
    trustedNodeModules: [],
    trustedNodeModulesIdentity: hashTrustedModules(closure),
  });
  writeFileSync(join(toolkit, 'toolkit.json'), plan.descriptor);
  writeFileSync(
    join(directory, 'package-manifest.json'),
    createPuniManifest('a'.repeat(40), hashBytes(plan.descriptor)),
  );
  const stdout: Uint8Array[] = [],
    stderr: Uint8Array[] = [],
    launches: string[] = [];
  return {
    root,
    directory,
    toolkit,
    caller,
    stdout,
    stderr,
    launches,
    context: {
      installedDirectory: directory,
      callerDirectory: caller,
      path: '/usr/bin:/bin',
      launch(entry: string) {
        launches.push(entry);
        return createLaunch(process.execPath, entry);
      },
      stdout(chunk: string | Uint8Array) {
        stdout.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk.slice());
      },
      stderr(chunk: string | Uint8Array) {
        stderr.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk.slice());
      },
    },
  };
}

it('executes the actual current template handler through the verified toolkit2 child', () => {
  const fixture = createFixture();
  expect(executeCurrentRequest({ command: 'template', action: 'list' }, fixture.context)).toBe(0);
  expect(Buffer.concat(fixture.stdout).toString()).toContain('"id":"module"');
  expect(Buffer.concat(fixture.stderr).length).toBe(0);
  expect(fixture.launches).toEqual([join(fixture.toolkit, 'validator.mjs')]);
});

it('preserves current ordinary binary output and exact nonzero verdict37', () => {
  const fixture = createFixture(
    Buffer.from(
      'await Bun.stdin.bytes();process.stdout.write(Uint8Array.from([0,255,10]));process.stderr.write(Uint8Array.from([254,0,13]));process.exit(37);',
    ),
  );
  expect(executeCurrentRequest({ command: 'template', action: 'list' }, fixture.context)).toBe(37);
  expect(Buffer.concat(fixture.stdout)).toEqual(Buffer.from([0, 255, 10]));
  expect(Buffer.concat(fixture.stderr)).toEqual(Buffer.from([254, 0, 13]));
});

it('selects native current installation before joining its toolkit child', () => {
  const lexical = createFixture(
      Buffer.from('throw new Error("lexical installation must not run");'),
    ),
    native = createFixture();
  mkdirSync(join(native.directory, 'child'));
  const alias = join(lexical.directory, 'alias');
  symlinkSync(join(native.directory, 'child'), alias);
  expect(
    executeCurrentRequest(
      { command: 'template', action: 'list' },
      { ...native.context, installedDirectory: alias + '/..' },
    ),
  ).toBe(0);
  expect(native.launches).toEqual([join(native.toolkit, 'validator.mjs')]);
});

it('refuses an independently candidate-targeted current validator before reading workflow inputs', async () => {
  const fixture = createFixture(),
    target = join(fixture.caller, 'candidate-validator.mjs');
  writeFileSync(target, validator);
  rmSync(join(fixture.toolkit, 'validator.mjs'));
  symlinkSync(target, join(fixture.toolkit, 'validator.mjs'));
  const cause: unknown = await Promise.resolve()
    .then(() =>
      executeCurrentRequest(
        { command: 'validate workflow-binding', file: 'absent.json', steps: ['development'] },
        fixture.context,
      ),
    )
    .then(
      () => undefined,
      (failure: unknown) => failure,
    );
  expect(String(cause)).toContain('validator.mjs must be outside the candidate repository');
  expect(fixture.launches.length).toBe(0);
});

it('refuses a complete old package profile with valid toolkit2 before ordinary candidate Git or launch', async () => {
  const fixture = createFixture(),
    tools = join(fixture.root, 'tools'),
    marker = join(fixture.root, 'git-queried');
  mkdirSync(tools);
  const git = join(tools, 'git');
  writeFileSync(
    git,
    '#!/usr/bin/env bun\nawait Bun.write(' +
      JSON.stringify(marker) +
      ',"queried");process.exit(77);\n',
  );
  chmodSync(git, 0o755);
  writeFileSync(
    join(fixture.directory, 'package-manifest.json'),
    packageManifestBytes(
      'a'.repeat(40),
      hashBytes(readFileSync(join(fixture.toolkit, 'toolkit.json'))),
    ),
  );
  const cause: unknown = await Promise.resolve()
    .then(() =>
      executeCurrentRequest(
        {
          command: 'lint-ci',
          kind: 'committed',
          repository: fixture.caller,
          revision: 'a'.repeat(40),
          evidence: 'absent-evidence.json',
        },
        {
          ...fixture.context,
          path:
            tools +
            ':' +
            process.execPath.slice(0, process.execPath.lastIndexOf('/')) +
            ':/usr/bin:/bin',
        },
      ),
    )
    .then(
      () => undefined,
      (failure: unknown) => failure,
    );
  expect(fixture.launches).toEqual([]);
  expect(existsSync(marker)).toBe(false);
  expect(fixture.stdout).toEqual([]);
  expect(String(cause)).toContain('installed PUNI package manifest is invalid');
});
