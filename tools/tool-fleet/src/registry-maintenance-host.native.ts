import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';

import { dlopen } from 'bun:ffi';

import { createRegistryAuthorityPorts } from './registry-authority-host';
import { admitRegistryBackup } from './registry-backup-admission';
import { findRegistryBackupStage } from './registry-backup-diagnostics';
import {
  contendRegistryBackup,
  interruptRegistryBackup,
  proveRegistryBackupInterruption,
  type RegistryBackupInterruption,
} from './registry-backup-interruption.native';
import { createRegistryLocalLockVersions } from './registry-backup-local.fixture';
import { openRegistryBackupVersions } from './registry-backup-provider';
import { observeRegistryBackupTerminal } from './registry-backup-terminal.fixture';
import { runRegistryBackupWorkerMain } from './registry-backup-worker-cli';
import { interruptRegistryCollectionFixture } from './registry-collection-interruption.fixture';
import {
  describeRegistryDeletionFailure,
  protectRegistryDeletionFixture,
  publishRegistryDeletionFixture,
  requireRegistryPartialCensus,
} from './registry-deletion.fixture';
import {
  collectRegistryUnsafeFixture,
  describeRegistryTagFailure,
  failRegistryTagCleanupFixture,
} from './registry-deletion-fault.fixture';
import { proveRegistryDockerPull } from './registry-docker-pull.native';
import { describeRegistryGuardObservationFailure } from './registry-guard-observation.fixture';
import { startRegistryHttpObservation } from './registry-http-observation.fixture';
import type { RegistryIndexPublication } from './registry-index-authority.fixture';
import {
  promoteRegistryIndexFixture,
  publishRegistryIndexFixture,
} from './registry-index-authority.fixture';
import { parseRegistryPressureAllocation } from './registry-inode-pressure.fixture';
import { collectRegistryInventory, type RegistryInventoryIdentity } from './registry-inventory';
import { maintainRegistry, stageRegistryRecovery } from './registry-maintenance';
import { executeRegistryHostAction } from './registry-maintenance-actions';
import type { RegistryBackupAdmissionPort } from './registry-maintenance-backup';
import { acceptMaintenanceChannel } from './registry-maintenance-channel';
import {
  createRegistryFixtureClock,
  proveRegistryUploadGrace,
  readRegistryFixtureRetirementClock,
} from './registry-maintenance-clock.fixture';
import { proveRegistryCollectionAdmission } from './registry-maintenance-collection.fixture';
import {
  RegistryMaintenanceCancellation,
  superviseRegistryMaintenance,
} from './registry-maintenance-control';
import { proveRegistryDeletionHost } from './registry-maintenance-deletion.native';
import { RegistryMaintenanceRefusal } from './registry-maintenance-failure';
import { proveRegistryRetentionHost } from './registry-maintenance-history.native';
import { prepareRegistryHostFixture } from './registry-maintenance-host.fixture';
import { proveRegistryIndexHost } from './registry-maintenance-index.native';
import { readRegistryMaintenanceInstallation } from './registry-maintenance-installation';
import { provePopulatedRegistryHost } from './registry-maintenance-populated.native';
import { proveRegistryPressureHost } from './registry-maintenance-pressure.native';
import { installMaintenanceReaper } from './registry-maintenance-process';
import { populateRegistryHostFixture } from './registry-maintenance-publication.fixture';
import { createRegistryRecoveryVerifier } from './registry-maintenance-recovery';
import { createRegistryMaintenanceRuntime } from './registry-maintenance-runtime';
import {
  proveRegistrySharedHost,
  selectRegistrySharedRetirement,
} from './registry-maintenance-shared.native';
import { RegistryRecoveryPreparation } from './registry-maintenance-state';
import {
  executeRegistryCommand,
  parseRegistryCommandResponse,
  runRegistryMaintenance,
} from './registry-managed-journal';
import { proveRegistryPermitGuard } from './registry-permit-guard.native';
import {
  describeRegistryPopulationFailure,
  type RegistryPopulationOwnerBoundary,
} from './registry-population-diagnostics.fixture';
import { withRegistryPopulationScratch } from './registry-population-scratch.fixture';
import { proveRegistryPressureAcknowledgement } from './registry-pressure-ack.fixture';
import { retainRegistryPressureFence } from './registry-pressure-handoff.fixture';
import { interruptRegistryRestoreFixture } from './registry-restore-interruption.fixture';
import {
  promoteRegistryRetentionFixture,
  requireRegistryPromotedHistoryInventory,
} from './registry-retention-history.fixture';
import { runRegistryServingCli } from './registry-serving-cli.fixture';
import { proveRegistryServingHost } from './registry-serving-host.native';
import {
  protectRegistrySharedFixture,
  publishRegistrySharedFixture,
  releaseRegistrySharedFixture,
} from './registry-shared-root.fixture';
import { proveRegistryUploadPressureHost } from './registry-upload-host.native';
import { publishRegistryPressureUpload } from './registry-upload-pressure.fixture';

const home = '/root/task8-fixture';
const directory = '/var/lib/puni-registry/journal/contents';
const bundle = '/usr/local/libexec/puni-registry-maintenance/proof.js';
const backupFaultModes = new Map<string, RegistryBackupInterruption>([
  ['prove-backup-owner-eof', 'owner-eof'],
  ['prove-backup-guardian-eof', 'guardian-eof'],
  ['prove-backup-deadline', 'deadline'],
]);

/** Only exact fixed PID1 fixture entrypoints use direct maintenance actions; no caller-selected path or suffix is accepted. */
// Proof (modeled caller): removing either exact interruption mode loses direct dispatch in registry-interruption-routes.test.ts.
export function usesRegistryDirectFixtureActions(commandLine: string): boolean {
  // Proof (fixture): removing either exact history/shared argv alternative fails its direct-dispatch caller test; arbitrary suffix/path inputs still refuse.
  // Proof (modeled lifecycle): removing the exact pressure alternative loses its required direct action route.
  return (
    commandLine ===
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0' ||
    // Proof (serving): exact direct-mode removal fails serving direct-action routing; suffixes remain refused.
    commandLine ===
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-serving\0' ||
    commandLine ===
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-index\0' ||
    commandLine ===
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-history\0' ||
    commandLine ===
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-shared\0' ||
    commandLine ===
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-unsafe-gc\0' ||
    commandLine ===
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-tag-cleanup\0' ||
    commandLine ===
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-tag-recovery\0' ||
    commandLine ===
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-gc-kill\0' ||
    commandLine ===
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-restore-kill\0'
  );
}

/** Actual root dispatcher with explicit fixture collection negatives and discard-only clock acceleration after real-time grace refusal; the mandatory Task9 provider admission is substituted only after its real refusal was witnessed. */
async function rootHelper() {
  if (process.getuid?.() !== 0 || process.getgid?.() !== 0 || process.argv.length !== 2)
    throw new Error('Wrong fixture root entrypoint');
  const installed = await readRegistryMaintenanceInstallation();
  installMaintenanceReaper();
  const channel = await acceptMaintenanceChannel(installed.journalPath, 59001);
  try {
    const receipt = await superviseRegistryMaintenance({
      directory,
      uid: 59001,
      descriptor: channel.descriptor,
      input: channel.input,
      deadlineMs: 120000,
      execute: async (request, signal, journal) => {
        await appendFile(home + '/actions.log', request.action + ':entered\n', { mode: 0o600 });
        const fixtureCommand = await readFile('/proc/1/cmdline', 'utf8');
        const isDirectFixture = usesRegistryDirectFixtureActions(fixtureCommand);
        // Proof (modeled caller): removing either exact interruption dispatch loses GC capture or the required tag prelude in registry-interruption-routes.test.ts; GC admission remains in the real action.
        // Proof (modeled lifecycle): separate mode/action/operation omissions select pressure handoff for foreign or bootstrap requests.
        const dispatch =
          fixtureCommand ===
            '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0' &&
          request.action === 'restore-service' &&
          request.operationId === 'native-volume-backup'
            ? retainRegistryPressureFence
            : fixtureCommand ===
                  '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-gc-kill\0' &&
                request.action === 'collect'
              ? interruptRegistryCollectionFixture
              : fixtureCommand ===
                    '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-unsafe-gc\0' &&
                  request.action === 'collect'
                ? collectRegistryUnsafeFixture
                : (fixtureCommand ===
                      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-tag-cleanup\0' ||
                      fixtureCommand ===
                        '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-tag-recovery\0' ||
                      fixtureCommand ===
                        '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-restore-kill\0') &&
                    request.action === 'serve-deletion'
                  ? failRegistryTagCleanupFixture
                  : isDirectFixture
                    ? executeRegistryHostAction
                    : request.action === 'collect'
                      ? proveRegistryCollectionAdmission
                      : request.action === 'discard-uploads'
                        ? proveRegistryUploadGrace
                        : executeRegistryHostAction;
        const receipt = await dispatch({
          installed,
          request,
          signal,
          journal,
          descriptor: channel.descriptor,
          ready: (receipt) => channel.frame('ready', receipt),
        }).catch(async (cause: unknown) => {
          // Capture the action's signal before supervisor reader finalization can model EOF.
          const rootDeadline =
            signal.aborted &&
            signal.reason instanceof Error &&
            signal.reason.message === 'Root maintenance deadline exceeded';
          const ownerCancellation =
            signal.aborted && signal.reason instanceof RegistryMaintenanceCancellation;
          try {
            // Proof (fixture export): omitted delivery loses the classified tag record; formatter/writer failures below preserve the original refusal.
            const tagCleanup = describeRegistryTagFailure(cause);
            await appendFile(
              home + '/failure.log',
              JSON.stringify({
                action: request.action,
                ...(tagCleanup === null ? {} : { tagCleanup }),
                ownSignalAborted: signal.aborted,
                rootDeadline,
                ownerCancellation,
                other: !rootDeadline && !ownerCancellation,
              }) + '\n',
              { mode: 0o600 },
            );
          } catch (diagnosticFailure) {
            // Proof: replacing this aggregate with the reporter error loses the original root failure in both failure cases.
            throw new AggregateError(
              [cause, diagnosticFailure],
              'Root failure diagnostic could not be recorded',
              { cause: diagnosticFailure },
            );
          }
          throw cause;
        });
        await appendFile(home + '/actions.log', request.action + ':completed\n', { mode: 0o600 });
        return receipt;
      },
    });
    await channel.frame('complete', receipt);
  } catch (cause) {
    if (cause instanceof RegistryMaintenanceCancellation)
      await channel.frame('cancelled', 'owned-effects-terminated');
    else {
      await channel.frame(
        'failed',
        cause instanceof RegistryMaintenanceRefusal ? cause.code : 'effect-failed',
      );
      throw cause;
    }
  } finally {
    channel.close();
  }
}

/** Actual fixed worker; only raw local provider versions/accounting replace Task9's unavailable S3 ports. */
async function backupWorker() {
  const mode = await readFile(home + '/admission', 'utf8');
  if (!['production', 'fixture'].includes(mode)) throw new Error('Unknown fixture admission mode');
  await mkdir(home + '/workers', { recursive: true, mode: 0o700 });
  const fields = (await readFile('/proc/self/stat', 'utf8'))
    .split(') ')
    .at(-1)
    ?.trim()
    .split(/\s+/);
  const startTicks = fields?.[19];
  if (startTicks === undefined || !/^[1-9][0-9]*$/.test(startTicks))
    throw new Error('Missing native worker start identity');
  const marker = home + '/workers/' + String(process.pid);
  await writeFile(
    marker + '.pending',
    JSON.stringify({ pid: process.pid, parent: process.ppid, startTicks }),
    { mode: 0o600, flag: 'wx' },
  );
  await rename(marker + '.pending', marker + '.json');
  let observesRestore = false;
  try {
    let admitted: Parameters<RegistryBackupAdmissionPort>[1] | undefined;
    const execute = () =>
      runRegistryBackupWorkerMain(
        async (request, authority) => {
          await writeFile(
            home + '/admission-observed',
            mode === 'production' ? 'production-admission' : 'fixture-local-provider',
            { mode: 0o600 },
          );
          if (mode === 'production') await admitRegistryBackup(request, authority);
          // Proof (modeled worker): omitting this assignment loses the actual admission callback lineage in registry-restore-worker.test.ts.
          admitted = authority;
        },
        mode === 'production'
          ? openRegistryBackupVersions
          : async (configuration, authority) => {
              if (configuration.environment.RESTIC_REPOSITORY !== home + '/repository')
                throw new Error('Foreign fixture repository');
              return createRegistryLocalLockVersions({
                repository: home + '/repository',
                journalPath: directory,
                descriptor: authority.authorityDescriptor,
                authorityUid: 59001,
                repositoryUid: 0,
              });
            },
      );
    const commandLine = await readFile('/proc/1/cmdline', 'utf8');
    const observed = [...backupFaultModes.keys()].some(
      (mode) => commandLine === process.execPath + '\0' + bundle + '\0' + mode + '\0',
    );
    observesRestore = commandLine === process.execPath + '\0' + bundle + '\0prove-restore-kill\0';
    // Proof (modeled worker): removing this exact restore route loses capture; ordinary and suffixed modes remain outside it in registry-restore-worker.test.ts.
    const receipt = observesRestore
      ? await interruptRegistryRestoreFixture({
          run: execute,
          current: () => {
            const journal = admitted?.journal;
            const owned = journal?.maintenance;
            const backup = journal?.maintenanceEvidence?.backup;
            const recovery = journal?.maintenanceEvidence?.recovery;
            // Proof (diagnostic only): registry-restore-worker.test.ts observes this fixed refusal becoming TypeError when removed; downstream access still fails closed, so this is not independent safety enforcement.
            if (owned == null || backup == null || recovery == null)
              throw new Error('Restore fault requires admitted canonical recovery lineage');
            // Proof (modeled worker): removing preparation validation exposes undefined target fields to capture in registry-restore-worker.test.ts.
            const prepared = RegistryRecoveryPreparation.assert(JSON.parse(recovery));
            return {
              operationId: owned.operationId,
              snapshotId: backup.snapshotId,
              registryPath: backup.registryPath,
              journalPath: backup.journalPath,
              targetRegistryPath: prepared.registryPath,
              targetJournalPath: prepared.stagedJournalPath,
            };
          },
        })
      : observed
        ? await observeRegistryBackupTerminal(execute)
        : await execute();
    console.log(JSON.stringify({ kind: 'complete', receipt }));
  } catch (cause) {
    if (observesRestore) {
      try {
        await writeFile(
          // Proof (modeled worker): omitting delivery loses the required bounded diagnostic in registry-restore-worker.test.ts.
          home + '/restore-worker-failure.json',
          JSON.stringify({
            worker: process.pid,
            observation:
              'task8-population-diagnostic:' +
              JSON.stringify(describeRegistryPopulationFailure('retained', cause)) +
              '\n',
          }),
          { mode: 0o600, flag: 'wx' },
        );
      } catch (observation) {
        // Boundary: preserve the original worker failure as cause and the reporter failure in AggregateError.errors.
        throw new AggregateError(
          [cause, observation],
          // Proof (cause retention): replacing this aggregate with the reporter error loses the original worker failure in registry-restore-worker.test.ts.
          'Restore worker failure observation failed',
          // eslint-disable-next-line preserve-caught-error
          { cause },
        );
      }
    }
    // Fixed diagnostic metadata only: no message, stack, request, provider bytes or canonical state.
    await appendFile(
      home + '/backup-diagnostics.log',
      JSON.stringify({
        stage: findRegistryBackupStage(cause),
        schemaFailure: cause instanceof Error && cause.name === 'TraversalError',
      }) + '\n',
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        kind: 'failed',
        code: cause instanceof RegistryMaintenanceRefusal ? cause.code : 'effect-failed',
      }),
    );
    process.exitCode = 1;
  }
}

let populationBoundary: RegistryPopulationOwnerBoundary = 'identity';

/** Owner uses actual physical authority/reader ports and installed root transport. Fixed pressure backup starts one fresh backup operation; its recovery reuses that operation and the production recovery verifier. The pressure, population and final retirement paths retain the original operation failure when required observations fail. Final retirement also retains both reporter failures. Modeled caller proofs do not certify native retirement or recovery. */
export async function owner(mode: string) {
  if (process.getuid?.() !== 59001 || process.getgid?.() !== 59001)
    throw new Error('Wrong fixture owner');
  populationBoundary = 'installation';
  const installed = await readRegistryMaintenanceInstallation();
  // Proof (modeled owner): exact-mode omission invokes the allocator for a suffix; allocator omission falsely succeeds and loses its receipt; return omission reaches ordinary owner work.
  if (mode === 'pressure-ack') {
    console.log(JSON.stringify(await proveRegistryPressureAcknowledgement(installed)));
    return;
  }
  populationBoundary = 'ports';
  const ports = createRegistryAuthorityPorts(installed);
  populationBoundary = 'clock';
  if (['initialize-past', 'backup-past', 'reopen-populate'].includes(mode)) {
    const historical = (await readFile('/etc/puni/registry-fixture-clock', 'utf8')).trim();
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(historical) ||
      !Number.isFinite(Date.parse(historical))
    )
      throw new Error('Invalid declared fixture historical clock');
    ports.now = () => historical;
  }
  if (
    [
      'retire',
      'deletion-retire',
      'deletion-census',
      'deletion-recover',
      'shared-retire-first',
      'shared-retire-second',
      'shared-release',
    ].includes(mode)
  )
    ports.now = createRegistryFixtureClock(await readRegistryFixtureRetirementClock());
  // Proof (fixture caller): substituting the first operation ID for the second fails the actual mode-selector test.
  const interruptionOperation =
    mode === 'backup-interruption' ? 'native-interrupted-backup' : undefined;
  if (interruptionOperation !== undefined) mode = 'backup';
  if (mode === 'backup-contender-probe' || mode === 'backup-contender-acquire') {
    await contendRegistryBackup(mode === 'backup-contender-probe' ? 'probe' : 'acquire', ports);
    return;
  }
  const sharedRetirement = selectRegistrySharedRetirement(mode);
  if (sharedRetirement !== undefined) mode = 'retire';
  const isDeletionRetirement = mode === 'deletion-retire';
  if (isDeletionRetirement) mode = 'retire';
  const isHistoryRetirement = mode === 'history-retire';
  if (isHistoryRetirement) mode = 'retire';
  if (mode === 'initialize-past') mode = 'initialize';
  if (mode === 'backup-past') mode = 'backup';
  if (mode === 'reopen-populate' || mode === 'index-reopen') {
    const state = (await executeRegistryCommand(directory, { command: 'read' }, ports)).state;
    await executeRegistryCommand(
      directory,
      {
        command: 'reopen',
        expectedRevision: state.revision,
        operationId: 'native-population-reopen',
        owner: 'operator',
      },
      ports,
    );
    console.log('population-writable-permitted');
    return;
  }
  const sharedRelease = new Map<string, 'old-one' | 'old-two' | 'current'>([
    ['shared-publish-old-one', 'old-one'],
    ['shared-publish-old-two', 'old-two'],
    ['shared-publish-current', 'current'],
  ]).get(mode);
  if (sharedRelease !== undefined) {
    const http = startRegistryHttpObservation();
    const publication = await publishRegistrySharedFixture(sharedRelease, installed, ports).then(
      (receipt) => ({ ok: true as const, receipt }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );
    try {
      console.error('task8-population-http:' + JSON.stringify(http.finish()));
    } catch (cause) {
      throw new AggregateError(
        [...(publication.ok ? [] : [publication.cause]), cause],
        'Required shared HTTP observation failed',
        { cause: cause },
      );
    }
    if (!publication.ok) throw publication.cause;
    console.log(JSON.stringify(publication.receipt));
    return;
  }
  if (mode === 'shared-protect') {
    await protectRegistrySharedFixture(ports);
    console.log('shared-current-promoted-and-root-protected');
    return;
  }
  if (mode === 'shared-release') {
    await releaseRegistrySharedFixture(ports);
    console.log('shared-root-protection-released');
    return;
  }
  // Proof: extracted actual caller loses publication error when observation also fails if aggregate cause is removed.
  if (mode === 'deletion-publish-expired' || mode === 'deletion-publish-protected') {
    const http = startRegistryHttpObservation();
    const publication = await publishRegistryDeletionFixture(
      mode === 'deletion-publish-expired' ? 'expired' : 'protected',
      installed,
      ports,
    ).then(
      (receipt) => ({ ok: true as const, receipt }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );
    try {
      console.error('task8-population-http:' + JSON.stringify(http.finish()));
    } catch (cause) {
      throw new AggregateError(
        [...(publication.ok ? [] : [publication.cause]), cause],
        'Required deletion HTTP observation failed',
        { cause: cause },
      );
    }
    if (!publication.ok) throw publication.cause;
    console.log(JSON.stringify(publication.receipt));
    return;
  }
  if (mode === 'pressure-upload') {
    await withRegistryPopulationScratch(
      (scratch) =>
        publishRegistryPressureUpload({
          directory: scratch,
          journalPath: installed.journalPath,
          registryId: installed.registryId,
          endpoint: { url: 'http://127.0.0.1:5052' },
          ports,
        }),
      (cause) => {
        console.error(
          'task8-population-diagnostic:' +
            JSON.stringify(describeRegistryPopulationFailure('partial', cause)),
        );
      },
    );
    console.log('pressure-upload-completed');
    return;
  }
  if (mode === 'deletion-protect') {
    await protectRegistryDeletionFixture(installed, ports);
    console.log('index-explicitly-protected');
    return;
  }
  const indexRevision = new Map<string, 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14>(
    [
      ['index-publish-1', 1],
      ['index-publish-2', 2],
      ['index-publish-3', 3],
      ['index-publish-4', 4],
      ['index-publish-5', 5],
      ['index-publish-6', 6],
      ['index-publish-7', 7],
      ['index-publish-8', 8],
      ['index-publish-9', 9],
      ['index-publish-10', 10],
      ['index-publish-11', 11],
      ['index-publish-12', 12],
      ['index-publish-13', 13],
      ['index-publish-14', 14],
    ],
  ).get(mode);
  if (indexRevision !== undefined) {
    const http = startRegistryHttpObservation();
    const publication = await publishRegistryIndexFixture(indexRevision, installed, ports).then(
      (receipt) => ({ ok: true as const, receipt }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );
    try {
      console.error('task8-population-http:' + JSON.stringify(http.finish()));
    } catch (cause) {
      throw new AggregateError(
        [...(publication.ok ? [] : [publication.cause]), cause],
        'Required index HTTP observation failed',
        { cause: cause },
      );
    }
    if (!publication.ok) throw publication.cause;
    console.log(JSON.stringify(publication.receipt));
    return;
  }
  const historyRevision = new Map<string, (typeof RegistryIndexPublication.infer)['revision']>([
    ['history-promote-1', 1],
    ['history-promote-2', 2],
    ['history-promote-3', 3],
    ['history-promote-4', 4],
    ['history-promote-5', 5],
    ['history-promote-6', 6],
    ['history-promote-7', 7],
    ['history-promote-8', 8],
    ['history-promote-9', 9],
    ['history-promote-10', 10],
    ['history-promote-11', 11],
    ['history-promote-12', 12],
    ['history-promote-13', 13],
    ['history-promote-14', 14],
  ]).get(mode);
  if (historyRevision !== undefined) {
    await promoteRegistryRetentionFixture(historyRevision, ports);
    console.log('history-promoted');
    return;
  }
  const promotionRevision = new Map<string, 2 | 3 | 4>([
    ['index-promote-2', 2],
    ['index-promote-3', 3],
    ['index-promote-4', 4],
  ]).get(mode);
  if (promotionRevision !== undefined) {
    await promoteRegistryIndexFixture(promotionRevision, ports);
    console.log('index-promoted');
    return;
  }
  if (mode === 'populate') {
    populationBoundary = 'publication';
    const http = startRegistryHttpObservation();
    let completed: { ok: true } | { ok: false; cause: unknown };
    try {
      const population = await populateRegistryHostFixture(installed, ports);
      // Proof: HOST67 caught the last abandoned-publication request ahead of its ACK; omission or missing await fails the actual-owner confirmation/delayed-confirmation cases.
      await executeRegistryCommand(directory, { command: 'check-capacity' }, ports);
      console.log(JSON.stringify(population));
      completed = { ok: true };
    } catch (cause) {
      completed = { ok: false, cause };
    }
    // Proof (modeled owner): omission skips required HTTP observation after publication/output failure in registry-pressure-lifecycle.test.ts.
    let observation: { ok: true } | { ok: false; cause: unknown };
    try {
      console.error('task8-population-http:' + JSON.stringify(http.finish()));
      observation = { ok: true };
    } catch (cause) {
      observation = { ok: false, cause };
    }
    // Proof (modeled owner): accepting/skipping failed observation returns success; member/cause omissions lose the publication or observer failure.
    if (!observation.ok) {
      if (!completed.ok)
        throw new AggregateError(
          [completed.cause, observation.cause],
          'Population owner observation failed',
          {
            cause: completed.cause,
          },
        );
      throw observation.cause;
    }
    // Proof (modeled owner): omission returns success after publication/output failure with a healthy observer.
    if (!completed.ok) throw completed.cause;
    return;
  }
  if (mode === 'initialize') {
    const boot = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
    await writeFile(installed.ordinary.path + '/.authority-instance', `${randomUUID()} ${boot}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    await mkdir(installed.ordinary.path + '/docker/registry/v2/repositories', { recursive: true });
    await mkdir(installed.ordinary.path + '/docker/registry/v2/blobs/sha256', { recursive: true });
    await executeRegistryCommand(
      directory,
      {
        command: 'initialize',
        enrollment: {
          registryId: installed.registryId,
          storageId: installed.ordinary.storageId,
          registryPath: installed.ordinary.path,
          rootPath: '/',
          maximumBytes: installed.ordinary.maximumBytes,
          journalMaximumBytes: installed.journalMaximumBytes,
          owners: ['operator'],
        },
      },
      ports,
    );
    await executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports);
    const current = (await executeRegistryCommand(directory, { command: 'read' }, ports)).state;
    // The trusted fixture universe is produced by root setup, then validated by the production enrollment command.
    const universe: unknown = JSON.parse(
      await readFile('/etc/puni/registry-consumers.json', 'utf8'),
    );
    const { type } = await import('arktype');
    const sources = type({ sources: 'unknown[]' }).assert(universe).sources;
    await executeRegistryCommand(
      directory,
      {
        command: 'enroll-consumers',
        expectedRevision: current.revision,
        owner: 'operator',
        operationId: 'fixture-enroll',
        sources,
      },
      ports,
    );
    console.log('initialized');
    return;
  }
  if (mode === 'secret-refusal') {
    for (const path of [
      '/root/.puni/registry/restic.password',
      '/root/.puni/registry/backup.json',
    ]) {
      try {
        await readFile(path);
        throw new Error('Provider credential became readable by authority UID');
      } catch (cause) {
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'EACCES')) throw cause;
      }
    }
    console.log('root-secrets-unreadable');
    return;
  }
  // Proof (modeled lifecycle): changed backup operation/recover flag and omitted recovery verifier fail exact admitted argument assertions.
  if (mode === 'pressure-backup' || mode === 'pressure-recover') {
    const runtime = createRegistryMaintenanceRuntime();
    const http = startRegistryHttpObservation();
    const completed = await (
      mode === 'pressure-backup'
        ? maintainRegistry({
            directory,
            operationId: 'native-volume-backup',
            owner: 'operator',
            kind: 'backup',
            recover: false,
            ports,
            runtime,
            backup: runtime.backup,
          })
        : stageRegistryRecovery({
            directory,
            operationId: 'native-volume-backup',
            owner: 'operator',
            kind: 'backup',
            ports: {
              ...ports,
              ...createRegistryRecoveryVerifier({
                runtime: runtime.recovery,
                backup: runtime.backup,
                consumers: ports,
              }),
            },
            runtime,
            backup: runtime.backup,
          })
    ).then(
      () => ({ ok: true as const }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );
    try {
      // Proof (modeled lifecycle): omission hides the required observation failure.
      console.error('task8-population-http:' + JSON.stringify(http.finish()));
    } catch (cause) {
      if (!completed.ok)
        // Proof (modeled lifecycle): separate array omissions lose original or reporter membership; primary cause property remains.
        throw new AggregateError([completed.cause, cause], 'Pressure owner observation failed', {
          // Boundary: reporter failure remains in errors; the original operation failure stays primary.
          // eslint-disable-next-line preserve-caught-error
          cause: completed.cause,
        });
      throw cause;
    }
    // Proof (modeled lifecycle): omission returns success after an operation refusal.
    if (!completed.ok) throw completed.cause;
    console.log(
      mode === 'pressure-backup' ? 'pressure-backup-returned' : 'pressure-recovery-staged-fenced',
    );
    // Proof (modeled lifecycle): omission reaches unrelated owner work and loses successful fixed completion.
    return;
  }
  // Proof (fixture): changing recover:true prevents the exact held-session callback; observation-preservation removal loses its original failure.
  if (mode === 'deletion-census' || mode === 'deletion-recover') {
    const runtime = createRegistryMaintenanceRuntime();
    const http = startRegistryHttpObservation();
    const operation = (
      mode === 'deletion-census'
        ? runRegistryMaintenance(
            directory,
            {
              operationId: 'native-host-retire',
              owner: 'operator',
              kind: 'retirement',
              recover: true,
            },
            ports,
            (session) => requireRegistryPartialCensus({ session, runtime, ports }),
          )
        : stageRegistryRecovery({
            directory,
            operationId: 'native-host-retire',
            owner: 'operator',
            kind: 'retirement',
            ports: {
              ...ports,
              ...createRegistryRecoveryVerifier({
                runtime: runtime.recovery,
                backup: runtime.backup,
                consumers: ports,
              }),
            },
            runtime,
            backup: runtime.backup,
          })
    ).then(
      () => ({ ok: true as const }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );
    const completed = await operation;
    try {
      console.error('task8-population-http:' + JSON.stringify(http.finish()));
    } catch (cause) {
      if (!completed.ok)
        // Boundary: the original owner failure is primary; the caught observer failure remains in errors[1].
        throw new AggregateError([completed.cause, cause], 'Partial owner observation failed', {
          // eslint-disable-next-line preserve-caught-error
          cause: completed.cause,
        });
      throw cause;
    }
    if (!completed.ok) throw completed.cause;
    console.log(
      mode === 'deletion-recover' ? 'partial-recovery-staged-fenced' : 'partial-census-returned',
    );
    return;
  }
  if (!['backup', 'retire'].includes(mode)) throw new Error('Unknown fixture owner mode');
  const kind = mode === 'retire' ? 'retirement' : 'backup';
  const current = (await executeRegistryCommand(directory, { command: 'read' }, ports)).state;
  const runtime = createRegistryMaintenanceRuntime();
  // Boundary: The runtime.open callback records history census during awaited maintenance.
  let historyCensusChecked = false as boolean;
  if (isHistoryRetirement) {
    let identity: RegistryInventoryIdentity | undefined;
    const identify = runtime.identify;
    const open = runtime.open;
    runtime.identify = async (session) => {
      identity = await identify(session);
      return identity;
    };
    runtime.open = async (session, mode) => {
      const server = await open(session, mode);
      if (!historyCensusChecked) {
        try {
          if (mode !== 'readonly' || identity === undefined)
            throw new Error('History pre-effect census lacks fresh stopped identity');
          const inventory = await collectRegistryInventory({
            journal: session.read(),
            identity,
            endpoint: server.endpoint,
            consumers: ports,
          });
          requireRegistryPromotedHistoryInventory(inventory);
          historyCensusChecked = true;
          console.error('task8-history-census:all-promoted-no-staging');
        } catch (cause) {
          await server.close();
          throw cause;
        }
      }
      return server;
    };
  }
  const deletionHttp = isDeletionRetirement ? startRegistryHttpObservation() : undefined;
  let completed: { ok: true } | { ok: false; cause: unknown };
  try {
    await maintainRegistry({
      directory,
      operationId:
        current.maintenance?.operationId ??
        interruptionOperation ??
        sharedRetirement ??
        (kind === 'retirement' ? 'native-host-retire' : 'native-host-backup'),
      owner: 'operator',
      kind,
      recover: current.maintenance !== null,
      ports,
      runtime,
      backup: runtime.backup,
    });
    completed = { ok: true };
  } catch (cause) {
    completed = { ok: false, cause };
  }
  const observationFailures: unknown[] = [];
  // Proof (modeled owner): skipping this report or its collector loses the expected report/failure in registry-pressure-lifecycle.test.ts.
  if (!completed.ok && isDeletionRetirement) {
    try {
      console.error('task8-deletion-retained:' + describeRegistryDeletionFailure(completed.cause));
    } catch (cause) {
      observationFailures.push(cause);
    }
  }
  // Proof (modeled owner): skipping HTTP observation or its collector loses required cleanup/failure evidence even after reporter failure.
  if (deletionHttp !== undefined) {
    try {
      console.error('task8-population-http:' + JSON.stringify(deletionHttp.finish()));
    } catch (cause) {
      observationFailures.push(cause);
    }
  }
  // Proof (modeled owner): omitting this refusal or either throw accepts failed observation/maintenance; member and primary-cause omissions lose their exact original errors.
  if (observationFailures.length > 0) {
    if (!completed.ok)
      throw new AggregateError(
        [completed.cause, ...observationFailures],
        'Deletion maintenance observation failed',
        { cause: completed.cause },
      );
    throw observationFailures[0];
  }
  // Proof (modeled owner): omission returns success for a maintenance refusal with both reporters healthy.
  if (!completed.ok) throw completed.cause;
  if (isHistoryRetirement && !historyCensusChecked)
    throw new Error('History pre-effect census was not observed');
  const finished = (await executeRegistryCommand(directory, { command: 'read' }, ports)).state;
  if (
    finished.schemaVersion !== 4 ||
    finished.maintenance !== null ||
    finished.lastVerifiedBackup === null ||
    !finished.fenced
  )
    throw new Error('Actual native backup did not finish with verified backup and fence');
  console.log(kind === 'retirement' ? 'verified-native-retirement' : 'verified-native-backup');
}

/** Target only a freshly observed fixed worker in this owned PID namespace after a real restic ciphertext lock exists. */
async function killBackupWorker(isOwnerFinished: () => boolean) {
  const deadline = Date.now() + 90000;
  for (;;) {
    if (isOwnerFinished()) throw new Error('Native backup ended before hard-kill boundary');
    if (Date.now() >= deadline) throw new Error('Native backup lock boundary deadline');
    const locks = (await readdir(home + '/repository/locks')).filter((name) =>
      /^[a-f0-9]{64}$/.test(name),
    );
    if (locks.length > 0) {
      if (locks.length !== 1) throw new Error('Ambiguous active fixture backup lock');
      const lockId = locks.at(0);
      if (lockId === undefined) throw new Error('Missing exact fixture lock');
      const bytes = await readFile(home + '/repository/locks/' + lockId);
      if (createHash('sha256').update(bytes).digest('hex') !== lockId)
        throw new Error('Incomplete native ciphertext lock boundary');
      const workers = [];
      for (const name of await readdir(home + '/workers')) {
        if (!/^[1-9][0-9]*\.json$/.test(name)) continue;
        const marker = JSON.parse(await readFile(home + '/workers/' + name, 'utf8')) as {
          pid: unknown;
          parent: unknown;
          startTicks: unknown;
        };
        if (
          typeof marker.pid !== 'number' ||
          !Number.isSafeInteger(marker.pid) ||
          marker.pid <= 1 ||
          typeof marker.parent !== 'number' ||
          !Number.isSafeInteger(marker.parent) ||
          marker.parent <= 1 ||
          typeof marker.startTicks !== 'string' ||
          !/^[1-9][0-9]*$/.test(marker.startTicks)
        )
          throw new Error('Malformed exact worker marker');
        let serialized: string;
        try {
          serialized = await readFile(`/proc/${String(marker.pid)}/stat`, 'utf8');
        } catch (cause) {
          if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') continue;
          throw cause;
        }
        const fields = serialized
          .slice(serialized.lastIndexOf(') ') + 2)
          .trim()
          .split(/\s+/);
        if (fields[19] !== marker.startTicks) continue;
        const [command, status] = await Promise.all([
          readFile(`/proc/${String(marker.pid)}/cmdline`, 'utf8'),
          readFile(`/proc/${String(marker.pid)}/status`, 'utf8'),
        ]);
        if (
          command !==
            process.execPath +
              '\0/usr/local/libexec/puni-registry-maintenance/backup-worker.js\0' ||
          !/^Uid:\s+0\s+0\s+0\s+0$/m.test(status) ||
          fields[1] !== String(marker.parent) ||
          fields[2] !== String(marker.pid)
        )
          throw new Error('Native worker identity/group differs at kill boundary');
        workers.push({ pid: marker.pid, parent: marker.parent, startTicks: marker.startTicks });
      }
      if (workers.length !== 1) throw new Error('Ambiguous live native worker');
      const worker = workers.at(0);
      if (worker === undefined) throw new Error('Missing native worker');
      const fresh = await readFile(`/proc/${String(worker.pid)}/stat`, 'utf8');
      if (
        fresh
          .slice(fresh.lastIndexOf(') ') + 2)
          .trim()
          .split(/\s+/)[19] !== worker.startTicks
      )
        throw new Error('Worker changed before owned signal');
      process.kill(worker.pid, 'SIGKILL');
      return { ...worker, lockId };
    }
    await Bun.sleep(10);
  }
}

/** Workload PID1 exists only in the reviewed private PID/mount/network/chroot fixture. No host PID is a cleanup target. */
/** Run one fixed native fixture owner; await its exit, both pipes and optional monitor, preserving ordered failures and bounded nonprivate diagnostics. Root PID1 owns final descendant cleanup. */
export async function runNativeOwner(
  mode: string,
  fault?: 'kill-worker' | RegistryBackupInterruption,
): Promise<{
  code: number;
  stdout: string;
  stderr: string;
  worker:
    | {
        pid: number;
        parent: number;
        startTicks: string;
        lockId: string;
        attemptId?: string;
        resticPid?: number;
        mode?: RegistryBackupInterruption;
        elapsedMilliseconds?: number;
      }
    | undefined;
}> {
  const child = Bun.spawn(
    [
      '/usr/bin/setpriv',
      '--reuid=59001',
      '--regid=59001',
      '--clear-groups',
      '--',
      process.execPath,
      bundle,
      mode,
    ],
    { env: { PATH: '/usr/bin:/bin', LANG: 'C' }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let ownerFinished = false;
  const exited = child.exited.then((code) => {
    ownerFinished = true;
    return code;
  });
  const killed =
    fault === undefined
      ? Promise.resolve(undefined)
      : (fault === 'kill-worker'
          ? killBackupWorker(() => ownerFinished)
          : (async () => {
              const serialized = await readFile(`/proc/${String(child.pid)}/stat`, 'utf8');
              const startTicks = serialized
                .slice(serialized.lastIndexOf(') ') + 2)
                .trim()
                .split(/\s+/)
                .at(19);
              if (
                !serialized.startsWith(String(child.pid) + ' (') ||
                startTicks === undefined ||
                !/^[1-9][0-9]*$/.test(startTicks)
              )
                throw new Error('Missing owned Popen start identity');
              return interruptRegistryBackup(
                fault,
                {
                  pid: child.pid,
                  startTicks,
                  kill: (signal) => {
                    child.kill(signal);
                  },
                },
                () => ownerFinished,
                async () => {
                  const probe = await runNativeOwner('backup-contender-probe');
                  if (probe.code !== 0 || probe.stdout.trim() !== 'backup-authority-contended')
                    throw new Error('Exact59001 contention was not observed');
                },
              );
            })()
        ).catch((cause: unknown) => {
          if (!ownerFinished) child.kill('SIGTERM');
          throw cause;
        });
  // A failed monitor still waits for the exact owner and its output pipes; outer PID1 cleanup remains the bounded last resort.
  const outcomes = await Promise.allSettled([
    exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    killed,
  ] as const);
  const failures = outcomes.filter((outcome) => outcome.status === 'rejected');
  if (failures.length > 0) {
    // Proof (whole-module modeled owner): RED omitted the monitor clue; original-error and reporter-error removals each lose required errors in registry-backup-outcomes.test.ts.
    const observationFailures: unknown[] = [];
    try {
      if (fault !== undefined && fault !== 'kill-worker')
        for (const [slot, outcome] of [
          ['owner-exit', outcomes[0]],
          ['stdout', outcomes[1]],
          ['stderr', outcomes[2]],
          ['monitor', outcomes[3]],
        ] as const)
          if (outcome.status === 'rejected')
            console.log(
              JSON.stringify({
                backupInterruptionOutcome: {
                  mode: fault,
                  slot,
                  ...describeRegistryGuardObservationFailure(outcome.reason),
                },
              }),
            );
    } catch (cause) {
      observationFailures.push(cause);
    }
    throw new AggregateError(
      [...failures.map((failure): unknown => failure.reason), ...observationFailures],
      'Native owner/monitor did not reach terminal state',
    );
  }
  const [exitOutcome, stdoutOutcome, stderrOutcome, workerOutcome] = outcomes;
  if (
    exitOutcome.status !== 'fulfilled' ||
    stdoutOutcome.status !== 'fulfilled' ||
    stderrOutcome.status !== 'fulfilled' ||
    workerOutcome.status !== 'fulfilled'
  )
    throw new Error('Lost terminal native owner outcome');
  const code = exitOutcome.value;
  const stdout = stdoutOutcome.value;
  const stderr = stderrOutcome.value;
  const worker = workerOutcome.value;
  if (worker !== undefined)
    console.log(
      JSON.stringify({
        nativeFault:
          fault === 'kill-worker' ? 'worker-SIGKILL-after-real-lock' : 'backup-' + String(fault),
        ...worker,
      }),
    );
  console.log(JSON.stringify({ ownerStage: mode, exitCode: code }));
  return { code, stdout, stderr, worker };
}

async function controller() {
  if (process.pid !== 1 || process.getuid?.() !== 0)
    throw new Error('Full host fixture requires private root PID1');
  installMaintenanceReaper();
  await prepareRegistryHostFixture();
  const run = runNativeOwner;
  const initialized = await run('initialize');
  if (initialized.code !== 0 || initialized.stdout.trim() !== 'initialized')
    throw new Error('Full host fixture initialization failed');
  const secret = await run('secret-refusal');
  if (secret.code !== 0 || secret.stdout.trim() !== 'root-secrets-unreadable')
    throw new Error('Root credential refusal failed');
  await writeFile(home + '/admission', 'production', { mode: 0o600 });
  const refused = await run('backup');
  if (
    refused.code !== 1 ||
    (await readFile(home + '/admission-observed', 'utf8')) !== 'production-admission'
  )
    throw new Error('Missing Task9 admission did not reach and refuse native backup');
  const before = parseRegistryCommandResponse({
    state: JSON.parse(await readFile(directory + '/journal.json', 'utf8')),
  } satisfies { state: unknown }).state;
  const durableFailure =
    before.schemaVersion === 4 &&
    before.lastVerifiedBackup === null &&
    before.fenced &&
    before.maintenance?.phase === 'failed';
  console.log(JSON.stringify({ postAdmission: 'durable-failure', verified: durableFailure }));
  if (!durableFailure) throw new Error('Admission refusal lost durable ownership/fence');
  const snapshots = Bun.spawnSync(
    [
      '/root/.puni/tools/restic-0.19.1',
      '--no-cache',
      '--repo',
      home + '/repository',
      'snapshots',
      '--json',
    ],
    {
      env: {
        PATH: '/usr/bin:/bin',
        LANG: 'C',
        RESTIC_PASSWORD_FILE: '/root/.puni/registry/restic.password',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const snapshotsSucceeded = snapshots.exitCode === 0;
  const snapshotsEmpty = snapshots.stdout.toString().trim() === '[]';
  console.log(
    JSON.stringify({
      postAdmission: 'snapshots',
      commandSucceeded: snapshotsSucceeded,
      exactEmptyArray: snapshotsEmpty,
    }),
  );
  if (!snapshotsSucceeded || !snapshotsEmpty)
    throw new Error('Production admission refusal changed the fixture snapshot set');
  const preflightOnly =
    (await readFile(home + '/actions.log', 'utf8')).trim() === 'backup-preflight:entered';
  console.log(JSON.stringify({ postAdmission: 'preflight-only', verified: preflightOnly }));
  if (!preflightOnly) throw new Error('Admission refusal advanced to another privileged action');
  await writeFile(home + '/admission', 'fixture', { mode: 0o600 });
  const interrupted = await run('backup', 'kill-worker');
  if (interrupted.code !== 1 || interrupted.worker === undefined)
    throw new Error('Native killed backup did not fail');
  const worker = interrupted.worker;
  const interruptedState = parseRegistryCommandResponse({
    state: JSON.parse(await readFile(directory + '/journal.json', 'utf8')),
  } satisfies { state: unknown }).state;
  if (
    interruptedState.schemaVersion !== 4 ||
    !interruptedState.fenced ||
    interruptedState.maintenance?.phase !== 'failed' ||
    interruptedState.lastVerifiedBackup !== null
  )
    throw new Error('Killed native backup lost failure/last-backup fence');
  if (!(await readdir(home + '/repository/locks')).includes(interrupted.worker.lockId))
    throw new Error('Hard kill did not retain its actual restic lock');
  for (const pid of [interrupted.worker.pid, interrupted.worker.parent]) {
    try {
      await readFile(`/proc/${String(pid)}/stat`, 'utf8');
      throw new Error('Killed worker or guardian still present');
    } catch (cause) {
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
    }
  }
  const backup = await run('backup');
  if (backup.code !== 0 || backup.stdout.trim() !== 'verified-native-backup')
    throw new Error('Full host native backup failed');
  const reconciled = parseRegistryCommandResponse({
    state: JSON.parse(await readFile(directory + '/journal.json', 'utf8')),
  } satisfies { state: unknown }).state;
  if (
    reconciled.schemaVersion !== 4 ||
    !reconciled.maintenanceEvidence?.backupReconciliations.some((receipt) =>
      receipt.removed.some((version) => version.key === 'locks/' + worker.lockId),
    ) ||
    reconciled.maintenanceEvidence.backupAttempts.some((attempt) => attempt.state === 'prepared') ||
    (await readdir(home + '/repository/locks')).length !== 0
  )
    throw new Error('Actual hard-killed lock was not durably reconciled before retry');
  console.log(
    JSON.stringify({
      checks: 11,
      scope:
        'actual-host-dispatch/physical-mounts/sudo/Distribution/restic; synthetic-cluster-consumer-and-Task9-admission; owned-local-version-adapter',
      backup: 'verified',
      secrets: 'root-only',
      interruptedLock: 'exact-version-reconciled-before-fresh-worker',
      fence: 'retained',
    }),
  );
}

/** Terminate and reap only this freshly asserted PID namespace, then normally unmount its optional read-only cgroup view before proc. This function must never be called by the outside setup supervisor. */
async function reapNamespace(hasCgroupView: boolean) {
  if (
    process.pid !== 1 ||
    process.getuid?.() !== 0 ||
    !/^Pid:\s+1$/m.test(await readFile('/proc/self/status', 'utf8')) ||
    (await readFile('/etc/task8-namespace', 'utf8')) !== 'owned-private-proof\n'
  )
    throw new Error('Refuse cleanup outside owned workload PID1');
  const native = dlopen('libc.so.6', { waitpid: { args: ['i32', 'ptr', 'i32'], returns: 'i32' } });
  try {
    for (const name of await readdir('/proc')) {
      if (!/^[1-9]\d*$/.test(name) || name === '1') continue;
      try {
        process.kill(Number(name), 'SIGKILL');
      } catch (cause) {
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')) throw cause;
      }
    }
    const deadline = Date.now() + 5000;
    for (;;) {
      while (native.symbols.waitpid(-1, null, 1) > 0) {
        /* Exact owned private namespace children only. */
      }
      if (!(await readdir('/proc')).some((name) => /^[1-9]\d*$/.test(name) && name !== '1')) break;
      if (Date.now() >= deadline) throw new Error('Owned workload namespace did not terminate');
      await Bun.sleep(10);
    }
    if (hasCgroupView) {
      const unmounted = Bun.spawnSync(['/usr/bin/umount', '/sys/fs/cgroup'], {
        env: { PATH: '/usr/bin:/bin', LANG: 'C' },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      if (unmounted.exitCode !== 0) throw new Error('Owned workload cgroup unmount failed');
      console.log(JSON.stringify({ ownedWorkloadCgroup: 'unmounted' }));
    }
    const unmounted = Bun.spawnSync(['/usr/bin/umount', '/proc'], {
      env: { PATH: '/usr/bin:/bin', LANG: 'C' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (unmounted.exitCode !== 0) throw new Error('Owned workload proc unmount failed');
    console.log(
      JSON.stringify({ ownedWorkloadChildren: 'reaped', ownedWorkloadProc: 'unmounted' }),
    );
  } finally {
    native.close();
  }
}

// Proof (modeled caller): removing each interruption entrypoint or its cgroup cleanup inclusion fails its exact route in registry-interruption-routes.test.ts.
if (import.meta.main) {
  const mode = process.argv.at(2);
  const backupFault = backupFaultModes.get(mode ?? '');
  try {
    if (process.argv[1] === '/usr/local/libexec/puni-registry-maintenance/backup-worker.js')
      await backupWorker();
    else if (mode === undefined) await rootHelper();
    else if (
      mode === 'prove' ||
      mode === 'prove-populated' ||
      // Proof (serving): main admission omission invokes owner instead of the fixed serving controller.
      mode === 'prove-serving' ||
      mode === 'prove-index' ||
      mode === 'prove-history' ||
      mode === 'prove-shared' ||
      mode === 'prove-unsafe-gc' ||
      mode === 'prove-tag-cleanup' ||
      mode === 'prove-tag-recovery' ||
      mode === 'prove-restore-kill' ||
      mode === 'prove-gc-kill' ||
      // Proof (modeled pressure controller): omission routes the exact mode to an ordinary owner instead of its controller.
      mode === 'prove-volume-full' ||
      backupFault !== undefined ||
      mode === 'prove-permit-grammar' ||
      mode === 'prove-permit-expiry'
    ) {
      try {
        if (mode === 'prove') await controller();
        else {
          installMaintenanceReaper();
          if (mode === 'prove-permit-grammar' || mode === 'prove-permit-expiry')
            await proveRegistryPermitGuard(mode === 'prove-permit-grammar' ? 'grammar' : 'expiry');
          // Proof (modeled pressure controller): omission loses the required fixed controller invocation.
          else if (mode === 'prove-volume-full') {
            const pressureMode = process.env['PUNI_REGISTRY_FIXTURE_ALLOCATION'];
            if (pressureMode === 'upload') await proveRegistryUploadPressureHost(runNativeOwner);
            else
              await proveRegistryPressureHost(
                runNativeOwner,
                parseRegistryPressureAllocation(pressureMode),
              );
          } else if (backupFault !== undefined)
            await proveRegistryBackupInterruption(backupFault, runNativeOwner);
          else if (
            mode === 'prove-unsafe-gc' ||
            mode === 'prove-tag-cleanup' ||
            mode === 'prove-tag-recovery' ||
            mode === 'prove-restore-kill' ||
            mode === 'prove-gc-kill'
          )
            await proveRegistryDeletionHost(
              runNativeOwner,
              mode === 'prove-unsafe-gc'
                ? 'unsafe-gc'
                : mode === 'prove-gc-kill'
                  ? 'gc-kill'
                  : mode === 'prove-restore-kill'
                    ? 'restore-kill'
                    : mode === 'prove-tag-recovery'
                      ? 'tag-recovery'
                      : 'tag-cleanup',
            );
          else if (mode === 'prove-shared') await proveRegistrySharedHost(runNativeOwner);
          else if (mode === 'prove-history') await proveRegistryRetentionHost(runNativeOwner);
          else if (mode === 'prove-serving')
            // Proof (serving): await removal reaches mounted cleanup before the held controller completes.
            await proveRegistryServingHost(runNativeOwner, runRegistryServingCli);
          else if (mode === 'prove-index')
            await proveRegistryIndexHost(runNativeOwner, proveRegistryDockerPull);
          else await provePopulatedRegistryHost(runNativeOwner);
        }
      } finally {
        // Proof (fixture caller): removing the history/shared or either mounted guard-mode inclusion passes false in its actual extracted caller test; the privileged reaper is substituted there.
        // Proof: removing each fixed deletion mode from this caller passes false for its actual mounted cgroup view.
        // Proof (modeled caller): omitting populated mode passes false for the modern transport's readonly cgroup view in registry-maintenance-host-cleanup.test.ts.
        await reapNamespace(
          mode === 'prove-populated' ||
            // Proof (serving): cleanup inclusion removal passes false for the owned cgroup view.
            mode === 'prove-serving' ||
            mode === 'prove-index' ||
            mode === 'prove-history' ||
            mode === 'prove-shared' ||
            mode === 'prove-unsafe-gc' ||
            mode === 'prove-tag-cleanup' ||
            mode === 'prove-tag-recovery' ||
            mode === 'prove-gc-kill' ||
            // Proof (modeled pressure controller): omission passes false for this mounted cgroup view.
            mode === 'prove-volume-full' ||
            mode === 'prove-restore-kill' ||
            mode === 'prove-backup-owner-eof' ||
            mode === 'prove-backup-guardian-eof' ||
            mode === 'prove-backup-deadline' ||
            mode === 'prove-permit-grammar' ||
            mode === 'prove-permit-expiry',
        );
      }
    } else await owner(mode);
  } catch (cause) {
    if (
      mode !== undefined &&
      [
        'initialize',
        'backup',
        'index-reopen',
        'retire',
        'index-publish-1',
        'index-publish-2',
        'index-publish-3',
        'index-publish-4',
        'index-publish-5',
        'index-publish-6',
        'index-publish-7',
        'index-publish-8',
        'index-publish-9',
        'index-publish-10',
        'index-publish-11',
        'index-publish-12',
        'index-publish-13',
        'index-publish-14',
        'deletion-retire',
        'deletion-census',
        'deletion-recover',
        'pressure-backup',
        'pressure-recover',
        'pressure-ack',
        'deletion-publish-expired',
        'deletion-publish-protected',
        'deletion-protect',
        'history-retire',
        'shared-publish-old-one',
        'shared-publish-old-two',
        'shared-publish-current',
        'backup-interruption',
        'backup-contender-probe',
        'backup-contender-acquire',
        'shared-protect',
        'shared-release',
        'shared-retire-first',
        'shared-retire-second',
        'history-promote-1',
        'history-promote-2',
        'history-promote-3',
        'history-promote-4',
        'history-promote-5',
        'history-promote-6',
        'history-promote-7',
        'history-promote-8',
        'history-promote-9',
        'history-promote-10',
        'history-promote-11',
        'history-promote-12',
        'history-promote-13',
        'history-promote-14',
        'index-promote-2',
        'index-promote-3',
        'index-promote-4',
      ].includes(mode)
    )
      // Reuse the bounded existing retained-content diagnostic envelope; root emits the exact fixed owner mode separately.
      console.error(
        'task8-population-diagnostic:' +
          JSON.stringify(describeRegistryPopulationFailure('retained', cause)),
      );
    // Fixed fixture setup boundary also covers failures before the publication helper emits its own diagnostic.
    if (mode === 'populate')
      console.error('task8-population-owner:' + JSON.stringify({ boundary: populationBoundary }));
    // No journal, token, provider credential or subprocess output is reflected in proof errors.
    console.error('Native host fixture operation failed');
    process.exitCode = 1;
  }
}
