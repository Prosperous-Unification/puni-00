import { monotonicClock } from '../../clock';
import { openGatedDescriptors } from '../gated-payload-native';
import { decodeGatedEnvironment } from '../gated-payload-protocol';

const mode = process.argv.at(2);
if (mode === undefined) throw new Error('missing status fault');
const descriptors = await openGatedDescriptors(monotonicClock()),
  signal = new AbortController().signal;
const chunks: Uint8Array[] = [];
for (;;) {
  const next = await descriptors.environment.read(signal);
  if (next.kind === 'eof') break;
  if (next.kind !== 'bytes') throw new Error('unexpected environment cancellation');
  chunks.push(next.bytes);
}
const frame = Buffer.concat(chunks),
  values = decodeGatedEnvironment(frame.subarray(4));
descriptors.environment.close();
let start = '';
while (!start.includes('\n')) {
  const next = await descriptors.control.read(signal);
  if (next.kind !== 'bytes') throw new Error('missing start');
  start += new TextDecoder().decode(next.bytes);
}
const words = process.argv.slice(3),
  separator = words.indexOf('--');
if (separator < 0) throw new Error('missing payload separator');
const child = Bun.spawn(words.slice(separator + 1), {
  env: values,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
});
await child.exited;
const wire =
  mode === 'missing'
    ? ''
    : mode === 'partial'
      ? '3'
      : mode === 'duplicate'
        ? '3\n3\n'
        : mode === 'leading-zero'
          ? '03\n'
          : mode === 'range'
            ? '256\n'
            : '3\n';
if (wire !== '')
  await descriptors.status.write(new TextEncoder().encode(wire), signal, performance.now() + 1000);
descriptors.status.close();
for (;;) {
  const next = await descriptors.control.read(signal);
  if (next.kind === 'eof') break;
  if (next.kind !== 'bytes') throw new Error('unexpected control cancellation');
}
descriptors.control.close();
process.exitCode = mode === 'contradict' ? 0 : 3;
