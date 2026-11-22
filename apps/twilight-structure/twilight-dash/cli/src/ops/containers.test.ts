import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { ContainerWatch } from './containers';
import { CONTAINER_IMAGE, probeDocker } from './ops.test.fixture';

/**
 * `dash-host-jobs` slice 3 review F2f, F8 and F11 against a stub `docker` CLI: the watch's own
 * judgements when the daemon's answers are unusable. Runs anywhere; the real-daemon cases are in
 * job-run.test.ts.
 */
describe('the container watch against a stub docker (review F2f, F8, F11)', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true });
  });
  const container = (index: number) => String(index).repeat(64).slice(0, 64);
  /** A create event, or another action, at `timeNano` (null leaves the field out). */
  const event = (
    id: string,
    labels: Record<string, string>,
    action = 'create',
    timeNano: number | null = 1_800_000_000_100_000_000,
  ) =>
    JSON.stringify({
      id,
      Action: action,
      ...(timeNano === null ? {} : { timeNano }),
      Actor: { ID: id, Attributes: { image: 'busybox', ...labels } },
    });

  /**
   * A stub CLI: the streaming `events` prints `stream` then waits; `events --until` prints
   * `replay`, or fails when `replay-fails` exists; `inspect` prints `inspect` (256 MiB and one
   * core unless given), or, given `inspectError`, prints it to stderr and exits 1.
   */
  function stubDocker(files: {
    stream?: string;
    replay?: string;
    replayFails?: boolean;
    inspect?: string;
    inspectError?: string;
  }) {
    const directory = mkdtempSync(join(tmpdir(), 'dash-stub-docker-'));
    directories.push(directory);
    writeFileSync(join(directory, 'stream'), files.stream ?? '');
    writeFileSync(join(directory, 'replay'), files.replay ?? '');
    writeFileSync(join(directory, 'inspect'), files.inspect ?? '268435456 1000000000\n');
    if (files.replayFails === true) writeFileSync(join(directory, 'replay-fails'), '');
    if (files.inspectError !== undefined)
      writeFileSync(join(directory, 'inspect-error'), files.inspectError);
    const docker = join(directory, 'docker');
    writeFileSync(
      docker,
      [
        '#!/bin/sh',
        `stub=${directory}`,
        'case "$1" in',
        '  events)',
        '    case " $* " in',
        '      *" --until "*)',
        '        if [ -e "$stub/replay-fails" ]; then echo "replay refused by the stub" >&2; exit 1; fi',
        '        cat "$stub/replay"; exit 0 ;;',
        '    esac',
        '    cat "$stub/stream"; exec sleep 60 ;;',
        '  inspect)',
        '    if [ -e "$stub/inspect-error" ]; then cat "$stub/inspect-error" >&2; exit 1; fi',
        '    cat "$stub/inspect" ;;',
        '  *) exit 0 ;;',
        'esac',
      ].join('\n'),
    );
    chmodSync(docker, 0o755);
    return docker;
  }

  function watch(docker: string, isLiveJob: (id: string) => boolean = () => false) {
    return ContainerWatch.start(
      docker,
      { PATH: process.env['PATH'] },
      'job-one',
      { memoryGib: 1, cpuCores: 1 },
      10_000,
      1800000000000,
      isLiveJob,
    );
  }

  test('a failed docker events replay is an unverified verdict', async () => {
    const verdicts = await watch(stubDocker({ replayFails: true })).finish(1800000001000);
    expect(verdicts).toEqual([
      {
        id: 'replay',
        verdict: 'unverified',
        reason: 'docker events replay failed: replay refused by the stub',
      },
    ]);
  });

  test('a container labelled with no live job is unlabelled; one of a live job is not judged', async () => {
    const docker = stubDocker({
      replay: `${event(container(1), { 'puni.job': 'gone-job' })}\n${event(container(2), { 'puni.job': 'live-other' })}\n${event(container(3), { 'puni.job': 'job-one' })}\n`,
    });
    const verdicts = await watch(docker, (id) => id === 'live-other').finish(1800000001000);
    expect(verdicts).toEqual([
      {
        id: container(1),
        verdict: 'unlabelled',
        reason: 'container from busybox is labelled puni.job=gone-job, which names no live job',
      },
      {
        id: container(3),
        verdict: 'bounded',
        reason: 'labelled, memory 268435456 bytes, 1 cores',
      },
    ]);
  });

  test('a failing docker events stream is an unverified verdict', async () => {
    // One unterminated line longer than any event: the reader refuses the stream.
    const docker = stubDocker({ stream: 'x'.repeat(2 * 1024 * 1024) });
    const watcher = watch(docker);
    await Bun.sleep(500);
    const verdicts = await watcher.finish(1800000001000);
    expect(verdicts).toEqual([
      {
        id: 'stream',
        verdict: 'unverified',
        reason: 'docker events stream failed: an event line exceeds 1048576 bytes',
      },
    ]);
  });

  describe('host-service containers beside the job (task 6.22, A-ATTR-HOSTSVC-1)', () => {
    const service = { 'puni.host-service': 'goaccess-reports' };

    test('a labelled, bounded host-service container is attributed as host-service', async () => {
      const docker = stubDocker({
        replay: `${event(container(1), service)}\n`,
        inspect: '536870912 1000000000\n',
      });
      expect(await watch(docker).finish(1800000001000)).toEqual([
        {
          id: container(1),
          verdict: 'host-service',
          reason: 'host service goaccess-reports, memory 536870912 bytes, 1 cores',
          hostService: { name: 'goaccess-reports', memoryBytes: 536870912, cpuCores: 1 },
        },
      ]);
    });

    test('a host-service container without --memory or --cpus stays unlabelled, naming the missing bound', async () => {
      const unbounded = stubDocker({
        replay: `${event(container(1), service)}\n`,
        inspect: '0 0\n',
      });
      const uncapped = stubDocker({
        replay: `${event(container(2), service)}\n`,
        inspect: '536870912 0\n',
      });
      expect([
        ...(await watch(unbounded).finish(1800000001000)),
        ...(await watch(uncapped).finish(1800000001000)),
      ]).toEqual([
        {
          id: container(1),
          verdict: 'unlabelled',
          reason:
            'container from busybox is labelled puni.host-service=goaccess-reports but started without --memory and --cpus; a host service is attributed only under declared bounds',
        },
        {
          id: container(2),
          verdict: 'unlabelled',
          reason:
            'container from busybox is labelled puni.host-service=goaccess-reports but started without --cpus; a host service is attributed only under declared bounds',
        },
      ]);
    });

    test('a container with both labels is judged as the job container it names', async () => {
      const docker = stubDocker({
        replay: `${event(container(1), { ...service, 'puni.job': 'job-one' })}\n`,
        inspect: '2147483648 1000000000\n',
      });
      expect(await watch(docker).finish(1800000001000)).toEqual([
        {
          id: container(1),
          verdict: 'unbounded',
          reason: 'container from busybox has memory limit 2147483648, bound 1073741824 bytes',
        },
      ]);
    });

    test('a host-service label with no name is unlabelled', async () => {
      const docker = stubDocker({
        replay: `${event(container(1), { 'puni.host-service': '' })}\n`,
        inspect: '536870912 1000000000\n',
      });
      expect(await watch(docker).finish(1800000001000)).toEqual([
        {
          id: container(1),
          verdict: 'unlabelled',
          reason:
            'container from busybox is labelled puni.host-service with no name; a host service is attributed only by name',
        },
      ]);
    });
  });

  describe('a labelled container removed before inspection (A-ATTR-ENDED-1)', () => {
    const created = 1_800_000_000_100_000_000;
    const noSuch = (id: string) => `Error response from daemon: No such container: ${id}\n`;
    /** The replay of one container created at `createdAt` and, unless null, dying `afterMs` later. */
    const lived = (
      id: string,
      labels: Record<string, string>,
      afterMs: number | null,
      createdAt: number | null = created,
    ) =>
      [
        event(id, labels, 'create', createdAt),
        ...(afterMs === null ? [] : [event(id, labels, 'die', created + afterMs * 1e6)]),
        '',
      ].join('\n');
    const backup = { 'puni.host-service': 'sqlite3-backup' };

    test('a labelled host-service container removed before inspection is attributed from its events', async () => {
      const docker = stubDocker({
        replay: lived(container(1), backup, 1200),
        inspectError: noSuch(container(1)),
      });
      expect(await watch(docker).finish(1800000001000)).toEqual([
        {
          id: container(1),
          verdict: 'lifetime-bounded',
          reason:
            'host-service=sqlite3-backup from its create event (ended before inspection, lifetime 1.2 s)',
          lifetimeBound: {
            label: 'puni.host-service',
            name: 'sqlite3-backup',
            lifetimeMs: 1200,
            sampleIntervalMs: 10_000,
          },
        },
      ]);
    });

    test('a die event only the closing replay delivers still dates the lifetime', async () => {
      const create = event(container(1), backup);
      const docker = stubDocker({
        stream: `${create}\n`,
        replay: lived(container(1), backup, 800),
        inspectError: noSuch(container(1)),
      });
      const watcher = watch(docker);
      // The stream's create is judged and its inspect fails before the replay is read.
      await Bun.sleep(500);
      expect(await watcher.finish(1800000001000)).toMatchObject([
        { id: container(1), verdict: 'lifetime-bounded', lifetimeBound: { lifetimeMs: 800 } },
      ]);
    });

    test('a container labelled with this job removed before inspection is attributed to it', async () => {
      const docker = stubDocker({
        replay: lived(container(1), { 'puni.job': 'job-one' }, 300),
        inspectError: noSuch(container(1)),
      });
      expect(await watch(docker).finish(1800000001000)).toMatchObject([
        {
          verdict: 'lifetime-bounded',
          reason: 'job=job-one from its create event (ended before inspection, lifetime 0.3 s)',
          lifetimeBound: { label: 'puni.job', name: 'job-one', lifetimeMs: 300 },
        },
      ]);
    });

    test('an unlabelled container removed before inspection stays unlabelled', async () => {
      const docker = stubDocker({
        replay: lived(container(1), {}, 200),
        inspectError: noSuch(container(1)),
      });
      expect(await watch(docker).finish(1800000001000)).toEqual([
        {
          id: container(1),
          verdict: 'unlabelled',
          reason: 'container from busybox started without the puni.job label',
        },
      ]);
    });

    test('a removed labelled container without its die event stays unverified', async () => {
      const docker = stubDocker({
        replay: lived(container(1), backup, null),
        inspectError: noSuch(container(1)),
      });
      expect(await watch(docker).finish(1800000001000)).toEqual([
        {
          id: container(1),
          verdict: 'unverified',
          reason:
            'container from busybox labelled puni.host-service=sqlite3-backup was removed before its bound was read, and no die event dates its lifetime',
        },
      ]);
    });

    test('a removed labelled container whose create event carries no time stays unverified', async () => {
      const docker = stubDocker({
        replay: lived(container(1), backup, 1200, null),
        inspectError: noSuch(container(1)),
      });
      expect(await watch(docker).finish(1800000001000)).toMatchObject([
        {
          verdict: 'unverified',
          reason:
            'container from busybox labelled puni.host-service=sqlite3-backup was removed before its bound was read, and no create event dates its lifetime',
        },
      ]);
    });

    test('a removed labelled container that lived longer than one sampling interval stays unverified', async () => {
      const docker = stubDocker({
        replay: lived(container(1), backup, 12_000),
        inspectError: noSuch(container(1)),
      });
      expect(await watch(docker).finish(1800000001000)).toMatchObject([
        {
          verdict: 'unverified',
          reason:
            'container from busybox labelled puni.host-service=sqlite3-backup was removed before its bound was read after a lifetime of 12.0 s, longer than one sampling interval (10000 ms)',
        },
      ]);
    });

    test('an inspect failing for another reason stays unverified', async () => {
      const docker = stubDocker({
        replay: lived(container(1), backup, 1200),
        inspectError: 'permission denied while trying to connect to the docker daemon\n',
      });
      expect(await watch(docker).finish(1800000001000)).toMatchObject([
        {
          verdict: 'unverified',
          reason:
            'container ended or was unreadable before its bound was read: permission denied while trying to connect to the docker daemon',
        },
      ]);
    });

    test('an event with an action the watch did not ask for is unverified', async () => {
      const docker = stubDocker({ replay: `${event(container(1), backup, 'destroy')}\n` });
      expect(await watch(docker).finish(1800000001000)).toEqual([
        {
          id: 'malformed:0',
          verdict: 'unverified',
          reason: `docker events answered action destroy for ${container(1).slice(0, 12)}, not create or die`,
        },
      ]);
    });
  });

  const docker = probeDocker();
  test.skipIf(!docker.available)(
    `a real --rm host-service container removed before the watch reads it is lifetime-bounded${docker.available ? '' : ` (skipped: ${docker.reason})`}`,
    async () => {
      // The container runs and is removed before the watch starts, so the stream's replayed
      // create is inspected after the daemon has forgotten it: the race, made certain.
      const sinceMs = Date.now() - 1000;
      const ran = Bun.spawnSync(
        [
          'docker',
          'run',
          '--rm',
          '--label',
          'puni.host-service=dash-test-ended',
          '--memory',
          '64m',
          '--cpus',
          '0.5',
          CONTAINER_IMAGE,
          'true',
        ],
        { stdout: 'pipe', stderr: 'pipe', timeout: 60000 },
      );
      expect(ran.exitCode).toBe(0);
      const watcher = ContainerWatch.start(
        'docker',
        { PATH: process.env['PATH'] },
        'job-one',
        { memoryGib: 1, cpuCores: 1 },
        10_000,
        sinceMs,
        () => false,
      );
      await Bun.sleep(1500);
      const mine = (await watcher.finish(Date.now())).filter(
        (verdict) => verdict.verdict !== 'unlabelled',
      );
      expect(mine).toMatchObject([
        {
          verdict: 'lifetime-bounded',
          lifetimeBound: { label: 'puni.host-service', name: 'dash-test-ended' },
        },
      ]);
    },
    90000,
  );
});
