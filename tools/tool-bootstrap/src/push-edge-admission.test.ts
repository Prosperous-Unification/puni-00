import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

for (const mode of ['open', 'marker', 'contended']) {
  test(`provisioning transport stages base.yml and commits only under configure admission (${mode})`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'bootstrap-edge-'));
    const stageId = root.split('/').at(-1);
    if (stageId === undefined) throw new Error('fixture root has no basename');
    const stage = `/tmp/wbs-base-${stageId}.yml`;
    try {
      const state = join(root, 'state');
      const commands = join(root, 'commands');
      await mkdir(state);
      await mkdir(commands);
      await writeFile(join(state, 'edge.lock'), '');
      await writeFile(join(root, 'base.yml'), 'previous base');
      await writeFile(join(root, 'candidate.yml'), 'candidate base');
      const bootstrapSource = await readFile(new URL('./bootstrap.sh', import.meta.url), 'utf8');
      const bootstrapBoundary = bootstrapSource.indexOf('log()');
      if (bootstrapBoundary < 0) throw new Error('bootstrap admission boundary missing');
      const bootstrapPrefix = bootstrapSource.slice(0, bootstrapBoundary);
      await writeFile(
        join(root, 'bootstrap.sh'),
        `${bootstrapPrefix}\nprintf bootstrap >> "$WBS_ROOT/events"\nexec 8<&-\nif [ "$FIXTURE_MODE" = marker ]; then printf closed > "$WBS_EDGE_STATE/edge-owner.json"; fi\nif [ "$FIXTURE_MODE" = contended ]; then\n  flock -n "$WBS_EDGE_STATE/edge.lock" sh -c 'touch "$WBS_EDGE_STATE/held"; attempt=0; while [ ! -e "$WBS_EDGE_STATE/release" ] && [ "$attempt" -lt 500 ]; do attempt=$((attempt + 1)); sleep 0.01; done; touch "$WBS_EDGE_STATE/stopped"' >/dev/null 2>&1 &\n  attempt=0; while [ ! -e "$WBS_EDGE_STATE/held" ] && [ "$attempt" -lt 100 ]; do attempt=$((attempt + 1)); sleep 0.01; done\n  [ -e "$WBS_EDGE_STATE/held" ] || exit 92\nfi\n`,
      );
      const configureSource = await readFile(new URL('./configure.sh', import.meta.url), 'utf8');
      const configureBoundary = configureSource.indexOf('log "installing docker + htpasswd"');
      if (configureBoundary < 0) throw new Error('configure admission boundary missing');
      const configurePrefix = configureSource.slice(0, configureBoundary);
      await writeFile(
        join(root, 'configure.sh'),
        `${configurePrefix}\nprintf configured >> "$WBS_ROOT/events"\n`,
      );
      const executable = process.execPath;
      await writeFile(
        join(commands, 'scp'),
        `#!${executable}\nimport { copyFile } from 'node:fs/promises';\nconst [source, destination] = process.argv.slice(2);\nconst path = destination.slice(destination.indexOf(':') + 1);\nconst root = process.env.WBS_ROOT;\nconst target = path === '/tmp/bootstrap.sh' ? root + '/uploaded-bootstrap.sh' : path === '/home/puni1/wbs/base.yml' ? root + '/base.yml' : path;\nawait copyFile(source, target);\n`,
      );
      await writeFile(
        join(commands, 'ssh'),
        `#!${executable}\nconst root = process.env.WBS_ROOT;\nconst command = process.argv[3];\nconst child = Bun.spawn(command.includes('/tmp/bootstrap.sh') ? ['sh', root + '/uploaded-bootstrap.sh'] : ['sh', '-s'], { env: process.env, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' });\nprocess.exit(await child.exited);\n`,
      );
      await writeFile(
        join(commands, 'mv'),
        '#!/bin/sh\nif flock -n "$WBS_EDGE_STATE/edge.lock" true; then echo "base commit without shared lock" >&2; exit 91; fi\nexec /usr/bin/mv "$@"\n',
      );
      await writeFile(join(commands, 'id'), '#!/bin/sh\nprintf "0\\n"\n');
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
      await writeFile(
        runner,
        `import { buildPlan, runStep } from ${JSON.stringify(pushModule)};\nfor (const step of buildPlan(${JSON.stringify(args)}, ${JSON.stringify(stageId)})) await runStep(step, { WBS_USER: 'fixture', REGISTRY_USER: 'fixture', REGISTRY_PASS: 'fixture' });\n`,
      );
      const executablePath = process.env['PATH'];
      if (executablePath === undefined) throw new Error('fixture requires PATH');
      const child = Bun.spawn([executable, runner], {
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
      const stderr = await new Response(child.stderr).text();
      const code = await child.exited;
      if (mode === 'open') {
        expect(stderr).toBe('');
        expect(code).toBe(0);
        expect(await Bun.file(join(root, 'base.yml')).text()).toBe('candidate base');
        expect(await Bun.file(stage).exists()).toBe(false);
        expect(await Bun.file(join(root, 'events')).text()).toBe('bootstrapconfigured');
      } else {
        expect(code).not.toBe(0);
        expect(stderr).toMatch(/shared edge (owner admission closed|lock held)/);
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
