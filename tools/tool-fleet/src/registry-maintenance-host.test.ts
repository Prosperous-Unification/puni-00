import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { createRegistryClientCompletion } from './registry-client-completion';
import type { RegistryClientPullPlan } from './registry-client-plan';
import * as channel from './registry-maintenance-channel';
import { connectRegistryMaintenanceHost } from './registry-maintenance-host';
import * as sudo from './registry-maintenance-sudo';
import { requireRejection } from './registry-rejection.fixture';
let verified: ReturnType<typeof spyOn<typeof sudo, 'verifyRegistryMaintenanceSudo'>>;
let authenticated: ReturnType<typeof spyOn<typeof channel, 'authenticateMaintenanceChannel'>>;
let spawned: ReturnType<typeof spyOn<typeof Bun, 'spawn'>>;
let requests: unknown[];
let frame: () => Promise<channel.RegistryMaintenanceFrame>;
const empty = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });
beforeEach(() => {
  requests = [];
  frame = () => invokeRegistryCallback(() => ({ kind: 'complete', receipt: 'verified' }));
  verified = spyOn(sudo, 'verifyRegistryMaintenanceSudo').mockResolvedValue(undefined);
  authenticated = spyOn(channel, 'authenticateMaintenanceChannel').mockImplementation(() =>
    invokeRegistryCallback(() => ({
      guardianPid: 42,
      request: (request: unknown) =>
        invokeRegistryCallback(() => {
          requests.push(request);
        }),
      frame: async () => frame(),
      cancel: () => invokeRegistryCallback(() => undefined),
      end: () => invokeRegistryCallback(() => undefined),
      close: () => undefined,
    })),
  );
  spawned = spyOn(Bun, 'spawn').mockImplementation((argv: unknown, options?: unknown) => {
    expect(argv).toEqual([
      '/usr/bin/sudo.ws',
      '-n',
      '--',
      '/usr/local/libexec/puni-registry-maintenance-host',
    ]);
    expect(options).toEqual({
      env: { PATH: '/usr/bin:/bin', LANG: 'C' },
      stdio: [expect.any(Number), 'pipe', 'pipe'],
    });
    return {
      stdin: { write: () => 0, flush: () => 0, end: () => 0 },
      stdout: empty(),
      stderr: empty(),
      exited: Promise.resolve(0),
    } as never;
  });
});
afterEach(() => {
  spawned.mockRestore();
  authenticated.mockRestore();
  verified.mockRestore();
});
const authority = {
  authorityDescriptor: 37,
  prepareBackup: () =>
    invokeRegistryCallback(() => ({ id: '11111111-1111-4111-8111-111111111111' })),
  settleBackup: () => invokeRegistryCallback(() => undefined),
  read: () => ({
    maintenance: {
      operationId: 'owned',
      owner: 'operator',
      token: '00000000-0000-4000-8000-000000000001',
    },
  }),
};
test('fixed sudo transport uses only private FD0 socket and authenticates root before sending the token', async () => {
  const connection = await connectRegistryMaintenanceHost(authority as never, 'inspect');
  await connection.close();
  expect(authenticated).toHaveBeenCalledTimes(1);
  expect(requests).toEqual([{ action: 'inspect', ...authority.read().maintenance }]);
});
test('unverified fixed sudo refuses before any privileged spawn', async () => {
  verified.mockRejectedValue(new Error('Untrusted fixed sudo'));
  expect(
    (await requireRejection(connectRegistryMaintenanceHost(authority as never, 'inspect')))
      .throwCause,
  ).toThrow('Untrusted fixed sudo');
  expect(spawned).not.toHaveBeenCalled();
});
test('failed root authentication cannot expose the token to a relay', async () => {
  authenticated.mockRejectedValue(new Error('No current root credentials'));
  expect(
    (await requireRejection(connectRegistryMaintenanceHost(authority as never, 'inspect')))
      .throwCause,
  ).toThrow('No current root credentials');
  expect(requests).toEqual([]);
});
test('fixed transport refuses exit zero without explicit terminal cleanup acknowledgement', async () => {
  frame = () =>
    invokeRegistryCallback(() => {
      throw new Error('Maintenance helper omitted terminal acknowledgement');
    });
  expect(
    (await requireRejection(connectRegistryMaintenanceHost(authority as never, 'inspect')))
      .throwCause,
  ).toThrow('terminal acknowledgement');
});
test('root budget refusal is visible without provider diagnostics or credentials', async () => {
  frame = () =>
    invokeRegistryCallback(() => ({ kind: 'failed', receipt: 'backup-budget-unavailable' }));
  expect(
    (await requireRejection(connectRegistryMaintenanceHost(authority as never, 'backup-preflight')))
      .throwCause,
  ).toThrow('backup-budget-unavailable');
});
for (const action of [
  'backup-preflight',
  'backup-snapshot',
  'backup-verify',
  'backup-restore',
] as const) {
  test(`${action} persists authenticated guardian ownership before secret request and settles after terminal cleanup`, async () => {
    const order: string[] = [];
    const selected = {
      ...authority,
      prepareBackup: (received: string, pid: number) =>
        invokeRegistryCallback(() => {
          expect(received).toBe(action);
          expect(pid).toBe(42);
          expect(requests).toEqual([]);
          order.push('persisted');
          return { id: '11111111-1111-4111-8111-111111111111' };
        }),
      settleBackup: (id: string, receipt: string) =>
        invokeRegistryCallback(() => {
          expect(id).toBe('11111111-1111-4111-8111-111111111111');
          expect(receipt).toBe('verified');
          expect(order).toEqual(['persisted', 'terminal', 'channel-ended']);
          order.push('settled');
        }),
    };
    authenticated.mockImplementation(() =>
      invokeRegistryCallback(() => ({
        guardianPid: 42,
        request: (request: unknown) =>
          invokeRegistryCallback(() => {
            requests.push(request);
          }),
        frame: () =>
          invokeRegistryCallback(() => {
            expect(order).toEqual(['persisted']);
            order.push('terminal');
            return {
              kind: 'complete',
              receipt: JSON.stringify({
                attemptId: '11111111-1111-4111-8111-111111111111',
                receipt: 'verified',
              }),
            };
          }),
        cancel: () => invokeRegistryCallback(() => undefined),
        end: () =>
          invokeRegistryCallback(() => {
            order.push('channel-ended');
          }),
        close: () => undefined,
      })),
    );
    const connection = await connectRegistryMaintenanceHost(selected as never, action);
    expect(connection.receipt).toBe('verified');
    expect(order).toEqual(['persisted', 'terminal', 'channel-ended', 'settled']);
  });
}
test('failed durable backup preparation exposes no action token and never settles', async () => {
  let settlements = 0;
  expect(
    (
      await requireRejection(
        connectRegistryMaintenanceHost(
          {
            ...authority,
            prepareBackup: () =>
              invokeRegistryCallback(() => {
                throw new Error('journal full');
              }),
            settleBackup: () =>
              invokeRegistryCallback(() => {
                settlements++;
              }),
          } as never,
          'backup-preflight',
        ),
      )
    ).throwCause,
  ).toThrow('journal full');
  expect(requests).toEqual([]);
  expect(settlements).toBe(0);
});
for (const fault of ['missing', 'foreign', 'extra', 'trailing'] as const) {
  test(`backup ${fault} completion cannot settle durable ownership`, async () => {
    let settlements = 0;
    frame = () =>
      invokeRegistryCallback(() => ({
        kind: 'complete',
        receipt:
          fault === 'missing'
            ? 'verified'
            : JSON.stringify({
                attemptId:
                  fault === 'foreign'
                    ? '22222222-2222-4222-8222-222222222222'
                    : '11111111-1111-4111-8111-111111111111',
                receipt: 'verified',
                ...(fault === 'extra' ? { injected: true } : {}),
              }),
      }));
    if (fault === 'trailing') {
      authenticated.mockImplementation(() =>
        invokeRegistryCallback(() => ({
          guardianPid: 42,
          request: () => invokeRegistryCallback(() => undefined),
          frame,
          cancel: () => invokeRegistryCallback(() => undefined),
          end: () =>
            invokeRegistryCallback(() => {
              throw new Error('trailing frame');
            }),
          close: () => undefined,
        })),
      );
    }
    expect(
      (
        await requireRejection(
          connectRegistryMaintenanceHost(
            {
              ...authority,
              settleBackup: () =>
                invokeRegistryCallback(() => {
                  settlements++;
                }),
            } as never,
            'backup-preflight',
          ),
        )
      ).throwCause,
    ).toThrow();
    expect(settlements).toBe(0);
  });
}
test('fixed reconciliation reserves before request and persists exact receipt only after terminal cleanup', async () => {
  const order: string[] = [];
  const receipt = {
    operationId: 'owned',
    configurationSha256: 'b'.repeat(64),
    attemptIds: ['11111111-1111-4111-8111-111111111111'],
    removed: [],
    censusSha256: 'c'.repeat(64),
  };
  authenticated.mockImplementation(() =>
    invokeRegistryCallback(() => ({
      guardianPid: 42,
      request: (request: unknown) =>
        invokeRegistryCallback(() => {
          expect(order).toEqual(['reserved']);
          requests.push(request);
        }),
      frame: () =>
        invokeRegistryCallback(() => ({ kind: 'complete', receipt: JSON.stringify(receipt) })),
      cancel: () => invokeRegistryCallback(() => undefined),
      end: () =>
        invokeRegistryCallback(() => {
          order.push('terminal');
        }),
      close: () => undefined,
    })),
  );
  const connection = await connectRegistryMaintenanceHost(
    {
      ...authority,
      prepareBackupReconciliation: () =>
        invokeRegistryCallback(() => {
          expect(requests).toEqual([]);
          order.push('reserved');
        }),
      reconcileBackups: (observed: unknown) =>
        invokeRegistryCallback(() => {
          expect(order).toEqual(['reserved', 'terminal']);
          expect(observed).toEqual(receipt);
          order.push('recorded');
        }),
    } as never,
    'backup-reconcile',
  );
  expect(JSON.parse(connection.receipt)).toEqual(receipt);
  expect(order).toEqual(['reserved', 'terminal', 'recorded']);
});

const clientPlan: RegistryClientPullPlan = {
  binding: {
    journalRevision: 7,
    storageId: 'volume',
    registryPath: '/registry',
    censusSha256: 'c'.repeat(64),
    filesystem: '1:2',
  },
  revisions: [],
  pulls: [],
};
function clientAuthority(settleClient: (receipt: unknown, plan: unknown) => Promise<void>) {
  return {
    ...authority,
    settleClient,
    read: () => ({
      revision: 7,
      fenced: true,
      enrollment: { registryId: 'proof', storageId: 'volume', registryPath: '/registry' },
      maintenance: { ...authority.read().maintenance, phase: 'backed-up' },
      maintenanceEvidence: {
        operationId: 'owned',
        backup: { snapshotId: 'a'.repeat(64) },
        recovery: null,
      },
    }),
  };
}
function clientCompletion() {
  return createRegistryClientCompletion(
    clientPlan,
    { operationId: 'owned', registryId: 'proof', snapshotId: 'a'.repeat(64), scope: 'current' },
    new Date().toISOString(),
  );
}
test('client completion is settled only after root exit, diagnostic drain and terminal EOF', async () => {
  const order: string[] = [];
  const receipt = clientCompletion();
  authenticated.mockImplementation(() =>
    invokeRegistryCallback(() => ({
      guardianPid: 42,
      request: () => invokeRegistryCallback(() => undefined),
      frame: () =>
        invokeRegistryCallback(() => {
          order.push('terminal');
          return { kind: 'complete', receipt: JSON.stringify(receipt) };
        }),
      cancel: () => invokeRegistryCallback(() => undefined),
      end: () =>
        invokeRegistryCallback(() => {
          order.push('EOF');
        }),
      close: () => undefined,
    })),
  );
  const selected = clientAuthority((received, plan) =>
    invokeRegistryCallback(() => {
      expect(received).toEqual(receipt);
      expect(plan).toEqual(clientPlan);
      expect(order).toEqual(['terminal', 'EOF']);
      order.push('settled');
    }),
  );
  const connection = await connectRegistryMaintenanceHost(
    selected as never,
    'verify-images',
    clientPlan,
  );
  await connection.close();
  expect(order).toEqual(['terminal', 'EOF', 'settled']);
});
for (const fault of [
  'missing-plan',
  'foreign-plan',
  'missing-receipt',
  'foreign-scope',
  'extra-receipt',
  'exit',
  'diagnostics',
  'EOF',
  'settlement',
] as const)
  test('client completion refuses ' + fault + ' without a durable acknowledgement', async () => {
    let settlements = 0;
    const receipt = clientCompletion();
    if (fault === 'foreign-scope') receipt.scope = 'recovery';
    frame = () =>
      invokeRegistryCallback(() => ({
        kind: 'complete',
        receipt:
          fault === 'missing-receipt'
            ? 'verified'
            : JSON.stringify({
                ...receipt,
                ...(fault === 'extra-receipt' ? { token: 'forbidden' } : {}),
              }),
      }));
    if (fault === 'EOF')
      authenticated.mockImplementation(() =>
        invokeRegistryCallback(() => ({
          guardianPid: 42,
          request: () => invokeRegistryCallback(() => undefined),
          frame,
          cancel: () => invokeRegistryCallback(() => undefined),
          end: () =>
            invokeRegistryCallback(() => {
              throw new Error('trailing frame');
            }),
          close: () => undefined,
        })),
      );
    if (fault === 'exit' || fault === 'diagnostics')
      spawned.mockImplementation(
        () =>
          ({
            stdout:
              fault === 'diagnostics'
                ? new ReadableStream({
                    start(controller) {
                      controller.enqueue(new Uint8Array([1]));
                      controller.close();
                    },
                  })
                : empty(),
            stderr: empty(),
            exited: Promise.resolve(fault === 'exit' ? 1 : 0),
          }) as never,
      );
    const selected = clientAuthority(() =>
      invokeRegistryCallback(() => {
        if (fault === 'settlement') throw new Error('journal full');
        settlements++;
      }),
    );
    const plan =
      fault === 'missing-plan'
        ? undefined
        : fault === 'foreign-plan'
          ? { ...clientPlan, binding: { ...clientPlan.binding, journalRevision: 6 } }
          : clientPlan;
    expect(
      (
        await requireRejection(
          connectRegistryMaintenanceHost(selected as never, 'verify-images', plan),
        )
      ).throwCause,
    ).toThrow();
    expect(settlements).toBe(0);
    if (fault === 'missing-plan' || fault === 'foreign-plan')
      expect(spawned).not.toHaveBeenCalled();
  });
test('other host actions cannot carry a client plan', async () => {
  expect(
    (
      await requireRejection(
        connectRegistryMaintenanceHost(authority as never, 'inspect', clientPlan),
      )
    ).throwCause,
  ).toThrow();
  expect(spawned).not.toHaveBeenCalled();
});
