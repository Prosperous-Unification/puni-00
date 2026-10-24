import { rm } from 'node:fs/promises';

import { afterEach, expect, test } from 'bun:test';

import { completeActivationFixture } from '../fixtures/dependency-complete-activation';
import { roots } from '../fixtures/source-startup';

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
for (const kind of ['container', 'top', 'image'] as const)
  test(`base activation fixture explicitly refuses unmapped product ${kind} raw dispatch`, async () => {
    const fixture = await completeActivationFixture(['prod']);
    const id = kind === 'image' ? fixture.backend.Image : fixture.backend.Id;
    expect(() => fixture.ports.spawnProductMetadata({ kind, id })).toThrow(
      'fixture product metadata mapping unavailable',
    );
  });
