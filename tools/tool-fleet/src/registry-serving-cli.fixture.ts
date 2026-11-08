import { awaitMaintenanceChild } from './registry-maintenance-process';
import { readRegistryBytes } from './registry-stream';

type ServingChild = Pick<
  Bun.Subprocess<'ignore', 'pipe', 'pipe'>,
  'pid' | 'exitCode' | 'exited' | 'stdout' | 'stderr'
>;

/** Complete a fixed fixture CLI's detached process group and both bounded pipes before returning. Stream failure cancels the exact owned group; terminal and stream failures remain ordered, with the first failure as cause. No output is logged. */
export async function completeRegistryServingChild(child: ServingChild, signal: AbortSignal) {
  const controller = new AbortController();
  // Proof: caller-cancellation removal lets the real child run10s instead of reaping after the50ms cancellation in registry-serving-cli.test.ts.
  const combined = AbortSignal.any([signal, controller.signal]);
  const capture = <T>(pending: Promise<T>) =>
    pending.then(
      (value) => ({ state: 'fulfilled' as const, value }),
      (cause: unknown) => {
        // Proof: stream-cancel removal delays real overflow cleanup until the5s outer signal, beyond the4s assertion.
        controller.abort(cause);
        return { state: 'rejected' as const, cause };
      },
    );
  // Proof: terminal-await and each pipe-observation removal fail native exit42 or literal output assertions; independent byte-limit removals exceed the4s cleanup contract.
  const [terminal, stdout, stderr] = await Promise.all([
    capture(awaitMaintenanceChild(child, combined)),
    capture(readRegistryBytes(child.stdout, 2 * 1024 ** 2, 'Serving CLI stdout')),
    capture(readRegistryBytes(child.stderr, 65536, 'Serving CLI stderr')),
  ]);
  const failures = [terminal, stdout, stderr].flatMap((outcome): unknown[] =>
    outcome.state === 'rejected' ? [outcome.cause] : [],
  );
  // Proof: compound-refusal/order/cause removals lose the exact ordered terminal+stdout+stderr failures in the broken-stream case.
  if (failures.length > 1)
    throw new AggregateError(failures, 'Serving CLI completion failed', { cause: failures[0] });
  // Proof: terminal refusal omission admits exit42; independent stdout/stderr refusal omissions fulfill their late-error cases after actual exit0.
  if (terminal.state === 'rejected') throw terminal.cause;
  if (stdout.state === 'rejected') throw stdout.cause;
  if (stderr.state === 'rejected') throw stderr.cause;
  return {
    stdout: new TextDecoder().decode(stdout.value),
    stderr: new TextDecoder().decode(stderr.value),
  };
}

/** Run only the ordinary installed backup, status or journal-reopen CLI as UID/GID59001 in the owned native fixture. PID1 installed the exact manifest-bound CLI bytes. The caller supplies the freshly read revision, never a path, binary, owner or environment. */
export async function runRegistryServingCli(
  request: { action: 'status' | 'backup' } | { action: 'reopen'; revision: number },
) {
  const directory = '/usr/local/libexec/puni-registry-maintenance/';
  // Proof (serving): fixed-backup-binary substitution emits status instead of backup and fails its actual local-child protocol test.
  const child = Bun.spawn(
    [
      '/usr/bin/setpriv',
      '--reuid=59001',
      '--regid=59001',
      '--clear-groups',
      '--',
      '/usr/local/libexec/puni-registry-authority/bun',
      request.action === 'reopen'
        ? directory + 'journal-cli.js'
        : directory + request.action + '.js',
      ...(request.action === 'reopen' ? ['/var/lib/puni-registry/journal/contents'] : []),
    ],
    {
      env: { PATH: '/usr/bin:/bin', LANG: 'C' },
      stdin:
        request.action !== 'reopen'
          ? 'ignore'
          : new TextEncoder().encode(
              JSON.stringify({
                command: 'reopen',
                expectedRevision: request.revision,
                operationId: 'native-serving-reopen',
                owner: 'operator',
              }),
            ),
      stdout: 'pipe',
      stderr: 'pipe',
      detached: true,
    },
  );
  const controller = new AbortController();
  const timer = setTimeout(
    () => {
      controller.abort();
    },
    request.action === 'backup' ? 90000 : 10000,
  );
  try {
    return await completeRegistryServingChild(child, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
