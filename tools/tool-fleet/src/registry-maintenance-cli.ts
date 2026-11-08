import { randomUUID } from 'node:crypto';

import { type } from 'arktype';

import {
  captureRegistryMaintenanceAlert,
  readRegistryAlertContext,
  reconcileRegistryMaintenanceAlert,
  type RegistryAlertContext,
} from './registry-alert-store';
import { createRegistryAuthorityPorts } from './registry-authority-host';
import {
  completeRegistryRecovery,
  maintainRegistry,
  stageRegistryRecovery,
} from './registry-maintenance';
import { readRegistryMaintenanceInstallation } from './registry-maintenance-installation';
import { createRegistryRecoveryVerifier } from './registry-maintenance-recovery';
import { createRegistryMaintenanceRuntime } from './registry-maintenance-runtime';
import { readRegistryJournalSnapshot } from './registry-managed-journal';
import {
  projectRegistryPressure,
  readRegistryPressureIdentity,
  readRegistryPressureReport,
  registryPressureDirectory,
  type RegistryPressureIdentity,
} from './registry-pressure-report';
import { readRegistryBytes } from './registry-stream';

const Resume = type({
  operationId: '0 < string <= 256',
  kind: "'backup'|'retirement'|'restore'",
  mode: "'retry'|'restore'|'activate'",
  '+': 'reject',
});
/** Operators select only their existing operation/mode. Paths, tokens, owner and privileges remain canonical/installed authority. */
export function parseRegistryMaintenanceResume(input: unknown) {
  return Resume.assert(input);
}

/** Shared no-path CLI for fixed installed UID59001 entrypoints. Failures retain durable operation/fence; the root helper owns privileged cleanup through the kept-open control pipe. */
export async function registryMaintenanceMain(
  action: 'backup' | 'retirement' | 'recover' | 'activate' | 'status',
): Promise<void> {
  if (process.argv.length !== 2)
    throw new Error('Registry maintenance entrypoint accepts no arguments');
  if (process.getuid?.() !== 59001 || process.getgid?.() !== 59001)
    throw new Error('Registry maintenance requires the installed UID/GID59001 authority runner');
  const request =
    action === 'recover' || action === 'activate'
      ? parseRegistryMaintenanceResume(
          JSON.parse(
            new TextDecoder().decode(
              await readRegistryBytes(Bun.stdin.stream(), 4096, 'Maintenance resume request'),
            ),
          ),
        )
      : undefined;
  if (
    request !== undefined &&
    ((action === 'activate') !== (request.mode === 'activate') ||
      (request.mode === 'retry' && request.kind === 'restore'))
  )
    throw new Error('Resume mode does not match fixed maintenance entrypoint');
  const installed = await readRegistryMaintenanceInstallation();
  if (action === 'status') {
    console.log(
      JSON.stringify(
        await collectRegistryMaintenanceStatus({
          directory: installed.journalPath,
          reports: registryPressureDirectory,
          identity: await readRegistryPressureIdentity(installed.machineId),
          now: new Date().toISOString(),
          recoveryTarget: installed.recovery.state,
        }),
      ),
    );
    return;
  }
  const ports = createRegistryAuthorityPorts(installed);
  const runtime = createRegistryMaintenanceRuntime();
  const recovery = createRegistryRecoveryVerifier({
    runtime: runtime.recovery,
    backup: runtime.backup,
    consumers: ports,
  });
  const operationId = request?.operationId ?? randomUUID();
  const kind = request?.kind ?? (action === 'retirement' ? 'retirement' : 'backup');
  const operation = {
    directory: installed.journalPath,
    operationId,
    owner: installed.maintenanceOwner,
    kind,
    ports: { ...ports, ...recovery },
    runtime,
    backup: runtime.backup,
  };
  console.log(
    JSON.stringify({ operationId, owner: installed.maintenanceOwner, kind, status: 'starting' }),
  );
  const alerts = await readRegistryAlertContext();
  await withRegistryMaintenanceAlertCapture(
    { directory: installed.journalPath, context: alerts },
    async () => {
      if (action === 'backup' || action === 'retirement')
        await maintainRegistry({ ...operation, kind: action });
      else if (request?.mode === 'retry' && (kind === 'backup' || kind === 'retirement'))
        await maintainRegistry({ ...operation, kind, recover: true });
      else if (action === 'activate')
        await completeRegistryRecovery({ ...operation, assertDesired: runtime.assertDesired });
      else await stageRegistryRecovery(operation);
    },
  );
  console.log(
    JSON.stringify({
      operationId,
      status:
        action === 'recover' && request?.mode === 'restore'
          ? 'restored-awaiting-activation'
          : 'completed-fenced',
    }),
  );
}

/** Read-only status works while maintenance holds authority. Canonical operations remain fully validated; independent pressure snapshots must bind to this exact semantic revision. Unknown physical/census/completion evidence remains unavailable. */
export async function collectRegistryMaintenanceStatus(input: {
  directory: string;
  reports: string;
  identity: RegistryPressureIdentity;
  now: string;
  recoveryTarget: 'enrolled' | 'unenrolled';
}) {
  const current = await readRegistryJournalSnapshot(input.directory);
  const pressure = projectRegistryPressure(
    current,
    await readRegistryPressureReport(input.reports),
    input.identity,
    input.now,
  );
  const receipt = current.schemaVersion === 4 ? current.lastVerifiedBackup : null;
  const backup =
    current.schemaVersion !== 4
      ? { state: 'unsupported-before-schema4' as const }
      : receipt === null
        ? { state: 'never-verified' as const }
        : {
            state: 'verified' as const,
            snapshotId: receipt.snapshotId,
            registryId: receipt.registryId,
            storageId: receipt.storageId,
            registryPath: receipt.registryPath,
            verifiedAt: receipt.verifiedAt,
            ageSeconds: (Date.parse(input.now) - Date.parse(receipt.verifiedAt)) / 1000,
            lineage:
              receipt.registryId === current.enrollment.registryId &&
              receipt.storageId === current.enrollment.storageId &&
              receipt.registryPath === current.enrollment.registryPath
                ? ('current-store' as const)
                : ('historical-store' as const),
          };
  // Proof: removing this guard accepted a future verified-backup receipt in actual status collection.
  if (backup.state === 'verified' && backup.ageSeconds < 0)
    throw new Error('Backup verification is from the future');
  const status = {
    registryId: current.enrollment.registryId,
    storageId: current.enrollment.storageId,
    registryPath: current.enrollment.registryPath,
    revision: current.revision,
    fenced: current.fenced,
    reason: current.fenceReason,
    operation:
      current.maintenance === null
        ? null
        : {
            operationId: current.maintenance.operationId,
            kind: current.maintenance.kind,
            owner: current.maintenance.owner,
            phase: current.maintenance.phase,
            resumePhase: current.maintenance.resumePhase,
            failure: current.maintenance.failure,
          },
    recoveryTarget: input.recoveryTarget,
    verifiedBackup: receipt?.snapshotId ?? null,
    pressure,
    // The complete canonical parser permits zero or one reservation, each a safe integer; these sums are exact and independent of measured physical usage.
    reservations: {
      count: current.reservations.length,
      bytes: current.reservations.reduce((sum, reservation) => sum + reservation.bytes, 0),
      inodes: current.reservations.reduce((sum, reservation) => sum + reservation.inodes, 0),
      entries: current.reservations,
    },
    protectionObligations: {
      scope: 'explicit-canonical-protections' as const,
      owners: [...new Set(current.protections.map((protection) => protection.owner))].sort(),
    },
    protectedContent: { state: 'unavailable' as const, reason: 'fresh-complete-census-required' },
    eligibleContent: { state: 'unavailable' as const, reason: 'fresh-complete-census-required' },
    backup,
    lastMaintenance: {
      state: 'unavailable' as const,
      reason: 'durable-completion-timestamp-required',
    },
    physicalBackup: { state: 'unavailable' as const, reason: 'physical-admission-closed' },
    delivery: { state: 'unverified' as const },
  };
  // Proof: removing this bound returned a valid oversized canonical obligation list in the actual status test.
  if (Buffer.byteLength(JSON.stringify(status)) > 64 * 1024)
    throw new Error('Registry status exceeds output bound');
  return status;
}

/** Reconcile durable prior failure before retry, and preserve primary failures when capture also fails. No network or privileged effects occur here. */
export async function withRegistryMaintenanceAlertCapture<T>(
  input: { directory: string; context: RegistryAlertContext; now?: () => string },
  run: () => Promise<T>,
): Promise<T> {
  // Proof: R5[mandatory-pre-retry-capture] omitting capture made the actual retry callback observe zero prior incidents; observed by "common ordinary maintenance boundary".
  await reconcileRegistryMaintenanceAlert(input.context, input.directory);
  try {
    return await run();
  } catch (cause) {
    try {
      if (!(await reconcileRegistryMaintenanceAlert(input.context, input.directory)))
        await captureRegistryMaintenanceAlert(input.context, {
          revision: 0,
          kind: 'launcher',
          operationId: 'ordinary-maintenance-launcher',
          at: (input.now ?? (() => new Date().toISOString()))(),
          owners: [],
        });
    } catch (capture) {
      throw new AggregateError([cause, capture], 'Registry maintenance and alert capture failed', {
        cause: capture,
      });
    }
    throw cause;
  }
}
