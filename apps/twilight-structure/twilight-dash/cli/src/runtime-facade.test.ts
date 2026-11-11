import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { afterEach, expect, it } from 'bun:test';

import { parseDashCommand, UsageRefusal } from './cli-parser';
import { urlOf } from './mcp/machine-token';
import { type Context, executeRequest } from './runtime-facade';

async function readFailure(pending: Promise<unknown>): Promise<Error> {
  const cause = await pending.then(
    () => {
      throw new Error('expected operation refusal');
    },
    (cause: unknown) => cause,
  );
  if (!(cause instanceof Error)) throw new Error('expected Error refusal');
  return cause;
}

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function createRoot() {
  const root = mkdtempSync(join(tmpdir(), 'puni-dash-facade-'));
  roots.push(root);
  return root;
}
function createContext(overrides: Partial<Context> = {}) {
  const printed: string[] = [];
  const context: Context = {
    clock: { read: () => 1000 },
    monotonic: { now: () => 0 },
    send: () => {
      throw new Error('unexpected network operation');
    },
    sleep: () => {
      throw new Error('unexpected sleep');
    },
    environment: {},
    write: (text) => printed.push(text),
    helperPrefix: createLaunch(process.execPath, '/opt/puni install/puni.mjs'),
    ...overrides,
  };
  return { context, printed };
}
const credential = '0b9f6c1e-4a1d-4c5e-9a7b-000000000001';
const key = 'wbs_mk_' + credential + '.' + 'k'.repeat(43);
const issued = () =>
  Response.json({ access_token: 'facade-token', token_type: 'Bearer', expires_in: 43200 });

it('refuses typed production dev-fast before opening even an absent release configuration', async () => {
  const command = parseDashCommand([
    'ops',
    'release',
    'plan',
    'website',
    '--config',
    '/absent/dispatch.json',
    '--environment',
    'development',
    '--profile',
    'dev-fast',
  ]);
  if (command.command !== 'ops' || command.words !== 'release plan')
    throw new Error('wrong fixture command');
  const { context, printed } = createContext();
  const pending = executeRequest({ ...command, environment: 'production' }, context);
  const refusal = await readFailure(pending);
  expect(refusal).toBeInstanceOf(UsageRefusal);
  expect(refusal.message).toContain('dev-fast is development-only');
  expect(printed).toEqual([]);
});

it('refuses typed account coherence before opening its input or composing heavy effects', async () => {
  const command = parseDashCommand([
    'account-outcomes',
    '--repository',
    '/absent/repository',
    '--rate-card',
    '/absent/rates.json',
    '--output',
    '/absent/output',
    '--claude-projects',
    '/absent/logs',
    '--since',
    '2026-11-01T00:00:00Z',
    '--until',
    '2026-11-02T00:00:00Z',
  ]);
  if (command.command !== 'account-outcomes') throw new Error('wrong fixture command');
  const { context, printed } = createContext();
  const refusal = await readFailure(
    executeRequest({ ...command, claudeProjects: [], codexSessions: [] }, context),
  );
  expect(refusal).toBeInstanceOf(UsageRefusal);
  expect(refusal.message).toContain('at least one --claude-projects or --codex-sessions');
  expect(printed).toEqual([]);
});

it('executes typed MCP with its supplied ports and only the fresh header map', async () => {
  const root = createRoot(),
    path = join(root, 'agent.key');
  writeFileSync(path, key, { mode: 0o600 });
  let requests = 0;
  const { context, printed } = createContext({
    send: (input, init) => {
      requests += 1;
      expect(urlOf(input)).toBe('https://wbs.example/mcp/oauth/token');
      expect(new Headers(init?.headers).get('authorization')).toBe(
        'Basic ' + btoa(credential + ':' + key),
      );
      return Promise.resolve(issued());
    },
  });
  const status = await executeRequest(
    parseDashCommand(['mcp', 'token', '--resource', 'https://wbs.example/mcp', '--key-file', path]),
    context,
  );
  expect(status).toBe(0);
  expect(requests).toBe(1);
  expect(printed).toEqual(['{"Authorization":"Bearer facade-token"}\n']);
});

it('generates pool helpers through the selected protected PUNI prefix and canonical dash namespace', async () => {
  const root = createRoot(),
    file = join(root, 'pool.json'),
    store = join(root, 'store');
  writeFileSync(
    file,
    JSON.stringify({
      format: 'wbs-agent-pool-keys',
      version: 1,
      organizationId: 'org-a',
      authorizationServer: 'https://wbs.example/mcp/oauth',
      mcpResource: 'https://wbs.example/mcp',
      poolId: 'pool-a',
      name: 'fleet',
      expiresAt: null,
      issuedAt: 1800000000000,
      agents: [{ personId: 'person-a', personName: 'agent', credentialId: credential, key }],
    }),
    { mode: 0o600 },
  );
  let requests = 0;
  const entered = Promise.withResolvers<undefined>();
  const gate = Promise.withResolvers<Response>();
  const { context, printed } = createContext({
    send: () => {
      requests += 1;
      entered.resolve(undefined);
      return gate.promise;
    },
  });
  let hasFinished = false;
  const pending = executeRequest(
    parseDashCommand(['pool', 'import', file, '--store', store]),
    context,
  ).then((status) => {
    hasFinished = true;
    return status;
  });
  await entered.promise;
  await Promise.resolve();
  await Promise.resolve();
  const finishedBeforeNetwork = hasFinished;
  gate.resolve(issued());
  expect(await pending).toBe(0);
  const helper = join(store, 'pool-pool-a/person-a.mcp.json');
  // Even an omitted-await mutant must finish its actual native file writes before fixture cleanup.
  for (let attempt = 0; attempt < 100 && !existsSync(helper); attempt += 1) await Bun.sleep(5);
  const text = readFileSync(helper, 'utf8');
  expect(finishedBeforeNetwork).toBe(false);
  expect(requests).toBe(1);
  for (const word of [
    '/usr/bin/env',
    'BUN_OPTIONS',
    '--no-env-file',
    '--config=/dev/null',
    process.execPath,
    '/opt/puni install/puni.mjs',
    "'dash' 'mcp' 'token'",
  ])
    expect(text).toContain(word);
  expect(printed.join('')).toContain('imported pool fleet');
  expect(printed.join('')).not.toContain(key);
});

it('returns the actual release adapter status while retaining its inherited native IO contract', async () => {
  const root = createRoot(),
    adapter = join(root, 'adapter.ts'),
    configuration = join(root, 'target.json'),
    dispatch = join(root, 'dispatch.json'),
    receipt = join(root, 'invocation.json');
  writeFileSync(
    adapter,
    'await Bun.write(' +
      JSON.stringify(receipt) +
      ',JSON.stringify(process.argv.slice(2)));process.exit(37);',
  );
  writeFileSync(configuration, '{}', { mode: 0o600 });
  writeFileSync(
    dispatch,
    JSON.stringify({ schemaVersion: 1, targets: { website: { adapter, configuration } } }),
    { mode: 0o600 },
  );
  const { context, printed } = createContext();
  expect(
    await executeRequest(
      parseDashCommand([
        'ops',
        'release',
        'plan',
        'website',
        '--config',
        dispatch,
        '--environment',
        'development',
        '--profile',
        'dev-fast',
        '--ref',
        'feature/name',
      ]),
      context,
    ),
  ).toBe(37);
  expect(JSON.parse(readFileSync(receipt, 'utf8'))).toEqual([
    'plan',
    '--config',
    configuration,
    '--environment',
    'development',
    '--profile',
    'dev-fast',
    '--ref',
    'feature/name',
  ]);
  expect(printed).toEqual(['[DEV-FAST] plan website environment=development\n']);
});

it('forwards actual heavy ops status without reparsing the typed command', async () => {
  const root = createRoot();
  const { context } = createContext();
  expect(
    await executeRequest(
      parseDashCommand(['ops', 'job', 'status', '--config', join(root, 'absent.json')]),
      context,
    ),
  ).toBe(70);
});

it('keeps the actual typed MCP path import-safe against the heavy command graph', () => {
  const root = createRoot(),
    path = join(root, 'agent.key');
  writeFileSync(path, key, { mode: 0o600 });
  const source = new URL('./runtime-facade.ts', import.meta.url).href;
  const program = [
    'Bun.plugin({name:"refuse-heavy",setup(build){build.onLoad({filter:/twilight-dash\\/cli\\/src\\/cli\\.ts$/},()=>{throw new Error("MCP loaded heavy graph");});}});',
    'const{executeRequest}=await import(' + JSON.stringify(source) + ');',
    'process.argv=[process.execPath,"wrong-entry","ops","unknown"];',
    'const status=await executeRequest({command:"mcp",subcommand:"token",resource:"https://wbs.example/mcp",credential:{flag:"--key-file",value:' +
      JSON.stringify(path) +
      '}}, {clock:{read:()=>{throw new Error("unused wall clock");}},monotonic:{now:()=>0},send:async()=>Response.json({access_token:"light-token",token_type:"Bearer"}),sleep:async()=>{throw new Error("unused sleep");},environment:{},write:text=>process.stdout.write(text),helperPrefix:["/opt/puni"]});process.exitCode=status;',
  ].join('\n');
  const child = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
    {
      cwd: import.meta.dir,
      env: { PATH: '/usr/bin:/bin' },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
    },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(child.stdout.toString()).toBe('{"Authorization":"Bearer light-token"}\n');
  expect(child.stderr.length).toBe(0);
});
