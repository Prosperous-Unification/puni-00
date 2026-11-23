import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

import { reserveLog } from '../resources/hold-log';
import { readHold, releaseHold } from '../resources/hold-token';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
const helper = join(import.meta.dir, 'testing/lock-owner.test.fixture.ts');
async function until(observe: () => boolean) {
  const end = performance.now() + 4000;
  while (!observe()) {
    if (performance.now() >= end) throw new Error('typed durable owner did not converge');
    await Bun.sleep(10);
  }
}
for (const mutation of ['none', 'hold-file'] as const)
  it(
    'executes the typed private owner with immutable selected hold input ' + mutation,
    async () => {
      const root = mkdtempSync(join(tmpdir(), 'puni private lock owner '));
      roots.push(root);
      const path = join(root, 'mutex'),
        holdFile = join(root, 'hold'),
        decoy = join(root, 'foreign hold');
      const log = reserveLog(holdFile);
      const child = Bun.spawn(
        [
          process.execPath,
          '--no-env-file',
          '--config=/dev/null',
          helper,
          path,
          'ops',
          'lock',
          'hold-internal-v1',
          '--hold-file',
          holdFile,
          '--controller-pid',
          String(log.controller.pid),
          '--controller-boot',
          log.controller.boot,
          '--controller-start',
          log.controller.start,
          '--label',
          'typed durable',
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            PUNI_LOCK_FIXTURE_MUTATION: mutation,
            PUNI_LOCK_FIXTURE_DECOY: decoy,
          },
          stdin: 'ignore',
          stdout: log.descriptor,
          stderr: log.descriptor,
        },
      );
      log.closeDescriptor();
      try {
        await until(() => child.exitCode !== null || existsSync(holdFile + '.ready'));
        expect(child.exitCode).toBe(null);
        expect(existsSync(decoy)).toBe(false);
        const hold = readHold(holdFile);
        expect(hold?.identity.pid).toBe(child.pid);
        if (hold === undefined) throw new Error('private selected token absent');
        expect(readFileSync(path + '.d/holder', 'utf8').trim()).toBe(String(child.pid));
        releaseHold(hold);
        await until(() => child.exitCode !== null);
        expect(await child.exited).toBe(0);
        expect(readFileSync(holdFile + '.log', 'utf8')).toBe(
          'heavy lock: waited 0s behind 0 tickets' + String.fromCharCode(10),
        );
        expect(existsSync(holdFile + '.ready')).toBe(true);
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
        await until(() => child.exitCode !== null || child.signalCode !== null);
        await child.exited;
      }
    },
  );
