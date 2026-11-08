import { closeSync, openSync } from 'node:fs';

import { type } from 'arktype';
import { expect, test } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { completeRegistryFixture } from './registry-fixture-completion.fixture';
import { authenticateMaintenanceChannel } from './registry-maintenance-channel';
import { createMaintenanceSocketPair } from './registry-maintenance-socket';
import { requireRejection } from './registry-rejection.fixture';

test('current unprivileged acknowledgement cannot authorize sending the operation token', async () => {
  if (process.getuid?.() === 0)
    throw new Error('This negative requires the ordinary local test UID');
  const pair = createMaintenanceSocketPair();
  const descriptor = openSync('/dev/null', 'r');
  const rejected = requireRejection(authenticateMaintenanceChannel(pair.parent, descriptor));
  await completeRegistryFixture(async () => {
    const bootstrap = await pair.helper.receive(AbortSignal.timeout(1000));
    if (bootstrap === null) throw new Error('Missing native bootstrap');
    for (const received of bootstrap.descriptors) closeSync(received);
    // Proof: malformed nonce/kind and extra bootstrap-field variants fail this actual unprivileged test without leaving the authentication attempt unobserved.
    const decoded = type({ kind: "'bootstrap'", nonce: /^[a-f0-9]{64}$/, '+': 'reject' }).assert(
      JSON.parse(bootstrap.bytes.toString()),
    );
    expect(Object.keys(decoded).sort()).toEqual(['kind', 'nonce']);
    expect(bootstrap.descriptors).toHaveLength(1);
    await pair.helper.send(
      Buffer.from(
        JSON.stringify({ kind: 'authenticated', nonce: decoded.nonce, challenge: 'a'.repeat(64) }),
      ),
    );
    expect((await rejected).throwCause).toThrow('current root authentication');
    pair.parent.close();
    expect(await pair.helper.receive(AbortSignal.timeout(1000))).toBeNull();
  }, [
    () =>
      invokeRegistryCallback(() => {
        pair.parent.close();
      }),
    () =>
      invokeRegistryCallback(() => {
        pair.helper.close();
      }),
    () =>
      invokeRegistryCallback(() => {
        closeSync(descriptor);
      }),
    async () => {
      await rejected;
    },
  ]);
});

for (const fault of [
  'none',
  'malformed',
  'extra-field',
  'zero-rights',
  'extra-rights',
  'wrong-file',
  'unheld',
  'eof',
] as const) {
  test(`actual Bun FD0 socket bootstrap ${fault === 'none' ? 'verifies the transferred lock' : `refuses ${fault} without descriptor leaks`}`, async () => {
    const { mkdtemp, rm, chmod } = await import('node:fs/promises');
    const { dlopen } = await import('bun:ffi');
    const directory = await mkdtemp('/tmp/task8-bootstrap-');
    await chmod(directory, 0o700);
    const owned = openSync(directory + '/authority.lock', 'wx+', 0o600);
    const unrelated = openSync('/dev/null', 'r');
    const native = dlopen('libc.so.6', { flock: { args: ['i32', 'i32'], returns: 'i32' } });
    const pair = createMaintenanceSocketPair();
    let child: Bun.Subprocess<number, 'pipe', 'pipe'> | undefined;
    try {
      if (fault !== 'unheld' && native.symbols.flock(owned, 2 | 4) !== 0)
        throw new Error('Fixture lock acquisition');
      child = Bun.spawn(
        [
          process.execPath,
          new URL('./registry-maintenance-channel.fixture.ts', import.meta.url).pathname,
          directory,
        ],
        { stdio: [pair.helper.descriptor, 'pipe', 'pipe'] },
      );
      pair.helper.close();
      if (fault === 'eof') pair.parent.close();
      else {
        const bootstrap =
          fault === 'malformed'
            ? '{invalid'
            : JSON.stringify({
                kind: 'bootstrap',
                nonce: 'a'.repeat(64),
                ...(fault === 'extra-field' ? { argv: [] } : {}),
              });
        await pair.parent.send(
          Buffer.from(bootstrap),
          fault === 'zero-rights'
            ? []
            : fault === 'extra-rights'
              ? [owned, unrelated]
              : [fault === 'wrong-file' ? unrelated : owned],
        );
        const acknowledgement = await pair.parent.receive(AbortSignal.timeout(5000));
        if (fault === 'none') {
          expect(acknowledgement?.credentials.pid).toBe(child.pid);
          expect(acknowledgement?.credentials.uid).toBe(process.getuid?.());
          expect(JSON.parse(acknowledgement?.bytes.toString() ?? '{}')).toMatchObject({
            kind: 'authenticated',
          });
        } else expect(acknowledgement).toBeNull();
      }
      const [code, output, diagnostics] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect({ code, diagnostics }).toEqual({ code: 0, diagnostics: '' });
      expect(JSON.parse(output)).toEqual({ accepted: fault === 'none', descriptorDelta: -1 });
    } finally {
      if (child?.exitCode === null) {
        child.kill('SIGKILL');
        await child.exited;
      }
      pair.parent.close();
      pair.helper.close();
      closeSync(owned);
      closeSync(unrelated);
      native.close();
      await rm(directory, { recursive: true });
    }
  });
}
