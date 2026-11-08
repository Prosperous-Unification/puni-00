import { readFile, writeFile } from 'node:fs/promises';

import { executeRegistryHostAction } from './registry-maintenance-actions';

/**
 * Deliberately retain the selected full-volume backup's fence after its matching pair has
 * verified. The real root supervisor has already admitted restore-service under the inherited
 * canonical descriptor and current owner/phase. This fixed lower-effect action freshly checks
 * stopped state using that same descriptor/journal, then records a separate controlled failure
 * before any restore patches. It is neither ENOSPC corruption nor complete restore-service
 * validation. Bootstrap and recovery actions are not selected by this wrapper.
 */
export async function retainRegistryPressureFence(
  input: Parameters<typeof executeRegistryHostAction>[0],
): Promise<string> {
  // Proof (modeled caller): omission reaches stop/report for wrong root UID, PID1 mode and requested action.
  if (
    process.getuid?.() !== 0 ||
    input.request.action !== 'restore-service' ||
    input.request.operationId !== 'native-volume-backup' ||
    (await readFile('/proc/1/cmdline', 'utf8')) !==
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0'
  )
    throw new Error('Pressure handoff requires exact selected root action');
  const { journal } = input;
  const evidence = journal.maintenanceEvidence;
  // Proof (modeled caller): compound omission reaches stop/report for wrong phase, kind, fence, matching backup, census or storage.
  if (
    !journal.fenced ||
    journal.maintenance?.operationId !== input.request.operationId ||
    journal.maintenance.kind !== 'backup' ||
    journal.maintenance.phase !== 'verified' ||
    evidence?.operationId !== input.request.operationId ||
    evidence.backupCensusSha256 !== evidence.backup?.censusSha256 ||
    JSON.stringify(journal.lastVerifiedBackup) !== JSON.stringify(evidence.backup) ||
    evidence.backup.registryId !== journal.enrollment.registryId ||
    evidence.backup.storageId !== journal.enrollment.storageId ||
    evidence.backup.registryPath !== journal.enrollment.registryPath ||
    evidence.backup.journalPath !== input.installed.journalPath
  )
    throw new Error('Pressure handoff lacks current matching verified backup');
  // Proof (modeled action): substituting verified loses fresh stop and hides its refusal; changing the fixed action fails exact inherited-argument forwarding.
  const stopped = await executeRegistryHostAction({
    ...input,
    request: { ...input.request, action: 'assert-stopped' },
  });
  // Proof (modeled action): omission reports selected failure after an unconfirmed stop receipt.
  if (stopped !== 'verified') throw new Error('Pressure handoff writer exclusion is unconfirmed');
  const failure = new Error('Controlled pressure handoff before serving');
  try {
    // Proof (modeled receipt): omission loses the fixed report and hides its injected write failure.
    await writeFile(
      '/root/task8-fixture/pressure-handoff.json',
      JSON.stringify({
        scope: 'controlled-pre-serving-after-verified-backup',
        operationId: input.request.operationId,
        snapshotId: evidence.backup.snapshotId,
        journalSha256: evidence.backup.journalSha256,
        writerExclusion: 'verified',
      }),
      { mode: 0o600, flag: 'wx' },
    );
  } catch (cause) {
    // Proof (cause membership): separate omissions lose intended refusal or reporter in errors; the primary cause property remains.
    throw new AggregateError([failure, cause], 'Controlled pressure handoff receipt failed', {
      // Boundary: the caught reporter error stays in errors; the intended controlled refusal remains primary.
      // eslint-disable-next-line preserve-caught-error
      cause: failure,
    });
  }
  // Proof (modeled caller): returning verified instead falsely completes this controlled second-fault stage.
  throw failure;
}
