import { createHash } from 'node:crypto';
import {
  chmod,
  copyFile,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, spyOn, test } from 'bun:test';

import * as commands from './check-cli';
import { runChecked } from './check-cli';
import { readToolchain } from './contracts';
import { provisionObservabilityTools } from './observability-tools.fixture';

const root = join(import.meta.dir, '../../..');
const tools = await provisionObservabilityTools();
const lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));

async function seedCache(): Promise<string> {
  const cache = await scratchAsync('observability-cache-');
  for (const name of ['kubectl', 'helm'] as const) {
    const pin = lock.binaries[name];
    const directory = `${name}-${pin.version}`;
    const archive = join(directory, basename(new URL(pin.url).pathname));
    await mkdir(join(cache, directory));
    await copyFile(join(tools, 'cache', archive), join(cache, archive));
  }
  return cache;
}

test('locked fixture reuses one installation without extracting shared Helm state', async () => {
  const cache = await seedCache();
  const shared = join(cache, `helm-${lock.binaries.helm.version}`, 'extracted');
  await mkdir(shared);
  await writeFile(join(shared, 'must-preserve'), 'another process owns this');
  const env = { PUNI_TOOL_CACHE: cache };
  const first = provisionObservabilityTools(env);
  expect(provisionObservabilityTools(env)).toBe(first);
  const directory = await first;
  const before = await stat(join(directory, 'helm'));
  expect(await provisionObservabilityTools(env)).toBe(directory);
  expect((await stat(join(directory, 'helm'))).ino).toBe(before.ino);
  expect(await readFile(join(shared, 'must-preserve'), 'utf8')).toBe('another process owns this');
  expect(
    await runChecked([join(directory, 'kubectl'), 'version', '--client'], { timeoutMs: 60000 }),
  ).toMatchObject({ exitCode: 0 });
});

test('locked fixture repairs changed cached bytes before executing kubectl', async () => {
  const cache = await seedCache();
  const pin = lock.binaries.kubectl;
  await writeFile(
    join(cache, `kubectl-${pin.version}`, 'kubectl'),
    '#!/bin/sh\nprintf "Client Version: v1.36.4\\n"\n',
  );
  const directory = await provisionObservabilityTools({ PUNI_TOOL_CACHE: cache });
  expect(
    createHash('sha256')
      .update(await readFile(join(directory, 'kubectl')))
      .digest('hex'),
  ).toBe(pin.sha256);
  expect(
    (await runChecked([join(directory, 'kubectl'), 'version', '--client'], { timeoutMs: 60000 }))
      .stdout,
  ).toContain('Client Version: v1.36.4');
}, 660000);

test.each(['kubectl', 'helm'] as const)(
  'locked fixture refuses unreadable %s archive seeds instead of ignoring required state',
  async (name) => {
    const cache = await seedCache();
    const pin = lock.binaries[name];
    const archive = join(cache, `${name}-${pin.version}`, basename(new URL(pin.url).pathname));
    await chmod(archive, 0);
    try {
      const failure = await provisionObservabilityTools({ PUNI_TOOL_CACHE: cache }).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(failure).toMatchObject({ code: 'EACCES' });
    } finally {
      await chmod(archive, 0o600);
    }
  },
);

test('locked fixture publishes verified Helm preparation from an empty cache with private executables', async () => {
  const cache = await scratchAsync('observability-empty-cache-');
  expect(await readdir(cache)).toEqual([]);
  const directory = await provisionObservabilityTools({ PUNI_TOOL_CACHE: cache });
  const pin = lock.binaries.helm;
  const archive = join(cache, `helm-${pin.version}`, basename(new URL(pin.url).pathname));
  expect(
    createHash('sha256')
      .update(await readFile(archive))
      .digest('hex'),
  ).toBe(pin.sha256);
  expect(await readFile(archive)).toEqual(
    await readFile(
      join(directory, 'cache', `helm-${pin.version}`, basename(new URL(pin.url).pathname)),
    ),
  );
  expect(await realpath(join(directory, 'helm'))).toStartWith(join(directory, 'cache'));
  expect(await readdir(join(cache, `helm-${pin.version}`))).toEqual([basename(archive)]);
  expect(await readdir(cache)).toEqual([`helm-${pin.version}`]);
}, 660000);

test('locked fixture concurrent preparations publish complete archives with distinct private executables', async () => {
  const cache = await seedCache();
  const pin = lock.binaries.helm;
  const shared = join(cache, `helm-${pin.version}`);
  const archive = join(shared, basename(new URL(pin.url).pathname));
  const extracted = join(shared, 'extracted');
  await mkdir(extracted);
  await writeFile(join(extracted, 'must-preserve'), 'another process owns this');
  const before = await stat(archive);
  const children = Array.from({ length: 2 }, () =>
    Bun.spawn(
      [
        process.execPath,
        '--eval',
        `import { realpath } from 'node:fs/promises';
     import { join } from 'node:path';
     import { provisionObservabilityTools } from './tools/tool-fleet/src/observability-tools.fixture.ts';
     const directory = await provisionObservabilityTools();
     console.log(JSON.stringify({directory, executable: await realpath(join(directory, 'helm'))}));`,
      ],
      {
        cwd: root,
        env: { ...process.env, PUNI_TOOL_CACHE: cache },
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 30000,
      },
    ),
  );
  const observations = children.map(async (child) => {
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(stderr).toBe('');
    expect(exit).toBe(0);
    return JSON.parse(stdout) as { directory: string; executable: string };
  });
  let finished = 0;
  for (const child of children)
    void child.exited.then(() => {
      finished += 1;
    });
  while (finished !== children.length) {
    expect(
      createHash('sha256')
        .update(await readFile(archive))
        .digest('hex'),
    ).toBe(pin.sha256);
    await Bun.sleep(1);
  }
  const preparations = await Promise.all(observations);
  expect(new Set(preparations.map((preparation) => preparation.directory)).size).toBe(2);
  for (const preparation of preparations)
    expect(preparation.executable).toStartWith(join(preparation.directory, 'cache'));
  expect((await stat(archive)).ino).not.toBe(before.ino);
  expect(
    createHash('sha256')
      .update(await readFile(archive))
      .digest('hex'),
  ).toBe(pin.sha256);
  expect((await readdir(shared)).sort()).toEqual(['extracted', basename(archive)].sort());
  expect(await readFile(join(extracted, 'must-preserve'), 'utf8')).toBe(
    'another process owns this',
  );
});

test('locked fixture refuses an unwritable required Helm publication directory', async () => {
  const cache = await seedCache();
  const pin = lock.binaries.helm;
  const shared = join(cache, `helm-${pin.version}`);
  const archive = join(shared, basename(new URL(pin.url).pathname));
  await chmod(shared, 0o500);
  try {
    const failure = await provisionObservabilityTools({ PUNI_TOOL_CACHE: cache }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(failure).toMatchObject({ code: 'EACCES' });
    expect(
      createHash('sha256')
        .update(await readFile(archive))
        .digest('hex'),
    ).toBe(pin.sha256);
  } finally {
    await chmod(shared, 0o700);
  }
});

test('locked fixture refuses malformed Helm publication without leaving staging files', async () => {
  const cache = await seedCache();
  const pin = lock.binaries.helm;
  const shared = join(cache, `helm-${pin.version}`);
  const archive = join(shared, basename(new URL(pin.url).pathname));
  const run = commands.runChecked;
  const probe = spyOn(commands, 'runChecked').mockImplementation(async (argv, options) => {
    const checked = await run(argv, options);
    if (argv[0].endsWith('/helm') && argv[1] === 'version') {
      await rm(archive);
      await mkdir(archive);
    }
    return checked;
  });
  try {
    const failure = await provisionObservabilityTools({ PUNI_TOOL_CACHE: cache }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(failure).toMatchObject({ code: 'EISDIR' });
    expect(await readdir(shared)).toEqual([basename(archive)]);
  } finally {
    probe.mockRestore();
  }
});
