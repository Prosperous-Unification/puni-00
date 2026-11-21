import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { expect, test } from 'bun:test';

import {
  acquireIsolatedStoreUse,
  assertIsolatedStore,
  createIsolatedStore,
} from './isolated-store';

async function refusalOf(pending: Promise<void>): Promise<Error> {
  let refusal: unknown;
  try {
    await pending;
  } catch (cause) {
    refusal = cause;
  }
  expect(refusal).toBeInstanceOf(Error);
  if (!(refusal instanceof Error)) throw Error('expected asynchronous refusal absent');
  return refusal;
}

test('creates a private fresh target and revokes it only after owned removal', async () => {
  const first = createIsolatedStore(),
    second = createIsolatedStore();
  try {
    expect(first.path).not.toBe(second.path);
    expect(lstatSync(first.path).isFile()).toBe(true);
    expect(lstatSync(first.path).mode & 0o777).toBe(0o600);
    expect(lstatSync(dirname(first.path)).mode & 0o777).toBe(0o700);
    expect(readFileSync(first.path).length).toBe(0);
    assertIsolatedStore(first, first.path);
    const settled = first.close();
    expect(first.close()).toBe(settled);
    await settled;
    expect(existsSync(dirname(first.path))).toBe(false);
    expect(() => {
      assertIsolatedStore(first, first.path);
    }).toThrow('not live');
  } finally {
    await first.close();
    await second.close();
  }
});

test('rejects copied, serialized, absent and wrong owners without blessing an arbitrary target', async () => {
  const owner = createIsolatedStore(),
    other = createIsolatedStore();
  try {
    for (const forged of [undefined, null, {}, { ...owner }, JSON.parse(JSON.stringify(owner))])
      expect(() => {
        assertIsolatedStore(forged, owner.path);
      }).toThrow('not recognized');
    expect(() => {
      assertIsolatedStore(owner, other.path);
    }).toThrow('does not match');
    expect(() => {
      assertIsolatedStore(owner, join(dirname(owner.path), 'alias.db'));
    }).toThrow('does not match');
    assertIsolatedStore(owner, owner.path);
  } finally {
    await owner.close();
    await other.close();
  }
});

test.each(['file', 'directory'] as const)(
  'refuses replaced %s identities and leaves the competing node untouched',
  async (kind) => {
    const owner = createIsolatedStore();
    const path = kind === 'file' ? owner.path : dirname(owner.path);
    const retained = path + '-retained';
    renameSync(path, retained);
    if (kind === 'file') writeFileSync(path, 'foreign');
    else symlinkSync(retained, path, 'dir');
    try {
      expect(() => {
        assertIsolatedStore(owner, owner.path);
      }).toThrow(/isolated store/);
      expect((await refusalOf(owner.close())).message).toMatch(/isolated store/);
      if (kind === 'file') expect(readFileSync(path, 'utf8')).toBe('foreign');
      else expect(lstatSync(path).isSymbolicLink()).toBe(true);
    } finally {
      unlinkSync(path);
      renameSync(retained, path);
      await owner.close();
    }
  },
);

test('refuses a target symlink even when it resolves to the retained file', async () => {
  const owner = createIsolatedStore();
  const retained = owner.path + '-retained';
  renameSync(owner.path, retained);
  symlinkSync(retained, owner.path);
  try {
    expect(() => {
      assertIsolatedStore(owner, owner.path);
    }).toThrow('not the owned file');
    expect((await refusalOf(owner.close())).message).toContain('not the owned file');
    expect(lstatSync(owner.path).isSymbolicLink()).toBe(true);
  } finally {
    unlinkSync(owner.path);
    renameSync(retained, owner.path);
    await owner.close();
  }
});

test('refuses unexpected children and sidecars without deleting them or revoking the live owner', async () => {
  const owner = createIsolatedStore();
  const unexpected = owner.path + '-wal';
  writeFileSync(unexpected, 'foreign');
  try {
    expect((await refusalOf(owner.close())).message).toContain('unexpected entries');
    expect(readFileSync(unexpected, 'utf8')).toBe('foreign');
    expect(existsSync(owner.path)).toBe(true);
    assertIsolatedStore(owner, owner.path);
  } finally {
    unlinkSync(unexpected);
    await owner.close();
  }
});

test('keeps a real descriptor use active until its captured asynchronous close settles once', async () => {
  const owner = createIsolatedStore();
  const descriptor = openSync(owner.path, 'r');
  let calls = 0;
  let finish: () => void = () => {
    throw Error('close gate absent');
  };
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const selected = async () => {
    calls++;
    await gate;
    closeSync(descriptor);
  };
  const use = acquireIsolatedStoreUse(owner, owner.path, selected);
  const pending = use.close();
  expect(use.close()).toBe(pending);
  expect((await refusalOf(owner.close())).message).toContain('active users');
  assertIsolatedStore(owner, owner.path);
  finish();
  await pending;
  expect(calls).toBe(1);
  await owner.close();
  expect(existsSync(dirname(owner.path))).toBe(false);
});

test.skipIf(process.getuid?.() === 0)(
  'propagates native unlink denial without claiming closed cleanup or repeating it',
  async () => {
    const owner = createIsolatedStore();
    const directory = dirname(owner.path);
    chmodSync(directory, 0o500);
    try {
      const pending = owner.close();
      expect(owner.close()).toBe(pending);
      expect((await refusalOf(pending)).message).toContain('isolated store cleanup failed');
      expect(existsSync(owner.path)).toBe(true);
      expect(() => {
        assertIsolatedStore(owner, owner.path);
      }).toThrow('not live');
    } finally {
      chmodSync(directory, 0o700);
      unlinkSync(owner.path);
      rmdirSync(directory);
    }
  },
);

test('refuses a replacement real directory before opening or removing its foreign contents', async () => {
  const owner = createIsolatedStore();
  const directory = dirname(owner.path),
    retained = directory + '-retained';
  renameSync(directory, retained);
  mkdirSync(directory);
  const foreign = join(directory, 'foreign');
  writeFileSync(foreign, 'unchanged');
  try {
    expect(() => {
      assertIsolatedStore(owner, owner.path);
    }).toThrow('directory identity changed');
    expect((await refusalOf(owner.close())).message).toContain('directory identity changed');
    expect(readFileSync(foreign, 'utf8')).toBe('unchanged');
  } finally {
    unlinkSync(foreign);
    rmdirSync(directory);
    renameSync(retained, directory);
    await owner.close();
  }
});
test('rejects a missing close callback without registering a releasable user', async () => {
  const owner = createIsolatedStore();
  try {
    expect(() => acquireIsolatedStoreUse(owner, owner.path, undefined as never)).toThrow(
      'close callback is missing',
    );
    assertIsolatedStore(owner, owner.path);
  } finally {
    await owner.close();
  }
});

test.skipIf(process.getuid?.() === 0)(
  'cleans only its actual allocated empty directory when native acquisition denies before any file FD',
  () => {
    const parent = mkdtempSync(join(tmpdir(), 'wbs-isolated-acquisition-'));
    const script = `
    import {readdirSync} from "node:fs";
    import {createIsolatedStore} from ${JSON.stringify(new URL('./isolated-store.ts', import.meta.url).pathname)};
    process.env.TMPDIR=${JSON.stringify(parent)};
    process.umask(0o777);
    let refusal;try{createIsolatedStore();}catch(cause){refusal=cause;}
    if(!(refusal instanceof Error)||Reflect.get(refusal,"code")!=="EACCES")throw Error("native acquisition EACCES absent",{cause:refusal});
    console.log(JSON.stringify({code:Reflect.get(refusal,"code"),remaining:readdirSync(${JSON.stringify(parent)}).length}));
  `;
    const child = Bun.spawnSync([process.execPath, '--eval', script], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 10000,
    });
    const receipt = {
      exitCode: child.exitCode,
      success: child.success,
      signalField: child.signalCode ?? 'absent',
      timeoutField: child.exitedDueToTimeout ?? 'absent',
      stdout: new TextDecoder().decode(child.stdout),
      stderr: new TextDecoder().decode(child.stderr),
    };
    console.log('isolated-store acquisition receipt ' + JSON.stringify(receipt));
    let primary: unknown;
    try {
      expect(child.exitCode).toBe(0);
      expect(child.success).toBe(true);
      expect(receipt.stderr).toBe('');
      expect(receipt.stdout).toBe('{"code":"EACCES","remaining":0}\n');
      expect(readdirSync(parent)).toEqual([]);
    } catch (cause) {
      primary = cause;
    }
    try {
      rmdirSync(parent);
    } catch (cause) {
      if (primary !== undefined)
        throw new AggregateError([primary, cause], 'acquisition control and cleanup failed', {
          cause,
        });
      throw cause;
    }
    if (primary instanceof Error) throw primary;
    if (primary !== undefined) throw new Error('acquisition control failed', { cause: primary });
  },
);
