import { writeFileSync } from 'node:fs';
import { cp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import { scratchAsync, scratchSync } from '@tools/test-scratch';
import { afterEach, beforeAll, beforeEach, expect, test } from 'bun:test';

import { BE_REQUIRED_ENV } from './sync';

let previousControllerState: string | undefined;
beforeEach(() => {
  previousControllerState = process.env['WBS_EDGE_STATE'];
  const controllerState = scratchSync('direct-controller-edge-');
  writeFileSync(`${controllerState}/edge.lock`, '');
  process.env['WBS_EDGE_STATE'] = controllerState;
});
afterEach(() => {
  if (previousControllerState === undefined) delete process.env['WBS_EDGE_STATE'];
  else process.env['WBS_EDGE_STATE'] = previousControllerState;
});

const root = resolve(import.meta.dir, '../../..');
let source: string;
let commands: string;
let executablePath: string;
let mcpEnv: string;
let beEnv: string;

async function requireCommand(argv: string[], cwd: string, env = process.env): Promise<string> {
  const child = Bun.spawn(argv, { cwd, env, stdout: 'pipe', stderr: 'pipe' });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`${argv.join(' ')} exited ${String(code)}: ${stderr}\n${stdout}`);
  // Proof: the styled Nx subprocess fixture fails without normalization (2026-10-23).
  return stripVTControlCharacters(stdout).trim();
}

test('captured command output preserves Nx command text across terminal styling', async () => {
  const output = await requireCommand(
    [
      process.execPath,
      '-e',
      String.raw`console.log('\u001b[2mnx run\u001b[22m wbs-mcp-01:prepare')`,
    ],
    root,
  );
  expect(output).toBe('nx run wbs-mcp-01:prepare');
});

beforeAll(async () => {
  const directory = await scratchAsync('mcp-document-sync-');
  source = join(directory, 'source');
  commands = join(directory, 'docker-commands');
  const executables = join(directory, 'bin');
  await mkdir(executables, { recursive: true });
  await mkdir(source);
  // Deliberately copy only the complete generation source closure: a new
  // source-library dependency must be included before fixture preparation works.
  for (const path of [
    'libs/wbs/domain/contracts/src',
    'libs/wbs/domain/contracts/tsconfig.json',
    'libs/wbs/domain/validation/src',
    'libs/wbs/domain/validation/tsconfig.json',
    'libs/shared/domain/validation/src',
    'libs/shared/domain/validation/tsconfig.json',
    // Proof: removing this source copy reproduced CI's real Nx prepare error:
    // Cannot find module '@shared/delivery' from delivery-shapes.ts.
    'libs/shared/domain/delivery/src',
    'libs/shared/domain/delivery/tsconfig.json',
    'apps/wbs/be-01/src/openapi',
    'apps/wbs/be-01/tsconfig.json',
    'apps/wbs/be-01/project.json',
    'apps/wbs/mcp-01/project.json',
    'apps/wbs/mcp-01/tsconfig.json',
    'tsconfig.base.json',
  ]) {
    await mkdir(dirname(join(source, path)), { recursive: true });
    await cp(join(root, path), join(source, path), { recursive: true });
  }
  await symlink(join(root, 'node_modules'), join(source, 'node_modules'));
  await writeFile(
    join(source, '.gitignore'),
    'node_modules\n.nx\napps/wbs/mcp-01/src/openapi.json\n',
  );
  await writeFile(join(source, 'package.json'), '{"name":"mcp-sync-fixture","private":true}\n');
  await writeFile(join(source, 'nx.json'), '{}\n');
  await requireCommand(['git', 'init', '-q'], source);
  await requireCommand(['git', 'config', 'user.name', 'MCP sync test'], source);
  await requireCommand(['git', 'config', 'user.email', 'mcp-sync@example.invalid'], source);
  await requireCommand(['git', 'remote', 'add', 'origin', source], source);
  await requireCommand(['git', 'add', '.'], source);
  await requireCommand(['git', 'commit', '-qm', 'baseline'], source);
  mcpEnv = join(directory, 'mcp.env');
  beEnv = join(directory, 'be.env');
  await writeFile(
    mcpEnv,
    [
      'PORT=3300',
      'MCP_AUTH_MODE=gateway',
      'WBS_API_URL=http://localhost:3100',
      'MCP_PUBLIC_URL=https://probe.invalid/mcp',
      'MCP_SIGNING_KEY_CURRENT=fixture',
      'MCP_STORE_KEY_CURRENT=fixture',
      'MCP_STORE_PATH=/data/mcp-session.sqlite',
      'MCP_ACCESS_TOKEN_TTL=3600',
      'MCP_TRUSTED_PROXY_HOPS=1',
    ].join('\n'),
    { mode: 0o600 },
  );
  await writeFile(beEnv, BE_REQUIRED_ENV.map((key) => `${key}=fixture`).join('\n'), {
    mode: 0o600,
  });
  // Only the external Docker daemon is replaced: sync performs real Git reset,
  // production fingerprints and restart decisions; a restart runs real Nx prepare.
  await writeFile(
    join(executables, 'docker'),
    `#!${process.execPath}
import {writeFileSync,  appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(commands)}, args.join(' ') + '\\n');
if (args[0] === 'restart' && args[1] === 'mcp-document-rehearsal') {
  execFileSync(${JSON.stringify(process.execPath)}, ['./node_modules/.bin/nx', 'run', 'wbs-mcp-01:prepare'], { cwd: ${JSON.stringify(source)}, env: { ...process.env, NX_DAEMON: 'false', NX_ISOLATE_PLUGINS: 'false' }, stdio: 'inherit' });
} else if (args.join(' ') === 'exec mcp-document-rehearsal curl -sS -m 5 http://127.0.0.1:3100/health') {
  // Model healthy backend convergence independently of MCP restart/preparation.
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ${JSON.stringify(source)}, encoding: 'utf8' }).trim();
  console.log(JSON.stringify({ status: 'ok', commit, bootCommit: commit }));
} else if (args.join(' ') !== 'exec mcp-document-rehearsal bun install --frozen-lockfile') {
  throw new Error('unexpected Docker operation');
}
`,
    { mode: 0o755 },
  );
  executablePath = `${executables}:${process.env['PATH'] ?? ''}`;
  await requireCommand(
    [process.execPath, './node_modules/.bin/nx', 'run', 'wbs-mcp-01:prepare'],
    source,
    {
      ...process.env,
      NX_DAEMON: 'false',
      NX_ISOLATE_PLUGINS: 'false',
    },
  );
}, 30000);

const changes = [
  ['command definitions outside http', 'libs/wbs/domain/contracts/src/commands/definitions.ts'],
  ['OpenAPI emitter', 'apps/wbs/be-01/src/openapi/emit-openapi-cli.ts'],
  ['WBS validation', 'libs/wbs/domain/validation/src/index.ts'],
  ['shared validation', 'libs/shared/domain/validation/src/core.ts'],
  ['shared delivery runtime', 'libs/shared/domain/delivery/src/observation.ts'],
  ['contract aliases', 'libs/wbs/domain/contracts/tsconfig.json'],
  ['WBS validation aliases', 'libs/wbs/domain/validation/tsconfig.json'],
  ['shared validation aliases', 'libs/shared/domain/validation/tsconfig.json'],
  ['shared delivery aliases', 'libs/shared/domain/delivery/tsconfig.json'],
] as const;

test.each(changes)(
  '%s edits restart the dev supervisor and rerun MCP preparation',
  async (_label, path) => {
    const before = await requireCommand(['git', 'rev-parse', 'HEAD'], source);
    const artifactBefore = await readFile(join(source, 'apps/wbs/mcp-01/src/openapi.json'), 'utf8');
    const original = await readFile(join(source, path), 'utf8');
    const changed = path.endsWith('definitions.ts')
      ? original.replace('Add a work item.', 'MCP devsync freshness marker. Add a work item.')
      : `${original}\n${path.endsWith('.json') ? ' ' : '// MCP preparation source freshness edit.'}\n`;
    expect(changed).not.toBe(original);
    await writeFile(join(source, path), changed);
    await requireCommand(['git', 'add', path], source);
    await requireCommand(['git', 'commit', '-qm', 'change MCP preparation source'], source);
    const target = await requireCommand(['git', 'rev-parse', 'HEAD'], source);
    await requireCommand(['git', 'reset', '--hard', '-q', before], source);
    await writeFile(commands, '');
    const invocation = `import {sync} from ${JSON.stringify(join(import.meta.dir, 'sync.ts'))}; await sync(${JSON.stringify(target)}, {sourcePath:${JSON.stringify(source)}, containerName:'mcp-document-rehearsal', statePath:${JSON.stringify(join(source, '.state'))}, rehearsal:true, mcpEnvPath:${JSON.stringify(mcpEnv)}, beEnvPath:${JSON.stringify(beEnv)}});`;
    const execution = await requireCommand([process.execPath, '-e', invocation], root, {
      ...process.env,
      PATH: executablePath,
    });
    const producer = 'nx run wbs-be-01:prepare-mcp-document';
    const completed =
      'Successfully ran target prepare for project wbs-mcp-01 and 1 task it depends on';
    expect(execution).toContain(producer);
    expect(execution).toContain(completed);
    expect(execution.indexOf(producer)).toBeLessThan(execution.indexOf(completed));
    expect(await readFile(commands, 'utf8')).toBe(
      'exec mcp-document-rehearsal bun install --frozen-lockfile\nrestart mcp-document-rehearsal\nexec mcp-document-rehearsal curl -sS -m 5 http://127.0.0.1:3100/health\n',
    );
    const artifactAfter = await readFile(join(source, 'apps/wbs/mcp-01/src/openapi.json'), 'utf8');
    if (path.endsWith('definitions.ts')) {
      expect(artifactAfter).toContain('MCP devsync freshness marker.');
      const reader = join(root, 'apps/wbs/mcp-01/src/openapi-tools.ts');
      const artifact = join(source, 'apps/wbs/mcp-01/src/openapi.json');
      const toolTable = await requireCommand(
        [
          process.execPath,
          '-e',
          `const {readDocument,toolsFromDocument}=await import(${JSON.stringify(reader)}); console.log(JSON.stringify(toolsFromDocument(readDocument(${JSON.stringify(artifact)}))));`,
        ],
        root,
      );
      expect(toolTable).toContain('MCP devsync freshness marker.');
    } else expect(artifactAfter).toBe(artifactBefore);
  },
  30000,
);

test('ordinary application source still uses watchers without a supervisor restart', async () => {
  const before = await requireCommand(['git', 'rev-parse', 'HEAD'], source);
  const path = 'apps/wbs/mcp-01/src/watchable.ts';
  await writeFile(join(source, path), 'export const watchable = true;\n');
  await requireCommand(['git', 'add', path], source);
  await requireCommand(['git', 'commit', '-qm', 'ordinary watcher edit'], source);
  const target = await requireCommand(['git', 'rev-parse', 'HEAD'], source);
  await requireCommand(['git', 'reset', '--hard', '-q', before], source);
  await writeFile(commands, '');
  const invocation = `import {sync} from ${JSON.stringify(join(import.meta.dir, 'sync.ts'))}; await sync(${JSON.stringify(target)}, {sourcePath:${JSON.stringify(source)}, containerName:'mcp-document-rehearsal', statePath:${JSON.stringify(join(source, '.state'))}, rehearsal:true, mcpEnvPath:${JSON.stringify(mcpEnv)}, beEnvPath:${JSON.stringify(beEnv)}});`;
  const execution = await requireCommand([process.execPath, '-e', invocation], root, {
    ...process.env,
    PATH: executablePath,
  });
  expect(execution).toContain('code only: nothing restarted; waiting for the watchers');
  expect(await readFile(commands, 'utf8')).toBe(
    'exec mcp-document-rehearsal curl -sS -m 5 http://127.0.0.1:3100/health\n',
  );
  expect(await readFile(join(source, path), 'utf8')).toContain('watchable = true');
}, 30000);
