import { fstatSync } from 'node:fs';
import { Socket } from 'node:net';
import { connect } from 'node:http2';

const descriptor = Number(process.argv[2]);
if (!Number.isSafeInteger(descriptor) || descriptor < 3) throw new Error('fixture descriptor');
if (!fstatSync(descriptor).isSocket()) throw new Error('inherited descriptor is not a socket');
const socket = new Socket({ fd: descriptor, readable: true, writable: true });
const session = connect('http://descriptor-fixture.invalid', { createConnection: () => socket });
let timer: ReturnType<typeof setTimeout> | undefined;
try {
  const outcome = await new Promise<string>((resolve, reject) => {
    session.on('error', reject);
    timer = setTimeout(() => reject(new Error('fixture watchdog')), 500);
    const stream = session.request({ ':method': 'POST', ':path': '/fixture.Probe/Observe' });
    stream.on('error', reject);
    stream.on('end', () => resolve('complete'));
    stream.resume();
    stream.end();
  });
  console.log(JSON.stringify({ inheritedSocket: true, outcome }));
} catch (failure) {
  if (!(failure instanceof Error)) throw failure;
  console.log(JSON.stringify({ inheritedSocket: true, outcome: failure.message }));
} finally {
  clearTimeout(timer);
  session.destroy();
  socket.destroy();
}
