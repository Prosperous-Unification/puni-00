import { fetchTransport, type RuntimeState } from '@wbs/contracts';

import { OrganizationHarness } from '../../../../../../wbs/be-01/src/testing/organization-harness';
import { createRuntimeClient, type RuntimeClient } from '../../bridge/runtime-client';
import type { RuntimeScope } from '../runtime-records';

export interface RecoveryReceiverFixture {
  readonly client: RuntimeClient;
  readonly scope: RuntimeScope;
  readonly ledgerId: string;
  readonly workItemId: string;
  readonly stepId: string;
  readonly actorId: string;
  readonly requests: readonly { operationId: string; commandId: string | null }[];
  pause(commandId: string): { entered: Promise<void>; release(): void };
  observeRequests(
    observer: (request: { operationId: string; commandId: string | null }) => void,
  ): void;
  revokeAccess(): void;
  close(): Promise<void>;
}

/** Owns the composed SQLite/controller graph. Barriers stop actual transport before receiver admission. */
export async function createRecoveryReceiver(): Promise<RecoveryReceiverFixture> {
  const harness = OrganizationHarness.openComposed();
  const barriers = new Map<
    string,
    {
      entered: ReturnType<typeof Promise.withResolvers<undefined>>;
      release: ReturnType<typeof Promise.withResolvers<undefined>>;
    }
  >();
  const pending = new Set<Promise<Awaited<ReturnType<ReturnType<typeof fetchTransport>>>>>();
  const activeReleases = new Set<ReturnType<typeof Promise.withResolvers<undefined>>>();
  const observers: ((request: { operationId: string; commandId: string | null }) => void)[] = [];
  try {
    await harness.register('ada');
    harness.organization('org-a');
    harness.member('org-a', 'ada', 'admin');
    harness.bind('ada', 'org-a');
    harness.activate();
    const project = await harness.call('ada', 'POST', '/api/projects', { name: 'Recovery' });
    if (project.status !== 200) throw new Error(JSON.stringify(project));
    const projectId = (project.body as { project: { id: string } }).project.id;
    async function createCommand(path: string, command: unknown) {
      const answer = await harness.call('ada', 'POST', path, { commands: [command] });
      if (answer.status !== 200) throw new Error(JSON.stringify(answer));
      const identity = (answer.body as { results: { id: string }[] }).results.at(0)?.id;
      if (identity === undefined) throw new Error('fixture creation identity absent');
      return identity;
    }
    const personId = await createCommand('/api/directory/commands', {
      kind: 'createPerson',
      name: 'Resolver',
      teamIds: [],
    });
    const workItemId = await createCommand(`/api/projects/${projectId}/commands`, {
      kind: 'createWorkItem',
      parentId: null,
      name: 'Recover',
    });
    const step = await harness.call('ada', 'POST', `/api/projects/${projectId}/steps`, {
      name: 'Plan',
      code: 'plan',
    });
    if (step.status !== 200) throw new Error(JSON.stringify(step));
    const stepId = (step.body as { step: { id: string } }).step.id;
    const scope = { organizationId: 'org-a', projectId, personId };
    const requests: { operationId: string; commandId: string | null }[] = [];
    const transport = fetchTransport('http://localhost', (url, init) =>
      Promise.resolve(harness.app.handle(new Request(url, init))),
    );
    const client = createRuntimeClient((shape, input) => {
      const delivery = (async () => {
        const commandId =
          shape.method === 'POST'
            ? (input.body as { commandId: string }).commandId
            : (input.params['commandId'] ?? null);
        const request = { operationId: shape.operationId, commandId };
        requests.push(request);
        for (const observer of observers) observer(request);
        const barrier = commandId === null ? undefined : barriers.get(commandId);
        if (barrier !== undefined && commandId !== null) {
          barriers.delete(commandId);
          activeReleases.add(barrier.release);
          barrier.entered.resolve(undefined);
          try {
            await waitForReceiver(barrier.release.promise);
          } finally {
            activeReleases.delete(barrier.release);
          }
        }
        return transport(shape, {
          ...input,
          headers: {
            authorization: 'Bearer ' + harness.token('ada'),
            origin: 'http://localhost',
            'X-WBS-Expected-Organization': 'org-a',
          },
        });
      })();
      pending.add(delivery);
      void delivery.then(
        () => pending.delete(delivery),
        () => pending.delete(delivery),
      );
      return delivery;
    });
    const state = await client.readState({ params: { id: projectId }, query: { personId } });
    if (state.reply.kind !== 'success') throw new Error('receiver discovery failed');
    return {
      client,
      scope,
      ledgerId: state.reply.body.ledgerId,
      requests,
      workItemId,
      stepId,
      actorId: harness.userId('ada'),
      observeRequests(observer) {
        observers.push(observer);
      },
      revokeAccess() {
        harness.sqlite.run("DELETE FROM organization_membership WHERE organization_id = 'org-a'");
      },
      pause(commandId) {
        if (barriers.has(commandId)) throw new Error('duplicate receiver barrier');
        const entered = Promise.withResolvers<undefined>();
        const release = Promise.withResolvers<undefined>();
        barriers.set(commandId, { entered, release });
        return {
          entered: entered.promise,
          release: () => {
            release.resolve(undefined);
          },
        };
      },
      async close() {
        for (const barrier of barriers.values()) barrier.release.resolve(undefined);
        for (const release of activeReleases) release.resolve(undefined);
        barriers.clear();
        await Promise.all(pending);
        await harness.closeComposed();
      },
    };
  } catch (cause) {
    await harness.closeComposed();
    throw cause;
  }
}

export async function readReceiverState(receiver: RecoveryReceiverFixture): Promise<RuntimeState> {
  const exchange = await receiver.client.readState({
    params: { id: receiver.scope.projectId },
    query: { personId: receiver.scope.personId, expectedLedgerId: receiver.ledgerId },
  });
  if (exchange.reply.kind !== 'success') throw new Error('receiver state refused');
  return exchange.reply.body;
}

export async function acquireReceiverAuthority(
  receiver: RecoveryReceiverFixture,
  commandId: string,
  generation: number | null,
) {
  return receiver.client.acquireAuthority({
    params: { id: receiver.scope.projectId },
    body: {
      schemaVersion: 1,
      commandId,
      personId: receiver.scope.personId,
      expectedLedgerId: receiver.ledgerId,
      ownerId: 'receiver-owner',
      expectedGeneration: generation,
    },
  });
}

/** Finite handshake deadline, not an ordering delay; successful gates settle as soon as their owner releases them. */
export async function waitForReceiver<T>(pending: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('receiver handshake timed out'));
        }, 10000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
