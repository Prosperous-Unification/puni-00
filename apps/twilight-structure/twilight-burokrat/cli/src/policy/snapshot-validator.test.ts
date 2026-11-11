import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'bun:test';

import { hashBytes } from '../evidence/content-manifest';

const roots: string[] = [];
const snapshotter = fileURLToPath(new URL('./snapshot-validator.ts', import.meta.url));
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni-snapshot-api-'));
  roots.push(root);
  const candidateDirectory = join(root, 'candidate');
  const trusted = join(root, 'trusted roles');
  mkdirSync(candidateDirectory);
  mkdirSync(trusted);
  const validatorPath = join(trusted, 'validator.ts');
  const dependency = join(trusted, 'dependency.ts');
  writeFileSync(dependency, "export const message = 'reviewed';\n");
  writeFileSync(
    validatorPath,
    "import { message } from './dependency'; process.stdout.write(message);\n",
  );
  const bindingPath = join(trusted, 'binding.json');
  const artifacts = [validatorPath, dependency].map((path) => ({
    path,
    sha256: hashBytes(readFileSync(path)),
  }));
  writeFileSync(bindingPath, JSON.stringify({ validator: { artifacts } }));
  const destination = join(root, 'captured.mjs');
  return {
    root,
    trusted,
    dependency,
    artifacts,
    request: { bindingPath, validatorPath, candidateDirectory, destination },
  };
}

function run(path: string, args: string[] = []) {
  return Bun.spawnSync([process.execPath, '--no-env-file', '--config=/dev/null', path, ...args], {
    env: {},
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

describe('import-safe selected snapshotter', () => {
  it('imports without reading ambient argv or starting a snapshot operation', () => {
    const child = Bun.spawnSync(
      [
        process.execPath,
        '--no-env-file',
        '--config=/dev/null',
        '--eval',
        'await import(' + JSON.stringify(snapshotter) + "); process.stdout.write('imported');",
      ],
      { env: {}, stdout: 'pipe', stderr: 'pipe' },
    );
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    expect(child.stdout.toString()).toBe('imported');
    expect(child.stderr.toString()).toBe('');
  });

  it('the typed API captures reviewed closure bytes and its bundle survives later source replacement', async () => {
    const fixture = createFixture();
    const { snapshotValidator } = await import('./snapshot-validator');
    await snapshotValidator(fixture.request);
    writeFileSync(fixture.dependency, "export const message = 'unreviewed';\n");
    const child = run(fixture.request.destination);
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    expect(child.stdout.toString()).toBe('reviewed');
    expect(child.stderr.toString()).toBe('');
  });

  it('retains the selected role four-path process protocol', () => {
    const fixture = createFixture();
    const request = fixture.request;
    const child = run(snapshotter, [
      request.bindingPath,
      request.validatorPath,
      request.candidateDirectory,
      request.destination,
    ]);
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    expect(child.stdout.toString()).toBe('');
    const captured = run(request.destination);
    expect(captured.exitCode, captured.stderr.toString()).toBe(0);
    expect(captured.stdout.toString()).toBe('reviewed');
  });

  it('refuses a malformed role invocation before reading paths', () => {
    const child = run(snapshotter, ['/absent']);
    expect(child.exitCode).toBe(1);
    expect(child.stdout.toString()).toBe('');
    expect(child.stderr.toString()).toContain(
      'usage: snapshot <binding> <cli> <candidate> <output>',
    );
  });
});

it('refuses an extra role argument before writing its otherwise valid destination', () => {
  const fixture = createFixture();
  const request = fixture.request;
  const child = run(snapshotter, [
    request.bindingPath,
    request.validatorPath,
    request.candidateDirectory,
    request.destination,
    'unreviewed-extra',
  ]);
  expect(child.exitCode).toBe(1);
  expect(child.stdout.toString()).toBe('');
  expect(child.stderr.toString()).toContain('usage: snapshot <binding> <cli> <candidate> <output>');
  expect(existsSync(request.destination)).toBe(false);
});
