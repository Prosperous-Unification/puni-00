import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, describe, expect, it } from 'bun:test';

const GATE = join(import.meta.dir, '../../../bin/assert-no-prod-release.sh');
const trees: string[] = [];

afterEach(() => {
  for (const tree of trees.splice(0)) {
    // Restore anything a case made unreadable, or the cleanup cannot descend.
    try {
      chmodSync(tree, 0o755);
      chmodSync(join(tree, 'state'), 0o755);
    } catch {
      // The case may not have created a state dir at all; the rm below is what
      // has to succeed, and it reports its own failure.
    }
    rmSync(tree, { recursive: true, force: true });
  }
});

/** A fresh tree with a `state` directory, plus whatever tier files are asked for. */
function stateDir(files: Record<string, string> = {}): string {
  const tree = scratchSync('prod-release-gate-');
  trees.push(tree);
  const dir = join(tree, 'state');
  mkdirSync(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

async function runGate(dir: string): Promise<{ exitCode: number; output: string }> {
  const child = Bun.spawn(['bash', GATE, dir], { stdout: 'pipe', stderr: 'pipe' });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, output: stdout + stderr };
}

const DEPLOYED_BE = JSON.stringify({
  tier: 'be',
  activeColor: 'blue',
  lastDeployedSha: 'abc1234',
});

describe('assert-no-prod-release', () => {
  it('passes on a never-deployed state', async () => {
    const result = await runGate(stateDir());

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('nothing is deployed');
  });

  // Proof: the `for tier` loop's `printf`/`exit 1` replaced by a `continue`,
  // watched failing here on `expected 0 not to be 0` — the gate passed with
  // `be.json` naming blue. Observed 2026-08-31.
  it('refuses a recorded colour', async () => {
    const result = await runGate(stateDir({ 'be.json': DEPLOYED_BE }));

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('records a deployed release');
    // The refusal has to name the change that IS safe, or the operator's only
    // options are to guess or to force it.
    expect(result.output).toContain('expand');
    expect(result.output).toContain('contract');
  });

  // The tier the swap touches last must not be a blind spot: the loop refuses
  // on any of the three, not only on `be`.
  it('refuses a recorded colour on a tier other than be', async () => {
    const result = await runGate(
      stateDir({ 'fe.json': JSON.stringify({ tier: 'fe', activeColor: 'green' }) }),
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('fe.json');
  });

  // Proof: R5's exact recurring fault. The `[ ! -r "$state_file" ]` arm
  // replaced by `state=$(cat "$state_file" 2>/dev/null || echo '')` and a skip
  // on an empty read, watched failing here on `expected 0 not to be 0` — an
  // unreadable state file passed the gate as never-deployed, which is what
  // `swap.js`'s `readRecordedColor` shipped on 2026-08-05. Observed 2026-08-31.
  it('refuses an unreadable state file', async () => {
    const dir = stateDir({ 'be.json': DEPLOYED_BE });
    chmodSync(join(dir, 'be.json'), 0o000);

    const result = await runGate(dir);

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('could not be read');
    expect(result.output).not.toContain('nothing is deployed');
  });

  // Proof: `[ ! -d "$STATE_DIR" ]` replaced by an `exit 0`, watched failing
  // here on `expected 0 not to be 0`. A path that does not exist is evidence
  // the gate was pointed somewhere wrong, never evidence that prod is empty.
  it('refuses a missing state directory', async () => {
    const dir = join(stateDir(), 'not-here');

    const result = await runGate(dir);

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('not a readable state directory');
  });

  it('refuses a state directory it cannot list', async () => {
    const dir = stateDir({ 'be.json': DEPLOYED_BE });
    chmodSync(dir, 0o000);

    const result = await runGate(dir);

    expect(result.exitCode).not.toBe(0);
    expect(result.output).not.toContain('nothing is deployed');
  });

  describe('--override-with-ledger', () => {
    const SKELETON = '20260426171432_talented_smiling_tiger';

    /** Writes a ledger dump beside the state directory and returns its path. */
    function ledger(dir: string, body: string): string {
      const path = join(dir, '..', 'ledger.txt');
      writeFileSync(path, body);
      return path;
    }

    async function runOverride(dir: string, flag: string) {
      const child = Bun.spawn(['bash', GATE, dir, flag], { stdout: 'pipe', stderr: 'pipe' });
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      return { exitCode, output: stdout + stderr };
    }

    it('accepts a recorded release whose ledger holds only the skeleton migration', async () => {
      const dir = stateDir({ 'be.json': DEPLOYED_BE });
      const result = await runOverride(
        dir,
        `--override-with-ledger=${ledger(dir, `${SKELETON}\n`)}`,
      );

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('OVERRIDE ACCEPTED');
    });

    // Proof: the ledger comparison replaced by `false` made this case, the
    // split-name case and the empty-ledger case fail (12 pass, 3 fail): each
    // exited 0 with OVERRIDE ACCEPTED. Observed 2026-09-29.
    it('refuses a ledger that lists any later migration', async () => {
      const dir = stateDir({ 'be.json': DEPLOYED_BE });
      const result = await runOverride(
        dir,
        `--override-with-ledger=${ledger(dir, `${SKELETON}\n20260824010000_add_oidc_identity\n`)}`,
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain('override refused');
      expect(result.output).not.toContain('OVERRIDE ACCEPTED');
    });

    it('refuses the skeleton name split across two lines', async () => {
      const dir = stateDir({ 'be.json': DEPLOYED_BE });
      const result = await runOverride(
        dir,
        `--override-with-ledger=${ledger(dir, '20260426171432_talented_\nsmiling_tiger\n')}`,
      );

      expect(result.exitCode).not.toBe(0);
    });

    it('refuses an empty ledger', async () => {
      const dir = stateDir({ 'be.json': DEPLOYED_BE });
      const result = await runOverride(dir, `--override-with-ledger=${ledger(dir, '')}`);

      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain('override refused');
    });

    // Proof: the `[ ! -r ]` ledger arm removed made this case fail (14 pass,
    // 1 fail): `sed` exited under `set -e` with only its own Permission
    // denied, never the refusal. Observed 2026-09-29.
    it('refuses an unreadable ledger', async () => {
      const dir = stateDir({ 'be.json': DEPLOYED_BE });
      const path = ledger(dir, `${SKELETON}\n`);
      chmodSync(path, 0o000);
      const result = await runOverride(dir, `--override-with-ledger=${path}`);

      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain('missing or unreadable');
    });

    it('refuses a missing ledger', async () => {
      const dir = stateDir({ 'be.json': DEPLOYED_BE });
      const result = await runOverride(dir, `--override-with-ledger=${join(dir, 'absent.txt')}`);

      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain('missing or unreadable');
    });

    it('never excuses an unreadable state file', async () => {
      const dir = stateDir({ 'be.json': DEPLOYED_BE });
      chmodSync(join(dir, 'be.json'), 0o000);
      const result = await runOverride(
        dir,
        `--override-with-ledger=${ledger(dir, `${SKELETON}\n`)}`,
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain('could not be read');
    });

    it('refuses an unknown option rather than ignoring it', async () => {
      const result = await runOverride(stateDir({ 'be.json': DEPLOYED_BE }), '--force');

      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain('unknown argument');
    });
  });

  it('refuses when no state directory is named at all', async () => {
    const child = Bun.spawn(['bash', GATE], { stdout: 'pipe', stderr: 'pipe' });
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('usage');
  });
});
