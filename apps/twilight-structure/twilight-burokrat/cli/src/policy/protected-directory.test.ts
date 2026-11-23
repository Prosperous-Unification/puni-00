import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

import { reserveProtectedDirectory } from './preparation-directory';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni protected directory '));
  roots.push(root);
  const source = join(root, 'source'),
    installation = join(root, 'installation'),
    runtime = join(root, 'runtime');
  for (const path of [source, installation, runtime]) mkdirSync(path);
  const manifest = join(installation, 'package.json');
  writeFileSync(manifest, '{}');
  const owned: string[] = [];
  const context = {
    callerDirectory: root,
    protectedPaths: [source, runtime, installation, manifest],
    otherDirectories: [] as string[],
    readCancellation: (): { status: 130 | 143 } | undefined => undefined,
    recordOwnership: (path: string) => {
      owned.push(path);
    },
  };
  return { root, source, installation, runtime, manifest, owned, context };
}

it('reserves a fresh native directory and records ownership before returning', async () => {
  const fixture = createFixture(),
    destination = join(fixture.root, 'fresh');
  expect(await reserveProtectedDirectory(destination, fixture.context)).toEqual({
    kind: 'reserved',
    directory: realpathSync.native(destination),
  });
  expect(fixture.owned).toEqual([destination, destination]);
});

it('returns prior protected-directory cancellation before absent parent and authority IO', async () => {
  const fixture = createFixture();
  expect(
    await reserveProtectedDirectory(join(fixture.root, 'absent-parent/new'), {
      ...fixture.context,
      protectedPaths: [join(fixture.root, 'absent-authority')],
      readCancellation: () => ({ status: 143 }),
    }),
  ).toEqual({ kind: 'cancelled', status: 143 });
  expect(fixture.owned).toEqual([]);
});

for (const selected of ['source', 'installation', 'runtime'] as const) {
  it('refuses output beneath explicit protected ' + selected + ' authority', async () => {
    const fixture = createFixture();
    await expectRefusal(
      reserveProtectedDirectory(join(fixture[selected], 'new'), fixture.context),
      'beneath protected source authority',
    );
    expect(fixture.owned).toEqual([]);
  });
}

it('protects physical authority targets reached through a symlink', async () => {
  const fixture = createFixture(),
    target = join(fixture.root, 'external-target'),
    alias = join(fixture.root, 'authority-link');
  mkdirSync(target);
  symlinkSync(target, alias);
  await expectRefusal(
    reserveProtectedDirectory(join(target, 'new'), { ...fixture.context, protectedPaths: [alias] }),
    'beneath protected source authority',
  );
  expect(fixture.owned).toEqual([]);
});

it('snapshots protected paths before the cancellation capability can mutate its input alias', async () => {
  const fixture = createFixture(),
    paths = [fixture.source];
  await expectRefusal(
    reserveProtectedDirectory(join(fixture.source, 'new'), {
      ...fixture.context,
      protectedPaths: paths,
      readCancellation: () => {
        paths.length = 0;
        return undefined;
      },
    }),
    'beneath protected source authority',
  );
  expect(fixture.owned).toEqual([]);
});

it('refuses a missing declared authority instead of dropping its protection', async () => {
  const fixture = createFixture();
  await expectRefusal(
    reserveProtectedDirectory(join(fixture.root, 'new'), {
      ...fixture.context,
      protectedPaths: [join(fixture.root, 'absent-authority')],
    }),
  );
  expect(fixture.owned).toEqual([]);
});

it('refuses occupied protected output without replacing its sentinel', async () => {
  const fixture = createFixture(),
    destination = join(fixture.root, 'occupied');
  mkdirSync(destination);
  writeFileSync(join(destination, 'sentinel'), 'preserved');
  await expectRefusal(reserveProtectedDirectory(destination, fixture.context));
  expect(readFileSync(join(destination, 'sentinel'), 'utf8')).toBe('preserved');
  expect(fixture.owned).toEqual([]);
});

it('refuses an output nested inside another owned output root', async () => {
  const fixture = createFixture(),
    work = join(fixture.root, 'work');
  mkdirSync(work);
  await expectRefusal(
    reserveProtectedDirectory(join(work, 'nested'), {
      ...fixture.context,
      otherDirectories: [work],
    }),
    'physically disjoint',
  );
  expect(existsSync(join(work, 'nested'))).toBe(false);
});

async function expectRefusal(operation: Promise<unknown>, message?: string): Promise<void> {
  const refusal: unknown = await operation.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  if (message !== undefined) expect(String(refusal)).toContain(message);
}
