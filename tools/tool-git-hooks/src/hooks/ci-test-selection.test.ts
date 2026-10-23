import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, describe, expect, it } from 'bun:test';

import { selectChanges } from './ci-selection';
import { selectTestFiles } from './ci-test-selection';

const ROOT = resolve(import.meta.dir, '../../../..');
const SCRIPT = join(import.meta.dir, 'ci-test-selection.ts');
const MODULE = 'libs/website/domain/contracts';
const roots: string[] = [];

function write(root: string, path: string, content: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function git(root: string, ...args: string[]): string {
  const execution = Bun.spawnSync(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  if (execution.exitCode !== 0) throw new Error(execution.stderr.toString());
  return execution.stdout.toString().trim();
}

function commit(root: string): string {
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'change');
  return git(root, 'rev-parse', 'HEAD');
}

function workspace() {
  const root = scratchSync('ci-test-selection-');
  roots.push(root);
  symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'));
  write(root, '.gitignore', 'node_modules\n');
  write(root, 'package.json', '{"name":"selected-tests","private":true}');
  write(
    root,
    `${MODULE}/tsconfig.json`,
    JSON.stringify({
      compilerOptions: {
        noEmit: true,
        module: 'ESNext',
        moduleResolution: 'bundler',
        target: 'ESNext',
        types: ['bun-types'],
        skipLibCheck: true,
      },
      include: ['src/**/*.ts'],
    }),
  );
  write(root, `${MODULE}/src/core.ts`, 'export const core = 1;\n');
  write(root, `${MODULE}/src/middle.ts`, "export {core} from './core';\n");
  write(root, `${MODULE}/src/other.ts`, 'export const other = 2;\n');
  write(
    root,
    `${MODULE}/src/first.test.ts`,
    "import {test,expect} from 'bun:test'; import {core} from './middle'; test('FIRST',()=>{ console.log('FIRST EXECUTED'); expect(core).toBe(1); });\n",
  );
  write(
    root,
    `${MODULE}/src/second.test.ts`,
    "import {test,expect} from 'bun:test'; import {other} from './other'; test('SECOND',()=>{ console.log('SECOND EXECUTED'); expect(other).toBe(2); });\n",
  );
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Selected test proof');
  git(root, 'config', 'user.email', 'selected@example.invalid');
  const base = commit(root);
  return { root, base, head: base };
}

function modify(history: ReturnType<typeof workspace>, path: string, content?: string) {
  write(
    history.root,
    path,
    content ?? `${readFileSync(join(history.root, path), 'utf8')}\n// changed\n`,
  );
  history.head = commit(history.root);
  return history;
}

function select(history: ReturnType<typeof workspace>, project = 'website-contracts') {
  return selectTestFiles(
    history.root,
    selectChanges(history.root, history.base, history.head),
    project,
  );
}

function invoke(history: ReturnType<typeof workspace>) {
  return Bun.spawnSync(
    [process.execPath, SCRIPT, 'run', 'website-contracts', history.base, history.head],
    {
      cwd: history.root,
      env: { ...process.env, CI: 'true' },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('reviewed module file selection', () => {
  it('selects transitive static source consumers instead of the unrelated suite', () => {
    const history = modify(workspace(), `${MODULE}/src/core.ts`);
    expect(select(history)).toMatchObject({
      mode: 'files',
      files: [`${MODULE}/src/first.test.ts`],
    });
  });

  it('supports arbitrary safe test edits beyond assertion literals', () => {
    const history = modify(
      workspace(),
      `${MODULE}/src/first.test.ts`,
      "import {test,expect} from 'bun:test'; import {core} from './middle'; test('NEW CASE',()=>{ const values = [core, core + 1]; expect(values.map(value=>value*2)).toEqual([2,4]); });\n",
    );
    expect(select(history)).toMatchObject({
      mode: 'files',
      files: [`${MODULE}/src/first.test.ts`],
    });
  });

  it('retains tests importing tests and tests sharing mutable local dependencies', () => {
    const history = workspace();
    write(
      history.root,
      `${MODULE}/src/second.test.ts`,
      "import {test,expect} from 'bun:test'; import {core} from './middle'; test('SECOND',()=>expect(core).toBe(1));\n",
    );
    history.base = commit(history.root);
    modify(history, `${MODULE}/src/first.test.ts`);
    expect(select(history)).toMatchObject({
      mode: 'files',
      files: [`${MODULE}/src/first.test.ts`, `${MODULE}/src/second.test.ts`],
    });
    write(
      history.root,
      `${MODULE}/src/second.test.ts`,
      "import './first.test'; import {test,expect} from 'bun:test'; test('SECOND',()=>expect(1).toBe(1));\n",
    );
    history.base = commit(history.root);
    modify(history, `${MODULE}/src/first.test.ts`);
    expect(select(history)).toMatchObject({
      mode: 'files',
      files: [`${MODULE}/src/first.test.ts`, `${MODULE}/src/second.test.ts`],
    });
  });

  it.each(['delete', 'rename', 'fixture', 'config', 'external', 'new-file'])(
    'uses the complete module for %s impact',
    (fault) => {
      const history = workspace();
      if (fault === 'delete') rmSync(join(history.root, `${MODULE}/src/core.ts`));
      if (fault === 'rename')
        git(history.root, 'mv', `${MODULE}/src/core.ts`, `${MODULE}/src/renamed.ts`);
      if (fault === 'fixture') write(history.root, `${MODULE}/src/fixture.txt`, 'input');
      if (fault === 'config') write(history.root, `${MODULE}/tsconfig.json`, '{}');
      if (fault === 'external')
        write(history.root, 'external-input.ts', 'export const external = 1;');
      if (fault === 'new-file')
        write(history.root, `${MODULE}/src/new.ts`, 'export const added = 1;');
      history.head = commit(history.root);
      const selected = select(history);
      expect(selected.mode).toBe('module');
      expect(selected.reasons.length).toBeGreaterThan(0);
    },
  );

  it.each([
    "import {readFileSync} from 'node:fs'; readFileSync('/fixture');",
    "void import('./other');",
    "require('./other');",
    "Bun.spawn(['process']);",
    "process.env['SETTING'];",
    'globalThis.fetch;',
    "const x = new Function('return 1');",
    "import {mock} from 'bun:test'; mock.module('./other',()=>({other:0}));",
    "import {sha512} from '@noble/hashes/sha2.js'; sha512(new Uint8Array());",
  ])('falls back for unsupported dynamic/process/package capability %s', (code) => {
    const history = modify(
      workspace(),
      `${MODULE}/src/core.ts`,
      `export const core = 1;\n${code}\n`,
    );
    expect(select(history).mode).toBe('module');
  });

  it.each([
    'Math.random = () => 0;',
    'const math = Math; math.random = () => 0;',
    "import {expect as assert} from 'bun:test'; assert.extend({custom:()=>({pass:true,message:()=>''})});",
  ])('falls back for shared builtin or runner mutation %s', (code) => {
    const history = modify(
      workspace(),
      `${MODULE}/src/core.ts`,
      `export const core = 1;\n${code}\n`,
    );
    expect(select(history).mode).toBe('module');
  });

  it('checks aliased test-runner references before their hoisted import declaration', () => {
    const history = workspace();
    write(
      history.root,
      `${MODULE}/src/core.ts`,
      "import {expect as assert} from 'bun:test'; export const core = 1;\n",
    );
    history.base = commit(history.root);
    modify(
      history,
      `${MODULE}/src/core.ts`,
      "assert.extend({custom:()=>({pass:true,message:()=>''})}); import {expect as assert} from 'bun:test'; export const core = 1;\n",
    );
    expect(select(history).mode).toBe('module');
  });

  it('audits removed former global state even when import declarations stay identical', () => {
    const history = workspace();
    write(
      history.root,
      `${MODULE}/src/core.ts`,
      'export const core = 1; globalThis.Number.isSafeInteger = () => false;\n',
    );
    write(
      history.root,
      `${MODULE}/src/second.test.ts`,
      "import {test,expect} from 'bun:test'; test('FORMER STATE',()=>expect(Number.isSafeInteger(1)).toBe(false));\n",
    );
    history.base = commit(history.root);
    modify(history, `${MODULE}/src/core.ts`, 'export const core = 1;\n');
    expect(select(history).mode).toBe('module');
    const execution = invoke(history);
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stderr.toString()).toContain('FORMER STATE');
  }, 15000);

  it('rejects a prior unreviewed package import even when its declaration is unchanged', () => {
    const history = workspace();
    write(
      history.root,
      `${MODULE}/src/core.ts`,
      "import {sha512} from '@noble/hashes/sha2.js'; export const core = 1;\n",
    );
    history.base = commit(history.root);
    modify(history, `${MODULE}/src/core.ts`);
    expect(select(history).mode).toBe('module');
  });

  it('refuses an empty immutable selection', () => {
    const history = workspace();
    expect(() => select(history)).toThrow();
  });

  it('does not narrow an unreviewed module', () => {
    const history = modify(workspace(), `${MODULE}/src/core.ts`);
    expect(select(history, 'wbs-domain').mode).toBe('module');
  });

  it('falls back when a source has no proven test consumer', () => {
    const history = workspace();
    write(history.root, `${MODULE}/src/index.ts`, "export {core} from './core';\n");
    history.base = commit(history.root);
    modify(history, `${MODULE}/src/index.ts`);
    expect(select(history).mode).toBe('module');
  });

  it('falls back if any changed source is uncovered beside a covered source', () => {
    const history = workspace();
    write(history.root, `${MODULE}/src/index.ts`, "export {core} from './core';\n");
    history.base = commit(history.root);
    modify(history, `${MODULE}/src/core.ts`);
    modify(history, `${MODULE}/src/index.ts`);
    expect(select(history).mode).toBe('module');
  });

  it('falls back when removing imports would hide former shared test consumers', () => {
    const history = workspace();
    write(
      history.root,
      `${MODULE}/src/second.test.ts`,
      "import {test,expect} from 'bun:test'; import {core} from './middle'; test('SECOND',()=>expect(core).toBe(1));\n",
    );
    history.base = commit(history.root);
    modify(
      history,
      `${MODULE}/src/first.test.ts`,
      "import {test,expect} from 'bun:test'; test('FIRST',()=>expect(1).toBe(1));\n",
    );
    expect(select(history).mode).toBe('module');
  });

  it('refuses missing, unreadable and malformed source evidence', () => {
    for (const fault of ['missing', 'denied', 'syntax']) {
      const history = modify(workspace(), `${MODULE}/src/core.ts`);
      const path = join(history.root, `${MODULE}/src/middle.ts`);
      if (fault === 'missing') rmSync(path);
      if (fault === 'denied') chmodSync(path, 0o000);
      if (fault === 'syntax') writeFileSync(path, 'export const = ;');
      expect(() => select(history)).toThrow();
    }
  });

  it('refuses a missing changed selected test file through the production CLI', () => {
    const history = modify(workspace(), `${MODULE}/src/first.test.ts`);
    rmSync(join(history.root, `${MODULE}/src/first.test.ts`));
    const execution = invoke(history);
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stderr.toString()).toMatch(/ENOENT|Missing changed source evidence/);
  }, 15000);

  it('refuses empty discovered tests', () => {
    const history = workspace();
    rmSync(join(history.root, `${MODULE}/src/first.test.ts`));
    rmSync(join(history.root, `${MODULE}/src/second.test.ts`));
    history.base = commit(history.root);
    modify(history, `${MODULE}/src/core.ts`);
    expect(() => select(history)).toThrow();
  });

  it('selects actual website contracts independently', () => {
    const source = `${MODULE}/src/brief.ts`;
    const selection = selectTestFiles(
      ROOT,
      {
        schemaVersion: 1,
        base: git(ROOT, 'rev-parse', 'HEAD'),
        head: '1'.repeat(40),
        scope: 'code',
        reasons: ['planner fixture'],
        changes: [
          { status: 'M', oldMode: '100644', newMode: '100644', oldPath: source, newPath: source },
        ],
      },
      'website-contracts',
    );
    expect(selection).toMatchObject({ mode: 'files', files: [`${MODULE}/src/brief.test.ts`] });
  });
});

describe('additional selected-test production entrypoint', () => {
  it('executes literal selected tests and retains the trailing TypeScript check', () => {
    const history = modify(workspace(), `${MODULE}/src/core.ts`);
    const execution = invoke(history);
    expect(execution.exitCode, execution.stderr.toString()).toBe(0);
    expect(execution.stdout.toString()).toContain('FIRST EXECUTED');
    expect(execution.stdout.toString()).not.toContain('SECOND EXECUTED');
    write(history.root, `${MODULE}/src/other.ts`, "export const other: number = 'wrong';\n");
    const failure = invoke(history);
    expect(failure.exitCode).not.toBe(0);
    expect(failure.stdout.toString()).toContain('TS2322');
  }, 15000);

  it('propagates a failure in the selected file', () => {
    const history = modify(workspace(), `${MODULE}/src/core.ts`, 'export const core = 9;\n');
    const execution = invoke(history);
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stderr.toString()).toContain('FIRST');
    expect(execution.stderr.toString()).toContain('Selected module tests failed');
  }, 15000);

  it('refuses a selected test file that registers zero cases even when Bun exits successfully', () => {
    const history = modify(
      workspace(),
      `${MODULE}/src/first.test.ts`,
      "import {test,expect} from 'bun:test'; import {core} from './middle'; void core;\n",
    );
    const execution = invoke(history);
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stderr.toString()).toMatch(/test case|cases|testcase/);
  }, 15000);

  it('requires cases from every selected file when another selected file passes', () => {
    const history = workspace();
    write(
      history.root,
      `${MODULE}/src/second.test.ts`,
      "import {test,expect} from 'bun:test'; import {core} from './middle'; test('SECOND',()=>expect(core).toBe(1));\n",
    );
    history.base = commit(history.root);
    modify(
      history,
      `${MODULE}/src/first.test.ts`,
      "import {test,expect} from 'bun:test'; import {core} from './middle'; void core;\n",
    );
    const execution = invoke(history);
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stderr.toString()).toContain(
      'A selected file registered no passed test cases',
    );
  }, 15000);

  it('rejects a full-module fallback containing only skipped cases', () => {
    const history = workspace();
    write(
      history.root,
      `${MODULE}/src/first.test.ts`,
      "import {test,expect} from 'bun:test'; test.skip('FIRST',()=>expect(1).toBe(1));\n",
    );
    write(
      history.root,
      `${MODULE}/src/second.test.ts`,
      "import {test,expect} from 'bun:test'; test.skip('SECOND',()=>expect(1).toBe(1));\n",
    );
    history.base = commit(history.root);
    modify(
      history,
      `${MODULE}/src/core.ts`,
      "export const core = 1; void process.env['OPTION'];\n",
    );
    const execution = invoke(history);
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stderr.toString()).toContain(
      'Complete module registered no passed test cases',
    );
  }, 15000);

  it('runs the configured additional Nx entrypoint against an actual scratch workspace', () => {
    const history = workspace();
    write(history.root, 'nx.json', '{"plugins":[],"useInferencePlugins":false,"analytics":false}');
    write(
      history.root,
      `${MODULE}/project.json`,
      readFileSync(join(ROOT, `${MODULE}/project.json`), 'utf8'),
    );
    const script = 'tools/tool-git-hooks/src/hooks/ci-test-selection.ts';
    mkdirSync(dirname(join(history.root, script)), { recursive: true });
    symlinkSync(SCRIPT, join(history.root, script));
    history.base = commit(history.root);
    modify(history, `${MODULE}/src/core.ts`);
    const execution = Bun.spawnSync(
      [
        process.execPath,
        join(ROOT, 'node_modules/nx/dist/bin/nx.js'),
        'run',
        'website-contracts:test:selected',
        `--base=${history.base}`,
        `--head=${history.head}`,
        '--skipNxCache',
      ],
      {
        cwd: history.root,
        env: {
          ...process.env,
          NX_DAEMON: 'false',
          NX_ISOLATE_PLUGINS: 'false',
          NX_WORKSPACE_DATA_DIRECTORY: join(history.root, '.nx/workspace'),
        },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    expect(execution.exitCode, execution.stderr.toString()).toBe(0);
    expect(execution.stdout.toString()).toContain('FIRST EXECUTED');
    expect(execution.stdout.toString()).not.toContain('SECOND EXECUTED');
  }, 15000);

  it('runs the complete module on unsupported process input and exposes an unrelated failing test', () => {
    const history = workspace();
    write(
      history.root,
      `${MODULE}/src/second.test.ts`,
      "import {test,expect} from 'bun:test'; test('SECOND FAILURE',()=>expect(1).toBe(2));\n",
    );
    history.base = commit(history.root);
    modify(
      history,
      `${MODULE}/src/core.ts`,
      "export const core = 1;\nvoid process.env['OPTION'];\n",
    );
    const execution = invoke(history);
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stderr.toString()).toContain('SECOND FAILURE');
  }, 15000);
});
