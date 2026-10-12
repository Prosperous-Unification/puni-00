import { randomUUID } from 'node:crypto';

import {
  renderApiForwardArguments,
  renderControllerTransport,
  type SshTransport,
} from './ssh-transport';

/** An open local forward to a cluster API; `close` must run once discovery of it ends. */
export interface ApiForward {
  readonly localPort: number;
  /** @throws Error when the forward's controller container cannot be removed. */
  readonly close: () => Promise<void>;
}

export interface ApiForwardRequest {
  readonly image: string;
  readonly digest: string;
  readonly transport: SshTransport;
  /** The API endpoint host, an SSH node of the cluster pinned by the transport. */
  readonly host: string;
  readonly remotePort: number;
  /** How long ssh may take to authenticate and listen. */
  readonly timeoutMs: number;
  /** In-container bound on the whole forward, in case teardown never runs. */
  readonly lifetimeMs: number;
}

function reserveLoopbackPort(): number {
  // The port is free when ssh binds it unless another process wins the race, which
  // ExitOnForwardFailure turns into an exit this function reports.
  const listener = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: { data: () => undefined },
  });
  const port = listener.port;
  listener.stop(true);
  return port;
}

async function acceptsConnection(port: number): Promise<boolean> {
  try {
    const socket = await Bun.connect({
      hostname: '127.0.0.1',
      port,
      socket: { data: () => undefined },
    });
    socket.end();
    return true;
  } catch (cause) {
    // A refused connection is the modeled "ssh is not listening yet"; anything else is not.
    if (cause instanceof Error && 'code' in cause && cause.code === 'ECONNREFUSED') return false;
    throw new Error(`Cannot probe SSH API forward port ${String(port)}`, { cause });
  }
}

/**
 * Open `ssh -N -L 127.0.0.1:<ephemeral>:127.0.0.1:<remotePort> <host>` in the digest-locked
 * controller on the host network, pinned by the transport, and wait until it listens. The
 * container is named so {@link ApiForward.close} can remove it; an in-container `timeout` bounds
 * it if teardown never runs.
 * @throws Error when ssh exits first (a changed host key, refused login or occupied port) or does
 * not listen within `timeoutMs`; the container is removed before the error is thrown.
 */
export async function openSshApiForward(request: ApiForwardRequest): Promise<ApiForward> {
  const localPort = reserveLoopbackPort();
  const name = `puni-fleet-forward-${randomUUID()}`;
  const child = Bun.spawn(
    [
      'docker',
      'run',
      '--rm',
      '--name',
      name,
      '--network',
      'host',
      ...renderControllerTransport(request.transport),
      `${request.image}@${request.digest}`,
      'timeout',
      '--signal=TERM',
      '--kill-after=0.1s',
      `${String(Math.ceil(request.lifetimeMs / 1000))}s`,
      'ssh',
      ...renderApiForwardArguments(request.transport, request.host, localPort, request.remotePort),
    ],
    // An explicit env makes Bun resolve `docker` on the current PATH, not the startup one.
    { stdin: 'ignore', stdout: 'ignore', stderr: 'pipe', env: process.env },
  );
  const stderr = new Response(child.stderr).text();
  const close = async (): Promise<void> => {
    const removal = Bun.spawnSync(['docker', 'rm', '--force', name], {
      stdout: 'ignore',
      stderr: 'pipe',
      env: process.env,
    });
    child.kill('SIGKILL');
    await child.exited;
    const diagnostic = removal.stderr.toString();
    // `--rm` already removed a container whose ssh exited; that is the modeled torn-down state.
    if (removal.exitCode !== 0 && !/No such container/i.test(diagnostic)) {
      // Proof: ignoring the removal status made `refuses when the forward container cannot be
      // removed` resolve, leaving a live forward to production behind.
      throw new Error(`Cannot tear down SSH API forward ${name}: ${diagnostic.trim()}`);
    }
  };
  const deadline = Date.now() + request.timeoutMs;
  for (;;) {
    if (child.exitCode !== null) {
      const exitCode = child.exitCode;
      await close();
      // Proof: skipping this exit check made the host-key negative wait for its deadline and
      // report a timeout instead of ssh's `Host key verification failed`.
      throw new Error(
        `SSH API forward to ${request.host} exited ${String(exitCode)}: ${(await stderr).trim()}`,
      );
    }
    if (await acceptsConnection(localPort)) return { localPort, close };
    if (Date.now() >= deadline) {
      await close();
      // Proof: removing the deadline made `refuses and tears down a forward that never listens`
      // poll until the test runner's timeout.
      throw new Error(
        `SSH API forward to ${request.host} did not open 127.0.0.1:${String(localPort)} within ${String(request.timeoutMs)}ms: ${(await stderr).trim()}`,
      );
    }
    await Bun.sleep(100);
  }
}
