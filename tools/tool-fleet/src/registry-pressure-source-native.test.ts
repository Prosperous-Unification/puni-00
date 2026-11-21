import { rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

import { expect, spyOn, test } from 'bun:test';

import {
  createNativeFixture,
  removeNativeFixture,
  validateRegistrySourceNative,
} from './registry-pressure-source-native';

const inputs = {
  sshd: '/absent/puni-sshd',
  listen: '10.1.0.4',
  source: '10.1.0.2',
};

test.each([
  { sshd: inputs.sshd, listen: inputs.listen },
  { ...inputs, extra: true },
  { ...inputs, sshd: 'relative/sshd' },
  { ...inputs, sshd: '/tmp/../sshd' },
  { ...inputs, sshd: '/tmp/sshd\n' },
  null,
])('refuses missing, unknown or noncanonical native arguments', async (input) => {
  await rejects(validateRegistrySourceNative(input), {
    message: 'invalid registry status native arguments',
  });
});

test.each([
  ['listen', '127.0.0.1'],
  ['listen', '172.15.0.1'],
  ['listen', '10.0.0.256'],
  ['source', '10.0.00.1'],
  ['source', '198.51.100.10'],
  ['source', '192.168.1'],
])('refuses invalid or nonprivate %s address %s', async (key, address) => {
  await rejects(validateRegistrySourceNative({ ...inputs, [key]: address }), {
    message: 'invalid registry status native arguments',
  });
});

test('refuses an absent native tool', async () => {
  await rejects(validateRegistrySourceNative(inputs), { message: 'native sshd is missing' });
});

async function withTool(
  use: (
    run: () => Promise<void>,
    executable: string,
    profile: string,
    home: string,
  ) => Promise<void>,
): Promise<void> {
  const home = await fs.mkdtemp('/tmp/puni-registry-native-admission-');
  const executable = home + '/sshd';
  const profile = home + '/profile.json';
  const command =
    '#!/bin/sh\nprintf ran > "$0.executed"\nprintf "%s\\n" "fixture-sshd wrong-version" >&2\n';
  try {
    await fs.writeFile(executable, command, { mode: 0o700 });
    await fs.writeFile(
      profile,
      JSON.stringify({
        packageVersion: 'test-package',
        sourceUrl: 'http://example.invalid/fixture.deb',
        archiveSha256: '0'.repeat(64),
        executableSha256: createHash('sha256').update(command).digest('hex'),
        version: 'fixture-sshd wrong-version',
      }),
    );
    const open = fs.open;
    const profilePath = fileURLToPath(
      new URL('./registry-pressure-source-tools.json', import.meta.url),
    );
    const fixtureOpen = spyOn(fs, 'open').mockImplementation((path, flags, mode) =>
      open(path === profilePath ? profile : path, flags, mode),
    );
    try {
      await use(
        () => validateRegistrySourceNative({ ...inputs, sshd: executable }),
        executable,
        profile,
        home,
      );
    } finally {
      fixtureOpen.mockRestore();
    }
  } finally {
    await fs.rm(home, { recursive: true });
  }
}

test('refuses wrong executable bytes before running them', async () => {
  await withTool(async (run, executable) => {
    await fs.appendFile(executable, '\n');
    await rejects(run(), { message: 'native sshd hash differs' });
    await rejects(fs.lstat(executable + '.executed'), { code: 'ENOENT' });
  });
});

test('refuses a pinned executable with a different exact version', async () => {
  await withTool(async (run, _executable, profile) => {
    const pin = await Bun.file(profile).text();
    await fs.writeFile(profile, pin.replace('wrong-version', 'expected-version'));
    await rejects(run(), { message: 'native sshd version differs' });
  });
});

test('refuses an unreadable executable', async () => {
  await withTool(async (run, executable) => {
    await fs.chmod(executable, 0o000);
    await rejects(run(), { message: 'native sshd is unreadable' });
  });
});

test('refuses a symlink executable even with the pinned bytes', async () => {
  await withTool(async (_run, executable) => {
    const link = executable + '-link';
    await fs.symlink(executable, link);
    await rejects(validateRegistrySourceNative({ ...inputs, sshd: link }), {
      message: 'native sshd is not a readable regular file',
    });
  });
});

test.each([
  ['missing', (profile: string) => fs.unlink(profile), 'native tool profile is missing'],
  [
    'unreadable',
    (profile: string) => fs.chmod(profile, 0o000),
    'native tool profile is unreadable',
  ],
  ['malformed', (profile: string) => fs.writeFile(profile, '{'), 'invalid native tool profile'],
  [
    'unknown field',
    async (profile: string) => {
      const pin = await Bun.file(profile).text();
      await fs.writeFile(profile, pin.replace('{', '{"extra":true,'));
    },
    'invalid native tool profile',
  ],
  [
    'oversized',
    (profile: string) => fs.writeFile(profile, 'x'.repeat(4097)),
    'native tool profile exceeds its bound',
  ],
] as const)('refuses a %s trusted tool profile', async (_name, fault, diagnostic) => {
  await withTool(async (run, _executable, profile) => {
    await fault(profile);
    await rejects(run(), { message: diagnostic });
  });
});

test('refuses a real home underneath writable temporary ancestry', async () => {
  await withTool(async (run, _executable, _profile, home) => {
    const account = spyOn(os, 'userInfo').mockReturnValue({ ...os.userInfo(), homedir: home });
    try {
      await rejects(run(), { message: 'unsafe native fixture home ancestry' });
    } finally {
      account.mockRestore();
    }
  });
});

test('refuses an oversized executable before running it', async () => {
  await withTool(async (run, executable) => {
    await fs.truncate(executable, 2 * 1024 * 1024 + 1);
    await rejects(run(), { message: 'native sshd exceeds its bound' });
    await rejects(fs.lstat(executable + '.executed'), { code: 'ENOENT' });
  });
});

test('refuses a directory presented as the native executable', async () => {
  await withTool(async (_run, _executable, _profile, home) => {
    await rejects(validateRegistrySourceNative({ ...inputs, sshd: home }), {
      message: 'native sshd is not a readable regular file',
    });
  });
});

test('refuses a root fixture account', async () => {
  await withTool(async (run) => {
    const account = spyOn(os, 'userInfo').mockReturnValue({ ...os.userInfo(), uid: 0 });
    try {
      await rejects(run(), {
        message: 'native fixture requires a non-root account with a canonical home',
      });
    } finally {
      account.mockRestore();
    }
  });
});

function modelHomeStats(revise: (path: Parameters<typeof fs.lstat>[0], stat: Stats) => void) {
  const lstat = fs.lstat;
  // The native admission path uses the no-options numeric lstat overload.
  return spyOn(fs, 'lstat').mockImplementation((async (path: Parameters<typeof fs.lstat>[0]) => {
    const stat = await lstat(path);
    if (path === '/' || path === '/tmp') stat.uid = 0;
    stat.mode &= ~0o022;
    revise(path, stat);
    return stat;
  }) as typeof fs.lstat);
}

test('refuses a symlink fixture home', async () => {
  await withTool(async (run, _executable, _profile, home) => {
    const target = home + '/target';
    const link = home + '/link';
    await fs.mkdir(target, { mode: 0o700 });
    await fs.symlink(target, link);
    const account = spyOn(os, 'userInfo').mockReturnValue({ ...os.userInfo(), homedir: link });
    const ancestry = modelHomeStats((path, stat) => {
      if (path === link) stat.uid = os.userInfo().uid;
    });
    try {
      await rejects(run(), { message: 'unsafe native fixture home ancestry' });
    } finally {
      ancestry.mockRestore();
      account.mockRestore();
    }
  });
});

test('refuses a safe-mode home owned by a different UID', async () => {
  await withTool(async (run, _executable, _profile, home) => {
    const account = spyOn(os, 'userInfo').mockReturnValue({ ...os.userInfo(), homedir: home });
    const ancestry = modelHomeStats((path, stat) => {
      if (path === home) stat.uid = os.userInfo().uid + 1;
    });
    try {
      await rejects(run(), { message: 'unsafe native fixture home ancestry' });
    } finally {
      ancestry.mockRestore();
      account.mockRestore();
    }
  });
});

test.each([
  ['mode', 0o755, 0],
  ['owner', 0o700, 1],
] as const)('refuses an unsafe generated fixture directory %s', async (_field, mode, offset) => {
  const home = await fs.mkdtemp('/tmp/puni-generated-native-directory-');
  const uid = os.userInfo().uid;
  const mkdtemp = fs.mkdtemp;
  const generated = spyOn(fs, 'mkdtemp').mockImplementation((async (prefix: string) => {
    const path = await mkdtemp(prefix);
    await fs.chmod(path, mode);
    return path;
  }) as typeof fs.mkdtemp);
  try {
    await rejects(
      createNativeFixture(home, uid + offset),
      offset === 0
        ? { message: 'native fixture directory is not private and owned' }
        : /native fixture directory is not private and owned.*native fixture retained at/,
    );
    expect(await fs.readdir(home)).toHaveLength(offset);
  } finally {
    generated.mockRestore();
    await fs.rm(home, { recursive: true });
  }
});

test('native cleanup refuses a replacement and preserves its contents', async () => {
  const home = await fs.mkdtemp('/tmp/puni-native-replacement-');
  try {
    const fixture = await createNativeFixture(home, os.userInfo().uid);
    await fs.rename(fixture.directory, fixture.directory + '-original');
    await fs.mkdir(fixture.directory, { mode: 0o700 });
    const marker = fixture.directory + '/foreign';
    await fs.writeFile(marker, 'private replacement');
    await rejects(removeNativeFixture(fixture), {
      message: 'native fixture directory identity changed',
    });
    expect(await fs.readFile(marker, 'utf8')).toBe('private replacement');
  } finally {
    await fs.rm(home, { recursive: true });
  }
});

test('refuses the real mode 000 fixture and leaves its parent empty', async () => {
  const home = await fs.mkdtemp('/tmp/puni-native-restricted-umask-');
  try {
    const module = new URL('./registry-pressure-source-native.ts', import.meta.url).href;
    const child = Bun.spawnSync(
      [
        process.execPath,
        '-e',
        `
      import { createNativeFixture } from ${JSON.stringify(module)};
      process.umask(0o777);
      try {
        await createNativeFixture(process.argv[1], process.getuid());
        process.exitCode = 2;
      } catch (cause) {
        console.log(cause.message);
        process.exitCode = 1;
      }
    `,
        home,
      ],
      { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 3000 },
    );
    expect(child.exitCode).toBe(1);
    expect(child.stdout.toString().trim()).toBe(
      'native fixture directory is not private and owned',
    );
    expect(child.stderr.toString()).toBe('');
    expect(await fs.readdir(home)).toEqual([]);
  } finally {
    for (const entry of await fs.readdir(home)) await fs.rmdir(home + '/' + entry);
    await fs.rmdir(home);
  }
});

test.each(['nonempty', 'replaced', 'unreadable'] as const)(
  'native admission retains the %s fixture path and preserves the primary refusal',
  async (fault) => {
    const home = await fs.mkdtemp('/tmp/puni-native-admission-retention-');
    const uid = os.userInfo().uid;
    const mkdtemp = fs.mkdtemp;
    let generatedPath: string | undefined;
    const generated = spyOn(fs, 'mkdtemp').mockImplementation((async (prefix: string) => {
      const path = await mkdtemp(prefix);
      generatedPath = path;
      await fs.chmod(path, 0o755);
      if (fault === 'nonempty') await fs.writeFile(path + '/marker', 'owned content');
      return path;
    }) as typeof fs.mkdtemp);
    const lstat = fs.lstat;
    let inspected = false;
    const stats = spyOn(fs, 'lstat').mockImplementation((async (
      path: Parameters<typeof fs.lstat>[0],
    ) => {
      const stat = await lstat(path);
      if (path === generatedPath && !inspected) {
        inspected = true;
        if (fault === 'unreadable') throw new Error('injected initial metadata read failure');
        if (fault === 'replaced') {
          await fs.rename(generatedPath, generatedPath + '-first');
          await fs.writeFile(generatedPath + '-first/marker', 'original content');
          await fs.mkdir(generatedPath, { mode: 0o700 });
        }
      }
      return stat;
    }) as typeof fs.lstat);
    try {
      const refusal =
        fault === 'unreadable'
          ? /injected initial metadata read failure.*native fixture retained at/
          : /native fixture directory is not private and owned.*native fixture retained at/;
      const rejection = await createNativeFixture(home, uid).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(await fs.readdir(home)).toHaveLength(fault === 'replaced' ? 2 : 1);
      if (generatedPath === undefined) throw new Error('fixture was not generated');
      if (fault === 'nonempty')
        expect(await fs.readFile(generatedPath + '/marker', 'utf8')).toBe('owned content');
      if (fault === 'replaced') {
        expect(await fs.readdir(generatedPath)).toEqual([]);
        expect(await fs.readFile(generatedPath + '-first/marker', 'utf8')).toBe('original content');
      }
      expect(rejection).toBeInstanceOf(Error);
      if (!(rejection instanceof Error)) throw new Error('fixture admission did not reject');
      expect(rejection.message).toMatch(refusal);
    } finally {
      stats.mockRestore();
      generated.mockRestore();
      await fs.rm(home, { recursive: true });
    }
  },
);
