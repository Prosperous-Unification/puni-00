import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspect } from 'node:util';

import { createLaunch } from '@shared/bun-startup';
import { expect } from 'bun:test';

import { createExecutionFixture, fixtureHasCurrent } from './performance-execution-fixture';
import { createPerformanceProcessOwner } from './performance-processes';
import { processOwnerTest } from './process-owner-test';

const test = processOwnerTest(import.meta.path);

async function awaitWithin<Value>(pending: Promise<Value>, milliseconds: number): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_accept, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Performance judge owner observation did not settle'));
        }, milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function isProcessAbsent(pid: number): boolean {
  try {
    readFileSync('/proc/' + String(pid) + '/stat');
  } catch (cause) {
    if (cause !== null && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT')
      return true;
    throw cause;
  }
  return false;
}

/** Actual source runtime and actual Burokrat program; only a child preload delays its independent request. */
test('Performance cancellation settles its actual pending independent judge before the caller exits', async () => {
  const fixture = await createExecutionFixture('success');
  const source = pathToFileURL(join(import.meta.dir, 'performance-level.ts')).href;
  const judge = join(
    import.meta.dir,
    '../../../apps/twilight-structure/twilight-burokrat/cli/src/cli.ts',
  );
  const hold = join(fixture.parent, 'hold actual judge.mjs');
  const judgePidPath = join(fixture.parent, 'held-judge.pid');
  const launched = join(fixture.parent, 'held-judge-launch.json');
  writeFileSync(
    hold,
    `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(judgePidPath)},String(process.pid));setInterval(()=>{},1000);await new Promise(()=>{});\n`,
  );
  const healthy = join(fixture.parent, 'healthy source runtime.mjs');
  writeFileSync(
    healthy,
    `import{runPerformanceLevel}from${JSON.stringify(source)};await runPerformanceLevel(${JSON.stringify(fixture.root)},${JSON.stringify(fixture.policy)});\n`,
  );
  const pending = join(fixture.parent, 'pending source runtime.mjs');
  writeFileSync(
    pending,
    `import{writeFileSync}from'node:fs';import{runPerformanceLevel}from${JSON.stringify(source)};
const native=Bun.spawn;const nativeSync=Bun.spawnSync;let armed=false;
function operands(argv){if(!Array.isArray(argv)||!argv.includes('candidate-identity')||!argv.includes(${JSON.stringify(judge)}))return argv;if(armed)throw new Error('Actual judge delay armed twice');armed=true;const boundary=argv.indexOf(${JSON.stringify(judge)});const delayed=[...argv.slice(0,boundary),'--preload',${JSON.stringify(hold)},...argv.slice(boundary)];writeFileSync(${JSON.stringify(launched)},JSON.stringify({original:argv,delayed}));return delayed;}
Bun.spawn=(argv,options)=>native(operands(argv),options);Bun.spawnSync=(argv,options)=>nativeSync(operands(argv),options);
await runPerformanceLevel(${JSON.stringify(fixture.root)},${JSON.stringify(fixture.policy)});
`,
  );

  async function observe(entrypoint: string, cancel: boolean): Promise<void> {
    const owner = createPerformanceProcessOwner();
    let stopping: Promise<void> | undefined;
    const stop = (): Promise<void> => (stopping ??= owner.stop());
    const channels: Promise<PromiseSettledResult<number | string>>[] = [];
    const retain = <Value extends number | string>(promise: Promise<Value>): void => {
      channels.push(
        promise.then(
          (value): PromiseFulfilledResult<Value> => ({ status: 'fulfilled', value }),
          (reason: unknown): PromiseRejectedResult => ({ status: 'rejected', reason }),
        ),
      );
    };
    let primary: { cause: unknown } | undefined;
    let childPid: number | undefined;
    let heldPid: number | undefined;
    try {
      const child = owner.spawn(
        [...createLaunch(process.execPath, entrypoint)],
        fixture.root,
        fixture.environment,
        { stdout: 'pipe', stderr: 'pipe' },
      );
      childPid = child.pid;
      retain(child.exited);
      const stdout = child.stdout;
      if (!(stdout instanceof ReadableStream)) throw new Error('Actual runtime stdout pipe absent');
      retain(new Response(stdout).text());
      const stderr = child.stderr;
      if (!(stderr instanceof ReadableStream)) throw new Error('Actual runtime stderr pipe absent');
      retain(new Response(stderr).text());
      if (cancel) {
        const deadline = Date.now() + 15_000;
        while (!existsSync(judgePidPath) && Date.now() < deadline) await Bun.sleep(20);
        const encodedPid = await readFile(judgePidPath, 'utf8');
        if (!/^[1-9][0-9]*$/u.test(encodedPid))
          throw new Error('Actual delayed judge PID malformed');
        heldPid = Number(encodedPid);
        if (!Number.isSafeInteger(heldPid))
          throw new Error('Actual delayed judge PID exceeds integer range');
        expect(isProcessAbsent(heldPid)).toBe(false);
        const launch: unknown = JSON.parse(await readFile(launched, 'utf8'));
        const expectedOriginal: unknown = expect.arrayContaining([
          process.execPath,
          judge,
          'candidate-identity',
        ]);
        const expectedLaunch = { original: expectedOriginal };
        expect(launch).toMatchObject(expectedLaunch);
        // Signal only the real caller. Outer cleanup has not run and cannot mask the ownership oracle.
        process.kill(child.pid, 'SIGTERM');
      }
      const settled = await awaitWithin(Promise.all(channels), cancel ? 30_000 : 120_000);
      const causes = settled.flatMap((channel) =>
        channel.status === 'rejected' ? [channel.reason as unknown] : [],
      );
      if (causes.length !== 0)
        throw new AggregateError(causes, 'Actual runtime numeric exit or EOF failed');
      const exit = settled.at(0),
        errors = settled.at(2);
      if (
        exit?.status !== 'fulfilled' ||
        typeof exit.value !== 'number' ||
        errors?.status !== 'fulfilled'
      )
        throw new Error('Actual runtime channel identities malformed');
      expect(exit.value, String(errors.value)).toBe(cancel ? 143 : 0);
      if (cancel) {
        if (heldPid === undefined) throw new Error('Actual delayed judge identity absent');
        // This observes production cancellation before the independent parent owner can reap anything.
        const judgeAbsent = isProcessAbsent(heldPid);
        writeFileSync(
          join(fixture.parent, 'cancellation-before-outer-stop.json'),
          JSON.stringify({
            phase: 'caller-exit-and-EOF-settled-before-outer-stop',
            callerPid: child.pid,
            callerExitCode: exit.value,
            judgePid: heldPid,
            judgeAbsent,
          }) + '\n',
        );
        expect(judgeAbsent).toBe(true);
      }
    } catch (cause) {
      primary = { cause };
    }
    const failures: unknown[] = primary === undefined ? [] : [primary.cause];
    const append = (cause: unknown): void => {
      if (!failures.some((previous) => Object.is(previous, cause))) failures.push(cause);
    };
    let stopped = false;
    try {
      await stop();
      stopped = true;
    } catch (cause) {
      append(cause);
    }
    let channelsClosed = false;
    try {
      const settled = await awaitWithin(Promise.all(channels), 10_000);
      for (const channel of settled)
        if (channel.status === 'rejected') append(channel.reason as unknown);
      channelsClosed =
        channels.length === 3 && settled.every((channel) => channel.status === 'fulfilled');
    } catch (cause) {
      append(cause);
    }
    let processesAbsent = true;
    for (const pid of [childPid, heldPid]) {
      if (pid === undefined) continue;
      try {
        if (!isProcessAbsent(pid))
          throw new Error('Actual observed PID remains after outer cleanup: ' + String(pid));
      } catch (cause) {
        processesAbsent = false;
        append(cause);
      }
    }
    const known = stopped && channelsClosed && processesAbsent;
    if (!known) append(new Error('Actual native custody unknown; retain ' + fixture.parent));
    if (failures.length !== 0)
      throw new AggregateError(failures, 'Pending judge owner failed; retained ' + fixture.parent);
  }

  try {
    await observe(healthy, false);
    expect(fixtureHasCurrent(fixture)).toBe(true);
    await observe(pending, true);
    await rm(fixture.parent, { recursive: true });
  } catch (cause) {
    throw new Error(
      'Actual Performance judge cancellation fixture retained: ' +
        fixture.parent +
        '\n' +
        inspect(cause, { depth: 8, maxArrayLength: 32, maxStringLength: 4096 }),
      { cause },
    );
  }
}, 180_000);
