import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  readRegistrySource,
  runRegistryProcess,
  withRegistryExecutable,
} from '@tools/registry-publication';
import { type } from 'arktype';

import { CURRENT_ENV } from './lib/docker';
import type { EnvLayout } from './lib/env';
import { buildSmokeCommand } from './lib/smoke-command';
import { parseStateJson, type Tier, type TierState } from './lib/state';

/** Pin the installed smoke bytes before any consumer mutation; execute only this verified snapshot. */
export async function pinComposeSmoke(path: string, expected: string): Promise<Uint8Array> {
  const artifact = await readRegistrySource(path);
  // Proof: hash comparison removal admitted changed installed smoke before consumer mutation.
  if (createHash('sha256').update(artifact.bytes).digest('hex') !== expected)
    throw new Error('Installed Compose smoke artifact digest mismatch');
  return artifact.bytes;
}
/** Run the shared smoke command under the caller's deploy lock and clean only its uniquely labelled container. */
export async function runComposeSmoke(
  artifact: Uint8Array,
  docker: { path: string; sha256: string },
  layout: EnvLayout = CURRENT_ENV,
): Promise<void> {
  const state: Partial<Record<Tier, TierState>> = {};
  for (const tier of ['be', 'gw', 'fe'] as const) {
    state[tier] = parseStateJson(
      (await readRegistrySource(`${layout.root}/state/${tier}.json`)).text,
    );
    if (state[tier].tier !== tier) throw new Error('Smoke tier state differs');
  }
  const directory = await mkdtemp(`${layout.root}/state/.registry-smoke-`);
  const path = join(directory, 'smoke.js');
  const identity = randomUUID();
  const name = `puni-registry-smoke-${identity}`;
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  try {
    await writeFile(path, artifact, { mode: 0o600 });
    await withRegistryExecutable(docker, async (executable, cwd) => {
      const command = buildSmokeCommand(state, layout, path).replace(
        'docker run --rm',
        `${quote(executable)} run --rm --name ${name} --label puni.registry-smoke=${identity}`,
      );
      const controller = new AbortController();
      const cancel = () => {
        controller.abort(new Error('Compose smoke cancelled'));
      };
      process.once('SIGTERM', cancel);
      process.once('SIGINT', cancel);
      process.once('SIGHUP', cancel);
      const cleanOwnedContainer = async () => {
        const ids = (
          await runRegistryProcess(
            [executable, 'ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.ID}}'],
            cwd,
          )
        ).trim();
        if (ids !== '') {
          if (!/^[0-9a-f]{12,64}$/.test(ids))
            throw new Error('Smoke cleanup found ambiguous container identity');
          const receipt = type({ id: 'string > 0', owner: 'string > 0', '+': 'reject' })(
            JSON.parse(
              await runRegistryProcess(
                [
                  executable,
                  'inspect',
                  '--format',
                  '{"id":{{json .Id}},"owner":{{json (index .Config.Labels "puni.registry-smoke")}}}',
                  ids,
                ],
                cwd,
              ),
            ) as unknown,
          );
          if (
            receipt instanceof type.errors ||
            !receipt.id.startsWith(ids) ||
            receipt.owner !== identity
          )
            throw new Error('Smoke cleanup refuses foreign container');
          await runRegistryProcess([executable, 'stop', '--time', '1', receipt.id], cwd);
          const retained = (
            await runRegistryProcess(
              [executable, 'ps', '-a', '--filter', `id=${receipt.id}`, '--format', '{{.ID}}'],
              cwd,
            )
          ).trim();
          if (retained !== '') await runRegistryProcess([executable, 'rm', receipt.id], cwd);
        }
      };
      try {
        process.stdout.write(
          await runRegistryProcess(['/bin/bash', '-c', command], layout.root, 180000, {
            ownProcessGroup: true,
            signal: controller.signal,
          }),
        );
      } finally {
        process.removeListener('SIGTERM', cancel);
        process.removeListener('SIGINT', cancel);
        process.removeListener('SIGHUP', cancel);
        await cleanOwnedContainer();
      }
    });
  } finally {
    await rm(directory, { recursive: true });
  }
}
