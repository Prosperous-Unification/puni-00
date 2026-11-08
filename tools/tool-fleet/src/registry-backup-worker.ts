import { type } from 'arktype';

import {
  readRegistryBackupGuardian,
  RegistryBackupAction,
  RegistryBackupCompletion,
  requireRegistryBackupAttempt,
} from './registry-backup-attempt';
import { requireRegistryBackupLockReservation } from './registry-backup-locks';
import type { RegistryMaintenanceHostRequest } from './registry-maintenance-control';
import { RegistryMaintenanceRefusal } from './registry-maintenance-failure';
import {
  type RegistryMaintenanceInstallation,
  verifyRegistryHostArtifact,
} from './registry-maintenance-installation';
import { awaitRegistryBackupChild } from './registry-maintenance-process';
import type { RegistryMaintenanceJournal } from './registry-managed-journal';
import { readRegistryBytes } from './registry-stream';

/** Fixed reviewed utility creates UTS before Bun starts threads; no caller command/path/env crosses this launcher (ADR0077). Keeps the control pipe open until terminal-group and output collection settle, awaits each pipe effect, and preserves the original outcome through closure. Dual failure retains both errors and the original worker cause. */
export async function runRegistryBackupWorker(input: {
  installed: RegistryMaintenanceInstallation;
  journal: RegistryMaintenanceJournal;
  request: RegistryMaintenanceHostRequest;
  signal: AbortSignal;
  descriptor: number;
}): Promise<string> {
  const action =
    input.request.action === 'backup-reconcile'
      ? input.request.action
      : RegistryBackupAction.assert(input.request.action);
  const guardian = await readRegistryBackupGuardian(process.pid);
  const attempt = input.journal.maintenanceEvidence?.backupAttempts.find(
    (attempt) => attempt.guardian.pid === guardian.pid,
  );
  if (action === 'backup-reconcile') {
    requireRegistryBackupLockReservation(
      input.journal.maintenanceEvidence?.backupReconciliation,
      input.journal.maintenanceEvidence?.backupAttempts ?? [],
      input.request.operationId,
      input.installed.backupConfiguration.sha256,
      input.journal.revision,
    );
  } else {
    if (attempt === undefined) throw new Error('Missing durable root backup guardian attempt');
    // Proof: all eight lineage faults reached the stub; the fixed launcher now refuses each before spawn.
    requireRegistryBackupAttempt(attempt, {
      ...input.request,
      action,
      guardian,
      configurationSha256: input.installed.backupConfiguration.sha256,
      registryId: input.installed.registryId,
      journalRevision: input.journal.revision,
    });
  }
  await verifyRegistryHostArtifact({
    path: '/usr/bin/unshare',
    sha256: '41c65e55107cbbb1a1f6994784a938dd7dbbe255d1fea6b7a58ec96eabe382ef',
  });
  await verifyRegistryHostArtifact({
    path: '/usr/local/libexec/puni-registry-authority/bun',
    sha256: '10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235',
  });
  await verifyRegistryHostArtifact(input.installed.backupWorker);
  await verifyRegistryHostArtifact(input.installed.backupConfiguration, true);
  input.signal.throwIfAborted();
  const child = Bun.spawn(
    [
      '/usr/bin/unshare',
      '--uts',
      '--',
      '/usr/local/libexec/puni-registry-authority/bun',
      '/usr/local/libexec/puni-registry-maintenance/backup-worker.js',
    ],
    {
      env: { PATH: '/usr/bin:/bin', LANG: 'C' },
      stdio: ['pipe', 'pipe', 'pipe', input.descriptor],
      detached: true,
    },
  );
  const interrupted = new AbortController();
  const signal = AbortSignal.any([input.signal, interrupted.signal]);
  const lifetime = awaitRegistryBackupChild(child, signal);
  const receive = async (stream: ReadableStream<Uint8Array>, limit: number) => {
    try {
      return await readRegistryBytes(stream, limit, 'Fixed backup worker output');
    } catch (cause) {
      interrupted.abort(cause);
      throw cause;
    }
  };
  const send = async () => {
    try {
      // Proof: write-await omission loses the modeled rejected write and reaches only the upstream timeout in registry-backup-worker.test.ts.
      await child.stdin.write(JSON.stringify(input.request) + '\n');
      await child.stdin.flush();
    } catch (cause) {
      interrupted.abort(cause);
      throw cause;
    }
  };
  const complete = async (): Promise<string> => {
    const outcomes = await Promise.allSettled([
      lifetime,
      receive(child.stdout, 16384),
      receive(child.stderr, 65536),
      send(),
    ]);
    for (const outcome of outcomes.slice(1))
      if (outcome.status === 'rejected') throw outcome.reason;
    signal.throwIfAborted();
    const output = outcomes.at(1);
    if (output?.status !== 'fulfilled' || !(output.value instanceof Uint8Array))
      throw new Error('Missing fixed backup worker completion');
    const frame = type({ kind: "'complete'", receipt: '0 < string <= 16000', '+': 'reject' })
      .or({
        kind: "'failed'",
        code: "'backup-budget-unavailable'|'recovery-target-unenrolled'|'effect-failed'",
        '+': 'reject',
      })
      .assert(JSON.parse(Buffer.from(output.value).toString('utf8')));
    if (frame.kind === 'failed') {
      if (frame.code !== 'effect-failed') throw new RegistryMaintenanceRefusal(frame.code);
      throw new Error('Fixed backup worker effect failed');
    }
    const terminal = outcomes.at(0);
    if (terminal?.status !== 'fulfilled')
      throw terminal?.status === 'rejected'
        ? terminal.reason
        : new Error('Missing worker terminal status');
    if (action === 'backup-reconcile') return frame.receipt;
    if (attempt === undefined) throw new Error('Lost backup attempt ownership');
    return JSON.stringify(
      RegistryBackupCompletion.assert({ attemptId: attempt.id, receipt: frame.receipt }),
    );
  };
  let completion: { ok: true; receipt: string } | { ok: false; cause: unknown };
  try {
    completion = { ok: true, receipt: await complete() };
  } catch (cause) {
    completion = { ok: false, cause };
  }
  try {
    // Keep this control pipe open throughout the effect; root death becomes EOF in the independent worker.
    // Proof: close-await omission acknowledges pending/failed closure as success in registry-backup-worker.test.ts.
    await child.stdin.end();
  } catch (cause) {
    if (!completion.ok) {
      // Boundary: preserve both failures in errors and the original worker failure as the direct cause.
      // Proof: aggregate omission drops the original worker/admission failure when closure also fails in registry-backup-worker.test.ts.
      throw new AggregateError(
        [completion.cause, cause],
        'Fixed backup worker and control-pipe cleanup failed',
        // Proof: original-cause omission retains both errors but loses direct primary identity in registry-backup-worker.test.ts.
        // eslint-disable-next-line preserve-caught-error
        { cause: completion.cause },
      );
    }
    throw cause;
  }
  // Proof: primary-refusal omission falsely acknowledges failed write/admission after successful cleanup in registry-backup-worker.test.ts.
  if (!completion.ok) throw completion.cause;
  return completion.receipt;
}
