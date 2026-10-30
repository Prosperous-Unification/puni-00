import { throws } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import { sourceNodeTestRuntime } from '../fixtures/source-node-runtime';
import { decodeInnerProcess, decodeLocalAddresses } from './dependency-product-validation';
import { runDockerExec } from './docker-exec';
import { SOURCE_NODE_LAUNCHER } from './source-inner-program';

test('actual Node program uses production byte ACK transport and a fresh empty-group census', async () => {
  const node = await sourceNodeTestRuntime();
  expect(process.getuid?.()).toBe(1000);
  expect(process.getgid?.()).toBe(1000);
  console.error('source Node transport namespace actual UID/GID1000:1000 observed');
  const path = process.env['SOURCE_NODE_ADAPTER_PATH'];
  if (path === undefined || Bun.which('docker') !== path)
    throw new Error('source Node exact local adapter is not startup-resolved');
  const id = 'a'.repeat(64);
  const prefix = [
    '--host',
    'unix:///var/run/docker.sock',
    'exec',
    '-i',
    '--user',
    '1000:1000',
    '--workdir',
    '/',
    id,
    '/usr/bin/env',
    '-i',
    'PATH=/usr/local/bin:/usr/bin:/bin',
    'LC_ALL=C',
    '/usr/local/bin/node',
    '-e',
    SOURCE_NODE_LAUNCHER,
    '--',
  ];
  const target = Bun.spawn([node, '-e', 'setInterval(()=>{},1000)'], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  try {
    const sessions: { pid: string; group: string; sid: string; ticks: string }[] = [];
    async function observe(mode: 'observe' | 'cleanup', arguments_: string[]) {
      const nonce = `source-real-${mode}`;
      let tag: string | null = null;
      let fields: string[] = [];
      let done = false;
      let reaped = false;
      let passes = 0;
      let processes = 0;
      let addresses = 0;
      let members = 0;
      const arities: Record<string, number> = {
        SESSION: 5,
        PASS: 1,
        PROC: 11,
        FD: 3,
        SELF: 3,
        TCP: 2,
        ADDR: 1,
        DONE: 2,
        REAPED: 1,
        MEMBER: 3,
      };
      await runDockerExec(
        [...prefix, nonce, mode, ...arguments_],
        nonce,
        (token) => {
          if (tag === null) {
            if (!Object.hasOwn(arities, token)) throw new Error('actual transport unknown tag');
            tag = token;
            fields = [];
            return false;
          }
          fields.push(token);
          if (fields.length < arities[tag]) return false;
          const frame = tag;
          tag = null;
          if (frame === 'SESSION') {
            expect(fields[0]).toBe(nonce);
            expect(fields[1]).toBe(fields[2]);
            expect(fields[1]).toBe(fields[3]);
            sessions.push({ pid: fields[1], group: fields[2], sid: fields[3], ticks: fields[4] });
          } else if (frame === 'PASS') passes++;
          else if (frame === 'PROC') {
            const decoded = decodeInnerProcess(fields, {});
            expect(decoded.pid).toBe(target.pid);
            expect(decoded.uid).toBe(1000);
            processes++;
          } else if (frame === 'ADDR') {
            expect(decodeLocalAddresses(fields[0]).length).toBeGreaterThan(0);
            addresses++;
          } else if (frame === 'MEMBER') members++;
          else if (frame === 'DONE') {
            expect(fields[0]).toBe(nonce);
            expect(done).toBe(false);
            done = true;
            if (mode === 'observe') {
              expect(fields[1]).toBe('2');
              expect(passes).toBe(2);
              expect(processes).toBe(2);
              expect(addresses).toBe(2);
            } else expect(members).toBe(0);
            return true;
          } else if (frame === 'REAPED') {
            expect(done).toBe(true);
            expect(fields[0]).toBe(nonce);
            reaped = true;
          }
          return false;
        },
        AbortSignal.timeout(20000),
      );
      expect(done).toBe(true);
      expect(reaped).toBe(true);
      expect(tag).toBeNull();
    }
    await observe('observe', [String(target.pid)]);
    const original = sessions[0];
    throws(
      () => process.kill(Number(original.pid), 0),
      (cause: unknown) => cause instanceof Error && 'code' in cause && cause.code === 'ESRCH',
    );
    await observe('cleanup', [original.pid, original.group, original.sid, original.ticks]);
    expect(sessions).toHaveLength(2);
    expect(sessions[1].pid).not.toBe(original.pid);
    for (const session of sessions)
      throws(
        () => process.kill(Number(session.pid), 0),
        (cause: unknown) => cause instanceof Error && 'code' in cause && cause.code === 'ESRCH',
      );
    console.error(
      'actual immutable Node production byte transport ACK/reap and fresh original-group census observed',
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
}, 45000);
