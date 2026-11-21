import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';

import type { ReleaseRecord } from './deploy';

export interface CliFixture {
  fault?: string;
  tiers?: 'all' | 'gw';
  dryRun?: boolean;
  credentials?: boolean;
}

function hashBytes(bytes: string): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** Runs the real CLI; only external fetch and SSH are replaced in the child process. */
export async function runCliFixture(options: CliFixture = {}) {
  const root = await scratchAsync('compose-provenance-');
  for (const relative of [
    'dist/tool-remote-scripts/swap.js',
    'dist/tool-smoke/smoke.js',
    'apps/wbs/be-01/drizzle/0001_init/migration.sql',
  ]) {
    await mkdir(dirname(join(root, relative)), { recursive: true });
    await writeFile(join(root, relative), 'owned fixture bytes');
  }
  await mkdir(join(root, 'commands'));
  await writeFile(
    join(root, '.gitignore'),
    '/release.json\n/trace\n/preload.ts\n/responses.json\n',
  );
  await writeFile(
    join(root, 'commands/ssh'),
    `#!/usr/bin/python3
import hashlib,os,sys
command=sys.argv[2]
with open(os.environ['DELIVERY_TRACE'],'a') as trace: trace.write('ssh '+command+'\\n')
if command.startswith('for t in be gw fe;'):
 print('== be absent\\n== gw absent\\n== fe absent')
elif command.startswith('sha256sum '):
 fault=os.environ['DELIVERY_BUNDLE_FAULT']
 if fault=='unreadable-bundle': sys.exit(13)
 if fault!='absent-bundle':
  for path in command.split()[1:]: print(hashlib.sha256(b'stale' if fault=='stale-bundle' else b'owned fixture bytes').hexdigest()+'  '+path)
elif '--preflight' in command or '--execute' in command or 'smoke.js' in command: pass
else: sys.exit(93)
`,
    { mode: 0o700 },
  );
  for (const command of [
    ['git', 'init', '-q'],
    [
      'git',
      'remote',
      'add',
      'origin',
      options.fault === 'unsupported-origin'
        ? 'https://example.invalid/private.git'
        : 'https://github.com/example/project.git',
    ],
    ['git', 'add', '.'],
    [
      'git',
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'fixture',
    ],
  ]) {
    const invocation = Bun.spawnSync(command, { cwd: root });
    if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  }
  const head = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root }).stdout.toString().trim();
  if (options.fault === 'missing-origin') {
    const invocation = Bun.spawnSync(['git', 'remote', 'remove', 'origin'], { cwd: root });
    if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  }
  const responses: Record<string, string> = {};
  const release: ReleaseRecord = {};
  const configDigests: Record<string, string> = {};
  const roles = options.tiers === 'gw' ? (['gw'] as const) : (['be', 'gw', 'fe'] as const);
  for (const role of roles) {
    const label = role === 'fe' && options.fault === 'wrong-label' ? 'b'.repeat(40) : head;
    const config = JSON.stringify({
      config: {
        Labels: role === 'fe' && options.fault === 'missing-label' ? {} : { WBS_SHA: label },
      },
    });
    const configDigest = hashBytes(config);
    configDigests[role] = configDigest;
    const manifest = JSON.stringify({ schemaVersion: 2, config: { digest: configDigest } });
    const manifestDigest = hashBytes(manifest);
    release[role] = {
      sha: head,
      digest: manifestDigest,
      ref: `registry.test/wbs-${role}-01:${head}`,
      image: `registry.test/wbs-${role}-01@${manifestDigest}`,
    };
    responses[`https://registry.test/v2/wbs-${role}-01/manifests/${manifestDigest}`] =
      manifest + (role === 'fe' && options.fault === 'corrupt-manifest' ? ' ' : '');
    responses[`https://registry.test/v2/wbs-${role}-01/blobs/${configDigest}`] =
      config + (role === 'fe' && options.fault === 'corrupt-config' ? ' ' : '');
  }
  if (options.fault === 'tag-only' && release.fe) release.fe.image = release.fe.ref;
  if (options.fault === 'inconsistent-digest' && release.fe)
    release.fe.digest = `sha256:${'b'.repeat(64)}`;
  if (options.fault === 'wrong-release-source' && release.fe) release.fe.sha = 'b'.repeat(40);
  if (options.fault === 'short-release-source' && release.fe) release.fe.sha = 'abc1234';
  if (options.fault === 'credentialed-image' && release.fe)
    release.fe.image = 'https://fixture-user:fixture-secret@registry.test/wbs-fe-01@sha256:bad';
  if (options.fault === 'shell-image' && release.fe)
    release.fe.image += ';touch /tmp/should-never-run';
  if (options.fault === 'bad-optional-publication')
    release.mcp = {
      sha: head,
      digest: 'invalid',
      ref: `registry.test/wbs-mcp-01:${head}`,
      image: 'invalid',
    };
  if (options.fault === 'valid-optional-publication' && release.gw)
    release.mcp = {
      ...release.gw,
      ref: `registry.test/wbs-mcp-01:${head}`,
      image: release.gw.image.replace('wbs-gw-01', 'wbs-mcp-01'),
    };
  const newlineField = {
    'newline-optional-source': 'sha',
    'newline-optional-digest': 'digest',
    'newline-optional-tag': 'ref',
    'newline-optional-image': 'image',
  }[options.fault ?? ''];
  if (newlineField !== undefined && release.gw !== undefined) {
    const optional = {
      ...release.gw,
      ref: `registry.test/wbs-mcp-01:${head}`,
      image: release.gw.image.replace('wbs-gw-01', 'wbs-mcp-01'),
    };
    optional[newlineField as keyof typeof optional] += '\n';
    release.mcp = optional;
  }
  const serialized: Record<string, unknown> = { ...release };
  if (options.fault === 'unknown-role') serialized['surprise'] = release.gw;
  if (options.fault === 'unknown-entry-key' && serialized['gw'])
    serialized['gw'] = { ...release.gw, secret: 'fixture-secret' };
  if (options.fault === 'missing-entry-field' && release.fe)
    delete (serialized['fe'] as Record<string, unknown>)['image'];
  const bundle = join(root, 'release.json');
  await writeFile(
    bundle,
    options.fault === 'malformed-json' ? '{fixture-secret' : JSON.stringify(serialized),
  );
  if (options.fault === 'missing-release') await unlink(bundle);
  if (options.fault === 'unreadable-release') {
    await unlink(bundle);
    await mkdir(bundle);
  }
  const execution = {
    id: 91,
    run_number: 17,
    workflow_id: 3,
    run_attempt: 2,
    head_sha: head,
    head_branch: 'main',
    path: '.github/workflows/ci.yml',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    repository: { full_name: 'example/project' },
  };
  if (options.fault === 'failed-run' || options.fault === 'newer-failed-run')
    execution.conclusion = 'failure';
  if (options.fault === 'cancelled-run') execution.conclusion = 'cancelled';
  if (options.fault === 'incomplete-run') execution.status = 'in_progress';
  if (options.fault === 'wrong-source') execution.head_sha = 'b'.repeat(40);
  if (options.fault === 'wrong-repository') execution.repository.full_name = 'example/other';
  if (options.fault === 'wrong-branch') execution.head_branch = 'other';
  if (options.fault === 'pr-run') execution.event = 'pull_request';
  if (options.fault === 'wrong-workflow') execution.path = '.github/workflows/other.yml';
  const checks = ['gate', 'pixels'].map((name, index) => ({
    id: 101 + index,
    run_id: 91,
    run_attempt: 2,
    head_sha: execution.head_sha,
    name,
    status: 'completed',
    conclusion: 'success',
  }));
  if (options.fault === 'missing-check') checks.pop();
  if (options.fault === 'duplicate-check') checks.push({ ...checks[1], id: 103 });
  if (options.fault === 'failed-check') checks[1].conclusion = 'failure';
  if (options.fault === 'incomplete-check') checks[1].status = 'in_progress';
  if (options.fault === 'retry-failed-check')
    checks.push({ ...checks[1], id: 104, run_attempt: 1 });
  if (options.fault === 'retry-failed-check') checks[1].conclusion = 'failure';
  if (options.fault === 'carried-pixels') checks[1].run_attempt = 1;
  const executions =
    options.fault === 'no-run'
      ? []
      : options.fault === 'newer-failed-run'
        ? [{ ...execution, id: 90, run_number: 16, conclusion: 'success' }, execution]
        : [execution];
  const actions = 'https://api.github.com/repos/example/project/actions';
  responses[
    `${actions}/workflows/ci.yml/runs?head_sha=${head}&event=push&branch=main&per_page=100`
  ] = JSON.stringify({ total_count: executions.length, workflow_runs: executions });
  responses[`${actions}/runs/91`] = JSON.stringify(execution);
  responses[`${actions}/runs/91/jobs?filter=all&per_page=100&page=1`] = JSON.stringify({
    total_count: checks.length,
    jobs: checks,
  });
  await writeFile(join(root, 'responses.json'), JSON.stringify(responses));
  await writeFile(
    join(root, 'preload.ts'),
    `import {appendFileSync,readFileSync,writeFileSync} from 'node:fs';
const responses=JSON.parse(readFileSync(${JSON.stringify(join(root, 'responses.json'))},'utf8'));
globalThis.fetch=async (input,init)=>{
 const url=String(input);
 if(${JSON.stringify(options.fault === 'mutable-release')}) writeFileSync(${JSON.stringify(bundle)},'{replaced after planning');
 appendFileSync(${JSON.stringify(join(root, 'trace'))},'fetch '+url+'\\n');
 if(!Object.hasOwn(responses,url)) throw new Error('FIXTURE_MISS '+url);
 return new Response(responses[url],{status:200,headers:{'content-type':'application/json'}});
};
`,
  );
  const child = Bun.spawn(
    [
      process.execPath,
      '--preload',
      join(root, 'preload.ts'),
      join(import.meta.dir, 'deploy.ts'),
      options.tiers === 'gw' ? 'gw' : '--all',
      ...(options.dryRun ? [] : ['--execute']),
      '--host=fixture',
      `--bundle=${bundle}`,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        REGISTRY: options.credentials ? 'registry.test' : undefined,
        REGISTRY_USER: undefined,
        REGISTRY_PASS: undefined,
        PUNI_REGISTRY_AUTH: options.credentials ? 'fixture-user:fixture-secret' : undefined,
        PATH: `${root}/commands:${process.env['PATH'] ?? ''}`,
        DELIVERY_TRACE: join(root, 'trace'),
        DELIVERY_BUNDLE_FAULT: options.fault ?? '',
        REGISTRY_DEPLOYMENT_ENROLLMENT: '/absent-legacy-deployment',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [code, output, diagnostic] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const trace = (await readFile(join(root, 'trace'), 'utf8')).trim().split('\n');
  if ((output + diagnostic).includes('FIXTURE_MISS')) throw new Error(diagnostic);
  return { code, output, diagnostic, trace, head, configDigests };
}
