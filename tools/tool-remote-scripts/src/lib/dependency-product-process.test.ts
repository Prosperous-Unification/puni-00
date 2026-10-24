import { rejects } from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import { afterEach, expect, test } from 'bun:test';

import { productProcessFixture } from '../fixtures/dependency-product-process';
import { roots } from '../fixtures/source-startup';
import {
  consumePreparedDependencyActivation,
  prepareActivatedParticipantsUnderOwner,
  releasePreparedDependencyActivation,
} from './complete-dependency-exclusion';
import type { FinalizedParticipantRestorationContext } from './dependency-participant-preparation';
import { observeSelectedProductRole } from './dependency-product-process';
import { withDependencyOwner } from './edge-ownership';
import { readProductHostProc } from './product-host-proc';

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  delete process.env['WBS_EDGE_STATE'];
});

test('a copied or invented restoration context cannot reach Docker', async () => {
  const invented = {} as FinalizedParticipantRestorationContext;
  for (const role of ['backend', 'gateway'] as const) {
    await rejects(observeSelectedProductRole(invented, role), {
      message: 'product process observation refused',
    });
  }
  expect(Object.keys(invented)).toHaveLength(0);
});

test('genuine context refuses a one-level host NSpid before root exec and cannot adopt a fabricated child', async () => {
  const fixture = await productProcessFixture();
  process.env['WBS_EDGE_STATE'] = fixture.root;
  await withDependencyOwner(
    fixture.request.owner,
    async (owner) => {
      const prepared = await prepareActivatedParticipantsUnderOwner(
        owner,
        fixture.request,
        fixture.layouts,
        performance.now() + 300000,
        fixture.root,
        fixture.ports,
      );
      const context = await consumePreparedDependencyActivation(owner, prepared);
      const child = Bun.spawn(['/usr/bin/python3', '-I', '-c', 'import time;time.sleep(30)'], {
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        killSignal: 'SIGKILL',
      });
      try {
        const hostStatus = await readProductHostProc(
          `/proc/${String(process.pid)}/status`,
          65536,
          performance.now() + 5000,
        );
        expect(hostStatus).toMatch(new RegExp(`^NSpid:\\s+${String(process.pid)}\\s*$`, 'm'));
        Object.assign(fixture.backend.State, {
          Running: true,
          Status: 'running',
          Pid: process.pid,
          StartedAt: '2026-10-24T08:00:00Z',
        });
        fixture.setTop(
          `PID PPID\n${String(process.pid)} 1\n${String(child.pid)} ${String(process.pid)}\n`,
        );
        const beforeExec = fixture.execs();
        await rejects(observeSelectedProductRole(context, 'backend'), {
          message: 'product process observation refused',
        });
        expect(fixture.requests.map((request) => request.kind)).toEqual([
          'container',
          'image',
          'top',
        ]);
        expect(fixture.execs()).toBe(beforeExec);
        let stalledRequests = 0;
        const closed = (contents: string) =>
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(contents));
              controller.close();
            },
          });
        Object.assign(fixture.ports, {
          spawnProductMetadata: () => {
            stalledRequests++;
            return {
              stdout: closed(''),
              stderr: closed('PRIVATE_SENTINEL'),
              exited: new Promise<number>(() => {
                /* Injected exit never settles. */
              }),
              kill: () => {
                /* Injected child ignores kill. */
              },
            };
          },
        });
        await rejects(observeSelectedProductRole(context, 'backend'), (cause: unknown) => {
          expect(cause).toBeInstanceOf(Error);
          if (cause instanceof Error) {
            expect(cause.message).toBe('product process observation refused');
            expect(cause.cause).toBeUndefined();
            expect(String(cause)).not.toContain('PRIVATE_SENTINEL');
          }
          return true;
        });
        await rejects(observeSelectedProductRole(context, 'backend'));
        expect(stalledRequests).toBe(1);
        expect(fixture.execs()).toBe(beforeExec);
      } finally {
        child.kill('SIGKILL');
        await Promise.all([
          new Response(child.stdout).arrayBuffer(),
          new Response(child.stderr).arrayBuffer(),
          child.exited,
        ]);
        releasePreparedDependencyActivation(owner, prepared);
      }
    },
    fixture.root,
  );
}, 300000);
