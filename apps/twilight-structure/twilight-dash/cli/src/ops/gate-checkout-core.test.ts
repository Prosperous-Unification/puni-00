import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

import { type GateAdmission, withGateAdmission } from './gate-admission';
import { runAdmittedCheckout } from './gate-checkout-core';
import { createGateControl } from './gate-control';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni admitted core ')),
    tree = join(root, 'tree'),
    gitExecutable = realpathSync('/usr/bin/git');
  roots.push(root);
  mkdirSync(tree);
  function git(...argv: string[]): string {
    const child = Bun.spawnSync([gitExecutable, '-C', tree, ...argv], {
      env: {
        PATH: '/usr/bin:/bin',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (child.exitCode !== 0) throw Error(child.stderr.toString());
    return child.stdout.toString().trim();
  }
  git('init', '-q', '-b', 'original');
  git('config', 'user.name', 'Core test');
  git('config', 'user.email', 'core@example.test');
  writeFileSync(join(tree, 'tracked'), 'original');
  git('add', '.');
  git('commit', '-qm', 'original');
  const original = git('rev-parse', 'HEAD');
  writeFileSync(join(tree, 'tracked'), 'candidate');
  git('commit', '-qam', 'candidate');
  const commit = git('rev-parse', 'HEAD');
  git('checkout', '-q', original);
  const effects: string[] = [];
  const context = {
    gitExecutable,
    lookupPath: '/usr/bin:/bin',
    reportAdmission: () => {
      effects.push('admission');
      return Promise.resolve();
    },
    reportHead: () => {
      effects.push('head');
      return Promise.resolve();
    },
    reportFailure: () => {
      effects.push('failure');
      return Promise.resolve();
    },
    reportUnconfirmed: () => Promise.resolve(),
    work: () => {
      effects.push('work');
      return Promise.resolve(0);
    },
  };
  return {
    request: { tree, commit, settle: 'restore' as const, repairModes: false },
    context,
    effects,
    queue: {
      path: join(root, 'mutex'),
      label: 'core test',
      command: 'core',
      waitSeconds: 0,
      pollSeconds: 1,
    },
    git,
    original,
  };
}
async function expectAdmissionRefusal(pending: Promise<unknown>): Promise<void> {
  const observed: unknown = await pending.catch((cause: unknown) => cause);
  expect(observed).toBeInstanceOf(Error);
  if (!(observed instanceof Error)) throw Error('core did not reject admission');
  expect(observed.message).toBe('gate admission is not held');
}
for (const authority of [undefined, 3, {}, { aheadAtArrival: 0, waitedSeconds: 0 }])
  it(
    'rejects unregistered core admission before transaction effects: ' + JSON.stringify(authority),
    async () => {
      const selected = fixture(),
        control = { signal: new AbortController().signal, readStatus: (): 130 => 130 };
      let captures = 0;
      const pending: unknown = Reflect.apply(runAdmittedCheckout, undefined, [
        selected.request,
        selected.context,
        control,
        authority,
        () => {
          captures++;
        },
      ]);
      if (!(pending instanceof Promise)) throw Error('core did not return a promise');
      await expectAdmissionRefusal(pending);
      expect(selected.effects).toEqual([]);
      expect(captures).toBe(0);
      expect(selected.git('rev-parse', 'HEAD')).toBe(selected.original);
    },
  );
for (const fails of [false, true])
  it(
    'rejects stale core entry after real callback ' + (fails ? 'failure' : 'completion'),
    async () => {
      const selected = fixture();
      let retained: GateAdmission | undefined;
      const failure = new Error('controlled callback failure');
      const pending = withGateAdmission(
        selected.queue,
        new AbortController().signal,
        (admission) => {
          retained = admission;
          return fails ? Promise.reject(failure) : Promise.resolve(0);
        },
      );
      if (fails) {
        const observed: unknown = await pending.catch((cause: unknown) => cause);
        expect(observed).toBe(failure);
      } else await pending;
      if (retained === undefined) throw Error('real admission was not observed');
      await expectAdmissionRefusal(
        runAdmittedCheckout(
          selected.request,
          selected.context,
          { signal: new AbortController().signal, readStatus: () => 130 },
          retained,
          () => {
            selected.effects.push('capture');
          },
        ),
      );
      expect(selected.effects).toEqual([]);
    },
  );
it('borrows cancellation access without retiring the executable owner', async () => {
  const selected = fixture(),
    baseline = process.listenerCount('SIGINT'),
    external = new AbortController(),
    owner = createGateControl(external.signal);
  const borrowed = { signal: owner.signal, readStatus: owner.readStatus };
  let captures = 0;
  try {
    const outcome = await withGateAdmission(selected.queue, owner.signal, (admission) =>
      runAdmittedCheckout(selected.request, selected.context, borrowed, admission, () => {
        captures++;
      }),
    );
    expect(outcome).toMatchObject({ kind: 'completed', value: { status: 0, failures: [] } });
    expect(captures).toBe(1);
    expect(selected.git('rev-parse', 'HEAD')).toBe(selected.original);
    expect(process.listenerCount('SIGINT')).toBe(baseline + 1);
    const reason = { cancel: 'after core' };
    external.abort(reason);
    expect(owner.readInterruption()).toEqual({ kind: 'external', reason });
    expect(owner.readStatus()).toBe(130);
  } finally {
    owner.dispose();
  }
  expect(process.listenerCount('SIGINT')).toBe(baseline);
});
