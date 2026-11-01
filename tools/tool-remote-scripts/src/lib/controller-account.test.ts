import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import {
  controllerAccount,
  controllerAccountPlugin,
  copyControllerBun,
  mapControllerShell,
  mapControllerSource,
  mapPushSource,
  verifyControllerFile,
} from '../fixtures/controller-account';
import { buildInstalledControllerAdmission } from './edge-admission';
import { withCanonicalLock } from './lock';

const admission = await readFile(new URL('./edge-admission.ts', import.meta.url), 'utf8');
const push = 'before\ntest "$controller_parent_uid" = 1000 || exit 1\nafter';
const modeled = { uid: 1001, gid: 1002 };

test('fixture account pins required matching native real and effective accounts', () => {
  expect(controllerAccount).toEqual({ uid: process.getuid!(), gid: process.getgid!() });
});

test('maps only exact installed-reader expected accounts and retains production1000 source', () => {
  const mapped = mapControllerSource(admission, modeled);
  expect(mapped).toContain(`opening.uid !== '1001'`);
  expect(mapped).toContain(`opening.gid !== '1002'`);
  expect(mapped).toContain('Bun.sleep(1000)');
  expect(mapped).toContain('controller_file_uid" != 1001');
  expect(mapped).toContain('controller_file_gid" != 1002');
  expect(mapped).toContain('controller_current_bun_identity');
  expect(mapped).toContain('admission.descriptor');
  expect(admission).toContain(`opening.uid !== '1000'`);
  expect(admission).toContain(`opening.gid !== '1000'`);
});

for (const anchor of [
  '"$controller_file_uid" != 1000',
  '"$controller_file_gid" != 1000',
  "opening.uid !== '1000'",
  "opening.gid !== '1000'",
]) {
  for (const fault of ['missing', 'duplicate', 'malformed']) {
    test(`controller account rejects ${fault} expected-account anchor ${anchor}`, () => {
      const broken = admission.replace(
        anchor,
        fault === 'missing'
          ? ''
          : fault === 'duplicate'
            ? anchor + anchor
            : anchor.replace('1000', '1009'),
      );
      expect(() => mapControllerSource(broken, modeled)).toThrow('anchor');
    });
  }
}

test('shell mapping rejects TypeScript or absent shell predicates', () => {
  expect(() => mapControllerShell('no predicates', modeled)).toThrow('anchor');
});

test('push parent mapping preserves comparison and changes exactly one expected UID', () => {
  const mapped = mapPushSource(push, modeled);
  expect(mapped).toContain('test "$controller_parent_uid" = 1001 || exit 1');
  expect(
    mapped.replace(
      'test "$controller_parent_uid" = 1001 || exit 1',
      'test "$controller_parent_uid" = 1000 || exit 1',
    ),
  ).toBe(push);
  expect(() => mapPushSource(push + push, modeled)).toThrow('anchor');
  expect(() => mapPushSource('', modeled)).toThrow('anchor');
});

for (const account of [
  { uid: -1, gid: 1000 },
  { uid: 1000, gid: Number.NaN },
  { uid: 1.5, gid: 1000 },
]) {
  test(`invalid account ${JSON.stringify(account)} refuses before mapping`, () => {
    expect(() => controllerAccountPlugin(account)).toThrow('invalid fixture account');
    expect(() => mapControllerShell(admission, account)).toThrow('invalid fixture account');
    expect(() => mapPushSource(push, account)).toThrow('invalid fixture account');
  });
}

test('unknown canonical source module refuses the actual load callback', async () => {
  let load: ((file: { path: string }) => unknown) | undefined;
  await controllerAccountPlugin().setup({
    onLoad(_options: unknown, callback: (file: { path: string }) => unknown) {
      load = callback;
    },
  } as Parameters<Bun.BunPlugin['setup']>[0]);
  if (load === undefined) throw new Error('fixture load callback not registered');
  const captured = load;
  expect(() => captured({ path: import.meta.path })).toThrow('unknown controller account module');
});

test('supplied existing module cannot redefine the pinned production push allowlist', async () => {
  expect(() => controllerAccountPlugin(controllerAccount, import.meta.path)).toThrow(
    'unknown supplied controller push module',
  );
  const root = await mkdtemp(join(tmpdir(), 'unknown-push-module-'));
  try {
    const path = join(root, 'push.ts');
    await writeFile(path, 'test "$controller_parent_uid" = 1000 || exit 1');
    expect(() => controllerAccountPlugin(controllerAccount, path)).toThrow(
      'unknown supplied controller push module',
    );
  } finally {
    await rm(root, { recursive: true });
  }
});

test('owned artifact metadata refuses missing, wrong mode and symlink before launch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'controller-metadata-'));
  try {
    const path = join(root, 'reader.js');
    expect(() => {
      verifyControllerFile(path);
    }).toThrow();
    await writeFile(path, 'reader', { mode: 0o700 });
    expect(() => {
      verifyControllerFile(path);
    }).toThrow('metadata differs');
    await chmod(path, 0o755);
    verifyControllerFile(path);
    const alias = join(root, 'alias');
    await symlink(path, alias);
    expect(() => {
      verifyControllerFile(alias);
    }).toThrow('metadata differs');
  } finally {
    await rm(root, { recursive: true });
  }
});

test('modeled1001 observations discriminate original and mapped predicates through source and bundled admission with the real reader and original FD3', async () => {
  const root = await mkdtemp(join(tmpdir(), 'controller-account-witness-'));
  try {
    const bun = join(root, 'bun');
    const reader = join(root, 'reader.js');
    const commands = join(root, 'commands');
    await mkdir(commands);
    copyControllerBun(bun);
    await writeFile(join(root, 'edge.lock'), '');
    await writeFile(
      join(root, 'edge-policy.json'),
      JSON.stringify({
        format: 'dependency-edge-policy',
        version: 1,
        phase: 'ordinary',
        edgeState: root,
      }),
    );
    const contract = realpathSync(
      new URL('./solver-supervisor-install-contract.ts', import.meta.url).pathname,
    );
    const admissionPath = realpathSync(new URL('./edge-admission.ts', import.meta.url).pathname);
    const preparation = realpathSync(
      new URL('./solver-reader-preparation.ts', import.meta.url).pathname,
    );
    const layout: Bun.BunPlugin = {
      name: 'witness-layout',
      setup(build) {
        build.onLoad({ filter: /solver-supervisor-install-contract\.ts$/ }, () => {
          let source = readFileSync(contract, 'utf8');
          for (const [anchor, path] of [
            ["'/home/puni1/wbs/state'", root],
            ["'/home/puni1/.local/lib/wbs-solver/bun'", bun],
            ["'/home/puni1/.local/lib/wbs-solver/solver-supervisor.js'", reader],
          ]) {
            if (source.split(anchor).length !== 2) throw new Error('witness layout anchor differs');
            source = source.replace(anchor, JSON.stringify(path));
          }
          return { contents: source, loader: 'ts' };
        });
      },
    };
    const compiled = await Bun.build({
      entrypoints: [new URL('../solver-supervisor.ts', import.meta.url).pathname],
      target: 'bun',
      plugins: [layout],
    });
    const output = compiled.outputs.at(0);
    if (!compiled.success || compiled.outputs.length !== 1 || output === undefined)
      throw new Error('witness real reader build failed');
    await writeFile(reader, await output.text(), { mode: 0o755 });
    verifyControllerFile(reader);
    const metadata = [process.execPath, bun, reader, root].map((path) => {
      const opened = lstatSync(path);
      return {
        path,
        canonical: realpathSync(path),
        uid: opened.uid,
        gid: opened.gid,
        mode: opened.mode & 0o7777,
        device: String(opened.dev),
        inode: String(opened.ino),
        sha256: createHash('sha256')
          .update(readFileSync(path === root ? join(root, 'edge.lock') : path))
          .digest('hex'),
      };
    });
    console.log(
      JSON.stringify({
        witness: 'native metadata before modeled1001 observation',
        account: controllerAccount,
        metadata,
      }),
    );
    const entry = join(root, 'entry.ts');
    await writeFile(
      entry,
      `import {assertInstalledControllerAdmission} from ${JSON.stringify(admissionPath)}; await assertInstalledControllerAdmission('required'); console.log('actual-reader-admitted-original-FD3');`,
    );
    const helper = new URL('../fixtures/controller-account.ts', import.meta.url).pathname;
    const activation = join(root, 'activation');
    const layoutSetup = `build.onLoad({filter:/solver-supervisor-install-contract\\.ts$/},()=>({contents:${JSON.stringify(readFileSync(contract, 'utf8').replace("'/home/puni1/wbs/state'", JSON.stringify(root)).replace("'/home/puni1/.local/lib/wbs-solver/bun'", JSON.stringify(bun)).replace("'/home/puni1/.local/lib/wbs-solver/solver-supervisor.js'", JSON.stringify(reader)))},loader:'ts'}));`;
    // The observation fault is confined to this witness. Actual descriptor capture, hashes, mode and identities run first.
    const observationSetup = `build.onLoad({filter:/solver-reader-preparation\\.ts$/},({path})=>{if(path!==${JSON.stringify(preparation)})throw new Error('unknown witness capture module');let source=readFileSync(path,'utf8');for(const field of ['uid','gid']){const anchor='\\n      '+field+': String(status.'+field+'),';if(source.split(anchor).length!==2)throw new Error('witness capture anchor differs');source=source.replace(anchor,'\\n      '+field+': [${JSON.stringify(bun)},${JSON.stringify(reader)}].includes(path) ? "1001" : String(status.'+field+'),');}return {contents:source,loader:'ts'};});`;
    for (const expected of [
      { uid: 1000, gid: 1000 },
      { uid: 1001, gid: 1000 },
      { uid: 1000, gid: 1001 },
      { uid: 1001, gid: 1001 },
    ]) {
      const preload = join(root, 'preload.ts');
      await writeFile(
        preload,
        `import {plugin} from 'bun';import {readFileSync,appendFileSync} from 'node:fs';import {controllerAccountPlugin} from ${JSON.stringify(helper)};const mapper=controllerAccountPlugin(${JSON.stringify(expected)});plugin({name:'witness-source-order',setup(build){mapper.setup({onLoad(options,callback){build.onLoad(options,async args=>{appendFileSync(${JSON.stringify(activation)},args.path+'\\n');return callback(args);});}});${layoutSetup}${observationSetup}}});`,
      );
      await withCanonicalLock(join(root, 'edge.lock'), async (descriptor) => {
        const child = Bun.spawn([process.execPath, '--preload=' + preload, entry], {
          env: { ...process.env, WBS_EDGE_STATE: root, WBS_EDGE_LOCK_FD: '3' },
          stdio: ['ignore', 'pipe', 'pipe', descriptor],
        });
        const [stdout, stderr, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        if (expected.uid === 1001 && expected.gid === 1001) {
          expect(stderr).toBe('');
          expect(code).toBe(0);
          expect(stdout).toBe('actual-reader-admitted-original-FD3\n');
        } else {
          expect(code).not.toBe(0);
          expect(stderr).toContain('invalid fixed installed controller reader');
          expect(stdout).toBe('');
        }
      });
    }
    expect((await readFile(activation, 'utf8')).split(admissionPath).length).toBe(5);

    const modeledCapture: Bun.BunPlugin = {
      name: 'bundled-modeled1001-capture',
      setup(build) {
        build.onLoad({ filter: /solver-reader-preparation\.ts$/ }, (file) => {
          if (file.path !== preparation) throw new Error('unknown witness capture module');
          let source = readFileSync(file.path, 'utf8');
          for (const field of ['uid', 'gid']) {
            const anchor = '\n      ' + field + ': String(status.' + field + '),';
            if (source.split(anchor).length !== 2)
              throw new Error('witness capture anchor differs');
            source = source.replace(
              anchor,
              '\n      ' +
                field +
                ': ' +
                JSON.stringify([bun, reader]) +
                '.includes(path) ? "1001" : String(status.' +
                field +
                '),',
            );
          }
          return { contents: source, loader: 'ts' };
        });
      },
    };
    const bundled = await Bun.build({
      entrypoints: [entry],
      target: 'bun',
      plugins: [controllerAccountPlugin({ uid: 1001, gid: 1001 }), layout, modeledCapture],
    });
    const artifact = bundled.outputs.at(0);
    if (!bundled.success || bundled.outputs.length !== 1 || artifact === undefined)
      throw new Error('modeled admission bundle failed');
    const bundledEntry = join(root, 'entry.js');
    await writeFile(bundledEntry, await artifact.text());
    await withCanonicalLock(join(root, 'edge.lock'), async (descriptor) => {
      const child = Bun.spawn([process.execPath, bundledEntry], {
        env: { ...process.env, WBS_EDGE_STATE: root, WBS_EDGE_LOCK_FD: '3' },
        stdio: ['ignore', 'pipe', 'pipe', descriptor],
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(stderr).toBe('');
      expect(code).toBe(0);
      expect(stdout).toBe('actual-reader-admitted-original-FD3\n');
    });

    const requiredPath = process.env['PATH'];
    if (requiredPath === undefined) throw new Error('witness requires PATH');
    // Shell observes actual native stat first and projects only these two owned paths in this modeled witness.
    await writeFile(
      join(commands, 'stat'),
      `#!/bin/sh
set -eu
observed=$(/usr/bin/stat "$@")
case "$4" in ${bun}|${reader}) case "$2" in %u|%g) printf '1001\\n'; exit 0;; esac;; esac
printf '%s\\n' "$observed"
`,
    );
    await chmod(join(commands, 'stat'), 0o755);
    for (const expected of [
      { uid: 1000, gid: 1000 },
      { uid: 1001, gid: 1000 },
      { uid: 1000, gid: 1001 },
      { uid: 1001, gid: 1001 },
    ]) {
      const shell = mapControllerShell(buildInstalledControllerAdmission('required', 3), expected)
        .replaceAll('/home/puni1/.local/lib/wbs-solver/bun', bun)
        .replaceAll('/home/puni1/.local/lib/wbs-solver/solver-supervisor.js', reader);
      await withCanonicalLock(join(root, 'edge.lock'), async (descriptor) => {
        const child = Bun.spawn(['sh', '-c', shell], {
          env: { ...process.env, PATH: commands + ':' + requiredPath, WBS_EDGE_STATE: root },
          stdio: ['ignore', 'pipe', 'pipe', descriptor],
        });
        const [stdout, stderr, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        expect(stdout).toBe('');
        if (expected.uid === 1001 && expected.gid === 1001) {
          expect(stderr).toBe('');
          expect(code).toBe(0);
        } else {
          expect(code).not.toBe(0);
          expect(stderr).toContain('reader preparation required');
        }
      });
    }
  } finally {
    await rm(root, { recursive: true });
  }
}, 30000);
