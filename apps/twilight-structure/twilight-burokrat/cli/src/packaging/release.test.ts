import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import { serializeCanonical } from '../evidence/content-manifest';
import { preparePackageRelease, type RegistryVersionState, verifyPackageRelease } from './release';
import {
  assertGitHubReleaseAbsent,
  lookupRegistryVersion,
  verifyPublishedPackage,
} from './release-cli';

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
    unlicensed?: boolean;
    version?: string;
  } = {},
) {
  const root = scratch('twilight-burokrat-release-');
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
    `${JSON.stringify({
      name: 'twilight-burokrat',
      version,
      license: options.unlicensed ? 'UNLICENSED' : 'MIT',
    })}\n`,
  );
  if (!options.unlicensed)
    writeFileSync(join(repository, 'apps/wiki/cli/LICENSE'), 'fixture license\n');
  run(['git', 'add', '--all'], repository);
  run(['git', 'commit', '--message', 'release package'], repository);
  const sourceRevision = run(['git', 'rev-parse', 'HEAD'], repository);
  const tag = `twilight-burokrat-v${version}`;
  run(['git', 'tag', '--annotate', tag, '--message', 'package release'], repository);

  mkdirSync(join(packageRoot, 'dist/toolkit'), { recursive: true });
  writeFileSync(
    join(packageRoot, 'package.json'),
    `${JSON.stringify({
      name: 'twilight-burokrat',
      version: packedVersion,
      license: options.unlicensed ? 'UNLICENSED' : 'MIT',
      bin: { 'twilight-burokrat': 'dist/bin.mjs' },
    })}\n`,
  );
  if (!options.unlicensed) writeFileSync(join(packageRoot, 'LICENSE'), 'fixture license\n');
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
  const tarball = join(root, `twilight-burokrat-${version}.tgz`);
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
  test('workflow pins both checkouts and performs executable release-state proofs', () => {
    const workflow = readFileSync(
      join(import.meta.dir, '../../../../../.github/workflows/twilight-burokrat-release.yml'),
      'utf8',
    );
    expect(workflow.match(/ref: \$\{\{ github\.sha \}\}/g)).toHaveLength(2);
    expect(workflow).not.toContain('ref: ${{ github.ref }}');
    // The verify job's checkout must carry the whole history: the root-migration check reads its
    // historical source commit through git, and the first tagged run failed every one of its cases
    // on a depth-1 clone with `fatal: Needed a single revision`.
    // Proof: removing `fetch-depth: 0` from the verify checkout failed this assertion with
    // `Received value does not have a length property: null` (2026-09-22).
    const verifyCheckout = workflow.slice(
      workflow.indexOf('  verify:'),
      workflow.indexOf('  publish:'),
    );
    expect(verifyCheckout.match(/fetch-depth: 0/g)).toHaveLength(1);
    expect(workflow).toContain(
      'git fetch --no-tags origin "+refs/tags/$GITHUB_REF_NAME:refs/tags/$GITHUB_REF_NAME"',
    );
    expect(workflow).toContain('sudo apt-get install --yes --no-install-recommends bubblewrap');
    expect(workflow).toContain(
      'bwrap --die-with-parent --new-session --ro-bind / / --dev /dev --proc /proc true',
    );
    expect(workflow).toContain('github-release-absent --status "$status"');
    expect(workflow).toContain('verify-registry --record "$record"');
    expect(workflow).toContain('bun add --exact --ignore-scripts twilight-burokrat@0.1.0');
  });

  test('distinguishes an absent GitHub release from existing and unknown states', () => {
    assertGitHubReleaseAbsent('404');
    expect(() => {
      assertGitHubReleaseAbsent('200');
    }).toThrow('GitHub release already exists');
    expect(() => {
      assertGitHubReleaseAbsent('500');
    }).toThrow('cannot determine GitHub release state: HTTP 500');
  });

  test('distinguishes an absent version from unknown registry state', async () => {
    expect(
      await lookupRegistryVersion('twilight-burokrat', '0.1.0', () => ({
        exitCode: 1,
        stderr: new TextEncoder().encode('404 Not Found'),
        stdout: new Uint8Array(),
      })),
    ).toBe('absent');
    expect(
      await refusal(
        lookupRegistryVersion('twilight-burokrat', '0.1.0', () => ({
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

    let registryAttempts = 0;
    expect(
      await verifyPublishedPackage(
        record,
        () => {
          registryAttempts += 1;
          return registryAttempts === 1
            ? {
                exitCode: 1,
                stderr: new TextEncoder().encode('404 Not Found'),
                stdout: new Uint8Array(),
              }
            : {
                exitCode: 0,
                stderr: new Uint8Array(),
                stdout: new TextEncoder().encode(
                  JSON.stringify({ dist: { integrity: planned.integrity } }),
                ),
              };
        },
        () => Promise.resolve(),
      ),
    ).toBe(`twilight-burokrat@0.1.0 ${planned.integrity}`);

    expect(
      await refusal(
        verifyPublishedPackage(
          record,
          () => ({
            exitCode: 0,
            stderr: new Uint8Array(),
            stdout: new TextEncoder().encode(
              JSON.stringify({ dist: { integrity: `sha512-${'x'.repeat(32)}` } }),
            ),
          }),
          () => Promise.resolve(),
        ),
      ),
    ).toContain('published registry integrity differs from release record');

    expect(
      await refusal(
        verifyPublishedPackage(
          record,
          () => ({
            exitCode: 0,
            stderr: new Uint8Array(),
            stdout: new TextEncoder().encode('{'),
          }),
          () => Promise.resolve(),
        ),
      ),
    ).toContain('published registry metadata is malformed');

    expect(
      await refusal(
        verifyPublishedPackage(
          record,
          () => ({
            exitCode: 1,
            stderr: new TextEncoder().encode('registry timed out'),
            stdout: new Uint8Array(),
          }),
          () => Promise.resolve(),
        ),
      ),
    ).toContain('cannot read published registry package: registry timed out');

    expect(
      await refusal(
        verifyPublishedPackage(
          record,
          () => ({
            exitCode: 1,
            stderr: new TextEncoder().encode('404 Not Found'),
            stdout: new Uint8Array(),
          }),
          () => Promise.resolve(),
        ),
      ),
    ).toContain('published registry package did not become readable');

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
      ['git', 'tag', '--annotate', 'twilight-burokrat-v0.2.0', '--message', 'wrong version'],
      mismatched.repository,
    );
    expect(
      await refusal(
        preparePackageRelease(
          {
            record: join(mismatched.root, 'release.json'),
            repository: mismatched.repository,
            tag: 'twilight-burokrat-v0.2.0',
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

  test('refuses publication without distribution rights or the workflow event commit', async () => {
    const unlicensed = fixture({ unlicensed: true });
    expect(
      await refusal(
        preparePackageRelease(
          {
            record: join(unlicensed.root, 'release.json'),
            repository: unlicensed.repository,
            tag: unlicensed.tag,
            tarball: unlicensed.tarball,
          },
          absent,
        ),
      ),
    ).toContain('package publication requires a source distribution license');

    const wrongEvent = fixture();
    expect(
      await refusal(
        preparePackageRelease(
          {
            eventRevision: 'f'.repeat(40),
            record: join(wrongEvent.root, 'release.json'),
            repository: wrongEvent.repository,
            tag: wrongEvent.tag,
            tarball: wrongEvent.tarball,
          },
          absent,
        ),
      ),
    ).toContain('release tag differs from workflow event');
  });

  test('refuses malformed, unknown and misplaced release tags', async () => {
    const release = fixture();
    for (const tag of ['twilight-burokrat-v1', 'wiki-v0.1.0']) {
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
            tag: 'twilight-burokrat-v9.9.9',
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

  test('prepares from a SHA-only checkout after fetching the immutable event tag', async () => {
    const release = fixture();
    const checkout = join(release.root, 'sha-checkout');
    run(['git', 'clone', '--no-local', '--no-tags', release.repository, checkout], release.root);
    run(['git', 'checkout', '--detach', release.sourceRevision], checkout);
    expect(
      await refusal(
        preparePackageRelease(
          {
            eventRevision: release.sourceRevision,
            record: join(release.root, 'before-fetch.json'),
            repository: checkout,
            tag: release.tag,
            tarball: release.tarball,
          },
          absent,
        ),
      ),
    ).toContain('release tag is unknown');
    run(
      ['git', 'fetch', '--no-tags', 'origin', `+refs/tags/${release.tag}:refs/tags/${release.tag}`],
      checkout,
    );
    const planned = await preparePackageRelease(
      {
        eventRevision: release.sourceRevision,
        record: join(release.root, 'after-fetch.json'),
        repository: checkout,
        tag: release.tag,
        tarball: release.tarball,
      },
      absent,
    );
    expect(planned.sourceRevision).toBe(release.sourceRevision);
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
    ).toContain('registry version already exists: twilight-burokrat@0.1.0');
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
