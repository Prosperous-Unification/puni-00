import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import { serializeCanonical } from '../evidence/content-manifest';
import { preparePackageRelease, type RegistryVersionState, verifyPackageRelease } from './release';
import { lookupRegistryVersion } from './release-cli';

const scratchRoots: string[] = [];

function scratch(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  scratchRoots.push(root);
  return root;
}

function run(command: string[], cwd: string): string {
  const invocation = Bun.spawnSync(command, { cwd, stderr: 'pipe', stdout: 'pipe' });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}

function fixture(
  options: {
    identityRevision?: string;
    missingAsset?: boolean;
    missingTrustedModules?: boolean;
    packedVersion?: string;
    version?: string;
  } = {},
) {
  const root = scratch('twilight-bureaucrat-release-');
  const repository = join(root, 'repository');
  const packageRoot = join(root, 'package/package');
  const version = options.version ?? '0.1.0';
  const packedVersion = options.packedVersion ?? version;
  mkdirSync(join(repository, 'apps/wiki/cli'), { recursive: true });
  run(['git', 'init', '--initial-branch=main'], repository);
  run(['git', 'config', 'user.email', 'release@example.test'], repository);
  run(['git', 'config', 'user.name', 'Release Fixture'], repository);
  writeFileSync(
    join(repository, 'apps/wiki/cli/package.json'),
    `${JSON.stringify({ name: 'twilight-bureaucrat', version })}\n`,
  );
  run(['git', 'add', '--all'], repository);
  run(['git', 'commit', '--message', 'release package'], repository);
  const sourceRevision = run(['git', 'rev-parse', 'HEAD'], repository);
  const tag = `twilight-bureaucrat-v${version}`;
  run(['git', 'tag', '--annotate', tag, '--message', 'package release'], repository);

  mkdirSync(join(packageRoot, 'dist/toolkit'), { recursive: true });
  writeFileSync(
    join(packageRoot, 'package.json'),
    `${JSON.stringify({
      name: 'twilight-bureaucrat',
      version: packedVersion,
      bin: { 'twilight-bureaucrat': 'dist/bin.mjs' },
    })}\n`,
  );
  writeFileSync(join(packageRoot, 'dist/bin.mjs'), '#!/usr/bin/env bun\n');
  writeFileSync(
    join(packageRoot, 'dist/package-manifest.json'),
    serializeCanonical({
      packageVersion: packedVersion,
      schemaVersion: 1,
      sourceRevision: options.identityRevision ?? sourceRevision,
      toolkitIdentity: 'a'.repeat(64),
    }),
  );
  if (!options.missingAsset) {
    writeFileSync(join(packageRoot, 'dist/toolkit/toolkit.json'), '{}\n');
  }
  for (const asset of [
    'SHA256SUMS',
    'launcher.sh',
    'prepare-activation.mjs',
    'prepare-relocation-activation.mjs',
    'snapshotter.ts',
    'validator.mjs',
    ...(options.missingTrustedModules ? [] : ['trusted-node-modules/typescript/package.json']),
  ]) {
    const assetPath = join(packageRoot, 'dist/toolkit', asset);
    mkdirSync(dirname(assetPath), { recursive: true });
    writeFileSync(assetPath, '{}\n');
  }
  const tarball = join(root, `twilight-bureaucrat-${version}.tgz`);
  run(['tar', '-czf', tarball, '-C', join(root, 'package'), 'package'], root);
  return { repository, sourceRevision, tag, tarball, root };
}

async function refusal(action: Promise<unknown>): Promise<string> {
  try {
    await action;
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
  throw new Error('expected package release refusal');
}

const absent = (): Promise<RegistryVersionState> => Promise.resolve('absent');

afterAll(async () => {
  for (const root of scratchRoots.splice(0)) await rm(root, { force: true, recursive: true });
});

describe('package release planner', () => {
  test('distinguishes an absent version from unknown registry state', async () => {
    expect(
      await lookupRegistryVersion('twilight-bureaucrat', '0.1.0', () => ({
        exitCode: 1,
        stderr: new TextEncoder().encode('404 Not Found'),
        stdout: new Uint8Array(),
      })),
    ).toBe('absent');
    expect(
      await refusal(
        lookupRegistryVersion('twilight-bureaucrat', '0.1.0', () => ({
          exitCode: 1,
          stderr: new TextEncoder().encode('registry timed out'),
          stdout: new Uint8Array(),
        })),
      ),
    ).toContain('cannot determine registry version state: registry timed out');
  });

  test('binds the tested tarball and verifies the transferred bytes', async () => {
    const release = fixture();
    const record = join(release.root, 'release.json');
    const planned = await preparePackageRelease(
      {
        record,
        repository: release.repository,
        tag: release.tag,
        tarball: release.tarball,
      },
      absent,
    );
    expect(planned.sourceRevision).toBe(release.sourceRevision);
    expect(planned.version).toBe('0.1.0');
    expect(planned.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(planned.integrity).toMatch(/^sha512-/);
    expect(verifyPackageRelease(record, release.tarball)).toEqual(planned);

    const invalidRecord = join(release.root, 'invalid-release.json');
    writeFileSync(invalidRecord, '{}\n');
    expect(() => verifyPackageRelease(invalidRecord, release.tarball)).toThrow(
      'package release record has invalid fields',
    );

    const renamed = join(release.root, 'renamed.tgz');
    copyFileSync(release.tarball, renamed);
    expect(() => verifyPackageRelease(record, renamed)).toThrow(
      'transferred package name differs from release record',
    );

    writeFileSync(release.tarball, 'changed bytes', { flag: 'a' });
    expect(() => verifyPackageRelease(record, release.tarball)).toThrow(
      'transferred package digest differs from release record',
    );
  });

  test('refuses tag/version mismatch and dirty source', async () => {
    const mismatched = fixture();
    run(
      ['git', 'tag', '--annotate', 'twilight-bureaucrat-v0.2.0', '--message', 'wrong version'],
      mismatched.repository,
    );
    expect(
      await refusal(
        preparePackageRelease(
          {
            record: join(mismatched.root, 'release.json'),
            repository: mismatched.repository,
            tag: 'twilight-bureaucrat-v0.2.0',
            tarball: mismatched.tarball,
          },
          absent,
        ),
      ),
    ).toContain('release tag version differs from source package');

    const dirty = fixture();
    writeFileSync(join(dirty.repository, 'untracked.txt'), 'dirty\n');
    expect(
      await refusal(
        preparePackageRelease(
          {
            record: join(dirty.root, 'release.json'),
            repository: dirty.repository,
            tag: dirty.tag,
            tarball: dirty.tarball,
          },
          absent,
        ),
      ),
    ).toContain('release checkout is dirty: untracked.txt');
  });

  test('refuses malformed, unknown and misplaced release tags', async () => {
    const release = fixture();
    for (const tag of ['twilight-bureaucrat-v1', 'wiki-v0.1.0']) {
      expect(
        await refusal(
          preparePackageRelease(
            {
              record: join(release.root, `${tag}.json`),
              repository: release.repository,
              tag,
              tarball: release.tarball,
            },
            absent,
          ),
        ),
      ).toContain('release tag is malformed');
    }
    expect(
      await refusal(
        preparePackageRelease(
          {
            record: join(release.root, 'unknown.json'),
            repository: release.repository,
            tag: 'twilight-bureaucrat-v9.9.9',
            tarball: release.tarball,
          },
          absent,
        ),
      ),
    ).toContain('release tag is unknown');

    writeFileSync(join(release.repository, 'later.txt'), 'later\n');
    run(['git', 'add', '--all'], release.repository);
    run(['git', 'commit', '--message', 'later commit'], release.repository);
    expect(
      await refusal(
        preparePackageRelease(
          {
            record: join(release.root, 'misplaced.json'),
            repository: release.repository,
            tag: release.tag,
            tarball: release.tarball,
          },
          absent,
        ),
      ),
    ).toContain('release tag is not at HEAD');
  });

  test('refuses a missing packaged asset and a version that already exists', async () => {
    const incomplete = fixture({ missingAsset: true });
    expect(
      await refusal(
        preparePackageRelease(
          {
            record: join(incomplete.root, 'release.json'),
            repository: incomplete.repository,
            tag: incomplete.tag,
            tarball: incomplete.tarball,
          },
          absent,
        ),
      ),
    ).toContain('package asset is absent: package/dist/toolkit/toolkit.json');

    const published = fixture();
    expect(
      await refusal(
        preparePackageRelease(
          {
            record: join(published.root, 'release.json'),
            repository: published.repository,
            tag: published.tag,
            tarball: published.tarball,
          },
          () => Promise.resolve('present'),
        ),
      ),
    ).toContain('registry version already exists: twilight-bureaucrat@0.1.0');
    expect(existsSync(join(published.root, 'release.json'))).toBe(false);
  });

  test('refuses incomplete closure, packed identity drift and an occupied record', async () => {
    const noClosure = fixture({ missingTrustedModules: true });
    expect(
      await refusal(
        preparePackageRelease(
          {
            record: join(noClosure.root, 'release.json'),
            repository: noClosure.repository,
            tag: noClosure.tag,
            tarball: noClosure.tarball,
          },
          absent,
        ),
      ),
    ).toContain('package asset is absent: package/dist/toolkit/trusted-node-modules/');

    const wrongVersion = fixture({ packedVersion: '0.2.0' });
    expect(
      await refusal(
        preparePackageRelease(
          {
            record: join(wrongVersion.root, 'release.json'),
            repository: wrongVersion.repository,
            tag: wrongVersion.tag,
            tarball: wrongVersion.tarball,
          },
          absent,
        ),
      ),
    ).toContain('packed package identity differs from release tag');

    const wrongRevision = fixture({ identityRevision: 'b'.repeat(40) });
    expect(
      await refusal(
        preparePackageRelease(
          {
            record: join(wrongRevision.root, 'release.json'),
            repository: wrongRevision.repository,
            tag: wrongRevision.tag,
            tarball: wrongRevision.tarball,
          },
          absent,
        ),
      ),
    ).toContain('packed package identity differs from tagged source');

    const occupied = fixture();
    const record = join(occupied.root, 'release.json');
    writeFileSync(record, '{}\n');
    expect(
      await refusal(
        preparePackageRelease(
          {
            record,
            repository: occupied.repository,
            tag: occupied.tag,
            tarball: occupied.tarball,
          },
          absent,
        ),
      ),
    ).toContain('package release record already exists');
  });
});
