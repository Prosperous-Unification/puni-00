import { rejects } from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import { expect, spyOn, test } from 'bun:test';

import { participantActivationFixture } from '../fixtures/dependency-participant-restoration';
import { roots } from '../fixtures/source-startup';
import {
  consumePreparedDependencyActivation,
  prepareActivatedParticipantsUnderOwner,
  releasePreparedDependencyActivation,
} from './complete-dependency-exclusion';
import * as participantHttp from './dependency-participant-http';
import { observeProductParticipantReadiness } from './dependency-participant-readiness';
import type { ProductMetadataChild } from './docker-product-metadata';
import { withDependencyOwner } from './edge-ownership';

function echo(contents: string): ProductMetadataChild {
  const child = Bun.spawn(
    ['/usr/bin/python3', '-I', '-c', 'import sys;sys.stdout.buffer.write(sys.stdin.buffer.read())'],
    { stdin: new TextEncoder().encode(contents), stdout: 'pipe', stderr: 'pipe' },
  );
  return {
    stdout: child.stdout,
    stderr: child.stderr,
    exited: child.exited,
    kill: () => {
      child.kill('SIGKILL');
    },
  };
}

test('genuine product readiness refuses unsupported actual host namespace before HTTP or privileged exec', async () => {
  const fixture = await participantActivationFixture();
  process.env['WBS_EDGE_STATE'] = fixture.root;
  const metadata: string[] = [];
  let httpCalls = 0;
  let execs = 0;
  const http = spyOn(participantHttp, 'readParticipantHttp').mockImplementation(() => {
    httpCalls++;
    return Promise.reject(new Error('PRIVATE_UNEXPECTED_HTTP'));
  });
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
          {
            ...fixture.ports,
            spawnProductMetadata: (request) => {
              metadata.push(request.kind);
              if (request.kind === 'container') return echo(JSON.stringify(fixture.backend));
              if (request.kind === 'image') {
                const image = fixture.images.get(request.id);
                if (image === undefined) throw new Error('private fixture image absent');
                return echo(JSON.stringify([image]));
              }
              return echo(`PID PPID\n${String(process.pid)} ${String(process.ppid)}\n`);
            },
            execDocker: async (...args) => {
              execs++;
              await fixture.ports.execDocker(...args);
            },
          },
        );
        try {
          const context = await consumePreparedDependencyActivation(owner, prepared);
          const commands = structuredClone(fixture.commands);
          const excludedExecs = execs;
          Object.assign(fixture.backend.State, {
            Running: true,
            Pid: process.pid,
            Status: 'running',
            StartedAt: new Date().toISOString(),
          });
          await rejects(observeProductParticipantReadiness(context, 'backend'), {
            message: 'product participant readiness refused',
          });
          expect(metadata).toContain('top');
          expect(httpCalls).toBe(0);
          expect(execs).toBe(excludedExecs);
          expect(fixture.commands).toEqual(commands);
          const count = metadata.length;
          await rejects(observeProductParticipantReadiness({ ...context }, 'backend'), {
            message: 'product participant readiness refused',
          });
          expect(metadata).toHaveLength(count);
        } finally {
          releasePreparedDependencyActivation(owner, prepared);
        }
      },
      fixture.root,
    );
  } finally {
    http.mockRestore();
    delete process.env['WBS_EDGE_STATE'];
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  }
}, 300000);
