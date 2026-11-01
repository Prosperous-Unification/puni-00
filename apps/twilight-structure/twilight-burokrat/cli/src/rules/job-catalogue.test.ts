import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { JobCataloguePath } from '../contracts/job-catalogue';
import { invokeCli } from '../invoke-cli';
import { registeredRules } from './registry';
import type { RuleMode } from './rule';

const repositoryRoot = join(import.meta.dir, '..', '..', '..', '..', '..', '..');
const scratchRoots: string[] = [];

afterEach(() => {
  for (const root of scratchRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

interface Verdict {
  allowed: boolean;
  ruleIds: string[];
  findings: { ruleId: string; path: string; subject?: string; message: string; effect: string }[];
  unevaluated: { ruleId: string; reason: string }[];
}

type CatalogueJob = Record<string, unknown>;

function scratch(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  scratchRoots.push(root);
  return root;
}

function git(repository: string, ...args: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}

function write(root: string, path: string, source: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), source, 'utf8');
}

/** The four job types this repository declares, read from its own catalogue. */
function repositoryJobs(): CatalogueJob[] {
  const catalogue = JSON.parse(readFileSync(join(repositoryRoot, JobCataloguePath), 'utf8')) as {
    jobs: CatalogueJob[];
  };
  return catalogue.jobs;
}

/**
 * A committed candidate holding the four entrypoints and the catalogue the caller supplies.
 * `omit` leaves one entrypoint path out; `catalogueSource` replaces the JSON text whole.
 */
function createCandidate(options: {
  jobs?: unknown[];
  omit?: string;
  catalogueSource?: string;
  packageScripts?: Record<string, string>;
}): { repository: string; revision: string } {
  const repository = join(scratch('job-catalogue-candidate-'), 'candidate');
  mkdirSync(repository);
  git(repository, 'init', '--initial-branch=main');
  git(repository, 'config', 'user.email', 'jobs@example.test');
  git(repository, 'config', 'user.name', 'Job Catalogue Fixture');
  const files: Record<string, string> = {
    'bin/h2puni-gate.sh': '#!/usr/bin/env bash\n',
    'bin/publish-release.sh': '#!/usr/bin/env bash\n',
    'tools/tool-devsync/src/solver-binding-runtime.ts': 'export const runtime = 1;\n',
    'package.json': `${JSON.stringify({
      name: 'jobs-fixture',
      private: true,
      scripts: options.packageScripts ?? { 'test:queued': 'bin/with-heavy-lock.sh -- true' },
    })}\n`,
  };
  for (const [path, source] of Object.entries(files)) {
    if (path !== options.omit) write(repository, path, source);
  }
  write(
    repository,
    JobCataloguePath,
    options.catalogueSource ??
      `${JSON.stringify({ schemaVersion: 1, jobs: options.jobs ?? repositoryJobs() })}\n`,
  );
  git(repository, 'add', '--all');
  git(repository, 'commit', '-m', 'job catalogue fixture');
  return { repository, revision: git(repository, 'rev-parse', 'HEAD') };
}

function writePolicy(mode: RuleMode = 'observe'): string {
  const path = join(scratch('job-catalogue-policy-'), 'rule-policy.json');
  writeFileSync(
    path,
    `${JSON.stringify({
      schemaVersion: 1,
      policyId: 'job-catalogue.test.v1',
      ruleModes: registeredRules().map(({ id }) => ({
        ruleId: id,
        mode: id === 'JOB-CATALOGUE' ? mode : 'observe',
      })),
    })}\n`,
    'utf8',
  );
  return path;
}

async function judge(
  candidate: { repository: string; revision: string },
  options: { now?: string; mode?: RuleMode; rule?: string } = {},
): Promise<{ exitCode: number; verdict?: Verdict; stderr: string }> {
  const invocation = await invokeCli([
    'check',
    'committed',
    candidate.repository,
    candidate.revision,
    writePolicy(options.mode),
    '--rule',
    options.rule ?? 'JOB-CATALOGUE',
    ...(options.now === undefined ? [] : ['--now', options.now]),
  ]);
  return {
    exitCode: invocation.exitCode,
    stderr: invocation.stderr,
    ...(invocation.stdout === '' ? {} : { verdict: JSON.parse(invocation.stdout) as Verdict }),
  };
}

function finding(subject: string, message: string, effect = 'debt'): Verdict['findings'][number] {
  return { ruleId: 'JOB-CATALOGUE', path: JobCataloguePath, subject, message, effect };
}

function withJob(id: string, change: (job: CatalogueJob) => void): CatalogueJob[] {
  return repositoryJobs().map((job) => {
    if (job['id'] !== id) return job;
    const changed = structuredClone(job);
    change(changed);
    return changed;
  });
}

const BeforeUntil = '2026-11-30T12:00:00.000Z';

describe('JOB-CATALOGUE', () => {
  test('passes the four job types of this repository before their until date', async () => {
    const outcome = await judge(createCandidate({}), { now: BeforeUntil, mode: 'enforce' });
    expect(outcome.exitCode, outcome.stderr).toBe(0);
    expect(outcome.verdict).toMatchObject({
      allowed: true,
      ruleIds: ['JOB-CATALOGUE'],
      findings: [],
      unevaluated: [],
    });
  });

  test('passes on the last millisecond of the until date', async () => {
    const outcome = await judge(createCandidate({}), { now: '2026-12-01T23:59:59.999Z' });
    expect(outcome.verdict?.findings).toEqual([]);
  });

  test('fails every estimate on 2026-12-02', async () => {
    const outcome = await judge(createCandidate({}), {
      now: '2026-12-02T00:00:00.000Z',
      mode: 'enforce',
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.verdict?.allowed).toBe(false);
    expect(outcome.verdict?.findings).toEqual(
      ['gate', 'release-build', 'test-queued', 'solver-image-publish'].map((id) =>
        finding(
          id,
          'estimated envelope expired: until 2026-12-01, judged at 2026-12-02T00:00:00.000Z',
          'refusal',
        ),
      ),
    );
  });

  test('names a malformed entry with its field paths', async () => {
    const jobs = withJob('gate', (job) => {
      job['envelope'] = { cpuCores: 1.5, memoryGib: 6, tmpDiskGib: 8, exclusive: ['gate_tree'] };
    });
    const outcome = await judge(createCandidate({ jobs }), { now: BeforeUntil });
    expect(outcome.verdict?.findings).toEqual([
      finding('gate', 'malformed entry: envelope.cpuCores must be an integer (was 1.5)'),
    ]);
  });

  test('names an entry that is not an object by its index', async () => {
    const outcome = await judge(createCandidate({ jobs: [...repositoryJobs(), 'nightly'] }), {
      now: BeforeUntil,
    });
    expect(outcome.verdict?.findings).toEqual([
      finding('jobs[4]', 'malformed entry: must be an object (was a string)'),
    ]);
  });

  test('names a catalogue that is not JSON', async () => {
    const outcome = await judge(createCandidate({ catalogueSource: '{"jobs": [\n' }), {
      now: BeforeUntil,
    });
    expect(outcome.verdict?.findings).toHaveLength(1);
    expect(outcome.verdict?.findings[0]?.message).toStartWith('the catalogue is not JSON: ');
  });

  test('names a catalogue whose header is malformed', async () => {
    const outcome = await judge(
      createCandidate({ catalogueSource: '{"schemaVersion":2,"jobs":[]}\n' }),
      { now: BeforeUntil },
    );
    expect(outcome.verdict?.findings).toEqual([
      finding('catalogue', 'malformed catalogue: schemaVersion must be 1 (was 2)'),
    ]);
  });

  test('names a duplicate id', async () => {
    const [gate] = repositoryJobs();
    const outcome = await judge(createCandidate({ jobs: [...repositoryJobs(), gate] }), {
      now: BeforeUntil,
    });
    expect(outcome.verdict?.findings).toEqual([finding('gate', 'duplicate job type id gate')]);
  });

  test('names an entrypoint absent at the revision', async () => {
    const outcome = await judge(createCandidate({ omit: 'bin/publish-release.sh' }), {
      now: BeforeUntil,
    });
    expect(outcome.verdict?.findings).toEqual([
      finding('release-build', 'entrypoint bin/publish-release.sh is absent at the revision'),
    ]);
  });

  test('names a package script entrypoint the package file does not declare', async () => {
    const outcome = await judge(createCandidate({ packageScripts: { test: 'true' } }), {
      now: BeforeUntil,
    });
    expect(outcome.verdict?.findings).toEqual([
      finding(
        'test-queued',
        'entrypoint package.json#scripts.test:queued is absent at the revision',
      ),
    ]);
  });

  test('names an envelope below its own calibrated p95', async () => {
    const calibrated = (memoryP95: number) =>
      withJob('gate', (job) => {
        job['provenance'] = {
          kind: 'calibrated',
          hostClass: 'h2puni',
          calibratedAt: '2026-11-20T10:00:00.000Z',
          recordCount: 3,
          p95: { cpuCores: 3.2, memoryGib: memoryP95, tmpDiskGib: 5 },
          recordIds: ['run-1', 'run-2', 'run-3'],
        };
      });
    const below = await judge(createCandidate({ jobs: calibrated(6.5) }), { now: BeforeUntil });
    expect(below.verdict?.findings).toEqual([
      finding('gate', 'envelope memoryGib 6 is below its calibrated p95 6.5'),
    ]);
    const atP95 = await judge(createCandidate({ jobs: calibrated(6) }), { now: BeforeUntil });
    expect(atP95.verdict?.findings).toEqual([]);
  });

  test('names containers that are neither none nor a bound', async () => {
    const jobs = withJob('gate', (job) => {
      job['containers'] = 'unbounded';
    });
    const outcome = await judge(createCandidate({ jobs }), { now: BeforeUntil });
    expect(outcome.verdict?.findings).toEqual([
      finding(
        'gate',
        'containers is neither "none" nor a bound { memoryGib, cpuCores }: containers must be "none" (was "unbounded")',
      ),
    ]);
    const halfBound = withJob('test-queued', (job) => {
      job['containers'] = { memoryGib: 1 };
    });
    const halfOutcome = await judge(createCandidate({ jobs: halfBound }), { now: BeforeUntil });
    expect(halfOutcome.verdict?.findings).toHaveLength(1);
    expect(halfOutcome.verdict?.findings[0]).toMatchObject({ subject: 'test-queued' });
    expect(halfOutcome.verdict?.findings[0]?.message).toStartWith(
      'containers is neither "none" nor a bound { memoryGib, cpuCores }: containers',
    );
  });

  test('cannot judge without the evaluation instant', async () => {
    const outcome = await judge(createCandidate({}));
    expect(outcome.exitCode).toBe(1);
    expect(outcome.verdict?.unevaluated).toEqual([
      {
        ruleId: 'JOB-CATALOGUE',
        reason: `${JobCataloguePath} needs the evaluation instant: pass check --now <UTC instant>; Twilight Dash supplies it`,
      },
    ]);
  });

  test('has nothing to judge in a candidate without a catalogue', async () => {
    const candidate = createCandidate({});
    git(candidate.repository, 'rm', '--quiet', JobCataloguePath);
    git(candidate.repository, 'commit', '-m', 'no catalogue');
    const outcome = await judge(
      {
        repository: candidate.repository,
        revision: git(candidate.repository, 'rev-parse', 'HEAD'),
      },
      { mode: 'enforce' },
    );
    expect(outcome.exitCode, outcome.stderr).toBe(0);
    expect(outcome.verdict).toMatchObject({ allowed: true, findings: [], unevaluated: [] });
  });

  test('check refuses a malformed instant', async () => {
    const outcome = await judge(createCandidate({}), { now: '2026-12-02' });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('check --now is not a UTC instant: 2026-12-02');
  });

  test('check refuses --now without a dated rule', async () => {
    const outcome = await judge(createCandidate({}), { now: BeforeUntil, rule: 'MOD-INDEX' });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain(
      'an evaluation instant was supplied without selecting a dated rule',
    );
  });
});
