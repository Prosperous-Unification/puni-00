import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

const LAUNCHER = join(import.meta.dir, 'host-job-docker-run.ts');

/** Runs the launcher against a fake `docker` that records its argv and exits 7. */
function launch(jobId: string | undefined): { readonly status: number; readonly argv: string[] } {
  const directory = scratchSync('host-job-docker-run-');
  const calls = join(directory, 'docker.calls');
  writeFileSync(
    join(directory, 'docker'),
    `#!/bin/sh\nfor argument in "$@"; do printf '%s\\n' "$argument"; done > '${calls}'\nexit 7\n`,
  );
  chmodSync(join(directory, 'docker'), 0o755);
  const environment: Record<string, string | undefined> = {
    ...process.env,
    PATH: `${directory}:${process.env['PATH'] ?? ''}`,
    DASH_JOB_ID: jobId,
  };
  const execution = Bun.spawnSync(
    [process.execPath, LAUNCHER, '--detach', '--name', 'wbs-orphan-coordinator-x', 'image'],
    { env: environment, stdout: 'pipe', stderr: 'pipe' },
  );
  return {
    status: execution.exitCode,
    argv: readFileSync(calls, 'utf8').trimEnd().split('\n'),
  };
}

describe('the host job docker run launcher', () => {
  // Proof: with `...hostJobContainerFlags(process.env)` removed from host-job-docker-run.ts,
  // `bounds and labels the caller inside a Dash job` failed on an argv without `--memory`
  // (2026-11-12).
  it('bounds and labels the caller inside a Dash job', () => {
    expect(launch('abc')).toEqual({
      status: 7,
      argv: [
        'run',
        '--memory',
        '1g',
        '--cpus',
        '1',
        '--label',
        'puni.job=abc',
        '--detach',
        '--name',
        'wbs-orphan-coordinator-x',
        'image',
      ],
    });
  });

  it('passes the caller argv through unchanged outside a Dash job', () => {
    expect(launch(undefined)).toEqual({
      status: 7,
      argv: ['run', '--detach', '--name', 'wbs-orphan-coordinator-x', 'image'],
    });
  });
  // Proof: with the `argv.length === 0` refusal removed from host-job-docker-run.ts, this test
  // failed on `Expected to contain: "host job docker run: …" Received: ""` (2026-11-12).
  it('refuses to start docker without arguments', () => {
    const directory = scratchSync('host-job-docker-run-empty-');
    const calls = join(directory, 'docker.calls');
    writeFileSync(
      join(directory, 'docker'),
      `#!/bin/sh\nprintf '%s\\n' "$@" > '${calls}'\nexit 7\n`,
    );
    chmodSync(join(directory, 'docker'), 0o755);
    const execution = Bun.spawnSync([process.execPath, LAUNCHER], {
      env: { ...process.env, PATH: `${directory}:${process.env['PATH'] ?? ''}` },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stderr.toString()).toContain(
      'host job docker run: expected docker run arguments',
    );
    expect(existsSync(calls)).toBeFalse();
  });
});
