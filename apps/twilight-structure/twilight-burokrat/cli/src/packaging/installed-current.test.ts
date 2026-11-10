import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { createShebang } from '@shared/bun-startup';
import { afterEach, beforeAll, describe, expect, it } from 'bun:test';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import { createGitEnvironment } from '../git-environment';
import * as preflight from '../installed-lint';
import type { LintInterrupt } from '../lint-interrupts';
import { readLintRuntime } from '../lint-runtime';
import { buildLintLauncher } from '../policy/build-lint-launcher';
import { hashTrustedModules } from '../policy/trusted-modules';
import * as installed from './installed';
import { packageManifestBytes, packageVersion } from './manifest';

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
    tag: 'puni-v' + packageVersion,
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
  writeFileSync(manifest, packageManifestBytes(descriptor.sourceRevision, identity));
  return { root, directory, toolkit, closure, descriptor, identity, manifest };
}

describe('current installed toolkit identity', () => {
  it('reads a current package-bound toolkit carrying the actual Bun launcher', () => {
    const fixture = createFixture(2);
    const current = installed.readInstalledBunToolkit(fixture.directory, fixture.toolkit);
    expect(current.schemaVersion).toBe(2);
    expect(current.digest).toBe(fixture.identity);
    expect(current.directory).toBe(fixture.toolkit);
    expect(current.roleBytes['launcher.mjs']).toEqual(launcher);
  });

  it('refuses historical format even when its Bun pin matches', () => {
    const fixture = createFixture(1);
    expect(() => installed.readInstalledBunToolkit(fixture.directory, fixture.toolkit)).toThrow(
      'Bun execution requires toolkit schema 2',
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
      packageManifestBytes(fixture.descriptor.sourceRevision, 'b'.repeat(64)),
    );
    expect(() => installed.readInstalledBunToolkit(fixture.directory, fixture.toolkit)).toThrow(
      'installed toolkit differs from package manifest',
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
    const current = installed.readInstalledBunToolkit(selected, selected + '/toolkit');
    expect(current.directory).toBe(native.toolkit);
    expect(current.digest).toBe(native.identity);
    expect(current.digest).not.toBe(lexical.identity);
  });
});

describe('installed package boundary failures', () => {
  for (const [label, reader] of [
    ['current', installed.readInstalledBunToolkit],
    ['legacy', installed.readInstalledToolkit],
  ] as const) {
    const schemaVersion = label === 'current' ? 2 : 1;
    it(label + ' refuses an absent package manifest before reading a toolkit', () => {
      const fixture = createFixture(schemaVersion);
      rmSync(fixture.manifest);
      expect(() => reader(fixture.directory, fixture.toolkit + '-absent')).toThrow(
        'installed package manifest is unreadable: ' + fixture.manifest,
      );
    });
    it(label + ' refuses an unreadable package manifest before reading a toolkit', () => {
      const fixture = createFixture(schemaVersion);
      rmSync(fixture.manifest);
      mkdirSync(fixture.manifest);
      expect(() => reader(fixture.directory, fixture.toolkit + '-absent')).toThrow(
        'installed package manifest is unreadable: ' + fixture.manifest,
      );
    });
    it(label + ' refuses malformed package bytes before reading a toolkit', () => {
      const fixture = createFixture(schemaVersion);
      writeFileSync(fixture.manifest, '{');
      expect(() => reader(fixture.directory, fixture.toolkit + '-absent')).toThrow(
        'installed package manifest is malformed: ' + fixture.manifest,
      );
    });
    it(label + ' refuses invalid package fields before reading a toolkit', () => {
      const fixture = createFixture(schemaVersion);
      writeFileSync(fixture.manifest, '{}');
      expect(() => reader(fixture.directory, fixture.toolkit + '-absent')).toThrow(
        'installed package manifest is invalid: ' + fixture.manifest,
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
      packageManifestBytes(fixture.descriptor.sourceRevision, hashBytes(bytes)),
    );
    expect(() => installed.readInstalledBunToolkit(fixture.directory, fixture.toolkit)).toThrow(
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
      expect(() => installed.readInstalledBunToolkit(fixture.directory, fixture.toolkit)).toThrow(
        'toolkit role differs from toolkit.json: ' + role,
      );
    });
    it('refuses missing current role ' + role, () => {
      const fixture = createFixture(2);
      rmSync(join(fixture.toolkit, role));
      expect(() => installed.readInstalledBunToolkit(fixture.directory, fixture.toolkit)).toThrow(
        'toolkit role is unreadable: ' + role,
      );
    });
  }

  it('refuses changed installed closure bytes', () => {
    const fixture = createFixture(2);
    writeFileSync(join(fixture.closure, 'typescript/package.json'), '{"changed":true}');
    expect(() => installed.readInstalledBunToolkit(fixture.directory, fixture.toolkit)).toThrow(
      'toolkit runtime closure differs from toolkit.json',
    );
  });

  it('refuses an absent closure', () => {
    const fixture = createFixture(2);
    rmSync(fixture.closure, { recursive: true });
    expect(() => installed.readInstalledBunToolkit(fixture.directory, fixture.toolkit)).toThrow();
  });

  it('refuses a closure file symlink even when its target bytes match', () => {
    const fixture = createFixture(2);
    const target = join(fixture.root, 'typescript.json');
    writeFileSync(target, '{}\n');
    const selected = join(fixture.closure, 'typescript/package.json');
    rmSync(selected);
    symlinkSync(target, selected);
    expect(() => installed.readInstalledBunToolkit(fixture.directory, fixture.toolkit)).toThrow(
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
          const reader = version === 1 ? 'readInstalledToolkit' : 'readInstalledBunToolkit';
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
              ? 'installed package manifest is unreadable'
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
    expect(() => installed.readInstalledBunToolkit(first.directory, second.toolkit)).toThrow(
      'installed toolkit differs from package manifest',
    );
    expect(() => installed.readInstalledBunToolkit(second.directory, first.toolkit)).toThrow(
      'installed toolkit differs from package manifest',
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
      packageManifestBytes(fixture.descriptor.sourceRevision, hashBytes(bytes)),
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
      'installed package manifest is malformed',
    );
  });
  it('binds the preflight toolkit to the expected package identity', async () => {
    const fixture = createFixture(2);
    const candidate = createRepository(join(fixture.root, 'candidate'));
    writeFileSync(
      fixture.manifest,
      packageManifestBytes(fixture.descriptor.sourceRevision, 'b'.repeat(64)),
    );
    await assertRefusal(
      invokePreflight(fixture, candidate),
      'installed toolkit differs from package manifest',
    );
  });
  it('refuses historical execution through the preflight route', async () => {
    const fixture = createFixture(1);
    await assertRefusal(
      invokePreflight(fixture, '/absent-candidate'),
      'Bun execution requires toolkit schema 2',
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
    ['current', installed.readInstalledBunToolkit],
    ['legacy', installed.readInstalledToolkit],
  ] as const) {
    it(label + ' refuses a permission-denied regular manifest before toolkit access', () => {
      const fixture = createFixture(label === 'current' ? 2 : 1);
      chmodSync(fixture.manifest, 0);
      try {
        expect(() => reader(fixture.directory, fixture.toolkit + '-absent')).toThrow(
          'installed package manifest is unreadable',
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
      expect(() => installed.readInstalledBunToolkit(fixture.directory, fixture.toolkit)).toThrow(
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
      expect(() => installed.readInstalledBunToolkit(fixture.directory, fixture.toolkit)).toThrow(
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
