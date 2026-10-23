import * as Bun from 'bun';
import { dlopen } from 'bun:ffi';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { setTimeout } from 'node:timers';
import { TextDecoder } from 'node:util';
import { readSupervisorPeerCredentials } from '../../../../../tools/tool-remote-scripts/src/lib/solver-supervisor-peer-credentials.ts';

const mode = process.argv[2];
const socketPath = process.argv[3];
assert.equal(Bun.version, '1.4.2');

if (mode === 'server') {
  Bun.listen({
    unix: socketPath,
    socket: {
      open() {
        /* The credential-only server sends no application frames. */
      },
      data() {
        throw Error('unexpected application work');
      },
      close() {
        /* Parent owns listener cleanup. */
      },
    },
  });
  console.log(`READY ${process.pid}`);
} else if (mode === 'client') {
  await Bun.connect({
    unix: socketPath,
    socket: {
      open(socket) {
        const libc = dlopen('libc.so.6', {
          getsockopt: { args: ['i32', 'i32', 'i32', 'ptr', 'ptr'], returns: 'i32' },
        });
        const bytes = new Uint8Array(12);
        const length = new Uint32Array([12]);
        assert.equal(libc.symbols.getsockopt(socket.fd, 1, 17, bytes, length), 0);
        assert.equal(length[0], 12);
        libc.close();
        const view = new DataView(bytes.buffer);
        const pid = view.getInt32(0, true);
        const uid = view.getUint32(4, true);
        if (process.argv[4] === 'namespace') {
          assert.equal(process.pid, 1);
          assert.equal(pid, 0);
          assert.throws(() => readSupervisorPeerCredentials(socket), /invalid peer pid/);
        } else {
          assert.equal(readSupervisorPeerCredentials(socket).pid, pid);
          assert.ok(pid > 0);
        }
        console.log(JSON.stringify({ clientPid: process.pid, serverPid: pid, serverUid: uid }));
        socket.end();
      },
      data() {
        throw Error('unexpected application frame');
      },
      close() {
        /* No response is needed for this credential-only probe. */
      },
    },
  });
  setTimeout(() => {
    throw Error('namespace client deadline');
  }, 5000).unref();
} else {
  const directory = mkdtempSync(join(tmpdir(), 'solver-namespace-'));
  const path = join(directory, 'peer.sock');
  const server = Bun.spawn([process.execPath, import.meta.path, 'server', path], {
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 15000,
  });
  try {
    const reader = server.stdout.getReader();
    const first = await reader.read();
    const ready = new TextDecoder().decode(first.value).trim();
    if (!ready)
      throw Error(`namespace server failed: ${await Bun.readableStreamToText(server.stderr)}`);
    assert.equal(ready, `READY ${server.pid}`);
    console.log(ready);
    const host = Bun.spawnSync([process.execPath, import.meta.path, 'client', path, 'host'], {
      timeout: 5000,
    });
    assert.equal(host.exitCode, 0, host.stderr.toString());
    const hostView = JSON.parse(host.stdout.toString());
    assert.equal(hostView.serverPid, server.pid);
    console.log(JSON.stringify({ name: 'host', exit: host.exitCode, ...hostView }));
    const namespaced = Bun.spawnSync(
      [
        '/usr/bin/unshare',
        '--user',
        '--map-current-user',
        '--pid',
        '--fork',
        process.execPath,
        import.meta.path,
        'client',
        path,
        'namespace',
      ],
      { timeout: 5000 },
    );
    console.log(
      JSON.stringify({
        name: 'private-pid-namespace',
        exit: namespaced.exitCode,
        stdout: namespaced.stdout.toString().trim(),
        stderr: namespaced.stderr.toString().trim(),
      }),
    );
    assert.equal(namespaced.exitCode, 0);
    const privateView = JSON.parse(namespaced.stdout.toString());
    assert.equal(privateView.serverPid, 0);
    assert.notEqual(privateView.serverPid, server.pid);
    console.log(
      'PASS host SO_PEERCRED equals host listener PID; private PID namespace observes 0 and production credential helper refuses',
    );
  } finally {
    server.kill();
    await server.exited;
    rmSync(directory, { recursive: true });
  }
}
