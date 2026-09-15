import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { scratchAsync } from '@wbs/tool-test-scratch';
import { describe, expect, it } from 'bun:test';

const CHECKOUT = fileURLToPath(new URL('../../..', import.meta.url));
const PROJECT_READER = pathToFileURL(
  join(CHECKOUT, 'tools/tool-devsync/workspace-projects.mjs'),
).href;

interface LintAttempt {
  readonly code: number;
  readonly output: string;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, undefined, 2)}\n`);
}

async function writeProject(
  workspace: string,
  root: string,
  name: string,
  tags: readonly string[],
): Promise<void> {
  await mkdir(join(workspace, root, 'src'), { recursive: true });
  await writeJson(join(workspace, root, 'project.json'), {
    name,
    sourceRoot: `${root}/src`,
    projectType: root.startsWith('apps/') ? 'application' : 'library',
    tags,
    targets: {
      lint: {
        executor: 'nx:run-commands',
        options: { command: `bunx eslint ${root}/src --no-cache` },
      },
    },
  });
}

async function createLintWorkspace(): Promise<string> {
  const workspace = await scratchAsync('repo-namespacing-product-');
  await Promise.all(
    ['apps', 'libs', 'tools'].map((group) => mkdir(join(workspace, group), { recursive: true })),
  );
  await symlink(join(CHECKOUT, 'node_modules'), join(workspace, 'node_modules'), 'dir');
  await Promise.all([
    writeJson(join(workspace, 'package.json'), { name: 'product-fixture', private: true }),
    writeJson(join(workspace, 'nx.json'), { targetDefaults: { lint: { cache: false } } }),
    writeJson(join(workspace, 'tsconfig.base.json'), {
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '@probe/own': ['libs/probe/own/src/index.ts'],
          '@shared/utility': ['libs/shared/utility/src/index.ts'],
          '@wbs/core': ['libs/wbs/core/src/index.ts'],
        },
      },
    }),
  ]);
  await Promise.all([
    writeProject(workspace, 'apps/probe/app', 'probe-app', [
      'scope:app',
      'ring:adapter',
      'runtime:bun',
      'product:probe',
    ]),
    writeProject(workspace, 'libs/probe/own', 'probe-own', [
      'scope:shared',
      'ring:domain',
      'runtime:isomorphic',
      'product:probe',
    ]),
    writeProject(workspace, 'libs/shared/utility', 'shared-utility', [
      'scope:shared',
      'ring:domain',
      'runtime:isomorphic',
      'product:shared',
    ]),
    writeProject(workspace, 'libs/wbs/core', 'wbs-core', [
      'scope:shared',
      'ring:domain',
      'runtime:isomorphic',
      'product:wbs',
    ]),
    writeProject(workspace, 'tools/probe-tool', 'probe-tool', [
      'scope:infra',
      'type:scripts',
      'runtime:bun',
      'ring:adapter',
    ]),
  ]);
  await Promise.all([
    writeFile(
      join(workspace, 'apps/probe/app/src/main.ts'),
      "import '@probe/own';\nimport '@shared/utility';\n",
    ),
    writeFile(join(workspace, 'libs/probe/own/src/index.ts'), 'export const own = true;\n'),
    writeFile(join(workspace, 'libs/shared/utility/src/index.ts'), 'export const shared = true;\n'),
    writeFile(join(workspace, 'libs/wbs/core/src/index.ts'), 'export const wbs = true;\n'),
    writeFile(
      join(workspace, 'tools/probe-tool/src/forbidden.ts'),
      "import { wbs } from '@wbs/core';\nexport const tool = wbs;\n",
    ),
    writeFile(
      join(workspace, 'tools/probe-tool/src/allowed.ts'),
      "import { shared } from '@shared/utility';\nexport const tool = shared;\n",
    ),
    writeFile(
      join(workspace, 'eslint.config.mjs'),
      `
        import nx from '@nx/eslint-plugin';
        import { productConstraints, readProjects } from '${PROJECT_READER}';
        const products = productConstraints(await readProjects(import.meta.dirname));
        export default [{
          files: ['**/*.ts'],
          plugins: { '@nx': nx },
          rules: {
            '@nx/enforce-module-boundaries': ['error', {
              enforceBuildableLibDependency: false,
              allow: [],
              depConstraints: [
                {
                  sourceTag: 'ring:domain',
                  onlyDependOnLibsWithTags: ['ring:domain'],
                },
                {
                  sourceTag: 'ring:adapter',
                  onlyDependOnLibsWithTags: ['ring:domain', 'ring:adapter'],
                },
                {
                  sourceTag: 'scope:app',
                  onlyDependOnLibsWithTags: ['scope:shared'],
                },
                {
                  sourceTag: 'scope:shared',
                  onlyDependOnLibsWithTags: ['scope:shared'],
                },
                ...products,
              ],
            }],
          },
        }];
      `,
    ),
  ]);
  return workspace;
}

async function runLint(workspace: string, project: string): Promise<LintAttempt> {
  const nxCli = fileURLToPath(import.meta.resolve('nx/bin/nx.js'));
  const lint = Bun.spawn(
    [process.execPath, nxCli, 'lint', project, '--skip-nx-cache', '--output-style=stream'],
    {
      cwd: workspace,
      env: { ...process.env, NX_DAEMON: 'false', NX_ISOLATE_PLUGINS: 'false' },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(lint.stdout).text(),
    new Response(lint.stderr).text(),
    lint.exited,
  ]);
  return { code, output: `${stdout}\n${stderr}` };
}

describe('generated product lint constraints', () => {
  it('admits own/shared imports and rejects WBS from probe production and tests', async () => {
    const workspace = await createLintWorkspace();
    const control = await runLint(workspace, 'probe-app');
    expect(control.code, control.output).toBe(0);

    await writeFile(
      join(workspace, 'apps/probe/app/src/main.ts'),
      "import '@probe/own';\nimport '@shared/utility';\nimport '@wbs/core';\n",
    );
    const production = await runLint(workspace, 'probe-app');
    expect(production.code, production.output).not.toBe(0);

    await writeFile(
      join(workspace, 'apps/probe/app/src/main.ts'),
      "import '@probe/own';\nimport '@shared/utility';\n",
    );
    await writeFile(join(workspace, 'apps/probe/app/src/main.test.ts'), "import '@wbs/core';\n");
    const test = await runLint(workspace, 'probe-app');
    expect(test.code, test.output).not.toBe(0);
  }, 30_000);

  it('rejects WBS from the shared product', async () => {
    const workspace = await createLintWorkspace();
    const control = await runLint(workspace, 'shared-utility');
    expect(control.code, control.output).toBe(0);
    await writeFile(join(workspace, 'libs/shared/utility/src/index.ts'), "import '@wbs/core';\n");

    const shared = await runLint(workspace, 'shared-utility');
    expect(shared.code, shared.output).not.toBe(0);
  }, 30_000);

  it('refuses a product import from a product-less tool and admits shared', async () => {
    const workspace = await createLintWorkspace();
    const attempt = await runLint(workspace, 'probe-tool');
    // Proof: before the generated scope:infra rule existed, this uncached Nx lint accepted
    // the tool's `@wbs/core` import and exited 0, failing the assertion below on
    // `Expected: 1 · Received: 0` (2026-09-15).
    expect(attempt.code, attempt.output).toBe(1);
    expect(attempt.output, attempt.output).toContain('forbidden.ts');
    // Pin the diagnostic, not merely the failure: any other rule erroring on `forbidden.ts`
    // would otherwise keep this negative green with the generated rule gone.
    // Proof: narrowing the generated rule to `['scope:infra']` left the exit code 1 and
    // `forbidden.ts` assertions passing and failed only here, on the reported
    // `A project tagged with "scope:infra" can only depend on libs tagged with
    // "scope:infra"` (2026-09-15).
    expect(attempt.output, attempt.output).toContain(
      'can only depend on libs tagged with "scope:infra", "product:shared"',
    );
    expect(attempt.output, attempt.output).not.toContain('allowed.ts');
  }, 30_000);
});
