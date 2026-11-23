import { isAbsolute } from 'node:path';

import {
  createInterrupts,
  createOutputs,
  type Diagnostic,
  type Interrupt,
  type Outputs,
} from '@shared/bun-output';
import type { QueueOutcome } from '@shared/heavy-lock';
import type { RequestRefusal } from '@shared/heavy-lock';

import { type LockCommand, UsageRefusal } from '../cli-parser';
import type { Context as ForegroundContext, Payload as ForegroundPayload } from './foreground';
import type { Payload as HolderPayload } from './holder';

export interface Context {
  readonly callerDirectory: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
}

/**
 * Compose one native executable owner below production pathname selection. The explicit selector
 * permits controlled fixture inodes; the installed entry uses only the canonical host selector.
 * Signals and sinks exist before request/context capture. Active foreground work defers holder
 * interruption until native settlement; unconfirmed waits retain this owner and its listeners.
 */
export function createLockOwner(selectPath: () => Promise<string>) {
  return async function runLock(
    input: LockCommand | (() => LockCommand),
    context: Context,
  ): Promise<number> {
    const interrupts = createInterrupts('lock'),
      controller = new AbortController();
    let first: Interrupt | undefined;
    const unsubscribe = interrupts.subscribe((signal) => {
      // Proof: owner-first-reason changed the real first-signal receipt when this latch was overwritten.
      first ??= signal;
      // Proof: owner-controller-abort kept protected native work live when cancellation was not forwarded.
      controller.abort();
    });
    const outputs = createOutputs({
      name: 'lock',
      stdout: () => Bun.stdout.writer(),
      stderr: () => Bun.stderr.writer(),
      subscribeInterrupts: interrupts.subscribe,
    });
    const encoder = new TextEncoder(),
      newline = String.fromCharCode(10);
    let hasFailed = false,
      status: number;
    let requestRefusal: typeof RequestRefusal | undefined;
    function isUsageFailure(cause: unknown): cause is Error {
      return (
        cause instanceof UsageRefusal ||
        (requestRefusal !== undefined && cause instanceof requestRefusal)
      );
    }
    function interruptionStatus(): 130 | 143 {
      if (first === undefined) throw new Error('lock cancellation has no recorded native signal');
      return first === 'SIGINT' ? 130 : 143;
    }
    async function diagnose(message: string): Promise<Diagnostic> {
      try {
        return await outputs.reportDiagnostic(encoder.encode(message + newline));
      } catch (cause) {
        return { kind: 'abandoned', cause };
      }
    }
    async function write(
      channel: Outputs['stdout'],
      text: string,
    ): Promise<'written' | 'cancelled'> {
      const timer = setTimeout(() => {
        outputs.failWrites(new Error('lock output did not settle'));
      }, 1000);
      try {
        return (await channel(encoder.encode(text))).kind;
      } finally {
        clearTimeout(timer);
      }
    }
    try {
      const command = typeof input === 'function' ? input() : input;
      // Proof: owner-request-snapshot changed actual run37 into status0 after selector-held mutation.
      const selected: LockCommand =
        command.words === 'lock status'
          ? { command: 'ops', words: 'lock status' }
          : command.words === 'lock hold-internal-v1'
            ? {
                command: 'ops',
                words: 'lock hold-internal-v1',
                holdFile: command.holdFile,
                controllerPid: command.controllerPid,
                controllerBoot: command.controllerBoot,
                controllerStart: command.controllerStart,
                label: command.label,
                waitSeconds: command.waitSeconds,
                pollSeconds: command.pollSeconds,
              }
            : {
                command: 'ops',
                words: 'lock run',
                // Proof: owner-argv-snapshot ran the actual decoy91 when the caller array was aliased.
                argv: [...command.argv],
                label: command.label,
                waitSeconds: command.waitSeconds,
                pollSeconds: command.pollSeconds,
              };
      const directory = context.callerDirectory;
      if (typeof directory !== 'string' || !isAbsolute(directory))
        throw new Error('lock caller directory must be absolute');
      // Proof: owner-environment-snapshot delivered the mutated value after selector wait without this copy.
      const environment = { ...context.environment };
      const library = await import('@shared/heavy-lock');
      requestRefusal = library.RequestRefusal;
      const path = await selectPath();
      if (selected.words === 'lock status') {
        const text = library.renderStatus(
          library.readStatus(path, library.readEpochNanoseconds() / 1000000000n),
        );
        status = (await write(outputs.stdout, text)) === 'cancelled' ? interruptionStatus() : 0;
      } else {
        const queueContext: ForegroundContext = {
          path,
          // Proof: owner-directory-snapshot ran the payload in a decoy cwd after a late getter reread.
          directory,
          environment,
          signal: controller.signal,
          reportAdmission: async (admission) => {
            await write(
              outputs.stderr,
              'heavy lock: waited ' +
                String(admission.waitedSeconds) +
                's behind ' +
                String(admission.aheadAtArrival) +
                ' tickets' +
                newline,
            );
          },
          reportUnconfirmed: async (observation) => {
            const diagnostic = await diagnose(
              'error: lock observation unconfirmed; owner ' +
                String(process.pid) +
                '; protected process ' +
                String(observation.pid),
            );
            if (diagnostic.kind === 'abandoned')
              throw new Error('lock diagnostic could not be delivered', {
                cause: diagnostic.cause,
              });
          },
        };
        let outcome:
          QueueOutcome<ForegroundPayload | HolderPayload> | { readonly kind: 'released' };
        if (selected.words === 'lock hold-internal-v1') {
          const { runHolder } = await import('./holder');
          const { readReservation } = await import('../resources/hold-log');
          const reservation = readReservation(selected.holdFile, {
            pid: selected.controllerPid,
            boot: selected.controllerBoot,
            start: selected.controllerStart,
          });
          outcome = await runHolder(
            {
              holdFile: selected.holdFile,
              label: selected.label,
              waitSeconds: selected.waitSeconds,
              pollSeconds: selected.pollSeconds,
            },
            {
              ...queueContext,
              reservation,
              recordControllerCancellation: () => {
                // Proof: owner-native-abort lost the modeled controller-cancellation exit when this publication was removed.
                interrupts.recordInterrupt('SIGTERM');
              },
            },
          );
        } else {
          const program = selected.argv.at(0);
          if (program === undefined || program === '')
            throw new UsageRefusal('a foreground payload command is required');
          const { runForeground } = await import('./foreground');
          outcome = await runForeground(
            {
              argv: [program, ...selected.argv.slice(1)],
              label: selected.label,
              waitSeconds: selected.waitSeconds,
              pollSeconds: selected.pollSeconds,
            },
            queueContext,
          );
        }
        switch (outcome.kind) {
          case 'released':
            status = 0;
            break;
          case 'cancelled':
            status = interruptionStatus();
            break;
          case 'refused': {
            const observation = outcome.contention;
            const text =
              observation.kind === 'holder'
                ? 'heavy lock: ' +
                  path +
                  '.d is held by pid ' +
                  (observation.pidText === undefined || observation.pidText === ''
                    ? '?'
                    : observation.pidText)
                : 'heavy lock: gave up after ' +
                  String(outcome.waitedSeconds) +
                  's behind ' +
                  String(outcome.ahead) +
                  ' tickets: ' +
                  observation.tickets
                    .map(
                      (ticket) =>
                        (ticket.label.kind === 'gone' ? 'gone' : ticket.label.text) +
                        ' (pid ' +
                        ticket.pidText +
                        ')',
                    )
                    .join(', ');
            await diagnose(text);
            status = 75;
            break;
          }
          case 'completed':
            switch (outcome.value.kind) {
              case 'released':
                status = 0;
                break;
              case 'exited':
                status = outcome.value.status;
                break;
              case 'not-started':
                await diagnose('error: foreground payload could not start');
                status = outcome.value.status;
                break;
              case 'cancelled':
                status = interruptionStatus();
                break;
              case 'failed':
                hasFailed = true;
                status = 70;
                break;
            }
            break;
        }
      }
    } catch (cause) {
      hasFailed = true;
      status = isUsageFailure(cause) ? 64 : 70;
      await diagnose('error: ' + (isUsageFailure(cause) ? cause.message : 'lock operation failed'));
    }
    const cleanup: unknown[] = [];
    for (const release of [
      () => {
        outputs.dispose();
      },
      () => {
        unsubscribe();
      },
      () => {
        interrupts.dispose();
      },
    ]) {
      try {
        release();
      } catch (cause) {
        cleanup.push(cause);
      }
    }
    if (cleanup.length !== 0) {
      hasFailed = true;
      status = 70;
      await diagnose('error: lock owner cleanup failed');
    }
    if (!hasFailed && first !== undefined) status = interruptionStatus();
    return status;
  };
}

/** No argument, environment variable or injected caller context can redirect the installed mutex. */
export async function runInstalledLock(command: LockCommand, context: Context): Promise<number> {
  const owner = createLockOwner(async () => {
    const { selectLockPath } = await import('@shared/heavy-lock');
    return selectLockPath(process.platform);
  });
  return await owner(command, context);
}
