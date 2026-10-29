import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from 'bun:test';

interface Step {
  name?: string;
  id?: string;
  if?: string;
  run?: string;
  uses?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
}
interface Job {
  name?: string;
  needs?: string | string[];
  if?: string;
  'timeout-minutes'?: number;
  steps?: Step[];
  strategy?: unknown;
}
const workflow = Bun.YAML.parse(
  readFileSync(resolve(import.meta.dir, '../../../../.github/workflows/ci.yml'), 'utf8'),
) as { jobs?: Record<string, Job> };

function job(name: string): Job {
  const selected = workflow.jobs?.[name];
  if (selected === undefined) throw new Error(`Missing CI job ${name}`);
  return selected;
}

function step(owner: Job, name: string): Step {
  const selected = owner.steps?.find((entry) => entry.name === name);
  if (selected === undefined) throw new Error(`Missing CI step ${name}`);
  return selected;
}

test('each whole-project runtime has a finite Nx phase and whole-job limit with durable status and log', () => {
  for (const [partition, title] of [
    ['workspace', 'Gate'],
    ['backend', 'Backend'],
    ['frontend', 'Frontend'],
  ]) {
    const runtime = job(`gate_${partition}`);
    expect(runtime.needs).toBe('gate_mode');
    expect(runtime['timeout-minutes']).toBe(90);
    expect(runtime.if).toBe(
      partition === 'workspace'
        ? "${{ needs.gate_mode.outputs.mode != 'docs' }}"
        : `\${{ needs.gate_mode.outputs.mode == 'full' || needs.gate_mode.outputs.${partition} == 'run' }}`,
    );
    const execution = step(runtime, `${title} — test, lint, typecheck, build`);
    expect(execution.run).toContain('timeout --signal=TERM --kill-after=30s 75m \\');
    expect(execution.run).toContain(
      `ci-run-runtime.ts ${partition} "$GATE_BASE" "$GITHUB_SHA" . "$GATE_MODE"`,
    );
    expect(execution.run).toContain('if [ "$GATE_BASE" != "$base" ]; then');
    expect(execution.run).toContain('gate_status=$?');
    expect(execution.run).toContain(`runtime phase start partition=${partition} head=%s utc=%s`);
    expect(execution.run).toContain(
      `runtime phase end partition=${partition} utc=%s elapsedSeconds=%s exit=%s`,
    );
    expect(execution.run).toContain('"$((SECONDS - phase_started))" "$gate_status" >> nx-gate.log');
    expect(execution.run).toContain('exit "$gate_status"');
    expect(execution.run).toContain('exit "$annotation_status"');
    const upload = step(runtime, 'Upload gate log');
    expect(upload.if).toBe("${{ always() && steps.nx_gate.outcome != 'skipped' }}");
    expect(upload.with?.['name']).toBe(`nx-gate-log-${partition}-\${{ github.run_attempt }}`);
    expect(upload.with?.['if-no-files-found']).toBe('error');
  }
});

test('every runtime keeps exact checkout and native provisioning before Nx', () => {
  const names = [
    'gate_workspace',
    'gate_backend',
    'gate_remote',
    'gate_remote_model',
    'gate_frontend',
  ];
  const prefix = job(names[0]).steps?.slice(0, 7);
  expect(prefix).toHaveLength(7);
  for (const name of names) {
    const runtime = job(name);
    expect(runtime.steps?.slice(0, 7)).toEqual(prefix);
    expect(runtime.steps?.[0]?.with?.['fetch-depth']).toBe(0);
    const provision = step(runtime, 'Provision bubblewrap for native runtime tests');
    expect(provision.run).toContain(
      'apt-get install --yes --no-install-recommends bubblewrap busybox',
    );
    expect(provision.run).toContain(
      'bwrap --die-with-parent --new-session --unshare-all --uid 1000 --gid 1000',
    );
    expect(provision.run).toContain('/bin/busybox sh -c');
  }
});

test('non-Nx checks retain their own finite budget and each required original command', () => {
  // Proof: replacing the Caddy network assertion with gateway failed this focused test.
  const checks = job('gate_checks');
  expect(checks.needs).toBe('gate_mode');
  expect(checks.if).toBe("${{ needs.gate_mode.outputs.mode != 'docs' }}");
  expect(checks['timeout-minutes']).toBe(30);
  expect(checks.steps?.map((entry) => entry.name).filter(Boolean)).toEqual([
    'Provision bubblewrap for native runtime tests',
    'Assert shellcheck present',
    'Install',
    'Install solver dependencies',
    'Tool wiki — diagnostic/non-certifying',
    'Provision immutable external activation for push audit',
    'Tool wiki — externally activated push audit',
    'Format',
    'Solver image smoke',
    'Heavy-work lock',
    'Gate head pinning',
    'Dev entrypoint',
    'Secrets scan',
    'Private nesting',
    'Doc caps',
    'Compose files',
    'Migration lint',
    'Corpus version lint',
    'OpenSpec',
    'OpenSpec schema graph (pinned CLI)',
  ]);
  expect(step(checks, 'Format').run).toBe('bunx nx format:check --all');
  expect(step(checks, 'Solver image smoke').run).toBe('bunx nx run wbs-be-01:solver-image-smoke');
  expect(step(checks, 'Compose files').run).toContain(
    'docker compose -f deploy/compose/base.yml config -q',
  );
  expect(step(checks, 'Compose files').run).toContain(
    '.services.caddy.networks | has("aivn-dev-net")',
  );
});

test('remote retains finite rest and model runners under one selection bit', () => {
  for (const [name, partition, title] of [
    ['gate_remote', 'remote-rest', 'Remote'],
    ['gate_remote_model', 'remote-model', 'Remote model'],
  ]) {
    const runtime = job(name);
    expect(runtime.needs).toBe('gate_mode');
    expect(runtime['timeout-minutes']).toBe(90);
    expect(runtime.if).toBe(
      "${{ needs.gate_mode.outputs.mode == 'full' || needs.gate_mode.outputs.remote == 'run' }}",
    );
    const execution = step(runtime, `${title} — test, lint, typecheck, build`);
    expect(execution.run).toContain('timeout --signal=TERM --kill-after=30s 75m \\');
    expect(execution.run).toContain(
      `ci-run-runtime.ts ${name === 'gate_remote_model' ? '"$RUNTIME_PARTITION"' : partition} "$GATE_BASE" "$GITHUB_SHA" . "$GATE_MODE"`,
    );
    expect(execution.run).toContain('if [ "$GATE_BASE" != "$base" ]; then');
    expect(execution.run).toContain('gate_status=$?');
    expect(execution.run).toContain(
      `runtime phase start partition=${name === 'gate_remote_model' ? '%s' : partition} head=%s utc=%s`,
    );
    if (name === 'gate_remote_model') {
      expect(execution.env?.['RUNTIME_PARTITION']).toBe('${{ matrix.partition }}');
      expect(execution.run).toContain('"$RUNTIME_PARTITION" "$GITHUB_SHA"');
      expect(execution.run).toContain(
        'runtime phase end partition=%s utc=%s elapsedSeconds=%s exit=%s',
      );
    }
    expect(execution.run).toContain('exit "$gate_status"');
    expect(execution.run).toContain('exit "$annotation_status"');
    const upload = step(runtime, 'Upload gate log');
    expect(upload.if).toBe("${{ always() && steps.nx_gate.outcome != 'skipped' }}");
    expect(upload.with?.['name']).toBe(
      `nx-gate-log-${name === 'gate_remote_model' ? '${{ matrix.partition }}' : partition}-\${{ github.run_attempt }}`,
    );
    expect(upload.with?.['if-no-files-found']).toBe('error');
  }
});

test('model matrix is exactly two independent whole-file runners', () => {
  const runtime = job('gate_remote_model');
  expect(runtime.strategy).toEqual({
    'fail-fast': false,
    matrix: { partition: ['remote-model', 'remote-model-continuation'] },
  });
});
