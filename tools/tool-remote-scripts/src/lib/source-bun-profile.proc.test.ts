import { ok } from 'node:assert/strict';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { decodeRoleDependencyCapabilities } from './dependency-capability';

const repository = resolve(import.meta.dir, '../../../..');
/** Runtime CLI/support pairs and their loader configurations; type-only contracts imports are erased. */
const SOURCE_INPUTS = [
  'package.json',
  'tsconfig.base.json',
  ...['be-01', 'gw-01', 'mcp-01'].flatMap((tier) => [
    `apps/wbs/${tier}/tsconfig.json`,
    `apps/wbs/${tier}/src/dependency-capabilities-cli.ts`,
    `apps/wbs/${tier}/src/runtime/dependency-support.ts`,
  ]),
];

/**
 * Copies the DB-free capability inputs and rejects unavailable required files.
 * Proof: omitting the backend CLI selector failed the synthetic missing-input
 * test (0 pass / 1 fail); exact restoration passed that same test.
 */
async function copyProfileInputs(source: string, destination: string): Promise<void> {
  for (const path of SOURCE_INPUTS) {
    const target = resolve(destination, path);
    await mkdir(resolve(target, '..'), { recursive: true });
    await copyFile(resolve(source, path), target);
  }
}

async function runProfileCase(
  act: (profile: Awaited<ReturnType<typeof createProfile>>) => Promise<void>,
): Promise<void> {
  const root = scratchSync('source-bun144-profile-');
  try {
    await act(await createProfile(root));
  } finally {
    await rm(root, { recursive: true });
  }
}

async function createProfile(root: string) {
  for (const directory of ['home', 'image-home', 'scratch', 'source', 'source/node_modules'])
    await mkdir(`${root}/${directory}`);
  await writeFile(`${root}/passwd`, 'fixture:x:1000:1000::/home/fixture:/bin/sh\n');
  await writeFile(`${root}/preload.ts`, "console.log('BUNFIG_LOADED');\n");
  await writeFile(`${root}/bunfig.toml`, 'preload = ["/profile-preload.ts"]\n');
  await writeFile(
    `${root}/dotenv`,
    'SOURCE_SECRET=DOTENV_LOADED\nDB_PATH=/tmp/prohibited.sqlite\n',
  );
  await copyProfileInputs(repository, `${root}/source`);
  return {
    root,
    async run(
      tier: string,
      location?: string,
      home = false,
      dotenv = true,
      inspect = false,
      noEnv = true,
      malformed = false,
    ) {
      const configuration = malformed
        ? 'BUNFIG_PARSE_SENTINEL = [\n'
        : 'preload = ["/profile-preload.ts"]\n';
      await writeFile(`${root}/bunfig.toml`, configuration);
      if (dotenv)
        await writeFile(
          `${root}/source/apps/wbs/${tier}/.env`,
          'SOURCE_SECRET=DOTENV_LOADED\nDB_PATH=/tmp/prohibited.sqlite\n',
        );
      if (location?.startsWith('/home/fixture/'))
        await writeFile(`${root}/home/.bunfig.toml`, configuration);
      if (location?.startsWith('/image-home/'))
        await writeFile(`${root}/image-home/.bunfig.toml`, configuration);
      if (location?.startsWith('/src/'))
        await writeFile(`${root}/source/${location.slice(5)}`, configuration);
      const child = Bun.spawn(
        [
          '/usr/bin/bwrap',
          '--unshare-all',
          '--uid',
          '1000',
          '--gid',
          '1000',
          '--tmpfs',
          '/',
          '--dev',
          '/dev',
          '--proc',
          '/proc',
          '--ro-bind',
          '/usr',
          '/usr',
          '--symlink',
          'usr/bin',
          '/bin',
          '--symlink',
          'usr/lib',
          '/lib',
          '--symlink',
          'usr/lib64',
          '/lib64',
          '--ro-bind',
          '/etc',
          '/etc',
          '--ro-bind',
          `${root}/passwd`,
          '/etc/passwd',
          '--ro-bind',
          `${root}/home`,
          '/home/fixture',
          '--ro-bind',
          `${root}/image-home`,
          '/image-home',
          '--tmpfs',
          '/usr/local/bin',
          '--ro-bind',
          `${root}/source`,
          '/src',
          '--ro-bind',
          `${repository}/node_modules`,
          '/src/node_modules',
          '--bind',
          `${root}/scratch`,
          '/tmp',
          '--ro-bind',
          process.execPath,
          '/usr/local/bin/bun',
          '--ro-bind',
          `${root}/preload.ts`,
          '/profile-preload.ts',

          ...(location === undefined ||
          location.startsWith('/src/') ||
          location.startsWith('/home/') ||
          location.startsWith('/image-home/')
            ? []
            : ['--ro-bind', `${root}/bunfig.toml`, location]),
          '--chdir',
          `/src/apps/wbs/${tier}`,
          '/usr/bin/env',
          '-i',
          'PATH=/usr/local/bin:/usr/bin:/bin',
          'BUN_RUNTIME_TRANSPILER_CACHE_PATH=0',
          ...(home ? ['HOME=/image-home'] : []),
          '/usr/local/bin/bun',
          ...(noEnv ? ['--no-env-file'] : []),
          ...(inspect
            ? [
                '--eval',
                `import {writeFileSync} from 'node:fs';let readonly=false;try{writeFileSync('/src/forbidden','x')}catch(e){if(e.code!=='EROFS')throw e;readonly=true;}console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),hasHome:Object.hasOwn(process.env,'HOME'),secret:process.env.SOURCE_SECRET??'absent',readonly}));`,
              ]
            : ['run', 'src/dependency-capabilities-cli.ts']),
        ],
        { stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(10000) },
      );
      const [stdoutRead, stderrRead, exitRead] = await Promise.allSettled([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      if (stdoutRead.status === 'rejected') throw stdoutRead.reason;
      if (stderrRead.status === 'rejected') throw stderrRead.reason;
      if (exitRead.status === 'rejected') throw exitRead.reason;
      const stdout = stdoutRead.value;
      const stderr = stderrRead.value;
      const code = exitRead.value;
      if (malformed && stderr.includes('BUNFIG_PARSE_SENTINEL')) {
        expect(code).toBe(0);
        expect(decodeRoleDependencyCapabilities(stdout, 'backend')).toEqual([
          'cross-project-dependencies-v1',
        ]);
        return 'BUNFIG_PARSED_WITH_DIAGNOSTIC\n';
      }
      expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
      expect(stderr).toBe('');
      expect(
        (await readdir(`${root}/scratch`)).every((name) =>
          /^bun-node-1000-[a-f0-9]{9}$/.test(name),
        ),
      ).toBe(true);
      return stdout;
    },
  };
}

test('profile snapshot retains exact CLI inputs without copying generated checkout artifacts', async () => {
  const root = scratchSync('source-profile-inputs-');
  try {
    const source = `${root}/checkout`;
    const destination = `${root}/snapshot`;
    for (const path of SOURCE_INPUTS) {
      await mkdir(resolve(source, path, '..'), { recursive: true });
      await writeFile(resolve(source, path), `required:${path}\n`);
    }
    const artifacts = [
      'apps/wbs/fe-01/playwright-report/data/report.zip',
      'apps/wbs/be-01/coverage/lcov.info',
      'apps/wbs/mcp-01/dist/main.js',
      'libs/wbs/adapters/store-sqlite/coverage/lcov.info',
    ];
    for (const path of artifacts) {
      await mkdir(resolve(source, path, '..'), { recursive: true });
      await writeFile(resolve(source, path), 'ignored generated bytes');
    }
    await copyProfileInputs(source, destination);
    for (const path of SOURCE_INPUTS)
      expect(await readFile(resolve(destination, path), 'utf8')).toBe(`required:${path}\n`);
    for (const path of artifacts) {
      const refusal: unknown = await stat(resolve(destination, path)).then(
        () => undefined,
        (cause: unknown) => cause,
      );
      ok(refusal instanceof Error && 'code' in refusal);
      expect(refusal.code).toBe('ENOENT');
    }
  } finally {
    await rm(root, { recursive: true });
  }
});

test('profile snapshot refuses a missing required backend capability CLI', async () => {
  const root = scratchSync('source-profile-required-input-');
  try {
    const source = `${root}/checkout`;
    const destination = `${root}/snapshot`;
    for (const path of SOURCE_INPUTS) {
      await mkdir(resolve(source, path, '..'), { recursive: true });
      await writeFile(resolve(source, path), `required:${path}\n`);
    }
    const requiredCli = resolve(source, 'apps/wbs/be-01/src/dependency-capabilities-cli.ts');
    await mkdir(resolve(requiredCli, '..'), { recursive: true });
    await writeFile(requiredCli, 'required backend capability CLI\n');
    await rm(requiredCli);
    const refusal: unknown = await copyProfileInputs(source, destination).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    ok(refusal instanceof Error && 'code' in refusal);
    expect(refusal.code).toBe('ENOENT');
    ok('path' in refusal);
    expect(refusal.path).toBe(requiredCli);
  } finally {
    await rm(root, { recursive: true });
  }
});

test('Bun 1.4.4 isolated UID1000 noHOME readonly source executes all four actual DB-free role CLIs', async () => {
  expect(Bun.version).toBe('1.4.4');
  await runProfileCase(async (profile) => {
    for (const [role, tier] of [
      ['backend', 'be-01'],
      ['backend', 'be-01'],
      ['gateway', 'gw-01'],
      ['mcp', 'mcp-01'],
    ] as const) {
      const stdout = await profile.run(tier);
      expect(decodeRoleDependencyCapabilities(stdout, role)).toEqual([
        'cross-project-dependencies-v1',
      ]);
      expect(stdout).not.toContain('DOTENV_LOADED');
    }
  });
});

for (const home of [false, true])
  for (const location of [
    '/home/fixture/.bunfig.toml',
    '/image-home/.bunfig.toml',
    '/src/apps/wbs/be-01/bunfig.toml',
    '/src/apps/wbs/bunfig.toml',
    '/src/apps/bunfig.toml',
    '/src/bunfig.toml',
    '/bunfig.toml',
    '/.bunfig.toml',
  ])
    test(`Bun 1.4.4 isolated loader ${home ? 'explicitHOME' : 'noHOME'} measures ${location}`, async () => {
      expect(Bun.version).toBe('1.4.4');
      await runProfileCase(async (profile) => {
        const stdout = await profile.run('be-01', location, home);
        const parsed = await profile.run('be-01', location, home, true, false, true, true);
        expect(parsed.startsWith('BUNFIG_PARSED_WITH_DIAGNOSTIC')).toBe(
          location === '/src/apps/wbs/be-01/bunfig.toml',
        );
        const loaded = stdout.startsWith('BUNFIG_LOADED\n');
        console.log(JSON.stringify({ profile: 'bun-1.4.4-source-loader', home, location, loaded }));
        expect(
          decodeRoleDependencyCapabilities(
            loaded ? stdout.slice('BUNFIG_LOADED\n'.length) : stdout,
            'backend',
          ),
        ).toEqual(['cross-project-dependencies-v1']);
        // Measurements are pinned after the first isolated loader run, rather than inferred from homedir().
        expect(loaded).toBe(location === '/src/apps/wbs/be-01/bunfig.toml');
      });
    });

test('Bun 1.4.4 readonly UID1000 env-i probe observes dotenv only with no-env-file omitted', async () => {
  await runProfileCase(async (profile) => {
    expect(JSON.parse(await profile.run('be-01', undefined, false, true, true))).toEqual({
      uid: 1000,
      gid: 1000,
      hasHome: false,
      secret: 'absent',
      readonly: true,
    });
    expect(JSON.parse(await profile.run('be-01', undefined, false, true, true, false))).toEqual({
      uid: 1000,
      gid: 1000,
      hasHome: false,
      secret: 'DOTENV_LOADED',
      readonly: true,
    });
  });
});
