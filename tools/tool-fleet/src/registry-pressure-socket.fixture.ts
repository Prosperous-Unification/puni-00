import { chmod, lstat, readFile } from 'node:fs/promises';

import { type } from 'arktype';

import type { RegistryMaintenanceInstallation } from './registry-maintenance-installation';
import { readRegistryPressureRecord } from './registry-pressure-ack.fixture';
import { createRegistryPressureStop } from './registry-pressure-stop.fixture';
import type { startRegistryPressureWriter } from './registry-pressure-writer.fixture';
import { readRegistryBytes } from './registry-stream';

/**
 * Own the one fixed root-only socket in the private pressure fixture. Bootstrap requests
 * certify no pressure effect. Arming captures one writer and one abort signal for its fixed
 * ACK child; concurrent requests cannot replace that signal. Request input is only the
 * already-selected Deployment UID/revision, never a path, command or PID. The controller
 * must pass an ACK launcher that forwards this signal to its captured-child cleanup.
 * A response follows writer closure; any handler failure remains fatal at bridge close.
 */
export async function startRegistryPressureBridge(
  installed: RegistryMaintenanceInstallation,
  acknowledge: (signal: AbortSignal) => Promise<unknown>,
) {
  // Proof (modeled adapter): removing topology admission accepts wrong UID/PID1/argv/path before socket setup.
  if (
    process.getuid?.() !== 0 ||
    process.pid !== 1 ||
    (await readFile('/proc/1/cmdline', 'utf8')) !==
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0' ||
    installed.ordinary.path !== '/var/lib/puni-registry/registry/contents'
  )
    throw new Error('Pressure bridge requires exact private root PID1');
  const directory = '/root/task8-fixture',
    socket = directory + '/pressure-stop.sock';
  const parent = await lstat(directory);
  // Proof (modeled adapter): removing this boundary accepts non-directory, foreign owner and public parent modes.
  if (
    !parent.isDirectory() ||
    parent.uid !== 0 ||
    parent.gid !== 0 ||
    (parent.mode & 0o7777) !== 0o700
  )
    throw new Error('Pressure bridge parent is not root private');
  try {
    await lstat(socket);
    // Proof (modeled adapter): omission accepts an existing socket target.
    throw new Error('Pressure bridge socket already exists');
  } catch (cause) {
    // Proof (modeled adapter): treating EACCES as absence reaches serve before later refusal.
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
  }
  // Proof (modeled adapter): allowing extra selection keys returns successful stop for that request.
  const Selection = type({
    uid: '0 < string <= 128',
    resourceVersion: /^[1-9][0-9]{0,19}$/,
    '+': 'reject',
  });
  let state:
    | { phase: 'bootstrap' }
    | {
        phase: 'selected';
        writer: Awaited<ReturnType<typeof startRegistryPressureWriter>>;
        stop: ReturnType<typeof createRegistryPressureStop>;
        cancellation: AbortController;
      } = { phase: 'bootstrap' };
  let failure: { cause: unknown } | undefined;
  const requests = new Set<AbortController>();
  const pending = new Set<Promise<Response>>();
  const respond = async (request: Request): Promise<Response> => {
    const epoch = state,
      cancellation = new AbortController();
    requests.add(cancellation);
    const expire = () => {
      const cause = new Error('Pressure bridge request deadline exceeded');
      cancellation.abort(cause);
      // Proof (modeled adapter): omitting ACK cancellation needs the independent 50ms rescue instead of the modeled 5ms deadline.
      if (epoch.phase === 'selected') epoch.cancellation.abort(cause);
    };
    // Proof (modeled adapter): timer omission needs the independent 50ms body rescue; this does not prove elapsed native seconds.
    const timer = setTimeout(expire, 10000);
    try {
      // Proof (modeled adapter): omission lets failed arming later answer bootstrap success.
      if (failure !== undefined) throw failure.cause;
      // Proof (modeled adapter): removing method/path admission permits successful foreign requests.
      const url = new URL(request.url);
      if (
        request.method !== 'POST' ||
        url.pathname !== '/stop' ||
        url.search !== '' ||
        request.body === null
      )
        throw new Error('Unexpected pressure stop request');
      // Proof (modeled adapter): increasing this bound accepts an oversized valid JSON selection.
      const bytes = await readRegistryBytes(
        request.body.pipeThrough(new TransformStream(), { signal: cancellation.signal }),
        4096,
        'Pressure stop selection',
      );
      const selection = Selection.assert(JSON.parse(new TextDecoder().decode(bytes)));
      cancellation.signal.throwIfAborted();
      // Proof (modeled adapter): omission accepts a bootstrap request completed after arming.
      if (state !== epoch) throw new Error('Pressure bridge epoch changed during request');
      // Proof (modeled adapter): skipping the await sends success before the independently held writer closure.
      const observation =
        epoch.phase === 'bootstrap'
          ? { scope: 'bootstrap' as const }
          : await epoch.stop.stop(selection);
      cancellation.signal.throwIfAborted();
      return Response.json(observation);
    } catch (cause) {
      // Proof (modeled adapter): omission lets bridge close succeed after the ACK failed.
      failure ??= { cause };
      if (epoch.phase === 'selected') {
        epoch.cancellation.abort(cause);
        try {
          await epoch.writer.close();
        } catch (cleanup) {
          failure = {
            cause: new AggregateError(
              // Proof (modeled adapter): dropping the first cause loses the original ACK error when owned close also fails.
              [failure.cause, cleanup],
              'Pressure bridge request and writer cleanup failed',
              { cause: failure.cause },
            ),
          };
        }
      }
      return Response.json({ scope: 'failed' }, { status: 500 });
    } finally {
      clearTimeout(timer);
      requests.delete(cancellation);
    }
  };
  const server = Bun.serve({
    unix: socket,
    maxRequestBodySize: 4096,
    fetch(request) {
      const response = respond(request);
      pending.add(response);
      void response.then(
        () => pending.delete(response),
        () => pending.delete(response),
      );
      return response;
    },
  });
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= (async () => {
      const failures: unknown[] = [];
      const cause = new Error('Pressure bridge is closing');
      for (const request of requests) request.abort(cause);
      if (state.phase === 'selected') {
        state.cancellation.abort(cause);
        try {
          // Proof (modeled adapter): omission loses the required writer-close failure at bridge cleanup.
          await state.writer.close();
        } catch (cleanup) {
          failures.push(cleanup);
        }
      }
      try {
        // Proof (modeled adapter): omitting stop makes the otherwise successful case refuse the remaining socket.
        await server.stop(true);
      } catch (cleanup) {
        failures.push(cleanup);
      }
      for (const response of await Promise.allSettled([...pending]))
        if (response.status === 'rejected') failures.push(response.reason);
      try {
        await lstat(socket);
        throw new Error('Pressure bridge socket remains after stop');
      } catch (cleanup) {
        if (!(cleanup instanceof Error && 'code' in cleanup && cleanup.code === 'ENOENT'))
          failures.push(cleanup);
      }
      // Proof (modeled adapter): omission hides the original failed request from bridge cleanup.
      if (failure !== undefined) failures.unshift(failure.cause);
      if (failures.length > 0) throw new AggregateError(failures, 'Pressure bridge cleanup failed');
    })());
  try {
    await chmod(socket, 0o600);
    const bound = await lstat(socket);
    // Proof (modeled adapter): omission accepts wrong socket type, owner, permissions and device.
    if (
      !bound.isSocket() ||
      bound.uid !== 0 ||
      bound.gid !== 0 ||
      (bound.mode & 0o7777) !== 0o600 ||
      bound.dev !== parent.dev
    )
      throw new Error('Pressure bridge socket ownership differs');
    return {
      arm(
        writer: Awaited<ReturnType<typeof startRegistryPressureWriter>>,
        arm: Parameters<ReturnType<typeof createRegistryPressureStop>['arm']>[0],
      ) {
        if (state.phase !== 'bootstrap') throw new Error('Pressure bridge already armed');
        const cancellation = new AbortController();
        const stop = createRegistryPressureStop(
          writer,
          () =>
            readRegistryPressureRecord('/var/lib/puni-registry/journal/contents/readonly.request'),
          () => acknowledge(cancellation.signal),
        );
        state = { phase: 'selected', writer, stop, cancellation };
        try {
          stop.arm(arm);
        } catch (cause) {
          // Proof (modeled adapter): omitting this failed disposition allows bootstrap success after invalid arming.
          failure = { cause };
          cancellation.abort(cause);
          throw cause;
        }
      },
      receipt() {
        if (state.phase !== 'selected')
          throw new Error('Pressure bridge has no selected operation');
        return state.stop.receipt();
      },
      close,
    };
  } catch (cause) {
    failure = { cause };
    await close();
    throw cause;
  }
}
