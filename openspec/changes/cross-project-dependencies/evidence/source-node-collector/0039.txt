import { rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { sourceFault, sourceProcessFixture } from '../fixtures/source-role-process';
import { roots } from '../fixtures/source-startup';
import {
  consumePreparedDependencyActivation,
  prepareActivatedParticipantsUnderOwner,
  releasePreparedDependencyActivation,
} from './complete-dependency-exclusion';
import { observeInner } from './dependency-product-process';
import { withDependencyOwner } from './edge-ownership';
import { GROUP_PROGRAM, SUPERVISOR_PROGRAM } from './mount-exec-program';
import { observeSourceInner } from './source-inner-process';
import { SOURCE_NODE_LAUNCHER } from './source-inner-program';

test('source original context dispatches the complete fixed Node command', async () => {
  const fixture = await sourceProcessFixture();
  process.env['WBS_EDGE_STATE'] = fixture.root;
  try {
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
        try {
          const context = await consumePreparedDependencyActivation(owner, prepared);
          await fixture.start();
          await context.source.inspectRunning();
          console.error(
            'source Node command boundary: genuine original context and original running tree reached',
          );
          const dispatches: { args: string[]; nonce: string }[] = [];
          const originalExec = fixture.ports.execDocker;
          fixture.ports.execDocker = async (args, nonce, receive, signal) => {
            dispatches.push({ args: [...args], nonce });
            return originalExec(args, nonce, receive, signal);
          };
          const { observeSelectedSourceRoles } = await import('./source-role-process');
          const observation = await observeSelectedSourceRoles(context);
          expect(dispatches.length).toBe(2);
          const first = dispatches[0];
          expect(first).toBeDefined();
          console.error('source Node command actual dispatch captured');
          expect(first.args).toEqual([
            '--host',
            'unix:///var/run/docker.sock',
            'exec',
            '-i',
            '--user',
            '1000:1000',
            '--workdir',
            '/',
            fixture.source.Id,
            '/usr/bin/env',
            '-i',
            'PATH=/usr/local/bin:/usr/bin:/bin',
            'LC_ALL=C',
            '/usr/local/bin/node',
            '-e',
            SOURCE_NODE_LAUNCHER,
            '--',
            first.nonce,
            'observe',
            '1',
            '2',
            '3',
            '4',
            '5',
            '6',
          ]);
          const cleanup = dispatches[1];
          expect(cleanup.args).toEqual([
            '--host',
            'unix:///var/run/docker.sock',
            'exec',
            '-i',
            '--user',
            '1000:1000',
            '--workdir',
            '/',
            fixture.source.Id,
            '/usr/bin/env',
            '-i',
            'PATH=/usr/local/bin:/usr/bin:/bin',
            'LC_ALL=C',
            '/usr/local/bin/node',
            '-e',
            SOURCE_NODE_LAUNCHER,
            '--',
            cleanup.nonce,
            'cleanup',
            '70001',
            '70001',
            '70001',
            '80001',
          ]);
          expect(dispatches.every((dispatch) => !dispatch.args.includes('/bin/busybox'))).toBe(
            true,
          );
          console.error('source Node complete command observed');
          await observeInner(context, fixture.source.Id, observation.roster);
          expect(dispatches).toHaveLength(4);
          const product = dispatches[2];
          expect(product.args).toEqual([
            '--host',
            'unix:///var/run/docker.sock',
            'exec',
            '-i',
            '--user',
            '0:0',
            '--workdir',
            '/',
            fixture.source.Id,
            '/bin/busybox',
            'env',
            '-i',
            'PATH=/bin:/usr/bin',
            'LC_ALL=C',
            '/bin/busybox',
            'sh',
            '-c',
            SUPERVISOR_PROGRAM,
            '--',
            product.nonce,
            product.args[20],
            '1',
            '2',
            '3',
            '4',
            '5',
            '6',
          ]);
          expect(createHash('sha256').update(product.args[20]).digest('hex')).toBe(
            '0036f1b97c5b2f82f8eaa910ba37e5ba456df5ba533edb5048b6c20ad6abff76',
          );
          const productCleanup = dispatches[3];
          expect(productCleanup.args).toEqual([
            '--host',
            'unix:///var/run/docker.sock',
            'exec',
            '-i',
            '--user',
            '0:0',
            '--workdir',
            '/',
            fixture.source.Id,
            '/bin/busybox',
            'env',
            '-i',
            'PATH=/bin:/usr/bin',
            'LC_ALL=C',
            '/bin/busybox',
            'sh',
            '-c',
            SUPERVISOR_PROGRAM,
            '--',
            productCleanup.nonce,
            GROUP_PROGRAM,
            '70001',
          ]);
          console.error(
            'product original BusyBox UID0 observe and cleanup dispatch bytes preserved',
          );
          for (const fault of [
            'source-session-nonce',
            'source-session-group',
            'source-completion-count',
            'source-duplicate-done',
            'source-missing-reap',
            'missing',
            'source-no-session',
            'source-unknown-tag',
            'source-token-bound',
            'source-frame-bound',
            'source-reap-foreign',
            'source-member-observe',
          ]) {
            sourceFault.name = fault;
            console.error(`source Node private receipt consumer BEGIN ${fault}`);
            const tokensBefore = sourceFault.collectionTokens;
            const acksBefore = sourceFault.collectionAcks;
            await rejects(observeSourceInner(context, fixture.source.Id, observation.roster));
            if (fault === 'source-member-observe')
              expect(sourceFault.collectionTokens - tokensBefore).toBe(10);
            if (fault === 'source-no-session')
              expect(sourceFault.collectionAcks - acksBefore).toBe(0);
            if (fault === 'source-unknown-tag')
              expect(sourceFault.collectionTokens - tokensBefore).toBe(7);
            if (fault === 'source-token-bound')
              expect(sourceFault.collectionTokens - tokensBefore).toBe(2);
            if (fault === 'source-frame-bound')
              expect(sourceFault.collectionTokens - tokensBefore).toBe(160011);
            console.error(`source Node private receipt consumer observed ${fault}`);
          }
          sourceFault.name = 'none';
          await observeSourceInner(context, fixture.source.Id, observation.roster);
          console.error('source Node private receipt exact restoration observed');
          sourceFault.name = 'source-group-member';
          console.error('source Node original cleanup member consumer BEGIN');
          await rejects(observeSelectedSourceRoles(context), /source process observation refused/);
          const before = sourceFault.execs;
          sourceFault.name = 'none';
          await rejects(observeSelectedSourceRoles(context), /source process observation refused/);
          expect(sourceFault.execs).toBe(before);
          console.error('source Node original cleanup member and terminal refusal observed');
        } finally {
          releasePreparedDependencyActivation(owner, prepared);
        }
      },
      fixture.root,
    );
  } finally {
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
    delete process.env['WBS_EDGE_STATE'];
    sourceFault.name = 'none';
  }
}, 300000);
