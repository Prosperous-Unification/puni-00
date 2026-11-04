import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import { parseRegistryCommandResponse, type RegistryMaintenanceJournal } from './registry-journal';
import { assertRegistryMaintenanceLock } from './registry-maintenance-process';
import { completeRegistryOperation } from './registry-operation-completion';

const Request = type({
  action:
    "'inspect'|'fence'|'assert-stopped'|'serve-readonly'|'serve-deletion'|'collect'|'discard-uploads'|'restore-service'|'verify-recovery-target'|'identify'|'assert-desired'|'serve-recovery'|'backup-preflight'|'backup-snapshot'|'backup-verify'|'backup-restore'|'backup-reconcile'|'verify-images'|'verify-recovery-images'",
  operationId: '0 < string <= 256',
  owner: '0 < string <= 256',
  token: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  '+': 'reject',
});
export type RegistryMaintenanceHostRequest = typeof Request.infer;

/** Only explicit owner cancellation/EOF is a successful controlled helper stop after owned-child cleanup. */
export class RegistryMaintenanceCancellation extends Error {
  constructor(reason: 'owner' | 'eof') {
    super(
      reason === 'owner' ? 'Maintenance cancelled by owner' : 'Maintenance cancelled by owner EOF',
    );
  }
}

/**
 * Fixed-action privileged protocol, never a command runner. The root-owned caller supplies
 * its installed directory/UID and implementation, not JSON clients. One bounded request line
 * is followed only by cancel or EOF. Root-side action implementations kill/reap their owned
 * descendants on the signal before returning; the inherited FD stays open until they settle.
 */
export async function superviseRegistryMaintenance<T>(input: {
  directory: string;
  uid: number | undefined;
  descriptor: number;
  input: ReadableStream<Uint8Array>;
  deadlineMs: number;
  /** Only the fixed root worker's own signal handler may supply this; it is never request JSON. */
  interrupt?: AbortSignal;
  execute: (
    request: RegistryMaintenanceHostRequest,
    signal: AbortSignal,
    journal: RegistryMaintenanceJournal,
  ) => Promise<T>;
}): Promise<T> {
  await assertRegistryMaintenanceLock(input.directory, input.descriptor, input.uid);
  if (
    !Number.isSafeInteger(input.deadlineMs) ||
    input.deadlineMs <= 0 ||
    input.deadlineMs > 3600000
  )
    throw new Error('Invalid root maintenance deadline');
  const reader = input.input.getReader();
  const controller = new AbortController();
  const cancellations: Promise<{ state: 'closed' } | { state: 'failed'; cause: unknown }>[] = [];
  const cancelRead = () => {
    // Observe rejection immediately: owned-effect teardown may outlive the stream cancellation.
    // Proof: supervisor-cancel-observation replacement fails the actual interrupt test while owned teardown waits20ms.
    cancellations.push(
      reader.cancel().then(
        () => ({ state: 'closed' as const }),
        (cause: unknown) => ({ state: 'failed' as const, cause }),
      ),
    );
  };
  // Proof: withheld first line is cancelled; HOST49 removes only these two compiled callback effects,
  // observes no interrupt at130s, rescues the exact owned owner and proves cancellation/group cleanup before refusal.
  // The native fixture deadline is120s; this is not elapsed proof of the production CLI one-hour setting.
  const timeout = setTimeout(() => {
    controller.abort(new Error('Root maintenance deadline exceeded'));
    cancelRead();
  }, input.deadlineMs);
  let control: Promise<void> | undefined;
  const interrupt = () => {
    controller.abort(input.interrupt?.reason);
    cancelRead();
  };
  input.interrupt?.addEventListener('abort', interrupt, { once: true });
  if (input.interrupt?.aborted === true) interrupt();
  // Proof: supervisor-primary and supervisor-release removals lose original failure or leave the native reader locked in registry-maintenance-control.test.ts.
  return completeRegistryOperation(
    async () => {
      let buffered = Buffer.alloc(0);
      for (;;) {
        const newline = buffered.indexOf(10);
        if (newline !== -1) break;
        const chunk = await reader.read();
        controller.signal.throwIfAborted();
        if (chunk.done) throw new Error('Incomplete fixed maintenance request');
        buffered = Buffer.concat([buffered, chunk.value]);
        if (buffered.length > 4096) throw new Error('Oversized fixed maintenance request');
        controller.signal.throwIfAborted();
      }
      const newline = buffered.indexOf(10);
      let decoded: unknown;
      try {
        decoded = JSON.parse(buffered.subarray(0, newline).toString('utf8'));
      } catch (cause) {
        throw new Error('Malformed fixed maintenance request', { cause });
      }
      const request = Request(decoded);
      // Proof: unsupported action and argv/environment fields fail before the effect callback.
      if (request instanceof type.errors) throw new Error('Malformed fixed maintenance request');
      const descriptor = await open(
        join(input.directory, 'journal.json'),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      let serialized: string;
      try {
        const status = await descriptor.stat();
        if (
          !status.isFile() ||
          status.uid !== input.uid ||
          (status.mode & 0o777) !== 0o600 ||
          status.nlink !== 1 ||
          status.size > 16 * 1024 ** 2
        )
          throw new Error('Invalid canonical maintenance journal metadata');
        serialized = await descriptor.readFile('utf8');
      } finally {
        await descriptor.close();
      }
      const decodedJournal: unknown = JSON.parse(serialized);
      const journal = parseRegistryCommandResponse({ state: decodedJournal }).state;
      const owned = journal.maintenance;
      if (
        journal.schemaVersion !== 4 ||
        !journal.fenced ||
        owned?.operationId !== request.operationId ||
        owned.owner !== request.owner ||
        owned.token !== request.token ||
        owned.phase === 'failed' ||
        journal.maintenanceEvidence?.operationId !== request.operationId
      )
        throw new Error('Fixed helper requires current fenced session ownership');
      const phases: Record<RegistryMaintenanceHostRequest['action'], readonly string[]> = {
        inspect: ['acquired'],
        'backup-preflight': [
          'acquired',
          'reconciled',
          'fenced',
          'stopped',
          'backed-up',
          'deleting',
          'collected',
          'verified',
          'restored',
        ],
        'backup-reconcile': [
          'acquired',
          'reconciled',
          'fenced',
          'stopped',
          'backed-up',
          'deleting',
          'collected',
          'verified',
          'restored',
        ],
        'backup-snapshot': ['stopped'],
        'backup-verify': ['stopped', 'backed-up', 'deleting', 'collected', 'verified', 'restored'],
        'backup-restore': ['backed-up', 'deleting', 'collected', 'verified'],
        fence: [
          'reconciled',
          'fenced',
          'stopped',
          'backed-up',
          'deleting',
          'collected',
          'verified',
          'restored',
        ],
        identify: [
          'reconciled',
          'fenced',
          'stopped',
          'backed-up',
          'deleting',
          'collected',
          'verified',
          'restored',
        ],
        'assert-desired': ['verified', 'restored'],
        'serve-recovery': ['backed-up', 'deleting', 'collected', 'verified'],
        'assert-stopped': [
          'reconciled',
          'fenced',
          'stopped',
          'backed-up',
          'deleting',
          'collected',
          'verified',
          'restored',
        ],
        'serve-readonly': ['stopped', 'backed-up', 'deleting', 'collected', 'verified', 'restored'],
        // Proof: actual held-session action tests refuse acquired/current and stopped/recovery admission.
        'verify-images': ['stopped', 'backed-up', 'deleting', 'collected', 'verified', 'restored'],
        'verify-recovery-images': ['backed-up', 'deleting', 'collected', 'verified'],
        'serve-deletion': ['deleting'],
        collect: ['deleting'],
        'discard-uploads': ['deleting'],
        'restore-service': ['verified', 'restored'],
        'verify-recovery-target': [
          'stopped',
          'backed-up',
          'deleting',
          'collected',
          'verified',
          'restored',
        ],
      };
      if (!phases[request.action].includes(owned.phase))
        throw new Error('Fixed action is invalid in this maintenance phase');
      let trailing = buffered.subarray(newline + 1);
      control = (async () => {
        try {
          for (;;) {
            if (trailing.length > 0) {
              // Proof: fragmented cancel frames are accumulated; arbitrary/oversized control is refused.
              if (!Buffer.from('cancel\n').subarray(0, trailing.length).equals(trailing))
                throw new Error('Unsupported maintenance control input');
              if (trailing.length === 7) {
                controller.abort(new RegistryMaintenanceCancellation('owner'));
                return;
              }
            }
            const chunk = await reader.read();
            if (chunk.done) {
              controller.abort(new RegistryMaintenanceCancellation('eof'));
              return;
            }
            trailing = Buffer.concat([trailing, chunk.value]);
          }
        } catch (cause) {
          controller.abort(cause);
        }
      })();
      controller.signal.throwIfAborted();
      const completed = await input.execute(request, controller.signal, journal);
      controller.signal.throwIfAborted();
      return completed;
    },
    () =>
      completeRegistryOperation(
        async () => {
          clearTimeout(timeout);
          input.interrupt?.removeEventListener('abort', interrupt);
          // Resolve the control watcher without unlocking authority or restoring service.
          cancelRead();
          const cancelled = await Promise.all(cancellations);
          await control;
          const failures: unknown[] = [];
          for (const outcome of cancelled)
            if (outcome.state === 'failed') failures.push(outcome.cause);
          if (failures.length === 1) throw failures[0];
          if (failures.length > 1)
            throw new AggregateError(failures, 'Maintenance input cancellations failed', {
              cause: failures[0],
            });
        },
        () => {
          reader.releaseLock();
          return Promise.resolve();
        },
      ),
  );
}
