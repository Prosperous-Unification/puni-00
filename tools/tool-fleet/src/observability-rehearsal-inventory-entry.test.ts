import { writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, spyOn, test } from 'bun:test';

import { readToolchain } from './contracts';
import * as rehearsal from './observability-parity-rehearsal';
import { inventoryObservabilityRehearsal } from './observability-rehearsal-inventory';
import * as rendering from './observability-render';
import { provisionObservabilityTools } from './observability-tools.fixture';

const root = join(import.meta.dir, '../../..');

test('canonical eleven-stage public entry inventories actual pinned releases with committed source provenance', async () => {
  const tools = await provisionObservabilityTools();
  const directory = await scratchAsync('rehearsal-inventory-entry-');
  const revision = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root });
  if (revision.exitCode !== 0) throw new Error('Fixture source revision unavailable');
  const request = {
    sourceRevision: revision.stdout.toString().trim(),
    network: {
      api: ['172.31.100.1/32'],
      observer: ['172.31.100.2/32'],
      grafana: ['172.31.100.3/32'],
      s3: ['172.31.100.4/32'],
      alertDelivery: ['172.31.100.5/32'],
      publicProbes: ['172.31.100.6/32'],
    },
  };
  const packet = join(directory, 'packet');
  await rehearsal.prepareObservabilityRehearsal(root, tools, request, packet);
  const lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const archive = join(
    tools,
    'cache',
    `helm-${lock.binaries.helm.version}`,
    basename(new URL(lock.binaries.helm.url).pathname),
  );
  const capture = process.env['PUNI_REHEARSAL_FRAMES_EXPORT'];
  const render = rendering.renderObservabilityReleases;
  const observer =
    capture === undefined
      ? null
      : spyOn(rendering, 'renderObservabilityReleases').mockImplementation(
          async (...arguments_) => {
            const frames = await render(...arguments_);
            await writeFile(capture, JSON.stringify(frames));
            return frames;
          },
        );
  const validate = rehearsal.validateObservabilityRehearsalBuilds;
  const buildObserver =
    capture === undefined
      ? null
      : spyOn(rehearsal, 'validateObservabilityRehearsalBuilds').mockImplementation(
          async (...arguments_) => {
            const validated = await validate(...arguments_);
            await writeFile(`${capture}.stages.json`, JSON.stringify(validated));
            return validated;
          },
        );
  let receipt: Awaited<ReturnType<typeof inventoryObservabilityRehearsal>>;
  try {
    receipt = await inventoryObservabilityRehearsal(root, tools, request, packet, archive);
  } finally {
    observer?.mockRestore();
    buildObserver?.mockRestore();
  }

  expect(receipt.frames.filter((frame) => frame.owner.startsWith('stage/'))).toHaveLength(11);
  const declarations = receipt.entries.filter((entry) => entry.kind === 'HelmRelease');
  expect(declarations.length).toBeGreaterThan(9);
  expect(receipt.frames.filter((frame) => frame.owner.startsWith('release/'))).toHaveLength(
    declarations.length,
  );
  expect(declarations.every((entry) => entry.expansionOwner !== null)).toBe(true);
  expect(receipt.entries.some((entry) => entry.hooks.length > 0)).toBe(true);
  expect(receipt.entries.some((entry) => entry.images.length > 0)).toBe(true);
  expect(receipt.entries.some((entry) => entry.claims.length > 0)).toBe(true);
  expect(receipt.creationAuthority).toBe(false);
  expect(receipt.runtimeRehearsal).toBe(false);
  expect(receipt.transportObserved).toBe('not-evaluated');
  expect(receipt.provenance.sourceRevision).toBe(request.sourceRevision);
  expect(receipt.provenance.generator.dirty).toBe(false);
  expect(receipt.provenance.helm.archiveSHA256).toBe(lock.binaries.helm.sha256);
  expect(receipt.provenance.helm.executableSHA256).not.toBe(lock.binaries.helm.sha256);
  expect(receipt.provenance.capabilities).toEqual({
    kubernetesVersion: '1.35.0',
    observed: false,
  });
  expect(
    basename(receipt.entries.find((entry) => entry.release !== null)?.release?.archivePath ?? ''),
  ).not.toBe('');
  const output = process.env['PUNI_REHEARSAL_INVENTORY_EXPORT'];
  if (output !== undefined) await writeFile(output, JSON.stringify(receipt, null, 2));
}, 30_000);
