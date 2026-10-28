import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, expect, test } from 'bun:test';

const directory = mkdtempSync(join(tmpdir(), 'mcp-startup-document-'));
const artifact = join(directory, 'openapi.json');
const entry = join(directory, 'runtime.js');
const root = resolve(import.meta.dir, '../../../..');

beforeAll(async () => {
  const compilation = await Bun.build({
    entrypoints: [join(import.meta.dir, 'openapi-tools.ts')],
    target: 'bun',
    outdir: directory,
    naming: 'runtime.js',
  });
  expect(compilation.success).toBe(true);
});
afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

function boot(): { exitCode: number; stderr: string } {
  const process = Bun.spawnSync([
    'bun',
    '-e',
    `const {readDocument, toolsFromDocument} = await import(${JSON.stringify(entry)}); toolsFromDocument(readDocument());`,
  ]);
  return { exitCode: process.exitCode, stderr: process.stderr.toString() };
}

test('default runtime refuses a missing required generated document', () => {
  rmSync(artifact, { recursive: true, force: true });
  const startup = boot();
  expect(startup.exitCode).not.toBe(0);
  expect(startup.stderr).toContain('cannot read the OpenAPI document');
});

test('default runtime refuses an unreadable generated document', () => {
  mkdirSync(artifact);
  try {
    const startup = boot();
    expect(startup.exitCode).not.toBe(0);
    expect(startup.stderr).toContain('cannot read the OpenAPI document');
  } finally {
    rmSync(artifact, { recursive: true });
  }
});

test('default runtime refuses malformed generated JSON and document shape', () => {
  for (const serialized of ['{', 'null', '{"paths":{}}']) {
    writeFileSync(artifact, serialized);
    expect(boot().exitCode).not.toBe(0);
  }
});

test('same-checkout emitter supplies the runtime document without schema compilation', () => {
  const emission = Bun.spawnSync(
    ['bun', 'apps/wbs/be-01/src/openapi/emit-openapi-cli.ts', artifact],
    { cwd: root },
  );
  expect(emission.exitCode).toBe(0);
  expect(readFileSync(artifact, 'utf8')).toContain('postApiProjectsByIdCommands');
  expect(boot()).toEqual({ exitCode: 0, stderr: '' });
  // The runtime bundle must not carry validators or the shared shape registry.
  expect(readFileSync(entry, 'utf8')).not.toContain('class Ajv');
  expect(readFileSync(entry, 'utf8')).not.toContain('function documentFromShapes');
});

test('startup survives poisoned contracts and core runtime barrels', async () => {
  const compilation = await Bun.build({
    entrypoints: [join(import.meta.dir, 'main.ts')],
    target: 'bun',
    plugins: [
      {
        name: 'poison-runtime-barrels',
        setup(build) {
          build.onLoad(
            { filter: /libs\/wbs\/(domain\/contracts|application\/core)\/src\/index\.ts$/ },
            () => {
              throw new Error('MCP startup reached an eager runtime barrel');
            },
          );
        },
      },
    ],
  });
  expect(compilation.logs).toEqual([]);
  expect(compilation.success).toBe(true);
});

// Proof: deleting the document emitter COPY from the MCP Dockerfile made this production-stage fixture fail with "Module not found".
for (const [index, dockerfile] of [
  'apps/wbs/mcp-01/Dockerfile',
  'deploy/k8s/wbs/lab/mcp-01.Dockerfile',
].entries()) {
  test(`Docker document stage generates using exactly its copied sources: ${dockerfile}`, () => {
    const stage = join(directory, `document-stage-${String(index)}`);
    mkdirSync(stage);
    symlinkSync(join(root, 'node_modules'), join(stage, 'node_modules'));
    const instructions = readFileSync(join(root, dockerfile), 'utf8')
      .split('FROM deps AS document\n')
      .at(1)
      ?.split(/\nFROM [^\n]+ AS runtime(?:\n|$)/)
      .at(0);
    if (instructions === undefined) throw new Error(`No document stage in ${dockerfile}`);
    for (const instruction of instructions.split('\n').filter((line) => line.startsWith('COPY '))) {
      const words = instruction.split(' ');
      const source = words.at(1);
      const destination = words.at(2);
      if (source === undefined || destination === undefined)
        throw new Error(`Unsupported COPY: ${instruction}`);
      const target = destination === './' ? join(stage, source) : join(stage, destination);
      mkdirSync(resolve(target, '..'), { recursive: true });
      cpSync(join(root, source), target, { recursive: true });
    }
    const command = instructions
      .split('\n')
      .find((line) => line.startsWith('RUN bun ') && line.includes('emit-openapi-cli.ts'));
    if (command === undefined) throw new Error(`No document preparation in ${dockerfile}`);
    const generation = Bun.spawnSync(
      command.slice(4).replace('/app/openapi.json', artifact).split(' '),
      { cwd: stage },
    );
    expect(generation.stderr.toString()).toBe('');
    expect(generation.exitCode).toBe(0);
  }, 10000);
}
