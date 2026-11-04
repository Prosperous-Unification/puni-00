import { chmod } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { executeRegistryCommand, runRegistryMaintenance } from './registry-journal';
import { superviseRegistryMaintenance } from './registry-maintenance-control';
import { requireRejection } from './registry-rejection.fixture';

const GiB = 1024 ** 3;
const enrollment = {
  registryId: 'control',
  storageId: 'owned',
  owners: ['operator'],
  registryPath: '/registry',
  rootPath: '/',
  maximumBytes: 50 * GiB,
  journalMaximumBytes: GiB,
};
const ports = {
  measureJournal: () =>
    Promise.resolve({
      usableBytes: GiB,
      allocationUnitBytes: 4096,
      usedBytes: 1000,
      totalInodes: 10000,
      usedInodes: 10,
    }),
  measureRegistry: () =>
    Promise.resolve({
      maximumBytes: 50 * GiB,
      usableBytes: 50 * GiB,
      usedBytes: GiB,
      totalInodes: 10000,
      usedInodes: 10,
      rootFreeBytes: 30 * GiB,
    }),
};
async function fixture() {
  const directory = await scratchAsync('registry-maintenance-control-');
  await chmod(directory, 0o700);
  await executeRegistryCommand(directory, { command: 'initialize', enrollment }, ports);
  await executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports);
  return directory;
}
async function refusal(pending: Promise<unknown>, message: string) {
  try {
    await pending;
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    expect(cause.message).toContain(message);
    return;
  }
  throw new Error('Expected refusal');
}

for (const injected of [
  { action: 'arbitrary' },
  { argv: ['/bin/sh'] },
  { environment: { LD_PRELOAD: '/injected' } },
]) {
  test(`fixed helper rejects unsupported action/fields ${JSON.stringify(injected)} before effects`, async () => {
    const directory = await fixture();
    let effects = 0;
    await refusal(
      runRegistryMaintenance(
        directory,
        { operationId: 'control', owner: 'operator', kind: 'backup', recover: false },
        ports,
        async (session) => {
          const owned = session.read().maintenance;
          if (owned === null) throw new Error('Missing maintenance');
          const input = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                Buffer.from(
                  JSON.stringify({
                    action: 'inspect',
                    operationId: owned.operationId,
                    owner: owned.owner,
                    token: owned.token,
                    ...injected,
                  }) + '\n',
                ),
              );
            },
          });
          await superviseRegistryMaintenance({
            directory,
            uid: process.getuid?.(),
            descriptor: session.authorityDescriptor,
            input,
            deadlineMs: 5000,
            execute: () => {
              effects++;
              return Promise.resolve({});
            },
          });
        },
      ),
      'fixed maintenance request',
    );
    expect(effects).toBe(0);
  });
}

for (const mode of ['cancel', 'deadline'] as const) {
  test(`native helper ${mode} reaps its descendants before releasing inherited authority`, async () => {
    const directory = await fixture();
    const started = join(directory, 'started');
    const escaped = join(directory, 'escaped');
    await refusal(
      runRegistryMaintenance(
        directory,
        { operationId: 'control', owner: 'operator', kind: 'backup', recover: false },
        ports,
        async (session) => {
          const owned = session.read().maintenance;
          if (owned === null) throw new Error('Missing maintenance');
          const source = `import {superviseRegistryMaintenance} from './registry-maintenance-control';
        import {writeFile} from 'node:fs/promises';
        import { awaitMaintenanceChild, installMaintenanceReaper } from './registry-maintenance-process';
        installMaintenanceReaper();
        await superviseRegistryMaintenance({directory:process.argv[1],uid:process.getuid(),descriptor:3,input:Bun.stdin.stream(),deadlineMs:${String(mode === 'deadline' ? 500 : 5000)},execute:async(_request,signal)=>{
          const child=Bun.spawn(['/bin/sh','-c','sleep 2; touch "$1"','owned',process.argv[3]],{stdio:['ignore','ignore','ignore',3],detached:true});
          await writeFile(process.argv[2],'started');
          await awaitMaintenanceChild(child, signal);
          return {done:true};
        }});`;
          const child = Bun.spawn([process.execPath, '-e', source, directory, started, escaped], {
            cwd: import.meta.dir,
            stdio: ['pipe', 'pipe', 'pipe', session.authorityDescriptor],
          });
          await child.stdin.write(
            JSON.stringify({
              action: 'inspect',
              operationId: owned.operationId,
              owner: owned.owner,
              token: owned.token,
            }) + '\n',
          );
          // Schema imports can exceed one second before the helper starts its unchanged deadline.
          for (let attempt = 0; attempt < 500; attempt++) {
            if (await Bun.file(started).exists()) break;
            await Bun.sleep(10);
          }
          expect(await Bun.file(started).text()).toBe('started');
          await refusal(executeRegistryCommand(directory, { command: 'read' }, ports), 'busy');
          if (mode === 'cancel') await child.stdin.write('cancel\n');
          const code = await child.exited;
          const diagnostic = await new Response(child.stderr).text();
          await new Response(child.stdout).text();
          await child.stdin.end();
          expect(code).not.toBe(0);
          expect(diagnostic).toContain(mode === 'deadline' ? 'deadline' : 'cancelled');
          await Bun.sleep(2100);
          expect(await Bun.file(escaped).exists()).toBe(false);
          throw new Error('native cancellation proved');
        },
      ),
      'native cancellation proved',
    );
  });
}

test('parent SIGKILL leaves helper-held lock until EOF cleanup is reaped', async () => {
  const directory = await fixture();
  const owner = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, 'registry-maintenance-control.fixture.ts'),
      'owner',
      directory,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  try {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await Bun.file(join(directory, 'started')).exists()) break;
      await Bun.sleep(10);
    }
    expect(await Bun.file(join(directory, 'started')).text()).toBe('started');
    owner.kill('SIGKILL');
    await owner.exited;
    await refusal(executeRegistryCommand(directory, { command: 'read' }, ports), 'busy');
    for (let attempt = 0; attempt < 300; attempt++) {
      if (await Bun.file(join(directory, 'reaped')).exists()) break;
      await Bun.sleep(10);
    }
    expect(await Bun.file(join(directory, 'reaped')).text()).toBe('reaped');
    await Bun.sleep(100);
    const state = (await executeRegistryCommand(directory, { command: 'read' }, ports)).state;
    expect(state).toMatchObject({
      fenced: true,
      maintenance: { operationId: 'control', phase: 'acquired' },
    });
    expect(await Bun.file(join(directory, 'escaped')).exists()).toBe(false);
  } finally {
    if (owner.exitCode === null) owner.kill('SIGKILL');
    await owner.exited;
    await Promise.all([new Response(owner.stdout).text(), new Response(owner.stderr).text()]);
  }
});

test('root deadline cancels a blocked first request read', async () => {
  const directory = await fixture();
  let effects = 0;
  await refusal(
    runRegistryMaintenance(
      directory,
      { operationId: 'control', owner: 'operator', kind: 'backup', recover: false },
      ports,
      async (session) => {
        let timer: ReturnType<typeof setTimeout>;
        const input = new ReadableStream<Uint8Array>({
          start(controller) {
            timer = setTimeout(() => {
              controller.close();
            }, 200);
          },
          cancel() {
            clearTimeout(timer);
          },
        });
        const started = performance.now();
        await refusal(
          superviseRegistryMaintenance({
            directory,
            uid: process.getuid?.(),
            descriptor: session.authorityDescriptor,
            input,
            deadlineMs: 20,
            execute: () => {
              effects++;
              return Promise.resolve({});
            },
          }),
          'deadline',
        );
        expect(performance.now() - started).toBeLessThan(150);
        throw new Error('deadline proved');
      },
    ),
    'deadline proved',
  );
  expect(effects).toBe(0);
});

test('modeled cancel accepts fragmented control frames', async () => {
  const directory = await fixture();
  await refusal(
    runRegistryMaintenance(
      directory,
      { operationId: 'control', owner: 'operator', kind: 'backup', recover: false },
      ports,
      async (session) => {
        const owned = session.read().maintenance;
        if (owned === null) throw new Error('Missing maintenance');
        const input = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              Buffer.from(
                JSON.stringify({
                  action: 'inspect',
                  operationId: owned.operationId,
                  owner: owned.owner,
                  token: owned.token,
                }) + '\n',
              ),
            );
            controller.enqueue(Buffer.from('can'));
            controller.enqueue(Buffer.from('cel\n'));
          },
        });
        await superviseRegistryMaintenance({
          directory,
          uid: process.getuid?.(),
          descriptor: session.authorityDescriptor,
          input,
          deadlineMs: 500,
          execute: async (_request, signal) => {
            if (!signal.aborted)
              await new Promise<void>((resolve) => {
                signal.addEventListener(
                  'abort',
                  () => {
                    resolve();
                  },
                  { once: true },
                );
              });
            signal.throwIfAborted();
          },
        });
      },
    ),
    'cancelled by owner',
  );
});

test('fixed worker interruption cancels input and effects under the held authority', async () => {
  const directory = await fixture();
  const interrupted = new AbortController();
  let effects = 0;
  expect(
    (
      await requireRejection(
        runRegistryMaintenance(
          directory,
          { operationId: 'control', owner: 'operator', kind: 'backup', recover: false },
          ports,
          async (session) => {
            const owned = session.read().maintenance;
            if (owned === null) throw new Error('Missing fixture operation');
            const input = new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(
                  Buffer.from(
                    JSON.stringify({
                      action: 'inspect',
                      operationId: owned.operationId,
                      owner: owned.owner,
                      token: owned.token,
                    }) + '\n',
                  ),
                );
              },
            });
            const pending = superviseRegistryMaintenance({
              directory,
              uid: process.getuid?.(),
              descriptor: session.authorityDescriptor,
              input,
              deadlineMs: 2000,
              interrupt: interrupted.signal,
              execute: async (_request, signal) => {
                effects++;
                interrupted.abort(new Error('fixed worker SIGINT'));
                await Bun.sleep(10);
                signal.throwIfAborted();
                return 'incorrect success';
              },
            });
            expect((await requireRejection(pending)).throwCause).toThrow('fixed worker SIGINT');
            throw new Error('interruption observed');
          },
        ),
      )
    ).throwCause,
  ).toThrow('interruption observed');
  expect(effects).toBe(1);
});

for (const action of ['verify-images', 'verify-recovery-images'] as const) {
  test('fixed helper phase gates ' + action, async () => {
    const directory = await fixture();
    const stopped = new Error('client action phase proved');
    const refused = await requireRejection(
      runRegistryMaintenance(
        directory,
        { operationId: 'client-control', owner: 'operator', kind: 'backup', recover: false },
        ports,
        async (session) => {
          const invoke = () => {
            const owned = session.read().maintenance;
            if (owned === null) throw new Error('Missing client operation');
            return superviseRegistryMaintenance({
              directory,
              uid: process.getuid?.(),
              descriptor: session.authorityDescriptor,
              deadlineMs: 1000,
              input: new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(
                    Buffer.from(
                      JSON.stringify({
                        action,
                        operationId: owned.operationId,
                        owner: owned.owner,
                        token: owned.token,
                      }) + '\n',
                    ),
                  );
                },
              }),
              execute: (request) => Promise.resolve(request.action),
            });
          };
          const early = await requireRejection(invoke());
          expect(early.throwCause).toThrow('maintenance phase');
          const evidence = session.read().maintenanceEvidence;
          if (evidence === null) throw new Error('Missing client evidence');
          await session.record({ ...evidence, runtime: 'modeled stopped-writer receipt' });
          await session.advance('reconciled');
          await session.advance('fenced');
          await session.advance('stopped');
          if (action === 'verify-recovery-images') {
            const premature = await requireRejection(invoke());
            expect(premature.throwCause).toThrow('maintenance phase');
            const current = session.read();
            if (current.maintenanceEvidence === null) throw new Error('Missing stopped evidence');
            await session.record({
              ...current.maintenanceEvidence,
              backup: {
                snapshotId: 'a'.repeat(64),
                verifiedAt: current.updatedAt,
                registryId: current.enrollment.registryId,
                storageId: current.enrollment.storageId,
                registryPath: current.enrollment.registryPath,
                journalPath: directory,
                journalRevision: current.revision,
                journalSha256: 'b'.repeat(64),
                censusSha256: 'c'.repeat(64),
                bytes: 1,
              },
            });
            await session.advance('backed-up');
            expect(await invoke()).toBe(action);
          } else expect(await invoke()).toBe(action);
          throw stopped;
        },
      ),
    );
    expect(refused.cause).toBe(stopped);
  });
}

for (const fault of ['both', 'cancel-only', 'interrupt'] as const)
  test(
    'actual supervisor preserves failures and releases the reader after rejected cancellation: ' +
      fault,
    async () => {
      const directory = await fixture();
      const primary = new Error('owned effect failed'),
        cleanup = new Error('input cancellation failed'),
        proved = new Error('supervisor cleanup proved');
      const stopped = new AbortController();
      const outer = await requireRejection(
        runRegistryMaintenance(
          directory,
          { operationId: 'cleanup', owner: 'operator', kind: 'backup', recover: false },
          ports,
          async (session) => {
            const owned = session.read().maintenance;
            if (owned === null) throw new Error('Missing actual supervisor fixture owner');
            const input = new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(
                  Buffer.from(
                    JSON.stringify({
                      action: 'inspect',
                      operationId: owned.operationId,
                      owner: owned.owner,
                      token: owned.token,
                    }) + '\n',
                  ),
                );
              },
              cancel() {
                throw cleanup;
              },
            });
            const refused = await requireRejection(
              superviseRegistryMaintenance({
                directory,
                uid: process.getuid?.(),
                descriptor: session.authorityDescriptor,
                input,
                deadlineMs: 5000,
                interrupt: stopped.signal,
                execute: async (_request, signal) => {
                  if (fault === 'interrupt') {
                    stopped.abort(primary);
                    await Bun.sleep(20);
                    signal.throwIfAborted();
                  }
                  if (fault !== 'cancel-only') throw primary;
                  return 'must not acknowledge cleanup failure';
                },
              }),
            );
            expect(input.locked).toBe(false);
            if (fault === 'cancel-only') expect(refused.cause).toBe(cleanup);
            else {
              expect(refused.cause).toBeInstanceOf(AggregateError);
              if (!(refused.cause instanceof AggregateError))
                throw new Error('Missing original plus cleanup failure');
              expect(refused.cause.errors).toEqual([primary, cleanup]);
              expect(refused.cause.cause).toBe(primary);
            }
            throw proved;
          },
        ),
      );
      expect(outer.cause).toBe(proved);
    },
  );
