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
  // A number, or a matrix expression on the heavy leaves.
  'timeout-minutes'?: number | string;
  'runs-on'?: string;
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

// Proof: the unchanged floating runner failed this parsed-workflow consumer with
// expected ubuntu-24.04 / received ubuntu-latest (0 passed / 1 failed, 2026-10-31).
// Proof: restoring the Fleet runner, restoring its Python pin, and widening both
// selectors to tool-devsync each failed this test against production CI YAML.
test('Python jobs pin the Fleet and standard hosted runtime tuples', () => {
  const consumers = [
    'gate_workspace',
    'gate_backend',
    'gate_remote',
    'gate_remote_model',
    'gate_frontend',
    'gate_heavy',
    'gate_checks',
  ];
  const actual = Object.entries(workflow.jobs ?? {})
    .filter(([, owner]) =>
      owner.steps?.some((entry) => entry.uses?.startsWith('actions/setup-python@')),
    )
    .map(([name]) => name);
  expect(actual.sort()).toEqual([...consumers].sort());
  for (const name of consumers) {
    const runtime = job(name);
    expect(runtime['runs-on'], name).toBe(
      name === 'gate_heavy'
        ? "${{ matrix.project == 'tool-fleet' && 'ubuntu-26.04' || 'ubuntu-24.04' }}"
        : 'ubuntu-24.04',
    );
    const setups = runtime.steps?.filter((entry) =>
      entry.uses?.startsWith('actions/setup-python@'),
    );
    expect(setups).toHaveLength(1);
    expect(setups?.[0]?.uses).toBe('actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065');
    expect(setups?.[0]?.with?.['python-version'], name).toBe(
      name === 'gate_heavy'
        ? "${{ matrix.project == 'tool-fleet' && '3.14.10' || '3.14.4' }}"
        : '3.14.4',
    );
  }
});

// Proof: restoring the workspace 75m phase failed this workflow test.
// Proof: after run 45081960543 timed out, the old 120m backend job failed the
// 135m assertion. Keeping the new job limit with the old 105m phase failed
// the production timeout-command assertion.
test('each whole-project runtime has a finite Nx phase and whole-job limit with durable status and log', () => {
  for (const [partition, title, jobMinutes, phaseMinutes] of [
    ['workspace', 'Gate', 120, 105],
    ['backend', 'Backend', 135, 120],
    ['frontend', 'Frontend', 90, 75],
  ] as const) {
    const runtime = job(`gate_${partition}`);
    const shared = partition === 'workspace';
    expect(runtime.needs).toBe('gate_mode');
    expect(runtime['timeout-minutes'], partition).toBe(jobMinutes);
    expect(runtime.if).toBe(
      shared
        ? "${{ needs.gate_mode.outputs.mode != 'docs' }}"
        : `\${{ needs.gate_mode.outputs.mode == 'full' || needs.gate_mode.outputs.${partition} == 'run' }}`,
    );
    const execution = step(runtime, `${title} — test, lint, typecheck, build`);
    // The workspace step text is shared with the heavy leaves, so it names its partition and
    // budget once (partition=workspace, phase_limit=105) and reads them everywhere else.
    if (shared) {
      expect(execution.run).toContain(`partition=workspace\nphase_limit=${String(phaseMinutes)}\n`);
      expect(execution.run).toContain(
        'timeout --signal=TERM --kill-after=30s "${phase_limit}m" \\',
      );
      expect(execution.run).toContain(
        'ci-run-runtime.ts "$partition" "$GATE_BASE" "$GITHUB_SHA" . "$GATE_MODE"',
      );
      expect(execution.run).toContain('runtime phase start partition=%s head=%s utc=%s');
      expect(execution.run).toContain(
        'runtime phase end partition=%s utc=%s elapsedSeconds=%s exit=%s',
      );
    } else {
      expect(execution.run).toContain(
        `timeout --signal=TERM --kill-after=30s ${String(phaseMinutes)}m \\`,
      );
      expect(execution.run).toContain(
        `ci-run-runtime.ts ${partition} "$GATE_BASE" "$GITHUB_SHA" . "$GATE_MODE"`,
      );
      expect(execution.run).toContain(`runtime phase start partition=${partition} head=%s utc=%s`);
      expect(execution.run).toContain(
        `runtime phase end partition=${partition} utc=%s elapsedSeconds=%s exit=%s`,
      );
    }
    expect(execution.run).toContain('if [ "$GATE_BASE" != "$base" ]; then');
    expect(execution.run).toContain('gate_status=$?');
    expect(execution.run).toContain('"$((SECONDS - phase_started))" "$gate_status" >> nx-gate.log');
    expect(execution.run).toContain('exit "$gate_status"');
    expect(execution.run).toContain('exit "$annotation_status"');
    const upload = step(runtime, 'Upload gate log');
    expect(upload.if).toBe("${{ always() && steps.nx_gate.outcome != 'skipped' }}");
    expect(upload.with?.['name']).toBe(`nx-gate-log-${partition}-\${{ github.run_attempt }}`);
    expect(upload.with?.['if-no-files-found']).toBe('error');
  }
});

// A-CI-WORKSPACE-MEMORY-3: each heavy leaf takes its finite budget from its matrix entry (Gate
// mode's table, held by gate-workflow.test.ts) and uploads its own log.
// Proof (2026-11-21): a literal 150 job limit or a per-project-blind log name failed this test.
test('each heavy leaf takes its job and phase budget from its matrix entry and keeps its own log', () => {
  const leaf = job('gate_heavy');
  expect(leaf.needs).toBe('gate_mode');
  expect(leaf.if).toBe("${{ needs.gate_mode.outputs.heavy == 'run' }}");
  expect(leaf['timeout-minutes']).toBe('${{ matrix.job }}');
  const execution = step(leaf, 'Heavy leaf — test, lint, typecheck, build');
  expect(execution.env?.['RUNTIME_PARTITION']).toBe('heavy-${{ matrix.project }}');
  expect(execution.env?.['PHASE_MINUTES']).toBe('${{ matrix.phase }}');
  expect(execution.run).toContain('partition="$RUNTIME_PARTITION"\nphase_limit="$PHASE_MINUTES"\n');
  const upload = step(leaf, 'Upload gate log');
  expect(upload.if).toBe("${{ always() && steps.nx_gate.outcome != 'skipped' }}");
  expect(upload.with?.['name']).toBe(
    'nx-gate-log-heavy-${{ matrix.project }}-${{ github.run_attempt }}',
  );
  expect(upload.with?.['if-no-files-found']).toBe('error');
});

test('every runtime keeps exact checkout and native provisioning before Nx', () => {
  const names = [
    'gate_workspace',
    'gate_backend',
    'gate_remote',
    'gate_remote_model',
    'gate_frontend',
    'gate_heavy',
  ];
  const prefix = job(names[0]).steps?.slice(0, 7);
  expect(prefix).toHaveLength(7);
  for (const name of names) {
    const runtime = job(name);
    // The tuple assertion above checks the heavy Python version directly.
    const provisioning = runtime.steps
      ?.slice(0, 7)
      .map((entry) =>
        name === 'gate_heavy' && entry.uses?.startsWith('actions/setup-python@')
          ? { ...entry, with: { ...entry.with, 'python-version': '3.14.4' } }
          : entry,
      );
    // Proof: changing the heavy cache path to requirements.in failed this comparison.
    expect(provisioning).toEqual(prefix);
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
    'Gate launcher refresh',
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
  // Proof: omitted step and disabled command each failed this parsed-workflow consumer; restored passed (2026-11-08).
  expect(step(checks, 'Gate launcher refresh').run).toBe('bash bin/gate-launcher-refresh.test.sh');
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
    ['gate_remote_model', 'remote-model', 'Remote isolated leaf'],
  ]) {
    const runtime = job(name);
    expect(runtime.needs).toBe('gate_mode');
    expect(runtime['timeout-minutes']).toBe(90);
    expect(runtime.if).toBe(
      "${{ needs.gate_mode.outputs.mode == 'full' || needs.gate_mode.outputs.remote == 'run' }}",
    );
    const execution = step(
      runtime,
      name === 'gate_remote_model'
        ? 'Remote isolated leaf — test'
        : `${title} — test, lint, typecheck, build`,
    );
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

// Proof: dropping remote-source failed this parsed matrix consumer; exact restoration passed (2026-10-29).
test('isolated remote matrix is exactly seven independent whole-file runners', () => {
  const runtime = job('gate_remote_model');
  expect(runtime.strategy).toEqual({
    'fail-fast': false,
    matrix: {
      partition: [
        'remote-model',
        'remote-model-continuation',
        'remote-source',
        'remote-source-restoration',
        'remote-participant-policy',
        'remote-complete-activation',
        'remote-storage',
      ],
    },
  });
});

// Proof: changing only the configured Node version to 24.20.1 failed this metadata consumer (2026-10-29).
test('the three explicit source and policy matrix members provision the exact CI Node runtime', () => {
  const runtime = job('gate_remote_model');
  const setup = step(runtime, 'Set up source test Node');
  expect(setup.uses).toBe('actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38');
  expect(setup.if).toBe(
    "${{ matrix.partition == 'remote-source' || matrix.partition == 'remote-source-restoration' || matrix.partition == 'remote-participant-policy' }}",
  );
  expect(setup.with).toEqual({ 'node-version': '24.20.0', 'package-manager-cache': false });
});

test('every isolated matrix execution remains mandatory for selected work', () => {
  const runtime = job('gate_remote_model');
  const execution = step(runtime, 'Remote isolated leaf — test');
  expect(execution.if).toBeUndefined();
  expect('continue-on-error' in execution).toBe(false);
  expect('continue-on-error' in runtime).toBe(false);
  expect(execution.id).toBe('nx_gate');
  expect(execution.env?.['RUNTIME_PARTITION']).toBe('${{ matrix.partition }}');
});
