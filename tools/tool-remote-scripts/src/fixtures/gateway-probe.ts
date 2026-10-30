import { readFileSync } from 'node:fs';

const role = process.argv[2];
if (role !== 'parent' && role !== 'child') throw new Error('probe requires parent or child');
const nonce = process.env['GATEWAY_PROBE_NONCE'];
if (nonce === undefined || nonce.length < 32) throw new Error('probe requires nonce');
if (role === 'parent') {
  // Proof: suppressing this child spawn failed the real-Docker child WebSocket challenge.
  Bun.spawn([process.execPath, import.meta.path, 'child'], {
    env: process.env,
    stdout: 'inherit',
    stderr: 'inherit',
  });
} else {
  process.on('SIGTERM', () => undefined);
}
const identity = {
  role,
  pid: process.pid,
  ppid: process.ppid,
  start: readFileSync('/proc/self/stat', 'utf8').split(' ').at(21),
};
if (identity.start === undefined) throw new Error('missing Linux process start identity');
Bun.serve({
  hostname: '0.0.0.0',
  port: role === 'parent' ? 3200 : 3201,
  fetch(request, server) {
    if (server.upgrade(request)) return;
    return new Response('WebSocket required', { status: 426 });
  },
  websocket: {
    message(socket, message) {
      if (message !== nonce) {
        socket.close(1008, 'wrong nonce');
        return;
      }
      socket.send(JSON.stringify({ ...identity, nonce }));
    },
  },
});
