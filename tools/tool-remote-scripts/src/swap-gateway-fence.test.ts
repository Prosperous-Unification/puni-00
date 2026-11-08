import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { SwapPlan } from './lib/reconcile';
import type { Tier } from './lib/state';
import { execute, runSwaps, type SwapExecutionIo } from './swap';

let previousControllerState: string | undefined;
beforeEach(() => {
  previousControllerState = process.env['WBS_EDGE_STATE'];
  const controllerState = scratchSync('direct-controller-edge-');
  writeFileSync(`${controllerState}/edge.lock`, '');
  process.env['WBS_EDGE_STATE'] = controllerState;
});
afterEach(() => {
  if (previousControllerState === undefined) delete process.env['WBS_EDGE_STATE'];
  else process.env['WBS_EDGE_STATE'] = previousControllerState;
});

const marker = '{"format":"dependency-gateway-fence","version":1}\n';
const selections: Tier[][] = [['gw'], ['fe'], ['be'], ['be', 'gw', 'fe']];

for (const tiers of selections) {
  for (const boundary of ['run', 'direct'] as const) {
    for (const fault of [
      'present',
      'malformed',
      'extra-field',
      'wrong-version',
      'array',
      'unreadable',
      'unreadable-file',
      'missing-root',
      'file-root',
      'unreadable-root',
      'traverse-only-root',
      'dangling-symlink',
      'symlink',
      'absent',
    ] as const) {
      test(`gateway fence ${boundary} ${tiers.join(',')} ${fault}`, async () => {
        const root = scratchSync('gateway-fence-');
        const path = join(root, 'dependency-gateway-fence.json');
        if (fault === 'present') writeFileSync(path, marker);
        if (fault === 'malformed') writeFileSync(path, '{broken');
        if (fault === 'extra-field')
          writeFileSync(path, marker.trim().slice(0, -1) + ',"extra":true}');
        if (fault === 'wrong-version') writeFileSync(path, marker.replace(':1', ':2'));
        if (fault === 'array') writeFileSync(path, '[]');
        if (fault === 'unreadable') mkdirSync(path);
        if (fault === 'unreadable-file') {
          writeFileSync(path, marker);
          chmodSync(path, 0);
        }
        if (fault === 'missing-root') rmSync(root, { recursive: true });
        if (fault === 'file-root') {
          rmSync(root, { recursive: true });
          writeFileSync(root, 'invalid root');
        }
        if (fault === 'unreadable-root') chmodSync(root, 0);
        if (fault === 'traverse-only-root') {
          chmodSync(root, 0o111);
          // The negative requires actual denied readability, not just nominal mode bits.
          expect(() => readdirSync(root)).toThrow();
        }
        if (fault === 'dangling-symlink') symlinkSync(join(root, 'absent-target'), path);
        if (fault === 'symlink') {
          const target = join(root, 'intent.json');
          writeFileSync(target, marker);
          symlinkSync(target, path);
        }
        const effects: string[] = [];
        const io: SwapExecutionIo = {
          barrierStateDir: root,
          sh: () => {
            effects.push('docker');
            return Promise.resolve('');
          },
          readPhase: () => {
            effects.push('read-phase');
            return Promise.resolve(null);
          },
          writePhase: () => {
            effects.push('phase');
            return Promise.resolve();
          },
          writeAtomic: () => {
            effects.push('config');
            return Promise.resolve();
          },
        };
        let failure = '';
        try {
          if (boundary === 'run') {
            await runSwaps(tiers, { be: 'be', gw: 'gw', fe: 'fe' }, 'sha', {
              barrierStateDir: root,
              withLock: async (_path, run) => {
                effects.push('lock');
                return await run();
              },
              observe: () => {
                effects.push('observe');
                return Promise.resolve({
                  routedColor: 'blue',
                  runningColors: ['blue'],
                  recordedColor: 'blue',
                  phase: 'committed',
                });
              },
              execute: () => {
                effects.push('execute');
                return Promise.resolve();
              },
            });
          } else {
            for (const tier of tiers) {
              const plan: SwapPlan = { tier, from: 'blue', to: 'green', steps: ['commit'] };
              await execute(plan, 'image', 'sha', io);
            }
          }
        } catch (cause) {
          failure = cause instanceof Error ? cause.message : String(cause);
        } finally {
          if (fault === 'unreadable-root' || fault === 'traverse-only-root') chmodSync(root, 0o700);
          if (fault === 'unreadable-file') chmodSync(path, 0o600);
        }
        if (fault === 'absent') {
          expect(effects).toContain(boundary === 'run' ? 'observe' : 'read-phase');
          expect(failure).not.toContain('gateway fence');
        } else {
          expect(failure).toContain('gateway fence');
          if (fault === 'dangling-symlink' || fault === 'symlink')
            expect(failure).toContain('not a regular file');
          if (['malformed', 'extra-field', 'wrong-version', 'array'].includes(fault))
            expect(failure).toContain('malformed gateway fence');
          expect(effects).toEqual(boundary === 'run' ? ['lock'] : []);
          if (fault === 'present') expect(readFileSync(path, 'utf8')).toBe(marker);
        }
      });
    }
  }
}
