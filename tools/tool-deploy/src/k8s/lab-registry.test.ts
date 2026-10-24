import { afterEach, expect, test } from 'bun:test';

import { cutoverConfigDigestReader } from './cutover-rehearsal';
import { fakeRegistry } from './fake-registry';
import { labConfigDigestReader } from './lab-registry';
import { registryConfigDigestReader } from './registry';

const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
});

test('lab registry maps only its exact authority and preserves repository and digest', async () => {
  const registry = fakeRegistry({ 'nested/wbs-be-01': 'a'.repeat(40) });
  stops.push(registry.stop);
  const loopback = registry.ref('nested/wbs-be-01');
  const port = Number(new URL(`http://${loopback.split('/')[0]}`).port);
  const pinned = loopback.replace(`127.0.0.1:${String(port)}`, 'k3d-puni-f8-registry:5000');
  const read = labConfigDigestReader(port);
  expect(await read(pinned, 1000)).toBe(await registryConfigDigestReader(null)(loopback, 1000));
  for (const foreign of [
    pinned.replace('k3d-puni-f8-registry:5000', 'foreign:5000'),
    pinned.replace('k3d-puni-f8-registry:5000', 'k3d-puni-f8-registry:5000.evil'),
    pinned.replace('nested/wbs-be-01', 'other/wbs-be-01'),
    pinned.replace(/sha256:[0-9a-f]{64}$/, `sha256:${'f'.repeat(64)}`),
  ]) {
    const refusal = await read(foreign, 1000).then(
      () => 'accepted',
      (error: unknown) => String(error),
    );
    expect(refusal).toContain(
      foreign.includes('foreign:5000') || foreign.includes('5000.evil')
        ? 'not pinned to the F8 lab registry'
        : 'HTTP 404',
    );
  }
});

for (const port of [0, -1, 65536, 1.5, NaN])
  test(`lab registry refuses invalid port ${String(port)}`, () => {
    expect(() => labConfigDigestReader(port)).toThrow('invalid lab registry port');
  });

test('cutover caller resolves only its own verified F11 registry identity', async () => {
  const registry = fakeRegistry({ 'wbs-be-01': 'a'.repeat(40) });
  stops.push(registry.stop);
  const loopback = registry.ref('wbs-be-01');
  const port = Number(new URL(`http://${loopback.split('/')[0]}`).port);
  const pinned = loopback.replace(`127.0.0.1:${String(port)}`, 'k3d-puni-f11-registry:5000');
  const read = cutoverConfigDigestReader(port);
  expect(await read(pinned, 1000)).toBe(await registryConfigDigestReader(null)(loopback, 1000));
  for (const authority of ['k3d-puni-f8-registry:5000', 'foreign:5000']) {
    expect(
      await read(pinned.replace('k3d-puni-f11-registry:5000', authority), 1000).then(
        () => 'accepted',
        (error: unknown) => String(error),
      ),
    ).toContain('not pinned to the F11 lab registry');
  }
});
for (const port of [0, -1, 65536, 1.5, NaN])
  test(`cutover caller refuses invalid port ${String(port)}`, () => {
    expect(() => cutoverConfigDigestReader(port)).toThrow('invalid cutover registry port');
  });
