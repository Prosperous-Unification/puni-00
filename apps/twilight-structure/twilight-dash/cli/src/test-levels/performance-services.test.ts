import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, test } from 'bun:test';

import {
  assertCandidateServiceDescriptors,
  decodeServiceDescriptors,
} from './performance-services';

const root = '/candidate with spaces';
const shift = 6000;
const database = root + '/tmp/owned-performance.db';
function current() {
  const directory = mkdtempSync(join(tmpdir(), 'performance-service-producer-'));
  const output = join(directory, 'descriptors.json');
  try {
    const descriptor = openSync(output, 'wx', 0o600);
    let child: ReturnType<typeof Bun.spawnSync>;
    try {
      child = Bun.spawnSync(
        [
          process.execPath,
          '--no-env-file',
          '--config=/dev/null',
          resolve(import.meta.dir, '../../../../../wbs/fe-01/ordinary-servers-cli.ts'),
          root,
          String(shift),
          database,
        ],
        { stdout: descriptor, stderr: 'inherit', timeout: 30000 },
      );
    } finally {
      closeSync(descriptor);
    }
    const signal: unknown = child.signalCode;
    if (child.exitCode !== 0 || (signal !== undefined && signal !== null))
      throw Error('WBS service producer failed');
    return decodeServiceDescriptors(readFileSync(output, 'utf8'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('owned Dash Performance service admission', () => {
  test('admits the actual current WBS ordinary-service producer', () => {
    expect(() => {
      assertCandidateServiceDescriptors(current(), root, shift, database);
    }).not.toThrow();
  });

  for (const field of ['command', 'cwd', 'url', 'env'] as const) {
    for (const index of [0, 1, 2]) {
      test('refuses a changed ' + field + ' for role ' + String(index), () => {
        const services = current();
        const service = services[index];
        if (field === 'env') service.env['FOREIGN'] = '1';
        else service[field] += '-foreign';
        expect(() => {
          assertCandidateServiceDescriptors(services, root, shift, database);
        }).toThrow('differ from the approved shifted WBS stack');
      });
    }
  }

  test('refuses an own prototype-named key in the backend environment', () => {
    const services = current();
    services[0].env = { ...services[0].env, ['__proto__']: 'foreign' };
    expect(() => {
      assertCandidateServiceDescriptors(services, root, shift, database);
    }).toThrow('differ from the approved shifted WBS stack');
  });

  test('refuses the historical backend service even if its URL is current', () => {
    const services = current();
    services[0].command = 'bun src/main.ts';
    expect(() => {
      assertCandidateServiceDescriptors(services, root, shift, database);
    }).toThrow('differ from the approved shifted WBS stack');
  });
});
