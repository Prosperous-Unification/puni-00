import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { expect, it } from 'bun:test';

const rootEntrypoint = fileURLToPath(new URL('../entrypoint.ts', import.meta.url));
const projects = '--projects=wbs-be-01,wbs-gw-01,wbs-fe-01,wbs-mcp-01';
const header = Buffer.from('\u001b[32mSTART\u001b[39m\n');
const footer = Buffer.from('\u001b[31mEND\u001b[39m\n');
function payload(bytes: number): Buffer {
  const selected = Buffer.alloc(bytes);
  for (let at = 0; at < bytes; at++) selected[at] = (at * 29 + 17) & 255;
  return selected;
}
function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function createWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'puni executable dev IO '));
  const repository = join(root, 'consumer checkout');
  const directory = join(repository, 'node_modules/nx');
  mkdirSync(join(directory, 'dist/bin'), { recursive: true });
  writeFileSync(join(repository, 'package.json'), '{"private":true}\n');
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({ name: 'nx', type: 'commonjs', bin: { nx: './dist/bin/nx.js' } }),
  );
  const record = join(root, 'producer.json');
  const nx = join(directory, 'dist/bin/nx.js');
  writeFileSync(
    nx,
    [
      'const fs=require("node:fs");',
      'const size=Number(process.env.PUNI_IO_BYTES);const bytes=Buffer.alloc(size);for(let at=0;at<size;at++)bytes[at]=(at*29+17)&255;',
      'const state={pid:process.pid,ppid:process.ppid,phase:"ready",written:0,argv:process.argv.slice(2)};',
      'const path=process.env.PUNI_IO_RECORD;const publish=()=>{fs.writeFileSync(path+".next",JSON.stringify(state));fs.renameSync(path+".next",path)};publish();',
      'const hard=setTimeout(()=>process.exit(72),10000);',
      'function write(fd,bytes){let at=0;while(at<bytes.length){const count=fs.writeSync(fd,bytes,at,Math.min(65536,bytes.length-at));if(count<=0)throw new Error("producer made no write progress");at+=count;state.written+=count;}}',
      'write(1,Buffer.from(' +
        JSON.stringify([...header]) +
        '));write(1,bytes);write(2,Buffer.from(' +
        JSON.stringify([...footer]) +
        '));',
      'state.phase="finished";publish();clearTimeout(hard);process.exit(0);',
    ].join('\n'),
  );
  return { root, repository, record, nx, custody: { isConfirmed: true } };
}

/** Each direct child has independent native/numeric and both actual EOF observations. */
async function observeChild(
  fixture: ReturnType<typeof createWorkspace>,
  argv: string[],
  environment: Record<string, string>,
  slow: boolean,
) {
  const native = Promise.withResolvers<{
    readonly code: number | null;
    readonly signal: unknown;
    readonly failure: unknown;
  }>();
  const lifecycle = { hasEnded: false, stdoutEOF: false, stderrEOF: false, hasNumericExit: false };
  const child = Bun.spawn(argv, {
    cwd: fixture.repository,
    env: environment,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    onExit(_child, code, signal, failure) {
      lifecycle.hasEnded = true;
      native.resolve({ code, signal, failure });
    },
  });
  fixture.custody.isConfirmed = false;
  const stdout = (async () => {
    const chunks: Uint8Array[] = [];
    if (slow) await Bun.sleep(150);
    for await (const bytes of child.stdout) {
      chunks.push(bytes);
      if (slow) await Bun.sleep(2);
    }
    lifecycle.stdoutEOF = true;
    return Buffer.concat(chunks);
  })();
  const stderr = (async () => {
    const bytes = await new Response(child.stderr).arrayBuffer();
    lifecycle.stderrEOF = true;
    return Buffer.from(bytes);
  })();
  const exited = child.exited.then((status) => {
    lifecycle.hasNumericExit = true;
    return status;
  });
  const joined = Promise.all([native.promise, exited, stdout, stderr]);
  void joined.catch(() => undefined);
  let primary: { readonly cause: unknown } | undefined;
  let observation: Awaited<typeof joined> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    observation = await Promise.race([
      joined,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('executable IO owner exceeded15seconds'));
        }, 15000);
      }),
    ]);
  } catch (cause: unknown) {
    primary = { cause };
  }
  if (timer !== undefined) clearTimeout(timer);
  const cleanup: unknown[] = [];
  if (!lifecycle.hasEnded) {
    try {
      child.kill('SIGTERM');
    } catch (cause: unknown) {
      cleanup.push(cause);
    }
  }
  if (observation === undefined) {
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      observation = await Promise.race([
        joined,
        new Promise<never>((_resolve, reject) => {
          cleanupTimer = setTimeout(() => {
            reject(
              new Error(
                'executable native/EOF settlement unconfirmed; fixture retained ' + fixture.root,
              ),
            );
          }, 12000);
        }),
      ]);
    } catch (cause: unknown) {
      cleanup.push(cause);
    } finally {
      if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
    }
  }
  fixture.custody.isConfirmed =
    lifecycle.hasEnded && lifecycle.hasNumericExit && lifecycle.stdoutEOF && lifecycle.stderrEOF;
  if (primary !== undefined && cleanup.length > 0)
    throw new AggregateError([primary.cause, ...cleanup], 'IO observation and cleanup failed', {
      cause: primary.cause,
    });
  if (primary !== undefined) throw primary.cause;
  if (cleanup.length > 0) throw new AggregateError(cleanup, 'IO cleanup failed');
  if (observation === undefined) throw new Error('executable IO owner omitted its observation');
  const [termination, status, out, err] = observation;
  if (termination.failure !== undefined && termination.failure !== null)
    throw new Error('actual native callback failed', { cause: termination.failure });
  expect(termination.code, err.toString()).toBe(0);
  expect(termination.signal).toBeNull();
  expect(status, err.toString()).toBe(0);
  return { pid: child.pid, stdout: out, stderr: err };
}
async function withWorkspace(use: (fixture: ReturnType<typeof createWorkspace>) => Promise<void>) {
  const fixture = createWorkspace();
  let primary: { readonly cause: unknown } | undefined;
  try {
    await use(fixture);
  } catch (cause: unknown) {
    primary = { cause };
  }
  let cleanup: { readonly cause: unknown } | undefined;
  if (fixture.custody.isConfirmed) {
    try {
      rmSync(fixture.root, { recursive: true });
    } catch (cause: unknown) {
      cleanup = { cause };
    }
  } else
    cleanup = {
      cause: new Error('native/EOF custody unconfirmed; fixture retained ' + fixture.root),
    };
  if (primary !== undefined && cleanup !== undefined)
    throw new AggregateError(
      [primary.cause, cleanup.cause],
      'executable owner and fixture removal failed',
      { cause: primary.cause },
    );
  if (primary !== undefined) throw primary.cause;
  if (cleanup !== undefined) throw cleanup.cause;
}

it('actual root executable drains captured three-MiB binary output to a deliberately slow pipe reader', async () => {
  await withWorkspace(async (fixture) => {
    const bytes = payload(3 * 1024 * 1024);
    const produced = Buffer.concat([header, bytes]);
    const terminal = Buffer.concat([header, bytes, footer]);
    const capture = Buffer.concat([Buffer.from('START\n'), bytes, Buffer.from('END\n')]);
    const environment = {
      PATH: dirname(process.execPath),
      PUNI_IO_BYTES: String(bytes.length),
      PUNI_IO_RECORD: fixture.record,
      WBS_DEV_PORTS: '',
      NO_COLOR: '1',
    };
    // Real Bun producer/native/EOF control under the same slow stdout-consumer schedule.
    const baseline = await observeChild(
      fixture,
      [
        process.execPath,
        '--no-env-file',
        '--config=/dev/null',
        fixture.nx,
        'run-many',
        '-t',
        'serve',
        projects,
      ],
      environment,
      true,
    );
    expect(baseline.stdout.length).toBe(produced.length);
    expect(digest(baseline.stdout)).toBe(digest(produced));
    expect(digest(baseline.stderr)).toBe(digest(footer));
    const baselineRecord: unknown = JSON.parse(readFileSync(fixture.record, 'utf8'));
    expect(baselineRecord).toMatchObject({
      phase: 'finished',
      pid: baseline.pid,
      ppid: process.pid,
      written: terminal.length,
    });
    unlinkSync(fixture.record);
    expect(existsSync(fixture.record)).toBe(false);
    const log = join(fixture.root, 'capture directory', 'development.log');
    const observed = await observeChild(
      fixture,
      [
        process.execPath,
        '--no-env-file',
        '--config=/dev/null',
        rootEntrypoint,
        'dash',
        'dev',
        '--repository',
        fixture.repository,
      ],
      { ...environment, WBS_DEV_LOG: log },
      true,
    );
    const actualRecord: unknown = JSON.parse(readFileSync(fixture.record, 'utf8'));
    expect(actualRecord).toMatchObject({
      phase: 'finished',
      ppid: observed.pid,
      written: terminal.length,
      argv: ['run-many', '-t', 'serve', projects],
    });
    expect(observed.stdout.length).toBe(terminal.length);
    expect(digest(observed.stdout)).toBe(digest(terminal));
    const actualCapture = readFileSync(log);
    expect(actualCapture.length).toBe(capture.length);
    expect(digest(actualCapture)).toBe(digest(capture));
    expect(observed.stderr.toString()).toBe(
      'WBS_DEV_PORTS is set and empty: no dev port is being checked\n',
    );
  });
}, 60000);

it('actual reusable development main returns its Completion and preserves caller global status', async () => {
  await withWorkspace(async (fixture) => {
    const bytes = payload(256);
    const expectedOut = Buffer.concat([header, bytes]);
    const expectedErr = Buffer.concat([
      Buffer.from('WBS_DEV_PORTS is set and empty: no dev port is being checked\n'),
      footer,
    ]);
    const program = [
      'const {main}=await import(' + JSON.stringify(pathToFileURL(rootEntrypoint).href) + ');',
      'const {createHash}=await import("node:crypto");const stdout=[],stderr=[];',
      'process.exitCode=57;',
      'const completion=await main(["dash","dev","--repository",' +
        JSON.stringify(fixture.repository) +
        '],{installation:{directory:' +
        JSON.stringify(fixture.root) +
        ',entrypoint:"absent.mjs"},lookup:{directory:' +
        JSON.stringify(fixture.repository) +
        ',path:process.env.PATH},callerDirectory:' +
        JSON.stringify(fixture.repository) +
        ',runtime:process.execPath,temporaryDirectory:' +
        JSON.stringify(fixture.root) +
        ',environment:{...process.env},stdout:bytes=>stdout.push(Buffer.from(bytes)),stderr:bytes=>stderr.push(Buffer.from(bytes))});',
      'process.stdout.write(JSON.stringify({afterMain:true,completion,globalStatus:process.exitCode,stdoutHash:createHash("sha256").update(Buffer.concat(stdout)).digest("hex"),stderrHash:createHash("sha256").update(Buffer.concat(stderr)).digest("hex")})+String.fromCharCode(10));process.exitCode=0;',
    ].join('\n');
    const observed = await observeChild(
      fixture,
      [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
      {
        PATH: dirname(process.execPath),
        PUNI_IO_BYTES: '256',
        PUNI_IO_RECORD: fixture.record,
        WBS_DEV_PORTS: '',
      },
      false,
    );
    expect(observed.stdout.length).toBeGreaterThan(0);
    const returned: unknown = JSON.parse(observed.stdout.toString());
    expect(returned).toEqual({
      afterMain: true,
      completion: { kind: 'exit', status: 0 },
      globalStatus: 57,
      stdoutHash: digest(expectedOut),
      stderrHash: digest(expectedErr),
    });
  });
}, 30000);

it('actual development main retains its diagnostic lookup across caller capability mutation', async () => {
  await withWorkspace(async (fixture) => {
    const program = [
      'const {main}=await import(' + JSON.stringify(pathToFileURL(rootEntrypoint).href) + ');',
      'const {writeSync}=await import("node:fs");',
      'process.exitCode=57;',
      'const request=["dash","dev","--repository",' + JSON.stringify(fixture.nx) + '];',
      'function createInvocation(){',
      'const events=[],diagnostics=[],callbacks=[],reads={initial:0,replacement:0};let attempt;',
      'const sink={write(bytes){diagnostics.push(Buffer.from(bytes));return bytes.length},flush(){return 0},unref(){return undefined}};',
      'const capability={stdin:0,stdout:1,stderr:2,openStdout:()=>sink,openStderr:()=>sink,recordDiagnosticAttempt(cause,outcome){events.push("recorded");attempt={cause,outcome}},readDiagnosticAttempt(){reads.initial++;return attempt}};',
      'const context={installation:{directory:' +
        JSON.stringify(fixture.root) +
        ',entrypoint:"absent.mjs"},lookup:{directory:' +
        JSON.stringify(fixture.repository) +
        ',path:process.env.PATH},callerDirectory:' +
        JSON.stringify(fixture.repository) +
        ',runtime:process.execPath,temporaryDirectory:' +
        JSON.stringify(fixture.root) +
        ',environment:{...process.env,WBS_DEV_PORTS:""},developmentIO:capability,stdout:bytes=>callbacks.push(Buffer.from(bytes)),stderr:bytes=>callbacks.push(Buffer.from(bytes))};',
      'return {context,capability,events,reads,snapshot(){return {events,reads,recorded:attempt===undefined?null:{message:attempt.cause instanceof Error?attempt.cause.message:String(attempt.cause),outcome:attempt.outcome},hasDiagnosticBytes:Buffer.concat(diagnostics).length>0,callbackBytes:Buffer.concat(callbacks).length}}};}',
      'const baseline=createInvocation();const baselineCompletion=await main(request,baseline.context);',
      'const affected=createInvocation();const replacementCause=new Error("caller replaced diagnostic lookup");',
      'const pending=main(request,affected.context);affected.events.push("mutated");affected.capability.readDiagnosticAttempt=()=>{affected.reads.replacement++;throw replacementCause};',
      'let settlement;try{settlement={kind:"returned",completion:await pending}}catch(cause){settlement={kind:"rejected",isReplacementCause:Object.is(cause,replacementCause),message:cause instanceof Error?cause.message:String(cause)}}',
      'writeSync(1,JSON.stringify({baseline:{completion:baselineCompletion,...baseline.snapshot()},affected:{settlement,...affected.snapshot()},globalStatus:process.exitCode})+String.fromCharCode(10));process.exitCode=0;',
    ].join('\n');
    const observed = await observeChild(
      fixture,
      [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
      { PATH: dirname(process.execPath), WBS_DEV_PORTS: '' },
      false,
    );
    const returned: unknown = JSON.parse(observed.stdout.toString());
    expect(returned).toMatchObject({
      baseline: {
        completion: { kind: 'exit', status: 1 },
        events: ['recorded'],
        reads: { initial: 1, replacement: 0 },
        recorded: {
          message: 'development repository is not a directory',
          outcome: { kind: 'reported' },
        },
        callbackBytes: 0,
        hasDiagnosticBytes: true,
      },
      affected: {
        events: ['mutated', 'recorded'],
        hasDiagnosticBytes: true,
        recorded: {
          message: 'development repository is not a directory',
          outcome: { kind: 'reported' },
        },
      },
      globalStatus: 57,
    });
    expect(existsSync(fixture.record)).toBe(false);
    // Only after both actual owned diagnostics and mutation ordering are established.
    expect(returned).toMatchObject({
      affected: {
        settlement: { kind: 'returned', completion: { kind: 'exit', status: 1 } },
        reads: { initial: 1, replacement: 0 },
        callbackBytes: 0,
      },
    });
    expect(observed.stderr.length).toBe(0);
  });
}, 30000);
