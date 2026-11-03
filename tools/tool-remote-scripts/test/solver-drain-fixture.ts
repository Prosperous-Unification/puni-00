import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { isRetainedEdgeOwnerRefusal } from '../src/lib/edge-admission';
import {
  withSolverPolicyAdmission,
  withSolverRuntimeAdmission,
} from '../src/lib/solver-runtime-admission';
import { parseSolverSupervisorArgs } from '../src/solver-supervisor';
import { describeFixtureFailure } from './fixture-failure';
import { boundedCommand } from './solver-drain-transport';

/** Disposable creator: no supervisor listener, adoption or global orphan sweep. */
async function runCreator(): Promise<void> {
  const { config, admission } = parseSolverSupervisorArgs(process.argv.slice(2));
  const root = dirname(config);
  // Proof: fixture-policy-admission omission reached missing manifest without policy; solver-drain-fixture.test.ts exited 1.
  const admit = admission === 'policy' ? withSolverPolicyAdmission : withSolverRuntimeAdmission;
  await admit(async () => {
    const manifest: unknown = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
    if (
      typeof manifest !== 'object' ||
      manifest === null ||
      !('createDuringStop' in manifest) ||
      !Array.isArray(manifest.createDuringStop) ||
      !manifest.createDuringStop.every((part: unknown) => typeof part === 'string')
    )
      throw new Error('fixture manifest malformed');
    const createDuringStop = manifest.createDuringStop;
    const descendant = Bun.spawn(['/bin/sleep', '300'], { stdout: 'ignore', stderr: 'ignore' });
    let stopping = false;
    await new Promise<void>((resolve, reject) => {
      process.on('SIGTERM', () => {
        if (stopping) return;
        stopping = true;
        void (async () => {
          const id = await boundedCommand(createDuringStop, 10000);
          await writeFile(join(root, 'during-stop.id'), id, { mode: 0o600, flag: 'wx' });
          if (descendant.exitCode === null) descendant.kill('SIGKILL');
          await descendant.exited;
          resolve();
        })().catch(reject);
      });
      void writeFile(
        join(root, 'ready.json'),
        JSON.stringify({ pid: process.pid, descendant: descendant.pid }),
        { mode: 0o600, flag: 'wx' },
      ).catch(reject);
    });
  });
}

if (import.meta.main) {
  try {
    await runCreator();
  } catch (cause) {
    const argument = process.argv.at(2);
    if (!argument?.startsWith('--config=/')) {
      // Proof: creator-cli-privacy fault lost the private diagnostic; invalid-CLI negative failed.
      console.error(describeFixtureFailure(cause));
      process.exit(1);
    }
    await writeFile(
      join(dirname(argument.slice('--config='.length)), 'refused.json'),
      JSON.stringify({
        pid: process.pid,
        reason: isRetainedEdgeOwnerRefusal(cause) ? cause.reason : 'startup-error',
        // Proof: creator-receipt-privacy fault retained raw JSON diagnostics; malformed-manifest negative failed.
        error: describeFixtureFailure(cause),
      }),
      { mode: 0o600 },
    );
    // Proof: fixture maps only retained owner refusal to 78; missing manifest/policy remain 1.
    process.exit(isRetainedEdgeOwnerRefusal(cause) ? 78 : 1);
  }
}
