import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';

const workspace = fileURLToPath(new URL('../../../', import.meta.url));
const script = join(workspace, 'tools/tool-devsync/src/typecheck-modules.ts');

async function runWithModules(
  files: Readonly<Record<string, Readonly<Record<string, string>>>>,
  check: (root: string) => Promise<void>,
): Promise<void> {
  // The fixture sits inside the workspace so `bun-types` resolves; `tmp/` is untracked, so it
  // may not exist yet in a fresh checkout.
  await mkdir(join(workspace, 'tmp'), { recursive: true });
  const root = await mkdtemp(join(workspace, 'tmp/module-typecheck-'));
  try {
    for (const [name, contents] of Object.entries(files)) {
      const directory = join(root, name);
      await mkdir(directory);
      for (const [file, source] of Object.entries(contents)) {
        await writeFile(join(directory, file), source);
      }
    }
    await check(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function createModuleConfig(): string {
  return JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, types: ['bun-types'] },
    include: ['*.ts'],
  });
}

async function runModules(root: string): Promise<{ exitCode: number; output: string }> {
  const child = Bun.spawn([process.execPath, script, root], {
    cwd: workspace,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, output: `${stdout}${stderr}` };
}

test('names a discovered module missing tsconfig.json', async () => {
  await runWithModules(
    { absent: { 'module.ts': 'export const ready = true;\n' } },
    async (root) => {
      const run = await runModules(root);
      // Proof: omitting absent/tsconfig.json makes the production CLI exit nonzero and name absent.
      expect(run.exitCode).not.toBe(0);
      expect(run.output).toContain('absent');
      expect(run.output).toContain('tsconfig.json');
    },
  );
});

test('names a module its config leaves unchecked', async () => {
  await runWithModules(
    {
      unchecked: {
        'tsconfig.json': JSON.stringify({ extends: '../tsconfig.json' }),
        'module.ts': 'export const broken: string = 1;\n',
      },
    },
    async (root) => {
      // A solution-style parent, as each project root is: the module inherits its empty inputs.
      await writeFile(
        join(root, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { noEmit: true }, files: [], include: [] }),
      );
      const run = await runModules(root);
      expect(run.exitCode).not.toBe(0);
      expect(run.output).toContain('unchecked (config leaves out');
      expect(run.output).toContain('module.ts');
    },
  );
});

test('refuses a module root with no directories', async () => {
  await runWithModules({}, async (root) => {
    const run = await runModules(root);
    // Proof: removing the empty-root refusal made this test receive exit code 0.
    expect(run.exitCode).not.toBe(0);
    expect(run.output).toContain('no module directories');
  });
});

test('requires one module root argument', async () => {
  const child = Bun.spawn([process.execPath, script], {
    cwd: workspace,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  // Proof: removing the CLI argument guard made this test lose the usage diagnostic.
  expect(exitCode).not.toBe(0);
  expect(stderr).toContain('usage:');
});

test('fails on a module that breaks its contract', async () => {
  await runWithModules(
    {
      broken: {
        'tsconfig.json': createModuleConfig(),
        'contract.ts': 'export interface Contract { required: string }\n',
        'module.ts':
          "import type { Contract } from './contract';\nexport const broken: Contract = {};\n",
      },
    },
    async (root) => {
      const run = await runModules(root);
      // Proof: module.ts assigned {} to Contract and the production CLI reported TS2741.
      expect(run.exitCode).not.toBe(0);
      expect(run.output).toContain('broken');
      expect(run.output).toContain('TS2741');
    },
  );
});

test('accepts every discovered module when its contract holds', async () => {
  await runWithModules(
    {
      first: {
        'tsconfig.json': createModuleConfig(),
        'contract.ts': 'export interface Contract { required: string }\n',
        'module.ts':
          "import type { Contract } from './contract';\nexport const valid: Contract = { required: 'yes' };\n",
      },
      second: {
        'tsconfig.json': createModuleConfig(),
        'module.ts': 'export const ready: boolean = true;\n',
      },
    },
    async (root) => {
      const run = await runModules(root);
      expect(run.exitCode).toBe(0);
      expect(run.output).toContain('first');
      expect(run.output).toContain('second');
    },
  );
});
