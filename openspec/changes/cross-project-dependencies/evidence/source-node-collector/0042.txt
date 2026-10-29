import { throws } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdtemp, readFile, readlink, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { sourceNodeTestRuntime } from '../fixtures/source-node-runtime';
import { decodeInnerProcess } from './dependency-product-validation';
import { SOURCE_NODE_COLLECTOR, SOURCE_NODE_LAUNCHER } from './source-inner-program';

const node = await sourceNodeTestRuntime();
if (process.getuid?.() !== 1000 || process.getgid?.() !== 1000)
  throw new Error('source Node owning namespace did not establish actual1000:1000');
console.error('source Node owning namespace actual UID/GID1000:1000 observed');

test('actual source Node program observes owned local proc and reaps its exact collector', async () => {
  const target = Bun.spawn([node, '-e', 'setInterval(()=>{},1000)'], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  try {
    const nonce = 'source-node-program-positive';
    const child = Bun.spawn(
      [node, '-e', SOURCE_NODE_LAUNCHER, '--', nonce, 'observe', String(target.pid)],
      {
        env: { PATH: '/usr/local/bin:/usr/bin:/bin', LC_ALL: 'C' },
        cwd: '/',
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        signal: AbortSignal.timeout(20000),
        killSignal: 'SIGKILL',
      },
    );
    const tokens: string[] = [];
    const stdout = async () => {
      const reader = child.stdout.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let buffered = '';
      let count = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          count += chunk.value.length;
          if (count > 32 * 1024 * 1024) throw new Error('local program output bound');
          buffered += decoder.decode(chunk.value, { stream: true });
          let boundary: number;
          while ((boundary = buffered.indexOf('\0')) >= 0) {
            tokens.push(buffered.slice(0, boundary));
            buffered = buffered.slice(boundary + 1);
            if (tokens.at(-3) === 'DONE' && tokens.at(-2) === nonce && tokens.at(-1) === '2') {
              await child.stdin.write(`ACK ${nonce}\n`);
              await child.stdin.end();
            }
          }
        }
        buffered += decoder.decode();
        expect(buffered).toBe('');
      } finally {
        reader.releaseLock();
      }
    };
    const receipts = await Promise.allSettled([
      child.exited,
      stdout(),
      new Response(child.stderr).text(),
    ]);
    const [exit, output, stderr] = receipts;
    if (
      exit.status !== 'fulfilled' ||
      output.status !== 'fulfilled' ||
      stderr.status !== 'fulfilled'
    )
      throw new AggregateError(receipts, 'actual program original custody unproved');
    expect(child.signalCode).toBeNull();
    expect(stderr.value).toBe('');
    expect(exit.value).toBe(0);
    expect(tokens[0]).toBe('SESSION');
    expect(tokens[1]).toBe(nonce);
    expect(tokens[2]).toBe(tokens[3]);
    expect(tokens[2]).toBe(tokens[4]);
    expect(tokens.slice(-2)).toEqual(['REAPED', nonce]);
    const proc = tokens.indexOf('PROC');
    expect(proc).toBeGreaterThan(0);
    expect(tokens[proc + 1]).toBe(String(target.pid));
    expect(tokens[proc + 5]).toBe(await readlink(`/proc/${String(target.pid)}/cwd`));
    expect(tokens[proc + 8]).toBe(
      createHash('sha256')
        .update(await readFile(`/proc/${String(target.pid)}/exe`))
        .digest('hex'),
    );
    expect(tokens.filter((token) => token === 'PASS')).toHaveLength(2);
    throws(
      () => process.kill(Number(tokens[2]), 0),
      (cause: unknown) => cause instanceof Error && 'code' in cause && cause.code === 'ESRCH',
    );
    console.error('actual immutable Node owned-proc receipt and original collector reap observed');
  } finally {
    target.kill('SIGKILL');
    const receipts = await Promise.allSettled([
      target.exited,
      new Response(target.stdout).text(),
      new Response(target.stderr).text(),
    ]);
    const targetSettled = receipts.every((receipt) => receipt.status === 'fulfilled');
    expect(targetSettled).toBe(true);
  }
}, 25000);

for (const mode of ['eof', 'malformed', 'withheld'] as const) {
  test(`actual source launcher refuses ${mode} ACK and settles original custody`, async () => {
    const nonce = `source-node-${mode}`;
    console.error(`source Node ACK BEGIN ${mode}`);
    const child = Bun.spawn(
      [
        node,
        '-e',
        SOURCE_NODE_LAUNCHER,
        '--',
        nonce,
        'cleanup',
        '4194304',
        '4194304',
        '4194304',
        '1',
      ],
      {
        env: { PATH: '/usr/local/bin:/usr/bin:/bin', LC_ALL: 'C' },
        cwd: '/',
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        signal: AbortSignal.timeout(20000),
        killSignal: 'SIGKILL',
      },
    );
    if (mode === 'eof') await child.stdin.end();
    if (mode === 'malformed') {
      await child.stdin.write('WRONG\n');
      await child.stdin.end();
    }
    const receipts = await Promise.allSettled([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    const [exit, stdout, stderr] = receipts;
    if (
      exit.status !== 'fulfilled' ||
      stdout.status !== 'fulfilled' ||
      stderr.status !== 'fulfilled'
    )
      throw new AggregateError(receipts, 'negative original custody unproved');
    expect(child.signalCode).toBeNull();
    expect(exit.value).toBe(1);
    expect(stderr.value).toContain('source collector session refused');
    expect(stdout.value).not.toContain('REAPED\0');
    const tokens = stdout.value.split('\0');
    if (tokens[0] === 'SESSION')
      throws(
        () => process.kill(Number(tokens[2]), 0),
        (cause: unknown) => cause instanceof Error && 'code' in cause && cause.code === 'ESRCH',
      );
    console.error(`actual Node ${mode} ACK refusal and original custody observed`);
  }, 25000);
}

async function runRefusedProgram(arguments_: string[]) {
  const child = Bun.spawn(
    [node, '-e', SOURCE_NODE_LAUNCHER, '--', 'source-program-refusal', ...arguments_],
    {
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', LC_ALL: 'C' },
      cwd: '/',
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      signal: AbortSignal.timeout(20000),
      killSignal: 'SIGKILL',
    },
  );
  const output = async () => {
    const text = await new Response(child.stdout).text();
    await child.stdin.end();
    return text;
  };
  const receipts = await Promise.allSettled([
    child.exited,
    output(),
    new Response(child.stderr).text(),
  ]);
  const [exit, stdout, stderr] = receipts;
  if (exit.status !== 'fulfilled' || stdout.status !== 'fulfilled' || stderr.status !== 'fulfilled')
    throw new AggregateError(receipts, 'refused program custody unproved');
  expect(child.signalCode).toBeNull();
  expect(exit.value).toBe(1);
  expect(stderr.value).toContain('source collector session refused');
  expect(stdout.value).not.toContain('REAPED\0');
  return stdout.value;
}

test('actual source collector refuses absent requested proc without a success receipt', async () => {
  const stdout = await runRefusedProgram(['observe', '4194304']);
  expect(stdout).toContain('SESSION\0');
  expect(stdout).not.toContain('DONE\0');
  console.error('actual source absent proc refusal observed');
}, 25000);

test('actual source collector refuses an unreadable owned executable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'source-node-permission-'));
  const executable = join(directory, 'owned-sleep');
  await copyFile('/bin/sleep', executable);
  await chmod(executable, 0o700);
  const target = Bun.spawn([executable, '30'], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
  try {
    await Bun.sleep(50);
    expect(await readlink(`/proc/${String(target.pid)}/exe`)).toBe(executable);
    await chmod(executable, 0o100);
    const stdout = await runRefusedProgram(['observe', String(target.pid)]);
    expect(stdout).toContain('SESSION\0');
    expect(stdout).not.toContain('DONE\0');
    console.error('actual source unreadable owned executable refusal observed');
  } finally {
    target.kill('SIGKILL');
    const receipts = await Promise.allSettled([
      target.exited,
      new Response(target.stdout).text(),
      new Response(target.stderr).text(),
    ]);
    expect(receipts.every((receipt) => receipt.status === 'fulfilled')).toBe(true);
    await chmod(executable, 0o700);
    await rm(directory, { recursive: true });
  }
}, 25000);

test('actual source metadata encoder preserves bigint nanoseconds and negative fractions', async () => {
  const entry = "if(mode==='observe')observe();else cleanup();";
  expect(SOURCE_NODE_COLLECTOR.split(entry)).toHaveLength(2);
  const calls =
    'process.stdout.write(JSON.stringify([utc(1793260800123456789n),utc(-1n),metadata({dev:9007199254740993n,ino:9007199254740995n,size:1n,mtimeNs:0n,ctimeNs:1n})]));';
  const child = Bun.spawn(
    [node, '-e', SOURCE_NODE_COLLECTOR.replace(entry, calls), '--', 'source-codec', 'observe'],
    {
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', LC_ALL: 'C' },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      signal: AbortSignal.timeout(5000),
      killSignal: 'SIGKILL',
    },
  );
  const receipts = await Promise.allSettled([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const [exit, stdout, stderr] = receipts;
  if (exit.status !== 'fulfilled' || stdout.status !== 'fulfilled' || stderr.status !== 'fulfilled')
    throw new AggregateError(receipts, 'encoder custody unproved');
  expect(child.signalCode).toBeNull();
  expect(exit.value).toBe(0);
  expect(stderr.value).toBe('');
  expect(JSON.parse(stdout.value)).toEqual([
    '2026-10-29 08:00:00.123456789 +0000',
    '1969-12-31 23:59:59.999999999 +0000',
    '9007199254740993:9007199254740995:1|1970-01-01 00:00:00.000000000 +0000|1970-01-01 00:00:00.000000001 +0000',
  ]);
  console.error('actual source encoder private entrypoint exact bigint projection observed');
});

function launcherWithCollector(collector: string): string {
  const encoded = JSON.stringify(SOURCE_NODE_COLLECTOR);
  expect(SOURCE_NODE_LAUNCHER.split(encoded)).toHaveLength(2);
  return SOURCE_NODE_LAUNCHER.replace(encoded, JSON.stringify(collector));
}

async function runActualReceipt(
  program: string,
  mode: 'observe' | 'cleanup',
  arguments_: string[],
) {
  const nonce = 'source-actual-finite';
  const child = Bun.spawn([node, '-e', program, '--', nonce, mode, ...arguments_], {
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', LC_ALL: 'C' },
    cwd: '/',
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    signal: AbortSignal.timeout(20000),
    killSignal: 'SIGKILL',
  });
  const tokens: string[] = [];
  const output = async () => {
    const reader = child.stdout.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let buffered = '';
    let count = 0;
    let acknowledged = false;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        count += chunk.value.length;
        if (count > 32 * 1024 * 1024) throw new Error('actual finite output bound');
        buffered += decoder.decode(chunk.value, { stream: true });
        let boundary: number;
        while ((boundary = buffered.indexOf('\0')) >= 0) {
          tokens.push(buffered.slice(0, boundary));
          buffered = buffered.slice(boundary + 1);
          if (tokens.at(-3) === 'DONE' && tokens.at(-2) === nonce) {
            if (acknowledged) throw new Error('actual finite duplicate DONE');
            acknowledged = true;
            await child.stdin.write(`ACK ${nonce}\n`);
            await child.stdin.end();
          }
        }
      }
      buffered += decoder.decode();
      expect(buffered).toBe('');
    } finally {
      reader.releaseLock();
    }
  };
  const receipts = await Promise.allSettled([
    child.exited,
    output(),
    new Response(child.stderr).text(),
  ]);
  const [exit, stdout, stderr] = receipts;
  if (exit.status !== 'fulfilled' || stdout.status !== 'fulfilled' || stderr.status !== 'fulfilled')
    throw new AggregateError(receipts, 'actual finite original child custody unproved');
  expect(child.signalCode).toBeNull();
  return { code: exit.value, tokens, stderr: stderr.value };
}

test('actual independent launcher deadline kills a synchronously blocked collector', async () => {
  const entry = "if(mode==='observe')observe();else cleanup();";
  expect(SOURCE_NODE_COLLECTOR.split(entry)).toHaveLength(2);
  const blocked = launcherWithCollector(SOURCE_NODE_COLLECTOR.replace(entry, 'while(true){}'));
  const started = performance.now();
  console.error('source Node independent watchdog BEGIN');
  const receipt = await runActualReceipt(blocked, 'observe', ['1']);
  expect(performance.now() - started).toBeLessThan(20000);
  expect(receipt.code).toBe(1);
  expect(receipt.tokens[0]).toBe('SESSION');
  expect(receipt.tokens).not.toContain('DONE');
  expect(receipt.tokens).not.toContain('REAPED');
  expect(receipt.stderr).toContain('source collector session refused');
  throws(
    () => process.kill(Number(receipt.tokens[2]), 0),
    (cause: unknown) => cause instanceof Error && 'code' in cause && cause.code === 'ESRCH',
  );
  console.error('actual blocked collector independent watchdog and reap refusal observed');
}, 25000);

test('actual fresh census reports a retained owned session without signaling it', async () => {
  const target = Bun.spawn([node, '-e', 'setInterval(()=>{},1000)'], {
    detached: true,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  try {
    const stat = await readFile(`/proc/${String(target.pid)}/stat`, 'utf8');
    const fields = stat
      .slice(stat.lastIndexOf(') ') + 2)
      .trim()
      .split(/\s+/);
    expect(fields[2]).toBe(String(target.pid));
    expect(fields[3]).toBe(String(target.pid));
    const receipt = await runActualReceipt(SOURCE_NODE_LAUNCHER, 'cleanup', [
      String(target.pid),
      fields[2],
      fields[3],
      fields[19],
    ]);
    expect(receipt.code).toBe(0);
    expect(receipt.stderr).toBe('');
    const member = receipt.tokens.indexOf('MEMBER');
    expect(member).toBeGreaterThan(0);
    expect(receipt.tokens[member + 1]).toBe(String(target.pid));
    expect(receipt.tokens[member + 3]).toBe(fields[19]);
    expect(receipt.tokens.slice(-2)).toEqual(['REAPED', 'source-actual-finite']);
    expect(() => process.kill(target.pid, 0)).not.toThrow();
    console.error(
      'actual retained owned original-group member census observed without signaling target',
    );
  } finally {
    target.kill('SIGKILL');
    const receipts = await Promise.allSettled([
      target.exited,
      new Response(target.stdout).text(),
      new Response(target.stderr).text(),
    ]);
    expect(receipts.every((receipt) => receipt.status === 'fulfilled')).toBe(true);
  }
}, 25000);

for (const fault of [
  'cidr-null',
  'cidr-range',
  'family',
  'canonical',
  'canonical-v6',
  'empty',
] as const) {
  test(`actual source address projection refuses ${fault} builtin observation`, async () => {
    const addresses =
      fault === 'empty'
        ? {}
        : {
            lo: [
              {
                family: fault === 'family' ? 'Unknown' : fault === 'canonical-v6' ? 'IPv6' : 'IPv4',
                address:
                  fault === 'canonical'
                    ? '127.000.0.1'
                    : fault === 'canonical-v6'
                      ? '0:0:0:0:0:0:0:1'
                      : '127.0.0.1',
                cidr:
                  fault === 'canonical-v6'
                    ? '0:0:0:0:0:0:0:1/128'
                    : fault === 'cidr-null'
                      ? null
                      : fault === 'cidr-range'
                        ? '127.0.0.1/33'
                        : '127.0.0.1/8',
                internal: true,
              },
            ],
          };
    const marker = "const os=require('node:os');";
    expect(SOURCE_NODE_COLLECTOR.split(marker)).toHaveLength(2);
    const collector = SOURCE_NODE_COLLECTOR.replace(
      marker,
      `const os={networkInterfaces:()=>(${JSON.stringify(addresses)})};`,
    );
    const target = Bun.spawn([node, '-e', 'setInterval(()=>{},1000)'], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    try {
      console.error(`source Node address BEGIN ${fault}`);
      const receipt = await runActualReceipt(launcherWithCollector(collector), 'observe', [
        String(target.pid),
      ]);
      expect(receipt.code).toBe(1);
      expect(receipt.tokens).not.toContain('DONE');
      expect(receipt.tokens).not.toContain('REAPED');
      expect(receipt.stderr).toContain('source collector session refused');
      console.error(`actual source ${fault} address observation refusal reached`);
    } finally {
      target.kill('SIGKILL');
      const receipts = await Promise.allSettled([
        target.exited,
        new Response(target.stdout).text(),
        new Response(target.stderr).text(),
      ]);
      expect(receipts.every((receipt) => receipt.status === 'fulfilled')).toBe(true);
    }
  }, 25000);
}

for (const fault of ['short', 'zero', 'excess'] as const) {
  test(`actual source writer handles ${fault} byte progress at its output boundary`, async () => {
    const marker = "const fs=require('node:fs');";
    expect(SOURCE_NODE_COLLECTOR.split(marker)).toHaveLength(2);
    const injection =
      fault === 'short'
        ? 'const actualWrite=fs.writeSync.bind(fs);fs.writeSync=(descriptor,bytes,offset=0,length=bytes.length-offset)=>actualWrite(descriptor,bytes,offset,Math.min(length,7));'
        : fault === 'excess'
          ? 'const actualWrite=fs.writeSync.bind(fs);fs.writeSync=(descriptor,bytes,offset=0,length=bytes.length-offset)=>{actualWrite(descriptor,bytes,offset,length);return length+1;};'
          : 'fs.writeSync=()=>0;';
    const collector = SOURCE_NODE_COLLECTOR.replace(marker, marker + injection);
    const target = Bun.spawn([node, '-e', 'setInterval(()=>{},1000)'], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    try {
      console.error(`source Node writer BEGIN ${fault}`);
      const child = Bun.spawn(
        [node, '-e', collector, '--', 'source-writer', 'observe', String(target.pid)],
        {
          env: { PATH: '/usr/local/bin:/usr/bin:/bin', LC_ALL: 'C' },
          cwd: '/',
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
          signal: AbortSignal.timeout(20000),
          killSignal: 'SIGKILL',
        },
      );
      const receipts = await Promise.allSettled([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      const [exit, stdout, stderr] = receipts;
      if (
        exit.status !== 'fulfilled' ||
        stdout.status !== 'fulfilled' ||
        stderr.status !== 'fulfilled'
      )
        throw new AggregateError(receipts, 'writer original child custody unproved');
      expect(child.signalCode).toBeNull();
      if (fault === 'short') {
        expect(exit.value).toBe(0);
        expect(stderr.value).toBe('');
        expect(stdout.value.startsWith('PASS\0before\0PROC\0')).toBe(true);
        expect(stdout.value.endsWith(['DONE', 'source-writer', '2', ''].join('\0'))).toBe(true);
        expect(stdout.value.split('\0').filter((token) => token === 'PROC')).toHaveLength(2);
      } else {
        expect(exit.value).toBe(1);
        expect(stderr.value).toContain('source output write progress refused');
        expect(stdout.value).not.toContain('DONE\0');
      }
      console.error(`actual source ${fault} writer boundary observed`);
    } finally {
      target.kill('SIGKILL');
      const receipts = await Promise.allSettled([
        target.exited,
        new Response(target.stdout).text(),
        new Response(target.stderr).text(),
      ]);
      expect(receipts.every((receipt) => receipt.status === 'fulfilled')).toBe(true);
    }
  }, 25000);
}

for (const fault of ['absent', 'EACCES', 'EIO'] as const) {
  test(`actual source census second probe models ${fault} explicitly`, async () => {
    const marker = "const fs=require('node:fs');";
    expect(SOURCE_NODE_COLLECTOR.split(marker)).toHaveLength(2);
    const discovery =
      "const actualReaddir=fs.readdirSync.bind(fs);fs.readdirSync=(path,...rest)=>path==='/proc'?['4194304']:actualReaddir(path,...rest);";
    const secondProbe =
      fault === 'absent'
        ? ''
        : `const actualProbe=fs.lstatSync.bind(fs);fs.lstatSync=(path,...rest)=>{if(path==='/proc/4194304/stat'){const failure=new Error('forced census second-probe ${fault}');failure.code='${fault}';throw failure;}return actualProbe(path,...rest);};`;
    const collector = SOURCE_NODE_COLLECTOR.replace(marker, marker + discovery + secondProbe);
    console.error(`source Node census probe BEGIN ${fault}`);
    const receipt = await runActualReceipt(launcherWithCollector(collector), 'cleanup', [
      '4194303',
      '4194303',
      '4194303',
      '1',
    ]);
    if (fault === 'absent') {
      expect(receipt.code).toBe(0);
      expect(receipt.stderr).toBe('');
      expect(receipt.tokens.slice(-2)).toEqual(['REAPED', 'source-actual-finite']);
    } else {
      expect(receipt.code).toBe(1);
      expect(receipt.tokens).not.toContain('DONE');
      expect(receipt.tokens).not.toContain('REAPED');
      expect(receipt.stderr).toContain('source collector session refused');
    }
    console.error(`actual source census second-probe ${fault} outcome observed`);
  }, 25000);
}

async function runActualCollector(
  collector: string,
  arguments_: string[],
  mode: 'observe' | 'cleanup' = 'observe',
) {
  const child = Bun.spawn(
    [node, '-e', collector, '--', 'source-normal-proc', mode, ...arguments_],
    {
      detached: true,
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', LC_ALL: 'C' },
      cwd: '/',
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      signal: AbortSignal.timeout(20000),
      killSignal: 'SIGKILL',
    },
  );
  const receipts = await Promise.allSettled([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const [exit, stdout, stderr] = receipts;
  if (exit.status !== 'fulfilled' || stdout.status !== 'fulfilled' || stderr.status !== 'fulfilled')
    throw new AggregateError(receipts, 'actual collector original custody unproved');
  expect(child.signalCode).toBeNull();
  return { code: exit.value, tokens: stdout.value.split('\0').slice(0, -1), stderr: stderr.value };
}

for (const fault of [
  'regular-file',
  'short-read',
  'metadata-readback',
  'bigint-projection',
  'timestamp-range',
  'fd-count',
  'pid-start',
  'deleted-path',
  'fd-identity',
] as const) {
  test(`actual source collector normal proc boundary observes ${fault}`, async () => {
    const marker = "const fs=require('node:fs');";
    expect(SOURCE_NODE_COLLECTOR.split(marker)).toHaveLength(2);
    const injections = {
      'deleted-path':
        "const actualLink=fs.readlinkSync.bind(fs);fs.readlinkSync=(path,...args)=>path.endsWith('/exe')?Buffer.concat([actualLink(path,...args),Buffer.from(' (deleted)')]):actualLink(path,...args);",
      'fd-identity':
        "const actualEntries=fs.readdirSync.bind(fs);const actualLink=fs.readlinkSync.bind(fs);fs.readdirSync=(path,...args)=>path.endsWith('/fd')?['4097']:actualEntries(path,...args);fs.readlinkSync=(path,...args)=>actualLink(path.endsWith('/fd/4097')?path.slice(0,-4)+'0':path,...args);",
      'regular-file':
        'const actualStat=fs.fstatSync.bind(fs);fs.fstatSync=(...args)=>{const observed=actualStat(...args);observed.isFile=()=>false;return observed;};',
      'short-read':
        'const actualRead=fs.readSync.bind(fs);const actualStat=fs.fstatSync.bind(fs);const counts=new Map();fs.readSync=(descriptor,...args)=>{if(actualStat(descriptor).size>1048576){const count=counts.get(descriptor)||0;counts.set(descriptor,count+1);if(count>0)return 0;}return actualRead(descriptor,...args);};',
      'metadata-readback':
        'const actualStat=fs.fstatSync.bind(fs);let statCalls=0;fs.fstatSync=(...args)=>{const observed=actualStat(...args);statCalls++;if(statCalls%2===0)observed.ino+=1n;return observed;};',
      'bigint-projection':
        "for(const method of ['fstatSync','statSync']){const original=fs[method].bind(fs);fs[method]=(...args)=>{const observed=original(...args);if(typeof observed.ino==='bigint'){observed.dev=9007199254740993n;observed.ino=9007199254740995n;observed.mtimeNs=1793260800123456789n;observed.ctimeNs=1793260800123456789n;}return observed;};}",
      'timestamp-range':
        "for(const method of ['fstatSync','statSync']){const original=fs[method].bind(fs);fs[method]=(...args)=>{const observed=original(...args);if(typeof observed.mtimeNs==='bigint')observed.mtimeNs=253402300800000000000n;return observed;};}",
      'fd-count':
        "const actualEntries=fs.readdirSync.bind(fs);fs.readdirSync=(path,...args)=>path.endsWith('/fd')?Array.from({length:4097},()=> '0'):actualEntries(path,...args);",
      'pid-start':
        "const actualRead=fs.readSync.bind(fs);const actualLink=fs.readlinkSync.bind(fs);let statReads=0;fs.readSync=(descriptor,buffer,...args)=>{const length=actualRead(descriptor,buffer,...args);if(length>0&&String(actualLink('/proc/self/fd/'+descriptor)).endsWith('/stat')){statReads++;if(statReads%2===0){const text=buffer.subarray(0,length).toString('utf8');const closing=text.lastIndexOf(') ');const fields=text.slice(closing+2).trim().split(/\\s+/);fields[19]=String(BigInt(fields[19])+1n);const changed=text.slice(0,closing+2)+fields.join(' ')+'\\n';buffer.write(changed);return Buffer.byteLength(changed);}}return length;};",
    };
    const collector = SOURCE_NODE_COLLECTOR.replace(marker, marker + injections[fault]);
    const target = Bun.spawn([node, '-e', 'setInterval(()=>{},1000)'], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    try {
      console.error(`source Node normal proc BEGIN ${fault}`);
      const receipt = await runActualCollector(collector, [String(target.pid)]);
      if (fault === 'bigint-projection') {
        expect(receipt.code).toBe(0);
        expect(receipt.stderr).toBe('');
        const index = receipt.tokens.indexOf('PROC');
        expect(index).toBeGreaterThan(0);
        const decoded = decodeInnerProcess(receipt.tokens.slice(index + 1, index + 12), {});
        expect(decoded.executable.device).toBe('9007199254740993');
        expect(decoded.executable.inode).toBe('9007199254740995');
        expect(receipt.tokens[index + 7]).toContain('2026-10-29 08:00:00.123456789 +0000');
      } else {
        expect(receipt.code).toBe(1);
        expect(receipt.tokens).not.toContain('DONE');
        expect(receipt.tokens).not.toContain('REAPED');
        const reasons = {
          'regular-file': 'source executable bound exceeded',
          'short-read': 'source executable readback drift',
          'metadata-readback': 'source executable readback drift',
          'timestamp-range': 'source timestamp range unsupported',
          'fd-count': 'source FD count exceeded',
          'pid-start': 'source process changed',
          'deleted-path': 'source executable path unsupported',
          'fd-identity': 'source FD unsupported',
        };
        expect(receipt.stderr).toContain(reasons[fault]);
      }
      expect(() => process.kill(target.pid, 0)).not.toThrow();
      console.error(`actual source normal proc ${fault} boundary observed`);
    } finally {
      target.kill('SIGKILL');
      const receipts = await Promise.allSettled([
        target.exited,
        new Response(target.stdout).text(),
        new Response(target.stderr).text(),
      ]);
      expect(receipts.every((receipt) => receipt.status === 'fulfilled')).toBe(true);
    }
  }, 25000);
}

for (const fault of [
  'proc-bound',
  'output-total',
  'output-token',
  'uid',
  'unknown-mode',
  'pid-argument',
  'stat-identity',
  'link-input',
  'link-utf8',
] as const) {
  test(`actual source collector function boundary refuses ${fault}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'source-node-function-'));
    const input = join(directory, 'oversized-proc');
    const invalidLink = join(directory, 'invalid-utf8-link');
    await symlink(Buffer.from([0xff]), invalidLink);
    await Bun.write(input, 'x'.repeat(65537));
    const entry = "if(mode==='observe')observe();else cleanup();";
    expect(SOURCE_NODE_COLLECTOR.split(entry)).toHaveLength(2);
    const calls =
      fault === 'proc-bound'
        ? `readBounded(${JSON.stringify(input)},65536);`
        : fault === 'output-total'
          ? "for(let index=0;index<12;index++)emit('TCP','4','x'.repeat(3*1024*1024));"
          : fault === 'output-token'
            ? "emit('TCP','4','x'.repeat(4*1024*1024+1));"
            : "process.stdout.write('unreachable');";
    const boundaryInjection =
      fault === 'stat-identity'
        ? "const actualRead=fs.readSync.bind(fs);fs.readSync=(descriptor,buffer,...args)=>{const length=actualRead(descriptor,buffer,...args);if(length>0){const text=buffer.subarray(0,length).toString('utf8');const changed=text.replace(/^[0-9]+ /,'4194304 ');if(changed!==text){buffer.write(changed);return Buffer.byteLength(changed);}}return length;};"
        : fault === 'link-input'
          ? 'fs.readlinkSync=()=>Buffer.from([0]);'
          : '';
    const entryCalls =
      fault === 'link-utf8'
        ? `link(${JSON.stringify(invalidLink)});`
        : fault === 'pid-argument'
          ? "pidNumber('4194305');"
          : fault === 'stat-identity'
            ? 'readStat(process.pid);'
            : fault === 'link-input'
              ? "link('/proc/self/exe');"
              : calls;
    const modified = SOURCE_NODE_COLLECTOR.replace(
      "const fs=require('node:fs');",
      "const fs=require('node:fs');" + boundaryInjection,
    );
    const collector =
      (fault === 'uid' ? 'process.getuid=()=>0;' : '') + modified.replace(entry, entryCalls);
    try {
      console.error(`source Node function BEGIN ${fault}`);
      const child = Bun.spawn(
        [
          node,
          '-e',
          collector,
          '--',
          'source-function',
          fault === 'unknown-mode' ? 'unsupported' : 'observe',
        ],
        {
          env: { PATH: '/usr/local/bin:/usr/bin:/bin', LC_ALL: 'C' },
          cwd: '/',
          stdin: 'ignore',
          stdout: 'ignore',
          stderr: 'pipe',
          signal: AbortSignal.timeout(20000),
          killSignal: 'SIGKILL',
        },
      );
      const receipts = await Promise.allSettled([child.exited, new Response(child.stderr).text()]);
      const [exit, stderr] = receipts;
      if (exit.status !== 'fulfilled' || stderr.status !== 'fulfilled')
        throw new AggregateError(receipts, 'function boundary original custody unproved');
      expect(child.signalCode).toBeNull();
      expect(exit.value).toBe(1);
      const reason =
        fault === 'proc-bound'
          ? 'source read bound exceeded'
          : fault.startsWith('output-')
            ? 'source output bound exceeded'
            : fault === 'uid'
              ? 'source collector UID/GID differs'
              : fault === 'pid-argument'
                ? 'source PID malformed'
                : fault === 'stat-identity'
                  ? 'source proc identity malformed'
                  : fault === 'link-input'
                    ? 'source link unsupported'
                    : fault === 'link-utf8'
                      ? 'ERR_ENCODING_INVALID_ENCODED_DATA'
                      : 'source mode unsupported';
      expect(stderr.value).toContain(reason);
      console.error(`actual source function ${fault} refusal observed`);
    } finally {
      await rm(directory, { recursive: true });
    }
  }, 25000);
}

for (const fault of ['credential', 'identity', 'exit-status'] as const) {
  test(`actual source launcher rejects ${fault} before granting reap`, async () => {
    const target = Bun.spawn([node, '-e', 'setInterval(()=>{},1000)'], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    try {
      let launcher = SOURCE_NODE_LAUNCHER;
      if (fault === 'credential') launcher = 'process.getgid=()=>0;' + launcher;
      if (fault === 'identity') {
        const marker = "const fs=require('node:fs');\nconst {spawn}=require('node:child_process');";
        expect(launcher.split(marker)).toHaveLength(2);
        launcher = launcher.replace(
          marker,
          marker +
            "const actualRead=fs.readFileSync.bind(fs);fs.readFileSync=(path,...args)=>{const text=actualRead(path,...args);if(typeof text==='string'&&path.endsWith('/stat')){const closing=text.lastIndexOf(') ');const fields=text.slice(closing+2).trim().split(/\\s+/);fields[2]=String(Number(fields[2])+1);return text.slice(0,closing+2)+fields.join(' ')+'\\n';}return text;};",
        );
      }
      if (fault === 'exit-status')
        launcher = launcherWithCollector(SOURCE_NODE_COLLECTOR + '\nprocess.exitCode=1;');
      console.error(`source Node launcher BEGIN ${fault}`);
      const receipt = await runActualReceipt(launcher, 'observe', [String(target.pid)]);
      expect(receipt.code).toBe(1);
      expect(receipt.tokens).not.toContain('REAPED');
      expect(receipt.stderr).toContain(
        fault === 'credential'
          ? 'source launcher input refused'
          : 'source collector session refused',
      );
      expect(() => process.kill(target.pid, 0)).not.toThrow();
      console.error(`actual source launcher ${fault} refusal observed`);
    } finally {
      target.kill('SIGKILL');
      const receipts = await Promise.allSettled([
        target.exited,
        new Response(target.stdout).text(),
        new Response(target.stderr).text(),
      ]);
      expect(receipts.every((receipt) => receipt.status === 'fulfilled')).toBe(true);
    }
  }, 25000);
}

test('actual source launcher bounds an open ACK channel before its work deadline', async () => {
  const marker = 'function stop(cause){';
  expect(SOURCE_NODE_LAUNCHER.split(marker)).toHaveLength(2);
  const launcher = SOURCE_NODE_LAUNCHER.replace(
    marker,
    marker + "process.stderr.write('source-test-stop:'+cause.message+'\\n');",
  );
  const child = Bun.spawn(
    [
      node,
      '-e',
      launcher,
      '--',
      'source-large-ack',
      'cleanup',
      '4194304',
      '4194304',
      '4194304',
      '1',
    ],
    {
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', LC_ALL: 'C' },
      cwd: '/',
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      signal: AbortSignal.timeout(20000),
      killSignal: 'SIGKILL',
    },
  );
  console.error('source Node ACK bound BEGIN');
  await child.stdin.write('x'.repeat(129));
  const receipts = await Promise.allSettled([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const [exit, stdout, stderr] = receipts;
  if (exit.status !== 'fulfilled' || stdout.status !== 'fulfilled' || stderr.status !== 'fulfilled')
    throw new AggregateError(receipts, 'open ACK channel original custody unproved');
  expect(child.signalCode).toBeNull();
  expect(exit.value).toBe(1);
  expect(stderr.value).toContain('source-test-stop:source ACK bound');
  expect(stdout.value).not.toContain('REAPED\0');
  console.error('actual source open ACK bound refusal observed');
}, 25000);

for (const fault of ['stdout', 'stderr'] as const) {
  test(`actual source launcher refuses ${fault} from its owned collector boundary`, async () => {
    const entry = "if(mode==='observe')observe();else cleanup();";
    expect(SOURCE_NODE_COLLECTOR.split(entry)).toHaveLength(2);
    const body =
      fault === 'stdout'
        ? "process.stdout.write('x'.repeat(32*1024*1024+1));"
        : "process.stderr.write('source-owned-warning');";
    const launcher = launcherWithCollector(SOURCE_NODE_COLLECTOR.replace(entry, body));
    const nonce = 'source-channel-bound';
    const child = Bun.spawn([node, '-e', launcher, '--', nonce, 'cleanup'], {
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', LC_ALL: 'C' },
      cwd: '/',
      stdin: 'pipe',
      stdout: 'ignore',
      stderr: 'pipe',
      signal: AbortSignal.timeout(20000),
      killSignal: 'SIGKILL',
    });
    console.error(`source Node launcher channel BEGIN ${fault}`);
    await child.stdin.write(`ACK ${nonce}\n`);
    await child.stdin.end();
    const receipts = await Promise.allSettled([child.exited, new Response(child.stderr).text()]);
    const [exit, stderr] = receipts;
    if (exit.status !== 'fulfilled' || stderr.status !== 'fulfilled')
      throw new AggregateError(receipts, 'collector channel original custody unproved');
    expect(child.signalCode).toBeNull();
    expect(exit.value).toBe(1);
    expect(stderr.value).toContain('source collector session refused');
    expect(stderr.value).not.toContain('source-owned-warning');
    console.error(`actual source launcher ${fault} boundary refusal observed`);
  }, 25000);
}

for (const fault of ['arguments', 'own-session', 'count', 'reused-pid'] as const) {
  test(`actual source fresh census refuses ${fault} at its identity boundary`, async () => {
    const target = Bun.spawn([node, '-e', 'setInterval(()=>{},1000)'], {
      detached: true,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    try {
      const marker = "const fs=require('node:fs');";
      expect(SOURCE_NODE_COLLECTOR.split(marker)).toHaveLength(2);
      const entry = "if(mode==='observe')observe();else cleanup();";
      expect(SOURCE_NODE_COLLECTOR.split(entry)).toHaveLength(2);
      let collector = SOURCE_NODE_COLLECTOR;
      let arguments_ = ['4194303', '4194303', '4194303', '1'];
      if (fault === 'arguments') arguments_ = arguments_.slice(0, 3);
      if (fault === 'own-session')
        collector = collector.replace(
          entry,
          "const actualReadStat=readStat;readStat=pid=>{const observed=actualReadStat(pid);return pid===process.pid?{...observed,group:'4194304'}:observed;};" +
            entry,
        );
      if (fault === 'count')
        collector = collector.replace(
          marker,
          marker +
            "const actualEntries=fs.readdirSync.bind(fs);fs.readdirSync=(path,...args)=>path==='/proc'?Array.from({length:10001},()=>String(process.pid)):actualEntries(path,...args);const actualAlloc=Buffer.alloc.bind(Buffer);Buffer.alloc=(size,...args)=>actualAlloc(Math.min(size,512),...args);",
        );
      if (fault === 'reused-pid') {
        const text = await readFile(`/proc/${String(target.pid)}/stat`, 'utf8');
        const fields = text
          .slice(text.lastIndexOf(') ') + 2)
          .trim()
          .split(/\s+/);
        expect(fields[2]).toBe(String(target.pid));
        expect(fields[3]).toBe(String(target.pid));
        arguments_ = [String(target.pid), fields[2], fields[3], String(BigInt(fields[19]) + 1n)];
      }
      console.error(`source Node census identity BEGIN ${fault}`);
      const receipt = await runActualCollector(collector, arguments_, 'cleanup');
      expect(receipt.code).toBe(1);
      expect(receipt.tokens).not.toContain('DONE');
      const reasons = {
        arguments: 'source census identity absent',
        'own-session': 'source census own session differs',
        count: 'source census count exceeded',
        'reused-pid': 'source census PID reused',
      };
      expect(receipt.stderr).toContain(reasons[fault]);
      expect(() => process.kill(target.pid, 0)).not.toThrow();
      console.error(`actual source census ${fault} identity refusal observed`);
    } finally {
      target.kill('SIGKILL');
      const receipts = await Promise.allSettled([
        target.exited,
        new Response(target.stdout).text(),
        new Response(target.stderr).text(),
      ]);
      expect(receipts.every((receipt) => receipt.status === 'fulfilled')).toBe(true);
    }
  }, 25000);
}
