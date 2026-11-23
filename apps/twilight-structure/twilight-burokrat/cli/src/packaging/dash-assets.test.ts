import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

import type { CandidateEntry } from '../inventory/read-candidate';
import type { CommittedSource } from '../policy/committed-source';
import { embedDashAssets } from './dash-assets';

const workspace = resolve(import.meta.dir, '../../../../../..');
const dash = 'apps/twilight-structure/twilight-dash/cli/src/';
const format = dash + 'runs/sqlite/format.ts',
  renderer = dash + 'activation/units/render.ts';
const migrationNames = [
  '0001-run-store',
  '0002-runtime-authority',
  '0003-execution-history',
  '0004-runtime-recovery',
  '0006-runtime-write',
  '0005-identity-keys',
];
const assets = migrationNames.flatMap((name) =>
  ['migration.sql', 'down.sql'].map((file) => dash + 'runs/sqlite/migrations/' + name + '/' + file),
);
assets.push(
  dash + 'activation/units/observation.service.tmpl',
  dash + 'activation/units/observation.timer.tmpl',
);
const roots: string[] = [];
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const files = new Map(
    [format, renderer, ...assets].map((path) => [path, readFileSync(join(workspace, path))]),
  );
  const modes = new Map<string, CandidateEntry['mode']>(
    [...files.keys()].map((path) => [path, '100644']),
  );
  const source: CommittedSource = {
    readSnapshot: () => ({
      selection: { kind: 'committed', revision: 'a'.repeat(40), tree: 'b'.repeat(40) },
      entries: [...files].map(([path, bytes]): CandidateEntry => ({
        path,
        mode: modes.get(path) ?? '100644',
        blob: createHash('sha1')
          .update('blob ' + String(bytes.length) + '\0')
          .update(bytes)
          .digest('hex'),
      })),
      untracked: [],
    }),
    readFile: (path) => {
      const bytes = files.get(path);
      if (bytes === undefined) throw new Error('fixture captured asset absent: ' + path);
      return Uint8Array.from(bytes);
    },
  };
  function edit(path: string, transform: (text: string) => string) {
    const bytes = files.get(path);
    if (bytes === undefined) throw new Error('fixture module absent');
    files.set(path, Buffer.from(transform(bytes.toString())));
  }
  return { files, modes, source, edit };
}
function execute(bytes: Uint8Array, suffix: string) {
  const directory = mkdtempSync(join(tmpdir(), 'puni embedded assets outside checkout '));
  roots.push(directory);
  const entry = join(directory, 'embedded.ts');
  writeFileSync(entry, Buffer.concat([bytes, Buffer.from('\n' + suffix)]));
  const child = Bun.spawnSync([process.execPath, '--no-env-file', '--config=/dev/null', entry], {
    cwd: directory,
    env: { PATH: '/usr/bin:/bin' },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  return child.stdout.toString();
}
it('embeds all twelve captured SQL strings with exact bytes and hashes outside the checkout', () => {
  const captured = fixture();
  const bytes = embedDashAssets(captured.source, format, captured.source.readFile(format));
  const observed: unknown = JSON.parse(
    execute(
      bytes,
      'console.log(JSON.stringify(MIGRATIONS.map(m => [m.forward,m.down,m.forwardHash,m.downHash])));',
    ),
  );
  expect(observed).toEqual(
    migrationNames.toSorted().map((name) => {
      const forward = captured.source.readFile(
          dash + 'runs/sqlite/migrations/' + name + '/migration.sql',
        ),
        down = captured.source.readFile(dash + 'runs/sqlite/migrations/' + name + '/down.sql');
      return [
        Buffer.from(forward).toString(),
        Buffer.from(down).toString(),
        createHash('sha256').update(forward).digest('hex'),
        createHash('sha256').update(down).digest('hex'),
      ];
    }),
  );
});
it('preserves BOM CRLF Unicode and compiler-normalization canaries in the final built artifact', async () => {
  const captured = fixture(),
    path = assets.at(0);
  if (path === undefined) throw new Error('SQL roster absent');
  const value = '\ufeff-- /private/materialized/captured-root/ λ雪\r\nSELECT 1;\r\n';
  captured.files.set(path, Buffer.from(value));
  const transformed = embedDashAssets(captured.source, format, captured.source.readFile(format));
  const directory = mkdtempSync(join(tmpdir(), 'puni literal bundle '));
  roots.push(directory);
  const entry = join(directory, 'format.ts');
  writeFileSync(
    entry,
    Buffer.concat([transformed, Buffer.from('\nconsole.log(JSON.stringify(MIGRATION));')]),
  );
  const built = await Bun.build({
    entrypoints: [entry],
    target: 'bun',
    format: 'esm',
    minify: { whitespace: true },
  });
  expect(built.success).toBe(true);
  expect(built.outputs.length).toBe(1);
  const artifact = built.outputs.at(0);
  if (artifact === undefined) throw new Error('literal artifact absent');
  const emitted = new Uint8Array(await artifact.arrayBuffer());
  const child = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      '--eval',
      Buffer.from(emitted).toString(),
    ],
    { cwd: directory, env: { PATH: '/usr/bin:/bin' }, stdout: 'pipe', stderr: 'pipe' },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(JSON.parse(child.stdout.toString())).toBe(value);
});
it('embeds exact captured unit templates while preserving unrelated renderer expressions', () => {
  const captured = fixture();
  const original = Buffer.from(captured.source.readFile(renderer)).toString();
  const transformed = Buffer.from(
    embedDashAssets(captured.source, renderer, Buffer.from(original)),
  ).toString();
  expect(transformed).toContain('unit = unit.replaceAll(`@${name}@`, value)');
  for (const path of assets.slice(12))
    expect(transformed).toContain(
      JSON.stringify(Buffer.from(captured.source.readFile(path)).toString()),
    );
  expect(transformed).not.toContain('readFileSync(join(import.meta.dir');
});
for (const fault of ['missing', 'symlink', 'invalid-utf8'] as const)
  it('refuses ' + fault + ' captured asset before a usable bundle', () => {
    const captured = fixture(),
      path = assets.at(0);
    if (path === undefined) throw new Error('SQL roster absent');
    if (fault === 'missing') captured.files.delete(path);
    else if (fault === 'symlink') captured.modes.set(path, '120000');
    else captured.files.set(path, Buffer.from([255]));
    expect(() =>
      embedDashAssets(captured.source, format, captured.source.readFile(format)),
    ).toThrow();
  });
for (const [fault, transform] of [
  [
    'missing-call',
    (text: string) =>
      text.replace(
        "readFileSync(\n  new URL('./migrations/0001-run-store/migration.sql', import.meta.url),\n  'utf8',\n)",
        "'removed'",
      ),
  ],
  [
    'duplicate-call',
    (text: string) =>
      text +
      "\nreadFileSync(new URL('./migrations/0001-run-store/migration.sql', import.meta.url), 'utf8');",
  ],
  [
    'extra-call',
    (text: string) => text + "\nreadFileSync(new URL('./extra.sql', import.meta.url), 'utf8');",
  ],
  ['encoding', (text: string) => text.replace("'utf8'", "'hex'")],
  [
    'shadowed-reader',
    (text: string) =>
      text +
      "\nfunction unexpected(readFileSync: Function){return readFileSync(new URL('./extra.sql', import.meta.url),'utf8');}",
  ],
  [
    'shadowed-url',
    (text: string) =>
      text.replace(
        'export const SCHEMA_VERSION',
        'const URL = class {};\nexport const SCHEMA_VERSION',
      ),
  ],
  [
    'reassigned-reader',
    (text: string) => text + '\nreadFileSync = (() => "substituted") as typeof readFileSync;',
  ],
  [
    'namespace-reader',
    (text: string) => text + '\nimport * as fs from "node:fs";fs.readFileSync("/outside", "utf8");',
  ],
] as const)
  it('refuses ' + fault + ' source read contract drift', () => {
    const captured = fixture();
    captured.edit(format, transform);
    expect(() =>
      embedDashAssets(captured.source, format, captured.source.readFile(format)),
    ).toThrow();
  });
it('refuses a shadowed join binding rather than embedding an unrelated path expression', () => {
  const captured = fixture();
  captured.edit(renderer, (text) =>
    text.replace(
      'const serviceTemplate =',
      'const join = (...parts: string[]) => parts[0];\n  const serviceTemplate =',
    ),
  );
  expect(() =>
    embedDashAssets(captured.source, renderer, captured.source.readFile(renderer)),
  ).toThrow();
});
it('leaves other modules untouched without reading the captured asset roster', () => {
  const bytes = Buffer.from('export const unrelated = "readFileSync";');
  const source: CommittedSource = {
    readSnapshot() {
      throw new Error('unrelated snapshot read');
    },
    readFile() {
      throw new Error('unrelated file read');
    },
  };
  expect(embedDashAssets(source, 'unrelated.ts', bytes)).toBe(bytes);
});
it('renders both exact captured unit templates from an actual bundle outside source assets', async () => {
  const captured = fixture();
  const layout = {
    schemaVersion: 1,
    serviceUser: 'observer',
    serviceGroup: 'observer',
    runtimeDirectory: '/opt/puni-observation/v1',
    trustDirectory: '/etc/puni-observation',
    stateDirectory: '/var/lib/puni-observation',
    bunPath: '/opt/puni-observation/v1/bun',
    bunIdentity: 'a'.repeat(64),
    launcherPath: '/opt/puni-observation/v1/observation-service.mjs',
    launcherIdentity: 'b'.repeat(64),
    bunConfigPath: '/etc/puni-observation/bunfig.toml',
    bunConfigIdentity: 'c'.repeat(64),
    serviceConfigPath: '/etc/puni-observation/service.json',
    serviceConfigIdentity: 'd'.repeat(64),
    bootstrapPath: '/etc/puni-observation/bootstrap.json',
    bootstrapIdentity: 'e'.repeat(64),
    runtimePinPath: '/etc/puni-observation/runtime.sha256',
    credentialPath: '/etc/puni-observation/credential',
    wholeTickMs: 30000,
    cleanupMs: 5000,
    startTimeoutSec: 60,
    stopTimeoutSec: 10,
  };
  const directory = mkdtempSync(join(tmpdir(), 'puni captured renderer artifact '));
  roots.push(directory);
  const entry = join(directory, 'render.ts');
  const transformed = embedDashAssets(
    captured.source,
    renderer,
    captured.source.readFile(renderer),
  );
  writeFileSync(
    entry,
    Buffer.concat([
      transformed,
      Buffer.from(
        '\nconsole.log(JSON.stringify(renderObservationUnits(' + JSON.stringify(layout) + ')));',
      ),
    ]),
  );
  const built = await Bun.build({
    entrypoints: [entry],
    target: 'bun',
    format: 'esm',
    plugins: [
      {
        name: 'explicit-renderer-test-dependency',
        setup(builder) {
          builder.onResolve({ filter: /^arktype$/ }, () => ({
            path: Bun.resolveSync('arktype', workspace),
          }));
        },
      },
    ],
  });
  expect(built.success, built.logs.map(String).join('\n')).toBe(true);
  expect(built.outputs.length).toBe(1);
  const artifact = built.outputs.at(0);
  if (artifact === undefined) throw new Error('renderer bundle absent');
  const executable = join(directory, 'render.mjs');
  writeFileSync(executable, new Uint8Array(await artifact.arrayBuffer()));
  const child = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', executable],
    { cwd: directory, env: { PATH: '/usr/bin:/bin' }, stdout: 'pipe', stderr: 'pipe' },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  const expected = Buffer.from(
    captured.source.readFile(dash + 'activation/units/observation.service.tmpl'),
  ).toString();
  const substitutions = {
    SERVICE_USER: layout.serviceUser,
    SERVICE_GROUP: layout.serviceGroup,
    WORKING_DIRECTORY: layout.stateDirectory,
    READ_ONLY_PATHS: [
      layout.runtimeDirectory,
      layout.trustDirectory,
      layout.bunPath,
      layout.launcherPath,
      layout.bunConfigPath,
      layout.serviceConfigPath,
      layout.bootstrapPath,
      layout.runtimePinPath,
      layout.credentialPath,
    ].join(' '),
    STATE_DIRECTORY: layout.stateDirectory,
    RUNTIME_PIN_PATH: layout.runtimePinPath,
    BUN_PATH: layout.bunPath,
    BUN_CONFIG_PATH: layout.bunConfigPath,
    LAUNCHER_PATH: layout.launcherPath,
    SERVICE_CONFIG_PATH: layout.serviceConfigPath,
    START_TIMEOUT_SEC: '60',
    STOP_TIMEOUT_SEC: '10',
  };
  let service = expected;
  for (const [name, value] of Object.entries(substitutions))
    service = service.replaceAll('@' + name + '@', value);
  expect(JSON.parse(child.stdout.toString())).toEqual({
    service,
    timer: Buffer.from(
      captured.source.readFile(dash + 'activation/units/observation.timer.tmpl'),
    ).toString(),
    runtimePins:
      'a'.repeat(64) +
      '  ' +
      layout.bunPath +
      '\n' +
      'b'.repeat(64) +
      '  ' +
      layout.launcherPath +
      '\n' +
      'c'.repeat(64) +
      '  ' +
      layout.bunConfigPath +
      '\n' +
      'd'.repeat(64) +
      '  ' +
      layout.serviceConfigPath +
      '\n' +
      'e'.repeat(64) +
      '  ' +
      layout.bootstrapPath +
      '\n',
  });
});
for (const [fault, extra] of [
  [
    'promises-reader',
    'import{readFile}from"node:fs/promises";await readFile(new URL("./extra.sql",import.meta.url),"utf8");',
  ],
  [
    'dynamic-reader',
    'const extraFs=await import("node:fs/promises");await extraFs.readFile("/outside","utf8");',
  ],
  ['builtin-reader', 'process.getBuiltinModule("fs").readFileSync("/outside","utf8");'],
  ['bun-reader', 'await Bun.file("/outside").text();'],
  ['property-reader', 'const extraFs={readFileSync(){return"outside";}};extraFs.readFileSync();'],
  ['wrapper-reader', 'import{readExtra}from"./extra-reader";readExtra();'],
  ['export-loader', 'export{readFile as extra}from"node:fs/promises";'],
  ['require-reader', 'const extraFs=require("node:fs");extraFs.readFileSync("/outside","utf8");'],
  ['indirect-eval', 'const execute=eval;execute("outside()");'],
  ['function-loader', 'new Function("return 1")();'],
  ['global-url', 'globalThis["U"+"RL"] = class {};'],
  ['global-reader', 'global.Bun.file("/outside").text();'],
] as const)
  it('refuses ' + fault + ' outside the fixed module IO contract', () => {
    const captured = fixture();
    captured.edit(format, (text) => text + '\n' + extra);
    expect(() =>
      embedDashAssets(captured.source, format, captured.source.readFile(format)),
    ).toThrow();
  });
for (const [fault, transform] of [
  ['malformed-syntax', (text: string) => text + '\nconst ='],
  [
    'missing-fixed-import',
    (text: string) => text.replace("import { createHash } from 'node:crypto';", ''),
  ],
  [
    'aliased-reader-import',
    (text: string) => text.replace('import { readFileSync }', 'import { readFileSync as read }'),
  ],
  [
    'type-only-reader-import',
    (text: string) => text.replace('import { readFileSync }', 'import type { readFileSync }'),
  ],
  [
    'reader-import-attributes',
    (text: string) => text.replace("from 'node:fs';", "from 'node:fs' with {type:'macro'};"),
  ],
  ['extra-reader-argument', (text: string) => text.replace("  'utf8',\n)", "  'utf8', 42,\n)")],
  [
    'reader-type-arguments',
    (text: string) => text.replace('readFileSync(', 'readFileSync<string>('),
  ],
  ['nonliteral-encoding', (text: string) => text.replace("'utf8'", "(()=>'utf8')()")],
  ['sql-call-url', (text: string) => text.replace('new URL(', 'URL(')],
  [
    'sql-extra-url-argument',
    (text: string) => text.replace('import.meta.url),', 'import.meta.url, 42),'),
  ],
  ['sql-url-type-arguments', (text: string) => text.replace('new URL(', 'new URL<string>(')],
  [
    'sql-nonliteral-path',
    (text: string) =>
      text.replace(
        "'./migrations/0001-run-store/migration.sql'",
        "['./migrations/0001-run-store/migration.sql'].join('')",
      ),
  ],
  ['sql-base-expression', (text: string) => text.replace('import.meta.url', '"file:///outside"')],
  ['reader-reference-alias', (text: string) => text + '\nconst read = readFileSync;'],
] as const)
  it('refuses ' + fault + ' before captured text substitution', () => {
    const captured = fixture();
    captured.edit(format, transform);
    expect(() =>
      embedDashAssets(captured.source, format, captured.source.readFile(format)),
    ).toThrow();
  });
for (const [fault, transform] of [
  [
    'template-base-expression',
    (text: string) => text.replace('join(import.meta.dir,', "join('/outside',"),
  ],
  [
    'template-extra-path-argument',
    (text: string) =>
      text.replace("'observation.service.tmpl')", "'observation.service.tmpl', 'extra')"),
  ],
  [
    'template-type-arguments',
    (text: string) => text.replace('join(import.meta.dir,', 'join<string>(import.meta.dir,'),
  ],
  [
    'template-reader-reference',
    (text: string) => text + '\njoin = (()=>"outside") as typeof join;',
  ],
] as const)
  it('refuses ' + fault + ' before captured text substitution', () => {
    const captured = fixture();
    captured.edit(renderer, transform);
    expect(() =>
      embedDashAssets(captured.source, renderer, captured.source.readFile(renderer)),
    ).toThrow();
  });
it('refuses malformed UTF8 module bytes before source parsing', () => {
  const captured = fixture();
  expect(() =>
    embedDashAssets(
      captured.source,
      format,
      Buffer.concat([
        captured.source.readFile(format),
        Buffer.from('\n/* invalid byte in an otherwise valid comment: '),
        Uint8Array.from([255]),
        Buffer.from(' */\n'),
      ]),
    ),
  ).toThrow();
});
it('refuses unresolved compiler binding identities rather than equating absent symbols', () => {
  const captured = fixture(),
    directory = mkdtempSync(join(tmpdir(), 'puni compiler binding failure '));
  roots.push(directory);
  const compilerPath = Bun.resolveSync('typescript', workspace),
    entry = join(directory, 'symbol-control.mjs');
  const files = Object.fromEntries(
    [...captured.files].map(([path, bytes]) => [path, bytes.toString('base64')]),
  );
  const program =
    'import{mock}from"bun:test";const actual=(await import(' +
    JSON.stringify(compilerPath) +
    ')).default;const compiler={...actual,createProgram(...args){const program=Reflect.apply(actual.createProgram,actual,args);program.getTypeChecker().getSymbolAtLocation=()=>undefined;return program;}};mock.module(' +
    JSON.stringify(compilerPath) +
    ',()=>({default:compiler}));const{embedDashAssets}=await import(' +
    JSON.stringify(join(import.meta.dir, 'dash-assets.ts')) +
    ');const files=' +
    JSON.stringify(files) +
    ';const snapshot=' +
    JSON.stringify(captured.source.readSnapshot()) +
    ';const source={readSnapshot:()=>snapshot,readFile:path=>Buffer.from(files[path],"base64")};try{embedDashAssets(source,' +
    JSON.stringify(format) +
    ',source.readFile(' +
    JSON.stringify(format) +
    '));process.exitCode=9;}catch(cause){process.stdout.write(cause.message);}';
  writeFileSync(entry, program);
  const child = Bun.spawnSync([process.execPath, '--no-env-file', '--config=/dev/null', entry], {
    cwd: workspace,
    env: { PATH: '/usr/bin:/bin' },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 5000,
  });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(child.stdout.toString()).toContain('Dash asset module IO binding did not resolve');
});
