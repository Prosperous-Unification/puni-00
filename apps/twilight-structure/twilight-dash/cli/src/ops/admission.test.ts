import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';

import { parseDashCommand } from '../cli-parser';
import { monotonicClock } from '../clock';
import { fakeCredential } from '../compute/testing/credential';
import { ampleHost, build, hostPoolFixture } from '../resources/host-pool.test.fixture';
import { privateLegacyLock } from '../resources/legacy-lock.test.fixture';
import { loadResourceConfiguration, ResourceRuntime } from '../resources/runtime';
import { type OpsDependencies, opsHandlers, runOps } from './commands';
import { insideOpsNamespace } from './ops.test.fixture';
import { linuxScopeTelemetry } from './scope';

/**
 * `dash-host-jobs` task 6.10a: `ops job admission` answers whether the host job a nested
 * launcher names is running, so a scope named `dash-job-<id>` is not taken as an admission.
 */
if (insideOpsNamespace(import.meta.path))
  describe('ops job admission (task 6.10a)', () => {
    const cleanups: (() => void)[] = [];
    const payloads: ChildProcess[] = [];
    afterEach(async () => {
      for (const payload of payloads.splice(0)) {
        if (payload.exitCode === null && payload.signalCode === null) {
          payload.kill('SIGKILL');
          await once(payload, 'exit');
        }
      }
      for (const cleanup of cleanups.splice(0)) cleanup();
    });
    const clock = { read: () => 1800000000000 };

    function pool() {
      const fixture = hostPoolFixture({
        cpuCores: 8,
        memoryGib: 15,
        headroom: { cpuCores: 0, memoryGib: 2 },
        gateTrees: 1,
        credential: fakeCredential(),
      });
      cleanups.push(fixture.remove);
      const runtime = ResourceRuntime.initialize(
        loadResourceConfiguration(fixture.config),
        clock,
        ampleHost,
      );
      cleanups.unshift(() => {
        runtime.close();
      });
      return { ...fixture, runtime };
    }

    function launched(runtime: ResourceRuntime) {
      const queued = runtime.enqueueHostJob(
        { descriptor: build, label: 'outer', waitSeconds: 0 },
        globalThis.process.pid,
      );
      if (queued.kind !== 'queued') throw new Error(queued.reason);
      const admitted = runtime.pollHostJob(queued.ticket, () => undefined);
      if (admitted.kind !== 'admitted') throw new Error(`not admitted: ${admitted.kind}`);
      runtime.prepareHostJob(admitted.job.id);
      const payload = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
      payloads.push(payload);
      if (payload.pid === undefined) throw new Error('payload did not start');
      runtime.recordHostJobLaunch(admitted.job.id, payload.pid);
      return { id: admitted.job.id, payload };
    }

    function admission(config: string, job: string): unknown {
      const stdout: string[] = [];
      const deps: OpsDependencies = {
        clock,
        monotonic: monotonicClock(),
        environment: globalThis.process.env,
        cwd: globalThis.process.cwd(),
        stdout: (text) => stdout.push(text),
        stderr: () => {
          throw new Error('admission writes nothing on stderr');
        },
        telemetry: linuxScopeTelemetry(),
        host: ampleHost,
        user: 'puni1',
        legacyLock: () => privateLegacyLock('/nonexistent'),
      };
      expect(
        opsHandlers['job admission']({ command: 'ops', words: 'job admission', config, job }, deps),
      ).toBe(0);
      expect(stdout).toHaveLength(1);
      return JSON.parse(stdout[0] ?? '');
    }

    test('a launched job whose payload runs is running', () => {
      const { runtime, config } = pool();
      const { id } = launched(runtime);
      expect(admission(config, id)).toEqual({ job: id, state: 'held', running: true });
    });

    test('an id the ledger never admitted is not running', () => {
      const { config } = pool();
      const id = '0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0';
      expect(admission(config, id)).toEqual({ job: id, state: null, running: false });
    });

    test('a job whose payload exited, or whose process is gone, is not running', async () => {
      const { runtime, config } = pool();
      const exited = launched(runtime);
      runtime.recordHostJobExit(exited.id, 0);
      expect(admission(config, exited.id)).toEqual({
        job: exited.id,
        state: 'held',
        running: false,
      });
      const vanished = launched(runtime);
      vanished.payload.kill('SIGKILL');
      await once(vanished.payload, 'exit');
      expect(admission(config, vanished.id)).toEqual({
        job: vanished.id,
        state: 'held',
        running: false,
      });
    });

    test('a job admitted but not launched is not running', () => {
      const { runtime, config } = pool();
      const queued = runtime.enqueueHostJob(
        { descriptor: build, label: 'starting', waitSeconds: 0 },
        globalThis.process.pid,
      );
      if (queued.kind !== 'queued') throw new Error(queued.reason);
      const admitted = runtime.pollHostJob(queued.ticket, () => undefined);
      if (admitted.kind !== 'admitted') throw new Error(`not admitted: ${admitted.kind}`);
      expect(admission(config, admitted.job.id)).toEqual({
        job: admitted.job.id,
        state: 'starting',
        running: false,
      });
    });

    test('a ledger of another version is refused 70 and not migrated', async () => {
      const { root, config, runtime } = pool();
      runtime.close();
      const ledger = join(root, '.dash', 'resources.sqlite');
      const db = new Database(ledger);
      db.run(
        'DROP TABLE host_pool_mode_records; DROP TABLE event_refusals; DROP TABLE dropped_events; ALTER TABLE host_pool DROP COLUMN guard; ALTER TABLE host_pool DROP COLUMN guard_holder; ALTER TABLE host_pool DROP COLUMN switching; ALTER TABLE host_pool DROP COLUMN hold_corruption; PRAGMA user_version=1',
      );
      db.close();
      const stderr: string[] = [];
      const code = await runOps(
        {
          command: 'ops',
          words: 'job admission',
          config,
          job: '0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0',
        },
        {
          clock,
          monotonic: monotonicClock(),
          environment: globalThis.process.env,
          cwd: globalThis.process.cwd(),
          stdout: () => {
            throw new Error('a refused admission prints nothing on stdout');
          },
          stderr: (text) => stderr.push(text),
          telemetry: linuxScopeTelemetry(),
          host: ampleHost,
          user: 'puni1',
          legacyLock: () => privateLegacyLock('/nonexistent'),
        },
      );
      expect(code).toBe(70);
      expect(stderr.join('')).toContain('resource ledger version 1 is not 3');
      const after = new Database(ledger, { readonly: true });
      expect(
        after.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version,
      ).toBe(1);
      after.close();
    });

    test('the grammar takes only a job id', () => {
      expect(() =>
        parseDashCommand(['ops', 'job', 'admission', '--config', '/c', '--job', 'gate']),
      ).toThrow();
      expect(
        parseDashCommand([
          'ops',
          'job',
          'admission',
          '--config',
          '/c',
          '--job',
          '0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0',
        ]),
      ).toMatchObject({ words: 'job admission', job: '0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0' });
    });
  });
