import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it, spyOn } from 'bun:test';

import { snapshotImage, uploadArtifact } from './platform-registry';
import { inspectOciArchive } from './registry-artifact';
import { connectRegistryAuthority, type ManagedRegistry } from './registry-enrollment';

function overflowingResponse(chunkBytes: number, status = 200) {
  const observed = { produced: 0, cancelled: false };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      observed.produced += chunkBytes;
      controller.enqueue(new Uint8Array(chunkBytes));
      // Finite fallback lets the broken implementation fail assertions without hanging.
      if (observed.produced >= 32 * 1024 * 1024) controller.close();
    },
    cancel() {
      observed.cancelled = true;
    },
  });
  return {
    observed,
    response: new Response(body, {
      status,
      headers: { 'content-type': 'application/vnd.oci.image.manifest.v1+json' },
    }),
  };
}

it('cancels chunked oversized source metadata before parsing or staging its bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'registry-stream-'));
  const overflow = overflowingResponse(65536);
  const fetcher = spyOn(globalThis, 'fetch').mockResolvedValue(overflow.response);
  try {
    expect(
      await rejectionOf(snapshotImage({ url: 'http://source' }, directory, 'proof', 'tag')),
    ).toBeInstanceOf(Error);
    expect(overflow.observed.cancelled).toBe(true);
    expect(overflow.observed.produced).toBeLessThanOrEqual(4 * 1024 * 1024 + 2 * 65536);
    expect(await Bun.file(join(directory, 'index.json')).exists()).toBe(false);
    console.log(JSON.stringify({ boundary: 'source-metadata', ...overflow.observed }));
  } finally {
    fetcher.mockRestore();
    await rm(directory, { recursive: true });
  }
});

it('cancels chunked oversized managed HTTP error diagnostics while receiving', async () => {
  const artifact = await inspectOciArchive(
    new URL('./fixtures/dagger-0.21.9.oci.tar', import.meta.url).pathname,
    'proof',
    'tag',
  );
  const overflow = overflowingResponse(4096, 503);
  const fetcher = spyOn(globalThis, 'fetch').mockResolvedValue(overflow.response);
  try {
    expect(await rejectionOf(uploadArtifact({ url: 'http://target' }, artifact))).toBeInstanceOf(
      Error,
    );
    expect(overflow.observed.cancelled).toBe(true);
    expect(overflow.observed.produced).toBeLessThanOrEqual(65536 + 2 * 4096);
    console.log(JSON.stringify({ boundary: 'HTTP-diagnostic', ...overflow.observed }));
  } finally {
    fetcher.mockRestore();
  }
});

it('cancels target verification immediately after exceeding the admitted content size', async () => {
  const artifact = await inspectOciArchive(
    new URL('./fixtures/dagger-0.21.9.oci.tar', import.meta.url).pathname,
    'proof',
    'tag',
  );
  const overflow = overflowingResponse(4096);
  const serve = Object.assign(
    (_input: Parameters<typeof fetch>[0], options?: Parameters<typeof fetch>[1]) => {
      if (options?.method === 'POST')
        return Promise.resolve(
          new Response(null, { status: 202, headers: { location: '/upload' } }),
        );
      if (options?.method === 'PUT')
        return Promise.resolve(
          new Response(null, {
            status: 201,
            headers: { 'docker-content-digest': artifact.digest },
          }),
        );
      return Promise.resolve(overflow.response);
    },
    { preconnect: globalThis.fetch.preconnect },
  );
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(serve);
  try {
    expect(await rejectionOf(uploadArtifact({ url: 'http://target' }, artifact))).toBeInstanceOf(
      Error,
    );
    expect(overflow.observed.cancelled).toBe(true);
    expect(overflow.observed.produced).toBeLessThanOrEqual(8192);
    console.log(JSON.stringify({ boundary: 'target-content', ...overflow.observed }));
  } finally {
    fetcher.mockRestore();
  }
});

for (const pipe of ['stdout', 'stderr'] as const) {
  it(`kills and reaps an authority emitting oversized ${pipe} before it exits`, async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        '-e',
        // Bound emission without letting natural exit substitute for the live-child kill proof.
        `setInterval(() => undefined, 1000);
const chunk = Buffer.alloc(65536);
try {
  for (let emitted = 0; emitted < 512; emitted++) await Bun.write(Bun.${pipe}, chunk);
} catch (cause) {
  if (!(cause instanceof Error && 'code' in cause && (cause.code === 'EPIPE' || cause.code === 'ECONNRESET'))) throw cause;
}`,
      ],
      { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
    );
    let reaped = false;
    const exit = child.exited.then(() => {
      reaped = true;
    });
    const nativeKill = child.kill.bind(child);
    const liveAtKill: boolean[] = [];
    const kill = spyOn(child, 'kill').mockImplementation((signal) => {
      liveAtKill.push(child.exitCode === null);
      nativeKill(signal);
    });
    let watchdogUsed = false;
    // Rescue stays inside the canonical 30-second test budget; any use invalidates this proof.
    const watchdog = setTimeout(() => {
      watchdogUsed = true;
      // Bypass the observed boundary method: test cleanup cannot become a production kill witness.
      nativeKill('SIGKILL');
    }, 10000);
    const spawn = spyOn(Bun, 'spawn').mockReturnValue(child);
    try {
      // The production transport uses only these trusted enrollment fields.
      const enrollment = { sshHost: 'fixture' } as ManagedRegistry;
      const failure = await rejectionOf(connectRegistryAuthority(enrollment)({ command: 'read' }));
      const overflow: unknown = failure instanceof AggregateError ? failure.errors[0] : failure;
      expect(overflow).toBeInstanceOf(Error);
      if (!(overflow instanceof Error)) throw new Error('Missing authority overflow cause');
      // Proof: unrelated send EPERM passed the original generic-error test; this exact-cause assertion refuses it.
      expect(overflow.message).toBe(
        `Registry authority ${pipe} exceeds ${pipe === 'stdout' ? '16777216' : '65536'} bytes`,
      );
      // Proof: isolated production kill removal requires the watchdog and fails this assertion, then restores green.
      expect(watchdogUsed).toBe(false);
      expect(kill.mock.calls).toEqual([['SIGKILL']]);
      expect(liveAtKill).toEqual([true]);
      expect(child.signalCode).toBe('SIGKILL');
      expect(reaped).toBe(true);
      let absence: unknown;
      try {
        process.kill(child.pid, 0);
      } catch (cause) {
        absence = cause;
      }
      // Proof: an injected EPERM from the owned PID probe fails here; only ESRCH establishes absence.
      expect(absence).toMatchObject({ code: 'ESRCH' });
      console.log(
        JSON.stringify({
          boundary: `authority-${pipe}`,
          signal: child.signalCode,
          reaped,
          absentPid: child.pid,
          overflow: overflow.message,
          watchdogUsed,
          liveAtKill,
        }),
      );
      expect(spawn.mock.calls[0]?.[0]).toEqual([
        '/usr/bin/ssh',
        '-o',
        'BatchMode=yes',
        '--',
        'fixture',
        'sudo -n /usr/local/sbin/puni-registry-authority',
      ]);
    } finally {
      clearTimeout(watchdog);
      spawn.mockRestore();
      kill.mockRestore();
      if (child.exitCode === null) nativeKill('SIGKILL');
      await exit;
    }
  });
}

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (cause) {
    if (cause instanceof Error) return cause;
    throw cause;
  }
  throw new Error('Expected receiving boundary refusal');
}
