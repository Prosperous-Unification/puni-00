import { readFile } from 'node:fs/promises';

import {
  type RegistryMaintenanceInstallation,
  verifyRegistryHostArtifact,
} from './registry-maintenance-installation';
import { awaitMaintenanceChild } from './registry-maintenance-process';
import { observeRegistryPopulationOutput } from './registry-population-diagnostics.fixture';
import { readRegistryBytes } from './registry-stream';

/**
 * Launch only the private UID59001 allocation probe. The selected stop signal owns its
 * detached child through terminal group cleanup, and diagnostic failure cancels that child.
 * The fixture installs proof.js and backup-worker.js from identical pinned bundle bytes;
 * verify the proof alias against the enrolled worker digest before every spawn. This is
 * fixture-only alias trust, not a production enrollment shortcut. The coordinator validates
 * returned JSON as the current instance/request receipt; this launcher reflects no stderr.
 * Exit-observation rejection is not death: the captured child is signaled and its exact group
 * is observed under a fixed bound. Failure still propagates, including unknown cleanup.
 * A fulfilled direct exit does not certify group absence: the original waiter group failure
 * remains fatal and belongs to the outer owned namespace cleanup. A confirmed nonzero terminal
 * from that exact waiter may drain bounded streams under the selected caller deadline; every
 * uncertain failure still cancels immediately. Failed-child stderr is observed only through the
 * existing strict redactor, or marked unavailable. A diagnostic never accepts the child failure;
 * reporter failure retains both the original child failure and reporter. No raw stderr returns.
 */
export async function runRegistryPressureAcknowledgement(
  installed: RegistryMaintenanceInstallation,
  signal: AbortSignal,
): Promise<unknown> {
  // Proof (modeled launcher): omission admits wrong root UID/PID1/selector/store path.
  if (
    process.getuid?.() !== 0 ||
    process.pid !== 1 ||
    (await readFile('/proc/1/cmdline', 'utf8')) !==
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0' ||
    installed.ordinary.path !== '/var/lib/puni-registry/registry/contents'
  )
    throw new Error('ACK launcher requires exact private root PID1');
  // Proof (modeled launcher): omission performs artifact verification after pre-existing cancellation, then still refuses.
  signal.throwIfAborted();
  const bundle = '/usr/local/libexec/puni-registry-maintenance/proof.js';
  // Proof (modeled launcher): skipping artifact verification accepts the broken artifact dependency and spawns.
  await verifyRegistryHostArtifact({ path: bundle, sha256: installed.backupWorker.sha256 });
  // Proof (modeled launcher): omission reaches spawn after cancellation during verification, before later cleanup refusal.
  signal.throwIfAborted();
  const child = Bun.spawn(
    [
      '/usr/bin/setpriv',
      '--reuid=59001',
      '--regid=59001',
      '--clear-groups',
      '--',
      '/usr/local/libexec/puni-registry-authority/bun',
      bundle,
      'pressure-ack',
    ],
    {
      // Proof (modeled spawn): changing this option violates the exact independent-group call contract.
      detached: true,
      env: { PATH: '/usr/bin:/bin', LANG: 'C' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const cancellation = new AbortController();
  const selected = AbortSignal.any([signal, cancellation.signal]);
  const preserve = (cause: unknown): never => {
    // Proof (modeled launcher): omission needs the independent 50ms waiter rescue after stdout failure.
    cancellation.abort(cause);
    throw cause;
  };
  let direct: { code: number } | { cause: unknown } | undefined;
  void child.exited.then(
    (code) => {
      direct = { code };
    },
    (cause: unknown) => {
      // Proof (actual waiter, modeled child): classifying rejection as code zero omits the needed captured-child signal.
      direct = { cause };
    },
  );
  // Proof (modeled launcher): omitting this wait returns before held terminal; replacing its signal accepts canceled work after rescue.
  const terminal = awaitMaintenanceChild(child, selected).catch(async (cause: unknown) => {
    const confirmedFailure =
      direct !== undefined &&
      'code' in direct &&
      direct.code !== 0 &&
      cause instanceof Error &&
      cause.message === `Fixed maintenance child failed (exit ${String(direct.code)})` &&
      !selected.aborted;
    // The actual waiter's exact nonzero error follows direct exit, group absence and its abort check.
    // Uncertain failures retain immediate cancellation; confirmed terminal failures can drain under the caller's bound.
    // Proof (actual waiter, modeled child/streams): unconditional abort loses a confirmed terminal diagnostic; omitting uncertain cancellation drains despite rejected exit or unconfirmed group.
    if (!confirmedFailure) cancellation.abort(cause);
    // Proof (actual waiter, modeled group): bypassing this condition signals an already-confirmed direct child after group cleanup failed.
    if (direct === undefined || !('code' in direct)) {
      try {
        // Proof (actual waiter, modeled child): omission loses captured SIGKILL; void return is never terminal evidence.
        child.kill('SIGKILL');
        const deadline = Date.now() + 5000;
        for (;;) {
          try {
            process.kill(-child.pid, 0);
          } catch (observation) {
            // Proof (modeled process): accepting EPERM/non-Error EIO hides cleanup uncertainty while the original action still fails.
            if (
              observation instanceof Error &&
              'code' in observation &&
              observation.code === 'ESRCH'
            )
              break;
            throw observation;
          }
          // Proof (modeled clock): omission requires the independent sixth-sleep rescue; no native five-second claim.
          if (Date.now() >= deadline)
            throw new Error('Pressure ACK child group cleanup is unconfirmed');
          await Bun.sleep(10);
        }
      } catch (cleanup) {
        throw new AggregateError(
          // Proof (modeled signal failure): dropping the primary loses errors-array membership (cause remains); dropping the aggregate loses explicit cleanup uncertainty.
          [cause, cleanup],
          'Pressure ACK child failure and cleanup uncertainty',
          // Boundary: cleanup stays in errors while the original waiter failure remains primary.
          // eslint-disable-next-line preserve-caught-error
          { cause },
        );
      }
    }
    throw cause;
  });
  const read = (stream: ReadableStream<Uint8Array>, label: string) =>
    readRegistryBytes(
      // Proof (modeled launcher): removing stream cancellation needs the independent 50ms rescue after terminal failure.
      stream.pipeThrough(new TransformStream(), { signal: selected }),
      // Proof (modeled launcher): increasing this bound accepts oversized stdout or needs waiter rescue before stderr refusal.
      4096,
      label,
    ).catch(preserve);
  const [exited, stdout, stderr] = await Promise.allSettled([
    terminal,
    read(child.stdout, 'Pressure ACK stdout'),
    read(child.stderr, 'Pressure ACK stderr'),
  ]);
  const reportFailure = (cause: unknown): never => {
    try {
      const terminalObservation =
        direct === undefined
          ? { state: 'unobserved' as const }
          : 'code' in direct
            ? { state: 'exited' as const, code: direct.code }
            : { state: 'failed' as const };
      // Proof (modeled failed child): redactor substitution reflects private marker text; rejected streams must remain explicitly unavailable instead of empty observations.
      const stderrObservation =
        stderr.status === 'fulfilled'
          ? {
              state: 'observed' as const,
              observation: observeRegistryPopulationOutput(new TextDecoder().decode(stderr.value)),
            }
          : { state: 'unavailable' as const };
      // Proof (modeled failed child): omitting this required report loses the captured numeric diagnostic while the action still refuses.
      console.log(
        JSON.stringify({
          pressureAckChildFailure: { terminal: terminalObservation, stderr: stderrObservation },
        }),
      );
    } catch (reporter) {
      // Proof (modeled reporter): separate array omissions lose original or reporter membership; the primary cause property remains.
      throw new AggregateError([cause, reporter], 'Pressure ACK failure observation failed', {
        // Boundary: reporter remains in errors while the original child failure stays primary.
        // eslint-disable-next-line preserve-caught-error
        cause,
      });
    }
    throw cause;
  };
  if (
    exited.status === 'rejected' ||
    stdout.status === 'rejected' ||
    stderr.status === 'rejected'
  ) {
    const failures: unknown[] = [];
    for (const outcome of [exited, stdout, stderr])
      if (outcome.status === 'rejected') failures.push(outcome.reason);
    // Proof (modeled launcher): replacing the aggregate loses exact waiter/stdout failure objects.
    return reportFailure(
      new AggregateError(failures, 'Fixed pressure ACK child failed', { cause: failures[0] }),
    );
  }
  // Proof (modeled launcher): omission accepts a child that emitted unexpected diagnostics.
  if (stderr.value.byteLength !== 0)
    // Proof (modeled zero-exit child): bypassing the report loses its diagnostic without accepting the child.
    reportFailure(new Error('Fixed pressure ACK child emitted diagnostics'));
  const acknowledgement: unknown = JSON.parse(new TextDecoder().decode(stdout.value));
  return acknowledgement;
}
