import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';

import { type RunDocker, runDockerBefore } from './docker-deadline';
import { writeNewMigrationCapture } from './migration-capture-file';
import type { WriterIntent } from './writer-barrier';

/** Exact host observation persisted before granting the image-local command write authority. */
export interface ActivationReceipt {
  protocol: 'step-blockage-activation';
  version: 1;
  activationId: string;
  candidateImage: string;
  rollbackImage: string;
  databaseIdentity: string;
  activatedAt: number;
}

type RunPinned = (image: string, command: string[], signal?: AbortSignal) => Promise<string>;

/**
 * Requires a previously installed receipt migration and independent capability observations
 * from the exact candidate and outgoing rollback digests while writers are fenced.
 * One absolute 60-second production budget bounds both independent capability calls and inspection.
 * Proof: omitting the shared deadline made capability/inspect production-caller stalls hang past their budget.
 * Never creates activation intent or mutates SQLite. See docs/runbook-prod-deploy.md.
 */
export async function prepareActivation(
  writer: WriterIntent,
  runPinned: RunPinned,
  deadline = performance.now() + 60_000,
): Promise<ActivationReceipt> {
  // Proof: removing rollback/database guards admitted unowned authority or lost their named refusal in the corresponding boundary negatives.
  if (writer.rollback === null) throw new Error('activation requires a capable rollback image');
  if (writer.databaseHostPath === undefined || writer.databaseHostPath === '')
    throw new Error('activation requires canonical database identity');
  for (const image of [writer.candidate, writer.rollback.image]) {
    const supported: unknown = JSON.parse(
      await runDockerBefore(
        [image, 'bun', 'src/step-blockage-replay-kinds-cli.ts'],
        (_args, signal) =>
          runPinned(image, ['bun', 'src/step-blockage-replay-kinds-cli.ts'], signal),
        deadline,
      ),
    );
    // Proof: omitted capability validation; candidate, rollback and malformed/empty/duplicate capability negatives failed.
    if (
      !Array.isArray(supported) ||
      supported.some((value: unknown) => typeof value !== 'string' || value.trim() === '') ||
      new Set(supported).size !== supported.length ||
      !supported.includes('step_blockage_activation_v1')
    )
      throw new Error(`activation requires step_blockage_activation_v1 from ${image}`);
  }
  const inspection: unknown = JSON.parse(
    await runDockerBefore(
      [writer.candidate, 'bun', 'src/step-blockage-activation-cli.ts', 'inspect'],
      (_args, signal) =>
        runPinned(
          writer.candidate,
          ['bun', 'src/step-blockage-activation-cli.ts', 'inspect'],
          signal,
        ),
      deadline,
    ),
  );
  // Proof: omitted pre-migration inspection equality; enabled and malformed authority negatives admitted activation preparation.
  if (!isDeepStrictEqual(inspection, { state: 'DISABLED', receipt: null }))
    throw new Error('activation requires previously deployed DISABLED receipt authority');
  return {
    protocol: 'step-blockage-activation',
    version: 1,
    activationId: randomUUID(),
    candidateImage: writer.candidate,
    rollbackImage: writer.rollback.image,
    databaseIdentity: writer.databaseHostPath,
    activatedAt: Date.now(),
  };
}

/**
 * Publishes a synced exclusive intent before image-local activation. Each execution is fenced
 * against the exact maintenance, stopped-writer and database identities. Any failure retains
 * intent and forbids ordinary retry; only exact committed independent readback returns.
 * One absolute production budget includes fences, durable publication/readback and every Docker call.
 * Proof: omitted deadline racing; eight production-caller stall negatives timed out. Late durable
 * publication after expiry retains its marker and never resumes transfer or activation.
 */
export async function activateBlockages(
  root: string,
  writer: WriterIntent,
  receipt: ActivationReceipt,
  maintenanceId: string,
  fence: (runDocker: RunDocker, signal?: AbortSignal) => Promise<void>,
  runDocker: RunDocker,
  publishIntent: typeof writeNewMigrationCapture = writeNewMigrationCapture,
  deadline = performance.now() + 60_000,
): Promise<void> {
  const runBefore: RunDocker = (args, parentSignal) =>
    runDockerBefore(
      args,
      (command, signal) =>
        runDocker(
          command,
          parentSignal === undefined
            ? signal
            : signal === undefined
              ? parentSignal
              : AbortSignal.any([parentSignal, signal]),
        ),
      deadline,
    );
  const verifyFence = () =>
    runDockerBefore(
      ['activation-fence'],
      async (_args, signal) => {
        await fence(
          (args, parentSignal) =>
            runBefore(
              args,
              parentSignal === undefined
                ? signal
                : signal === undefined
                  ? parentSignal
                  : AbortSignal.any([parentSignal, signal]),
            ),
          signal,
        );
        return '';
      },
      deadline,
    );
  // Proof: omitted fences; the second-fence identity fault completed activation instead of retaining uncertainty.
  await verifyFence();
  const path = `${root}/be-writer-activation.json`;
  const serialized = `${JSON.stringify({ writer, receipt, maintenanceId })}\n`;
  // Proof: omitted publication; the exact durable-intent-before-execution positive failed on absent intent.
  await runDockerBefore(
    ['activation-intent'],
    async () => {
      await publishIntent(path, serialized);
      return '';
    },
    deadline,
  );
  // Proof: omitted equality; the corrupt durable publication dependency reached image-local execution.
  if (
    (await runDockerBefore(
      ['activation-intent-readback'],
      () => readFile(path, 'utf8'),
      deadline,
    )) !== serialized
  )
    throw new Error('activation durable intent readback differs');
  const containerPath = `/tmp/step-blockage-${receipt.activationId}.json`;
  await runBefore([
    'exec',
    maintenanceId,
    'bun',
    '-e',
    `await Bun.write(${JSON.stringify(containerPath)},${JSON.stringify(JSON.stringify(receipt))})`,
  ]);
  await verifyFence();
  const committed: unknown = JSON.parse(
    await runBefore([
      'exec',
      maintenanceId,
      'bun',
      'src/step-blockage-activation-cli.ts',
      'activate',
      containerPath,
    ]),
  );
  // Proof: omitted equality; activate-mismatch returned success despite a different command receipt.
  if (!isDeepStrictEqual(committed, { state: 'ENABLED', receipt }))
    throw new Error('activation receipt differs');
  await verifyFence();
  const inspection: unknown = JSON.parse(
    await runBefore([
      'exec',
      maintenanceId,
      'bun',
      'src/step-blockage-activation-cli.ts',
      'inspect',
    ]),
  );
  // Proof: omitted equality; disabled/mismatched independent readback negatives completed activation.
  if (!isDeepStrictEqual(inspection, { state: 'ENABLED', receipt }))
    throw new Error('activation committed readback differs');
}
