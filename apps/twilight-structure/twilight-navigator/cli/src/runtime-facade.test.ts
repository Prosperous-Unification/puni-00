import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import type { Request } from './grammar-facade';
import * as runtime from './runtime-facade';

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'puni navigator runtime '));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('Navigator typed runtime facade', () => {
  for (const command of ['plan-reference', 'receipt-to-commands', 'admit-progress'] as const) {
    it(command + ' retains its actual reader refusal without any output side effects', async () => {
      const missing = join(directory, 'missing.json');
      const request: Request =
        command === 'plan-reference'
          ? {
              command,
              export: missing,
              repository: 'repository',
              change: 'change',
              planningCommit: '1'.repeat(40),
              sourceBase: '2'.repeat(40),
              requirements: join(directory, 'requirements.md'),
              output: directory,
            }
          : command === 'receipt-to-commands'
            ? {
                command,
                receipt: missing,
                planReference: missing,
                tasks: missing,
                output: join(directory, 'commands.json'),
              }
            : {
                command,
                receipt: missing,
                planReference: missing,
                tasks: missing,
                acceptedReference: missing,
                output: join(directory, 'commands.json'),
              };
      const invoke = async () => await runtime.executeRequest(request);
      const refusal: unknown = await invoke().then(
        () => {
          throw new Error('Navigator accepted its absent input');
        },
        (cause: unknown) => cause,
      );
      if (!(refusal instanceof Error)) throw refusal;
      expect(refusal.message).toContain(
        (command === 'plan-reference' ? 'plan export' : 'progress receipt') + ' is missing',
      );
      expect(readdirSync(directory)).toEqual([]);
    });
  }
});
