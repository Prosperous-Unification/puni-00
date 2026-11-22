import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from 'bun:test';

import { createPerformanceProcessOwner } from './performance-processes';

async function awaitWithin<Value>(pending: Promise<Value>, milliseconds: number): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Browser retention supervisor did not settle'));
        }, milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
function assertAbsent(pid: number): void {
  try {
    readFileSync('/proc/' + String(pid) + '/stat');
  } catch (cause) {
    if (cause !== null && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT')
      return;
    throw cause;
  }
  throw new Error('Browser custody PID remains or was reused: ' + String(pid));
}
function commit(repository: string): void {
  for (const args of [
    ['init', '-q'],
    ['config', 'user.name', 'Browser custody'],
    ['config', 'user.email', 'browser-custody@example.invalid'],
    ['add', '.'],
    ['commit', '-qm', 'actual Browser custody fixture'],
  ]) {
    const child = Bun.spawnSync(['/usr/bin/git', '-C', repository, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PATH: '/usr/bin:/bin',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
      },
      timeout: 30000,
    });
    if (child.exitCode !== 0)
      throw new Error('Browser fixture Git failed: ' + child.stderr.toString());
  }
}
async function observe(root: string, repository: string, fault: boolean) {
  const tag = fault ? 'unreadable-exit' : 'healthy';
  const harness = join(root, tag + '.mjs'),
    receipt = join(root, tag + '.json'),
    trace = join(root, tag + '.jsonl');
  const source = pathToFileURL(join(import.meta.dir, 'browser-level.ts')).href;
  writeFileSync(
    harness,
    `import{appendFileSync,writeFileSync}from'node:fs';import{runBrowserLevel}from${JSON.stringify(source)};
const native=Bun.spawn;const observations=[];const observerFailures=[];let armed=0;
const append=record=>{try{appendFileSync(${JSON.stringify(trace)},JSON.stringify(record)+'\\n')}catch(cause){observerFailures.push(cause)}};
Bun.spawn=(...args)=>{const child=native(...args);const exit=child.exited;const nativeThen=exit.then.bind(exit);append({kind:'spawn',pid:child.pid,argv:args[0],cwd:args[1]?.cwd});observations.push(nativeThen(code=>append({kind:'actual-exit',pid:child.pid,code}),cause=>{observerFailures.push(cause)}));
if(${JSON.stringify(fault)}&&Array.isArray(args[0])&&args[0].includes('build')&&args[0].includes('libs/wbs/application/core/testing/portable-composition.ts')){armed++;const injected=new Error('injected actual Browser build exit subscriber failure');exit.then=(fulfilled,rejected)=>nativeThen(()=>{if(rejected!==undefined)return rejected(injected);throw injected},cause=>{if(rejected!==undefined)return rejected(cause);throw cause});}
return child;};
let primary;let failed=false;try{await runBrowserLevel(${JSON.stringify(repository)},'portable')}catch(cause){failed=true;primary=cause}await Promise.all(observations);Bun.spawn=native;
if(observerFailures.length)throw new AggregateError(failed?[primary,...observerFailures]:observerFailures,'Actual Browser observer failed');
const messages=[];const seen=new Set();const pending=failed?[primary]:[];while(pending.length){const cause=pending.shift();if(cause!==null&&typeof cause==='object'){if(seen.has(cause))continue;seen.add(cause)}messages.push(String(cause));if(cause instanceof AggregateError)pending.push(...cause.errors);if(cause instanceof Error&&Object.hasOwn(cause,'cause'))pending.push(cause.cause);if(messages.length>64)throw new Error('Browser diagnostic chain too deep')}
writeFileSync(${JSON.stringify(receipt)},JSON.stringify({ok:!failed,armed,messages}));
`,
  );
  const path = process.env['PATH'],
    home = process.env['HOME'];
  if (path === undefined || home === undefined)
    throw new Error('Browser custody requires actual PATH and HOME');
  const owner = createPerformanceProcessOwner();
  let stopping: Promise<void> | undefined;
  const stop = () => (stopping ??= owner.stop());
  let primary: { cause: unknown } | undefined;
  let known = false;
  let observed: { receipt: unknown; spawns: Record<string, unknown>[] } | undefined;
  let channels: Promise<PromiseSettledResult<number | string>[]> | undefined;
  try {
    const child = owner.spawn(
      [process.execPath, '--no-env-file', '--config=/dev/null', harness],
      repository,
      { PATH: path, HOME: home, LANG: 'C.UTF-8' },
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const stdout = child.stdout,
      stderr = child.stderr;
    if (!(stdout instanceof ReadableStream) || !(stderr instanceof ReadableStream))
      throw new Error('Browser supervisor pipes absent');
    channels = Promise.allSettled([
      child.exited,
      new Response(stdout).text(),
      new Response(stderr).text(),
    ]);
    const closed = await awaitWithin(channels, 120000);
    const failures = closed.flatMap((channel) =>
      channel.status === 'rejected' ? [channel.reason as unknown] : [],
    );
    if (failures.length) throw new AggregateError(failures, 'Browser supervisor exit/EOF rejected');
    const exit = closed.at(0),
      out = closed.at(1),
      err = closed.at(2);
    if (
      exit?.status !== 'fulfilled' ||
      typeof exit.value !== 'number' ||
      out?.status !== 'fulfilled' ||
      err?.status !== 'fulfilled'
    )
      throw new Error('Browser supervisor settlement malformed');
    await stop();
    assertAbsent(child.pid);
    const spawns = readFileSync(trace, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const value: unknown = JSON.parse(line);
        if (value === null || typeof value !== 'object' || Array.isArray(value))
          throw new Error('Browser trace malformed');
        return value as Record<string, unknown>;
      });
    for (const record of spawns)
      if (record['kind'] === 'spawn') {
        if (typeof record['pid'] !== 'number') throw new Error('Browser recorded PID malformed');
        assertAbsent(record['pid']);
      }
    known = true;
    expect(exit.value, String(err.value)).toBe(0);
    observed = { receipt: JSON.parse(readFileSync(receipt, 'utf8')) as unknown, spawns };
  } catch (cause) {
    primary = { cause };
  }
  const cleanupFailures: unknown[] = [];
  try {
    await stop();
  } catch (cleanup) {
    cleanupFailures.push(cleanup);
    known = false;
  }
  if (!known) {
    const failures: unknown[] = primary === undefined ? [] : [primary.cause];
    const append = (cause: unknown) => {
      if (!failures.some((held) => Object.is(held, cause))) failures.push(cause);
    };
    for (const cause of cleanupFailures) append(cause);
    if (channels !== undefined)
      try {
        const final = await awaitWithin(channels, 10000);
        for (const channel of final)
          if (channel.status === 'rejected') append(channel.reason as unknown);
      } catch (cause) {
        append(cause);
      }
    append(new Error('Browser custody unconfirmed; retain ' + root));
    throw new AggregateError(failures, 'Browser retention observation failed');
  }
  if (primary !== undefined) throw primary.cause;
  if (observed === undefined) throw new Error('Browser retention observation absent');
  return observed;
}

test('Browser retains the real collector checkout when an actual build exit observation is unreadable', async () => {
  const root = mkdtempSync(join(tmpdir(), 'puni-browser-retention-first-')),
    repository = join(root, 'candidate');
  try {
    mkdirSync(join(repository, 'libs/wbs/application/core/testing'), { recursive: true });
    writeFileSync(
      join(repository, '.gitignore'),
      'tmp/\nnode_modules\ndist/\ntest-results/\nplaywright-report/\n',
    );
    writeFileSync(
      join(repository, 'libs/wbs/application/core/testing/portable-composition.ts'),
      'export const genuineBrowserBuild = true;\n',
    );
    writeFileSync(
      join(repository, 'libs/wbs/application/core/playwright.config.ts'),
      "import{defineConfig}from'@playwright/test';export default defineConfig({testDir:'./testing',testMatch:'**/custody.spec.ts',projects:[{name:'chromium'}],workers:1,retries:0,timeout:30000});\n",
    );
    writeFileSync(
      join(repository, 'libs/wbs/application/core/testing/custody.spec.ts'),
      "import{test,expect}from'@playwright/test';test('real Browser custody baseline',()=>{expect(typeof process.versions.bun).toBe('string')});\n",
    );
    commit(repository);
    const healthy = await observe(root, repository, false);
    expect(healthy.receipt).toMatchObject({ ok: true, armed: 0, messages: [] });
    const fault = await observe(root, repository, true);
    expect(fault.receipt).toMatchObject({ ok: false, armed: 1 });
    if (
      fault.receipt === null ||
      typeof fault.receipt !== 'object' ||
      !('messages' in fault.receipt) ||
      !Array.isArray(fault.receipt.messages)
    )
      throw new Error('Actual Browser fault receipt malformed');
    expect(fault.receipt.messages.join('\n')).toContain(
      'injected actual Browser build exit subscriber failure',
    );
    const builds = fault.spawns.filter(
      (record) =>
        record['kind'] === 'spawn' &&
        Array.isArray(record['argv']) &&
        record['argv'].includes('build') &&
        record['argv'].includes('libs/wbs/application/core/testing/portable-composition.ts'),
    );
    expect(builds).toHaveLength(1);
    const build = builds.at(0);
    if (build === undefined || typeof build['cwd'] !== 'string')
      throw new Error('Actual Browser build cwd absent');
    // Genuine healthy run, actual dependency rejection and outer native closure precede physical retention.
    expect(existsSync(build['cwd'])).toBe(true);
    expect(existsSync(dirname(build['cwd']))).toBe(true);
    process.stdout.write('Known-owned Browser cleanup-refusal artifacts retained: ' + root + '\n');
  } catch (cause) {
    throw new Error('Browser retention owner failed; retained ' + root, { cause });
  }
}, 180000);
