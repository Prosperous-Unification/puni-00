import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  dirname as pathDirectory,
  isAbsolute as isAbsolutePath,
  relative as relativePath,
  resolve as resolvePath,
} from 'node:path';
import { delimiter, join } from 'node:path';
import { fileURLToPath as readFileUrl, pathToFileURL as createFileUrl } from 'node:url';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { createLaunch, createShebang } from '@shared/bun-startup';
import { afterEach, beforeAll, describe, expect, it } from 'bun:test';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import { createGitEnvironment } from '../git-environment';
import * as preflight from '../installed-lint';
import type { LintInterrupt } from '../lint-interrupts';
import { readLintRuntime } from '../lint-runtime';
import { buildLintLauncher } from '../policy/build-lint-launcher';
import { planSelectedBunToolkit } from '../policy/selected-bun-release';
import { hashTrustedModules } from '../policy/trusted-modules';
import * as installed from './installed';
import { packageManifestBytes, packageVersion } from './manifest';
import { createPuniManifest, puniVersion } from './puni-manifest';
import {
  createPuniTestLevelManifest,
  createTestLevelAssets,
  testLevelPackageVersion,
} from './puni-test-levels';

let launcher: Uint8Array;
const roots: string[] = [];
beforeAll(async () => {
  launcher = await buildLintLauncher();
});
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function createFixture(schemaVersion: 1 | 2) {
  const root = mkdtempSync(join(tmpdir(), 'puni-installed-current-'));
  roots.push(root);
  const directory = join(root, 'dist');
  const toolkit = join(directory, 'toolkit');
  const closure = join(toolkit, 'trusted-node-modules');
  mkdirSync(join(closure, 'typescript'), { recursive: true });
  writeFileSync(join(closure, 'typescript/package.json'), '{}\n');
  const names = [
    schemaVersion === 1 ? 'launcher.sh' : 'launcher.mjs',
    'snapshotter.ts',
    'validator.mjs',
    'prepare-activation.mjs',
    'prepare-relocation-activation.mjs',
  ];
  const roles: Record<string, string> = {};
  for (const name of names) {
    const bytes =
      name === 'launcher.mjs'
        ? launcher
        : new TextEncoder().encode(
            'export const fixture = ' + JSON.stringify(root + '/' + name) + ';\n',
          );
    writeFileSync(join(toolkit, name), bytes);
    roles[name] = hashBytes(bytes);
  }
  const descriptor = {
    schemaVersion,
    tag: 'puni-v' + (schemaVersion === 2 ? puniVersion : packageVersion),
    sourceRevision: 'a'.repeat(40),
    bunVersion: Bun.version,
    roles,
    trustedNodeModules: ['typescript'],
    trustedNodeModulesIdentity: hashTrustedModules(closure),
  };
  const descriptorBytes = serializeCanonical(descriptor);
  writeFileSync(join(toolkit, 'toolkit.json'), descriptorBytes);
  const identity = hashBytes(new TextEncoder().encode(descriptorBytes));
  const manifest = join(directory, 'package-manifest.json');
  writeFileSync(
    manifest,
    (schemaVersion === 2 ? createPuniManifest : packageManifestBytes)(
      descriptor.sourceRevision,
      identity,
    ),
  );
  return { root, directory, toolkit, closure, descriptor, identity, manifest };
}

/** Current installer envelope fixture; byte consistency supplies no release or source provenance. */
function createCurrentFixture() {
  const fixture = createFixture(2);
  const closure = join(fixture.toolkit, 'node_modules');
  renameSync(fixture.closure, closure);
  for (const path of ['playwright/cli.js', 'vite/bin/vite.js', 'nx/dist/bin/nx.js']) {
    const target = join(closure, path);
    mkdirSync(pathDirectory(target), { recursive: true });
    writeFileSync(target, 'export {};\n');
  }
  const sourceSelection = {
    kind: 'committed' as const,
    revision: 'a'.repeat(40),
    tree: 'b'.repeat(40),
  };
  const planned = planSelectedBunToolkit({
    tag: 'puni-v' + testLevelPackageVersion,
    sourceRevision: sourceSelection.revision,
    bunVersion: Bun.version,
    roleBytes: {
      'launcher.mjs': launcher,
      'snapshotter.ts': readFileSync(join(fixture.toolkit, 'snapshotter.ts')),
      'validator.mjs': readFileSync(join(fixture.toolkit, 'validator.mjs')),
      'prepare-activation.mjs': readFileSync(join(fixture.toolkit, 'prepare-activation.mjs')),
      'prepare-relocation-activation.mjs': readFileSync(
        join(fixture.toolkit, 'prepare-relocation-activation.mjs'),
      ),
    },
    trustedNodeModules: ['typescript', 'playwright', 'vite', 'nx'],
    trustedNodeModulesIdentity: hashTrustedModules(closure),
    sourceSelection,
  });
  writeFileSync(join(fixture.toolkit, 'toolkit.json'), planned.descriptor);
  const worker = Buffer.from('export {};\n');
  const source = Buffer.from(
    JSON.stringify({
      format: 'puni-test-level-source',
      version: 1,
      entrypoint: 'apps/puni/cli/src/entrypoint.ts',
      sourceSelection,
      files: [
        { path: 'apps/puni/cli/src/entrypoint.ts', mode: '100644', sha256: hashBytes(worker) },
      ],
    }),
  );
  writeFileSync(join(fixture.directory, 'performance-judge.mjs'), worker);
  writeFileSync(join(fixture.directory, 'test-level-source.json'), source);
  const assets = createTestLevelAssets(
    sourceSelection,
    Bun.version,
    hashTrustedModules(closure),
    hashBytes(worker),
    hashBytes(source),
  );
  writeFileSync(join(fixture.directory, 'test-level-assets.json'), assets);
  writeFileSync(
    fixture.manifest,
    createPuniTestLevelManifest(sourceSelection, hashBytes(planned.descriptor), hashBytes(assets)),
  );
  const verified = installed.readInstalledPuniToolkit(fixture.directory, fixture.toolkit);
  expect(verified.schemaVersion).toBe(3);
  return { root: fixture.root, directory: fixture.directory, sourceSelection };
}

describe('current installed toolkit identity', () => {
  it('reads a current package-bound toolkit carrying the actual Bun launcher', () => {
    const fixture = createFixture(2);
    const current = installed.readInstalledPuniToolkit(fixture.directory, fixture.toolkit);
    expect(current.schemaVersion).toBe(2);
    expect(current.digest).toBe(fixture.identity);
    expect(current.directory).toBe(fixture.toolkit);
    expect(current.roleBytes['launcher.mjs']).toEqual(launcher);
  });

  it('refuses historical format even when its Bun pin matches', () => {
    const fixture = createFixture(1);
    expect(() => installed.readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
      'installed PUNI package manifest is invalid',
    );
  });

  it('retains the existing legacy reader while current producers are not switched', () => {
    const fixture = createFixture(1);
    const bytes = readFileSync(fixture.manifest);
    const historical = installed.readInstalledToolkit(fixture.directory, fixture.toolkit);
    expect(historical.schemaVersion).toBe(1);
    expect(historical.digest).toBe(fixture.identity);
    expect(readFileSync(fixture.manifest)).toEqual(bytes);
  });

  it('refuses a current toolkit different from the authenticated package identity', () => {
    const fixture = createFixture(2);
    writeFileSync(
      fixture.manifest,
      createPuniManifest(fixture.descriptor.sourceRevision, 'b'.repeat(64)),
    );
    expect(() => installed.readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
      'installed toolkit differs from PUNI package manifest',
    );
  });

  it('preserves native symlink-parent authority between two valid installations', () => {
    const lexical = createFixture(2);
    const native = createFixture(2);
    const child = join(native.directory, 'child');
    mkdirSync(child);
    const alias = join(lexical.directory, 'alias');
    symlinkSync(child, alias);
    const selected = alias + '/..';
    const current = installed.readInstalledPuniToolkit(selected, selected + '/toolkit');
    expect(current.directory).toBe(native.toolkit);
    expect(current.digest).toBe(native.identity);
    expect(current.digest).not.toBe(lexical.identity);
  });
});

describe('installed package boundary failures', () => {
  for (const [label, reader] of [
    ['current', installed.readInstalledPuniToolkit],
    ['legacy', installed.readInstalledToolkit],
  ] as const) {
    const schemaVersion = label === 'current' ? 2 : 1;
    it(label + ' refuses an absent package manifest before reading a toolkit', () => {
      const fixture = createFixture(schemaVersion);
      rmSync(fixture.manifest);
      expect(() => reader(fixture.directory, fixture.toolkit + '-absent')).toThrow(
        'installed ' +
          (label === 'current' ? 'PUNI ' : '') +
          'package manifest is unreadable: ' +
          fixture.manifest,
      );
    });
    it(label + ' refuses an unreadable package manifest before reading a toolkit', () => {
      const fixture = createFixture(schemaVersion);
      rmSync(fixture.manifest);
      mkdirSync(fixture.manifest);
      expect(() => reader(fixture.directory, fixture.toolkit + '-absent')).toThrow(
        'installed ' +
          (label === 'current' ? 'PUNI ' : '') +
          'package manifest is unreadable: ' +
          fixture.manifest,
      );
    });
    it(label + ' refuses malformed package bytes before reading a toolkit', () => {
      const fixture = createFixture(schemaVersion);
      writeFileSync(fixture.manifest, '{');
      expect(() => reader(fixture.directory, fixture.toolkit + '-absent')).toThrow(
        'installed ' +
          (label === 'current' ? 'PUNI ' : '') +
          'package manifest is malformed: ' +
          fixture.manifest,
      );
    });
    it(label + ' refuses invalid package fields before reading a toolkit', () => {
      const fixture = createFixture(schemaVersion);
      writeFileSync(fixture.manifest, '{}');
      expect(() => reader(fixture.directory, fixture.toolkit + '-absent')).toThrow(
        'installed ' +
          (label === 'current' ? 'PUNI ' : '') +
          'package manifest is invalid: ' +
          fixture.manifest,
      );
    });
  }

  it('refuses a current toolkit built by another runtime', () => {
    const fixture = createFixture(2);
    const bytes = new TextEncoder().encode(
      serializeCanonical({ ...fixture.descriptor, bunVersion: '0.0.0-incompatible' }),
    );
    writeFileSync(join(fixture.toolkit, 'toolkit.json'), bytes);
    writeFileSync(
      fixture.manifest,
      createPuniManifest(fixture.descriptor.sourceRevision, hashBytes(bytes)),
    );
    expect(() => installed.readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
      'toolkit was built with another Bun',
    );
  });

  for (const role of [
    'launcher.mjs',
    'snapshotter.ts',
    'validator.mjs',
    'prepare-activation.mjs',
    'prepare-relocation-activation.mjs',
  ]) {
    it('refuses changed current role ' + role, () => {
      const fixture = createFixture(2);
      writeFileSync(join(fixture.toolkit, role), '// substituted bytes');
      expect(() => installed.readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
        'toolkit role differs from toolkit.json: ' + role,
      );
    });
    it('refuses missing current role ' + role, () => {
      const fixture = createFixture(2);
      rmSync(join(fixture.toolkit, role));
      expect(() => installed.readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
        'toolkit role is unreadable: ' + role,
      );
    });
  }

  it('refuses changed installed closure bytes', () => {
    const fixture = createFixture(2);
    writeFileSync(join(fixture.closure, 'typescript/package.json'), '{"changed":true}');
    expect(() => installed.readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
      'toolkit runtime closure differs from toolkit.json',
    );
  });

  it('refuses an absent closure', () => {
    const fixture = createFixture(2);
    rmSync(fixture.closure, { recursive: true });
    expect(() => installed.readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow();
  });

  it('refuses a closure file symlink even when its target bytes match', () => {
    const fixture = createFixture(2);
    const target = join(fixture.root, 'typescript.json');
    writeFileSync(target, '{}\n');
    const selected = join(fixture.closure, 'typescript/package.json');
    rmSync(selected);
    symlinkSync(target, selected);
    expect(() => installed.readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
      'trusted node modules carry a non-regular entry',
    );
  });
});

describe('nonblocking installed authority reads', () => {
  for (const version of [1, 2] as const) {
    const roles = [
      version === 1 ? 'launcher.sh' : 'launcher.mjs',
      'snapshotter.ts',
      'validator.mjs',
      'prepare-activation.mjs',
      'prepare-relocation-activation.mjs',
    ];
    for (const name of ['package-manifest.json', 'toolkit.json', ...roles]) {
      it(
        'refuses a format' + String(version) + ' FIFO ' + name + ' before reading bytes',
        async () => {
          const fixture = createFixture(version);
          const selected =
            name === 'package-manifest.json' ? fixture.manifest : join(fixture.toolkit, name);
          rmSync(selected);
          const created = Bun.spawnSync(['mkfifo', selected], { stdout: 'pipe', stderr: 'pipe' });
          expect(created.exitCode, created.stderr.toString()).toBe(0);
          const reader = version === 1 ? 'readInstalledToolkit' : 'readInstalledPuniToolkit';
          const program =
            'import { ' +
            reader +
            ' as read } from ' +
            JSON.stringify(join(import.meta.dir, 'installed.ts')) +
            '; try { read(' +
            JSON.stringify(fixture.directory) +
            ',' +
            JSON.stringify(fixture.toolkit) +
            '); console.log("admitted"); } catch (cause) { console.error(cause.message); process.exitCode = 78; }';
          const child = Bun.spawn(
            [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
            { stdout: 'pipe', stderr: 'pipe' },
          );
          const deadline = setTimeout(() => {
            child.kill('SIGKILL');
          }, 1500);
          let status: number;
          try {
            status = await child.exited;
          } finally {
            clearTimeout(deadline);
          }
          const stdout = await new Response(child.stdout).text();
          const stderr = await new Response(child.stderr).text();
          expect(status, stderr).toBe(78);
          expect(stdout).toBe('');
          expect(stderr).toContain(
            name === 'package-manifest.json'
              ? 'installed ' + (version === 2 ? 'PUNI ' : '') + 'package manifest is unreadable'
              : name === 'toolkit.json'
                ? 'toolkit descriptor is not a regular file'
                : 'toolkit role is unreadable: ' + name,
          );
        },
        5000,
      );
    }
  }
});

function readPath(): string {
  const path = process.env['PATH'];
  if (path === undefined) throw new Error('installed lint tests require explicit PATH');
  return path;
}
const trustedPath = readPath();
function createRepository(directory: string): string {
  mkdirSync(directory, { recursive: true });
  const child = Bun.spawnSync(['git', '-C', directory, 'init', '--initial-branch=main'], {
    env: createGitEnvironment(trustedPath),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  return directory;
}
function invokePreflight(
  fixture: ReturnType<typeof createFixture>,
  candidate: string,
  installedDirectory = fixture.directory,
) {
  return preflight.readInstalledLint(
    {
      version: 1,
      callerDirectory: fixture.root,
      request: { command: 'lint', kind: 'working', repository: candidate, revision: 'HEAD' },
    },
    {
      installedDirectory,
      runtime: readLintRuntime(trustedPath, fixture.root),
      subscribeInterrupts: () => () => undefined,
    },
  );
}

describe('current installed lint preflight', () => {
  it('verifies current bytes and discovers the actual root from an interior operand', async () => {
    const fixture = createFixture(2);
    const candidate = createRepository(join(fixture.root, 'candidate'));
    const interior = join(candidate, 'interior');
    mkdirSync(interior);
    const selected = await invokePreflight(fixture, interior);
    expect(selected.kind).toBe('ready');
    if (selected.kind !== 'ready') throw new Error('fixture unexpectedly cancelled');
    expect(selected.candidateDirectory).toBe(candidate);
    expect(selected.toolkit.digest).toBe(fixture.identity);
    expect(selected.runtime.directory).toBe(fixture.root);
  });

  it('derives the default toolkit only after native installation selection', async () => {
    const lexical = createFixture(2);
    const native = createFixture(2);
    const child = join(native.directory, 'child');
    mkdirSync(child);
    const alias = join(lexical.directory, 'alias');
    symlinkSync(child, alias);
    const candidate = createRepository(join(lexical.root, 'candidate'));
    const selected = await invokePreflight(lexical, candidate, alias + '/..');
    expect(selected.kind).toBe('ready');
    if (selected.kind !== 'ready') throw new Error('fixture unexpectedly cancelled');
    expect(selected.toolkit.directory).toBe(native.toolkit);
    expect(selected.toolkit.digest).toBe(native.identity);
  });

  it('keeps independent package and toolkit identities instead of substituting either', () => {
    const first = createFixture(2);
    const second = createFixture(2);
    expect(() => installed.readInstalledPuniToolkit(first.directory, second.toolkit)).toThrow(
      'installed toolkit differs from PUNI package manifest',
    );
    expect(() => installed.readInstalledPuniToolkit(second.directory, first.toolkit)).toThrow(
      'installed toolkit differs from PUNI package manifest',
    );
  });

  it('refuses installation equality with the actual candidate', async () => {
    const fixture = createFixture(2);
    createRepository(fixture.directory);
    await assertRefusal(
      invokePreflight(fixture, fixture.directory),
      'installation must be outside the candidate repository',
    );
  });

  it('refuses a toolkit cwd symlink into the candidate despite valid bytes', async () => {
    const fixture = createFixture(2);
    const candidate = createRepository(join(fixture.root, 'candidate'));
    const target = join(candidate, 'toolkit');
    renameSync(fixture.toolkit, target);
    symlinkSync(target, fixture.toolkit);
    await assertRefusal(
      invokePreflight(fixture, candidate),
      'toolkit cwd must be outside the candidate repository',
    );
  });

  for (const role of [
    'package-manifest.json',
    'toolkit.json',
    'launcher.mjs',
    'snapshotter.ts',
    'validator.mjs',
    'prepare-activation.mjs',
    'prepare-relocation-activation.mjs',
    'trusted-node-modules',
  ]) {
    it('refuses candidate-targeted ' + role + ' with unchanged valid digests', async () => {
      const fixture = createFixture(2);
      const candidate = createRepository(join(fixture.root, 'candidate'));
      const selected =
        role === 'package-manifest.json' ? fixture.manifest : join(fixture.toolkit, role);
      const target = join(candidate, role);
      renameSync(selected, target);
      symlinkSync(target, selected);
      const subject =
        role === 'package-manifest.json'
          ? 'package manifest'
          : role === 'toolkit.json'
            ? 'toolkit descriptor'
            : role === 'trusted-node-modules'
              ? 'runtime closure'
              : role;
      await assertRefusal(
        invokePreflight(fixture, candidate),
        subject + ' must be outside the candidate repository',
      );
    });
  }

  it('allows an installation ancestor when every authority asset is outside the candidate', async () => {
    const fixture = createFixture(2);
    const candidate = createRepository(join(fixture.directory, 'candidate'));
    expect((await invokePreflight(fixture, candidate)).kind).toBe('ready');
  });

  it('does not confuse neighboring path prefixes with containment', async () => {
    const fixture = createFixture(2);
    const candidate = createRepository(fixture.directory + '-candidate');
    expect((await invokePreflight(fixture, candidate)).kind).toBe('ready');
  });

  it('refuses a closure ancestor containing the candidate even with a valid recomputed identity', async () => {
    const fixture = createFixture(2);
    const candidate = createRepository(join(fixture.closure, 'candidate'));
    const bytes = new TextEncoder().encode(
      serializeCanonical({
        ...fixture.descriptor,
        trustedNodeModulesIdentity: hashTrustedModules(fixture.closure),
      }),
    );
    writeFileSync(join(fixture.toolkit, 'toolkit.json'), bytes);
    writeFileSync(
      fixture.manifest,
      createPuniManifest(fixture.descriptor.sourceRevision, hashBytes(bytes)),
    );
    await assertRefusal(
      invokePreflight(fixture, candidate),
      'runtime closure overlaps the candidate repository',
    );
  });

  it('returns prior cancellation before touching an absent installation', async () => {
    const selected = await preflight.readInstalledLint(
      {
        version: 1,
        callerDirectory: '/',
        request: {
          command: 'lint',
          kind: 'working',
          repository: '/absent-candidate',
          revision: 'HEAD',
        },
      },
      {
        installedDirectory: '/absent-installation',
        runtime: readLintRuntime(trustedPath, '/'),
        subscribeInterrupts: (listener) => {
          listener('SIGTERM');
          return () => undefined;
        },
      },
    );
    expect(selected).toEqual({ kind: 'cancelled', status: 143 });
  });
});

describe('installed lint preflight ordering and cancellation', () => {
  it('refuses a damaged package before accessing a nonexistent candidate', async () => {
    const fixture = createFixture(2);
    writeFileSync(fixture.manifest, '{');
    await assertRefusal(
      invokePreflight(fixture, '/absent-candidate'),
      'installed PUNI package manifest is malformed',
    );
  });
  it('binds the preflight toolkit to the expected package identity', async () => {
    const fixture = createFixture(2);
    const candidate = createRepository(join(fixture.root, 'candidate'));
    writeFileSync(
      fixture.manifest,
      createPuniManifest(fixture.descriptor.sourceRevision, 'b'.repeat(64)),
    );
    await assertRefusal(
      invokePreflight(fixture, candidate),
      'installed toolkit differs from PUNI package manifest',
    );
  });
  it('refuses historical execution through the preflight route', async () => {
    const fixture = createFixture(1);
    await assertRefusal(
      invokePreflight(fixture, '/absent-candidate'),
      'installed PUNI package manifest is invalid',
    );
  });

  for (const stage of ['version', 'root'] as const) {
    it(
      'propagates cancellation during the installed ' + stage + ' Git probe',
      async () => {
        const fixture = createFixture(2);
        const candidate = createRepository(join(fixture.root, 'candidate'));
        const bin = join(fixture.root, 'bin');
        mkdirSync(bin);
        const marker = join(bin, 'started');
        const realGit = Bun.which('git', { PATH: trustedPath });
        if (realGit === null) throw new Error('Git test prerequisite is absent');
        const program =
          createShebang() +
          '\nimport {writeFileSync} from "node:fs"; const args = process.argv.slice(2); const stage = args[0] === "--version" ? "version" : "root"; if (stage === ' +
          JSON.stringify(stage) +
          ') { writeFileSync(' +
          JSON.stringify(marker) +
          ', String(process.pid)); setInterval(() => {}, 1000); } else { const child = Bun.spawnSync([' +
          JSON.stringify(realGit) +
          ', ...args], {stdout:"pipe",stderr:"pipe"}); process.stdout.write(child.stdout); process.stderr.write(child.stderr); process.exitCode = child.exitCode; }';
        const git = join(bin, 'git');
        writeFileSync(git, program);
        chmodSync(git, 0o755);
        const listeners = new Set<(signal: LintInterrupt) => void>();
        const invocation = {
          version: 1 as const,
          callerDirectory: fixture.root,
          request: {
            command: 'lint' as const,
            kind: 'working' as const,
            repository: candidate,
            revision: 'HEAD',
          },
        };
        const pending = preflight.readInstalledLint(invocation, {
          installedDirectory: fixture.directory,
          runtime: readLintRuntime(bin + delimiter + trustedPath, fixture.root),
          subscribeInterrupts: (listener) => {
            listeners.add(listener);
            return () => {
              listeners.delete(listener);
            };
          },
        });
        try {
          for (let attempt = 0; attempt < 200 && !existsSync(marker); attempt++)
            await new Promise((resolve) => setTimeout(resolve, 10));
          expect(existsSync(marker)).toBe(true);
        } finally {
          for (const listener of listeners) listener('SIGTERM');
        }
        expect(await pending).toEqual({ kind: 'cancelled', status: 143 });
        const pid = Number(readFileSync(marker, 'utf8'));
        expect(() => process.kill(pid, 0)).toThrow();
      },
      10_000,
    );
  }
});

async function assertRefusal(pending: Promise<unknown>, diagnostic: string): Promise<void> {
  const outcome = await pending.then(
    () => ({ kind: 'accepted' as const }),
    (cause: unknown) => ({ kind: 'refused' as const, cause }),
  );
  expect(outcome.kind).toBe('refused');
  if (outcome.kind !== 'refused' || !(outcome.cause instanceof Error))
    throw new Error('expected an Error refusal');
  expect(outcome.cause.message).toContain(diagnostic);
}

it('uses the explicitly selected Git PATH for installed preflight', async () => {
  const fixture = createFixture(2);
  const candidate = createRepository(join(fixture.root, 'candidate'));
  const bin = join(fixture.root, 'unsupported-bin');
  mkdirSync(bin);
  const git = join(bin, 'git');
  writeFileSync(git, createShebang() + '\nconsole.log("git version 2.19.0");\n');
  chmodSync(git, 0o755);
  await assertRefusal(
    preflight.readInstalledLint(
      {
        version: 1,
        callerDirectory: fixture.root,
        request: { command: 'lint', kind: 'working', repository: candidate, revision: 'HEAD' },
      },
      {
        installedDirectory: fixture.directory,
        runtime: readLintRuntime(bin + delimiter + trustedPath, fixture.root),
        subscribeInterrupts: () => () => undefined,
      },
    ),
    'Git 2.36.0 or newer is required',
  );
});

describe('installed authority filesystem permissions', () => {
  for (const [label, reader] of [
    ['current', installed.readInstalledPuniToolkit],
    ['legacy', installed.readInstalledToolkit],
  ] as const) {
    it(label + ' refuses a permission-denied regular manifest before toolkit access', () => {
      const fixture = createFixture(label === 'current' ? 2 : 1);
      chmodSync(fixture.manifest, 0);
      try {
        expect(() => reader(fixture.directory, fixture.toolkit + '-absent')).toThrow(
          'installed ' + (label === 'current' ? 'PUNI ' : '') + 'package manifest is unreadable',
        );
      } finally {
        chmodSync(fixture.manifest, 0o600);
      }
    });
  }
  it('refuses an unreadable regular descriptor', () => {
    const fixture = createFixture(2);
    const descriptor = join(fixture.toolkit, 'toolkit.json');
    chmodSync(descriptor, 0);
    try {
      expect(() => installed.readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
        /EACCES/,
      );
    } finally {
      chmodSync(descriptor, 0o600);
    }
  });
  it('refuses an unreadable closure directory', () => {
    const fixture = createFixture(2);
    chmodSync(fixture.closure, 0);
    try {
      expect(() => installed.readInstalledPuniToolkit(fixture.directory, fixture.toolkit)).toThrow(
        /EACCES/,
      );
    } finally {
      chmodSync(fixture.closure, 0o700);
    }
  });
});

describe('installed preflight independent authorities', () => {
  it('keeps Git lookup bound to the caller runtime when installation is inside candidate', async () => {
    const fixture = createFixture(2);
    const candidate = createRepository(fixture.directory);
    const runtimeDirectory = join(fixture.root, 'trusted-runtime');
    const trustedBin = join(runtimeDirectory, 'bin');
    const candidateBin = join(fixture.toolkit, 'bin');
    mkdirSync(trustedBin, { recursive: true });
    mkdirSync(candidateBin);
    const trustedMarker = join(fixture.root, 'trusted-git-ran');
    const candidateMarker = join(fixture.root, 'candidate-git-ran');
    const realGit = Bun.which('git', { PATH: trustedPath });
    if (realGit === null) throw new Error('Git test prerequisite is absent');
    for (const [bin, marker] of [
      [trustedBin, trustedMarker],
      [candidateBin, candidateMarker],
    ]) {
      const git = join(bin, 'git');
      const program =
        createShebang() +
        '\nimport {writeFileSync} from "node:fs"; writeFileSync(' +
        JSON.stringify(marker) +
        ', "ran"); const child = Bun.spawnSync([' +
        JSON.stringify(realGit) +
        ', ...process.argv.slice(2)], {stdout:"pipe",stderr:"pipe"}); process.stdout.write(child.stdout); process.stderr.write(child.stderr); process.exitCode = child.exitCode;';
      writeFileSync(git, program);
      chmodSync(git, 0o755);
    }
    const lookup = 'bin' + delimiter + trustedPath;
    const context = {
      installedDirectory: fixture.directory,
      runtime: readLintRuntime(lookup, runtimeDirectory),
      subscribeInterrupts: () => () => undefined,
    };
    const refusal: unknown = await preflight
      .readInstalledLint(
        {
          version: 1,
          callerDirectory: fixture.root,
          request: { command: 'lint', kind: 'working', repository: candidate, revision: 'HEAD' },
        },
        context,
      )
      .then(
        () => undefined,
        (cause: unknown) => cause,
      );
    expect(existsSync(candidateMarker)).toBe(false);
    expect(existsSync(trustedMarker)).toBe(true);
    expect(refusal).toBeInstanceOf(Error);
    if (!(refusal instanceof Error)) throw new Error('expected an installation refusal');
    expect(refusal.message).toContain('installation must be outside the candidate repository');
  });

  it('independently refuses a local installation with all asset targets external', async () => {
    const fixture = createFixture(2);
    const candidate = createRepository(join(fixture.root, 'candidate'));
    const local = join(candidate, 'dist');
    mkdirSync(local);
    symlinkSync(fixture.manifest, join(local, 'package-manifest.json'));
    symlinkSync(fixture.toolkit, join(local, 'toolkit'));
    await assertRefusal(
      invokePreflight(fixture, candidate, local),
      'installation must be outside the candidate repository',
    );
  });

  it('independently refuses a local toolkit cwd with all asset targets external', async () => {
    const fixture = createFixture(2);
    const candidate = createRepository(join(fixture.root, 'candidate'));
    const external = join(fixture.root, 'external-toolkit');
    renameSync(fixture.toolkit, external);
    const local = join(candidate, 'toolkit');
    mkdirSync(local);
    for (const name of readdirSync(external)) symlinkSync(join(external, name), join(local, name));
    symlinkSync(local, fixture.toolkit);
    await assertRefusal(
      invokePreflight(fixture, candidate),
      'toolkit cwd must be outside the candidate repository',
    );
  });
});

it('refuses a Git runtime cwd inside the actual candidate', async () => {
  const fixture = createFixture(2);
  const candidate = createRepository(join(fixture.root, 'candidate'));
  await assertRefusal(
    preflight.readInstalledLint(
      {
        version: 1,
        callerDirectory: fixture.root,
        request: { command: 'lint', kind: 'working', repository: candidate, revision: 'HEAD' },
      },
      {
        installedDirectory: fixture.directory,
        runtime: readLintRuntime(trustedPath, candidate),
        subscribeInterrupts: () => () => undefined,
      },
    ),
    'Git runtime cwd must be outside the candidate repository',
  );
});
it('retains independently selected frozen runtime configuration', async () => {
  const fixture = createFixture(2);
  const candidate = createRepository(join(fixture.root, 'candidate'));
  const runtime = readLintRuntime(trustedPath, fixture.root);
  const selected = await preflight.readInstalledLint(
    {
      version: 1,
      callerDirectory: fixture.root,
      request: { command: 'lint', kind: 'working', repository: candidate, revision: 'HEAD' },
    },
    { installedDirectory: fixture.directory, runtime, subscribeInterrupts: () => () => undefined },
  );
  expect(selected.kind).toBe('ready');
  if (selected.kind !== 'ready') throw new Error('fixture unexpectedly cancelled');
  expect(selected.runtime).toEqual(runtime);
});

interface LocalInstallMember {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly kind?: '0' | '2';
}

/** A closed test writer makes physical duplicates visible instead of passing through a Map. */
function packLocalInstall(members: readonly LocalInstallMember[]): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (const member of members) {
    const header = Buffer.alloc(512);
    function field(offset: number, width: number, value: string): void {
      const bytes = Buffer.from(value);
      if (bytes.length > width) throw new Error('local install fixture exceeds tar field');
      bytes.copy(header, offset);
    }
    field(0, 100, member.path);
    field(100, 8, '0000644\0');
    field(108, 8, '0000000\0');
    field(116, 8, '0000000\0');
    field(124, 12, member.bytes.length.toString(8).padStart(11, '0') + '\0');
    field(136, 12, '00000000000\0');
    header.fill(32, 148, 156);
    header[156] = (member.kind ?? '0').charCodeAt(0);
    if (member.kind === '2') field(157, 100, 'package/package.json');
    field(257, 6, 'ustar\0');
    field(263, 2, '00');
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    field(148, 8, checksum.toString(8).padStart(6, '0') + '\0 ');
    blocks.push(header, member.bytes, Buffer.alloc((512 - (member.bytes.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

/** Read only the existing fixture's regular package files; this is not a producer replacement. */
function localInstallMembers(directory: string): LocalInstallMember[] {
  const members: LocalInstallMember[] = [];
  function visit(current: string, prefix: string): void {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const path = join(current, entry.name),
        name = prefix + '/' + entry.name;
      if (entry.isDirectory()) visit(path, name);
      else if (entry.isFile()) members.push({ path: name, bytes: readFileSync(path) });
      else throw new Error('local install fixture must contain only regular files');
    }
  }
  visit(directory, 'package/dist');
  return members;
}

const localInstallCases = [
  'healthy',
  'duplicate-metadata',
  'duplicate-ordinary',
  'metadata-path-alias',
  'unsupported-link',
  'dependency-metadata',
  'hook-metadata',
] as const;
type LocalInstallCase = (typeof localInstallCases)[number];

async function exerciseLocalInstall(
  caseName: LocalInstallCase,
  ownsSelectionRecord = false,
): Promise<void> {
  const fixture = createCurrentFixture();
  const session = mkdtempSync(join(tmpdir(), 'puni local installation owning '));
  roots.push(session);
  const repository = join(session, 'consumer repository');
  const archives = join(session, 'authenticated archives');
  const destinations = join(session, 'new clients');
  const witnesses = join(session, 'child witnesses');
  for (const directory of [repository, archives, destinations, witnesses]) mkdirSync(directory);
  const initialized = Bun.spawnSync(['/usr/bin/git', 'init', '-q', repository], {
    env: createGitEnvironment('/usr/bin:/bin'),
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 10000,
  });
  expect(initialized.signalCode).toBeUndefined();
  expect(initialized.exitCode, initialized.stderr.toString()).toBe(0);
  const metadata = {
    name: 'puni',
    version: testLevelPackageVersion,
    type: 'module',
    description: 'PUNI Navigator, Burokrat and Dash',
    license: 'MIT',
    bin: { puni: 'dist/puni.mjs' },
    files: ['dist/', 'README.md', 'LICENSE', 'NOTICE'],
    engines: { bun: Bun.version },
  };
  const metadataBytes = Buffer.from(JSON.stringify(metadata, null, 2) + '\n');
  const mainBytes = Buffer.from('export function main(){return {kind:"drain",status:0};}\n');
  writeFileSync(join(fixture.root, 'package.json'), metadataBytes);
  writeFileSync(join(fixture.directory, 'puni.mjs'), mainBytes);
  const members = [
    { path: 'package/package.json', bytes: metadataBytes },
    ...localInstallMembers(fixture.directory),
  ];
  const facade = new URL('../packaging-facade.ts', import.meta.url).href;
  const core = new URL('../../../../../puni/cli/src/packaging/install.ts', import.meta.url).href;
  const script = join(session, 'invoke-install.mjs');
  const context = {
    installation: { directory: fixture.directory, entrypoint: join(fixture.directory, 'puni.mjs') },
    lookup: { directory: repository, path: '/usr/bin:/bin' },
    callerDirectory: repository,
    runtime: process.execPath,
    temporaryDirectory: session,
    environment: {},
  };
  writeFileSync(
    script,
    [
      'import {appendFileSync,writeFileSync} from "node:fs";',
      'import {mock} from "bun:test";',
      'const [archive,sha256,destination,marker,ready,mode]=process.argv.slice(2);',
      'if([archive,sha256,destination,marker,ready,mode].some(word=>word===undefined))throw new Error("incomplete local install child fixture");',
      'const actual={...await import(' + JSON.stringify(facade) + ')};',
      'const runChild=actual.runInstallChild;',
      'mock.module(' +
        JSON.stringify(facade) +
        ',()=>({...actual,runInstallChild:async request=>{appendFileSync(marker,JSON.stringify(request.argv)+"\\n");if(mode==="refuse-child")throw new Error("bad-archive dependency emulation reached install child");return await runChild(request);}}));',
      'writeFileSync(ready,"facade wrapper registered\\n",{flag:"wx"});',
      'const {runInstallPuni}=await import(' + JSON.stringify(core) + ');',
      'const context=' + JSON.stringify(context) + ';',
      'context.stdout=()=>{throw new Error("installer bypassed owned stdout");};context.stderr=()=>{throw new Error("installer bypassed owned stderr");};',
      'const status=await runInstallPuni({command:"install-puni",archive,sha256,destination},context);',
      'process.exit(status);',
    ].join('\n'),
  );
  function invoke(name: string, bytes: Uint8Array, mode: 'real-child' | 'refuse-child') {
    const archive = join(archives, name + '.tgz');
    const destination = join(destinations, name);
    const marker = join(witnesses, name + '.jsonl');
    const ready = join(witnesses, name + '.ready');
    writeFileSync(archive, bytes, { flag: 'wx' });
    const sha256 = hashBytes(bytes);
    if (ownsSelectionRecord)
      for (const root of [fixture.root, session]) {
        const at = roots.indexOf(root);
        if (at < 0) throw new Error('selection producer fixture ownership is missing');
        roots.splice(at, 1);
      }
    const child = Bun.spawnSync(
      [
        ...createLaunch(process.execPath, script),
        archive,
        sha256,
        destination,
        marker,
        ready,
        mode,
      ],
      {
        cwd: repository,
        env: createGitEnvironment('/usr/bin:/bin'),
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 60000,
        ...(ownsSelectionRecord ? { killSignal: 'SIGKILL' as const, maxBuffer: 1024 * 1024 } : {}),
      },
    );
    if (ownsSelectionRecord) {
      if (child.signalCode !== undefined || child.exitedDueToTimeout || child.exitedDueToMaxBuffer)
        throw new Error('selection producer child custody unconfirmed; fixture roots retained');
      roots.push(fixture.root, session);
    }
    return { archive, sha256, destination, marker, ready, child };
  }
  const healthy = invoke('healthy', packLocalInstall(members), 'real-child');
  expect(healthy.child.signalCode).toBeUndefined();
  expect(existsSync(healthy.ready)).toBe(true);
  expect(healthy.child.exitCode, healthy.child.stderr.toString()).toBe(0);
  expect(healthy.child.stderr.length).toBe(0);
  const installedMain = realpathSync.native(
    join(healthy.destination, 'consumer/node_modules/puni/dist/puni.mjs'),
  );
  expect(healthy.child.stdout.toString()).toBe(
    JSON.stringify({
      schemaVersion: 1,
      archiveSha256: healthy.sha256,
      entrypoint: installedMain,
    }) + '\n',
  );
  expect(readFileSync(installedMain)).toEqual(mainBytes);
  expect(readFileSync(healthy.archive)).toEqual(
    readFileSync(join(healthy.destination, 'authenticated-puni.tgz')),
  );
  const calls: unknown[] = readFileSync(healthy.marker, 'utf8')
    .trimEnd()
    .split('\n')
    .map((line): unknown => JSON.parse(line));
  expect(calls).toEqual([
    [
      realpathSync.native(process.execPath),
      '--no-env-file',
      '--config=/dev/null',
      'add',
      '--ignore-scripts',
      join(healthy.destination, 'authenticated-puni.tgz'),
    ],
    createLaunch(
      realpathSync.native(process.execPath),
      join(healthy.destination, 'verify-main.mjs'),
    ),
  ]);
  if (ownsSelectionRecord) {
    const selectionPath = join(healthy.destination, 'puni-selection.json');
    expect(existsSync(selectionPath)).toBe(true);
    expect(readFileSync(selectionPath, 'utf8')).toBe(
      JSON.stringify(
        {
          schemaVersion: 2,
          installationDirectory: realpathSync.native(healthy.destination),
          archive: { path: 'authenticated-puni.tgz', sha256: healthy.sha256 },
          entrypoint: installedMain.slice(realpathSync.native(healthy.destination).length + 1),
          sourceSelection: fixture.sourceSelection,
        },
        null,
        2,
      ) + '\n',
    );
  }
  if (caseName === 'healthy') return;
  const alteredMetadata = (extra: Record<string, unknown>): LocalInstallMember[] =>
    members.map((member) =>
      member.path === 'package/package.json'
        ? {
            ...member,
            bytes: Buffer.from(JSON.stringify({ ...metadata, ...extra }, null, 2) + '\n'),
          }
        : member,
    );
  const cases: readonly {
    readonly name: Exclude<LocalInstallCase, 'healthy'>;
    readonly members: readonly LocalInstallMember[];
    readonly status: 1 | 78;
    readonly reason: string;
    readonly metadata: Uint8Array;
  }[] = [
    {
      name: 'duplicate-metadata',
      members: [...members, { path: 'package/package.json', bytes: metadataBytes }],
      status: 1,
      reason: 'PUNI tar member is duplicated',
      metadata: metadataBytes,
    },
    {
      name: 'duplicate-ordinary',
      members: [
        ...members,
        { path: 'package/ordinary.txt', bytes: Buffer.from('ordinary fixture\n') },
        { path: 'package/ordinary.txt', bytes: Buffer.from('ordinary fixture\n') },
      ],
      status: 1,
      reason: 'PUNI tar member is duplicated',
      metadata: metadataBytes,
    },
    {
      name: 'metadata-path-alias',
      members: [...members, { path: 'package/./package.json', bytes: metadataBytes }],
      status: 1,
      reason: 'PUNI tar path is not canonical package-relative text',
      metadata: metadataBytes,
    },
    {
      name: 'unsupported-link',
      members: [...members, { path: 'package/unused-link', kind: '2', bytes: new Uint8Array() }],
      status: 1,
      reason: 'PUNI tar member type is unsupported',
      metadata: metadataBytes,
    },
    {
      name: 'dependency-metadata',
      members: alteredMetadata({
        dependencies: { 'must-not-resolve': 'file:/puni-fixture-no-dependency' },
      }),
      status: 78,
      reason:
        'puni install-puni: archive is not a dependency-free hook-free current PUNI package\n',
      metadata: Buffer.from(
        JSON.stringify(
          { ...metadata, dependencies: { 'must-not-resolve': 'file:/puni-fixture-no-dependency' } },
          null,
          2,
        ) + '\n',
      ),
    },
    {
      name: 'hook-metadata',
      members: alteredMetadata({ scripts: { postinstall: 'must-not-execute-puni-fixture' } }),
      status: 78,
      reason:
        'puni install-puni: archive is not a dependency-free hook-free current PUNI package\n',
      metadata: Buffer.from(
        JSON.stringify(
          { ...metadata, scripts: { postinstall: 'must-not-execute-puni-fixture' } },
          null,
          2,
        ) + '\n',
      ),
    },
  ];
  const selected = cases.find((candidate) => candidate.name === caseName);
  if (selected === undefined) throw new Error('missing local install archive fixture: ' + caseName);
  const bytes = packLocalInstall(selected.members);
  const decoded = await new Bun.Archive(bytes).files([
    'package/package.json',
    'package/dist/puni.mjs',
  ]);
  const decodedMetadata = decoded.get('package/package.json');
  const decodedMain = decoded.get('package/dist/puni.mjs');
  if (decodedMetadata === undefined || decodedMain === undefined)
    throw new Error(
      'bad-archive fixture lost its decoded current metadata/main premise: ' + selected.name,
    );
  expect<Uint8Array>(new Uint8Array(await decodedMetadata.arrayBuffer()), selected.name).toEqual(
    selected.metadata,
  );
  expect(new Uint8Array(await decodedMain.arrayBuffer()), selected.name).toEqual(mainBytes);
  const refused = invoke(selected.name, bytes, 'refuse-child');
  expect(refused.child.signalCode, selected.name).toBeUndefined();
  expect(existsSync(refused.ready), selected.name).toBe(true);
  expect(existsSync(refused.marker), selected.name).toBe(false);
  expect(existsSync(refused.destination), selected.name).toBe(false);
  expect(refused.child.stdout.length, selected.name).toBe(0);
  expect(refused.child.exitCode, selected.name + ': ' + refused.child.stderr.toString()).toBe(
    selected.status,
  );
  expect(refused.child.stderr.toString(), selected.name).toContain(selected.reason);
  expect<Uint8Array>(readFileSync(refused.archive), selected.name).toEqual(bytes);
}

for (const name of localInstallCases) {
  it(
    'owns local PUNI installation archive admission: ' + name,
    () => exerciseLocalInstall(name),
    120000,
  );
}

/** Sync child settlement is distinct from async Bun onExit; unknown acquisition retains both roots. */
function runSelectionChild(
  argv: readonly string[],
  directory: string,
  owned: readonly string[],
  timeout = 10000,
  environment?: Readonly<Record<string, string | undefined>>,
) {
  for (const root of owned) {
    const at = roots.indexOf(root);
    if (at < 0) throw new Error('selection fixture cleanup ownership is missing');
    roots.splice(at, 1);
  }
  const observation = Bun.spawnSync([...argv], {
    cwd: directory,
    env: {
      PATH: process.env['PATH'],
      HOME: directory,
      BUN_INSTALL_CACHE_DIR: join(directory, 'cache'),
      ...environment,
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout,
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024,
  });
  if (
    observation.signalCode !== undefined ||
    observation.exitedDueToTimeout ||
    observation.exitedDueToMaxBuffer
  )
    throw new Error('selection child custody is unconfirmed; retained roots: ' + owned.join(', '));
  for (const root of owned) roots.push(root);
  return observation;
}

function createForgeSelection(
  main = 'export async function main(){return {kind:"drain",status:0};}\n',
  installationParent = tmpdir(),
) {
  const fixture = createFixture(2);
  writeFileSync(join(fixture.directory, 'puni.mjs'), main);
  const session = mkdtempSync(join(installationParent, 'puni forge selection owning '));
  roots.push(session);
  const consumer = join(session, 'consumer');
  mkdirSync(consumer);
  mkdirSync(join(session, 'cache'));
  writeFileSync(join(consumer, 'package.json'), '{"private":true}\n');
  const metadata = Buffer.from(
    JSON.stringify(
      {
        name: 'puni',
        version: puniVersion,
        type: 'module',
        description: 'PUNI Navigator, Burokrat and Dash',
        license: 'MIT',
        bin: { puni: 'dist/puni.mjs' },
        files: ['dist/', 'README.md', 'LICENSE', 'NOTICE'],
        engines: { bun: Bun.version },
      },
      null,
      2,
    ) + '\n',
  );
  const archive = packLocalInstall([
    { path: 'package/package.json', bytes: metadata },
    ...localInstallMembers(fixture.directory),
  ]);
  const archivePath = join(session, 'authenticated-puni.tgz');
  writeFileSync(archivePath, archive);
  const installed = runSelectionChild(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      'add',
      '--ignore-scripts',
      archivePath,
    ],
    consumer,
    [fixture.root, session],
  );
  expect(installed.exitCode).toBe(0);
  expect(installed.stderr.toString()).not.toContain('error:');
  const entrypoint = realpathSync.native(join(consumer, 'node_modules/puni/dist/puni.mjs'));
  const packageDirectory = realpathSync.native(join(consumer, 'node_modules/puni'));
  const record = {
    schemaVersion: 1,
    installationDirectory: realpathSync.native(session),
    archive: { path: 'authenticated-puni.tgz', sha256: hashBytes(archive) },
    entrypoint: 'consumer/node_modules/puni/dist/puni.mjs',
  };
  const recordPath = join(session, 'selection.json');
  const recordBytes = Buffer.from(JSON.stringify(record, null, 2) + '\n');
  writeFileSync(recordPath, recordBytes);
  const facade = new URL('../../../../../puni/cli/src/packaging-facade.ts', import.meta.url);
  expect(existsSync(facade)).toBe(true);
  function verify(expected: string) {
    const program =
      'import {readPuniSelection} from ' +
      JSON.stringify(facade.href) +
      ';' +
      'try{const selected=await readPuniSelection(' +
      JSON.stringify(recordPath) +
      ',' +
      JSON.stringify(expected) +
      ');' +
      'process.stdout.write(JSON.stringify({entrypoint:selected.entrypoint,archiveSha256:selected.archiveSha256})+"\\n");}' +
      'catch(cause){process.stderr.write(String(cause)+"\\n");process.exitCode=78;}';
    return runSelectionChild(
      [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
      consumer,
      [fixture.root, session],
    );
  }
  const healthy = verify(hashBytes(recordBytes));
  expect(healthy.exitCode).toBe(0);
  expect(healthy.stderr.toString()).toBe('');
  const selected: unknown = JSON.parse(healthy.stdout.toString());
  expect(selected).toEqual({ entrypoint, archiveSha256: hashBytes(archive) });

  return {
    fixture,
    session,
    consumer,
    packageDirectory,
    record,
    recordPath,
    recordBytes,
    archive,
    archivePath,
    verify,
  };
}

function exerciseForgeSelection(
  variant:
    | 'healthy'
    | 'wrong-record-digest'
    | 'wrong-archive-digest'
    | 'noncanonical-record'
    | 'changed-package-member',
): void {
  const { packageDirectory, record, recordPath, archive, archivePath, verify } =
    createForgeSelection();
  let recordBytes = readFileSync(recordPath);
  if (variant === 'healthy') return;
  let expected = hashBytes(recordBytes);
  let diagnostic: string;
  if (variant === 'wrong-record-digest') {
    expected = expected.startsWith('0') ? '1' + expected.slice(1) : '0' + expected.slice(1);
    diagnostic = 'independently expected digest';
  } else if (variant === 'wrong-archive-digest') {
    const incorrect = record.archive.sha256.startsWith('0')
      ? '1' + record.archive.sha256.slice(1)
      : '0' + record.archive.sha256.slice(1);
    recordBytes = Buffer.from(
      JSON.stringify({ ...record, archive: { ...record.archive, sha256: incorrect } }, null, 2) +
        '\n',
    );
    writeFileSync(recordPath, recordBytes);
    expected = hashBytes(recordBytes);
    diagnostic = 'retained PUNI archive differs';
  } else if (variant === 'noncanonical-record') {
    recordBytes = Buffer.from(JSON.stringify(record));
    writeFileSync(recordPath, recordBytes);
    expected = hashBytes(recordBytes);
    diagnostic = 'canonical JSON plus one LF';
  } else {
    writeFileSync(
      join(packageDirectory, 'dist/toolkit/validator.mjs'),
      'export const changed = true;\n',
    );
    diagnostic = 'installed PUNI file differs';
  }
  const packageBefore = hashBytes(packLocalInstall(localInstallMembers(packageDirectory)));
  const failed = verify(expected);
  expect(failed.exitCode).toBe(78);
  expect(failed.stdout.toString()).toBe('');
  expect(failed.stderr.toString()).toContain(diagnostic);
  expect(hashBytes(packLocalInstall(localInstallMembers(packageDirectory)))).toBe(packageBefore);
  expect(hashBytes(readFileSync(archivePath))).toBe(hashBytes(archive));
  expect(hashBytes(readFileSync(recordPath))).toBe(hashBytes(recordBytes));
}

for (const variant of [
  'healthy',
  'wrong-record-digest',
  'wrong-archive-digest',
  'noncanonical-record',
  'changed-package-member',
] as const)
  it(
    'Forge installation selection owns ' + variant + ' after a real local Bun installation',
    () => {
      exerciseForgeSelection(variant);
    },
    60000,
  );

function forgeLeafProgram(): string {
  return [
    'import{appendFileSync,writeFileSync,renameSync}from"node:fs";',
    'import{constants}from"node:os";',
    'export async function main(){return {kind:"drain",status:0};}',
    'const trace=process.env.FORGE_TRACE,statePath=process.env.FORGE_STATE,nonce=process.env.FORGE_NONCE;',
    'if(!trace||!statePath||!nonce)throw new Error("fixture lacks its owned observation paths");',
    'const publish=(finished)=>{const pending=statePath+"."+process.pid+".pending";writeFileSync(pending,JSON.stringify({pid:process.pid,ppid:process.ppid,port:server.port,finished,nonce}));renameSync(pending,statePath);};',
    'const record=(kind,extra={})=>appendFileSync(trace,JSON.stringify({kind,pid:process.pid,ppid:process.ppid,...extra})+"\\n");',
    'const server=Bun.serve({hostname:"127.0.0.1",port:0,fetch:()=>Response.json({pid:process.pid,nonce})});',
    'const expiry=setTimeout(()=>{record("expired");server.stop(true);process.exit(112);},45000);',
    'record("start",{argv:process.argv.slice(2)});publish(false);process.stdout.write("FORGE_LEAF_READY\\n");',
    'let stopping=false;const stop=(signal)=>{if(stopping)return;stopping=true;record("term",{signal});setTimeout(()=>{server.stop(true);clearTimeout(expiry);record("finished");publish(true);process.stdout.write("FORGE_LEAF_FINISHED\\n");process.exitCode=128+constants.signals[signal];},120);};',
    'process.on("SIGTERM",()=>stop("SIGTERM"));process.on("SIGINT",()=>stop("SIGINT"));process.on("SIGHUP",()=>stop("SIGHUP"));',
  ].join('\n');
}
function forgeControllerProgram(
  root: string,
  session: string,
  witnesses: string,
  recordPath: string,
  sha256: string,
  entrypoint: string,
  restart: boolean,
  sourceChange?: {
    readonly supervisor: string;
    readonly sdk: string;
    readonly purpose?:
      | 'bootstrap'
      | 'configuration'
      | 'configuration-malformed'
      | 'package-data'
      | 'source-missing'
      | 'source-unreadable'
      | 'native-runtime';
  },
): string {
  const supervisor =
    sourceChange?.supervisor ??
    new URL('../../../../../../tools/tool-devsync/src/k3s/forge-supervisor.ts', import.meta.url)
      .href;
  return [
    'import{readFileSync,writeFileSync,appendFileSync,existsSync,renameSync,copyFileSync,chmodSync,statSync,rmSync}from"node:fs";',
    'import{createHash}from"node:crypto";',
    'import{inspect as inspectFailure}from"node:util";',
    'import{superviseForge}from ' + JSON.stringify(supervisor) + ';',
    'const root=' +
      JSON.stringify(root) +
      ',session=' +
      JSON.stringify(session) +
      ',entrypoint=' +
      JSON.stringify(entrypoint) +
      ';',
    'const witnesses=' +
      JSON.stringify(witnesses) +
      ',trace=witnesses+"/native.jsonl",statePath=witnesses+"/state.json",outcomePath=witnesses+"/outcome.json";',
    'const record=(event)=>appendFileSync(trace,JSON.stringify(event)+"\\n");',
    'const changedSdk=' +
      JSON.stringify(sourceChange?.sdk ?? null) +
      ',inputPurpose=' +
      JSON.stringify(sourceChange?.purpose ?? null) +
      ';let mutatedSdk=false;',
    'const observationFailures=[];const actualSpawn=Bun.spawn.bind(Bun);Bun.spawn=(argv,options)=>{const purpose=argv.includes(entrypoint)?"development":"install",callback=options.onExit;',
    'const child=actualSpawn(argv,{...options,onExit(...args){try{record({kind:"native",purpose,pid:args[0].pid,code:args[1],signal:args[2],failure:args[3]===undefined?null:String(args[3])});if(changedSdk!==null&&purpose==="install"&&!mutatedSdk&&args[1]===0&&args[2]===null&&args[3]===undefined){const before=readFileSync(changedSdk),beforeInode=String(statSync(changedSdk,{bigint:true}).ino),beforeMode=statSync(changedSdk).mode&511;if(inputPurpose==="native-runtime"){renameSync(changedSdk,changedSdk+".previous");copyFileSync(changedSdk+".previous",changedSdk);chmodSync(changedSdk,beforeMode);}else if(inputPurpose==="configuration"){const decoded=JSON.parse(before.toString("utf8"));if(typeof decoded!=="object"||decoded===null||Array.isArray(decoded))throw new Error("owned configuration is not an object");writeFileSync(changedSdk,JSON.stringify({...decoded,forgeExecutionWitness:true},null,2)+String.fromCharCode(10));}else if(inputPurpose==="source-missing")rmSync(changedSdk);else if(inputPurpose==="source-unreadable"){if(process.getuid?.()===undefined||process.getuid()===0)throw new Error("unreadable source owner requires nonroot POSIX actor");chmodSync(changedSdk,0);}else writeFileSync(changedSdk,Buffer.concat([before,Buffer.from(String.fromCharCode(10)+"export const ownedLoadedMutation=true;"+String.fromCharCode(10))]));mutatedSdk=true;let afterDigest,readFailure;if(inputPurpose==="source-missing"||inputPurpose==="source-unreadable"){try{readFileSync(changedSdk);throw new Error("owned unreadable/absent source unexpectedly read");}catch(cause){if(!(cause instanceof Error)||!("code"in cause)||(inputPurpose==="source-missing"?cause.code!=="ENOENT":cause.code!=="EACCES"))throw cause;readFailure=cause.code;afterDigest=null;}}else afterDigest=createHash("sha256").update(readFileSync(changedSdk)).digest("hex");record({kind:inputPurpose===null?"loaded-sdk-changed":"loaded-required-input-changed",...(inputPurpose===null?{}:{purpose:inputPurpose}),...(inputPurpose==="native-runtime"?{beforeInode,afterInode:String(statSync(changedSdk,{bigint:true}).ino)}:{}),path:changedSdk,before:createHash("sha256").update(before).digest("hex"),after:afterDigest,...(readFailure===undefined?{}:{readFailure})});}}catch(cause){observationFailures.push(cause);}finally{if(callback)Reflect.apply(callback,this,args);}}});',
    'try{record({kind:"acquired",purpose,pid:child.pid,argv});}catch(cause){observationFailures.push(cause);}return child;};',
    'const hard=setTimeout(()=>process.exit(111),60000);let ended=false,changed=false,stopped=false,pending=false,controllerFailure;',
    'const events=()=>{if(!existsSync(trace))return[];const text=readFileSync(trace,"utf8");return text.split("\\n").slice(0,-1).map(line=>JSON.parse(line));};',
    'const environment={PATH:process.env.PATH,HOME:root,FORGE_TRACE:trace,FORGE_STATE:statePath,FORGE_NONCE:"owned-forge-parent"};',
    'let recipient;const subscribeStop=(observer)=>{recipient=observer;const onTerm=()=>observer("SIGTERM");process.on("SIGTERM",onTerm);return()=>{process.off("SIGTERM",onTerm);recipient=undefined;};};',
    'process.exitCode=57;',
    'const running=superviseForge(root,{runtime:process.execPath,environment,selection:{bytes:readFileSync(' +
      JSON.stringify(recordPath) +
      '),sha256:' +
      JSON.stringify(sha256) +
      ',directory:session,entrypoint},subscribeStop,report:(message)=>writeFileSync(witnesses+"/termination.log",message)});',
    'const drive=async()=>{if(ended||pending||stopped||!existsSync(statePath))return;pending=true;try{const state=JSON.parse(readFileSync(statePath,"utf8"));if(state.finished)return;',
    'const response=await fetch("http://127.0.0.1:"+state.port,{signal:AbortSignal.timeout(1000)});const actual=await response.json();if(ended)return;if(!response.ok||actual.pid!==state.pid||actual.nonce!=="owned-forge-parent")throw new Error("fixture endpoint identity failed");',
    'if(' +
      JSON.stringify(restart) +
      '&&!changed){changed=true;writeFileSync(root+"/nx.json",JSON.stringify({plugins:[],changed:true}));return;}',
    'const started=events().filter(event=>event.kind==="start");if(started.length!==(' +
      JSON.stringify(restart) +
      '?2:1))return;stopped=true;process.kill(process.pid,"SIGTERM");',
    '}finally{pending=false;}};',
    'const polling=setInterval(()=>{void drive().catch(cause=>{controllerFailure={cause};if(recipient)recipient("SIGTERM");});},20);',
    'try{const status=await running;ended=true;clearInterval(polling);clearTimeout(hard);if(controllerFailure!==undefined)throw controllerFailure.cause;if(observationFailures.length)throw new AggregateError(observationFailures,"native observation failed");writeFileSync(outcomePath,JSON.stringify({status,global:process.exitCode}));process.stdout.write("FORGE_RETURN\\n");process.exitCode=0;}',
    'catch(cause){ended=true;clearInterval(polling);clearTimeout(hard);writeFileSync(outcomePath,JSON.stringify({failure:String(cause)}));process.stderr.write(inspectFailure(cause,{depth:8,maxArrayLength:20,maxStringLength:2048})+"\\n");process.exitCode=1;}',
  ].join('\n');
}
function isForgeEvent(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readForgeEvents(path: string): Record<string, unknown>[] {
  const text = readFileSync(path, 'utf8');
  if (!text.endsWith('\n'))
    throw new Error('Forge native observation has an incomplete final record');
  return text
    .slice(0, -1)
    .split('\n')
    .map((line) => {
      const event: unknown = JSON.parse(line);
      if (!isForgeEvent(event)) throw new Error('Forge native observation is not an object');
      return event;
    });
}
function exerciseForgeSupervisor(restart: boolean): void {
  const prepared = createForgeSelection(forgeLeafProgram());
  const worktree = join(prepared.fixture.root, 'worktree');
  const witnesses = join(prepared.fixture.root, 'observations');
  mkdirSync(witnesses);
  mkdirSync(join(worktree, 'tools/tool-devsync/src'), { recursive: true });
  writeFileSync(
    join(worktree, 'tools/tool-devsync/src/fixture.ts'),
    'export const fixture = true;\n',
  );
  writeFileSync(join(worktree, 'nx.json'), '{"plugins":[]}\n');
  writeFileSync(
    join(worktree, 'package.json'),
    readFileSync(join(prepared.consumer, 'package.json')),
  );
  writeFileSync(join(worktree, 'bun.lock'), readFileSync(join(prepared.consumer, 'bun.lock')));
  const entrypoint = realpathSync.native(
    join(prepared.consumer, 'node_modules/puni/dist/puni.mjs'),
  );
  const program = join(prepared.session, 'controller.mjs');
  writeFileSync(
    program,
    forgeControllerProgram(
      worktree,
      prepared.session,
      witnesses,
      prepared.recordPath,
      hashBytes(prepared.recordBytes),
      entrypoint,
      restart,
    ),
  );
  const owner = runSelectionChild(
    [process.execPath, '--no-env-file', '--config=/dev/null', program],
    worktree,
    [prepared.fixture.root, prepared.session],
    75000,
  );
  // A settled direct parent alone does not establish its detached children's terminal state.
  for (const root of [prepared.fixture.root, prepared.session]) {
    const at = roots.indexOf(root);
    if (at < 0) throw new Error('Forge fixture cleanup ownership disappeared');
    roots.splice(at, 1);
  }
  let events: ReturnType<typeof readForgeEvents>;
  try {
    events = readForgeEvents(join(witnesses, 'native.jsonl'));
  } catch (cause: unknown) {
    // The original event-read cause stays primary; direct-parent output explains failures before
    // a controller event exists. No event is fabricated and no root gains retirement authority.
    throw new Error(
      'Forge healthy controller observation unavailable; owned roots retained: ' +
        JSON.stringify({
          controller: program,
          roots: [prepared.fixture.root, prepared.session],
          owner: {
            pid: owner.pid,
            exitCode: owner.exitCode,
            signalCodeType: typeof owner.signalCode,
            ...(owner.signalCode === undefined ? {} : { signalCode: owner.signalCode }),
            exitedDueToTimeout: owner.exitedDueToTimeout,
            exitedDueToMaxBuffer: owner.exitedDueToMaxBuffer,
            stdoutHex: owner.stdout.toString('hex'),
            stderrHex: owner.stderr.toString('hex'),
            stdout: owner.stdout.toString('utf8'),
            stderr: owner.stderr.toString('utf8'),
          },
        }),
      { cause },
    );
  }
  const acquired = events.filter((event) => event['kind'] === 'acquired');
  const native = events.filter((event) => event['kind'] === 'native');
  const starts = events.filter((event) => event['kind'] === 'start');
  if (acquired.length === 0 || acquired.length !== native.length || starts.length === 0)
    throw new Error('Forge fixture child custody is incomplete; owned roots retained');
  for (const event of acquired) {
    const pid = event['pid'];
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0)
      throw new Error('Forge fixture acquired PID is invalid; owned roots retained');
    const terminals = native.filter((terminal) => terminal['pid'] === pid);
    const terminal = terminals.at(0);
    if (
      terminals.length !== 1 ||
      terminal?.['failure'] !== null ||
      typeof terminal['code'] !== 'number' ||
      terminal['signal'] !== null
    )
      throw new Error('Forge fixture native child settlement is unconfirmed; owned roots retained');
  }
  for (const started of starts) {
    if (
      !acquired.some(
        (event) => event['purpose'] === 'development' && event['pid'] === started['pid'],
      )
    )
      throw new Error('Forge fixture leaf has no corresponding acquired child; roots retained');
  }
  roots.push(prepared.fixture.root, prepared.session);
  expect(owner.exitCode).toBe(0);
  expect(owner.pid).toBeGreaterThan(0);
  expect(starts).toHaveLength(restart ? 2 : 1);
  expect(acquired.filter((event) => event['purpose'] === 'development')).toHaveLength(
    restart ? 2 : 1,
  );
  expect(acquired.filter((event) => event['purpose'] === 'install')).toHaveLength(restart ? 2 : 1);
  for (const started of starts) {
    expect(started['ppid']).toBe(owner.pid);
    expect(started['argv']).toEqual(['dash', 'dev', '--repository', worktree]);
    expect(native.find((event) => event['pid'] === started['pid'])).toMatchObject({
      code: 143,
      signal: null,
      failure: null,
    });
  }
  if (restart) {
    const second = starts.at(1),
      first = starts.at(0);
    if (first === undefined || second === undefined)
      throw new Error('missing observed restart pair');
    const firstNative = events.findIndex(
      (event) => event['kind'] === 'native' && event['pid'] === first['pid'],
    );
    const secondStart = events.indexOf(second);
    expect(firstNative).toBeGreaterThanOrEqual(0);
    expect(firstNative).toBeLessThan(secondStart);
  }
  const returned: unknown = JSON.parse(readFileSync(join(witnesses, 'outcome.json'), 'utf8'));
  expect(returned).toEqual({ status: 143, global: 57 });
  expect(owner.stdout.toString().split('FORGE_LEAF_FINISHED\n')).toHaveLength(
    (restart ? 2 : 1) + 1,
  );
  expect(owner.stdout.toString()).toContain('FORGE_RETURN\n');
}
it('Forge owns an admitted PUNI fixture parent through actual TERM and a returned API outcome', () => {
  exerciseForgeSupervisor(false);
}, 120000);
it('Forge observes its first PUNI parent native stop before admitting the restart successor', () => {
  exerciseForgeSupervisor(true);
}, 120000);

it('local installation emits the retained Forge selection record after real Bun installation and probing', async () => {
  await exerciseLocalInstall('healthy', true);
}, 90000);

function exerciseForgeHost(
  variant: 'healthy' | 'stale-mount' | 'missing-record' | 'unreadable-record' | 'overlap',
): void {
  const prefix = mkdtempSync(join(tmpdir(), 'forge-installation-parent-'));
  const prepared = createForgeSelection(undefined, prefix);
  roots.push(prefix);
  const worktree = join(prepared.fixture.root, 'worktree');
  mkdirSync(worktree);
  const status = statSync(prefix, { bigint: true });
  const identity = String(status.dev) + ':' + String(status.ino);
  const facade = new URL(
    '../../../../../../tools/tool-devsync/src/k3s/forge-installation.ts',
    import.meta.url,
  ).href;
  function read(path: string, mounted: string, repository = worktree) {
    const program =
      'import{readForgeInstallation}from ' +
      JSON.stringify(facade) +
      ';' +
      'try{const selected=await readForgeInstallation({path:' +
      JSON.stringify(path) +
      ',sha256:' +
      JSON.stringify(hashBytes(prepared.recordBytes)) +
      '},' +
      '{directory:' +
      JSON.stringify(prefix) +
      ',identity:' +
      JSON.stringify(mounted) +
      '},' +
      JSON.stringify(repository) +
      ');' +
      'process.stdout.write(JSON.stringify({nodeDirectory:selected.nodeDirectory,entrypoint:selected.containerEntrypoint,directoryIdentity:selected.directoryIdentity})+"\\n");}' +
      'catch(cause){process.stderr.write(String(cause)+"\\n");process.exitCode=78;}';
    return runSelectionChild(
      [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
      prepared.consumer,
      [prepared.fixture.root, prepared.session, prefix],
    );
  }
  const healthy = read(prepared.recordPath, identity);
  expect(healthy.exitCode, healthy.stderr.toString()).toBe(0);
  expect(healthy.stderr.toString()).toBe('');
  const installed = statSync(prepared.session, { bigint: true });
  const selected: unknown = JSON.parse(healthy.stdout.toString());
  const realMain = realpathSync.native(join(prepared.consumer, 'node_modules/puni/dist/puni.mjs'));
  expect(selected).toEqual({
    nodeDirectory: '/srv/puni/puni-installations/' + prepared.session.slice(prefix.length + 1),
    entrypoint: '/opt/puni-dev/' + realMain.slice(prepared.session.length + 1),
    directoryIdentity: String(installed.dev) + ':' + String(installed.ino),
  });
  if (variant === 'healthy') return;
  let rejected: ReturnType<typeof read>;
  let diagnostic: string;
  if (variant === 'stale-mount') {
    rejected = read(prepared.recordPath, '0:0');
    diagnostic = 'mount changed since lab creation';
  } else if (variant === 'missing-record') {
    rejected = read(join(prepared.session, 'missing-selection.json'), identity);
    diagnostic = 'ENOENT';
  } else if (variant === 'unreadable-record') {
    const uid = process.getuid?.();
    if (uid === undefined || uid === 0)
      throw new Error('unreadable selection owner requires a nonroot POSIX actor');
    chmodSync(prepared.recordPath, 0);
    rejected = read(prepared.recordPath, identity);
    diagnostic = 'EACCES';
  } else {
    rejected = read(prepared.recordPath, identity, prepared.session);
    diagnostic = 'overlaps the candidate worktree';
  }
  expect(rejected.exitCode, rejected.stderr.toString()).toBe(78);
  expect(rejected.stdout.toString()).toBe('');
  expect(rejected.stderr.toString()).toContain(diagnostic);
}
for (const variant of [
  'healthy',
  'stale-mount',
  'missing-record',
  'unreadable-record',
  'overlap',
] as const)
  it(
    'Forge host acquisition owns ' +
      variant +
      ' after verified real-directory and installation premises',
    () => {
      exerciseForgeHost(variant);
    },
    60000,
  );

function readForgePayload(
  directory: string,
  prefix = '',
): { readonly path: string; readonly sha256: string }[] {
  const members: { readonly path: string; readonly sha256: string }[] = [];
  for (const entry of readdirSync(join(directory, prefix), { withFileTypes: true })) {
    const path = prefix === '' ? entry.name : prefix + '/' + entry.name;
    if (path === '.bun-tag') continue;
    if (entry.isDirectory()) members.push(...readForgePayload(directory, path));
    else if (entry.isFile())
      members.push({ path, sha256: hashBytes(readFileSync(join(directory, path))) });
    else throw new Error('controlled authenticated payload has a nonregular member');
  }
  return members.sort((left, right) => left.path.localeCompare(right.path));
}
async function exerciseForgeMetadata(
  variant:
    | 'exact-marker'
    | 'missing-marker'
    | 'empty-marker'
    | 'wrong-marker'
    | 'oversized-marker'
    | 'symlink-marker'
    | 'unreadable-marker'
    | 'extra-file'
    | 'archive-collision',
): Promise<void> {
  const prepared = createForgeSelection();
  const marker = join(prepared.packageDirectory, '.bun-tag');
  const expected = Buffer.from(
    'sha512-' + createHash('sha512').update(prepared.archive).digest('base64'),
  );
  const markerStatus = statSync(marker);
  expect(markerStatus.isFile()).toBe(true);
  expect(expected.byteLength).toBe(95);
  expect<Uint8Array>(readFileSync(marker)).toEqual(expected);
  if (variant === 'exact-marker') return;
  let selectionBytes = prepared.recordBytes;
  let diagnostic: string;
  if (variant === 'missing-marker') {
    rmSync(marker);
    diagnostic = 'ENOENT';
  } else if (variant === 'empty-marker') {
    writeFileSync(marker, '');
    diagnostic = 'metadata differs';
  } else if (variant === 'wrong-marker') {
    writeFileSync(
      marker,
      'sha512-' + createHash('sha512').update('another archive').digest('base64'),
    );
    diagnostic = 'metadata differs';
  } else if (variant === 'oversized-marker') {
    writeFileSync(marker, Buffer.concat([expected, Buffer.from('\n')]));
    diagnostic = 'bounded regular file';
  } else if (variant === 'symlink-marker') {
    rmSync(marker);
    symlinkSync('package.json', marker);
    diagnostic = 'ELOOP';
  } else if (variant === 'unreadable-marker') {
    const uid = process.getuid?.();
    if (uid === undefined || uid === 0)
      throw new Error('unreadable metadata owner requires a nonroot POSIX actor');
    chmodSync(marker, 0);
    diagnostic = 'EACCES';
  } else if (variant === 'extra-file') {
    writeFileSync(join(prepared.packageDirectory, '.not-installation-metadata'), 'unreviewed');
    diagnostic = 'membership differs';
  } else {
    // This mutates retained trusted state after the healthy actual install, not Bun's consumer semantics.
    const archived = await new Bun.Archive(prepared.archive).files();
    const members: LocalInstallMember[] = [];
    for (const [path, file] of archived)
      members.push({ path, bytes: new Uint8Array(await file.arrayBuffer()) });
    const collided = packLocalInstall([
      ...members,
      { path: 'package/.bun-tag', bytes: Buffer.from('archive-owned marker') },
    ]);
    writeFileSync(prepared.archivePath, collided);
    selectionBytes = Buffer.from(
      JSON.stringify(
        {
          ...prepared.record,
          archive: { ...prepared.record.archive, sha256: hashBytes(collided) },
        },
        null,
        2,
      ) + '\n',
    );
    writeFileSync(prepared.recordPath, selectionBytes);
    diagnostic = 'payload collides with Bun installation metadata';
  }
  const payload = readForgePayload(prepared.packageDirectory);
  const archiveBefore = readFileSync(prepared.archivePath);
  const refused = prepared.verify(hashBytes(selectionBytes));
  expect(refused.exitCode, refused.stderr.toString()).toBe(78);
  expect(refused.stdout.toString()).toBe('');
  expect(refused.stderr.toString()).toContain(diagnostic);
  expect(readForgePayload(prepared.packageDirectory)).toEqual(payload);
  expect<Uint8Array>(readFileSync(prepared.archivePath)).toEqual(archiveBefore);
  expect<Uint8Array>(readFileSync(prepared.recordPath)).toEqual(selectionBytes);
  if (variant === 'missing-marker') expect(existsSync(marker)).toBe(false);
  else if (variant === 'unreadable-marker') {
    expect(statSync(marker).mode & 0o777).toBe(0);
    chmodSync(marker, markerStatus.mode & 0o777);
    expect<Uint8Array>(readFileSync(marker)).toEqual(expected);
  }
}
for (const variant of [
  'exact-marker',
  'missing-marker',
  'empty-marker',
  'wrong-marker',
  'oversized-marker',
  'symlink-marker',
  'unreadable-marker',
  'extra-file',
  'archive-collision',
] as const)
  it(
    'Forge installation metadata owns ' +
      variant +
      ' after actual Bun installation and verifier premises',
    async () => {
      await exerciseForgeMetadata(variant);
    },
    60000,
  );

/** Copy actual producer/core compiler inputs and their complete selected package data into an owned execution source tree; the install target remains separate. */
async function createForgeLoadedSource(root: string): Promise<{
  readonly supervisor: string;
  readonly sdk: string;
  readonly sdkSha256: string;
  readonly inputs: number;
}> {
  const repository = readFileUrl(new URL('../../../../../../', import.meta.url));
  const entries = [
    'tools/tool-devsync/src/k3s/forge-supervisor-core.ts',
    'tools/tool-devsync/src/k3s/forge-supervisor.ts',
  ];
  const names = new Set<string>();
  for (const entry of entries) {
    const compilerCwd = process.cwd();
    const compiled = await Bun.build({
      entrypoints: [join(repository, entry)],
      target: 'bun',
      packages: 'bundle',
      env: 'disable',
      metafile: true,
      root: repository,
    });
    expect(compiled.success, compiled.logs.map(String).join('\n')).toBe(true);
    const metadata = compiled.metafile;
    if (metadata === undefined)
      throw new Error('actual Bun compiler supplied no producer/core observation');
    if (entry.endsWith('forge-supervisor-core.ts')) {
      expect(compiled.outputs).toHaveLength(1);
      const emitted = compiled.outputs.at(0),
        recorded = Object.values(metadata.outputs).at(0);
      if (
        emitted === undefined ||
        recorded === undefined ||
        Object.keys(metadata.outputs).length !== 1
      )
        throw new Error('actual core compiler did not retain one entry');
      expect(emitted.kind).toBe('entry-point');
      expect(recorded.imports).toEqual([]);
      const contributions = Object.entries(recorded.inputs).filter(
        ([path]) =>
          resolvePath(compilerCwd, path) ===
          resolvePath(repository, 'apps/puni/cli/src/packaging/selection.ts'),
      );
      const sdk = contributions.at(0);
      // Proof: v263 removed this input or added an alias to the same exact SDK in real
      // successful compiler metadata; the original SDK owner failed this named refusal in both cases.
      if (contributions.length !== 1 || sdk === undefined)
        throw new Error('actual emitted core requires one exact SDK contribution');
      expect(sdk[1].bytesInOutput).toBeGreaterThan(0);
      const bytes = Buffer.from(await emitted.text());
      expect(bytes.byteLength).toBe(emitted.size);
    }
    for (const [path, input] of Object.entries(metadata.inputs)) {
      names.add(isAbsolutePath(path) ? path : resolvePath(compilerCwd, path));
      for (const edge of input.imports)
        if (edge.external !== true && edge.path !== 'bun:wrap')
          names.add(isAbsolutePath(edge.path) ? edge.path : resolvePath(compilerCwd, edge.path));
    }
  }
  if (names.size === 0 || names.size > 4096)
    throw new Error('actual producer/core sources exceed fixture bound');
  const copied = new Set<string>(),
    packages = new Set<string>(),
    configurations = new Set<string>(['tsconfig.base.json', 'package.json', 'bun.lock']);
  let bytes = 0;
  function copyFile(relative: string): void {
    if (copied.has(relative)) return;
    const source = join(repository, relative),
      status = lstatSync(source);
    if (!status.isFile() || status.isSymbolicLink())
      throw new Error('owned producer fixture source is not regular');
    const contents = readFileSync(source);
    bytes += contents.byteLength;
    if (bytes > 128 * 1024 * 1024 || copied.size > 50000)
      throw new Error('owned producer fixture source bytes exceed bound');
    mkdirSync(pathDirectory(join(root, relative)), { recursive: true });
    writeFileSync(join(root, relative), contents, { flag: 'wx', mode: status.mode & 0o777 });
    copied.add(relative);
  }
  for (const absolute of names) {
    const relative = relativePath(repository, absolute);
    if (
      relative === '' ||
      relative === '..' ||
      relative.startsWith('../') ||
      isAbsolutePath(relative)
    )
      throw new Error('actual producer input escapes fixture namespace');
    copyFile(relative);
    let ancestor = pathDirectory(relative);
    while (ancestor !== '.') {
      const configuration = join(ancestor, 'tsconfig.json');
      if (existsSync(join(repository, configuration))) configurations.add(configuration);
      if (
        relative.startsWith('node_modules/') &&
        existsSync(join(repository, ancestor, 'package.json'))
      ) {
        packages.add(ancestor);
      }
      const parent = pathDirectory(ancestor);
      if (parent === ancestor) throw new Error('fixture source ancestry did not reach root');
      ancestor = parent;
    }
  }
  let packageMembers = 0;
  function copyPackage(relative: string): void {
    if (++packageMembers > 50000) throw new Error('owned package fixture exceeds directory bound');
    const directory = join(repository, relative),
      status = lstatSync(directory);
    if (!status.isDirectory() || status.isSymbolicLink())
      throw new Error('owned package fixture directory is not regular');
    for (const name of readdirSync(directory)) {
      const child = join(relative, name),
        kind = lstatSync(join(repository, child));
      if (kind.isDirectory()) copyPackage(child);
      else if (kind.isFile()) copyFile(child);
      else throw new Error('owned package fixture has an unsupported nonregular member');
    }
  }
  for (const directory of [...packages].sort()) copyPackage(directory);
  for (const path of configurations) copyFile(path);
  const sdk = join(root, 'apps/puni/cli/src/packaging/selection.ts');
  expect(copied.has('apps/puni/cli/src/packaging/selection.ts')).toBe(true);
  // The actual entry invokes its required producer, which compiles/guards this owned namespace.
  // No compiler-input list is interpreted as a complete raw module tree or a runtime certificate.
  return {
    supervisor: createFileUrl(join(root, 'tools/tool-devsync/src/k3s/forge-supervisor.ts')).href,
    sdk,
    sdkSha256: hashBytes(readFileSync(sdk)),
    inputs: copied.size,
  };
}

it('Forge refuses a successor when its actual compiler-captured SDK changes after frozen install', async () => {
  // Independent real installation/native parent health precedes this new source-change owner.
  exerciseForgeSupervisor(false);
  const prepared = createForgeSelection(forgeLeafProgram());
  const worktree = join(prepared.fixture.root, 'loaded-worktree');
  const witnesses = join(prepared.fixture.root, 'loaded-observations');
  mkdirSync(worktree);
  mkdirSync(witnesses);
  const sourceNamespace = join(prepared.fixture.root, 'loaded-source');
  mkdirSync(sourceNamespace);
  const loaded = await createForgeLoadedSource(sourceNamespace);
  expect(loaded.inputs).toBeGreaterThan(1);
  writeFileSync(join(worktree, 'nx.json'), '{"plugins":[]}\n');
  writeFileSync(
    join(worktree, 'package.json'),
    readFileSync(join(prepared.consumer, 'package.json')),
  );
  writeFileSync(join(worktree, 'bun.lock'), readFileSync(join(prepared.consumer, 'bun.lock')));
  const entrypoint = realpathSync.native(
    join(prepared.consumer, 'node_modules/puni/dist/puni.mjs'),
  );
  const controller = join(prepared.session, 'loaded-controller.mjs');
  writeFileSync(
    controller,
    forgeControllerProgram(
      worktree,
      prepared.session,
      witnesses,
      prepared.recordPath,
      hashBytes(prepared.recordBytes),
      entrypoint,
      false,
      loaded,
    ),
  );
  const owner = runSelectionChild(
    [process.execPath, '--no-env-file', '--config=/dev/null', controller],
    worktree,
    [prepared.fixture.root, prepared.session],
    75000,
    { TMPDIR: witnesses },
  );
  for (const root of [prepared.fixture.root, prepared.session]) {
    const at = roots.indexOf(root);
    if (at < 0) throw new Error('loaded fixture cleanup ownership disappeared');
    roots.splice(at, 1);
  }
  const events = readForgeEvents(join(witnesses, 'native.jsonl'));
  const acquired = events.filter((event) => event['kind'] === 'acquired');
  const native = events.filter((event) => event['kind'] === 'native');
  if (acquired.length === 0 || acquired.length !== native.length)
    throw new Error('loaded fixture native custody incomplete; owned roots retained');
  for (const event of acquired) {
    const pid = event['pid'];
    const terminals = native.filter((terminal) => terminal['pid'] === pid);
    const terminal = terminals.at(0);
    if (
      typeof pid !== 'number' ||
      !Number.isInteger(pid) ||
      pid <= 0 ||
      terminals.length !== 1 ||
      terminal?.['failure'] !== null ||
      typeof terminal['code'] !== 'number' ||
      terminal['signal'] !== null
    )
      throw new Error('loaded fixture native settlement unconfirmed; owned roots retained');
  }
  roots.push(prepared.fixture.root, prepared.session);
  expect(owner.exitCode, owner.stderr.toString()).toBe(0);
  expect(owner.stderr.toString()).toBe('');
  const installs = acquired.filter((event) => event['purpose'] === 'install');
  expect(installs).toHaveLength(1);
  expect(native.find((event) => event['pid'] === installs.at(0)?.['pid'])?.['code']).toBe(0);
  const changes = events.filter((event) => event['kind'] === 'loaded-sdk-changed');
  expect(changes).toHaveLength(1);
  expect(changes.at(0)?.['before']).toBe(loaded.sdkSha256);
  expect(changes.at(0)?.['after']).toBe(hashBytes(readFileSync(loaded.sdk)));
  expect(changes.at(0)?.['after']).not.toBe(loaded.sdkSha256);
  // This is the first prospective feature verdict: native install and exact source mutation have already settled.
  expect(acquired.filter((event) => event['purpose'] === 'development')).toHaveLength(0);
  expect(events.filter((event) => event['kind'] === 'start')).toHaveLength(0);
  expect(JSON.parse(readFileSync(join(witnesses, 'outcome.json'), 'utf8'))).toEqual({
    status: 0,
    global: 57,
  });
  expect(readFileSync(join(witnesses, 'termination.log'), 'utf8')).toContain('supervisor');
}, 240000);

// Actual reviewed package, adapter and project bytes; these are fixture inputs, not validator-generated expectations.
const currentSourceInputs: Readonly<Record<string, string>> = {
  'package.json':
    '{\n  "name": "@puni-mono/workspace",\n  "version": "0.0.0",\n  "license": "MIT",\n  "private": true,\n  "type": "module",\n  "scripts": {\n    "deploy": "nx run tool-deploy:deploy",\n    "build": "nx run-many -t build",\n    "test": "nx run-many -t test",\n    "test:unit": "nx run-many -t test:unit",\n    "test:queued": "bin/test-queued.sh",\n    "lint": "nx run-many -t lint --exclude=twilight-burokrat && nx run twilight-burokrat:lint:source",\n    "format": "nx format:write",\n    "format:check": "nx format:check",\n    "typecheck": "nx run-many -t typecheck",\n    "dev": "bun --no-env-file --config=/dev/null bin/dev.ts",\n    "dev:local-solver": "bun --no-env-file --config=/dev/null bin/dev.ts --local-solver",\n    "dev:ports": "bun --no-env-file --config=/dev/null bin/dev-ports.ts check",\n    "dev:kill": "bun --no-env-file --config=/dev/null bin/dev-ports.ts release",\n    "dev:be": "nx run wbs-be-01:serve",\n    "dev:gw": "nx run wbs-gw-01:serve",\n    "dev:fe": "nx run wbs-fe-01:serve",\n    "dev:setup": "bun run tools/dev/setup.ts",\n    "e2e": "nx run wbs-fe-01:e2e",\n    "e2e:beside-dev": "CI=1 E2E_PORT_SHIFT=500 nx run wbs-fe-01:e2e",\n    "dev:test": "bash bin/dev.test.sh",\n    "heavy-lock:test": "bash bin/heavy-lock.test.sh",\n    "gate-pinning:test": "bash bin/h2puni-gate.test.sh",\n    "private:checkout": "bun run tools/tool-private/src/checkout.ts",\n    "private:check": "nx run tool-private:private:check",\n    "private:rehearse": "nx run tool-private:private:rehearse"\n  },\n  "dependencies": {\n    "@agentclientprotocol/claude-agent-acp": "0.76.0",\n    "@agentclientprotocol/sdk": "1.4.0",\n    "@ark/schema": "0.56.0",\n    "@aws-sdk/client-s3": "3.1161.0",\n    "@elysiajs/openapi": "^1.4.16",\n    "@elysiajs/opentelemetry": "^1.4.11",\n    "@langchain/langgraph": "1.4.15",\n    "@modelcontextprotocol/sdk": "1.31.0",\n    "@noble/hashes": "2.4.0",\n    "@openrouter/ai-sdk-provider": "3.1.0",\n    "@opentelemetry/api": "^1.9.1",\n    "@opentelemetry/exporter-prometheus": "^0.222.0",\n    "@opentelemetry/sdk-metrics": "^2.11.0",\n    "@opentelemetry/sdk-node": "^0.222.0",\n    "@optique/core": "1.3.6",\n    "@optique/run": "1.3.6",\n    "@sinclair/typebox": "^0.34.52",\n    "@tanstack/react-router": "^1.170.24",\n    "ai": "7.0.118",\n    "ajv": "8.20.0",\n    "application-exception": "0.9.0",\n    "arktype": "^2.2.3",\n    "caught-object-report-json": "15.0.0",\n    "configurable-tree-traversal": "0.13.0",\n    "di-bag": "0.5.2",\n    "dns-packet": "5.6.1",\n    "drizzle-orm": "1.0.0-rc.4",\n    "elysia": "^1.4.30",\n    "jose": "^6.2.12",\n    "mmdb-lib": "3.0.3",\n    "nodemailer": "10.1.2",\n    "openapi-types": "12.1.3",\n    "openid-client": "^6.8.8",\n    "pino": "^10.3.1",\n    "react-markdown": "^10.1.0",\n    "remark-gfm": "^4.0.1",\n    "tldts": "7.4.12",\n    "whoiser": "^2.0.0-beta.10",\n    "yaml": "^2.9.0"\n  },\n  "devDependencies": {\n    "@dagger.io/dagger": "^0.21.9",\n    "@eslint/js": "^10.0.1",\n    "@fission-ai/openspec": "1.14.3",\n    "@nx/eslint": "23.2.1",\n    "@nx/eslint-plugin": "23.2.1",\n    "@nx/js": "23.2.1",\n    "@nx/workspace": "23.2.1",\n    "@opentelemetry/exporter-trace-otlp-proto": "^0.222.0",\n    "@opentelemetry/sdk-trace-base": "^2.11.0",\n    "@playwright/test": "^1.63.0",\n    "@radix-ui/react-dialog": "^1.1.23",\n    "@standard-schema/spec": "1.1.0",\n    "@storybook/addon-themes": "10.3.6",\n    "@storybook/react-vite": "10.3.6",\n    "@swc-node/register": "1.12.1",\n    "@swc/core": "1.16.2",\n    "@swc/helpers": "0.5.23",\n    "@tailwindcss/vite": "^4.3.3",\n    "@tanstack/eslint-plugin-query": "^5.102.8",\n    "@tanstack/eslint-plugin-router": "^1.162.0",\n    "@tanstack/react-table": "^9.2.4",\n    "@testing-library/dom": "^10.4.1",\n    "@testing-library/jest-dom": "^7.0.1",\n    "@testing-library/react": "^16.3.3",\n    "@types/dns-packet": "5.6.5",\n    "@types/node": "26.4.1",\n    "@types/react": "^19.2.18",\n    "@types/react-dom": "^19.2.7",\n    "@typescript/native": "npm:typescript@7.0.2",\n    "@vitejs/plugin-react": "^6.1.1",\n    "@vitest/coverage-v8": "^5.0.0",\n    "bun-types": "^1.4.2",\n    "class-variance-authority": "^0.7",\n    "clsx": "^2",\n    "drizzle-kit": "1.0.0-rc.4",\n    "eslint": "^10.10.0",\n    "eslint-config-prettier": "10.1.8",\n    "eslint-plugin-drizzle": "^0.2",\n    "eslint-plugin-jsdoc": "^64.3.6",\n    "eslint-plugin-jsx-a11y": "^6",\n    "eslint-plugin-react": "^7",\n    "eslint-plugin-react-hooks": "^7.1.1",\n    "eslint-plugin-simple-import-sort": "^14.0.0",\n    "eslint-plugin-unicorn": "^74.0.0",\n    "eslint-plugin-unused-imports": "^4",\n    "fast-check": "^4.9.0",\n    "jiti": "2.7.0",\n    "jsdom": "^30.0.1",\n    "jsonc-parser": "3.2.0",\n    "lefthook": "^2.1.12",\n    "mermaid": "^11.17.2",\n    "nx": "23.2.1",\n    "prettier": "^3.9.6",\n    "prettier-plugin-tailwindcss": "^0.8.1",\n    "react": "^19.2.8",\n    "react-dom": "^19.2.8",\n    "saxes": "6.0.0",\n    "shadcn": "3.8.5",\n    "storybook": "10.3.6",\n    "tailwind-merge": "^3.6.0",\n    "tailwindcss": "^4.3.3",\n    "typescript": "npm:@typescript/typescript6@6.0.2",\n    "typescript-eslint": "^8.69.0",\n    "vite": "8.2.2",\n    "vitest": "^5.0.0"\n  },\n  "patchedDependencies": {\n    "@ark/schema@0.56.2": "patches/@ark%2Fschema@0.56.2.patch"\n  }\n}\n',
  'nx.json':
    '{\n  "$schema": "./node_modules/nx/schemas/nx-schema.json",\n  "namedInputs": {\n    "default": ["{projectRoot}/**/*", "sharedGlobals"],\n    "production": [\n      "default",\n      "!{projectRoot}/**/?(*.)+(spec|test).[jt]s?(x)",\n      "!{projectRoot}/tsconfig.spec.json",\n      "!{projectRoot}/src/**/*.stories.[jt]s?(x)",\n      "!{projectRoot}/.eslintrc.json",\n      "!{projectRoot}/eslint.config.js",\n      "!{projectRoot}/vitest.config.[jt]s",\n      "!{projectRoot}/src/test-setup.[jt]s"\n    ],\n    "sharedGlobals": [\n      "{workspaceRoot}/tsconfig.base.json",\n      "{workspaceRoot}/eslint.config.js",\n      "{workspaceRoot}/.prettierrc.json",\n      "{workspaceRoot}/package.json",\n      "{workspaceRoot}/bun.lock",\n      "{workspaceRoot}/tools/test/**/*"\n    ]\n  },\n  "targetDefaults": {\n    "build": {\n      "cache": true,\n      "dependsOn": ["^build"],\n      "inputs": ["production", "^production"]\n    },\n    "test": {\n      "cache": true,\n      "inputs": ["default", "^production"],\n      "outputs": ["{projectRoot}/coverage"],\n      "options": {\n        "env": {\n          "CLAUDECODE": "0",\n          "AGENT": "0"\n        }\n      }\n    },\n    "lint": {\n      "cache": true,\n      "inputs": [\n        "default",\n        "{workspaceRoot}/eslint.config.js",\n        "{workspaceRoot}/tools/tool-devsync/product-policies.mjs",\n        "{workspaceRoot}/tools/tool-devsync/workspace-projects.mjs",\n        "{workspaceRoot}/apps/*/eslint.product.mjs",\n        "{workspaceRoot}/apps/*/*/eslint.product.mjs",\n        "{workspaceRoot}/libs/*/eslint.product.mjs",\n        "{workspaceRoot}/apps/**/project.json",\n        "{workspaceRoot}/libs/**/project.json",\n        "{workspaceRoot}/tools/**/project.json",\n        "{workspaceRoot}/.prettierrc.json"\n      ]\n    },\n    "typecheck": {\n      "cache": true,\n      "inputs": ["default", "^production", "{workspaceRoot}/tsconfig.base.json"]\n    },\n    "deploy": {\n      "cache": false\n    },\n    "push": {\n      "cache": false\n    },\n    "decrypt": {\n      "cache": false\n    },\n    "test:unit": {\n      "options": {\n        "env": {\n          "CLAUDECODE": "0",\n          "AGENT": "0"\n        }\n      }\n    },\n    "test:api": {\n      "options": {\n        "env": {\n          "CLAUDECODE": "0",\n          "AGENT": "0"\n        }\n      }\n    },\n    "test:conformance": {\n      "options": {\n        "env": {\n          "CLAUDECODE": "0",\n          "AGENT": "0"\n        }\n      }\n    },\n    "test:store": {\n      "options": {\n        "env": {\n          "CLAUDECODE": "0",\n          "AGENT": "0"\n        }\n      }\n    },\n    "test:portable": {\n      "options": {\n        "env": {\n          "CLAUDECODE": "0",\n          "AGENT": "0"\n        }\n      }\n    },\n    "test:package": {\n      "options": {\n        "env": {\n          "CLAUDECODE": "0",\n          "AGENT": "0"\n        }\n      }\n    },\n    "integration": {\n      "options": {\n        "env": {\n          "CLAUDECODE": "0",\n          "AGENT": "0"\n        }\n      }\n    },\n    "e2e": {\n      "options": {\n        "env": {\n          "CLAUDECODE": "0",\n          "AGENT": "0"\n        }\n      }\n    },\n    "e2e-packaged": {\n      "options": {\n        "env": {\n          "CLAUDECODE": "0",\n          "AGENT": "0"\n        }\n      }\n    }\n  },\n  "plugins": [],\n  "defaultBase": "main",\n  "parallel": 4,\n  "useInferencePlugins": false,\n  "analytics": false\n}\n',
  'bin/dev.ts':
    "import { realpathSync } from 'node:fs';\nimport { tmpdir } from 'node:os';\nimport { dirname, isAbsolute, resolve } from 'node:path';\nimport { pathToFileURL } from 'node:url';\n\nimport type { Completion } from '../apps/puni/cli/src/entrypoint';\nimport type { Context } from '../apps/puni/cli/src/execute-command';\nimport { createInterrupts, createOutputs } from '../libs/shared/adapters/bun-output/src/index';\n\nclass CallerConfigurationFailure extends Error {}\n\n/**\n * Forward this checkout's complete development purpose to explicitly selected delivered PUNI main.\n * Capture checkout/caller/environment/runtime, native writers and lazy executable IO before import.\n * PUNI alone owns preflight, local Nx, signals and merged capture; no shell or extra child owner.\n * Reusable calls return Completion or preserve their thrown cause, without exiting the caller.\n * @throws on absent/nonabsolute/unreadable selection, unusable main or invalid completion.\n * No source/PATH fallback, default provisioning or arbitrary imported-resource cleanup is promised.\n */\nexport async function runRepositoryDevelopment(args: readonly string[]): Promise<Completion> {\n  const operands = [...args];\n  const environment = { ...process.env };\n  const callerDirectory = process.cwd();\n  const repository = realpathSync.native(resolve(dirname(import.meta.path), '..'));\n  const runtime = process.execPath;\n  const temporaryDirectory = tmpdir();\n  const writeStdout = process.stdout.write.bind(process.stdout);\n  const writeStderr = process.stderr.write.bind(process.stderr);\n  const nativeStdout = Bun.stdout,\n    nativeStderr = Bun.stderr;\n  let diagnosticAttempt: ReturnType<NonNullable<Context['developmentIO']>['readDiagnosticAttempt']>;\n  const developmentIO: NonNullable<Context['developmentIO']> = {\n    stdin: 0,\n    stdout: 1,\n    stderr: 2,\n    openStdout: nativeStdout.writer.bind(nativeStdout),\n    openStderr: nativeStderr.writer.bind(nativeStderr),\n    recordDiagnosticAttempt: (cause, outcome) => {\n      diagnosticAttempt = { cause, outcome };\n    },\n    readDiagnosticAttempt: () => diagnosticAttempt,\n  };\n  const selected = environment['PUNI_EXECUTABLE'];\n  if (selected === undefined || !isAbsolute(selected))\n    throw new CallerConfigurationFailure(\n      'set PUNI_EXECUTABLE to the absolute entrypoint of a separately provisioned reviewed current PUNI installation',\n    );\n  const entrypoint = realpathSync.native(selected);\n  const directory = dirname(entrypoint);\n  const context: Context = {\n    installation: { directory, entrypoint },\n    lookup: { directory: callerDirectory, path: environment['PATH'] },\n    callerDirectory,\n    runtime,\n    temporaryDirectory,\n    environment,\n    developmentIO,\n    stdout: (bytes) => {\n      writeStdout(bytes);\n    },\n    stderr: (bytes) => {\n      writeStderr(bytes);\n    },\n  };\n  const delivered: unknown = await import(pathToFileURL(entrypoint).href);\n  if (\n    typeof delivered !== 'object' ||\n    delivered === null ||\n    !('main' in delivered) ||\n    typeof delivered.main !== 'function'\n  )\n    throw new CallerConfigurationFailure(\n      'selected PUNI must export callable main; provision the reviewed current PUNI artifact',\n    );\n  const completion: unknown = await Reflect.apply(delivered.main, delivered, [\n    ['dash', 'dev', ...operands, '--repository', repository],\n    context,\n  ]);\n  if (\n    typeof completion !== 'object' ||\n    completion === null ||\n    !('kind' in completion) ||\n    (completion.kind !== 'drain' && completion.kind !== 'exit') ||\n    !('status' in completion) ||\n    typeof completion.status !== 'number' ||\n    !Number.isInteger(completion.status) ||\n    completion.status < 0 ||\n    completion.status > 255\n  )\n    throw new CallerConfigurationFailure(\n      'selected PUNI returned an invalid completion; provision the reviewed current PUNI artifact',\n    );\n  return { kind: completion.kind, status: completion.status };\n}\n\n/** Bound failure reporting with pre-import factories, then release both successful local acquisitions. */\nasync function reportCallerFailure(\n  instruction: string,\n  factories: Pick<Parameters<typeof createOutputs>[0], 'stdout' | 'stderr'>,\n): Promise<void> {\n  const interrupts = createInterrupts('repository development adapter');\n  let outputs: ReturnType<typeof createOutputs> | undefined;\n  try {\n    outputs = createOutputs({\n      name: 'repository development adapter',\n      stdout: factories.stdout,\n      stderr: factories.stderr,\n      subscribeInterrupts: interrupts.subscribe,\n    });\n    await outputs.reportDiagnostic(Buffer.from('development: ' + instruction + '\\n'));\n  } finally {\n    try {\n      outputs?.dispose();\n    } finally {\n      interrupts.dispose();\n    }\n  }\n}\n\nif (import.meta.main) {\n  const nativeStdout = Bun.stdout,\n    nativeStderr = Bun.stderr;\n  const diagnosticFactories = {\n    stdout: nativeStdout.writer.bind(nativeStdout),\n    stderr: nativeStderr.writer.bind(nativeStderr),\n  };\n  try {\n    const completion = await runRepositoryDevelopment(process.argv.slice(2));\n    if (completion.kind === 'exit') process.exit(completion.status);\n    process.exitCode = completion.status;\n  } catch (cause: unknown) {\n    const instruction =\n      cause instanceof CallerConfigurationFailure\n        ? cause.message\n        : 'selected installed PUNI could not complete; verify its reviewed provisioning and PUNI_EXECUTABLE';\n    try {\n      await reportCallerFailure(instruction, diagnosticFactories);\n    } finally {\n      process.exit(1);\n    }\n  }\n}\n",
  'apps/wbs/be-01/project.json':
    '{\n  "name": "wbs-be-01",\n  "$schema": "../../../node_modules/nx/schemas/project-schema.json",\n  "sourceRoot": "apps/wbs/be-01/src",\n  "projectType": "application",\n  "tags": ["scope:app", "type:app", "runtime:bun", "ring:adapter", "product:wbs"],\n  "targets": {\n    "serve": {\n      "executor": "nx:run-commands",\n      "continuous": true,\n      "options": {\n        "command": "bun --watch src/main.ts",\n        "cwd": "apps/wbs/be-01"\n      },\n      "cache": false\n    },\n    "build": {\n      "executor": "nx:run-commands",\n      "options": {\n        "commands": [\n          "bun build apps/wbs/be-01/src/main.ts --target=bun --outdir=dist/apps/wbs/be-01",\n          "mkdir -p dist/apps/wbs/be-01/public-email-policy && cp libs/wbs/domain/domain/src/public-email-policy.v1.json libs/wbs/domain/domain/src/public-email-policy.manifest.json dist/apps/wbs/be-01/public-email-policy/",\n          "bun apps/wbs/be-01/src/openapi/emit-openapi-cli.ts dist/apps/wbs/be-01/openapi.json"\n        ],\n        "parallel": false\n      },\n      "outputs": ["{workspaceRoot}/dist/apps/wbs/be-01"],\n      "dependsOn": ["^build", "build-host-restore"]\n    },\n    "solver-image-smoke": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "shellcheck -s bash apps/wbs/be-01/scripts/solver-image-smoke.sh && bash apps/wbs/be-01/scripts/solver-image-smoke.sh"\n      },\n      "cache": false\n    },\n    "lint": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bunx eslint apps/wbs/be-01/src"\n      }\n    },\n    "lint:fast": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bunx eslint apps/wbs/be-01/src --cache --cache-location .nx/eslintcache-wbs-be-01"\n      }\n    },\n    "test": {\n      "executor": "nx:run-commands",\n      "inputs": [\n        "default",\n        "^production",\n        "{workspaceRoot}/libs/wbs/domain/domain/src/schedule.ts",\n        "{workspaceRoot}/openspec/changes/dual-optimized-scheduler/design.md",\n        "{workspaceRoot}/openspec/changes/wbs-permissions/permission-matrix.md",\n        "{workspaceRoot}/tools/tool-remote-scripts/src/fixtures/solver-supervisor-orphan-host.ts",\n        "{workspaceRoot}/apps/wbs/gw-01/src/**/*",\n        "{workspaceRoot}/apps/wbs/fe-01/src/**/*",\n        "{workspaceRoot}/apps/wbs/fe-01/tsconfig.app.json",\n        "{workspaceRoot}/apps/wbs/fe-01/tsconfig.json",\n        "{workspaceRoot}/apps/twilight-structure/twilight-dash/cli/src/runs/**/*",\n        "{workspaceRoot}/apps/twilight-structure/twilight-dash/cli/src/bridge/**/*",\n        "{workspaceRoot}/apps/twilight-structure/twilight-dash/cli/src/agents/**/*",\n        "{workspaceRoot}/apps/twilight-structure/twilight-dash/cli/src/clock.ts",\n        "{workspaceRoot}/apps/twilight-structure/twilight-burokrat/cli/src/contracts/**/*",\n        "mcpAgentRuntime"\n      ],\n      "options": {\n        "command": "bun test --coverage --coverage-reporter=lcov --timeout=10000",\n        "cwd": "apps/wbs/be-01"\n      },\n      "outputs": ["{projectRoot}/coverage"],\n      "dependsOn": ["prepare-mcp-document"]\n    },\n    "test:unit": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bun test $(find src -name \'*.test.ts\' ! -name \'*.db.test.ts\' | tr \'\\\\n\' \' \') --timeout=10000",\n        "cwd": "apps/wbs/be-01"\n      },\n      "dependsOn": ["prepare-mcp-document"],\n      "inputs": ["default", "^production", "mcpAgentRuntime"]\n    },\n    "test:store": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bun test .db.test.ts --timeout=10000",\n        "cwd": "apps/wbs/be-01"\n      },\n      "dependsOn": ["prepare-mcp-document"],\n      "inputs": ["default", "^production", "mcpAgentRuntime"]\n    },\n    "typecheck": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bunx tsc --build --force apps/wbs/be-01/tsconfig.json"\n      },\n      "dependsOn": ["typecheck:module"]\n    },\n    "serve-local-solver": {\n      "executor": "nx:run-commands",\n      "continuous": true,\n      "options": {\n        "command": "bun --watch src/dev/main.ts",\n        "cwd": "apps/wbs/be-01"\n      },\n      "cache": false\n    },\n    "typecheck:module": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bun tools/tool-devsync/src/typecheck-modules.ts apps/wbs/be-01/src/module"\n      }\n    },\n    "build-host-restore": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bun build apps/wbs/be-01/src/shared-people-host-restore-cli.ts --target=bun --outfile=dist/apps/wbs/be-01-host/shared-people-host-restore.js"\n      },\n      "outputs": ["{workspaceRoot}/dist/apps/wbs/be-01-host"]\n    },\n    "test:host-restore": {\n      "executor": "nx:run-commands",\n      "cache": false,\n      "dependsOn": ["build-host-restore"],\n      "options": {\n        "command": "bun test ./apps/wbs/be-01/scripts/shared-people-host-artifact.smoke.ts ./apps/wbs/be-01/scripts/shared-people-host-restore.rehearsal.ts --timeout=60000",\n        "env": {\n          "CLAUDECODE": "0",\n          "AGENT": "0"\n        }\n      }\n    },\n    "acceptance:historical-plan-reader": {\n      "executor": "nx:run-commands",\n      "cache": false,\n      "options": {\n        "command": "bun test ./apps/wbs/be-01/scripts/historical-plan-reader.acceptance.ts --timeout=60000",\n        "env": {\n          "CLAUDECODE": "0",\n          "AGENT": "0"\n        }\n      }\n    },\n    "prepare-mcp-document": {\n      "executor": "nx:run-commands",\n      "cache": false,\n      "inputs": ["mcpAgentRuntime", "^production"],\n      "options": {\n        "command": "bun apps/wbs/be-01/src/openapi/emit-openapi-cli.ts apps/wbs/mcp-01/src/openapi.json"\n      },\n      "outputs": ["{workspaceRoot}/apps/wbs/mcp-01/src/openapi.json"]\n    }\n  },\n  "namedInputs": {\n    "mcpAgentRuntime": [\n      "{projectRoot}/src/openapi/emit-openapi-cli.ts",\n      "{workspaceRoot}/apps/twilight-structure/twilight-dash/cli/src/clock.ts",\n      "{workspaceRoot}/apps/twilight-structure/twilight-dash/cli/src/compute/configuration.ts",\n      "{workspaceRoot}/apps/twilight-structure/twilight-dash/cli/src/compute/provider.ts",\n      "{workspaceRoot}/apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts",\n      "{workspaceRoot}/apps/twilight-structure/twilight-dash/cli/src/mcp/machine-token.ts",\n      "{workspaceRoot}/apps/twilight-structure/twilight-dash/cli/src/mcp/token-command.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/drizzle/20260921090000_mcp_refresh_family/down.sql",\n      "{workspaceRoot}/apps/wbs/mcp-01/drizzle/20260921090000_mcp_refresh_family/migration.sql",\n      "{workspaceRoot}/apps/wbs/mcp-01/drizzle/20260927120000_mcp_credential_binding/down.sql",\n      "{workspaceRoot}/apps/wbs/mcp-01/drizzle/20260927120000_mcp_credential_binding/migration.sql",\n      "{workspaceRoot}/apps/wbs/mcp-01/drizzle/20261021120000_mcp_client/down.sql",\n      "{workspaceRoot}/apps/wbs/mcp-01/drizzle/20261021120000_mcp_client/migration.sql",\n      "{workspaceRoot}/apps/wbs/mcp-01/drizzle/20261022130000_mcp_family_person/down.sql",\n      "{workspaceRoot}/apps/wbs/mcp-01/drizzle/20261022130000_mcp_family_person/migration.sql",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/caller-auth.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/config.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/deployment-fault.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/http.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/in-flight-counter.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/load/mcp-01-loopback.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/machine-admission.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/machine-grant-client.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/machine-limits.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/main.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/oauth.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/openapi-tools.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/organization-authority.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/pending-authorizations.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/refresh-authority.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/server.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/session-store.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/source-address.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/store-migrations.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/token-bucket.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/token-request.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/unexpected-tool-failure.ts",\n      "{workspaceRoot}/apps/wbs/mcp-01/src/wbs-client.ts"\n    ]\n  }\n}\n',
  'apps/wbs/gw-01/project.json':
    '{\n  "name": "wbs-gw-01",\n  "$schema": "../../../node_modules/nx/schemas/project-schema.json",\n  "sourceRoot": "apps/wbs/gw-01/src",\n  "projectType": "application",\n  "tags": ["scope:app", "type:app", "runtime:bun", "ring:adapter", "product:wbs"],\n  "targets": {\n    "serve": {\n      "executor": "nx:run-commands",\n      "continuous": true,\n      "options": {\n        "command": "bun --watch src/main.ts",\n        "cwd": "apps/wbs/gw-01"\n      },\n      "cache": false\n    },\n    "build": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bun build apps/wbs/gw-01/src/main.ts --target=bun --outdir=dist/apps/wbs/gw-01"\n      },\n      "outputs": ["{workspaceRoot}/dist/apps/wbs/gw-01"]\n    },\n    "lint": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bunx eslint apps/wbs/gw-01/src"\n      }\n    },\n    "lint:fast": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bunx eslint apps/wbs/gw-01/src --cache --cache-location .nx/eslintcache-wbs-gw-01"\n      }\n    },\n    "test": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bun test --coverage --coverage-reporter=lcov --timeout=10000",\n        "cwd": "apps/wbs/gw-01"\n      },\n      "outputs": ["{projectRoot}/coverage"]\n    },\n    "typecheck": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bunx tsc --build --force apps/wbs/gw-01/tsconfig.json"\n      }\n    },\n    "serve-local-solver": {\n      "executor": "nx:run-commands",\n      "continuous": true,\n      "options": {\n        "command": "bun --watch src/main.ts",\n        "cwd": "apps/wbs/gw-01"\n      },\n      "cache": false\n    }\n  }\n}\n',
  'apps/wbs/mcp-01/project.json':
    '{\n  "name": "wbs-mcp-01",\n  "$schema": "../../../node_modules/nx/schemas/project-schema.json",\n  "sourceRoot": "apps/wbs/mcp-01/src",\n  "projectType": "application",\n  "tags": ["scope:app", "type:app", "runtime:bun", "ring:adapter", "product:wbs"],\n  "implicitDependencies": ["wbs-be-01"],\n  "targets": {\n    "serve": {\n      "executor": "nx:run-commands",\n      "continuous": true,\n      "options": {\n        "command": "bun --watch src/main.ts",\n        "cwd": "apps/wbs/mcp-01"\n      },\n      "cache": false,\n      "dependsOn": ["prepare"]\n    },\n    "build": {\n      "executor": "nx:run-commands",\n      "options": {\n        "commands": [\n          "bun build apps/wbs/mcp-01/src/main.ts --target=bun --outdir=dist/apps/wbs/mcp-01",\n          "bun apps/wbs/be-01/src/openapi/emit-openapi-cli.ts dist/apps/wbs/mcp-01/openapi.json"\n        ],\n        "parallel": false\n      },\n      "outputs": ["{workspaceRoot}/dist/apps/wbs/mcp-01"]\n    },\n    "lint": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bunx eslint apps/wbs/mcp-01/src"\n      }\n    },\n    "lint:fast": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bunx eslint apps/wbs/mcp-01/src --cache --cache-location .nx/eslintcache-wbs-mcp-01"\n      }\n    },\n    "test": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bun test --coverage --coverage-reporter=lcov --timeout=10000",\n        "cwd": "apps/wbs/mcp-01"\n      },\n      "outputs": ["{projectRoot}/coverage"],\n      "dependsOn": ["prepare"]\n    },\n    "typecheck": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bunx tsc --build --force apps/wbs/mcp-01/tsconfig.json"\n      }\n    },\n    "serve-local-solver": {\n      "executor": "nx:run-commands",\n      "continuous": true,\n      "options": {\n        "command": "bun --watch src/main.ts",\n        "cwd": "apps/wbs/mcp-01"\n      },\n      "cache": false,\n      "dependsOn": ["prepare"]\n    },\n    "prepare": {\n      "executor": "nx:noop",\n      "outputs": ["{projectRoot}/src/openapi.json"],\n      "cache": false,\n      "dependsOn": [\n        {\n          "projects": ["wbs-be-01"],\n          "target": "prepare-mcp-document"\n        }\n      ]\n    }\n  }\n}\n',
  'apps/wbs/fe-01/project.json':
    '{\n  "name": "wbs-fe-01",\n  "$schema": "../../../node_modules/nx/schemas/project-schema.json",\n  "sourceRoot": "apps/wbs/fe-01/src",\n  "projectType": "application",\n  "tags": ["scope:app", "type:app", "runtime:browser", "ring:adapter", "product:wbs"],\n  "targets": {\n    "serve": {\n      "executor": "nx:run-commands",\n      "continuous": true,\n      "options": {\n        "command": "bunx vite",\n        "cwd": "apps/wbs/fe-01"\n      },\n      "cache": false\n    },\n    "build": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bunx vite build",\n        "cwd": "apps/wbs/fe-01"\n      },\n      "outputs": ["{workspaceRoot}/dist/apps/wbs/fe-01"]\n    },\n    "test": {\n      "dependsOn": ["test:unit"],\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000 && TZ=Pacific/Auckland bunx vitest run --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000",\n        "cwd": "apps/wbs/fe-01"\n      }\n    },\n    "test:unit": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "TZ=UTC bunx vitest run --config vitest.node.config.ts --testTimeout=30000 --hookTimeout=30000",\n        "cwd": "apps/wbs/fe-01"\n      }\n    },\n    "test:unit:level": {\n      "executor": "nx:run-commands",\n      "cache": false,\n      "options": {\n        "command": "mkdir -p ../../../tmp/junit && rm -f ../../../tmp/junit/wbs-fe-01.unit.xml ../../../tmp/junit/wbs-fe-01.unit.root.xml && TZ=UTC bunx vitest run --config vitest.node.config.ts --testTimeout=30000 --hookTimeout=30000 --reporter=junit --outputFile=../../../tmp/junit/wbs-fe-01.unit.xml && TZ=UTC bunx vitest run --config vitest.unit-root.config.ts --testTimeout=30000 --hookTimeout=30000 --reporter=junit --outputFile=../../../tmp/junit/wbs-fe-01.unit.root.xml",\n        "cwd": "apps/wbs/fe-01",\n        "env": { "CLAUDECODE": "0", "AGENT": "0" },\n        "forwardAllArgs": false\n      }\n    },\n    "test:view:level": {\n      "executor": "nx:run-commands",\n      "cache": false,\n      "options": {\n        "command": "mkdir -p ../../../tmp/junit && rm -f ../../../tmp/junit/wbs-fe-01.view.utc.xml ../../../tmp/junit/wbs-fe-01.view.auckland.xml && TZ=UTC bunx vitest run --config vitest.view.config.ts --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000 --reporter=junit --outputFile=../../../tmp/junit/wbs-fe-01.view.utc.xml && TZ=Pacific/Auckland bunx vitest run --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000 --reporter=junit --outputFile=../../../tmp/junit/wbs-fe-01.view.auckland.xml",\n        "cwd": "apps/wbs/fe-01",\n        "env": { "CLAUDECODE": "0", "AGENT": "0" },\n        "forwardAllArgs": false\n      }\n    },\n    "test:performance:level": {\n      "executor": "nx:run-commands",\n      "cache": false,\n      "options": {\n        "command": "bun tools/tool-devsync/src/performance-level.ts",\n        "forwardAllArgs": false\n      }\n    },\n    "test:browser:ordinary:level": {\n      "executor": "nx:run-commands",\n      "cache": false,\n      "options": {\n        "command": "bun tools/tool-devsync/src/browser-level.ts ordinary",\n        "forwardAllArgs": false\n      }\n    },\n    "test:browser:packaged:level": {\n      "executor": "nx:run-commands",\n      "cache": false,\n      "options": {\n        "command": "bun tools/tool-devsync/src/browser-level.ts packaged",\n        "forwardAllArgs": false\n      }\n    },\n    "test:browser:level": {\n      "executor": "nx:run-commands",\n      "cache": false,\n      "options": {\n        "commands": [\n          "bunx nx run wbs-fe-01:test:browser:ordinary:level",\n          "bunx nx run wbs-fe-01:test:browser:packaged:level",\n          "bunx nx run wbs-core:test:browser:portable:level"\n        ],\n        "parallel": false,\n        "forwardAllArgs": false\n      }\n    },\n    "e2e": {\n      "executor": "nx:run-commands",\n      "options": {\n        "commands": [\n          "bun run tools/dev/setup.ts",\n          "bunx playwright test --config apps/wbs/fe-01/playwright.config.ts"\n        ],\n        "parallel": false\n      },\n      "cache": false\n    },\n    "e2e-organization": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bunx playwright test --config=apps/wbs/fe-01/playwright.organization.config.ts",\n        "env": { "CLAUDECODE": "0", "AGENT": "0" }\n      },\n      "cache": false\n    },\n    "e2e-packaged": {\n      "executor": "nx:run-commands",\n      "options": {\n        "commands": [\n          "bunx nx run wbs-fe-01:build",\n          "bunx playwright test --config apps/wbs/fe-01/playwright.packaged.config.ts"\n        ],\n        "parallel": false\n      },\n      "cache": false\n    },\n    "lint": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bunx eslint apps/wbs/fe-01/src apps/wbs/fe-01/e2e apps/wbs/fe-01/e2e-packaged apps/wbs/fe-01/playwright.config.ts apps/wbs/fe-01/playwright.cross-project.config.ts apps/wbs/fe-01/playwright.organization.config.ts apps/wbs/fe-01/playwright.packaged.config.ts apps/wbs/fe-01/playwright.performance.config.ts apps/wbs/fe-01/playwright.ordinary-servers.ts apps/wbs/fe-01/ordinary-servers-cli.ts apps/wbs/fe-01/vite.config.ts apps/wbs/fe-01/vite.benchmark.config.ts apps/wbs/fe-01/vitest.config.ts apps/wbs/fe-01/vitest.node.config.ts apps/wbs/fe-01/vitest.zoned.config.ts apps/wbs/fe-01/vitest.view.config.ts apps/wbs/fe-01/vitest.unit-root.config.ts apps/wbs/fe-01/vitest.node-suites.ts apps/wbs/fe-01/vitest.view-level.test.ts apps/wbs/fe-01/vite-config.test.ts apps/wbs/fe-01/browser-packages.test.ts apps/wbs/fe-01/vitest.setup.ts apps/wbs/fe-01/playwright-config.test.ts apps/wbs/fe-01/vitest-budget.test.ts"\n      }\n    },\n    "lint:fast": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "bunx eslint apps/wbs/fe-01/src apps/wbs/fe-01/e2e apps/wbs/fe-01/e2e-packaged apps/wbs/fe-01/playwright.config.ts apps/wbs/fe-01/playwright.cross-project.config.ts apps/wbs/fe-01/playwright.organization.config.ts apps/wbs/fe-01/playwright.packaged.config.ts apps/wbs/fe-01/playwright.performance.config.ts apps/wbs/fe-01/playwright.ordinary-servers.ts apps/wbs/fe-01/ordinary-servers-cli.ts apps/wbs/fe-01/vite.config.ts apps/wbs/fe-01/vite.benchmark.config.ts apps/wbs/fe-01/vitest.config.ts apps/wbs/fe-01/vitest.node.config.ts apps/wbs/fe-01/vitest.zoned.config.ts apps/wbs/fe-01/vitest.view.config.ts apps/wbs/fe-01/vitest.unit-root.config.ts apps/wbs/fe-01/vitest.node-suites.ts apps/wbs/fe-01/vitest.view-level.test.ts apps/wbs/fe-01/vite-config.test.ts apps/wbs/fe-01/browser-packages.test.ts apps/wbs/fe-01/vitest.setup.ts apps/wbs/fe-01/playwright-config.test.ts apps/wbs/fe-01/vitest-budget.test.ts --cache --cache-location .nx/eslintcache-wbs-fe-01"\n      }\n    },\n    "typecheck": {\n      "executor": "nx:run-commands",\n      "dependsOn": ["typecheck:module"],\n      "options": {\n        "command": "bunx tsc --build --force apps/wbs/fe-01/tsconfig.json"\n      }\n    },\n    "typecheck:module": {\n      "executor": "nx:run-commands",\n      "options": {\n        "command": "status=0; for module in apps/wbs/fe-01/src/modules/*/; do echo \\"typecheck:module $module\\"; bunx tsc -p \\"$module\\"tsconfig.json --noEmit || status=1; done; exit $status"\n      }\n    },\n    "serve-local-solver": {\n      "executor": "nx:run-commands",\n      "continuous": true,\n      "options": {\n        "command": "bunx vite",\n        "cwd": "apps/wbs/fe-01"\n      },\n      "cache": false\n    },\n    "e2e-cross-project": {\n      "executor": "nx:run-commands",\n      "cache": false,\n      "inputs": [\n        "default",\n        "^production",\n        "{workspaceRoot}/apps/wbs/be-01/src/**/*",\n        "{workspaceRoot}/apps/wbs/gw-01/src/**/*"\n      ],\n      "options": {\n        "command": "bunx playwright test --config apps/wbs/fe-01/playwright.cross-project.config.ts",\n        "env": { "CLAUDECODE": "0", "AGENT": "0" }\n      }\n    }\n  },\n  "implicitDependencies": ["wbs-be-01", "wbs-gw-01"]\n}\n',
  'apps/wbs/be-01/src/main.ts': 'export {};\n',
  'apps/wbs/gw-01/src/main.ts': 'export {};\n',
  'apps/wbs/mcp-01/src/main.ts': 'export {};\n',
  'apps/wbs/fe-01/src/main.ts': 'export {};\n',
};

function normalizeCurrentSource(directory: string): void {
  chmodSync(directory, 0o755);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) normalizeCurrentSource(path);
    else if (entry.isFile()) chmodSync(path, statSync(path).mode & 0o111 ? 0o755 : 0o644);
    else throw new Error('controlled current source tree has an unexpected nonregular member');
  }
}
function exerciseCurrentSourceTree(
  variant:
    'healthy' | 'changed-source' | 'changed-config' | 'changed-installation' | 'legacy-launch',
): void {
  const prepared = createForgeSelection();
  const worktree = join(prepared.fixture.root, 'current-source');
  mkdirSync(worktree, { mode: 0o755 });
  writeFileSync(join(worktree, '.gitignore'), 'node_modules/\napps/wbs/*/.env\n');
  for (const [path, contents] of Object.entries(currentSourceInputs)) {
    const separator = path.lastIndexOf('/');
    if (separator >= 0)
      mkdirSync(join(worktree, path.slice(0, separator)), { recursive: true, mode: 0o755 });
    writeFileSync(join(worktree, path), contents, { mode: 0o644 });
  }
  writeFileSync(join(worktree, 'owned.txt'), 'independent current source\n', { mode: 0o644 });
  mkdirSync(join(worktree, 'node_modules'), { mode: 0o755 });
  writeFileSync(join(worktree, 'node_modules/controlled.js'), 'export const dependency = true;\n', {
    mode: 0o644,
  });
  function git(arguments_: readonly string[]): string {
    const observed = runSelectionChild(
      ['git', '--no-optional-locks', '-C', worktree, ...arguments_],
      prepared.consumer,
      [prepared.fixture.root, prepared.session],
      10000,
      {
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_NO_REPLACE_OBJECTS: '1',
      },
    );
    expect(observed.exitCode, observed.stderr.toString()).toBe(0);
    return observed.stdout.toString().trim();
  }
  git(['init', '-q']);
  git(['add', '.']);
  git([
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '-qm',
    'explicit current source inputs',
  ]);
  normalizeCurrentSource(worktree);
  const sourceSha = git(['rev-parse', 'HEAD']);
  expect(sourceSha).toMatch(/^[0-9a-f]{40}$/);
  const entry = new URL(
    '../../../../../../tools/tool-remote-scripts/src/fixtures/source-current-owner.ts',
    import.meta.url,
  );
  expect(existsSync(entry)).toBe(true);
  const supplied = {
    root: worktree,
    sha: sourceSha,
    variant,
    recordPath: prepared.recordPath,
    selectionSha256: hashBytes(prepared.recordBytes),
    packageDirectory: prepared.packageDirectory,
  };
  const observed = runSelectionChild(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      fileURLToPath(entry),
      JSON.stringify(supplied),
    ],
    worktree,
    [prepared.fixture.root, prepared.session],
    45000,
    { BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' },
  );
  // A normal direct parent does not certify its internal Git owner; retain roots until its valid completion record is read.
  for (const root of [prepared.fixture.root, prepared.session]) {
    const at = roots.indexOf(root);
    if (at < 0) throw new Error('current source cleanup authority disappeared');
    roots.splice(at, 1);
  }
  const observations = observed.stdout
    .toString()
    .trimEnd()
    .split('\n')
    .filter((line) => line !== '')
    .map((line): unknown => JSON.parse(line));
  if (
    observations.some(
      (observation) =>
        typeof observation === 'object' &&
        observation !== null &&
        'unknownGit' in observation &&
        observation.unknownGit === true,
    )
  )
    throw new Error('current source nested child custody unknown; owned roots retained');
  expect(observed.exitCode, observed.stderr.toString()).toBe(0);
  expect(observed.stderr.toString()).toBe('');
  expect(observations.at(0)).toEqual({
    stage: 'current-tree-ready',
    version: 2,
    profile: 'wbs-source-cold-v2',
    sourceSha,
    selectionSha256: hashBytes(prepared.recordBytes),
  });
  expect(observations).toHaveLength(variant === 'healthy' ? 1 : 2);
  if (variant !== 'healthy')
    expect(observations.at(1)).toEqual({
      stage: 'current-tree-refusal',
      refused: true,
      sanitized: true,
    });
  roots.push(prepared.fixture.root, prepared.session);
}
for (const variant of [
  'healthy',
  'changed-source',
  'changed-config',
  'changed-installation',
  'legacy-launch',
] as const)
  it(
    'current cold source owns ' +
      variant +
      ' after real Bun installation, clean Git and full current tree capture',
    () => {
      exerciseCurrentSourceTree(variant);
    },
    90000,
  );

for (const purpose of [
  'bootstrap',
  'configuration',
  'configuration-malformed',
  'package-data',
  'source-missing',
  'source-unreadable',
] as const)
  it(
    'Forge owns required ' + purpose + ' mutation after real compiler and frozen-install premises',
    async () => {
      exerciseForgeSupervisor(false);
      const prepared = createForgeSelection(forgeLeafProgram());
      const worktree = join(prepared.fixture.root, 'required-worktree');
      const executionSource = join(prepared.fixture.root, 'required-source');
      const witnesses = join(prepared.fixture.root, 'required-observations');
      mkdirSync(worktree);
      mkdirSync(executionSource);
      mkdirSync(witnesses);
      const loaded = await createForgeLoadedSource(executionSource);
      const target =
        purpose === 'bootstrap'
          ? join(executionSource, 'tools/tool-devsync/src/k3s/forge-execution.ts')
          : purpose === 'configuration' || purpose === 'configuration-malformed'
            ? join(executionSource, 'tsconfig.base.json')
            : purpose === 'source-missing' || purpose === 'source-unreadable'
              ? loaded.sdk
              : join(executionSource, 'node_modules/arktype/LICENSE');
      const before = hashBytes(readFileSync(target));
      writeFileSync(join(worktree, 'nx.json'), '{"plugins":[]}\n');
      writeFileSync(
        join(worktree, 'package.json'),
        readFileSync(join(prepared.consumer, 'package.json')),
      );
      writeFileSync(join(worktree, 'bun.lock'), readFileSync(join(prepared.consumer, 'bun.lock')));
      const entrypoint = realpathSync.native(
        join(prepared.consumer, 'node_modules/puni/dist/puni.mjs'),
      );
      const controller = join(prepared.session, 'required-controller.mjs');
      writeFileSync(
        controller,
        forgeControllerProgram(
          worktree,
          prepared.session,
          witnesses,
          prepared.recordPath,
          hashBytes(prepared.recordBytes),
          entrypoint,
          false,
          { supervisor: loaded.supervisor, sdk: target, purpose },
        ),
      );
      const owner = runSelectionChild(
        [process.execPath, '--no-env-file', '--config=/dev/null', controller],
        worktree,
        [prepared.fixture.root, prepared.session],
        75000,
        { TMPDIR: witnesses },
      );
      for (const root of [prepared.fixture.root, prepared.session]) {
        const at = roots.indexOf(root);
        if (at < 0) throw new Error('required-input fixture cleanup ownership disappeared');
        roots.splice(at, 1);
      }
      const events = readForgeEvents(join(witnesses, 'native.jsonl'));
      const acquired = events.filter((event) => event['kind'] === 'acquired');
      const native = events.filter((event) => event['kind'] === 'native');
      if (acquired.length === 0 || acquired.length !== native.length)
        throw new Error('required-input fixture native custody incomplete; roots retained');
      for (const event of acquired) {
        const pid = event['pid'];
        const terminals = native.filter((terminal) => terminal['pid'] === pid);
        const terminal = terminals.at(0);
        if (
          typeof pid !== 'number' ||
          !Number.isInteger(pid) ||
          pid <= 0 ||
          terminals.length !== 1 ||
          terminal?.['failure'] !== null ||
          typeof terminal['code'] !== 'number' ||
          terminal['signal'] !== null
        )
          throw new Error('required-input fixture native settlement unconfirmed; roots retained');
      }
      roots.push(prepared.fixture.root, prepared.session);
      const installs = acquired.filter((event) => event['purpose'] === 'install');
      expect(installs).toHaveLength(1);
      expect(native.find((event) => event['pid'] === installs.at(0)?.['pid'])?.['code']).toBe(0);
      const changes = events.filter((event) => event['kind'] === 'loaded-required-input-changed');
      expect(changes).toHaveLength(1);
      expect(changes.at(0)?.['purpose']).toBe(purpose);
      expect(changes.at(0)?.['path']).toBe(target);
      expect(changes.at(0)?.['before']).toBe(before);
      if (purpose === 'source-missing' || purpose === 'source-unreadable') {
        expect(changes.at(0)?.['after']).toBeNull();
        expect(changes.at(0)?.['readFailure']).toBe(
          purpose === 'source-missing' ? 'ENOENT' : 'EACCES',
        );
      } else {
        expect(changes.at(0)?.['after']).toBe(hashBytes(readFileSync(target)));
        expect(changes.at(0)?.['after']).not.toBe(before);
      }
      expect(acquired.filter((event) => event['purpose'] === 'development')).toHaveLength(0);
      expect(events.filter((event) => event['kind'] === 'start')).toHaveLength(0);
      if (
        purpose === 'configuration-malformed' ||
        purpose === 'source-missing' ||
        purpose === 'source-unreadable'
      ) {
        // Actual malformed/absent/unreadable trusted state must throw, never default or admit a parent.
        expect(owner.exitCode).toBe(1);
        expect(owner.stderr.toString()).toContain('Forge required execution failed');
      } else {
        expect(owner.exitCode, owner.stderr.toString()).toBe(0);
        expect(JSON.parse(readFileSync(join(witnesses, 'outcome.json'), 'utf8'))).toEqual({
          status: 0,
          global: 57,
        });
      }
    },
    240000,
  );

it('Forge refuses a byte-identical replacement of its owned mapped Bun runtime before a successor', async () => {
  exerciseForgeSupervisor(false);
  const prepared = createForgeSelection(forgeLeafProgram());
  const worktree = join(prepared.fixture.root, 'native-worktree'),
    executionSource = join(prepared.fixture.root, 'native-source'),
    witnesses = join(prepared.fixture.root, 'native-observations');
  mkdirSync(worktree);
  mkdirSync(executionSource);
  mkdirSync(witnesses);
  const loaded = await createForgeLoadedSource(executionSource);
  writeFileSync(join(worktree, 'nx.json'), '{"plugins":[]}\n');
  writeFileSync(
    join(worktree, 'package.json'),
    readFileSync(join(prepared.consumer, 'package.json')),
  );
  writeFileSync(join(worktree, 'bun.lock'), readFileSync(join(prepared.consumer, 'bun.lock')));
  const runtime = join(prepared.fixture.root, 'owned-bun');
  copyFileSync(process.execPath, runtime);
  chmodSync(runtime, statSync(process.execPath).mode & 0o777);
  const runtimeHash = hashBytes(readFileSync(runtime));
  expect(runtimeHash).toBe(hashBytes(readFileSync(process.execPath)));
  const runnable = runSelectionChild(
    [runtime, '--no-env-file', '--config=/dev/null', '--version'],
    worktree,
    [prepared.fixture.root, prepared.session],
    5000,
  );
  expect(runnable.exitCode, runnable.stderr.toString()).toBe(0);
  expect(runnable.stdout.toString()).toBe(Bun.version + '\n');
  const entrypoint = realpathSync.native(
    join(prepared.consumer, 'node_modules/puni/dist/puni.mjs'),
  );
  const controller = join(prepared.session, 'native-controller.mjs');
  writeFileSync(
    controller,
    forgeControllerProgram(
      worktree,
      prepared.session,
      witnesses,
      prepared.recordPath,
      hashBytes(prepared.recordBytes),
      entrypoint,
      false,
      { supervisor: loaded.supervisor, sdk: runtime, purpose: 'native-runtime' },
    ),
  );
  const owner = runSelectionChild(
    [runtime, '--no-env-file', '--config=/dev/null', controller],
    worktree,
    [prepared.fixture.root, prepared.session],
    75000,
    { TMPDIR: witnesses },
  );
  for (const root of [prepared.fixture.root, prepared.session]) {
    const at = roots.indexOf(root);
    if (at < 0) throw new Error('native-runtime fixture cleanup ownership disappeared');
    roots.splice(at, 1);
  }
  const events = readForgeEvents(join(witnesses, 'native.jsonl'));
  const acquired = events.filter((event) => event['kind'] === 'acquired'),
    native = events.filter((event) => event['kind'] === 'native');
  if (acquired.length === 0 || acquired.length !== native.length)
    throw new Error('native-runtime fixture child custody incomplete; roots retained');
  for (const event of acquired) {
    const pid = event['pid'],
      terminals = native.filter((terminal) => terminal['pid'] === pid),
      terminal = terminals.at(0);
    if (
      typeof pid !== 'number' ||
      !Number.isInteger(pid) ||
      pid <= 0 ||
      terminals.length !== 1 ||
      terminal?.['failure'] !== null ||
      typeof terminal['code'] !== 'number' ||
      terminal['signal'] !== null
    )
      throw new Error('native-runtime fixture child settlement unconfirmed; roots retained');
  }
  roots.push(prepared.fixture.root, prepared.session);
  const installs = acquired.filter((event) => event['purpose'] === 'install');
  expect(installs).toHaveLength(1);
  expect(native.find((event) => event['pid'] === installs.at(0)?.['pid'])?.['code']).toBe(0);
  const changes = events.filter((event) => event['kind'] === 'loaded-required-input-changed');
  expect(changes).toHaveLength(1);
  expect(changes.at(0)?.['purpose']).toBe('native-runtime');
  expect(changes.at(0)?.['before']).toBe(runtimeHash);
  expect(changes.at(0)?.['after']).toBe(runtimeHash);
  expect(changes.at(0)?.['beforeInode']).not.toBe(changes.at(0)?.['afterInode']);
  expect(hashBytes(readFileSync(runtime))).toBe(runtimeHash);
  expect(hashBytes(readFileSync(runtime + '.previous'))).toBe(runtimeHash);
  expect(acquired.filter((event) => event['purpose'] === 'development')).toHaveLength(0);
  expect(events.filter((event) => event['kind'] === 'start')).toHaveLength(0);
  expect(owner.exitCode).toBe(1);
  expect(owner.stderr.toString()).toContain('Forge required execution failed');
}, 240000);

it('Forge retains the caller selection bytes across a real frozen-install await', () => {
  exerciseForgeSupervisor(false);
  const prepared = createForgeSelection(forgeLeafProgram());
  const worktree = join(prepared.fixture.root, 'retention-worktree'),
    witnesses = join(prepared.fixture.root, 'retention-observations');
  mkdirSync(join(worktree, 'tools/tool-devsync/src'), { recursive: true });
  mkdirSync(witnesses);
  writeFileSync(
    join(worktree, 'tools/tool-devsync/src/fixture.ts'),
    'export const fixture = true;\n',
  );
  writeFileSync(join(worktree, 'nx.json'), '{"plugins":[]}\n');
  writeFileSync(
    join(worktree, 'package.json'),
    readFileSync(join(prepared.consumer, 'package.json')),
  );
  writeFileSync(join(worktree, 'bun.lock'), readFileSync(join(prepared.consumer, 'bun.lock')));
  const entrypoint = realpathSync.native(
    join(prepared.consumer, 'node_modules/puni/dist/puni.mjs'),
  );
  let program = forgeControllerProgram(
    worktree,
    prepared.session,
    witnesses,
    prepared.recordPath,
    hashBytes(prepared.recordBytes),
    entrypoint,
    false,
  );
  const recordRead = 'bytes:readFileSync(' + JSON.stringify(prepared.recordPath) + ')';
  const dispatch = 'const running=superviseForge(root,';
  const callback =
    '}catch(cause){observationFailures.push(cause);}finally{if(callback)Reflect.apply(callback,this,args);}}});';
  if (
    program.split(recordRead).length !== 2 ||
    program.split(dispatch).length !== 2 ||
    program.split(callback).length !== 2
  )
    throw new Error('actual controller selection/callback seams differ');
  program = program
    .replace(recordRead, 'bytes:selectionBytes')
    .replace(
      dispatch,
      'const selectionBytes=readFileSync(' +
        JSON.stringify(prepared.recordPath) +
        ');let selectionChanged=false;' +
        dispatch,
    );
  program = program.replace(
    callback,
    'if(purpose==="install"&&!selectionChanged&&args[1]===0&&args[2]===null&&args[3]===undefined){const before=createHash("sha256").update(selectionBytes).digest("hex");selectionBytes.fill(0);selectionChanged=true;record({kind:"caller-selection-changed",before,after:createHash("sha256").update(selectionBytes).digest("hex")});}' +
      callback,
  );
  const controller = join(prepared.session, 'retention-controller.mjs');
  writeFileSync(controller, program);
  const owner = runSelectionChild(
    [process.execPath, '--no-env-file', '--config=/dev/null', controller],
    worktree,
    [prepared.fixture.root, prepared.session],
    75000,
    { TMPDIR: witnesses },
  );
  for (const root of [prepared.fixture.root, prepared.session]) {
    const at = roots.indexOf(root);
    if (at < 0) throw new Error('selection-retention fixture cleanup ownership disappeared');
    roots.splice(at, 1);
  }
  const events = readForgeEvents(join(witnesses, 'native.jsonl'));
  const acquired = events.filter((event) => event['kind'] === 'acquired'),
    native = events.filter((event) => event['kind'] === 'native');
  if (acquired.length === 0 || acquired.length !== native.length)
    throw new Error('selection-retention native custody incomplete; roots retained');
  for (const event of acquired) {
    const pid = event['pid'],
      terminals = native.filter((terminal) => terminal['pid'] === pid),
      terminal = terminals.at(0);
    if (
      typeof pid !== 'number' ||
      !Number.isInteger(pid) ||
      pid <= 0 ||
      terminals.length !== 1 ||
      terminal?.['failure'] !== null ||
      typeof terminal['code'] !== 'number' ||
      terminal['signal'] !== null
    )
      throw new Error('selection-retention native settlement unconfirmed; roots retained');
  }
  roots.push(prepared.fixture.root, prepared.session);
  const installs = acquired.filter((event) => event['purpose'] === 'install');
  expect(installs).toHaveLength(1);
  expect(native.find((event) => event['pid'] === installs.at(0)?.['pid'])?.['code']).toBe(0);
  const changed = events.filter((event) => event['kind'] === 'caller-selection-changed');
  expect(changed).toHaveLength(1);
  expect(changed.at(0)?.['before']).toBe(hashBytes(prepared.recordBytes));
  expect(changed.at(0)?.['after']).not.toBe(hashBytes(prepared.recordBytes));
  expect(hashBytes(readFileSync(prepared.recordPath))).toBe(hashBytes(prepared.recordBytes));
  expect(acquired.filter((event) => event['purpose'] === 'development')).toHaveLength(1);
  expect(owner.exitCode, owner.stderr.toString()).toBe(0);
  expect(JSON.parse(readFileSync(join(witnesses, 'outcome.json'), 'utf8'))).toEqual({
    status: 143,
    global: 57,
  });
}, 240000);

for (const variant of ['unknown-name', 'unknown-version'] as const)
  it(
    'Forge refuses required package profile ' + variant + ' before any native acquisition',
    async () => {
      exerciseForgeSupervisor(false);
      const prepared = createForgeSelection(forgeLeafProgram());
      const worktree = join(prepared.fixture.root, 'package-profile-worktree');
      const executionSource = join(prepared.fixture.root, 'package-profile-source');
      const witnesses = join(prepared.fixture.root, 'package-profile-observations');
      mkdirSync(worktree);
      mkdirSync(executionSource);
      mkdirSync(witnesses);
      const loaded = await createForgeLoadedSource(executionSource);
      const metadataPath = join(executionSource, 'node_modules/arkregex/package.json');
      const originalMetadata: unknown = JSON.parse(readFileSync(metadataPath, 'utf8'));
      if (!isForgeEvent(originalMetadata))
        throw new Error('owned arkregex metadata is not an object');
      expect(originalMetadata).toMatchObject({
        name: 'arkregex',
        version: '0.0.8',
        dependencies: { '@ark/util': '0.56.2' },
      });
      const revisedMetadata = {
        ...originalMetadata,
        ...(variant === 'unknown-name'
          ? { name: 'owned-unsupported-arkregex' }
          : { version: '0.0.9' }),
      };
      writeFileSync(metadataPath, JSON.stringify(revisedMetadata, null, 2) + '\n');
      expect(JSON.parse(readFileSync(metadataPath, 'utf8'))).toEqual(revisedMetadata);
      writeFileSync(join(worktree, 'nx.json'), '{"plugins":[]}\n');
      writeFileSync(
        join(worktree, 'package.json'),
        readFileSync(join(prepared.consumer, 'package.json')),
      );
      writeFileSync(join(worktree, 'bun.lock'), readFileSync(join(prepared.consumer, 'bun.lock')));
      const entrypoint = realpathSync.native(
        join(prepared.consumer, 'node_modules/puni/dist/puni.mjs'),
      );
      let program = forgeControllerProgram(
        worktree,
        prepared.session,
        witnesses,
        prepared.recordPath,
        hashBytes(prepared.recordBytes),
        entrypoint,
        false,
        { supervisor: loaded.supervisor, sdk: loaded.sdk },
      );
      const invocation = 'const running=superviseForge(root,';
      if (program.split(invocation).length !== 2)
        throw new Error('actual controller invocation seam differs');
      // A real empty append-only native counter is acquired before invocation, after the actual
      // Bun.spawn observer is installed. Missing files never become an invented empty event list.
      program = program.replace(
        invocation,
        () =>
          'writeFileSync(trace,"",{flag:"wx"});writeFileSync(witnesses+"/controller-ready","READY\\n",{flag:"wx"});' +
          invocation,
      );
      const controller = join(prepared.session, 'package-profile-controller.mjs');
      writeFileSync(controller, program);
      const owner = runSelectionChild(
        [process.execPath, '--no-env-file', '--config=/dev/null', controller],
        worktree,
        [prepared.fixture.root, prepared.session],
        75000,
        { TMPDIR: witnesses },
      );
      for (const root of [prepared.fixture.root, prepared.session]) {
        const at = roots.indexOf(root);
        if (at < 0) throw new Error('package-profile fixture cleanup ownership disappeared');
        roots.splice(at, 1);
      }
      expect(readFileSync(join(witnesses, 'controller-ready'), 'utf8')).toBe('READY\n');
      const trace = join(witnesses, 'native.jsonl');
      const recorded = readFileSync(trace, 'utf8');
      const events = recorded.length === 0 ? [] : readForgeEvents(trace);
      const acquired = events.filter((event) => event['kind'] === 'acquired');
      const native = events.filter((event) => event['kind'] === 'native');
      if (acquired.length !== native.length)
        throw new Error('package-profile native custody incomplete; owned roots retained');
      for (const event of acquired) {
        const pid = event['pid'];
        const terminals = native.filter((terminal) => terminal['pid'] === pid),
          terminal = terminals.at(0);
        if (
          typeof pid !== 'number' ||
          !Number.isSafeInteger(pid) ||
          pid <= 0 ||
          terminals.length !== 1 ||
          terminal?.['failure'] !== null ||
          terminal['signal'] !== null ||
          typeof terminal['code'] !== 'number' ||
          !Number.isInteger(terminal['code']) ||
          terminal['code'] < 0 ||
          terminal['code'] > 255
        )
          throw new Error('package-profile native settlement unconfirmed; owned roots retained');
      }
      for (const event of events.filter((event) => event['kind'] === 'start'))
        if (
          !acquired.some(
            (child) => child['purpose'] === 'development' && child['pid'] === event['pid'],
          )
        )
          throw new Error('package-profile native leaf has no acquired owner; roots retained');
      roots.push(prepared.fixture.root, prepared.session);
      // First physical refusal oracle precedes later verdict/diagnostic checks.
      expect(acquired).toHaveLength(0);
      expect(recorded).toBe('');
      expect(owner.exitCode, owner.stderr.toString()).toBe(1);
      expect(owner.stderr.toString()).toContain(
        'Forge required package data edge is not in the current execution profile:',
      );
      expect(owner.stderr.toString()).toContain(metadataPath.slice(0, -'/package.json'.length));
      const outcome: unknown = JSON.parse(readFileSync(join(witnesses, 'outcome.json'), 'utf8'));
      expect(outcome).toEqual({
        failure:
          'Error: Forge required package data edge is not in the current execution profile: ' +
          metadataPath.slice(0, -'/package.json'.length),
      });
    },
    240000,
  );

it('Forge refuses an already loaded metadata helper changed before its first real compiler call', async () => {
  exerciseForgeSupervisor(false);
  const prepared = createForgeSelection(forgeLeafProgram());
  const worktree = join(prepared.fixture.root, 'loaded-metadata-worktree');
  const executionSource = join(prepared.fixture.root, 'loaded-metadata-source');
  const witnesses = join(prepared.fixture.root, 'loaded-metadata-observations');
  mkdirSync(worktree);
  mkdirSync(executionSource);
  mkdirSync(witnesses);
  const loaded = await createForgeLoadedSource(executionSource);
  const helper = join(executionSource, 'tools/tool-devsync/src/k3s/forge-compiler-metadata.ts');
  const initialHelperHash = hashBytes(readFileSync(helper));
  writeFileSync(join(worktree, 'nx.json'), '{"plugins":[]}\n');
  writeFileSync(
    join(worktree, 'package.json'),
    readFileSync(join(prepared.consumer, 'package.json')),
  );
  writeFileSync(join(worktree, 'bun.lock'), readFileSync(join(prepared.consumer, 'bun.lock')));
  const entrypoint = realpathSync.native(
    join(prepared.consumer, 'node_modules/puni/dist/puni.mjs'),
  );
  let program = forgeControllerProgram(
    worktree,
    prepared.session,
    witnesses,
    prepared.recordPath,
    hashBytes(prepared.recordBytes),
    entrypoint,
    false,
    { supervisor: loaded.supervisor, sdk: helper, purpose: 'bootstrap' },
  );
  const directImport = 'import{superviseForge}from ' + JSON.stringify(loaded.supervisor) + ';';
  const beforeInvocation = 'process.exitCode=57;';
  if (program.split(directImport).length !== 2 || program.split(beforeInvocation).length !== 2)
    throw new Error('actual loaded-helper controller seams differ');
  program = program.replace(directImport, '');
  const compilerOwner = [
    'const actualBuild=Bun.build.bind(Bun);let sawFirstCompiler=false;',
    'Bun.build=async(options)=>{const entry=options.entrypoints[0],core=typeof entry==="string"&&entry.endsWith("/forge-supervisor-core.ts");',
    'if(core&&!sawFirstCompiler){sawFirstCompiler=true;const original=readFileSync(changedSdk),before=createHash("sha256").update(original).digest("hex");writeFileSync(changedSdk,Buffer.concat([original,Buffer.from(String.fromCharCode(10)+"export const ownedEarlyMetadataMutation=true;"+String.fromCharCode(10))]));mutatedSdk=true;record({kind:"loaded-helper-before-compiler-changed",path:changedSdk,before,after:createHash("sha256").update(readFileSync(changedSdk)).digest("hex")});}',
    'const built=await actualBuild(options);if(core)record({kind:"compiled-core",success:built.success,outputs:built.outputs.length});return built;};',
    'const {superviseForge}=await import(' + JSON.stringify(loaded.supervisor) + ');',
    'const helperNamespace=await import(' +
      JSON.stringify(createFileUrl(helper).href) +
      ');if(typeof helperNamespace.orderCompilerMetadata!=="function")throw new Error("actual loaded helper export missing");',
    'record({kind:"metadata-helper-loaded",path:changedSdk,sha256:createHash("sha256").update(readFileSync(changedSdk)).digest("hex")});',
  ].join('');
  program = program.replace(beforeInvocation, () => compilerOwner + beforeInvocation);
  const controller = join(prepared.session, 'loaded-metadata-controller.mjs');
  writeFileSync(controller, program);
  const owner = runSelectionChild(
    [process.execPath, '--no-env-file', '--config=/dev/null', controller],
    worktree,
    [prepared.fixture.root, prepared.session],
    75000,
    { TMPDIR: witnesses },
  );
  for (const root of [prepared.fixture.root, prepared.session]) {
    const at = roots.indexOf(root);
    if (at < 0) throw new Error('loaded-helper fixture cleanup ownership disappeared');
    roots.splice(at, 1);
  }
  const events = readForgeEvents(join(witnesses, 'native.jsonl'));
  const acquired = events.filter((event) => event['kind'] === 'acquired');
  const native = events.filter((event) => event['kind'] === 'native');
  if (acquired.length !== native.length)
    throw new Error('loaded-helper native custody incomplete; roots retained');
  for (const event of acquired) {
    const pid = event['pid'],
      terminals = native.filter((terminal) => terminal['pid'] === pid),
      terminal = terminals.at(0);
    if (
      typeof pid !== 'number' ||
      !Number.isSafeInteger(pid) ||
      pid <= 0 ||
      terminals.length !== 1 ||
      terminal?.['failure'] !== null ||
      terminal['signal'] !== null ||
      typeof terminal['code'] !== 'number' ||
      !Number.isInteger(terminal['code']) ||
      terminal['code'] < 0 ||
      terminal['code'] > 255
    )
      throw new Error('loaded-helper native settlement unconfirmed; roots retained');
  }
  for (const event of events.filter((event) => event['kind'] === 'start'))
    if (
      !acquired.some((child) => child['purpose'] === 'development' && child['pid'] === event['pid'])
    )
      throw new Error('loaded-helper native leaf has no acquired owner; roots retained');
  roots.push(prepared.fixture.root, prepared.session);
  const helperLoaded = events.filter((event) => event['kind'] === 'metadata-helper-loaded');
  const changed = events.filter(
    (event) => event['kind'] === 'loaded-helper-before-compiler-changed',
  );
  const compiled = events.filter((event) => event['kind'] === 'compiled-core');
  expect(helperLoaded).toHaveLength(1);
  expect(helperLoaded.at(0)?.['sha256']).toBe(initialHelperHash);
  expect(changed).toHaveLength(1);
  expect(changed.at(0)?.['before']).toBe(initialHelperHash);
  expect(changed.at(0)?.['after']).not.toBe(initialHelperHash);
  const loadedEvent = helperLoaded.at(0),
    changedEvent = changed.at(0),
    compiledEvent = compiled.at(0);
  if (loadedEvent === undefined || changedEvent === undefined || compiledEvent === undefined)
    throw new Error('loaded-helper compiler ordering witnesses missing');
  expect(events.indexOf(loadedEvent)).toBeLessThan(events.indexOf(changedEvent));
  expect(events.indexOf(changedEvent)).toBeLessThan(events.indexOf(compiledEvent));
  expect(compiledEvent).toMatchObject({ success: true, outputs: 1 });
  // First physical refusal oracle follows actual loaded/mutation/compiler witnesses.
  expect(acquired).toHaveLength(0);
  expect(owner.exitCode, owner.stderr.toString()).toBe(1);
  expect(owner.stderr.toString()).toContain(
    'Forge source/compiler/config/package observation changed during production:',
  );
  expect(owner.stderr.toString()).toContain('"component":"bootstrap.sources"');
}, 240000);
