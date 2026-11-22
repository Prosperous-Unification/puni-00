import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const app = 'apps/wbs/fe-01';
const owner = resolve(process.cwd(), '../../..', app);
const launcher = join(owner, 'tools/owner-lint.mjs');
const operands = [`${app}/src`, `${app}/e2e`, `${app}/e2e-packaged`, `${app}/vite.config.ts`];
const sourceFile = `${app}/src/ordinary.ts`;
const browserFile = `${app}/e2e/browser.ts`;

interface Exit {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

// This deliberately small installed-package substitute tests child plumbing. The real
// ESLint formatter and project policies have independent installed-CLI checks.
const cli = String.raw`
const fs = require('node:fs');
const cp = require('node:child_process');
const args = process.argv.slice(2);
const mode = process.env.PUNI_FIXTURE_CASE;
const eventLog = process.env.PUNI_FIXTURE_EVENTS;
const report = process.env.PUNI_FE_LINT_REPORT;
const group = args.some((arg) => arg.endsWith('/src/ordinary.ts')) ? 'source' : 'browser';
const record = (kind) => fs.appendFileSync(eventLog, kind + ':' + process.pid + '\n');
if (!report) {
  record('whole');
  console.log(JSON.stringify(args));
  process.exitCode = mode === 'legacy-config' ? 2 : 0;
} else {
  record(group);
  const files = args.slice(args.indexOf('--') + 1);
  console.log('started ' + group);
  if (mode === 'cancel') {
    const cutoff = setTimeout(() => { record('self-timeout'); process.exit(7); }, 2000);
    process.on('SIGTERM', () => {
      clearTimeout(cutoff);
      setTimeout(() => { record('stopped'); process.exit(0); }, 70);
    });
    const files = args.slice(args.indexOf('--') + 1);
    fs.writeFileSync(report, JSON.stringify({ files: files.map((filePath) => ({
      filePath, errorCount: 0, warningCount: 0, fatalErrorCount: 0
    })) }), { flag: 'wx' });
    record('ready');
  } else if (mode === 'signal') {
    process.kill(process.pid, 'SIGTERM');
  } else if (mode === 'config' || (mode === 'lint-then-config' && group === 'browser')) {
    console.error('fixture configuration error');
    process.exitCode = 2;
  } else {
    const lint = (mode === 'lint-first' || mode === 'lint-then-config') && group === 'source' ||
      mode === 'lint-last' && group === 'browser';
    let rows = files.map((filePath) => ({ filePath, errorCount: lint ? 1 : 0,
      warningCount: 0, fatalErrorCount: 0 }));
    const payload = () => JSON.stringify({ files: rows }) + '\n';
    if (mode === 'dropped') rows = [];
    if (mode === 'duplicate') rows.push(rows[0]);
    if (mode === 'wrong-file') rows[0].filePath = '/unplanned.ts';
    if (mode === 'bad-count') rows[0].errorCount = -1;
    if (mode === 'hidden-findings') rows[0].errorCount = 1;
    if (mode === 'symlink') {
      fs.writeFileSync(report + '-payload', payload(), { flag: 'wx' });
      fs.symlinkSync(report + '-payload', report);
    } else if (mode !== 'missing' && mode !== 'missing-lint') {
      fs.writeFileSync(report, mode === 'truncated' ? '{"files":[' :
        mode === 'bad-shape' ? '{"files":true}' : mode === 'large' ? payload() + ' '.repeat(4 * 1024 * 1024) : payload(), { flag: 'wx' });
    }
    if (mode === 'late' && group === 'source') {
      cp.spawn(process.execPath, ['-e', "setTimeout(() => console.log('late stream finished'), 120)"],
        { stdio: ['ignore', 1, 2] }).unref();
    }
    if (mode === 'graph-skip') {
      process.stdout.write('No cached Project');
      setTimeout(() => process.stdout.write('\x1b[3'), 10);
      setTimeout(() => process.stdout.write('3mGraph is available. The rule will be skipped.\x1b[0m\n'), 25);
    }
    process.exitCode = lint || mode === 'missing-lint' ? 1 : 0;
  }
}
`;

describe('frontend lint child protocol', () => {
  let fixture: string;
  let cwd: string;
  let events: string;
  const active = new Map<ChildProcess, Promise<Exit>>();

  function add(file: string, contents: string): void {
    const path = join(cwd, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }

  function launch(case_: string, forwarded: readonly string[] = []) {
    const child = spawn(process.execPath, [launcher, ...operands, '--', ...forwarded], {
      cwd,
      env: { ...process.env, PUNI_FIXTURE_CASE: case_, PUNI_FIXTURE_EVENTS: events },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const exit = watch(child);
    active.set(child, exit);
    child.once('close', () => active.delete(child));
    return { child, exit };
  }

  function watch(child: ChildProcess): Promise<Exit> {
    return new Promise((complete, reject) => {
      let stdout = '';
      let stderr = '';
      child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.once('error', reject);
      child.once('close', (code, signal) => {
        complete({ code, signal, stdout, stderr });
      });
    });
  }

  function trace(): string[] {
    return existsSync(events) ? readFileSync(events, 'utf8').trim().split('\n') : [];
  }

  function groups(): string[] {
    return trace()
      .filter((line) => /^(source|browser|whole):/.test(line))
      .map((line) => line.split(':')[0]);
  }

  beforeEach(() => {
    fixture = mkdtempSync(join(tmpdir(), 'puni-fe-lint-protocol-'));
    cwd = join(fixture, 'workspace');
    events = join(fixture, 'events');
    add('package.json', '{}');
    add('node_modules/eslint/package.json', '{"name":"eslint","version":"10.10.0"}');
    add('node_modules/eslint/bin/eslint.js', cli);
    add(
      'node_modules/eslint/lib/options.js',
      'module.exports = () => ({parse: (args) => ({_:args.slice(2)})});',
    );
    add(
      'node_modules/eslint/lib/shared/translate-cli-options.js',
      'module.exports = async () => ({});',
    );
    add(
      'node_modules/eslint/lib/services/warning-service.js',
      'exports.WarningService = class {};',
    );
    add(
      'node_modules/eslint/lib/eslint/eslint-helpers.js',
      `
      const { join } = require('node:path');
      const { renameSync } = require('node:fs');
      exports.createDefaultConfigs = () => [];
      exports.createLinter = () => ({});
      exports.processOptions = (options) => ({ ...options, globInputPaths: true, errorOnUnmatchedPattern: true });
      exports.createConfigLoader = () => ({ loadConfigArrayForFile: async () => {} });
      exports.findFiles = async ({ cwd }) => {
        if (process.env.PUNI_FIXTURE_CASE === 'spawn-error') renameSync(cwd, cwd + '-moved');
        if (process.env.PUNI_FIXTURE_CASE === 'empty') return [];
        if (process.env.PUNI_FIXTURE_CASE === 'cancel-planning') {
          require('node:fs').appendFileSync(process.env.PUNI_FIXTURE_EVENTS, 'planning:' + process.pid + '\\n');
          await new Promise((done) => setTimeout(done, 160));
        }
        return [join(cwd, ${JSON.stringify(sourceFile)}), join(cwd, ${JSON.stringify(browserFile)})];
      };
    `,
    );
    add(sourceFile, 'export const selected = true;');
    add(browserFile, 'export const selected = true;');
    add(operands[3], 'export const selected = true;');
  });

  afterEach(async () => {
    for (const [child, exit] of active) {
      if (!child.killed) child.kill('SIGTERM');
      await exit;
    }
    rmSync(fixture, { recursive: true, force: false });
  });

  it('settles output close before starting the next child', async () => {
    const observed = await launch('late').exit;
    expect(observed.code, observed.stderr).toBe(0);
    expect(groups()).toEqual(['source', 'browser']);
    expect(observed.stdout).toContain('late stream finished\nstarted browser');
  });

  it.each([
    'missing',
    'missing-lint',
    'truncated',
    'bad-shape',
    'dropped',
    'duplicate',
    'wrong-file',
    'bad-count',
    'hidden-findings',
    'symlink',
    'large',
  ])('fails closed on a %s child report', async (case_) => {
    const observed = await launch(case_).exit;
    expect(observed.code, observed.stderr).toBe(2);
    const reason =
      new Map([
        ['bad-shape', 'Invalid coverage report shape'],
        ['large', 'Invalid coverage report file'],
      ]).get(case_) ?? 'coverage';
    expect(observed.stderr).toContain(reason);
    expect(groups()).toEqual(['source']);
    expect(observed.stderr).not.toContain('whole-cli');
  });

  it.each(['lint-first', 'lint-last'])(
    'collects ordinary %s findings across both groups',
    async (case_) => {
      const observed = await launch(case_).exit;
      expect(observed.code, observed.stderr).toBe(1);
      expect(groups()).toEqual(['source', 'browser']);
    },
  );

  it.each(['config', 'lint-then-config'])(
    'retains native status 2 for %s without requiring a report',
    async (case_) => {
      const observed = await launch(case_).exit;
      expect(observed.code, observed.stderr).toBe(2);
      expect(observed.stderr).toContain('fixture configuration error');
      expect(observed.stderr).not.toContain('coverage');
      expect(groups()).toEqual(case_ === 'config' ? ['source'] : ['source', 'browser']);
    },
  );

  it('refuses the split colored Nx graph-skip warning even with a successful report', async () => {
    const observed = await launch('graph-skip').exit;
    expect(observed.code, observed.stderr).toBe(2);
    expect(observed.stderr).toContain('Nx graph policy was skipped');
    expect(groups()).toEqual(['source']);
  });

  it('preserves a real child signal as a signal failure', async () => {
    const observed = await launch('signal').exit;
    expect(observed.code, observed.stderr).toBe(143);
    expect(observed.stderr).toContain('SIGTERM');
    expect(groups()).toEqual(['source']);
  });

  it('forwards cancellation, waits for the child to terminate, and never dispatches the next group', async () => {
    const { child, exit } = launch('cancel');
    const atLauncherExit = new Promise<string[]>((done) => {
      child.once('exit', () => {
        done(trace());
      });
    });
    await vi.waitFor(
      () => {
        expect(trace().some((line) => line.startsWith('ready:'))).toBe(true);
      },
      { timeout: 5000 },
    );
    expect(child.kill('SIGTERM')).toBe(true);
    const observed = await exit;
    expect(observed.code, observed.stderr).toBe(143);
    expect(groups()).toEqual(['source']);
    const atExit = await atLauncherExit;
    expect(atExit.some((line) => line.startsWith('stopped:'))).toBe(true);
    expect(atExit.some((line) => line.startsWith('self-timeout:'))).toBe(false);
  });

  it('does not dispatch after a signal during file planning', async () => {
    const { child, exit } = launch('cancel-planning');
    await vi.waitFor(
      () => {
        expect(trace().some((line) => line.startsWith('planning:'))).toBe(true);
      },
      { timeout: 5000 },
    );
    expect(child.kill('SIGTERM')).toBe(true);
    const observed = await exit;
    expect(observed.code, observed.stderr).toBe(143);
    expect(groups()).toEqual([]);
  });

  it('reports spawn failure without reaching the next group', async () => {
    const observed = await launch('spawn-error').exit;
    expect(observed.code, observed.stderr).toBe(2);
    expect(observed.stderr).toContain('spawn');
    expect(groups()).toEqual([]);
  });

  it('does not start ESLint when the roster is empty', async () => {
    const observed = await launch('empty').exit;
    expect(observed.code, observed.stderr).toBe(2);
    expect(observed.stderr).toContain('Empty frontend lint roster');
    expect(groups()).toEqual([]);
  });

  it('passes operator options unchanged in visible whole-CLI mode', async () => {
    const forwarded = ['--config', 'option with spaces.mjs'];
    const observed = await launch('legacy-config', forwarded).exit;
    expect(observed.code, observed.stderr).toBe(2);
    expect(observed.stderr).toContain('whole-cli (forwarded arguments)');
    expect(observed.stdout.trim()).toBe(JSON.stringify([...operands, ...forwarded]));
    expect(groups()).toEqual(['whole']);
  });

  it('uses whole-CLI mode with exact owner arguments for repository suppressions', async () => {
    add('eslint-suppressions.json', '{}');
    const observed = await launch('legacy-config').exit;
    expect(observed.code, observed.stderr).toBe(2);
    expect(observed.stderr).toContain('whole-cli (repository suppressions)');
    expect(observed.stdout.trim()).toBe(JSON.stringify(operands));
    expect(groups()).toEqual(['whole']);
  });
});
