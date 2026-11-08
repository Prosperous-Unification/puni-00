import { rejects } from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import { afterEach, expect, test } from 'bun:test';

import { sourceFault, sourceProcessFixture } from '../fixtures/source-role-process';
import { roots } from '../fixtures/source-startup';
import {
  consumePreparedDependencyActivation,
  prepareActivatedParticipantsUnderOwner,
  releasePreparedDependencyActivation,
} from './complete-dependency-exclusion';
import { withDependencyOwner } from './edge-ownership';

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  delete process.env['WBS_EDGE_STATE'];
  sourceFault.name = 'none';
  sourceFault.execs = 0;
  sourceFault.closing = false;
  sourceFault.settlements = 0;
  sourceFault.receiptFailures = 0;
});

test('source observer consumes the original running source through raw process transport', async () => {
  const fixture = await sourceProcessFixture();
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
      let isReleased = false;
      try {
        const context = await consumePreparedDependencyActivation(owner, prepared);
        await fixture.start();
        await context.source.inspectRunning();
        console.error(
          'source observer RED boundary: original consumed context and original running-tree expectation reached',
        );
        const observer = await import('./source-role-process');
        expect(typeof observer.observeSelectedSourceRoles).toBe('function');
        console.error('source context-refusal consumer reached');
        await rejects(
          observer.observeSelectedSourceRoles({ ...context }),
          /source process observation refused/,
        );
        expect(sourceFault.execs).toBe(0);
        console.error('source original-context refusal observed before collection');
        await fixture.writeGenerated('{}\n');
        console.error('source opening-monitor consumer reached');
        await rejects(
          observer.observeSelectedSourceRoles(context),
          /source process observation refused/,
        );
        expect(sourceFault.execs).toBe(0);
        console.error('source opening-monitor refusal observed before collection');
        await fixture.writeGenerated();
        for (const fault of [
          'missing',
          'duplicate',
          'misassigned',
          'parent',
          'role-parent',
          'extra',
          'uid',
          'cwd',
          'watch',
          'exe',
          'helper-listener',
          'closing-listener',
          'closing-output',
          'closing-host',
          'closing-runtime',
        ]) {
          if (
            process.env['SOURCE_ROLE_PROOF'] !== undefined &&
            process.env['SOURCE_ROLE_PROOF'] !== fault
          )
            continue;
          sourceFault.closing = false;
          sourceFault.name = fault;
          console.error(`source first-binding refusal: ${fault}`);
          if (fault === 'role-parent') {
            const { UnsupportedSourceProfile } = await import('./source-role-profile');
            await rejects(observer.observeSelectedSourceRoles(context), UnsupportedSourceProfile);
          } else await rejects(observer.observeSelectedSourceRoles(context), /source process/);
          console.error(`source first-binding refusal observed: ${fault}`);
          if (fault === 'closing-output') {
            await fixture.writeGenerated();
            sourceFault.name = 'object';
            console.error('source first candidate remains pinned after closing refusal');
            await rejects(observer.observeSelectedSourceRoles(context), /source process/);
          }
          if (fault === 'closing-runtime') fixture.source.State.StartedAt = '2026-10-29T08:00:00Z';
        }
        sourceFault.name = 'none';
        const observation = await observer.observeSelectedSourceRoles(context);
        expect(Object.keys(observation.roles).sort()).toEqual([
          'backend',
          'frontend',
          'gateway',
          'mcp',
        ]);
        expect(observation.roles.backend.process.pid).toBe(60003);
        expect(observation.roles.frontend.process.pid).toBe(60006);
        expect(observation.roles.mcp.listeners[0]?.port).toBe(3300);
        expect(Object.isFrozen(observation.roles.backend.process.executable)).toBe(true);
        expect((await observer.observeSelectedSourceRoles(context)).roles).toEqual(
          observation.roles,
        );
        for (const fault of ['pid-reuse', 'object', 'listener']) {
          if (
            process.env['SOURCE_ROLE_PROOF'] !== undefined &&
            process.env['SOURCE_ROLE_PROOF'] !== fault
          )
            continue;
          sourceFault.name = fault;
          console.error(`source retained-binding refusal: ${fault}`);
          await rejects(observer.observeSelectedSourceRoles(context), /source process/);
          sourceFault.name = 'none';
          expect((await observer.observeSelectedSourceRoles(context)).roles).toEqual(
            observation.roles,
          );
          console.error(`source retained-binding refusal observed: ${fault}`);
        }
        releasePreparedDependencyActivation(owner, prepared);
        isReleased = true;
        const execs = sourceFault.execs;
        await rejects(
          observer.observeSelectedSourceRoles(context),
          /source process observation refused/,
        );
        expect(sourceFault.execs).toBe(execs);
      } finally {
        if (!isReleased) releasePreparedDependencyActivation(owner, prepared);
      }
    },
    fixture.root,
  );
}, 300000);

test('source actual helper cleanup failure closes the original observer context', async () => {
  for (const fault of ['namespace', 'cleanup']) {
    if (
      process.env['SOURCE_ROLE_PROOF'] !== undefined &&
      process.env['SOURCE_ROLE_PROOF'] !== fault
    )
      continue;
    sourceFault.execs = 0;
    sourceFault.settlements = 0;
    sourceFault.receiptFailures = 0;
    const fixture = await sourceProcessFixture();
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
        try {
          const context = await consumePreparedDependencyActivation(owner, prepared);
          await fixture.start();
          const { observeSelectedSourceRoles } = await import('./source-role-process');
          sourceFault.name = fault;
          console.error(`source terminal actual-peer refusal: ${fault}`);
          await rejects(observeSelectedSourceRoles(context), /source process observation refused/);
          expect(sourceFault.execs).toBe(2);
          expect(sourceFault.settlements).toBe(2);
          expect(sourceFault.receiptFailures).toBe(1);
          sourceFault.name = 'none';
          await rejects(observeSelectedSourceRoles(context), /source process observation refused/);
          expect(sourceFault.execs).toBe(2);
          console.error(`source terminal actual-peer refusal observed: ${fault}`);
        } finally {
          releasePreparedDependencyActivation(owner, prepared);
        }
      },
      fixture.root,
    );
  }
}, 300000);
