import { rejects } from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { test } from 'bun:test';

import { sync } from './sync';

test('direct devsync executor refuses retained edge ownership before environment or checkout work', async () => {
  const state = await mkdtemp(join(tmpdir(), 'direct-devsync-owner-'));
  const previous = process.env['WBS_EDGE_STATE'];
  try {
    await writeFile(join(state, 'edge-owner.json'), 'closed');
    process.env['WBS_EDGE_STATE'] = state;
    await rejects(sync('a'.repeat(40)), /shared edge owner admission closed/);
  } finally {
    if (previous === undefined) delete process.env['WBS_EDGE_STATE'];
    else process.env['WBS_EDGE_STATE'] = previous;
    await rm(state, { recursive: true });
  }
});
