import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

it('executes the supported deploy CLI through preflight, swap and smoke without lifecycle installation', async () => {
  const root = await scratchAsync('legacy-delivery-');
  const digest = `sha256:${'a'.repeat(64)}`;
  const files = [
    'dist/tool-remote-scripts/swap.js',
    'dist/tool-smoke/smoke.js',
    'apps/wbs/be-01/drizzle/0001_init/migration.sql',
  ];
  for (const relative of files) {
    await mkdir(dirname(join(root, relative)), { recursive: true });
    await writeFile(join(root, relative), 'owned fixture bytes');
  }
  await mkdir(join(root, 'commands'));
  const script = `#!/usr/bin/python3
import hashlib,json,os,sys
command=sys.argv[2]
with open(os.environ['DELIVERY_TRACE'],'a') as trace: trace.write(command+'\\n')
if command.startswith('for t in be gw fe;'):
 print('== be absent\\n== gw absent\\n== fe absent')
elif command.startswith('sha256sum '):
 for path in command.split()[1:]: print(hashlib.sha256(b'owned fixture bytes').hexdigest()+'  '+path)
elif '--preflight' in command or '--execute' in command or 'smoke.js' in command: pass
else: sys.exit(93)
`;
  await writeFile(join(root, 'commands/ssh'), script, { mode: 0o700 });
  for (const command of [
    ['git', 'init', '-q'],
    ['git', 'add', '.'],
    [
      'git',
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'fixture',
    ],
  ]) {
    const invocation = Bun.spawnSync(command, { cwd: root });
    if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  }
  const head = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root }).stdout.toString().trim();
  const bundle = join(root, 'release.json');
  await writeFile(
    bundle,
    JSON.stringify({
      gw: {
        sha: head,
        digest,
        ref: `registry.test/wbs-gw-01:${head}`,
        image: `registry.test/wbs-gw-01@${digest}`,
      },
    }),
  );
  const ignored = await readFile(join(root, '.git/info/exclude'), 'utf8');
  await writeFile(join(root, '.git/info/exclude'), `${ignored}\n/release.json\n/trace\n`);
  const child = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, 'deploy.ts'),
      'gw',
      '--execute',
      '--host=fixture',
      `--bundle=${bundle}`,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${root}/commands:${process.env['PATH'] ?? ''}`,
        DELIVERY_TRACE: join(root, 'trace'),
        REGISTRY_DEPLOYMENT_ENROLLMENT: '/absent-legacy-deployment',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [code, output, diagnostic] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ code, diagnostic }).toEqual({ code: 0, diagnostic: '' });
  expect(output).toContain('smoke passed');
  const commands = (await readFile(join(root, 'trace'), 'utf8')).trim().split('\n');
  expect(commands).toHaveLength(6);
  expect(commands[1]).toBe('sha256sum /home/puni1/wbs/bin/swap.js /home/puni1/wbs/bin/smoke.js');
  expect(commands[2]).toContain('--preflight');
  expect(commands[3]).toContain('--execute');
  expect(commands[5]).toContain('smoke.js');
});
