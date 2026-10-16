import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const scratches = [];
afterEach(() => {
  for (const scratch of scratches.splice(0)) rmSync(scratch, { recursive: true });
});

/** Execute the actual workflow cleanup with fake sudo and a PATH containing no rg. */
function runCleanup({ active = true, hasSwaps = true, hasAwk = true, swapoffExit = '' } = {}) {
  const workflow = readFileSync('.github/workflows/wbs090-import-values-proof.yml', 'utf8');
  const section = workflow.split('      - name: Release ephemeral runner swap\n')[1];
  if (section === undefined) throw new Error('The production cleanup step is missing');
  const body = section.split('        run: |\n')[1];
  if (body === undefined) throw new Error('The production cleanup shell is missing');
  const scratch = mkdtempSync(join(tmpdir(), 'import-values-cleanup-'));
  scratches.push(scratch);
  const binaries = join(scratch, 'bin');
  mkdirSync(binaries);
  if (hasAwk) symlinkSync('/usr/bin/awk', join(binaries, 'awk'));
  const swap = join(scratch, 'proof.swap');
  const swaps = join(scratch, 'swaps');
  const marker = join(scratch, 'active');
  const calls = join(scratch, 'calls');
  writeFileSync(swap, 'scratch swap file');
  if (active) writeFileSync(marker, 'active');
  if (hasSwaps)
    writeFileSync(
      swaps,
      `Filename Type Size Used Priority\n${active ? `${swap} file 12 0 -2\n` : ''}`,
    );
  writeFileSync(
    join(binaries, 'sudo'),
    `#!/bin/bash
set -euo pipefail
printf '%s\\n' "$1" >> "$SWAP_TEST_CALLS"
case "$1" in
  swapoff)
    if [[ -n "$SWAP_TEST_SWAPOFF_EXIT" ]]; then exit "$SWAP_TEST_SWAPOFF_EXIT"; fi
    /bin/rm -- "$SWAP_TEST_ACTIVE"
    ;;
  rm)
    if [[ -f "$SWAP_TEST_ACTIVE" ]]; then
      printf 'refused to remove active swap\\n' >&2
      exit 1
    fi
    /bin/rm -- "$2"
    ;;
  *) printf 'unexpected sudo command\\n' >&2; exit 64 ;;
esac
`,
    { mode: 0o755 },
  );
  const shell = body
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n')
    .replaceAll('/mnt/wbs090-import-values-proof.swap', swap)
    .replaceAll('/proc/swaps', swaps);
  const completed = spawnSync('/bin/bash', ['--noprofile', '--norc', '-c', shell], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: binaries,
      SWAP_TEST_CALLS: calls,
      SWAP_TEST_ACTIVE: marker,
      SWAP_TEST_SWAPOFF_EXIT: swapoffExit,
    },
  });
  if (completed.error !== undefined) throw completed.error;
  return {
    exit: completed.status,
    stderr: completed.stderr,
    calls: existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n') : [],
    exists: existsSync(swap),
  };
}

test('deactivates an active swap before removal with rg absent', () => {
  const observed = runCleanup();
  expect(observed.stderr).toBe('');
  expect(observed.exit).toBe(0);
  expect(observed.calls).toEqual(['swapoff', 'rm']);
  expect(observed.exists).toBe(false);
});

test('removes an inactive swap file without calling swapoff', () => {
  const observed = runCleanup({ active: false });
  expect(observed.exit).toBe(0);
  expect(observed.calls).toEqual(['rm']);
  expect(observed.exists).toBe(false);
});

test('refuses removal if swapoff fails', () => {
  const observed = runCleanup({ swapoffExit: '42' });
  expect(observed.exit).toBe(42);
  expect(observed.calls).toEqual(['swapoff']);
  expect(observed.exists).toBe(true);
});

test('refuses removal when the required swap state is absent', () => {
  const observed = runCleanup({ hasSwaps: false });
  expect(observed.exit).not.toBe(0);
  expect(observed.calls).toEqual([]);
  expect(observed.exists).toBe(true);
});

test('refuses removal when the required awk tool is absent', () => {
  const observed = runCleanup({ hasAwk: false });
  expect(observed.exit).toBe(127);
  expect(observed.calls).toEqual([]);
  expect(observed.exists).toBe(true);
});
