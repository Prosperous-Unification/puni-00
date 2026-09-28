import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { loadPublicEmailPolicy } from './public-email-policy';

const source = new URL('../../../domain/domain/src/', import.meta.url);
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function policyCopy(): string {
  const directory = mkdtempSync(join(tmpdir(), 'domain-policy-'));
  directories.push(directory);
  for (const file of ['public-email-policy.v1.json', 'public-email-policy.manifest.json'])
    copyFileSync(new URL(file, source), join(directory, file));
  return directory;
}

function pinAsset(directory: string, content: string): void {
  const manifest = JSON.parse(
    readFileSync(join(directory, 'public-email-policy.manifest.json'), 'utf8'),
  ) as { sha256: string };
  manifest.sha256 = createHash('sha256').update(content).digest('hex');
  writeFileSync(join(directory, 'public-email-policy.manifest.json'), JSON.stringify(manifest));
}

describe('checked public email policy', () => {
  it('throws on absent, unreadable, malformed and checksum-invalid trusted state', () => {
    const directory = policyCopy();
    expect(loadPublicEmailPolicy(directory).providers.has('gmail.com')).toBe(true);
    rmSync(join(directory, 'public-email-policy.v1.json'));
    expect(() => loadPublicEmailPolicy(directory)).toThrow();
    const unreadable = policyCopy();
    rmSync(join(unreadable, 'public-email-policy.v1.json'));
    mkdirSync(join(unreadable, 'public-email-policy.v1.json'));
    expect(() => loadPublicEmailPolicy(unreadable)).toThrow();
    const malformed = policyCopy();
    writeFileSync(join(malformed, 'public-email-policy.v1.json'), '{');
    pinAsset(malformed, '{');
    expect(() => loadPublicEmailPolicy(malformed)).toThrow();
    const invalid = policyCopy();
    const policy = readFileSync(join(invalid, 'public-email-policy.v1.json'), 'utf8');
    writeFileSync(
      join(invalid, 'public-email-policy.v1.json'),
      policy.replace('gmail.com', 'gmaix.com'),
    );
    expect(() => loadPublicEmailPolicy(invalid)).toThrow('checksum');
  });

  it('keeps provider, relay and suffix rules in the reviewed revision', () => {
    const policy = loadPublicEmailPolicy();
    expect(policy.revision).toBe('2026-09-28.1');
    expect(policy.providers.has('gmail.com')).toBe(true);
    expect(policy.relays.has('privaterelay.appleid.com')).toBe(true);
    expect(policy.suffixes.has('co.uk')).toBe(true);
  });

  it('loads checked assets beside a bundled backend module', () => {
    const directory = mkdtempSync(join(tmpdir(), 'domain-policy-bundle-'));
    directories.push(directory);
    const bundled = Bun.spawnSync({
      cmd: [
        'bun',
        'build',
        'libs/wbs/adapters/store-sqlite/src/public-email-policy.ts',
        '--target=bun',
        `--outfile=${join(directory, 'main.js')}`,
      ],
      cwd: new URL('../../../../../', import.meta.url).pathname,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(bundled.exitCode).toBe(0);
    const assets = join(directory, 'public-email-policy');
    mkdirSync(assets);
    for (const file of ['public-email-policy.v1.json', 'public-email-policy.manifest.json'])
      copyFileSync(new URL(file, source), join(assets, file));
    const loaded = Bun.spawnSync({
      cmd: [
        'bun',
        '-e',
        `import { loadPublicEmailPolicy } from ${JSON.stringify(join(directory, 'main.js'))}; if (!loadPublicEmailPolicy().providers.has('gmail.com')) throw new Error('provider missing')`,
      ],
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(loaded.stderr.toString()).toBe('');
    expect(loaded.exitCode).toBe(0);
    rmSync(join(assets, 'public-email-policy.manifest.json'));
    const missing = Bun.spawnSync({
      cmd: [
        'bun',
        '-e',
        `import { loadPublicEmailPolicy } from ${JSON.stringify(join(directory, 'main.js'))}; loadPublicEmailPolicy()`,
      ],
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(missing.exitCode).not.toBe(0);
    expect(missing.stderr.toString()).toContain('ENOENT');
  });

  it('refuses a changed policy licence or PSL package revision', () => {
    for (const [field, replacement] of [
      ['license', 'unknown'],
      ['suffixPackage', 'tldts@0.0.0'],
    ] as const) {
      const directory = policyCopy();
      const manifestPath = join(directory, 'public-email-policy.manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, string>;
      manifest[field] = replacement;
      writeFileSync(manifestPath, JSON.stringify(manifest));
      expect(() => loadPublicEmailPolicy(directory)).toThrow('manifest');
    }
  });
});
