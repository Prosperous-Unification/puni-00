import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeAll, expect, it } from 'bun:test';

import { createInstalledLintFixture } from '../testing/installed-lint-fixtures';
import { buildLintLauncher } from './build-lint-launcher';
import { checkPreparedActivation, PreparedSelfCheckFailure } from './prepared-self-check';

let launcher: Uint8Array;
const fixtures: ReturnType<typeof createInstalledLintFixture>[] = [];
beforeAll(async () => {
  launcher = await buildLintLauncher();
});
function isGone(pid: number) {
  try {
    process.kill(-pid, 0);
    return false;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') return true;
    throw cause;
  }
}
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    fixture.interrupt('SIGTERM');
    const stage = join(fixture.root, 'stage.pid');
    if (existsSync(stage)) {
      const pid = Number(readFileSync(stage, 'utf8'));
      for (let attempt = 0; attempt < 1000 && !isGone(pid); attempt++) await Bun.sleep(5);
      if (!isGone(pid))
        throw new Error(
          'retained actual self-check fixture after unconfirmed stage cleanup: ' + fixture.root,
        );
    }
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
function createActual(validator: string | ((root: string) => string)) {
  const fixture = createInstalledLintFixture(launcher, validator);
  fixtures.push(fixture);
  const commit = Bun.spawnSync(
    [
      '/usr/bin/git',
      '-C',
      fixture.candidate,
      '-c',
      'user.name=PUNI Self Check',
      '-c',
      'user.email=puni-self-check@example.test',
      'commit',
      '--allow-empty',
      '-m',
      'fixture',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  if (commit.exitCode !== 0)
    throw new Error('self-check fixture commit failed: ' + commit.stderr.toString());
  const context = {
    launcher: join(fixture.toolkit, 'launcher.mjs'),
    callerDirectory: fixture.root,
    lookup: { directory: fixture.root, path: '/usr/bin:/bin' },
    activationRoot: 'archive',
    scratchDirectory: 'scratch',
    repository: 'candidate',
    revision: 'HEAD',
    launch: fixture.context.launch,
    subscribeInterrupts: fixture.context.subscribeInterrupts,
  };
  return { fixture, context };
}
const certificate = {
  schemaVersion: 1,
  mode: 'enforce',
  trustProvenance: 'ci-preselected',
  accepted: true,
  certified: true,
};

it('runs committed self-certification through the actual delivered launcher and archive-default closure', async () => {
  const { fixture, context } = createActual(
    'const envelope=JSON.parse(await Bun.stdin.text());process.stdout.write(JSON.stringify({...' +
      JSON.stringify(certificate) +
      ',echo:{callerDirectory:envelope.callerDirectory,request:envelope.request,closure:process.env.TOOL_WIKI_TRUSTED_NODE_MODULES}}));',
  );
  const previous = process.env['TOOL_WIKI_TRUSTED_NODE_MODULES'];
  process.env['TOOL_WIKI_TRUSTED_NODE_MODULES'] = '/operator/poison-closure';
  try {
    const outcome = await checkPreparedActivation(context);
    if (outcome.kind !== 'certified') throw new Error('actual self-check did not certify');
    const report: unknown = JSON.parse(Buffer.from(outcome.report).toString());
    expect(report).toMatchObject({
      ...certificate,
      echo: {
        callerDirectory: fixture.root,
        request: {
          command: 'lint-ci',
          kind: 'committed',
          repository: fixture.candidate,
          revision: 'HEAD',
        },
        closure: join(fixture.archive, 'trusted-node-modules'),
      },
    });
    expect(outcome.diagnostics.length).toBe(0);
    expect(readdirSync(fixture.scratch)).toEqual([]);
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, 'TOOL_WIKI_TRUSTED_NODE_MODULES');
    else process.env['TOOL_WIKI_TRUSTED_NODE_MODULES'] = previous;
  }
});

it('requires admission78 from the actual launcher when its validator reports only certified true', async () => {
  const { fixture, context } = createActual(
    'process.stdout.write(JSON.stringify({certified:true}));',
  );
  const cause: unknown = await checkPreparedActivation(context).then(
    () => {
      throw new Error('missing certificate unexpectedly passed');
    },
    (cause: unknown) => cause,
  );
  expect(cause).toBeInstanceOf(PreparedSelfCheckFailure);
  if (!(cause instanceof PreparedSelfCheckFailure))
    throw new Error('wrong actual self-check refusal', { cause });
  expect(cause.status).toBe(78);
  expect(Buffer.from(cause.report.bytes).toString()).toBe('{"certified":true}');
  expect(cause.diagnostics.kind).toBe('complete');
  expect(Buffer.from(cause.diagnostics.bytes).toString()).toContain('required admission');
  expect(readdirSync(fixture.scratch)).toEqual([]);
});

it('delivers first cancellation through the actual self-check chain and confirms stage cleanup', async () => {
  const { fixture, context } = createActual(
    (root) =>
      'import{writeFileSync}from"node:fs";process.on("SIGINT",()=>undefined);writeFileSync(' +
      JSON.stringify(join(root, 'stage.pid')) +
      ',String(process.pid));await Bun.sleep(3000);',
  );
  const pending = checkPreparedActivation(context);
  const stage = join(fixture.root, 'stage.pid');
  try {
    for (let attempt = 0; attempt < 1000 && !existsSync(stage); attempt++) await Bun.sleep(5);
    if (!existsSync(stage)) throw new Error('actual self-check stage did not start');
    fixture.interrupt('SIGINT');
    expect(await pending).toMatchObject({ kind: 'cancelled', status: 130 });
    expect(isGone(Number(readFileSync(stage, 'utf8')))).toBe(true);
    expect(readdirSync(fixture.scratch)).toEqual([]);
  } finally {
    fixture.interrupt('SIGTERM');
    await Promise.allSettled([pending]);
  }
});
