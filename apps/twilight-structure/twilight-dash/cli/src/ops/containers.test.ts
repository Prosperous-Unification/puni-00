import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { ContainerWatch } from './containers';

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
  const event = (id: string, labels: Record<string, string>) =>
    JSON.stringify({ id, Actor: { ID: id, Attributes: { image: 'busybox', ...labels } } });

  /**
   * A stub CLI: the streaming `events` prints `stream` then waits; `events --until` prints
   * `replay`, or fails when `replay-fails` exists; `inspect` prints `inspect`.
   */
  function stubDocker(files: { stream?: string; replay?: string; replayFails?: boolean }) {
    const directory = mkdtempSync(join(tmpdir(), 'dash-stub-docker-'));
    directories.push(directory);
    writeFileSync(join(directory, 'stream'), files.stream ?? '');
    writeFileSync(join(directory, 'replay'), files.replay ?? '');
    writeFileSync(join(directory, 'inspect'), '268435456 1000000000\n');
    if (files.replayFails === true) writeFileSync(join(directory, 'replay-fails'), '');
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
        '  inspect) cat "$stub/inspect" ;;',
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
});
