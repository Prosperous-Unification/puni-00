import { chmod, readFile, readlink, writeFile } from 'node:fs/promises';

import { readRegistryFixtureStart } from './registry-guard-observation.fixture';
import {
  type RegistryMaintenanceInstallation,
  verifyRegistryHostArtifact,
} from './registry-maintenance-installation';
import { awaitMaintenanceChild } from './registry-maintenance-process';
import { assertRegistryMaintenanceListener } from './registry-maintenance-server';
import { consumeRegistryStream } from './registry-stream';

/**
 * Own one direct UID59001 Distribution writer for the disposable pressure drill. This is the
 * synthetic scheduler's subprocess capability, not the production startup supervisor. Before
 * the current ACK probe the caller revalidates its exact live identity; after that probe it
 * closes this same capability before releasing the selected synthetic stop-patch response.
 * No process identity or command is accepted from a request. Natural exit is not stop evidence.
 */
export async function startRegistryPressureWriter(installed: RegistryMaintenanceInstallation) {
  // Proof (modeled caller): admission omission accepts wrong root, PID1, selector and store before spawning.
  if (
    process.getuid?.() !== 0 ||
    process.pid !== 1 ||
    (await readFile('/proc/1/cmdline', 'utf8')) !==
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0' ||
    installed.ordinary.path !== '/var/lib/puni-registry/registry/contents'
  )
    throw new Error('Pressure writer requires exact private PID1 and store');
  // Proof (modeled caller): omitting artifact verification starts the writer despite the injected verifier refusal.
  await verifyRegistryHostArtifact(installed.distribution);
  const configuration = '/etc/puni/registry-pressure-writer.json';
  await writeFile(
    configuration,
    JSON.stringify({
      version: 0.1,
      log: { level: 'error' },
      storage: {
        filesystem: { rootdirectory: installed.ordinary.path },
        delete: { enabled: false },
        maintenance: { readonly: { enabled: false }, uploadpurging: { enabled: false } },
      },
      http: { addr: '127.0.0.1:5051', secret: 'owned-pressure-writer' },
    }),
    { mode: 0o644, flag: 'wx' },
  );
  await chmod(configuration, 0o644);
  const child = Bun.spawn([installed.distribution.path, 'serve', configuration], {
    env: { PATH: '/usr/bin:/bin', LANG: 'C' },
    uid: 59001,
    gid: 59001,
    detached: true,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  // Proof (modeled caller): omission reaches listener refusal and an owned stop with PID0 instead of refusing before effects.
  if (!Number.isSafeInteger(child.pid) || child.pid < 1)
    throw new Error('Missing owned pressure writer PID');
  const cancellation = new AbortController();
  let exit: { code: number } | { cause: unknown } | undefined;
  void child.exited.then(
    (code) => {
      exit = { code };
    },
    (cause: unknown) => {
      exit = { cause };
    },
  );
  const lifetime = awaitMaintenanceChild(child, cancellation.signal).then(
    () => ({ ok: true as const }),
    (cause: unknown) => ({ ok: false as const, cause }),
  );
  const drain = async (stream: ReadableStream<Uint8Array>) => {
    try {
      await consumeRegistryStream(
        stream,
        65536,
        'Owned pressure writer diagnostics',
        () => undefined,
      );
      return { ok: true as const };
    } catch (cause) {
      cancellation.abort(cause);
      return { ok: false as const, cause };
    }
  };
  const diagnostics = Promise.all([drain(child.stdout), drain(child.stderr)]);
  let startTicks: string | undefined;
  const assertLive = async () => {
    if (exit !== undefined) {
      if ('cause' in exit) throw exit.cause;
      throw new Error('Pressure writer ended before selected stop');
    }
    const base = '/proc/' + String(child.pid);
    const stat = await readFile(base + '/stat', 'utf8');
    const observed = readRegistryFixtureStart(stat, String(child.pid));
    const fields = stat
      .slice(stat.lastIndexOf(') ') + 2)
      .trim()
      .split(/\s+/);
    const [status, executable, command] = await Promise.all([
      readFile(base + '/status', 'utf8'),
      readlink(base + '/exe'),
      readFile(base + '/cmdline', 'utf8'),
    ]);
    // Proof (modeled caller): identity omission accepts UID/GID, dead state, parent/PGID, exe/argv and later start drift.
    if (
      !['R', 'S', 'D', 'I'].includes(fields[0] ?? '') ||
      fields[1] !== '1' ||
      fields[2] !== String(child.pid) ||
      !/^Uid:\s+59001\s+59001\s+59001\s+59001$/m.test(status) ||
      !/^Gid:\s+59001\s+59001\s+59001\s+59001$/m.test(status) ||
      executable !== installed.distribution.path ||
      command !== installed.distribution.path + '\0serve\0' + configuration + '\0' ||
      (startTicks !== undefined && observed !== startTicks)
    )
      throw new Error('Pressure writer live identity differs');
    // Proof (modeled caller): omitting the second observation accepts a changed start during the read.
    if (
      readRegistryFixtureStart(await readFile(base + '/stat', 'utf8'), String(child.pid)) !==
        observed ||
      // Boundary: awaited native reads allow the asynchronous child-exit observer to update this value.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      exit !== undefined
    )
      throw new Error('Pressure writer changed during observation');
    startTicks = observed;
    return { pid: child.pid, startTicks: observed };
  };
  let closing:
    | Promise<{
        pid: number;
        startTicks: string;
        exitCode: number;
        signal: string | null;
        groupAbsent: true;
      }>
    | undefined;
  // Proof (modeled caller): removing memoization makes the second required close refuse after the first succeeds.
  const close = () =>
    (closing ??= (async () => {
      const requested = exit === undefined || !('code' in exit);
      let signalFailure: { cause: unknown } | undefined;
      if (requested) {
        try {
          // Proof (modeled caller): removing this call requires the independent 50ms terminal rescue.
          child.kill('SIGTERM');
        } catch (cause) {
          signalFailure = { cause };
          cancellation.abort(cause);
        }
      }
      let escalation: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<{ ok: false; cause: Error }>((resolve) => {
        escalation = setTimeout(() => {
          const cause = new Error('Pressure writer stop deadline exceeded');
          cancellation.abort(cause);
          resolve({ ok: false, cause });
        }, 5000);
      });
      try {
        const outcome = await lifetime;
        let absent = false;
        try {
          process.kill(-child.pid, 0);
        } catch (cause) {
          // Proof (modeled caller): treating EPERM as absence falsely reports completed cleanup.
          if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') absent = true;
          else throw cause;
        }
        // Proof (modeled caller): omission reports successful cleanup while the owned group remains visible.
        if (!absent) throw new Error('Pressure writer group cleanup is unconfirmed');
        // Proof (modeled timer): omitting the deadline waits for the independent 50ms drain rescue; 5000ms is scheduled at 5ms.
        const drained = await Promise.race([
          diagnostics.then((observations) => ({ ok: true as const, observations })),
          deadline,
        ]);
        // Proof (modeled caller): dropping diagnostic causes reports successful cleanup after a stream failure.
        const failures: unknown[] = drained.ok
          ? drained.observations.flatMap((observation) =>
              observation.ok ? [] : [observation.cause],
            )
          : [drained.cause];
        // Proof (modeled caller): omitting signal-error retention reports success despite the original signal failure.
        if (signalFailure !== undefined) failures.push(signalFailure.cause);
        // Proof (modeled caller): omission accepts a failed lifetime observation or mismatched terminal signal.
        if (
          !outcome.ok &&
          !(
            exit !== undefined &&
            'code' in exit &&
            exit.code === 143 &&
            child.signalCode === 'SIGTERM' &&
            outcome.cause instanceof Error &&
            outcome.cause.message === 'Fixed maintenance child failed (exit 143)'
          )
        )
          failures.push(outcome.cause);
        if (failures.length > 0)
          throw new AggregateError(failures, 'Owned pressure writer cleanup failed');
        if (
          !requested ||
          exit === undefined ||
          !('code' in exit) ||
          ![0, 143].includes(exit.code) ||
          startTicks === undefined
        )
          throw new Error('Pressure writer lacks requested terminal stop');
        return {
          pid: child.pid,
          startTicks,
          exitCode: exit.code,
          signal: child.signalCode,
          groupAbsent: true as const,
        };
      } finally {
        clearTimeout(escalation);
      }
    })());
  try {
    const deadline = Date.now() + 10000;
    for (;;) {
      if (exit !== undefined && 'cause' in exit) throw exit.cause;
      // Proof (modeled clock): deadline omission reaches seven requests and explicit rescue instead of five.
      if (exit !== undefined || Date.now() >= deadline)
        throw new Error('Pressure writer readiness did not converge');
      try {
        const response = await fetch('http://127.0.0.1:5051/v2/', {
          signal: AbortSignal.timeout(500),
        });
        await response.body?.cancel();
        // Proof (modeled caller): omission accepts HTTP503 as ready.
        if (response.status !== 200) throw new Error('Pressure writer readiness is not HTTP200');
        // Proof (modeled caller): omission accepts a failed owned-listener observation.
        await assertRegistryMaintenanceListener(child.pid);
        await assertLive();
        break;
      } catch (cause) {
        // Proof (modeled caller): omission retries EACCES five times instead of preserving its first refusal.
        if (!(
          cause instanceof Error &&
          (('code' in cause && cause.code === 'ECONNREFUSED') || cause.name === 'TimeoutError')
        ))
          throw cause;
      }
      await Bun.sleep(20);
    }
    if (startTicks === undefined) throw new Error('Missing observed pressure writer start');
    return { pid: child.pid, startTicks, assertLive, close };
  } catch (cause) {
    try {
      await close();
    } catch (cleanup) {
      // Proof (modeled caller): replacing this aggregate with cleanup loses the original listener failure.
      throw new AggregateError([cause, cleanup], 'Pressure writer setup and cleanup failed', {
        // Boundary: cleanup remains in errors while the original setup refusal stays primary.
        // eslint-disable-next-line preserve-caught-error
        cause,
      });
    }
    throw cause;
  }
}
