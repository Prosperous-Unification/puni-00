import { rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { installed, roots } from '../fixtures/source-startup';
import {
  captureSourceRestorationConfiguration,
  createSourceStartupManifest,
} from './source-startup-manifest';

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
test('source restart configuration reads actual private pinned files and refuses changed or unreadable inputs', async () => {
  const prepared = await installed();
  const tiers = ['be-01', 'gw-01', 'mcp-01', 'fe-01'];
  const slots = ['backend', 'gateway', 'mcp', 'frontend'] as const;
  const contents = [
    'PORT=3100\nMIGRATE_ON_STARTUP=false\n',
    'PORT=3200\nBE_URL=http://localhost:3100\n',
    'WBS_API_URL=https://dev.wbs.bulletpoints.club\n',
    'VITE_BE_URL=http://localhost:3100\nVITE_GW_URL=http://localhost:3200\n',
  ];
  const pins = [];
  for (const [index, slot] of slots.entries()) {
    const body = contents.at(index);
    const tier = tiers.at(index);
    if (body === undefined || tier === undefined) throw new Error('fixture role absent');
    await writeFile(join(prepared.root, 'apps/wbs', tier, '.env'), body, { mode: 0o600 });
    pins.push({
      slot,
      size: Buffer.byteLength(body),
      sha256: createHash('sha256').update(body).digest('hex'),
    });
  }
  for (const tier of tiers) await rm(join(prepared.root, 'apps/wbs', tier, '.env'));
  const generated = await createSourceStartupManifest(prepared.root, prepared.sourceSha, pins);
  for (const [index, tier] of tiers.entries()) {
    const body = contents.at(index);
    if (body === undefined) throw new Error('fixture body absent');
    await writeFile(join(prepared.root, 'apps/wbs', tier, '.env'), body, { mode: 0o600 });
  }
  const profile = await captureSourceRestorationConfiguration(
    prepared.root,
    generated.manifest,
    [],
    performance.now() + 10000,
  );
  expect(profile.gatewayBackend).toBe('http://localhost:3100');
  const path = join(prepared.root, 'apps/wbs/gw-01/.env');
  await writeFile(path, 'PORT=3200\nBE_URL=http://localhost:3100\nPRIVATE_CREDENTIAL=changed\n');
  await rejects(
    captureSourceRestorationConfiguration(
      prepared.root,
      generated.manifest,
      [],
      performance.now() + 10000,
    ),
  );
  await writeFile(path, contents[1]);
  await chmod(path, 0);
  await rejects(
    captureSourceRestorationConfiguration(
      prepared.root,
      generated.manifest,
      [],
      performance.now() + 10000,
    ),
  );
  await chmod(path, 0o600);
  await rm(path);
  await rejects(
    captureSourceRestorationConfiguration(
      prepared.root,
      generated.manifest,
      [],
      performance.now() + 10000,
    ),
  );
}, 20000);
