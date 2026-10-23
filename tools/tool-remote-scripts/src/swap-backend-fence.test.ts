import { chmodSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import type { SwapPlan } from './lib/reconcile';
import type { Tier } from './lib/state';
import { execute, runSwaps, type SwapExecutionIo } from './swap';

const marker = '{"format":"dependency-backend-fence","version":1}\n';
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
      'dangling-symlink',
      'symlink',
      'absent',
    ] as const) {
      test(`backend fence ${boundary} ${tiers.join(',')} ${fault}`, async () => {
        const root = scratchSync('backend-fence-');
        const path = join(root, 'dependency-backend-fence.json');
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
          if (fault === 'unreadable-file') chmodSync(path, 0o600);
        }
        if (fault === 'absent') {
          expect(effects).toContain(boundary === 'run' ? 'observe' : 'read-phase');
          expect(failure).not.toContain('backend fence');
        } else {
          expect(failure).toContain('backend fence');
          if (fault === 'dangling-symlink' || fault === 'symlink')
            expect(failure).toContain('not a regular file');
          if (['malformed', 'extra-field', 'wrong-version', 'array'].includes(fault))
            expect(failure).toContain('malformed backend fence');
          expect(effects).toEqual(boundary === 'run' ? ['lock'] : []);
          if (fault === 'present') expect(readFileSync(path, 'utf8')).toBe(marker);
        }
      });
    }
  }
}
