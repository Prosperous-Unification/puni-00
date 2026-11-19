import { symlink } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { stageDevPoller } from './stage-dev-poller';

it('refuses a stage whose parent symlink resolves into the watched checkout', async () => {
  const root = await scratchAsync('poller-stage-alias-');
  const source = new URL('../../../', import.meta.url).pathname;
  const alias = join(root, 'source-alias');
  await symlink(source, alias);
  // Existing tools prevents a faulty implementation from writing a staged generation into source.
  let refusal: string | undefined;
  try {
    await stageDevPoller(join(alias, 'tools'));
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    refusal = error.message;
  }
  expect(refusal).toBe('poller staging must be outside the watched source checkout');
});
