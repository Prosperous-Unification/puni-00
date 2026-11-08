import { expect, test } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { runRegistryClientWorker } from './registry-client-worker';
import { registryClusterFixture } from './registry-maintenance-cluster.fixture';
import type { RegistryMaintenanceJournal } from './registry-managed-journal';
import { requireRejection } from './registry-rejection.fixture';

for (const action of ['verify-images', 'verify-recovery-images'] as const) {
  test(
    'client launcher refuses unenrolled ' + action + ' before any tool or source access',
    async () => {
      const installed = {
        ...registryClusterFixture().installed,
        client: { state: 'unenrolled' as const },
      };
      const refused = await requireRejection(
        runRegistryClientWorker({
          installed,
          journal: {} as RegistryMaintenanceJournal,
          request: {
            action,
            operationId: 'launcher',
            owner: 'owner',
            token: '49b9ccfb-04ee-4f5d-9c86-555c631db40d',
          },
          signal: new AbortController().signal,
          descriptor: 3,
          beforeLaunch: () => invokeRegistryCallback(() => undefined),
        }),
      );
      expect(refused.throwCause).toThrow('not enrolled');
    },
  );
}

test('client launcher refuses another fixed action before even inspecting enrollment', async () => {
  const refused = await requireRejection(
    runRegistryClientWorker({
      installed: registryClusterFixture().installed,
      journal: {} as RegistryMaintenanceJournal,
      request: {
        action: 'inspect',
        operationId: 'launcher',
        owner: 'owner',
        token: '49b9ccfb-04ee-4f5d-9c86-555c631db40d',
      },
      signal: new AbortController().signal,
      descriptor: 3,
      beforeLaunch: () => invokeRegistryCallback(() => undefined),
    }),
  );
  expect(refused.throwCause).toThrow('Unsupported fixed client launcher action');
});

for (const fault of ['cancel-pipe', 'child', 'stdout', 'stderr', 'send'] as const) {
  test(
    'client launcher retains owner cancellation with concurrent ' +
      fault +
      ' failure after scope cleanup',
    async () => {
      const { spyOn } = await import('bun:test');
      const artifacts = await import('./registry-maintenance-installation');
      const capacities = await import('./registry-capacity');
      const authority = await import('./registry-authority-host');
      const plans = await import('./registry-client-plan');
      const lifetimes = await import('./registry-maintenance-process');
      const custody = await import('./registry-client-custody');
      const owner = new AbortController();
      const reason = new Error('owner cancellation');
      const pipe = Object.assign(new Error('worker concurrent ' + fault + ' fault'), {
        code: 'EPIPE',
      });
      let closed = false;
      let controls = 0;
      const profile = { path: '/fixed', sha256: 'a'.repeat(64) };
      const installed = {
        client: {
          state: 'enrolled',
          scope: { ...profile, path: '/usr/bin/systemd-run' },
          control: { ...profile, path: '/usr/bin/systemctl' },
          worker: profile,
          scratch: { path: '/scratch', receiptPath: '/scratch.receipt' },
        },
      };
      // Modeled trusted artifact/filesystem/process ports; the launcher itself handles cancellation and terminal cleanup.
      const verified = spyOn(artifacts, 'verifyRegistryHostArtifact').mockResolvedValue(
        Buffer.alloc(0),
      );
      const measured = spyOn(capacities, 'measureVerifiedFilesystem').mockResolvedValue({
        allocationUnitBytes: 4096,
      } as never);
      const selected = spyOn(authority, 'selectRegistryAuthorityStorage').mockReturnValue({
        path: '/source',
        storageId: 'source',
        maximumBytes: 1,
      } as never);
      const planned = spyOn(plans, 'planRegistryClientPulls').mockResolvedValue({
        binding: {},
        revisions: [],
        pulls: [],
      } as never);
      const reaped = spyOn(lifetimes, 'awaitMaintenanceChild').mockImplementation((child) =>
        child.pid === 100 && fault === 'child' ? Promise.reject(pipe) : Promise.resolve(),
      );
      const owned = spyOn(custody, 'runRegistryClientCustody').mockImplementation(
        async (input: unknown) => {
          const prepared = input as {
            assertInactive: (unit: string) => Promise<void>;
            execute: (attempt: { unit: string }) => Promise<never>;
          };
          const unit = 'puni-registry-client-11111111-1111-4111-8111-111111111111.scope';
          await prepared.assertInactive(unit);
          return prepared.execute({ unit });
        },
      );
      const spawned = spyOn(Bun, 'spawn').mockImplementation((argv: unknown) => {
        if (!Array.isArray(argv)) throw new Error('Expected fixed argument array');
        if (argv[0] === '/usr/bin/systemctl') {
          controls++;
          return {
            pid: 99,
            exitCode: 0,
            exited: Promise.resolve(0),
            stdout: new Response('LoadState=not-found\nActiveState=inactive\nControlGroup=\n').body,
            stderr: new Response('').body,
          } as never;
        }
        return {
          pid: 100,
          exitCode: 0,
          exited: Promise.resolve(0),
          stdin: {
            write(text: string) {
              if (text === 'cancel\n')
                return fault === 'cancel-pipe' ? Promise.reject(pipe) : text.length;
              queueMicrotask(() => {
                owner.abort(reason);
              });
              return fault === 'send' ? Promise.reject(pipe) : text.length;
            },
            flush: () => Promise.resolve(0),
            end: () => {
              closed = true;
              return 0;
            },
          },
          stdout:
            fault === 'stdout'
              ? new ReadableStream<Uint8Array>({
                  start(controller) {
                    controller.error(pipe);
                  },
                })
              : new Response(
                  JSON.stringify({ kind: 'cancelled', receipt: 'owned-effects-terminated' }) + '\n',
                ).body,
          stderr:
            fault === 'stderr'
              ? new ReadableStream<Uint8Array>({
                  start(controller) {
                    controller.error(pipe);
                  },
                })
              : new Response('').body,
        } as never;
      });
      try {
        const refused = await requireRejection(
          runRegistryClientWorker({
            installed,
            journal: {
              enrollment: {},
              maintenanceEvidence: { backup: { snapshotId: 'a'.repeat(64) } },
            },
            request: {
              action: 'verify-images',
              operationId: 'launcher',
              owner: 'owner',
              token: '49b9ccfb-04ee-4f5d-9c86-555c631db40d',
            },
            signal: owner.signal,
            descriptor: 3,
            beforeLaunch: () => invokeRegistryCallback(() => undefined),
          } as never),
        );
        expect(closed).toBe(true);
        expect(owned).toHaveBeenCalledTimes(1);
        expect(controls).toBe(2);
        expect(refused.cause).toBeInstanceOf(AggregateError);
        if (!(refused.cause instanceof AggregateError))
          throw new Error('Expected cancellation plus failed cancel write');
        expect(refused.cause.cause).toBe(reason);
        expect(refused.cause.errors).toHaveLength(2);
        expect(refused.cause.errors[0]).toBe(reason);
        const secondary: unknown = refused.cause.errors[1];
        if (fault === 'stdout' || fault === 'stderr') {
          expect(secondary).toBeInstanceOf(AggregateError);
          if (!(secondary instanceof AggregateError))
            throw new Error('Missing stream read/cancel failure');
          expect(secondary.cause).toBe(pipe);
          expect(secondary.errors).toContain(pipe);
        } else expect(secondary).toBe(pipe);
      } finally {
        for (const mocked of [verified, measured, selected, planned, reaped, owned, spawned])
          mocked.mockRestore();
      }
    },
  );
}
