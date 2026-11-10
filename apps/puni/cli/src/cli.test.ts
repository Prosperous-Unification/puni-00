import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, expect, it } from 'bun:test';

import { main } from './entrypoint';
import type { Context } from './execute-command';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function createRoot() {
  const root = mkdtempSync(join(tmpdir(), 'puni-root-'));
  roots.push(root);
  return root;
}
function createContext(root: string) {
  const stdout: Buffer[] = [],
    stderr: Buffer[] = [];
  const context: Context = {
    installation: {
      directory: join(root, 'absent-installation'),
      entrypoint: join(root, 'absent-installation/puni.mjs'),
    },
    lookup: { directory: root, path: '/usr/bin:/bin' },
    callerDirectory: root,
    runtime: process.execPath,
    temporaryDirectory: root,
    environment: {},
    stdout: (chunk) => {
      stdout.push(Buffer.from(chunk));
    },
    stderr: (chunk) => {
      stderr.push(Buffer.from(chunk));
    },
  };
  return { context, stdout, stderr };
}
function text(chunks: readonly Buffer[]) {
  return Buffer.concat(chunks).toString();
}
const entrypoint = fileURLToPath(new URL('./entrypoint.ts', import.meta.url));

for (const alias of ['navigator', 'nav', 'n'])
  it(alias + ' executes actual planning files through the typed root', async () => {
    const root = createRoot(),
      requirements = join(root, 'requirements.md'),
      output = join(root, 'output');
    mkdirSync(output);
    writeFileSync(requirements, '## ADDED Requirements\n');
    const fixture = fileURLToPath(
      new URL(
        '../../../twilight-structure/twilight-navigator/cli/src/fixtures/plan-export.v7.json',
        import.meta.url,
      ),
    );
    const { context, stdout, stderr } = createContext(root);
    const completion = await main(
      [
        alias,
        'plan-reference',
        '--export',
        fixture,
        '--repository',
        'https://github.com/Prosperous-Unification/puni-00',
        '--change',
        'puni-root',
        '--planning-commit',
        '1'.repeat(40),
        '--source-base',
        '2'.repeat(40),
        '--requirements',
        requirements,
        '--output',
        output,
      ],
      context,
    );
    expect(completion).toEqual({ kind: 'drain', status: 0 });
    expect(text(stderr)).toBe('');
    expect(text(stdout)).toMatch(/^[0-9a-f]{64}\n$/u);
    expect(readdirSync(output).sort()).toEqual(['plan-reference.json', 'tasks.json']);
    expect(JSON.parse(readFileSync(join(output, 'plan-reference.json'), 'utf8'))).toMatchObject({
      taskCount: 3,
      planDocumentVersion: 7,
    });
  });

for (const alias of ['dash', 'd'])
  it(alias + ' forwards actual native ops refusal status through the typed root', async () => {
    const root = createRoot(),
      { context, stdout } = createContext(root);
    expect(
      await main(
        [alias, 'ops', 'job', 'status', '--config', join(root, 'absent-pool.json')],
        context,
      ),
    ).toEqual({ kind: 'drain', status: 70 });
    expect(text(stdout)).toBe('');
  });

for (const alias of ['burokrat', 'bur', 'b'])
  it(alias + ' refuses missing installed assets without a source-validator fallback', async () => {
    const root = createRoot(),
      { context, stdout, stderr } = createContext(root);
    expect(
      await main([alias, 'validate-record', 'plan-reference', join(root, 'record.json')], context),
    ).toEqual({ kind: 'drain', status: 1 });
    expect(text(stdout)).toBe('');
    expect(text(stderr)).toContain('installed package manifest is unreadable');
    expect(text(stderr)).not.toContain('SyntaxError');
  });

for (const [args, status] of [
  [[], 2],
  [['n', 'unknown'], 2],
  [['b', 'unknown'], 1],
  [['d', 'ops', 'unknown'], 64],
  [['dash', 'ops', 'release', 'plan'], 1],
] as const)
  it(
    JSON.stringify(args) + ' keeps invocation-aware usage status under misleading ambient argv',
    async () => {
      const root = createRoot(),
        { context, stdout, stderr } = createContext(root),
        previous = process.argv;
      try {
        process.argv = [process.execPath, 'wrong-entry', 'dash', 'ops', 'wrong'];
        expect(await main(args, context)).toEqual({ kind: 'drain', status });
      } finally {
        process.argv = previous;
      }
      expect(text(stdout)).toBe('');
      expect(text(stderr)).toMatch(/^error: usage: puni [^\n]+\n$/u);
    },
  );

it('keeps unexpected Navigator operation errors distinct from usage refusals', async () => {
  const root = createRoot(),
    { context, stderr } = createContext(root);
  const completion = await main(
    [
      'n',
      'receipt-to-commands',
      '--receipt',
      join(root, 'absent-receipt.json'),
      '--plan-reference',
      join(root, 'plan.json'),
      '--tasks',
      join(root, 'tasks.json'),
      '--output',
      join(root, 'output.json'),
    ],
    context,
  );
  expect(completion).toEqual({ kind: 'drain', status: 1 });
  expect(text(stderr)).toContain('receipt');
});

for (const args of [
  ['--help'],
  ['n', 'plan-reference', '--help'],
  ['b', 'validate-record', '--help'],
  ['d', 'mcp', 'token', '--help'],
  ['completion', 'zsh'],
])
  it(
    JSON.stringify(args) +
      ' discovers through the actual root without provider runtimes, clock, network or PATH',
    () => {
      const child = Bun.spawnSync(
        [
          process.execPath,
          '--no-env-file',
          '--config=/dev/null',
          '--preload',
          fileURLToPath(new URL('./testing/refuse-effects.fixture.ts', import.meta.url)),
          entrypoint,
          ...args,
        ],
        { cwd: import.meta.dir, env: {}, stdout: 'pipe', stderr: 'pipe', timeout: 10000 },
      );
      expect(child.exitCode, child.stderr.toString()).toBe(0);
      expect(child.stdout.length).toBeGreaterThan(0);
      expect(child.stderr.length).toBe(0);
    },
  );

it('awaits the selected typed operation without changing global status or reparsing ambient argv', () => {
  const root = createRoot();
  const program = [
    'import{mock}from"bun:test";',
    'const gate=Promise.withResolvers(),entered=Promise.withResolvers();let calls=0;const actual=gate.promise.then(()=>37);',
    'mock.module("@puni/dash/runtime",()=>({executeRequest:request=>{if(request.command!=="bootstrap-authority"||request.repository!=="/unused")throw new Error("wrong typed request");calls+=1;entered.resolve();return actual;},wallClock:()=>({read:()=>0}),monotonicClock:()=>({now:()=>0})}));',
    'const{main}=await import(' +
      JSON.stringify(new URL('./entrypoint.ts', import.meta.url).href) +
      ');',
    'const context=' +
      JSON.stringify({
        installation: { directory: root, entrypoint: join(root, 'puni.mjs') },
        lookup: { directory: root, path: '/usr/bin:/bin' },
        callerDirectory: root,
        runtime: process.execPath,
        temporaryDirectory: root,
        environment: {},
      }) +
      ';context.stdout=()=>{throw new Error("unexpected output");};context.stderr=()=>{throw new Error("unexpected diagnostic");};',
    'process.argv=[process.execPath,"misleading-entry","b","unsupported"];process.exitCode=19;let hasFinished=false;let report;',
    'try{const pending=main(["d","bootstrap-authority","/unused"],context).then(completion=>{hasFinished=true;return completion;});const reached=await Promise.race([entered.promise.then(()=>true),pending.then(()=>false)]);if(!reached)throw new Error("typed request did not reach selected runtime");await Promise.resolve();await Promise.resolve();const beforeRelease=hasFinished;gate.resolve();const completion=await pending;await actual;report={beforeRelease,completion,calls,globalStatus:process.exitCode};}finally{gate.resolve();await actual;process.exitCode=0;}process.stdout.write(JSON.stringify(report));',
  ].join('\n');
  const child = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
    {
      cwd: import.meta.dir,
      env: { PATH: '/usr/bin:/bin' },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 10000,
    },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(JSON.parse(child.stdout.toString())).toEqual({
    beforeRelease: false,
    completion: { kind: 'drain', status: 37 },
    calls: 1,
    globalStatus: 19,
  });
});

it('gives an absent ordinary trusted PATH its explicit refusal before installed input reads', async () => {
  const root = createRoot(),
    { context, stderr } = createContext(root);
  expect(
    await main(['b', 'template', 'list'], {
      ...context,
      lookup: { directory: root, path: undefined },
    }),
  ).toEqual({ kind: 'drain', status: 1 });
  expect(text(stderr)).toBe('error: trusted executable PATH is required for Burokrat\n');
});

for (const [mode, tool, args, status] of [
  [
    'navigator-usage',
    'navigator',
    [
      'n',
      'plan-reference',
      '--export',
      '/unused/export',
      '--repository',
      'https://example.test/repo',
      '--change',
      'fixture',
      '--planning-commit',
      '1'.repeat(40),
      '--source-base',
      '2'.repeat(40),
      '--requirements',
      '/unused/requirements',
      '--output',
      '/unused/output',
    ],
    2,
  ],
  ['ops-usage', 'dash', ['d', 'ops', 'job', 'status', '--config', '/unused/config'], 64],
  [
    'release-usage',
    'dash',
    [
      'd',
      'ops',
      'release',
      'plan',
      'website',
      '--config',
      '/unused/config',
      '--environment',
      'development',
      '--profile',
      'dev-fast',
    ],
    1,
  ],
  ['dash-usage', 'dash', ['d', 'bootstrap-authority', '/unused'], 1],
  [
    'navigator-unexpected',
    'navigator',
    [
      'n',
      'plan-reference',
      '--export',
      '/unused/export',
      '--repository',
      'https://example.test/repo',
      '--change',
      'fixture',
      '--planning-commit',
      '1'.repeat(40),
      '--source-base',
      '2'.repeat(40),
      '--requirements',
      '/unused/requirements',
      '--output',
      '/unused/output',
    ],
    1,
  ],
] as const)
  it(
    mode + ' classifies the selected public provider refusal independently of ambient argv',
    () => {
      const root = createRoot();
      // This isolated controller substitutes public facade ports, never private provider modules.
      const program = [
        'import{mock}from"bun:test";',
        'const grammar=await import(' +
          JSON.stringify('@puni/' + tool + '/grammar') +
          ');class ProviderUsageRefusal extends Error{};',
        'mock.module(' +
          JSON.stringify('@puni/' + tool + '/grammar') +
          ',()=>({...grammar,UsageRefusal:ProviderUsageRefusal}));',
        'mock.module(' +
          JSON.stringify('@puni/' + tool + '/runtime') +
          ',()=>({executeRequest:async()=>{' +
          (mode === 'navigator-unexpected'
            ? 'const cause=new Error("unexpected operation");cause.name="UsageRefusal";throw cause;'
            : 'throw new ProviderUsageRefusal("selected provider usage");') +
          '},wallClock:()=>({read:()=>0}),monotonicClock:()=>({now:()=>0})}));',
        'const{main}=await import(' +
          JSON.stringify(new URL('./entrypoint.ts', import.meta.url).href) +
          ');',
        'const context=' +
          JSON.stringify({
            installation: { directory: root, entrypoint: join(root, 'puni.mjs') },
            lookup: { directory: root, path: '/usr/bin:/bin' },
            callerDirectory: root,
            runtime: process.execPath,
            temporaryDirectory: root,
            environment: {},
          }) +
          ';let diagnostic="";context.stdout=()=>{throw new Error("unexpected output");};context.stderr=text=>{diagnostic+=text;};',
        'process.argv=[process.execPath,"misleading-entry","b","unknown"];const completion=await main(' +
          JSON.stringify(args) +
          ',context);process.stdout.write(JSON.stringify({completion,diagnostic}));',
      ].join('\n');
      const child = Bun.spawnSync(
        [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
        {
          cwd: import.meta.dir,
          env: { PATH: '/usr/bin:/bin' },
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 10000,
        },
      );
      expect(child.exitCode, child.stderr.toString()).toBe(0);
      expect(JSON.parse(child.stdout.toString())).toEqual({
        completion: { kind: 'drain', status },
        diagnostic:
          'error: ' +
          (mode === 'navigator-unexpected' ? 'unexpected operation' : 'selected provider usage') +
          '\n',
      });
    },
  );

it('imports the root executable without running ambient argv or assigning global status', () => {
  const program =
    'process.argv=[process.execPath,"other-entry","b","unknown"];process.exitCode=19;const root=await import(' +
    JSON.stringify(new URL('./entrypoint.ts', import.meta.url).href) +
    ');const status=process.exitCode;process.exitCode=0;if(typeof root.main!=="function")throw new Error("main export absent");process.stdout.write(JSON.stringify({status}));';
  const child = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
    {
      cwd: import.meta.dir,
      env: { PATH: '/usr/bin:/bin' },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 10000,
    },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(child.stderr.length).toBe(0);
  expect(child.stdout.toString()).toBe('{"status":19}');
});

it('formats an operation error as one plain line without nested cause messages', () => {
  const root = createRoot();
  const program = [
    'import{mock}from"bun:test";mock.module("@puni/navigator/runtime",()=>({executeRequest:async()=>{throw new Error("first"+String.fromCharCode(10)+"second"+String.fromCharCode(9,0)+"line",{cause:new Error("private-cause-canary")});}}));',
    'const{main}=await import(' +
      JSON.stringify(new URL('./entrypoint.ts', import.meta.url).href) +
      ');',
    'const context=' +
      JSON.stringify({
        installation: { directory: root, entrypoint: join(root, 'puni.mjs') },
        lookup: { directory: root, path: '/usr/bin:/bin' },
        callerDirectory: root,
        runtime: process.execPath,
        temporaryDirectory: root,
        environment: {},
      }) +
      ';let diagnostic="";context.stdout=()=>{throw new Error("unexpected output");};context.stderr=text=>{diagnostic+=text;};',
    'const completion=await main(["n","receipt-to-commands","--receipt","/unused/receipt","--plan-reference","/unused/plan","--tasks","/unused/tasks","--output","/unused/output"],context);process.stdout.write(JSON.stringify({completion,diagnostic}));',
  ].join('\n');
  const child = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
    {
      cwd: import.meta.dir,
      env: { PATH: '/usr/bin:/bin' },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 10000,
    },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(JSON.parse(child.stdout.toString())).toEqual({
    completion: { kind: 'drain', status: 1 },
    diagnostic: 'error: first second line\n',
  });
});
