import { expect, test } from 'bun:test';

import { completeRegistryFixture } from './registry-fixture-completion.fixture';
import { awaitMaintenanceChild, awaitRegistryBackupMember } from './registry-maintenance-process';
import { scopeMaintenanceReaper } from './registry-maintenance-reaper.fixture';
import { requireRejection } from './registry-rejection.fixture';

scopeMaintenanceReaper();

test('backup member refuses a detached descendant that escaped the worker process group', async () => {
  const child = Bun.spawn([process.execPath, '-e', 'await Bun.sleep(30000)'], {
    detached: true,
    stdout: 'ignore',
    stderr: 'ignore',
  });
  await completeRegistryFixture(async () => {
    expect(
      (await requireRejection(awaitRegistryBackupMember(child, AbortSignal.timeout(100))))
        .throwCause,
    ).toThrow('worker process group');
    expect(
      await Promise.race([child.exited.then(() => true), Bun.sleep(100).then(() => false)]),
    ).toBe(true);
    expect(() => process.kill(child.pid, 0)).toThrow();
  }, [
    async () => {
      child.kill('SIGKILL');
      await child.exited;
    },
  ]);
});

test('worker waits for its non-detached member SIGINT cleanup instead of exiting first', async () => {
  const source = `import { awaitRegistryBackupMember, awaitMaintenanceChild, installMaintenanceReaper } from ${JSON.stringify(new URL('./registry-maintenance-process.ts', import.meta.url).pathname)};
    const stopped = new AbortController();
    process.on('SIGINT', () => stopped.abort(new Error('cancelled')));
    const child = Bun.spawn([process.execPath, '-e', "process.on('SIGINT', async () => { await Bun.sleep(120); console.log('member-cleaned'); process.exit(130); }); console.log('member-ready'); await Bun.sleep(30000);"], {stdout:'pipe', stderr:'pipe'});
    const rescue = setTimeout(() => child.kill('SIGKILL'), 2000);
    const output = new Response(child.stdout).text();
    setTimeout(() => stopped.abort(new Error('cancelled')), 100);
    try { await awaitRegistryBackupMember(child, stopped.signal); throw Error('unexpected success'); }
    catch { console.log(await output); console.log('worker-after-member'); }
    finally { clearTimeout(rescue); if (child.exitCode === null) child.kill('SIGKILL'); await child.exited; }
  `;
  const worker = Bun.spawn([process.execPath, '-e', source], {
    detached: true,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  await completeRegistryFixture(async () => {
    expect(await worker.exited).toBe(0);
    const text = await new Response(worker.stdout).text();
    expect(text).toContain('member-ready\nmember-cleaned\n');
    expect(text.indexOf('worker-after-member')).toBeGreaterThan(text.indexOf('member-cleaned'));
    expect(await new Response(worker.stderr).text()).toBe('');
  }, [
    async () => {
      if (worker.exitCode === null) worker.kill('SIGKILL');
      try {
        await awaitMaintenanceChild(worker, new AbortController().signal);
      } catch (cause) {
        if (!(cause instanceof Error && cause.message.includes('child failed'))) throw cause;
      }
    },
  ]);
});
