import { rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import { observeSourceParticipantListener } from './dependency-participant-listener';

test('source listener must belong to the actual application FD, not merely its shared network namespace', async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      '-e',
      "const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(){return new Response('ok')}}); console.log(server.port); await new Response(Bun.stdin.stream()).text(); server.stop(true);",
    ],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  );
  const foreign = Bun.spawn(
    [process.execPath, '-e', 'await new Response(Bun.stdin.stream()).text();'],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  );
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
  } finally {
    foreign.kill('SIGKILL');
    await foreign.exited;
    await new Response(foreign.stderr).text();
    child.kill('SIGKILL');
    await child.exited;
    await new Response(child.stderr).text();
  }
}, 20000);
