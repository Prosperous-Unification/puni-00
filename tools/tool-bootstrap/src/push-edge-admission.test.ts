import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  controllerAccount,
  controllerAccountPlugin,
  copyControllerBun,
  mapControllerShell,
  mapPushSource,
  verifyControllerFile,
  writeControllerPreload,
} from '@tools/controller-account-fixture';
import { expect, test } from 'bun:test';

/** Records native staging-parent metadata before source-hook or transport launch. */
async function observeCache(path: string): Promise<void> {
  const opened = await lstat(path, { bigint: true });
  const canonical = await realpath(path);
  expect(opened.isDirectory()).toBe(true);
  expect(opened.isSymbolicLink()).toBe(false);
  expect(canonical).toBe(path);
  expect(opened.uid).toBe(BigInt(controllerAccount.uid));
  expect(opened.gid).toBe(BigInt(controllerAccount.gid));
  expect(opened.mode & 0o7777n).toBe(0o700n);
  console.log(
    JSON.stringify({
      witness: 'native provisioning cache before launch',
      path,
      canonical,
      uid: String(opened.uid),
      gid: String(opened.gid),
      mode: Number(opened.mode & 0o7777n),
      device: String(opened.dev),
      inode: String(opened.ino),
    }),
  );
}

for (const mode of ['open', 'marker', 'contended', 'wrong-parent']) {
  test(`provisioning transport stages base.yml and commits only under configure admission (${mode})`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'bootstrap-edge-'));
    const stageId = root.split('/').at(-1);
    if (stageId === undefined) throw new Error('fixture root has no basename');
    const stage = join(root, 'cache', `provision-${stageId}`, 'base.yml');
    try {
      const state = join(root, 'state');
      const commands = join(root, 'commands');
      await mkdir(state);
      await mkdir(commands);
      await writeFile(join(state, 'edge.lock'), '');
      await mkdir(join(root, 'cache'), { mode: 0o700 });
      await observeCache(join(root, 'cache'));
      await mkdir(join(root, 'reader-install'));
      await writeFile(
        join(state, 'edge-policy.json'),
        JSON.stringify({
          format: 'dependency-edge-policy',
          version: 1,
          phase: 'ordinary',
          edgeState: state,
        }),
      );
      copyControllerBun(join(root, 'reader-install/bun'));
      const compilation = await Bun.build({
        entrypoints: [
          new URL('../../tool-remote-scripts/src/solver-supervisor.ts', import.meta.url).pathname,
        ],
        target: 'bun',
        plugins: [
          controllerAccountPlugin(),
          {
            name: 'owned-push-reader',
            setup(build) {
              build.onLoad({ filter: /solver-supervisor-install-contract\.ts$/ }, async (file) => {
                const source = await Bun.file(file.path).text();
                const anchor = "export const SOLVER_READER_STATE = '/home/puni1/wbs/state';";
                if (source.split(anchor).length !== 2)
                  throw new Error('production state anchor differs');
                return {
                  contents: source.replace(
                    anchor,
                    `export const SOLVER_READER_STATE = ${JSON.stringify(state)};`,
                  ),
                  loader: 'ts',
                };
              });
            },
          },
        ],
      });
      const output = compilation.outputs.at(0);
      if (!compilation.success || compilation.outputs.length !== 1 || output === undefined)
        throw new Error('actual push reader build failed');
      await writeFile(
        join(root, 'reader-install/solver-supervisor.js'),
        new Uint8Array(await output.arrayBuffer()),
        { mode: 0o755 },
      );
      verifyControllerFile(join(root, 'reader-install/solver-supervisor.js'));
      const relocate = (source: string) =>
        mapControllerShell(source).replaceAll(
          '/home/puni1/.local/lib/wbs-solver',
          join(root, 'reader-install'),
        );

      await writeFile(join(root, 'base.yml'), 'previous base');
      await writeFile(join(root, 'candidate.yml'), 'candidate base');
      const bootstrapSource = await readFile(new URL('./bootstrap.sh', import.meta.url), 'utf8');
      const bootstrapBoundary = bootstrapSource.indexOf('log()');
      if (bootstrapBoundary < 0) throw new Error('bootstrap admission boundary missing');
      const bootstrapPrefix = relocate(bootstrapSource.slice(0, bootstrapBoundary));
      await writeFile(
        join(root, 'bootstrap.sh'),
        `${bootstrapPrefix}\nprintf bootstrap >> "$WBS_ROOT/events"\nexec 8<&-\nif [ "$FIXTURE_MODE" = marker ]; then printf closed > "$WBS_EDGE_STATE/edge-owner.json"; fi\nif [ "$FIXTURE_MODE" = contended ]; then\n  flock -n "$WBS_EDGE_STATE/edge.lock" sh -c 'touch "$WBS_EDGE_STATE/held"; attempt=0; while [ ! -e "$WBS_EDGE_STATE/release" ] && [ "$attempt" -lt 500 ]; do attempt=$((attempt + 1)); sleep 0.01; done; touch "$WBS_EDGE_STATE/stopped"' >/dev/null 2>&1 &\n  attempt=0; while [ ! -e "$WBS_EDGE_STATE/held" ] && [ "$attempt" -lt 100 ]; do attempt=$((attempt + 1)); sleep 0.01; done\n  [ -e "$WBS_EDGE_STATE/held" ] || exit 92\nfi\n`,
      );
      const configureSource = await readFile(new URL('./configure.sh', import.meta.url), 'utf8');
      const configureBoundary = configureSource.indexOf('log "installing docker + htpasswd"');
      if (configureBoundary < 0) throw new Error('configure admission boundary missing');
      const configurePrefix = relocate(configureSource.slice(0, configureBoundary));
      await writeFile(
        join(root, 'configure.sh'),
        `${configurePrefix}\nprintf configured >> "$WBS_ROOT/events"\n`,
      );
      const executable = process.execPath;
      await writeFile(
        join(commands, 'scp'),
        `#!${executable}
import {copyFile} from 'node:fs/promises';
const [source,remote]=process.argv.slice(2);
const root=process.env.WBS_ROOT;
const path=remote.slice(remote.indexOf(':')+1).replace('/home/puni1/.cache/wbs-solver',root+'/cache');
if(!path.startsWith(root+'/cache/'))throw new Error('unexpected owned upload');
await copyFile(source,path);
`,
      );
      await writeFile(
        join(commands, 'ssh'),
        `#!${executable}
const root=process.env.WBS_ROOT;
const command=process.argv[3].replaceAll('/home/puni1/.cache/wbs-solver',root+'/cache').replaceAll('/home/puni1/.local/lib/wbs-solver',root+'/reader-install').replaceAll('/home/puni1/wbs/state',root+'/state');
const payload=(await Bun.stdin.text()).replaceAll('/home/puni1/.cache/wbs-solver',root+'/cache');
const child=Bun.spawn(['sh','-c',command],{env:process.env,stdin:new Blob([payload]),stdout:'inherit',stderr:'inherit'});
process.exit(await child.exited);
`,
      );
      await writeFile(
        join(commands, 'mv'),
        '#!/bin/sh\nif flock -n "$WBS_EDGE_STATE/edge.lock" true; then echo "base commit without shared lock" >&2; exit 91; fi\nexec /usr/bin/mv "$@"\n',
      );
      await writeFile(
        join(commands, 'id'),
        `#!/bin/sh
set -eu
count=0
if [ -f "$WBS_ROOT/id.calls" ]; then read -r count < "$WBS_ROOT/id.calls"; fi
count=$((count + 1)); printf '%s\\n' "$count" > "$WBS_ROOT/id.calls"
if [ "$count" -le 5 ]; then
  printf '%s:%s' "$count" "$#" >> "$WBS_ROOT/id.arguments"
  for argument in "$@"; do printf '\\t%s' "$argument" >> "$WBS_ROOT/id.arguments"; done
  printf '\\n' >> "$WBS_ROOT/id.arguments"
fi
# The first two calls validate actual invocation ownership after the real reader.
# The third is the existing downstream root-only configure guard.
if [ "$count" -le 2 ]; then exec /usr/bin/id "$@"; fi
printf '0\\n'
`,
      );
      for (const name of ['ssh', 'scp', 'id', 'mv']) await chmod(join(commands, name), 0o755);
      const pushModule = new URL('./push.ts', import.meta.url).pathname;
      const args = {
        host: 'fixture',
        user: 'root',
        wbsUser: 'fixture',
        registryUser: 'fixture',
        bootstrapPath: join(root, 'bootstrap.sh'),
        configurePath: join(root, 'configure.sh'),
        baseComposePath: join(root, 'candidate.yml'),
        dryRun: false,
      };
      const runner = join(root, 'runner.ts');
      const preload = join(root, 'account-preload.ts');
      writeControllerPreload(
        preload,
        pushModule,
        mode === 'wrong-parent'
          ? { ...controllerAccount, uid: controllerAccount.uid + 1 }
          : controllerAccount,
      );
      await writeFile(
        runner,
        `import { buildPlan, runStep } from ${JSON.stringify(pushModule)};\nfor (const step of buildPlan(${JSON.stringify(args)}, ${JSON.stringify(stageId)})) await runStep(step, { WBS_USER: 'fixture', REGISTRY_USER: 'fixture', REGISTRY_PASS: 'fixture' });\n`,
      );
      const executablePath = process.env['PATH'];
      if (executablePath === undefined) throw new Error('fixture requires PATH');
      const child = Bun.spawn([executable, '--preload=' + preload, runner], {
        env: {
          ...process.env,
          PATH: `${commands}:${executablePath}`,
          WBS_ROOT: root,
          WBS_EDGE_STATE: state,
          FIXTURE_MODE: mode,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const stdoutTask = new Response(child.stdout).text();
      const stderr = await new Response(child.stderr).text();
      await stdoutTask;
      const code = await child.exited;
      if (mode === 'open') {
        expect(stderr).toBe('');
        expect(code).toBe(0);
        expect(await Bun.file(join(root, 'base.yml')).text()).toBe('candidate base');
        expect(await Bun.file(stage).exists()).toBe(false);
        expect(await Bun.file(join(root, 'events')).text()).toBe('bootstrapconfigured');
        expect(await readFile(join(root, 'id.calls'), 'utf8')).toBe('4\n');
        const argumentTranscript = await readFile(join(root, 'id.arguments'), 'utf8');
        expect(argumentTranscript).toBe('1:1\t-u\n2:1\t-u\n3:1\t-u\n4:1\tfixture\n');
        console.log(
          JSON.stringify({
            witness: 'bounded downstream identity model',
            nativeIdentityCalls: 2,
            configureRootGuardCall: 3,
            configureAccountExistenceCall: 4,
            argumentTranscript,
          }),
        );
      } else if (mode === 'wrong-parent') {
        expect(code).not.toBe(0);
        expect(stderr).toContain('create exclusive private inert provisioning staging');
        expect(await Bun.file(join(root, 'base.yml')).text()).toBe('previous base');
        expect(await Bun.file(stage).exists()).toBe(false);
        expect(await Bun.file(join(root, 'events')).exists()).toBe(false);
      } else {
        expect(code).not.toBe(0);
        expect(stderr).toMatch(/shared edge (owner admission closed|lock held)|step failed/);
        expect(await Bun.file(join(root, 'base.yml')).text()).toBe('previous base');
        expect(await Bun.file(stage).text()).toBe('candidate base');
        expect(await Bun.file(join(root, 'events')).text()).toBe('bootstrap');
      }
    } finally {
      await writeFile(join(root, 'state/release'), 'release');
      if (await Bun.file(join(root, 'state/held')).exists()) {
        for (
          let attempt = 0;
          attempt < 100 && !(await Bun.file(join(root, 'state/stopped')).exists());
          attempt++
        )
          await Bun.sleep(5);
        expect(await Bun.file(join(root, 'state/stopped')).exists()).toBe(true);
      }
      await rm(stage, { force: true });
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('outer provisioning refuses unprepared reader without overwriting a shared bootstrap or executing candidate code', async () => {
  const root = await mkdtemp(join(tmpdir(), 'push-private-admission-'));
  try {
    const commands = join(root, 'commands');
    const state = join(root, 'state');
    const cache = join(root, 'cache');
    for (const directory of [commands, state, cache]) await mkdir(directory, { mode: 0o700 });
    await observeCache(cache);
    await writeFile(join(state, 'edge.lock'), 'edge sentinel');
    await writeFile(join(root, 'protected-bootstrap'), 'protected bootstrap sentinel');
    await writeFile(
      join(root, 'bootstrap.sh'),
      '#!/bin/sh\nprintf called > "$FIXTURE_ROOT/candidate-called"\n',
    );
    await writeFile(join(root, 'configure.sh'), '#!/bin/sh\nexit 0\n');
    await writeFile(join(root, 'base.yml'), 'inert base');
    await writeFile(
      join(commands, 'scp'),
      `#!${process.execPath}
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
const [source, remote] = process.argv.slice(2);
const root = process.env.FIXTURE_ROOT;
const path = remote.slice(remote.indexOf(':') + 1).replace('/tmp/bootstrap.sh', root + '/protected-bootstrap').replace('/home/puni1/.cache/wbs-solver', root + '/cache').replace('/tmp/wbs-base-', root + '/old-base-');
await mkdir(dirname(path), {recursive:true});
await copyFile(source, path);
`,
    );
    await writeFile(
      join(commands, 'ssh'),
      `#!${process.execPath}
const root = process.env.FIXTURE_ROOT;
const command = process.argv[3].replaceAll('/tmp/bootstrap.sh', root + '/protected-bootstrap').replaceAll('/home/puni1/.cache/wbs-solver', root + '/cache').replaceAll('/home/puni1/.local/lib/wbs-solver', root + '/unprepared-reader').replaceAll('/home/puni1/wbs/state', root + '/state');
const child = Bun.spawn(['sh', '-c', command], { env: process.env, stdin:'inherit', stdout:'inherit', stderr:'inherit' });
process.exit(await child.exited);
`,
    );
    for (const name of ['scp', 'ssh']) await chmod(join(commands, name), 0o755);
    const runner = join(root, 'runner.ts');
    const push = new URL('./push.ts', import.meta.url).pathname;
    const preload = join(root, 'account-preload.ts');
    writeControllerPreload(preload, push);
    const args = {
      host: 'owned-fixture',
      user: 'root',
      wbsUser: 'puni1',
      registryUser: 'fixture',
      bootstrapPath: join(root, 'bootstrap.sh'),
      configurePath: join(root, 'configure.sh'),
      baseComposePath: join(root, 'base.yml'),
      dryRun: false,
    };
    await writeFile(
      runner,
      `import {buildPlan,runStep} from ${JSON.stringify(push)}; for(const step of buildPlan(${JSON.stringify(args)}, 'owned-attempt')) await runStep(step, {REGISTRY_PASS:'fixture'});`,
    );
    const child = Bun.spawn([process.execPath, '--preload=' + preload, runner], {
      env: {
        ...process.env,
        FIXTURE_ROOT: root,
        PATH: `${commands}:${String(process.env['PATH'])}`,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await new Response(child.stdout).text();
    const stderr = await new Response(child.stderr).text();
    const code = await child.exited;
    expect(await readFile(join(root, 'protected-bootstrap'), 'utf8')).toBe(
      'protected bootstrap sentinel',
    );
    expect(await Bun.file(join(root, 'candidate-called')).exists()).toBe(false);
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/fixed installed controller reader|reader preparation/);
    expect(await readFile(join(state, 'edge.lock'), 'utf8')).toBe('edge sentinel');
  } finally {
    await rm(root, { recursive: true });
  }
});

test('parent UID translation requires the exact production staging predicate', async () => {
  const source = await readFile(new URL('./push.ts', import.meta.url), 'utf8');
  expect(source).toContain('test "$controller_parent_uid" = 1000 || exit 1');
  const mapped = mapPushSource(source, { uid: 1001, gid: 1001 });
  expect(
    mapped.replace(
      'test "$controller_parent_uid" = 1001 || exit 1',
      'test "$controller_parent_uid" = 1000 || exit 1',
    ),
  ).toBe(source);
});
