import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import { RegistryDeletionPublication } from './registry-deletion.fixture';
import { describeRegistryGuardObservationFailure } from './registry-guard-observation.fixture';
import { readRegistryHttpObservationOutput } from './registry-http-observation.fixture';
import { prepareRegistryIndexReaders } from './registry-index-authority.fixture';
import {
  fillRegistryFixtureInodes,
  type RegistryPressureAllocation,
} from './registry-inode-pressure.fixture';
import { parseRegistryCommandResponse } from './registry-journal';
import { startRegistryFixtureGuard } from './registry-maintenance-guard.fixture';
import { prepareRegistryHostFixture } from './registry-maintenance-host.fixture';
import { respondRegistryFixture } from './registry-maintenance-namespace-api.fixture';
import { requireRegistryRecoveryReceipt } from './registry-maintenance-state';
import { observeRegistryPopulationOutput } from './registry-population-diagnostics.fixture';
import { readRegistryPressureRecord } from './registry-pressure-ack.fixture';
import { prepareRegistryPressureEpoch } from './registry-pressure-epoch.fixture';
import { runRegistryPressureAcknowledgement } from './registry-pressure-probe.fixture';
import { startRegistryPressureBridge } from './registry-pressure-socket.fixture';
import { startRegistryPressureWriter } from './registry-pressure-writer.fixture';
import { fillRegistryFixtureVolume } from './registry-volume-pressure.fixture';

/**
 * Fill only the disposable registry filesystem outside its snapshotted contents, retain that
 * filler through verified staged recovery, and observe a fresh UID59001 allocation failure
 * before the owned writer stops. The Unix bridge models Kubernetes termination; it is not
 * the production startup ACK path. A second, explicit pre-serving refusal retains the verified
 * backup's fence. Recovery uses a new unarmed bootstrap-only bridge after the selected bridge
 * and writer are gone. No pressure is released and no second allocation probe is permitted.
 * Actual publication, canonical authority, backup, census and recovery remain production paths;
 * Kubernetes/readers/provider admission are synthetic. Serving activation remains separate.
 * The selected request is independently read at the allocation callback, then compared with
 * its receipt. Later fenced journal updates rotate the live request and cannot redefine that
 * earlier witness. Failed probes never publish the captured request; missing capture refuses.
 * Byte allocation remains the default for direct typed fixture callers; the native entrypoint
 * requires explicit byte/inode selection. Inode allocation retains and re-verifies every owned
 * empty file and current free-byte/inode counters before and after staged recovery.
 * Failure diagnostics retain at most sixteen distinct cause observations through the existing
 * fixed-category/numeric-frame redactor. Cycles and child traversal are bounded; reporter
 * failure retains the original proof/cleanup cause and never supplies raw messages or state.
 */
export async function proveRegistryPressureHost(
  run: (mode: string) => Promise<{ code: number; stdout: string; stderr: string }>,
  allocation: RegistryPressureAllocation = 'bytes',
): Promise<void> {
  let stage = 'setup';
  let selectedRequest: string | undefined;
  let bridge: Awaited<ReturnType<typeof startRegistryPressureBridge>> | undefined;
  let guard: Awaited<ReturnType<typeof startRegistryFixtureGuard>> | undefined;
  let writer: Awaited<ReturnType<typeof startRegistryPressureWriter>> | undefined;
  const failures: unknown[] = [];
  try {
    const { installed } = await prepareRegistryHostFixture();
    await prepareRegistryIndexReaders(installed);
    await writeFile('/root/task8-fixture/admission', 'fixture', { mode: 0o600 });
    bridge = await startRegistryPressureBridge(installed, async (signal) => {
      // Proof (actual callback): omission reads after pre-existing cancellation, before the second check still refuses.
      signal.throwIfAborted();
      // Proof (actual callback): missing real file and modeled EACCES refuse before the probe; a constant substitute falsely accepts unreadability.
      const request = await readRegistryPressureRecord(
        '/var/lib/puni-registry/journal/contents/readonly.request',
      );
      // Proof (actual callback): omission accepts a probe after cancellation during the request read.
      signal.throwIfAborted();
      const acknowledgement = await runRegistryPressureAcknowledgement(installed, signal);
      // Proof (actual callback/real revocations): omission loses the selected snapshot despite a successful probe.
      selectedRequest = request;
      return acknowledgement;
    });
    const invoke = async (mode: string, expected: string) => {
      const completed = await run(mode);
      // Proof (modeled pressure controller): balanced omission falsely completes after a failed bootstrap owner.
      if (completed.code !== 0 || completed.stdout.trim() !== expected) {
        console.log(
          JSON.stringify({
            pressureOwnerFailure: {
              mode,
              observation: observeRegistryPopulationOutput(completed.stderr),
            },
          }),
        );
        throw new Error('Pressure setup owner failed');
      }
    };
    stage = 'bootstrap';
    await invoke('initialize', 'initialized');
    await invoke('backup', 'verified-native-backup');
    await writeFile(
      '/etc/puni/ordinary-writer.json',
      JSON.stringify({
        version: 0.1,
        log: { level: 'error' },
        storage: {
          filesystem: { rootdirectory: installed.ordinary.path },
          delete: { enabled: false },
          maintenance: { uploadpurging: { enabled: false } },
        },
        http: { addr: '127.0.0.1:5052', secret: 'owned-pressure-seed' },
      }),
      { mode: 0o644, flag: 'wx' },
    );
    stage = 'publication';
    guard = await startRegistryFixtureGuard(installed, {
      signal: new AbortController().signal,
      initialMode: 'readonly',
      interceptPermissionReads: false,
    });
    await invoke('index-reopen', 'population-writable-permitted');
    await guard.waitMode('writable');
    const published = await run('deletion-publish-protected');
    const publicationHttp = readRegistryHttpObservationOutput(published.stderr);
    console.log(JSON.stringify({ pressurePublicationHttp: publicationHttp }));
    // Proof (modeled pressure controller): omission accepts incomplete publication HTTP evidence.
    if (
      published.code !== 0 ||
      publicationHttp.state !== 'valid' ||
      publicationHttp.observation?.pending !== 0
    )
      throw new Error('Pressure publication lacks completed HTTP evidence');
    const publication = RegistryDeletionPublication.assert(JSON.parse(published.stdout));
    // Proof (modeled pressure controller): omission accepts the modeled wrong publication kind.
    if (
      publication.kind !== 'protected' ||
      publication.repository !== 'retained/index' ||
      publication.manifests.length !== 3 ||
      !publication.manifests.includes(publication.root)
    )
      throw new Error('Pressure publication is not the protected index closure');
    await writeFile('/etc/puni/registry-deletion-protected.json', JSON.stringify(publication), {
      mode: 0o644,
      flag: 'wx',
    });
    await invoke('deletion-protect', 'index-explicitly-protected');
    await guard.close();
    guard = undefined;
    const beforeState: unknown = JSON.parse(
      await readFile(join(installed.journalPath, 'journal.json'), 'utf8'),
    );
    const before = parseRegistryCommandResponse({ state: beforeState }).state;
    // Proof (modeled pressure controller): omission reaches writer startup before later obligation reconciliation still refuses.
    if (
      before.schemaVersion !== 4 ||
      before.maintenance !== null ||
      !before.protections.some((protection) => protection.roots.includes(publication.root))
    )
      throw new Error('Pressure seed lacks settled canonical protection');
    // Proof (modeled pressure controller): omission accepts modeled unenrolled recovery targets retaining otherwise valid paths.
    if (installed.recovery.state !== 'enrolled')
      throw new Error('Pressure recovery targets are unenrolled');
    const mounts = await Promise.all(
      [
        installed.ordinary.path,
        installed.journalPath,
        installed.recovery.path,
        installed.recovery.stagedJournalPath,
      ].map((path) => lstat(path)),
    );
    // Proof (modeled pressure controller): omission certifies modeled aliased filesystem devices.
    if (
      mounts.some((mount) => !mount.isDirectory()) ||
      new Set(mounts.map((mount) => mount.dev)).size !== 4
    )
      throw new Error('Pressure requires four independent owned filesystems');
    const lock = await lstat(join(installed.journalPath, 'authority.lock'));
    const actionsBefore = await readFile('/root/task8-fixture/actions.log', 'utf8');
    stage = 'fresh-writer';
    writer = await startRegistryPressureWriter(installed);
    const epoch = await prepareRegistryPressureEpoch(installed, writer);
    const priorRequest = await readRegistryPressureRecord(
      '/var/lib/puni-registry/journal/contents/readonly.request',
    );
    const deployment = type({
      metadata: { uid: 'string > 0', resourceVersion: /^[1-9][0-9]{0,19}$/ },
      spec: { replicas: '1' },
    }).assert(
      respondRegistryFixture(
        [
          'kubectl',
          '--kubeconfig',
          '/etc/puni/registry-maintenance-management.kubeconfig',
          '--request-timeout=15s',
          'get',
          '--namespace',
          'puni-registry',
          'Deployment.apps',
          'registry',
          '--output=json',
        ],
        await readFile('/root/task8-fixture/kubernetes.json', 'utf8'),
      ).response,
    );
    // Proof (modeled pressure controller): omission arms a foreign Deployment UID.
    if (deployment.metadata.uid !== installed.ordinary.deployment.uid)
      throw new Error('Pressure arm Deployment differs from installation');
    bridge.arm(writer, {
      uid: deployment.metadata.uid,
      resourceVersion: deployment.metadata.resourceVersion,
      instance: epoch.instance,
      priorRequest,
    });
    stage = 'fill';
    // Proof (modeled whole controller): reversed selection loses the required inode allocator; byte selection retains the original file allocator.
    const filler =
      allocation === 'inodes'
        ? await fillRegistryFixtureInodes(installed)
        : await fillRegistryFixtureVolume(installed);
    const requireFiller = async () => {
      // Proof (modeled whole controller): skipped before/after calls lose the corresponding exact refusal; unawaited verification reaches recovery before the held proof resolves.
      if ('verify' in filler) {
        await filler.verify();
        return;
      }
      const current = await lstat('/var/lib/puni-registry/registry/task8-full-volume.fill');
      // Proof (modeled pressure controller): omission accepts a changed retained filler before or after recovery.
      if (
        !current.isFile() ||
        current.dev !== filler.device ||
        current.ino !== filler.inode ||
        current.size !== filler.bytes
      )
        throw new Error('Pressure filler changed or was released');
    };
    stage = 'backup-under-pressure';
    const completed = await run('pressure-backup');
    const http = readRegistryHttpObservationOutput(completed.stderr);
    console.log(
      JSON.stringify({
        pressureBackupOwner: observeRegistryPopulationOutput(completed.stderr),
        pressureBackupHttp: http,
      }),
    );
    // Proof (modeled pressure controller): omission accepts owner success or invalid HTTP as controlled failure.
    if (completed.code !== 1 || http.state !== 'valid' || http.observation?.pending !== 0)
      throw new Error('Pressure backup lacks its controlled failed owner');
    const pressure = bridge.receipt();
    // Proof (modeled controller): substituting the later file read rejects a valid stop after another revocation.
    const request = selectedRequest;
    const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
    // Proof (modeled pressure controller): request-hash omission accepts a mismatched receipt. Missing-capture clause omission instead throws TypeError, still refusing; that proof is diagnostic only.
    if (
      request === undefined ||
      pressure.pid !== writer.pid ||
      pressure.startTicks !== writer.startTicks ||
      pressure.instanceSha256 !== hash(epoch.instance) ||
      pressure.requestSha256 !== hash(request) ||
      request === priorRequest
    )
      throw new Error('Pressure receipt differs from selected writer and current request');
    const acknowledgement = installed.ordinary.path + '/.authority-readonly';
    if (pressure.stage === 'open') {
      try {
        await lstat(acknowledgement);
        // Proof (modeled pressure controller): omission accepts a present record after claimed open failure.
        throw new Error('Failed ACK open left an unexpected record');
      } catch (cause) {
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
      }
    } else {
      const empty = await lstat(acknowledgement);
      // Proof (modeled pressure controller): omission accepts a nonempty ACK despite claimed failed allocation.
      if (
        !empty.isFile() ||
        empty.dev !== filler.device ||
        empty.uid !== 59001 ||
        empty.gid !== 59001 ||
        empty.nlink !== 1 ||
        (empty.mode & 0o7777) !== 0o600 ||
        empty.size !== 0
      )
        throw new Error('Failed ACK write is not the current empty allocation');
    }
    let processAbsent = false;
    try {
      await readFile('/proc/' + String(writer.pid) + '/stat', 'utf8');
    } catch (cause) {
      // Proof (modeled pressure controller): broken absence classification accepts EACCES as process absence.
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')
        processAbsent = true;
      else throw cause;
    }
    let groupAbsent = false;
    try {
      process.kill(-writer.pid, 0);
    } catch (cause) {
      // Proof (modeled pressure controller): broken absence classification accepts EPERM as group absence.
      if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') groupAbsent = true;
      else throw cause;
    }
    // Proof (modeled pressure controller): omission permits recovery while modeled process or group remains.
    if (!processAbsent || !groupAbsent) throw new Error('Pressure writer remains before recovery');
    const failedState: unknown = JSON.parse(
      await readFile(join(installed.journalPath, 'journal.json'), 'utf8'),
    );
    const failed = parseRegistryCommandResponse({ state: failedState }).state;
    // Proof (modeled pressure controller): omission accepts an unfenced or non-advancing canonical journal; null backup is separately refused.
    if (
      failed.schemaVersion !== 4 ||
      !failed.fenced ||
      failed.revision <= before.revision ||
      failed.maintenance?.operationId !== 'native-volume-backup' ||
      failed.maintenance.kind !== 'backup' ||
      failed.maintenance.phase !== 'failed' ||
      failed.maintenanceEvidence?.operationId !== 'native-volume-backup' ||
      failed.maintenanceEvidence.backup === null
    )
      throw new Error('Pressure backup lost healthy failed canonical lineage');
    const backup = failed.maintenanceEvidence.backup;
    // Proof (modeled pressure controller): omission accepts a last-verified backup different from this operation.
    if (
      failed.maintenanceEvidence.backupCensusSha256 !== backup.censusSha256 ||
      JSON.stringify(failed.lastVerifiedBackup) !== JSON.stringify(backup) ||
      backup.registryId !== installed.registryId ||
      backup.storageId !== installed.ordinary.storageId ||
      backup.registryPath !== installed.ordinary.path ||
      backup.journalPath !== installed.journalPath
    )
      throw new Error('Pressure backup is not the current matching verified pair');
    // Proof (modeled pressure controller): substituting a synthetic valid record hides both ENOENT and EACCES from the required handoff read.
    const handoffBytes = await readFile('/root/task8-fixture/pressure-handoff.json', 'utf8');
    // Proof (modeled pressure controller): omission accepts oversized otherwise-valid handoff JSON.
    if (Buffer.byteLength(handoffBytes) > 4096)
      throw new Error('Pressure handoff receipt exceeds bound');
    // Proof (modeled pressure controller): bypassing schema accepts unverified writer exclusion.
    const handoff = type({
      scope: "'controlled-pre-serving-after-verified-backup'",
      operationId: "'native-volume-backup'",
      snapshotId: /^[a-f0-9]{64}$/,
      journalSha256: /^[a-f0-9]{64}$/,
      writerExclusion: "'verified'",
      '+': 'reject',
    }).assert(JSON.parse(handoffBytes));
    // Proof (modeled pressure controller): omission accepts another handoff snapshot.
    if (handoff.snapshotId !== backup.snapshotId || handoff.journalSha256 !== backup.journalSha256)
      throw new Error('Pressure handoff differs from verified backup');
    const backupActions = await readFile('/root/task8-fixture/actions.log', 'utf8');
    // Proof (modeled pressure controller): omission reaches recovery before later history reconciliation refuses the changed prefix.
    if (!backupActions.startsWith(actionsBefore))
      throw new Error('Pressure action history changed');
    const suffix = backupActions.slice(actionsBefore.length);
    // Proof (modeled pressure controller): omission reaches recovery after a completed serving action before a later phase refusal; membership is not temporal order.
    if (
      !suffix.includes('assert-stopped:completed\n') ||
      !suffix.includes('backup-verify:completed\n') ||
      !suffix.includes('restore-service:entered\n') ||
      suffix.includes('restore-service:completed\n') ||
      suffix.includes('collect:entered\n')
    )
      throw new Error('Pressure stop or controlled handoff action order differs');
    await requireFiller();
    console.log(
      JSON.stringify({
        pressureStopped: pressure,
        pressureFiller: filler,
        // Proof (modeled pressure controller): restoring the raw epoch object exposes its instance bytes.
        pressureEpoch: {
          writer: epoch.writer,
          priorInstanceSha256: epoch.priorInstanceSha256,
          priorAcknowledgement: epoch.priorAcknowledgement,
          instanceSha256: pressure.instanceSha256,
        },
        pressureHandoff: handoff,
      }),
    );
    stage = 'bridge-transition';
    // Proof (modeled pressure controller): omission loses required close and hides its injected failure; no real socket overlap is exercised.
    await bridge.close();
    bridge = undefined;
    bridge = await startRegistryPressureBridge(installed, () =>
      Promise.reject(new Error('Recovery bootstrap must not probe ACK')),
    );
    stage = 'recovery';
    const recovered = await run('pressure-recover');
    const recoveryHttp = readRegistryHttpObservationOutput(recovered.stderr);
    console.log(
      JSON.stringify({
        pressureRecoveryOwner: observeRegistryPopulationOutput(recovered.stderr),
        pressureRecoveryHttp: recoveryHttp,
      }),
    );
    // Proof (modeled pressure controller): omission accepts failed owner or invalid recovery HTTP.
    if (
      recovered.code !== 0 ||
      recovered.stdout.trim() !== 'pressure-recovery-staged-fenced' ||
      recoveryHttp.state !== 'valid' ||
      recoveryHttp.observation?.pending !== 0 ||
      !recoveryHttp.observation.events.some(
        (event) => event.method === 'GET' && event.path === 'manifest' && event.status === 200,
      )
    )
      throw new Error('Pressure recovery lacks verified owner and content reads');
    const restoredState: unknown = JSON.parse(
      await readFile(join(installed.journalPath, 'journal.json'), 'utf8'),
    );
    const restored = parseRegistryCommandResponse({ state: restoredState }).state;
    // Proof (modeled pressure controller): omission accepts the modeled wrong schema with otherwise valid fields.
    if (restored.schemaVersion !== 4) throw new Error('Pressure recovery lost maintenance schema');
    const receipt = requireRegistryRecoveryReceipt(restored, installed.journalPath);
    const lockAfter = await lstat(join(installed.journalPath, 'authority.lock'));
    // Proof (modeled pressure controller): omission accepts changed target, current protection or canonical lock inode.
    if (
      !restored.fenced ||
      restored.maintenance?.operationId !== 'native-volume-backup' ||
      restored.maintenance.phase !== 'restored' ||
      restored.enrollment.registryPath !== installed.recovery.path ||
      restored.enrollment.storageId !== installed.recovery.storageId ||
      receipt.stagedJournalPath !== installed.recovery.stagedJournalPath ||
      receipt.snapshotId !== backup.snapshotId ||
      lockAfter.dev !== lock.dev ||
      lockAfter.ino !== lock.ino ||
      JSON.stringify(restored.bundles) !== JSON.stringify(before.bundles) ||
      JSON.stringify(restored.protections) !== JSON.stringify(before.protections) ||
      JSON.stringify(restored.consumers) !== JSON.stringify(before.consumers) ||
      JSON.stringify(restored.environments) !== JSON.stringify(before.environments) ||
      JSON.stringify(restored.deployments) !== JSON.stringify(before.deployments)
    )
      throw new Error('Pressure recovery changed current obligations or authority');
    // Proof (modeled pressure controller): omission accepts mismatching restored offline journal bytes.
    if (
      hash(await readFile(join(receipt.stagedJournalPath, 'journal.json'))) !== backup.journalSha256
    )
      throw new Error('Pressure recovery offline journal differs');
    const revision = join(
      'docker/registry/v2/repositories',
      publication.repository,
      '_manifests/revisions/sha256',
      publication.root.slice(7),
      'link',
    );
    // Proof (modeled pressure controller): omission accepts a changed old or recovered protected revision.
    if (
      (await readFile(join(installed.ordinary.path, revision), 'utf8')) !== publication.root ||
      (await readFile(join(installed.recovery.path, revision), 'utf8')) !== publication.root
    )
      throw new Error('Pressure recovery did not preserve old and restored protected revision');
    await requireFiller();
    const recoveryActions = await readFile('/root/task8-fixture/actions.log', 'utf8');
    // Proof (modeled pressure controller): omission accepts a rewritten prefix with valid recovery suffix.
    if (!recoveryActions.startsWith(backupActions))
      throw new Error('Pressure recovery action history changed');
    const recoverySuffix = recoveryActions.slice(backupActions.length);
    // Proof (modeled pressure controller): omission accepts a serving-restoration entry; suffix membership does not order its entries.
    if (
      !recoverySuffix.includes('backup-restore:completed\n') ||
      !recoverySuffix.includes('serve-recovery:entered\n') ||
      recoverySuffix.includes('restore-service:entered\n') ||
      recoverySuffix.includes('collect:entered\n')
    )
      throw new Error('Pressure recovery did not stop at staged fenced handoff');
    console.log(
      JSON.stringify({
        proof: 'owned-full-volume-no-ack',
        allocation,
        fourIndependentFilesystems: true,
        fillerRetainedOutsideSnapshot: true,
        journalHealthy: true,
        matchingBackupVerified: true,
        currentObligationsPreserved: true,
        stagedFencedHandoff: true,
        servingActivationPending: true,
        synthetic:
          'Kubernetes stop via owned direct writer; readers/provider; separate pre-serving controlled refusal; no startup ACK or actual elapsed grace claim',
      }),
    );
  } catch (cause) {
    failures.push(cause);
  }
  for (const capability of [guard, writer, bridge]) {
    if (capability !== undefined) {
      try {
        // Proof (modeled pressure controller): omission loses owned cleanup and its error after the publication failure.
        await capability.close();
      } catch (cause) {
        failures.push(cause);
      }
    }
  }
  if (failures.length > 0) {
    const cause =
      failures.length === 1
        ? failures[0]
        : new AggregateError(failures, 'Pressure proof and owned cleanup failed', {
            cause: failures[0],
          });
    try {
      const causes: ReturnType<typeof describeRegistryGuardObservationFailure>[] = [];
      const pending: unknown[] = [cause];
      const visited = new Set<unknown>();
      // Proof (modeled diagnostic): omitting the observation bound emits seventeen clues instead of sixteen.
      while (pending.length > 0 && causes.length < 16) {
        const current = pending.shift();
        // Proof (modeled diagnostic): omission repeats a cyclic cause sixteen times instead of observing it once.
        if (visited.has(current)) continue;
        visited.add(current);
        causes.push(describeRegistryGuardObservationFailure(current));
        // Proof (modeled diagnostic): omitting the cause edge loses the actual redactor's nested numeric frame.
        if (current instanceof Error && current.cause !== undefined) pending.push(current.cause);
        // Proof (modeled diagnostic): omitting aggregate children loses fifteen observed inner causes.
        if (current instanceof AggregateError) {
          // Boundary: AggregateError supplies the error array; members remain unknown until observation.
          const children: readonly unknown[] = current.errors;
          // Proof (modeled diagnostic): omitting this slice reaches the forbidden seventeenth getter and produces a reporter refusal, not unbounded output.
          pending.push(...children.slice(0, 16));
        }
      }
      console.log(
        JSON.stringify({
          pressureFailure: { stage, ...describeRegistryGuardObservationFailure(cause), causes },
        }),
      );
    } catch (reporter) {
      // Proof (modeled pressure controller): separate array omissions lose reporter or primary membership; the primary cause property remains.
      // Boundary: reporter remains in errors; the original proof/cleanup failure stays primary.
      // eslint-disable-next-line preserve-caught-error
      throw new AggregateError([cause, reporter], 'Pressure diagnostic failed', { cause });
    }
    throw cause;
  }
}
