import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';

import { expect, spyOn, test } from 'bun:test';

import { openRegistryPressureSource, RegistrySourceCleanupError } from './registry-pressure-source';

function publicKey(): string {
  const prefix = Buffer.from('0000000b7373682d6564323535313900000020', 'hex');
  return 'ssh-ed25519 ' + Buffer.concat([prefix, randomBytes(32)]).toString('base64');
}

async function validSourceFixture() {
  const parent = await fs.mkdtemp('/tmp/puni-registry-status-');
  const directory = parent + '/source';
  const absentDirectory = parent + '/missing';
  const path = parent + '/identity';
  const key = randomBytes(32);
  await fs.mkdir(directory, { mode: 0o700 });
  await fs.writeFile(path, key, { mode: 0o400 });
  const hostKey = publicKey();
  const enrollment = {
    schemaVersion: 1,
    protocol: 'registry-pressure-status/1',
    target: {
      machineId: '0'.repeat(32),
      registryId: 'fixture-registry',
      storageId: 'fixture-storage',
      registryPath: '/srv/registry',
    },
    peer: { address: '192.168.10.20', port: 2222, user: 'registry_source', hostKey },
    identity: {
      path,
      sha256: createHash('sha256').update(key).digest('hex'),
      publicKey: publicKey(),
    },
  };
  return {
    parent,
    directory,
    absentDirectory,
    enrollment,
    key,
    path,
    pin: directory + '/known_hosts',
    expectedPin: 'puni-registry-pressure-source ' + hostKey + '\n',
  };
}

type Fixture = Awaited<ReturnType<typeof validSourceFixture>>;

async function withFixture(use: (fixture: Fixture) => Promise<void>): Promise<void> {
  const fixture = await validSourceFixture();
  const spawn = spyOn(Bun, 'spawn').mockImplementation(() => {
    throw new Error('unexpected SSH spawn');
  });
  try {
    await use(fixture);
    expect(spawn).toHaveBeenCalledTimes(0);
  } finally {
    spawn.mockRestore();
    await fs.rm(fixture.parent, { recursive: true });
  }
}

function deny(code: string): never {
  throw Object.assign(new Error('fixture diagnostic'), { code });
}

async function expectFailure(work: Promise<unknown>, message: string | RegExp): Promise<void> {
  const failure = await work.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw new Error('expected a rejection');
  expect(failure.message).toMatch(message);
}

const timeout = { state: 'unavailable', reason: 'source-timeout', code: 'deadline' } as const;

test('refuses missing local state rather than inventing enrollment or a directory', () =>
  withFixture(async ({ enrollment, absentDirectory }) => {
    await expectFailure(openRegistryPressureSource(enrollment, absentDirectory), /missing/);
    expect(await Bun.file(absentDirectory + '/known_hosts').exists()).toBe(false);
  }));

test('rejects malformed enrollment before creating its pin', () =>
  withFixture(async ({ enrollment, directory, pin }) => {
    await expectFailure(
      openRegistryPressureSource({ ...enrollment, extra: true }, directory),
      'invalid registry status enrollment',
    );
    expect(await Bun.file(pin).exists()).toBe(false);
  }));

test('refuses an unreadable directory without leaking its filesystem diagnostic', () =>
  withFixture(async ({ enrollment, directory }) => {
    const ls = fs.readdir;
    const spy = spyOn(fs, 'readdir').mockImplementation((async (path: string) => {
      if (path === directory) deny('EACCES');
      return ls(path);
    }) as typeof fs.readdir);
    try {
      await expectFailure(
        openRegistryPressureSource(enrollment, directory),
        /^registry status directory is unreadable$/,
      );
    } finally {
      spy.mockRestore();
    }
  }));

test('refuses a directory symlink', () =>
  withFixture(async ({ enrollment, directory, absentDirectory }) => {
    await fs.symlink(directory, absentDirectory);
    await expectFailure(openRegistryPressureSource(enrollment, absentDirectory), /directory/);
    expect(await fs.readdir(directory)).toEqual([]);
  }));

test('refuses a non-directory at the actor path', () =>
  withFixture(async ({ enrollment, path }) => {
    await fs.chmod(path, 0o700);
    await expectFailure(
      openRegistryPressureSource(enrollment, path),
      /requires an owned mode 0700 directory/,
    );
  }));

test('refuses an actor directory that grants group access', () =>
  withFixture(async ({ enrollment, directory, pin }) => {
    await fs.chmod(directory, 0o750);
    await expectFailure(openRegistryPressureSource(enrollment, directory), /directory/);
    expect(await Bun.file(pin).exists()).toBe(false);
  }));

test('refuses an actor directory with modeled mismatched ownership', () =>
  withFixture(async ({ enrollment, directory }) => {
    const lstat = fs.lstat;
    const spy = spyOn(fs, 'lstat').mockImplementation((async (
      path: Parameters<typeof fs.lstat>[0],
    ) => {
      const stat = await lstat(path);
      if (path === directory) stat.uid = (process.getuid?.() ?? 1000) + 1;
      return stat;
    }) as typeof fs.lstat);
    try {
      await expectFailure(openRegistryPressureSource(enrollment, directory), /directory/);
      expect(await fs.readdir(directory)).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  }));

test('refuses an actor directory containing an unknown entry', () =>
  withFixture(async ({ enrollment, directory }) => {
    await fs.writeFile(directory + '/unexpected', 'preserve');
    await expectFailure(openRegistryPressureSource(enrollment, directory), /empty/);
    expect(await fs.readdir(directory)).toEqual(['unexpected']);
  }));

test('exclusive pin creation preserves a file inserted after the emptiness check', () =>
  withFixture(async ({ enrollment, directory, pin }) => {
    const ls = fs.readdir;
    const spy = spyOn(fs, 'readdir').mockImplementation((async (path: string) => {
      const entries = await ls(path);
      if (path === directory) await fs.writeFile(pin, 'concurrent', { mode: 0o600 });
      return entries;
    }) as typeof fs.readdir);
    try {
      await expectFailure(openRegistryPressureSource(enrollment, directory), /pin/);
      expect(await Bun.file(pin).text()).toBe('concurrent');
    } finally {
      spy.mockRestore();
    }
  }));

test('creates one exact private pin and repeat close preserves the directory and other files', () =>
  withFixture(async ({ enrollment, directory, parent, path, pin, expectedPin }) => {
    const source = await openRegistryPressureSource(enrollment, directory);
    expect(await fs.readdir(directory)).toEqual(['known_hosts']);
    expect((await fs.lstat(pin)).mode & 0o7777).toBe(0o400);
    expect(await Bun.file(pin).text()).toBe(expectedPin);
    expect((await fs.lstat(pin)).uid).toBe(process.getuid?.() ?? -1);
    const unexpected = directory + '/unexpected';
    await fs.writeFile(unexpected, 'preserve');
    await source.close();
    await source.close();
    expect(await fs.readdir(directory)).toEqual(['unexpected']);
    expect(await Bun.file(unexpected).text()).toBe('preserve');
    expect(await fs.lstat(parent)).toHaveProperty('uid');
    expect(await Bun.file(path).exists()).toBe(true);
    await expectFailure(
      source.read(new AbortController().signal, performance.now() + 2000),
      /closed/,
    );
  }));

test('close preserves a different pin inode with identical bytes', () =>
  withFixture(async ({ enrollment, directory, pin, expectedPin }) => {
    const source = await openRegistryPressureSource(enrollment, directory);
    await fs.rename(pin, directory + '/former-pin');
    await fs.writeFile(pin, expectedPin, { mode: 0o400 });
    await expectFailure(source.close(), /pin/);
    expect(await Bun.file(pin).text()).toBe(expectedPin);
    expect(await Bun.file(directory + '/former-pin').text()).toBe(expectedPin);
  }));

test('close preserves an owned pin whose bytes no longer match', () =>
  withFixture(async ({ enrollment, directory, pin }) => {
    const source = await openRegistryPressureSource(enrollment, directory);
    await fs.chmod(pin, 0o600);
    await fs.writeFile(pin, 'changed');
    await fs.chmod(pin, 0o400);
    await expectFailure(source.close(), /pin/);
    expect(await Bun.file(pin).text()).toBe('changed');
  }));

test('refuses a replacement actor directory before trusting its pin', () =>
  withFixture(async ({ enrollment, directory, pin, expectedPin }) => {
    const source = await openRegistryPressureSource(enrollment, directory);
    await fs.rename(directory, directory + '-former');
    await fs.mkdir(directory, { mode: 0o700 });
    await fs.writeFile(pin, expectedPin, { mode: 0o400 });
    await expectFailure(
      source.read(new AbortController().signal, performance.now() + 2000),
      /directory/,
    );
    await expectFailure(source.close(), /directory/);
    expect(await Bun.file(pin).text()).toBe(expectedPin);
  }));

const fileCases: Record<string, [(path: string, parent: string) => Promise<unknown>, RegExp]> = {
  missing: [(path) => fs.unlink(path), /missing/],
  unreadable: [(path) => fs.chmod(path, 0o000), /unreadable/],
  'wrong mode': [(path) => fs.chmod(path, 0o644), /mode/],
  symlink: [
    async (path, parent) => {
      const target = parent + '/symlink-target';
      await fs.rename(path, target);
      await fs.symlink(target, path);
    },
    /symlink/,
  ],
  nonregular: [
    async (path) => {
      await fs.unlink(path);
      await fs.mkdir(path);
    },
    /regular/,
  ],
  multilink: [(path, parent) => fs.link(path, parent + '/extra-link'), /link/],
};

for (const subject of ['identity', 'pin'] as const) {
  for (const [name, [damage, reason]] of Object.entries(fileCases)) {
    test('refuses ' + name + ' ' + subject + ' before spawn', () =>
      withFixture(async ({ enrollment, directory, parent, path, pin }) => {
        const source = await openRegistryPressureSource(enrollment, directory);
        await damage(subject === 'identity' ? path : pin, parent);
        await expectFailure(
          source.read(new AbortController().signal, performance.now() + 2000),
          reason,
        );
      }),
    );
  }

  test('refuses modeled mismatched ' + subject + ' ownership before spawn', () =>
    withFixture(async ({ enrollment, directory, path, pin }) => {
      const source = await openRegistryPressureSource(enrollment, directory);
      const open = fs.open;
      const spy = spyOn(fs, 'open').mockImplementation(async (name, flags, mode) => {
        const file = await open(name, flags, mode);
        if (name === (subject === 'identity' ? path : pin)) {
          const statFile = file.stat.bind(file);
          file.stat = (async () => {
            const stat = await statFile();
            stat.uid = (process.getuid?.() ?? 1000) + 1;
            return stat;
          }) as typeof file.stat;
        }
        return file;
      });
      try {
        await expectFailure(
          source.read(new AbortController().signal, performance.now() + 2000),
          /owner/,
        );
      } finally {
        spy.mockRestore();
      }
    }),
  );

  test('refuses an oversized ' + subject + ' before spawn', () =>
    withFixture(async ({ enrollment, directory, path, pin }) => {
      const source = await openRegistryPressureSource(enrollment, directory);
      const filename = subject === 'identity' ? path : pin;
      await fs.chmod(filename, 0o600);
      await fs.writeFile(filename, Buffer.alloc(subject === 'identity' ? 4097 : 513));
      await fs.chmod(filename, 0o400);
      await expectFailure(
        source.read(new AbortController().signal, performance.now() + 2000),
        /large/,
      );
    }),
  );
}

test('refuses a private identity with a different hash', () =>
  withFixture(async ({ enrollment, directory, key }) => {
    const source = await openRegistryPressureSource(
      { ...enrollment, identity: { ...enrollment.identity, sha256: '1'.repeat(64) } },
      directory,
    );
    const failure = await source
      .read(new AbortController().signal, performance.now() + 2000)
      .catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain('identity');
    expect(String(failure)).not.toContain('1'.repeat(64));
    expect(String(failure)).not.toContain(key.toString('hex'));
    await source.close();
  }));

test('refuses changed pin bytes before spawn', () =>
  withFixture(async ({ enrollment, directory, pin }) => {
    const source = await openRegistryPressureSource(enrollment, directory);
    await fs.chmod(pin, 0o600);
    await fs.writeFile(pin, 'puni-registry-pressure-source changed\n');
    await fs.chmod(pin, 0o400);
    await expectFailure(source.read(new AbortController().signal, performance.now() + 2000), /pin/);
  }));

for (const [name, code, reason] of [
  ['missing', 'ENOENT', /missing/],
  ['not executable', 'EACCES', /executable/],
] as const) {
  test('throws when the fixed SSH executable is ' + name, () =>
    withFixture(async ({ enrollment, directory }) => {
      const source = await openRegistryPressureSource(enrollment, directory);
      const access = fs.access;
      const stat = fs.stat;
      const spy =
        name === 'missing'
          ? spyOn(fs, 'stat').mockImplementation((async (path: string) => {
              if (path === '/usr/bin/ssh') deny(code);
              return stat(path);
            }) as typeof fs.stat)
          : spyOn(fs, 'access').mockImplementation(async (path, mode) => {
              if (path === '/usr/bin/ssh' && mode !== undefined && (mode & constants.X_OK) !== 0)
                deny(code);
              return access(path, mode);
            });
      try {
        await expectFailure(
          source.read(new AbortController().signal, performance.now() + 2000),
          reason,
        );
      } finally {
        spy.mockRestore();
        await source.close();
      }
    }),
  );
}

test('surfaces a failed identity descriptor close without exposing its diagnostic', () =>
  withFixture(async ({ enrollment, directory, path }) => {
    const source = await openRegistryPressureSource(enrollment, directory);
    const open = fs.open;
    const spy = spyOn(fs, 'open').mockImplementation(async (name, flags, mode) => {
      const file = await open(name, flags, mode);
      if (name === path) {
        const close = file.close.bind(file);
        file.close = async () => {
          await close();
          deny('EIO');
        };
      }
      return file;
    });
    try {
      await expectFailure(
        source.read(new AbortController().signal, performance.now() + 2000),
        /^registry status identity close failed$/,
      );
    } finally {
      spy.mockRestore();
    }
  }));

test('uses the supplied expired deadline without spawning', () =>
  withFixture(async ({ enrollment, directory }) => {
    const source = await openRegistryPressureSource(enrollment, directory);
    await fs.unlink(enrollment.identity.path);
    expect(await source.read(new AbortController().signal, performance.now() - 1)).toEqual(timeout);
    await source.close();
  }));

for (const [name, deadline] of [
  ['NaN', () => NaN],
  ['infinite', () => Infinity],
  ['over five seconds', () => performance.now() + 5700],
] as const) {
  test('throws for a ' + name + ' deadline', () =>
    withFixture(async ({ enrollment, directory }) => {
      const source = await openRegistryPressureSource(enrollment, directory);
      await expectFailure(source.read(new AbortController().signal, deadline()), /deadline/);
      await source.close();
    }),
  );
}

test('caller cancellation before spawn is controlled and does not include its arbitrary reason', () =>
  withFixture(async ({ enrollment, directory }) => {
    const source = await openRegistryPressureSource(enrollment, directory);
    const caller = new AbortController();
    await fs.unlink(enrollment.identity.path);
    caller.abort('fixture private reason');
    const failure = await source
      .read(caller.signal, performance.now() + 2000)
      .catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(DOMException);
    expect(failure).toHaveProperty('name', 'AbortError');
    expect(String(failure)).not.toContain('fixture private reason');
    await source.close();
  }));

test('preflight consumes the original acquisition interval', () =>
  withFixture(async ({ enrollment, directory, path }) => {
    const source = await openRegistryPressureSource(enrollment, directory);
    const open = fs.open;
    const spy = spyOn(fs, 'open').mockImplementation(async (name, flags, mode) => {
      if (name === path) await Bun.sleep(150);
      return open(name, flags, mode);
    });
    try {
      expect(await source.read(new AbortController().signal, performance.now() + 1100)).toEqual(
        timeout,
      );
    } finally {
      spy.mockRestore();
      await source.close();
    }
  }));

test('unsettled preflight at the original deadline latches the actor', async () =>
  withFixture(async ({ enrollment, directory, path, pin }) => {
    const source = await openRegistryPressureSource(enrollment, directory);
    const wait = Promise.withResolvers<undefined>();
    const open = fs.open;
    const spy = spyOn(fs, 'open').mockImplementation(async (name, flags, mode) => {
      if (name === path) await wait.promise;
      return open(name, flags, mode);
    });
    try {
      const deadline = performance.now() + 1075;
      const failure = await source
        .read(new AbortController().signal, deadline)
        .catch((cause: unknown) => cause);
      expect(performance.now()).toBeLessThan(deadline + 500);
      expect(failure).toBeInstanceOf(RegistrySourceCleanupError);
      expect(failure).toHaveProperty('outcome', timeout);
      await expectFailure(source.close(), /unresolved/);
      expect(await Bun.file(pin).exists()).toBe(true);
      await expectFailure(
        source.read(new AbortController().signal, performance.now() + 2000),
        /fault/,
      );
    } finally {
      wait.resolve(undefined);
      spy.mockRestore();
    }
    const settled = performance.now() + 500;
    for (;;) {
      try {
        await source.close();
        break;
      } catch (cause) {
        if (performance.now() >= settled || !String(cause).includes('unresolved')) throw cause;
        await Bun.sleep(5);
      }
    }
    expect(await Bun.file(pin).exists()).toBe(false);
  }));

test('refuses to open the actor as modeled root UID', () =>
  withFixture(async ({ enrollment, directory, pin }) => {
    const uid = spyOn(process, 'getuid').mockReturnValue(0);
    try {
      await expectFailure(openRegistryPressureSource(enrollment, directory), /non-root/);
      expect(await Bun.file(pin).exists()).toBe(false);
    } finally {
      uid.mockRestore();
    }
  }));

test('refuses a nonregular fixed SSH executable', () =>
  withFixture(async ({ directory, enrollment }) => {
    const source = await openRegistryPressureSource(enrollment, directory);
    const stat = fs.stat;
    const spy = spyOn(fs, 'stat').mockImplementation(((path: string) =>
      stat(path === '/usr/bin/ssh' ? directory : path)) as typeof fs.stat);
    try {
      await expectFailure(
        source.read(new AbortController().signal, performance.now() + 2000),
        /regular/,
      );
    } finally {
      spy.mockRestore();
      await source.close();
    }
  }));

test('requests nonblocking admission for both held file descriptors', () =>
  withFixture(async ({ directory, enrollment, path, pin }) => {
    const source = await openRegistryPressureSource(enrollment, directory);
    const open = fs.open;
    const spy = spyOn(fs, 'open').mockImplementation(async (filename, flags, mode) => {
      if (filename === path || filename === pin) {
        expect(flags).toBe(constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      }
      if (filename === path) await Bun.sleep(125);
      return open(filename, flags, mode);
    });
    try {
      const caller = new AbortController();
      const cutoff = performance.now() + 1100;
      const read = source.read(caller.signal, cutoff);
      await Bun.sleep(110);
      expect(await read).toEqual(timeout);
    } finally {
      spy.mockRestore();
      await source.close();
    }
  }));

for (const [name, when, expected] of [
  ['before', 0, 'cancelled'],
  ['after', 160, 'deadline'],
] as const) {
  test('abort ' + name + ' cutoff while preflight is pending preserves its first outcome', () =>
    withFixture(async ({ directory, enrollment, path }) => {
      const source = await openRegistryPressureSource(enrollment, directory);
      const entered = Promise.withResolvers<undefined>();
      const release = Promise.withResolvers<undefined>();
      const caller = new AbortController();
      const open = fs.open;
      const spy = spyOn(fs, 'open').mockImplementation(async (filename, flags, mode) => {
        if (filename === path) {
          entered.resolve(undefined);
          await release.promise;
        }
        return open(filename, flags, mode);
      });
      try {
        const reading = source
          .read(caller.signal, performance.now() + 1100)
          .catch((cause: unknown) => cause);
        await entered.promise;
        if (when > 0) await Bun.sleep(when);
        caller.abort();
        if (when === 0) await Bun.sleep(160);
        release.resolve(undefined);
        const reply = await reading;
        if (expected === 'cancelled') {
          expect(reply).toBeInstanceOf(DOMException);
          expect(reply).toHaveProperty('name', 'AbortError');
        } else {
          expect(reply).toEqual(timeout);
        }
      } finally {
        release.resolve(undefined);
        spy.mockRestore();
        await source.close();
      }
    }),
  );
}

test('refuses a cancellation in the handoff between local preflight and spawn', () =>
  withFixture(async ({ directory, enrollment }) => {
    const source = await openRegistryPressureSource(enrollment, directory);
    const caller = new AbortController();
    const remove = caller.signal.removeEventListener.bind(caller.signal);
    const spy = spyOn(caller.signal, 'removeEventListener').mockImplementation(((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: EventListenerOptions | boolean,
    ) => {
      remove(type, listener, options);
      caller.abort();
    }) as typeof caller.signal.removeEventListener);
    try {
      const failure = await source
        .read(caller.signal, performance.now() + 2500)
        .catch((cause: unknown) => cause);
      expect(failure).toBeInstanceOf(DOMException);
      expect(failure).toHaveProperty('name', 'AbortError');
    } finally {
      spy.mockRestore();
      await source.close();
    }
  }));

test('failed pin initialization removes the incomplete pin and permits a fresh actor', () =>
  withFixture(async ({ directory, enrollment, pin }) => {
    const open = fs.open;
    const spy = spyOn(fs, 'open').mockImplementation(async (filename, flags, mode) => {
      const file = await open(filename, flags, mode);
      if (filename === pin && typeof flags === 'number' && (flags & constants.O_CREAT) !== 0) {
        file.writeFile = () => Promise.reject(new Error('private fixture write failure'));
      }
      return file;
    });
    try {
      await expectFailure(
        openRegistryPressureSource(enrollment, directory),
        /^registry status pin write failed$/,
      );
      expect(await fs.readdir(directory)).toEqual([]);
    } finally {
      spy.mockRestore();
    }
    const source = await openRegistryPressureSource(enrollment, directory);
    await source.close();
  }));

test('failed pin initialization preserves a replacement of the incomplete pin', () =>
  withFixture(async ({ directory, enrollment, pin }) => {
    const open = fs.open;
    const spy = spyOn(fs, 'open').mockImplementation(async (filename, flags, mode) => {
      const file = await open(filename, flags, mode);
      if (filename === pin && typeof flags === 'number' && (flags & constants.O_CREAT) !== 0) {
        file.writeFile = async () => {
          await fs.rename(pin, directory + '/incomplete-pin');
          await fs.writeFile(pin, 'replacement', { mode: 0o400 });
          throw new Error('private fixture write failure');
        };
      }
      return file;
    });
    try {
      await expectFailure(
        openRegistryPressureSource(enrollment, directory),
        /^registry status pin write failed$/,
      );
      expect(await Bun.file(pin).text()).toBe('replacement');
    } finally {
      spy.mockRestore();
    }
  }));

test('refuses a modeled same-number pin inode from another device', () =>
  withFixture(async ({ directory, enrollment, pin }) => {
    const source = await openRegistryPressureSource(enrollment, directory);
    const open = fs.open;
    const spy = spyOn(fs, 'open').mockImplementation(async (filename, flags, mode) => {
      const file = await open(filename, flags, mode);
      if (filename === pin) {
        const inspect = file.stat.bind(file);
        file.stat = (async () => {
          const current = await inspect();
          current.dev += 1;
          return current;
        }) as typeof file.stat;
      }
      return file;
    });
    try {
      await expectFailure(source.close(), /pin/);
      expect(await Bun.file(pin).exists()).toBe(true);
    } finally {
      spy.mockRestore();
      await source.close();
    }
  }));

for (const [name, completed] of [
  ['incorrect bytes', false],
  ['a replaced inode with correct bytes', true],
] as const) {
  test('pin initialization refuses ' + name, () =>
    withFixture(async ({ directory, enrollment, expectedPin, pin }) => {
      const open = fs.open;
      const spy = spyOn(fs, 'open').mockImplementation(async (filename, flags, mode) => {
        const file = await open(filename, flags, mode);
        if (filename === pin && typeof flags === 'number' && (flags & constants.O_CREAT) !== 0) {
          const write = file.writeFile.bind(file);
          file.writeFile = async () => {
            await write(completed ? expectedPin : 'unexpected');
            if (completed) {
              await fs.rename(pin, directory + '/former-pin');
              await fs.writeFile(pin, expectedPin, { mode: 0o400 });
            }
          };
        }
        return file;
      });
      try {
        await expectFailure(openRegistryPressureSource(enrollment, directory), /expected creation/);
        expect(await Bun.file(pin).exists()).toBe(completed);
      } finally {
        spy.mockRestore();
      }
    }),
  );
}

test('pin creation restores the required private mode after a restrictive create mask', () =>
  withFixture(async ({ directory, enrollment, pin }) => {
    const open = fs.open;
    const spy = spyOn(fs, 'open').mockImplementation(async (filename, flags, mode) => {
      const isPinCreation =
        filename === pin && typeof flags === 'number' && (flags & constants.O_CREAT) !== 0;
      if (isPinCreation) expect(mode).toBe(0o400);
      return open(filename, flags, isPinCreation ? 0o000 : mode);
    });
    try {
      const source = await openRegistryPressureSource(enrollment, directory);
      expect((await fs.lstat(pin)).mode & 0o7777).toBe(0o400);
      await source.close();
    } finally {
      spy.mockRestore();
    }
  }));

test('refuses a second close or read while the first close still owns the pin', () =>
  withFixture(async ({ directory, enrollment, pin }) => {
    const source = await openRegistryPressureSource(enrollment, directory);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const open = fs.open;
    let isFirst = true;
    const spy = spyOn(fs, 'open').mockImplementation(async (filename, flags, mode) => {
      if (filename === pin && isFirst) {
        isFirst = false;
        entered.resolve(undefined);
        await release.promise;
      }
      return open(filename, flags, mode);
    });
    const closing = source.close().catch((cause: unknown) => cause);
    let closeFailure: unknown;
    try {
      await entered.promise;
      await expectFailure(source.close(), /busy/);
      await expectFailure(
        source.read(new AbortController().signal, performance.now() + 2000),
        /closing/,
      );
      expect(await Bun.file(pin).exists()).toBe(true);
    } finally {
      release.resolve(undefined);
      spy.mockRestore();
      closeFailure = await closing;
    }
    expect(closeFailure).toBeUndefined();
    expect(await Bun.file(pin).exists()).toBe(false);
  }));

test('refuses a fixed SSH executable with modeled read denied and execute allowed', () =>
  withFixture(async ({ directory, enrollment }) => {
    const source = await openRegistryPressureSource(enrollment, directory);
    const access = fs.access;
    const spy = spyOn(fs, 'access').mockImplementation(async (path, mode) => {
      if (path === '/usr/bin/ssh' && mode !== undefined && (mode & constants.R_OK) !== 0) {
        deny('EACCES');
      }
      return access(path, mode);
    });
    try {
      await expectFailure(
        source.read(new AbortController().signal, performance.now() + 2000),
        /^registry status SSH executable lacks read or execute access$/,
      );
    } finally {
      spy.mockRestore();
      await source.close();
    }
  }));
