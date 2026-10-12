import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, expect, test } from 'bun:test';

import { buildLauncher } from './build';

/**
 * Strings only Dash's other authority and planner carry: the admission store's generation table,
 * the fleet planner's alias and the enrollment command. The observation launcher is a second
 * composition root and must reach neither.
 */
const FOREIGN_AUTHORITY_MARKERS = ['authority_generation', '@tools/fleet-plan', 'plan-enrollment'];

let scratch = '';
let launcher = '';
let identity = '';

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'dash-launcher-bundle-'));
  identity = await buildLauncher(scratch);
  launcher = join(scratch, 'observation-service.mjs');
}, 60_000);

afterAll(() => {
  rmSync(scratch, { force: true, recursive: true });
});

test('the observation launcher carries no admission authority or fleet planner', () => {
  // Proof: importing `openAuthority` from `../authority/authority-store` into
  // observation-service-cli.ts and calling it behind an argv branch failed this test with the
  // bundle carrying `authority_generation` (2026-10-12). A bare side-effect import of the store
  // is tree-shaken and carries no marker.
  const bundle = readFileSync(launcher, 'utf8');
  expect(bundle.length).toBeGreaterThan(10_000);
  expect(bundle).toContain('activation_observation');
  expect(FOREIGN_AUTHORITY_MARKERS.filter((marker) => bundle.includes(marker))).toEqual([]);
});

test('the build reports the SHA-256 of the launcher it wrote', () => {
  expect(identity).toBe(createHash('sha256').update(readFileSync(launcher)).digest('hex'));
});

test.each([[[]], [['/etc/a/service.json', '/etc/b/service.json']]])(
  'the built launcher exits 64 on malformed argv %j',
  (argv) => {
    const run = Bun.spawnSync(['bun', launcher, ...argv], { stderr: 'pipe', stdout: 'pipe' });
    expect(run.exitCode).toBe(64);
    expect(run.stderr.toString('utf8')).toContain('service-config-invalid');
  },
);

test('an unsuccessful or ambiguous launcher build refuses before writing', async () => {
  const destination = join(scratch, 'refused');
  for (const outputs of [[], [new Blob(['a']), new Blob(['b'])]]) {
    const build = () =>
      // A test double for Bun.build: only `success`, `outputs` and `logs` are read.
      Promise.resolve({ success: true, outputs, logs: [] } as unknown as Bun.BuildOutput);
    const refusal = await buildLauncher(destination, build).then(
      () => 'resolved',
      (cause: unknown) => String(cause),
    );
    expect(refusal).toStartWith('Error: Cannot build the observation launcher');
  }
  expect(() => readFileSync(join(destination, 'observation-service.mjs'))).toThrow();
});
