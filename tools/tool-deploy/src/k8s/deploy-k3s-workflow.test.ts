import { existsSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, describe, expect, it } from 'bun:test';

const ROOT = resolve(import.meta.dir, '../../../..');
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}
interface Job {
  'runs-on': string | string[];
  environment?: string;
  needs?: string | string[];
  permissions?: Record<string, string>;
  steps: Step[];
}
interface Workflow {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  jobs: Record<string, Job>;
}

function workflow(path: string): { parsed: Workflow; text: string } {
  const text = readFileSync(join(ROOT, path), 'utf8');
  return { parsed: Bun.YAML.parse(text) as Workflow, text };
}

const infra = workflow('.github/workflows/infra-check.yml');
const deploy = workflow('.github/workflows/deploy-k3s.yml');

function step(job: Job, name: string): Step {
  const found = job.steps.find((each) => each.name === name);
  if (found?.run === undefined) throw new Error(`no run step named ${name}`);
  return found;
}

function execute(script: string, env: Record<string, string>): { code: number; stderr: string } {
  const child = Bun.spawnSync({
    cmd: ['bash', '-c', script],
    env: { PATH: process.env['PATH'] ?? '/usr/bin:/bin', ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { code: child.exitCode, stderr: child.stderr.toString() };
}

/** A repository whose main has `merged` then `head`, and `side` branched off `merged`. */
function mainWithSideBranch(): { repository: string; merged: string; side: string; head: string } {
  const repository = scratchSync('deploy-k3s-ancestry-');
  roots.push(repository);
  const git = (...args: string[]): string => {
    const child = Bun.spawnSync(['git', '-C', repository, ...args], {
      env: {
        PATH: process.env['PATH'] ?? '/usr/bin:/bin',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_AUTHOR_NAME: 'test',
        GIT_AUTHOR_EMAIL: 'test@example.test',
        GIT_COMMITTER_NAME: 'test',
        GIT_COMMITTER_EMAIL: 'test@example.test',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (child.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${child.stderr.toString()}`);
    return child.stdout.toString().trim();
  };
  git('init', '--quiet', '--initial-branch=main');
  git('commit', '--quiet', '--allow-empty', '-m', 'merged');
  const merged = git('rev-parse', 'HEAD');
  git('checkout', '--quiet', '-b', 'side');
  git('commit', '--quiet', '--allow-empty', '-m', 'unreviewed');
  const side = git('rev-parse', 'HEAD');
  git('checkout', '--quiet', 'main');
  git('commit', '--quiet', '--allow-empty', '-m', 'head');
  const head = git('rev-parse', 'HEAD');
  return { repository, merged, side, head };
}

describe('infra-check.yml is unprivileged', () => {
  it('runs only on pull_request and push, never a target-context trigger', () => {
    expect(Object.keys(infra.parsed.on).sort()).toEqual(['pull_request', 'push']);
    expect(infra.parsed.permissions).toEqual({ contents: 'read' });
  });

  it('never reaches secrets, variables, environments or a persistent runner', () => {
    expect(infra.text).not.toMatch(/\$\{\{\s*(secrets|vars)\./);
    for (const [name, job] of Object.entries(infra.parsed.jobs)) {
      expect(job['runs-on'], name).toBe('ubuntu-latest');
      expect(job.environment, name).toBeUndefined();
      for (const each of job.steps.filter((s) => s.uses?.startsWith('actions/checkout@'))) {
        expect(each.with?.['persist-credentials'], name).toBe(false);
      }
    }
  });

  it('runs the fleet check and the k3s rehearsal through Nx', () => {
    expect(infra.text).toContain('bunx nx run tool-fleet:check');
    expect(infra.text).toContain('bunx nx run tool-deploy:test:k3s');
  });
});

describe('deploy-k3s.yml separates candidate code from credentials', () => {
  const { jobs } = deploy.parsed;

  it('is a manual dispatch whose apply defaults to plan', () => {
    expect(Object.keys(deploy.parsed.on)).toEqual(['workflow_dispatch']);
    const inputs = (deploy.parsed.on['workflow_dispatch'] as { inputs: Record<string, unknown> })
      .inputs as Record<string, { default?: unknown; options?: unknown; required?: unknown }>;
    expect(inputs['apply'].default).toBe(false);
    expect(inputs['environment'].options).toEqual(['staging', 'prod']);
    expect(inputs['cluster_context'].required).toBe(true);
  });

  it('gives credentials only to the protected deploy job, which checks out main only', () => {
    for (const [name, job] of Object.entries(jobs)) {
      if (name === 'deploy') continue;
      // `describe` reads registry labels with a read-only credential and runs main's code only.
      const text = JSON.stringify(job).replaceAll(
        name === 'describe' ? 'secrets.REGISTRY_READ_AUTH' : '\u0000',
        '',
      );
      expect(job['runs-on'], name).toBe('ubuntu-latest');
      expect(job.environment, name).toBeUndefined();
      expect(text, name).not.toContain('secrets.');
    }
    const job = jobs['deploy'];
    expect(job['runs-on']).toEqual(['self-hosted', 'puni-deploy']);
    expect(job.environment).toBe('${{ inputs.environment }}');
    const checkouts = job.steps.filter((s) => s.uses?.startsWith('actions/checkout@'));
    expect(checkouts.map((s) => s.with?.['ref'])).toEqual(['${{ github.sha }}']);
    expect(checkouts.map((s) => s.with?.['persist-credentials'])).toEqual([false]);
  });

  it('checks out only main, and materialises the candidate after the trusted bootstrap', () => {
    const otherCheckouts = Object.entries(jobs).flatMap(([name, job]) =>
      job.steps
        .filter((s) => s.uses?.startsWith('actions/checkout@'))
        .filter((s) => s.with?.['ref'] !== '${{ github.sha }}')
        .map(() => name),
    );
    expect(otherCheckouts).toEqual([]);
    const names = jobs['admission'].steps.map((s) => s.name ?? s.uses ?? '');
    expect(names.indexOf('Bootstrap trusted package')).toBeLessThan(
      names.indexOf('Check out main history'),
    );
    expect(names.indexOf('Check out main history')).toBeLessThan(
      names.indexOf('Admit the candidate'),
    );
  });

  it('neither saves nor restores an Actions cache in any job', () => {
    // A cache saved at main scope while candidate bytes are on disk would be restored by every
    // later main-scope run, including the protected deploy job. No step may touch the cache.
    // Proof: deleting `no-cache: true` from the admission job's setup-bun failed this test, and
    // CodeQL flagged that job as actions/cache-poisoning/poisonable-step.
    for (const [name, job] of Object.entries(deploy.parsed.jobs)) {
      for (const each of job.steps) {
        expect(each.uses ?? '', name).not.toMatch(/^actions\/cache[@/]/);
        if (each.uses?.startsWith('oven-sh/setup-bun@')) {
          expect(each.with?.['no-cache'], name).toBe(true);
        }
      }
    }
  });

  it('carries admission.json from the admission job to the deploy job as an artifact', () => {
    const upload = jobs['admission'].steps.find((s) =>
      s.uses?.startsWith('actions/upload-artifact@'),
    );
    expect(upload?.with?.['name']).toBe('admission');
    const downloads = jobs['deploy'].steps
      .filter((s) => s.uses?.startsWith('actions/download-artifact@'))
      .map((s) => s.with?.['name']);
    expect(downloads).toEqual(['admission', 'release-descriptor']);
    expect(jobs['deploy'].needs).toEqual(['resolve', 'admission', 'describe']);
  });

  it('passes --apply only when the apply input is true, and keeps state in the protected dir', () => {
    const run = step(jobs['deploy'], 'tool-deploy:deploy:k3s').run ?? '';
    expect(run).toContain('if [[ "$APPLY" == true ]]; then mode=(--apply); fi');
    expect(run).toContain('--state "$STATE"');
    expect(run).not.toMatch(/deploy-k3s\.ts[^\n]*--apply/);
  });

  it('refuses a dispatch from any ref but main (production run block)', () => {
    const guard = step(jobs['resolve'], 'Refuse any ref but main').run ?? '';
    const refused = execute(guard, { DISPATCH_REF: 'refs/heads/feature' });
    expect(refused.code).toBe(78);
    expect(refused.stderr).toContain('only from refs/heads/main');
    expect(execute(guard, { DISPATCH_REF: 'refs/heads/main' }).code).toBe(0);
  });

  it('refuses a candidate that is not already on main (production run block)', () => {
    const { repository, merged, side, head } = mainWithSideBranch();
    const guard = step(jobs['resolve'], 'Require a candidate already on main').run ?? '';
    const run = (source: string) =>
      execute(guard, { GITHUB_WORKSPACE: repository, GITHUB_SHA: head, SOURCE_SHA: source });
    expect(run(merged).code).toBe(0);
    expect(run(head).code).toBe(0);
    const unmerged = run(side);
    expect(unmerged.code).toBe(78);
    expect(unmerged.stderr).toContain('is not on main');
    const unknown = run('f'.repeat(40));
    expect(unknown.code).toBe(78);
    expect(unknown.stderr).toContain('cannot resolve candidate');
    const names = jobs['resolve'].steps.map((s) => s.name ?? s.uses ?? '');
    expect(names.indexOf('Require a candidate already on main')).toBeGreaterThan(
      names.indexOf('Name the candidate'),
    );
  });

  it('refuses a malformed recovery input (production run block)', () => {
    const guard = step(jobs['resolve'], 'Validate the recovery input').run ?? '';
    expect(execute(guard, { RECOVERS: 'latest' }).code).toBe(78);
    expect(execute(guard, { RECOVERS: '' }).code).toBe(0);
    expect(execute(guard, { RECOVERS: 'abcdef012345-abcdef012345' }).code).toBe(0);
  });

  it('materialises only a candidate already on main for admission (production run block)', () => {
    const { repository, merged, side, head } = mainWithSideBranch();
    const workspace = scratchSync('deploy-k3s-admit-workspace-');
    roots.push(workspace);
    symlinkSync(repository, join(workspace, 'main-history'));
    const admit = step(jobs['admission'], 'Admit the candidate').run ?? '';
    const env = {
      ADMISSION_ROUTE: 'installed-package',
      RUNNER_TEMP: workspace,
      GITHUB_WORKSPACE: workspace,
      GITHUB_SHA: head,
      GIT_CONFIG_GLOBAL: '/dev/null',
    };

    const refused = execute(admit, { ...env, CANDIDATE_SHA: side });
    expect(refused.code).toBe(78);
    expect(refused.stderr).toContain('is not on main');
    expect(existsSync(join(workspace, 'candidate'))).toBe(false);

    // The merged candidate is checked out, then the absent test package ends the block.
    const admitted = execute(admit, { ...env, CANDIDATE_SHA: merged });
    expect(admitted.stderr).toContain('twilight-bureaucrat/admit.sh');
    const checkedOut = Bun.spawnSync([
      'git',
      '-C',
      join(workspace, 'candidate'),
      'rev-parse',
      'HEAD',
    ]);
    expect(checkedOut.stdout.toString().trim()).toBe(merged);
  });

  it('refuses admission on the archive-launcher route (production run block)', () => {
    const runnerTemp = scratchSync('deploy-k3s-admit-');
    roots.push(runnerTemp);
    const admit = step(jobs['admission'], 'Admit the candidate').run ?? '';
    const refused = execute(admit, {
      ADMISSION_ROUTE: 'archive-launcher',
      RUNNER_TEMP: runnerTemp,
      GITHUB_WORKSPACE: runnerTemp,
      CANDIDATE_SHA: 'a'.repeat(40),
    });
    expect(refused.code).toBe(78);
    expect(refused.stderr).toContain('requires the installed-package route');
    expect(existsSync(join(runnerTemp, 'twilight-bureaucrat/admission.json'))).toBe(false);
  });
});

describe('the puni-deploy runner job-started hook', () => {
  const hook = join(ROOT, 'infra/ci/deploy-runner/job-started.sh');
  const allowed = 'owner/repo/.github/workflows/deploy-k3s.yml@refs/heads/main';
  const start = (env: Record<string, string>) =>
    execute(`bash ${hook}`, { PUNI_DEPLOY_REPOSITORY: 'owner/repo', ...env });

  it('starts only deploy-k3s.yml from main of the configured repository', () => {
    expect(start({ GITHUB_WORKFLOW_REF: allowed }).code).toBe(0);
    for (const ref of [
      'owner/repo/.github/workflows/infra-check.yml@refs/pull/7/merge',
      'owner/repo/.github/workflows/deploy-k3s.yml@refs/heads/feature',
      'fork/repo/.github/workflows/deploy-k3s.yml@refs/heads/main',
    ]) {
      const refused = start({ GITHUB_WORKFLOW_REF: ref });
      expect(refused.code, ref).toBe(1);
      expect(refused.stderr).toContain('puni-deploy runs only');
    }
    expect(start({}).code).toBe(1);
  });

  it('refuses to run without the runner-side repository setting', () => {
    expect(execute(`bash ${hook}`, { GITHUB_WORKFLOW_REF: allowed }).code).not.toBe(0);
  });
});
