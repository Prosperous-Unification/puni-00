import { readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspect } from 'node:util';

import { createLaunch } from '@shared/bun-startup';
import { expect, test } from 'bun:test';

import { createExecutionFixture } from './performance-execution-fixture';
import { createPerformanceProcessOwner } from './performance-processes';

async function awaitWithin<Value>(promise: Promise<Value>, milliseconds: number): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_accept, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Performance failure priority observation did not settle'));
        }, milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function requireAbsent(pid: number): void {
  try {
    readFileSync('/proc/' + String(pid) + '/stat');
  } catch (cause) {
    if (cause !== null && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT')
      return;
    throw cause;
  }
  throw new Error('Recorded actual child remains after cleanup: ' + String(pid));
}

function readRecords(path: string): Record<string, unknown>[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parsed: unknown = JSON.parse(line);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('Actual priority trace malformed');
      // The isolated test observer writes records; each consumed field is checked at its oracle.
      return parsed as Record<string, unknown>;
    });
}

/** Actual earlier Vite failure versus a later caller signal; no fabricated child status or judge answer. */
test('Performance preserves an earlier execution failure when SIGTERM arrives during actual checkout cleanup', async () => {
  const fixture = await createExecutionFixture('failure');
  const runtime = pathToFileURL(join(import.meta.dir, 'performance-level.ts')).href;
  async function observe(tag: string, lateSignal: boolean): Promise<void> {
    const harness = join(fixture.parent, tag + '.mjs'),
      trace = join(fixture.parent, tag + '.jsonl');
    const receipt = join(fixture.parent, tag + '.json'),
      delivered = join(fixture.parent, tag + '-signal.json');
    writeFileSync(trace, '', { flag: 'wx' });
    writeFileSync(
      harness,
      `import{appendFileSync,writeFileSync}from'node:fs';import{runPerformanceLevel}from${JSON.stringify(runtime)};
const native=Bun.spawn,nativeSync=Bun.spawnSync;const observed=[],failures=[];let armed=0;
const append=value=>{try{appendFileSync(${JSON.stringify(trace)},JSON.stringify(value)+'\\n')}catch(cause){failures.push(cause)}};
Bun.spawn=(argv,options)=>{const child=native(argv,options);append({kind:'spawn',pid:child.pid,argv,cwd:options?.cwd});observed.push(child.exited.then(code=>append({kind:'exit',pid:child.pid,code}),cause=>{failures.push(cause)}));return child;};
if(${JSON.stringify(lateSignal)})process.once('SIGTERM',()=>writeFileSync(${JSON.stringify(delivered)},JSON.stringify({phase:'actual-late-signal-delivered',pid:process.pid,armed})));
Bun.spawnSync=(argv,options)=>{const child=nativeSync(argv,options);if(Array.isArray(argv)&&argv.includes('worktree')&&argv.includes('remove')){append({kind:'worktree-removal',argv,exitCode:child.exitCode});if(${JSON.stringify(lateSignal)}&&child.exitCode===0){armed++;if(armed!==1)throw new Error('Late cleanup signal armed twice');process.kill(process.pid,'SIGTERM')}}return child;};
let failed=false,primary;try{await runPerformanceLevel(${JSON.stringify(fixture.root)},${JSON.stringify(fixture.policy)})}catch(cause){failed=true;primary=cause}await Promise.all(observed);Bun.spawn=native;Bun.spawnSync=nativeSync;
if(failures.length)throw new AggregateError(failed?[primary,...failures]:failures,'Actual priority observer failed');
const messages=[],seen=new Set(),pending=failed?[primary]:[];while(pending.length){const cause=pending.shift();if(cause!==null&&typeof cause==='object'){if(seen.has(cause))continue;seen.add(cause)}messages.push(String(cause));if(cause instanceof AggregateError)pending.push(...cause.errors);if(cause instanceof Error&&Object.hasOwn(cause,'cause'))pending.push(cause.cause);if(messages.length>64)throw new Error('Actual priority failure chain too large')}
writeFileSync(${JSON.stringify(receipt)},JSON.stringify({failed,messages,armed}));if(failed)process.exitCode=1;
`,
    );
    const owner = createPerformanceProcessOwner();
    let stopping: Promise<void> | undefined;
    const stop = (): Promise<void> => (stopping ??= owner.stop());
    const channels: Promise<PromiseSettledResult<number | string>>[] = [];
    const capture = <Value extends number | string>(promise: Promise<Value>): void => {
      channels.push(
        promise.then(
          (value): PromiseFulfilledResult<Value> => ({ status: 'fulfilled', value }),
          (reason: unknown): PromiseRejectedResult => ({ status: 'rejected', reason }),
        ),
      );
    };
    let primary: { cause: unknown } | undefined;
    let callerPid: number | undefined;
    let known = false;
    try {
      const child = owner.spawn(
        [...createLaunch(process.execPath, harness)],
        fixture.root,
        fixture.environment,
        { stdout: 'pipe', stderr: 'pipe' },
      );
      callerPid = child.pid;
      capture(child.exited);
      const stdout = child.stdout;
      if (!(stdout instanceof ReadableStream)) throw new Error('Actual priority stdout absent');
      capture(new Response(stdout).text());
      const stderr = child.stderr;
      if (!(stderr instanceof ReadableStream)) throw new Error('Actual priority stderr absent');
      capture(new Response(stderr).text());
      const settled = await awaitWithin(Promise.all(channels), 120_000);
      const causes = settled.flatMap((channel) =>
        channel.status === 'rejected' ? [channel.reason as unknown] : [],
      );
      if (causes.length !== 0)
        throw new AggregateError(causes, 'Actual priority numeric/EOF failed');
      const exit = settled.at(0),
        errors = settled.at(2);
      if (
        exit?.status !== 'fulfilled' ||
        typeof exit.value !== 'number' ||
        errors?.status !== 'fulfilled'
      )
        throw new Error('Actual priority channel identities malformed');
      await stop();
      requireAbsent(child.pid);
      const records = readRecords(trace);
      for (const record of records)
        if (record['kind'] === 'spawn') {
          if (typeof record['pid'] !== 'number')
            throw new Error('Actual observed priority PID malformed');
          requireAbsent(record['pid']);
        }
      known = true;
      const builds = records.filter(
        (record) =>
          record['kind'] === 'spawn' &&
          Array.isArray(record['argv']) &&
          record['argv'].includes('build'),
      );
      expect(builds).toHaveLength(1);
      const build = builds.at(0);
      if (build === undefined || typeof build['pid'] !== 'number')
        throw new Error('Actual failed build PID absent');
      const actualRecords: unknown = records;
      const expectedExits: unknown = expect.arrayContaining([
        expect.objectContaining({ kind: 'exit', pid: build['pid'], code: 1 }),
      ]);
      expect(actualRecords).toEqual(expectedExits);
      const removals: unknown = records.filter((record) => record['kind'] === 'worktree-removal');
      const expectedRemovals: unknown = [expect.objectContaining({ exitCode: 0 })];
      expect(removals).toEqual(expectedRemovals);
      if (lateSignal)
        expect(JSON.parse(readFileSync(delivered, 'utf8'))).toMatchObject({
          phase: 'actual-late-signal-delivered',
          pid: child.pid,
          armed: 1,
        });
      writeFileSync(
        join(fixture.parent, tag + '-observation.json'),
        JSON.stringify({
          callerPid: child.pid,
          callerExitCode: exit.value,
          lateSignal,
          knownOuterCustody: true,
        }) + '\n',
      );
      // Real build failure and real later signal delivery precede this terminal-fate oracle.
      expect(exit.value, String(errors.value)).toBe(1);
      const observation: unknown = JSON.parse(readFileSync(receipt, 'utf8'));
      const expectedMessages: unknown = expect.arrayContaining([
        expect.stringContaining('Performance frontend build failed'),
      ]);
      const expectedFailure = { failed: true, messages: expectedMessages };
      expect(observation).toMatchObject(expectedFailure);
    } catch (cause) {
      primary = { cause };
    }
    const causes: unknown[] = primary === undefined ? [] : [primary.cause];
    const append = (cause: unknown): void => {
      if (!causes.some((held) => Object.is(held, cause))) causes.push(cause);
    };
    try {
      await stop();
    } catch (cause) {
      known = false;
      append(cause);
    }
    try {
      const settled = await awaitWithin(Promise.all(channels), 10_000);
      for (const channel of settled)
        if (channel.status === 'rejected') append(channel.reason as unknown);
      if (settled.length !== 3 || settled.some((channel) => channel.status !== 'fulfilled'))
        known = false;
    } catch (cause) {
      known = false;
      append(cause);
    }
    try {
      if (callerPid !== undefined) requireAbsent(callerPid);
    } catch (cause) {
      known = false;
      append(cause);
    }
    if (!known)
      append(new Error('Actual priority native custody unknown; retain ' + fixture.parent));
    if (causes.length !== 0)
      throw new AggregateError(causes, 'Actual Performance failure-priority owner failed');
  }
  try {
    await observe('earlier-failure', false);
    await observe('earlier-failure-later-signal', true);
    await rm(fixture.parent, { recursive: true });
  } catch (cause) {
    throw new Error(
      'Actual Performance failure-priority fixture retained: ' +
        fixture.parent +
        '\n' +
        inspect(cause, { depth: 8, maxArrayLength: 32, maxStringLength: 4096 }),
      { cause },
    );
  }
}, 300_000);
