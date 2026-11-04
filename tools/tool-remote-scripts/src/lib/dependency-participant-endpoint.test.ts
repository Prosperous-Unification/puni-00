import { rejects, throws } from 'node:assert/strict';
import { readlink } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';

import { expect, test } from 'bun:test';

import { resolveParticipantHttpEndpoint } from './dependency-participant-endpoint';
import { readParticipantHttp } from './dependency-participant-http';
import { observeSourceParticipantListener } from './dependency-participant-listener';
import type { ParticipantSnapshot } from './dependency-participant-transition';

async function drain(stream: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stream.getReader();
  try {
    for (;;) if ((await reader.read()).done) break;
  } finally {
    reader.releaseLock();
  }
}

for (const host of ['127.0.0.1', '0.0.0.0', '::1', '::'] as const)
  test(`endpoint join binds actual ${host} application listener before direct HTTP`, async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        '-e',
        `const server=Bun.serve({hostname:${JSON.stringify(host)},port:0,fetch:()=>Response.json({status:'ok'})}); process.stdout.write(String(server.port)+'\\n'); await new Response(Bun.stdin.stream()).text(); server.stop(true);`,
      ],
      { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', env: { ...process.env, FORCE_COLOR: '1' } },
    );
    try {
      const reader = child.stdout.getReader();
      const first = await reader.read();
      reader.releaseLock();
      if (first.done) throw new Error('owned endpoint exited before readiness');
      const port = Number(new TextDecoder().decode(first.value).trim());
      if (!Number.isSafeInteger(port) || port <= 0)
        throw new Error('owned endpoint port malformed');
      const deadline = performance.now() + 10000;
      const observed = await observeSourceParticipantListener(child.pid, port, deadline);
      expect(observed.namespaces.net).toBe(await readlink('/proc/self/ns/net'));
      const addresses = Object.values(networkInterfaces()).flatMap((members) =>
        members === undefined ? [] : members.map((member) => member.address),
      );
      const address = host.includes(':') ? '::1' : '127.0.0.1';
      const snapshot = (
        address: string,
        networkId = 'a'.repeat(64),
        swapped = false,
      ): Pick<ParticipantSnapshot, 'native'> => ({
        // Only Docker endpoint fields are modeled. Namespace/listener/address/HTTP evidence above is actual, not product image acceptance.
        native: {
          NetworkSettings: {
            Networks: {
              selected: {
                NetworkID: networkId,
                IPAddress: host.includes(':') !== swapped ? '' : address,
                GlobalIPv6Address: host.includes(':') !== swapped ? address : '',
              },
            },
          },
        },
      });
      const original = snapshot('');
      const current = snapshot(address);
      const resolve = (runtime = current, local = addresses, listeners = observed.listeners) =>
        resolveParticipantHttpEndpoint(original, runtime, 'selected', local, listeners, port);
      const endpoint = resolve();
      expect(endpoint.address).toBe(address);
      expect(endpoint.inode).toBe(observed.listeners[0]?.inode);
      expect(await readParticipantHttp(endpoint.address, port, '/health', deadline)).toEqual({
        status: 200,
        contentType: 'application/json;charset=utf-8',
        body: '{"status":"ok"}',
      });
      expect(await observeSourceParticipantListener(child.pid, port, deadline)).toEqual(observed);
      throws(() => resolve(snapshot(address, 'c'.repeat(64))));
      throws(() => resolve(current, []));
      throws(() => resolve(current, addresses, []));
      throws(() => resolve(snapshot('')));
      throws(() => resolve(snapshot(address, 'a'.repeat(64), true)));
      throws(() =>
        resolve(
          current,
          addresses,
          observed.listeners.map((listener) => ({ ...listener, port: port + 1 })),
        ),
      );
      throws(() =>
        resolveParticipantHttpEndpoint(
          original,
          current,
          'selected',
          addresses,
          observed.listeners.map((listener) => ({ ...listener, port: 0 })),
          0,
        ),
      );
      throws(() => resolve(current, addresses, [...observed.listeners, ...observed.listeners]));
      throws(() =>
        resolve(
          current,
          addresses,
          observed.listeners.map((listener) => ({
            ...listener,
            family: listener.family === 'ipv4' ? 'ipv6' : 'ipv4',
          })),
        ),
      );
      throws(() =>
        resolve(
          current,
          addresses,
          observed.listeners.map((listener) => ({
            ...listener,
            address: host.includes(':') ? '::2' : '127.0.0.2',
          })),
        ),
      );
      for (const address of ['localhost', '0.0.0.0', '::ffff:127.0.0.1', 'fe80::1%eth0'])
        throws(() => resolve(snapshot(address)));
      throws(() =>
        resolve(
          snapshot('localhost'),
          [...addresses, 'localhost'],
          observed.listeners.map((listener) => ({ ...listener, address: 'localhost' })),
        ),
      );
      const unspecified = host.includes(':') ? '::' : '0.0.0.0';
      throws(() =>
        resolve(
          snapshot(unspecified),
          [...addresses, unspecified],
          observed.listeners.map((listener) => ({ ...listener, address: unspecified })),
        ),
      );
      const wildcard = resolve(
        current,
        addresses,
        observed.listeners.map((listener) => ({
          ...listener,
          address: listener.family === 'ipv4' ? '0.0.0.0' : '::',
        })),
      );
      expect(wildcard.address).toBe(address);
      await rejects(readParticipantHttp('0.0.0.0', port, '/health', deadline));
    } finally {
      child.kill('SIGKILL');
      await Promise.all([child.exited, drain(child.stdout), drain(child.stderr)]);
    }
  }, 20000);
