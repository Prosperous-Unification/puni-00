import { rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import { observeSourceParticipantListener } from './dependency-participant-listener';

async function drain(stream: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stream.getReader();
  try {
    for (;;) if ((await reader.read()).done) break;
  } finally {
    reader.releaseLock();
  }
}

test('source listener must belong to the actual application FD, not merely its shared network namespace', async () => {
  // Proof: console.log emitted ANSI readiness bytes under FORCE_COLOR=1 and this actual FD test refused the malformed port.
  const child = Bun.spawn(
    [
      process.execPath,
      '-e',
      "const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(){return new Response('ok')}}); process.stdout.write(String(server.port)+'\\n'); await new Response(Bun.stdin.stream()).text(); server.stop(true);",
    ],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', env: { ...process.env, FORCE_COLOR: '1' } },
  );
  const foreign = Bun.spawn(
    [process.execPath, '-e', 'await new Response(Bun.stdin.stream()).text();'],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  );
  let primaryFailure: Error | undefined;
  const cleanupFailures: unknown[] = [];
  try {
    const reader = child.stdout.getReader();
    const first = await reader.read();
    reader.releaseLock();
    if (first.done) throw new Error('native listener child exited before readiness');
    const port = Number(new TextDecoder().decode(first.value).trim());
    if (!Number.isSafeInteger(port) || port <= 0) throw new Error('native listener port malformed');
    const observed = await observeSourceParticipantListener(
      child.pid,
      port,
      performance.now() + 10000,
    );
    expect(observed.process.pid).toBe(child.pid);
    expect(observed.listeners).toHaveLength(1);
    expect(observed.listeners[0]?.port).toBe(port);
    expect(observed.listeners[0]?.address).toBe('127.0.0.1');
    expect(observed.listeners[0]?.inode).toMatch(/^[1-9][0-9]*$/);
    await rejects(observeSourceParticipantListener(foreign.pid, port, performance.now() + 10000));
    await rejects(observeSourceParticipantListener(child.pid, port, performance.now() - 1));
    await rejects(observeSourceParticipantListener(child.pid, 0, performance.now() + 10000));
  } catch (cause) {
    primaryFailure =
      cause instanceof Error ? cause : new Error('native listener assertion failed', { cause });
  } finally {
    foreign.kill('SIGKILL');
    child.kill('SIGKILL');
    const settled = await Promise.allSettled([
      foreign.exited,
      drain(foreign.stdout),
      drain(foreign.stderr),
      child.exited,
      drain(child.stdout),
      drain(child.stderr),
    ]);
    for (const entry of settled)
      if (entry.status === 'rejected') {
        const cause: unknown = entry.reason;
        cleanupFailures.push(cause);
      }
  }
  if (cleanupFailures.length !== 0) {
    if (primaryFailure !== undefined) cleanupFailures.unshift(primaryFailure);
    throw new AggregateError(cleanupFailures, 'native source listener fixture cleanup failed');
  }
  if (primaryFailure !== undefined) throw primaryFailure;
}, 20000);
