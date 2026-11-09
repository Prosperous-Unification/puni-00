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
        // Reader cancellation can reject the writer with EPIPE or ECONNRESET before kill wins.
        // Keep the existing bounded lifetime for those observed closure errors; rethrow all others.
        // Proof: removing transport termination failed both authority cases with exit0/null;
        // injecting EIO likewise failed with exit1/null. Both children were reaped.
        `const chunk = Buffer.alloc(65536); for (let n = 0; n < 512; n++) { try { await Bun.write(Bun.${pipe}, chunk); } catch (cause) { if (!(cause instanceof Error && 'code' in cause && (cause.code === 'EPIPE' || cause.code === 'ECONNRESET'))) throw cause; break; } } await Bun.sleep(750); process.exit(0);`,
      ],
      { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
    );
    let reaped = false;
    const exit = child.exited.then(() => {
      reaped = true;
    });
    const spawn = spyOn(Bun, 'spawn').mockReturnValue(child);
    try {
      // The production transport uses only these trusted enrollment fields.
      const enrollment = { sshHost: 'fixture' } as ManagedRegistry;
      expect(
        await rejectionOf(connectRegistryAuthority(enrollment)({ command: 'read' })),
      ).toBeInstanceOf(Error);
      console.log(
        JSON.stringify({
          boundary: `authority-${pipe}-terminal`,
          exitCode: child.exitCode,
          signal: child.signalCode,
          reaped,
          pid: child.pid,
        }),
      );
      expect(child.signalCode).toBe('SIGKILL');
      expect(reaped).toBe(true);
      expect(() => process.kill(child.pid, 0)).toThrow();
      console.log(
        JSON.stringify({
          boundary: `authority-${pipe}`,
          signal: child.signalCode,
          reaped,
          absentPid: child.pid,
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
      spawn.mockRestore();
      if (child.exitCode === null) child.kill('SIGKILL');
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
