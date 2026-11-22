import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as planner from '../tools/owner-lint-plan.mjs';

const app = 'apps/wbs/fe-01';
const roots = [`${app}/src`, `${app}/e2e`, `${app}/e2e-packaged`, `${app}/vite.config.ts`];
const checkout = resolve(process.cwd(), '../../..');

describe('frontend lint owner discovery', () => {
  let worktree: string;

  function add(file: string, contents = ''): string {
    const path = join(worktree, file);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, contents);
    return path;
  }

  beforeEach(() => {
    worktree = mkdtempSync(join(tmpdir(), 'puni-owner-lint-'));
    symlinkSync(join(checkout, 'node_modules'), join(worktree, 'node_modules'));
    add('package.json', '{}');
    add(
      'eslint.config.mjs',
      `export default [{ ignores: ['**/*.gen.ts'] }, { files: ['**/*.{ts,tsx,mts}'] }];\n`,
    );
  });

  afterEach(() => {
    rmSync(worktree, { recursive: true, force: false });
  });

  it('discovers ordinary and future paths through the effective flat config', async () => {
    const selected = [
      add(`${app}/src/future.tsx`),
      add(`${app}/src/modules/direct.mts`),
      add(`${app}/src/modules/future-module/feature.ts`),
      add(`${app}/src/modules/new-folder/helper.js`),
      add(`${app}/e2e/browser.ts`),
      add(`${app}/e2e-packaged/package.test.ts`),
      add(`${app}/vite.config.ts`),
    ];
    add(`${app}/src/ignored.gen.ts`);
    expect((await planner.discoverFiles(worktree, roots)).sort()).toEqual(selected.sort());
  });

  it('refuses the original missing operand', async () => {
    const file = add(`${app}/src/future.tsx`);
    await expect(planner.discoverFiles(worktree, [file, `${app}/missing.ts`])).rejects.toThrow(
      'missing.ts',
    );
  });

  it('settles explicit config loads before returning a missing operand error', async () => {
    const marker = join(worktree, 'config-load-completed');
    add(
      'eslint.config.mjs',
      `
      import { writeFileSync } from 'node:fs';
      await new Promise((resolve) => setTimeout(resolve, 80));
      writeFileSync(${JSON.stringify(marker)}, 'completed');
      export default [{}];
    `,
    );
    const explicit = add(`${app}/vite.config.ts`);
    await expect(planner.discoverFiles(worktree, [explicit, `${app}/missing.ts`])).rejects.toThrow(
      'missing.ts',
    );
    expect(existsSync(marker)).toBe(true);
  });

  it('partitions the authoritative roster exactly, even across module-prefix lookalikes', () => {
    add(`${app}/src/modules/calendar/tsconfig.json`, '{}');
    const root = add(`${app}/vite.config.ts`);
    const direct = add(`${app}/src/modules/direct.mts`);
    const feature = add(`${app}/src/modules/calendar/feature.ts`);
    const unmatched = add(`${app}/src/modules/calendar-next/feature.ts`);
    const browser = add(`${app}/e2e/browser.ts`);
    const packaged = add(`${app}/e2e-packaged/package.test.ts`);
    expect(
      planner.groupFiles(worktree, [root, direct, feature, unmatched, browser, packaged]),
    ).toEqual([
      { name: 'source', files: [direct, unmatched] },
      { name: 'modules:calendar', files: [feature] },
      { name: 'browser and config', files: [root, browser, packaged] },
    ]);
  });

  it('refuses a duplicate path, an out-of-owner path, and an empty roster', () => {
    const path = add(`${app}/src/future.tsx`);
    expect(() => planner.groupFiles(worktree, [path, path])).toThrow('Duplicate lint file');
    expect(() => planner.groupFiles(worktree, [add('unrelated.ts')])).toThrow(
      'Outside frontend lint inputs',
    );
    expect(() => planner.groupFiles(worktree, [])).toThrow('Empty frontend lint roster');
  });

  it('retains exact whole-CLI argv for operator flags and never treats them as owner files', () => {
    const forwarded = ['--max-warnings', '0', 'a path.ts'];
    expect(planner.readInvocation(worktree, [...roots, '--', ...forwarded])).toEqual({
      mode: 'whole-cli',
      reason: 'forwarded arguments',
      operands: roots,
      forwarded,
    });
  });

  it('selects whole-CLI for present suppressions and serial mode for true absence', () => {
    expect(planner.readInvocation(worktree, [...roots, '--'])).toEqual({
      mode: 'serial',
      operands: roots,
      forwarded: [],
    });
    add('eslint-suppressions.json', '{}');
    expect(planner.readInvocation(worktree, [...roots, '--'])).toEqual({
      mode: 'whole-cli',
      reason: 'repository suppressions',
      operands: roots,
      forwarded: [],
    });
  });

  it('preserves explicit ignored-file warnings by returning the explicit file path', async () => {
    const ignored = add(`${app}/src/ignored.gen.ts`);
    expect(await planner.discoverFiles(worktree, [ignored])).toEqual([ignored]);
  });

  it('does not allow zero arguments to turn into discovery of the workspace', async () => {
    await expect(planner.discoverFiles(worktree, [])).rejects.toThrow('Expected lint operands');
  });

  it('refuses a mismatched installed ESLint version before discovery', async () => {
    rmSync(join(worktree, 'node_modules'));
    add('node_modules/eslint/package.json', JSON.stringify({ name: 'eslint', version: '0.0.0' }));
    await expect(planner.discoverFiles(worktree, roots)).rejects.toThrow(
      'Unsupported ESLint finder version',
    );
  });

  it('refuses an installed ESLint helper missing the required finder export', async () => {
    rmSync(join(worktree, 'node_modules'));
    add('node_modules/eslint/package.json', JSON.stringify({ name: 'eslint', version: '10.10.0' }));
    add('node_modules/eslint/lib/eslint/eslint-helpers.js', 'module.exports = {};');
    await expect(planner.discoverFiles(worktree, roots)).rejects.toThrow(
      'Missing installed ESLint discovery capability findFiles',
    );
  });

  it('refuses a missing delimiter or incorrect input anchors', () => {
    expect(() => planner.readInvocation(worktree, roots)).toThrow(
      'Expected owner lint operand delimiter',
    );
    expect(() => planner.readInvocation(worktree, [roots[0], roots[2], '--'])).toThrow(
      'Expected frontend lint directories',
    );
    expect(() => planner.readInvocation(worktree, [...roots, roots[3], '--'])).toThrow(
      'Expected unique frontend root source operands',
    );
  });
});
