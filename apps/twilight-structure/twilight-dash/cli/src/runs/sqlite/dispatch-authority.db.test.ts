import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { createRuntimeClient } from '../../bridge/runtime-client';
import { dispatchAuthority } from '../dispatch-authority';
import { organizationId, ownerId } from '../record-codecs';
import { readRuntimeHistory } from '../runtime-history';
import { authorityDispatchContract } from '../testing/authority-dispatch-contract';
import { FixtureClock, unwrapReply } from '../testing/fixtures';
import {
  authorityReceipt,
  authorityRequest,
  runtimePin,
  runtimeScope,
} from '../testing/runtime-history-contract';
import { bootstrapSqliteStores, openSqliteStores } from './open-stores';

async function createStores() {
  const directory = mkdtempSync(join(tmpdir(), 'authority-dispatch-'));
  const clock = new FixtureClock();
  const options = {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock,
    maxBusyAttempts: 20,
    busyDelayMilliseconds: 1,
  };
  const stores = await bootstrapSqliteStores(options);
  let closing: Promise<void> | undefined;
  return {
    ...stores,
    clock,
    options,
    disconnect: (): Promise<void> => stores.close(),
    close(): Promise<void> {
      if (closing !== undefined) return closing;
      closing = (async () => {
        await stores.close();
        rmSync(directory, { recursive: true, force: true });
      })();
      return closing;
    },
  };
}
authorityDispatchContract('sqlite authority dispatch', createStores);

test('SQLite close/reopen preserves pending bytes for lookup under original live guard', async () => {
  const stores = await createStores();
  let reopened: Awaited<ReturnType<typeof openSqliteStores>> | undefined;
  try {
    const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
    unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
    const guard = { ownership, scope: runtimeScope, expectedRevision: 0 };
    let receipt: string | undefined;
    const sent: string[] = [];
    const client = createRuntimeClient(async (shape) => {
      sent.push(shape.operationId);
      if (shape.operationId === 'acquireRuntimeAuthority') {
        const history = await stores.runs.readRuntimeScope(runtimeScope);
        const intent = history.kind === 'pinned' ? history.intents.at(0) : undefined;
        if (intent === undefined) throw new Error('intent missing');
        receipt = JSON.stringify(authorityReceipt(intent));
        throw new Error('simulated lost response after receiver commit');
      }
      if (receipt === undefined) throw new Error('receiver receipt missing');
      return new Response(receipt);
    });
    const first = await dispatchAuthority(
      stores.runs,
      stores.artifacts,
      client,
      guard,
      authorityRequest(),
      new AbortController().signal,
    );
    expect(first.kind).toBe('pending');
    const before = await stores.runs.readRuntimeScope(runtimeScope);
    await stores.disconnect();
    reopened = await openSqliteStores(stores.options);
    expect(await reopened.runs.readRuntimeScope(runtimeScope)).toEqual(before);
    const reply = await dispatchAuthority(
      reopened.runs,
      reopened.artifacts,
      client,
      guard,
      authorityRequest(),
      new AbortController().signal,
    );
    expect(reply.kind).toBe('accepted');
    expect(sent).toEqual(['acquireRuntimeAuthority', 'lookupRuntimeReceipt']);
    expect(await readRuntimeHistory(reopened.runs, reopened.artifacts, runtimeScope)).toMatchObject(
      { pendingCommandId: null },
    );
    // Close/reopen tests retained provider state; it does not simulate process-kill, power loss or fencing recovery.
  } finally {
    await reopened?.close();
    await stores.close();
  }
});
