import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import { RegistryDeletionPublication } from './registry-deletion.fixture';
import { describeRegistryGuardObservationFailure } from './registry-guard-observation.fixture';
import { readRegistryHttpObservationOutput } from './registry-http-observation.fixture';
import { prepareRegistryIndexReaders } from './registry-index-authority.fixture';
import { startRegistryFixtureGuard } from './registry-maintenance-guard.fixture';
import { prepareRegistryHostFixture } from './registry-maintenance-host.fixture';
import { requireRegistryRecoveryReceipt } from './registry-maintenance-state';
import { parseRegistryCommandResponse } from './registry-managed-journal';
import { observeRegistryPopulationOutput } from './registry-population-diagnostics.fixture';
import { inspectRegistryRestoreFault } from './registry-restore-interruption.fixture';
import { readRegistryBytes } from './registry-stream';

type RunOwner = (mode: string) => Promise<{ code: number; stdout: string; stderr: string }>;

/**
 * Fixed owned destructive witnesses and a staged recovery continuation. Restore interruption uses two faults: tag cleanup first enters fenced recovery, then an actual restic child is stopped and killed before a same-operation retry. GC interruption uses normal deletion and unchanged collection admission, without the tag or unsafe-GC faults. A stopped restore may have written no files; this does not claim partial extraction. Actual authority, backup, isolated UID59001 server and GC
 * remain native; Kubernetes/readers/provider admission are synthetic. The index is explicitly
 * protected, not a deployed environment. Post-publication retirement, census and recovery clocks advance eight days; the recovery continuation stops fenced before serving activation.
 */
export async function proveRegistryDeletionHost(
  run: RunOwner,
  mode: 'unsafe-gc' | 'tag-cleanup' | 'tag-recovery' | 'restore-kill' | 'gc-kill',
): Promise<void> {
  let stage = 'setup';
  try {
    const { installed } = await prepareRegistryHostFixture();
    await prepareRegistryIndexReaders(installed);
    await writeFile('/root/task8-fixture/admission', 'fixture', { mode: 0o600 });
    const invoke = async (command: string, expected: string) => {
      const completed = await run(command);
      if (completed.code !== 0 || completed.stdout.trim() !== expected) {
        console.log(
          JSON.stringify({
            deletionOwnerFailure: {
              command,
              observation: observeRegistryPopulationOutput(completed.stderr),
            },
          }),
        );
        throw new Error('Deletion fixture owner stage failed');
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
        http: { addr: '127.0.0.1:5052', secret: 'owned-native-seed' },
      }),
      { mode: 0o644, flag: 'wx' },
    );
    stage = 'publication';
    const publications: (typeof RegistryDeletionPublication.infer)[] = [];
    const guard = await startRegistryFixtureGuard(installed, {
      signal: new AbortController().signal,
      initialMode: 'readonly',
      interceptPermissionReads: false,
    });
    try {
      await invoke('index-reopen', 'population-writable-permitted');
      await guard.waitMode('writable');
      for (const kind of ['expired', 'protected'] as const) {
        const completed = await run('deletion-publish-' + kind);
        console.log(
          JSON.stringify({
            deletionOwnerObservation: {
              kind,
              observation: observeRegistryPopulationOutput(completed.stderr),
            },
          }),
        );
        const http = readRegistryHttpObservationOutput(completed.stderr);
        console.log(JSON.stringify({ deletionPublicationHttp: { kind, ...http } }));
        if (completed.code !== 0 || http.state !== 'valid' || http.observation?.pending !== 0)
          throw new Error('Deletion publication lacks actual complete HTTP evidence');
        const receipt = RegistryDeletionPublication.assert(JSON.parse(completed.stdout));
        if (receipt.kind !== kind) throw new Error('Deletion publication kind differs');
        publications.push(receipt);
      }
      const protectedIndex = publications.at(1);
      if (protectedIndex === undefined) throw new Error('Protected publication is missing');
      await writeFile(
        '/etc/puni/registry-deletion-protected.json',
        JSON.stringify(protectedIndex),
        { mode: 0o644, flag: 'wx' },
      );
      await invoke('deletion-protect', 'index-explicitly-protected');
    } finally {
      await guard.close();
    }
    const expired = publications.at(0),
      protectedIndex = publications.at(1);
    if (
      expired === undefined ||
      protectedIndex === undefined ||
      expired.manifests.length !== 1 ||
      protectedIndex.manifests.length !== 3
    )
      throw new Error('Deletion fixture closure shape differs');
    const before = parseRegistryCommandResponse({
      state: JSON.parse(await readFile(installed.journalPath + '/journal.json', 'utf8')),
    } satisfies { state: unknown }).state;
    if (
      before.schemaVersion !== 4 ||
      !before.protections.some((protection) => protection.roots.includes(protectedIndex.root))
    )
      throw new Error('Index lacks canonical explicit image protection');
    const originals = JSON.stringify(before.bundles);
    const actionsBefore = await readFile('/root/task8-fixture/actions.log', 'utf8');
    await writeFile(
      '/etc/puni/registry-fixture-retirement-clock.json',
      JSON.stringify({ now: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString() }),
      { mode: 0o644, flag: 'wx' },
    );
    stage = 'retirement';
    const retired = await run('deletion-retire');
    console.log(
      JSON.stringify({
        deletionOwnerObservation: {
          kind: mode,
          observation: observeRegistryPopulationOutput(retired.stderr),
        },
      }),
    );
    const http = readRegistryHttpObservationOutput(retired.stderr);
    console.log(JSON.stringify({ deletionRetirementHttp: { mode, ...http } }));
    // Proof: owner-success removal accepts a successful owner as destructive-failure evidence.
    if (retired.code !== 1 || http.state !== 'valid' || http.observation?.pending !== 0)
      throw new Error('Deletion fault lacks failed owner and complete HTTP observation');
    const journal = parseRegistryCommandResponse({
      state: JSON.parse(await readFile(installed.journalPath + '/journal.json', 'utf8')),
    } satisfies { state: unknown }).state;
    if (journal.schemaVersion !== 4)
      throw new Error('Deletion failure requires maintenance journal');
    const evidence = journal.maintenanceEvidence;
    const allActions = await readFile('/root/task8-fixture/actions.log', 'utf8');
    if (!allActions.startsWith(actionsBefore)) throw new Error('Action history changed');
    const actions = allActions.slice(actionsBefore.length);
    // Proof: fence/backup/provenance/restore-service removals each accept the corresponding invalid modeled controller state.
    if (
      journal.maintenance?.phase !== 'failed' ||
      !journal.fenced ||
      evidence?.backup === null ||
      evidence?.backup === undefined ||
      evidence.operationId !== 'native-host-retire' ||
      JSON.stringify(journal.bundles) !== originals ||
      !actions.includes('backup-verify:completed\n') ||
      actions.includes('restore-service:entered\n') ||
      evidence.deletions.length !== 1 ||
      evidence.deletions[0]?.digest !== expired.root
    )
      throw new Error(
        'Deletion failure lacks original provenance, matching backup and durable fence',
      );
    stage = 'physical-evidence';
    const faultBytes = await readFile(
      mode === 'gc-kill'
        ? '/root/task8-fixture/collection-interruption.log'
        : '/root/task8-fixture/deletion-fault.log',
      'utf8',
    );
    if (Buffer.byteLength(faultBytes) > 4096)
      throw new Error('Deletion fault receipt is oversized');
    const lines = faultBytes.trimEnd().split('\n');
    if (lines.length !== 1) throw new Error('Deletion fault receipt count differs');
    const fault: unknown = JSON.parse(lines[0] ?? '');
    const manifestPath = (repository: string, digest: string) =>
      join(
        installed.ordinary.path,
        'docker/registry/v2/repositories',
        repository,
        '_manifests/revisions/sha256',
        digest.slice(7),
        'link',
      );
    const absent = async (path: string) => {
      try {
        await lstat(path);
        return false;
      } catch (cause) {
        if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return true;
        throw cause;
      }
    };
    if (mode === 'gc-kill') {
      // Proof (modeled controller): registry-collection-controller.test.ts loses refusal of exit code zero instead of SIGKILL termination when this check is removed.
      const killed = type({
        collectionInterruption: {
          pid: 'number.safe > 0',
          startTicks: /^[1-9][0-9]{0,19}$/,
          group: 'number.safe > 0',
          exitCode: '137',
          signal: "'SIGKILL'",
          groupAbsent: 'true',
          '+': 'reject',
        },
        '+': 'reject',
      }).assert(fault).collectionInterruption;
      console.log(JSON.stringify({ collectionNativeReceipt: killed }));
      // Proof (modeled controller): registry-collection-controller.test.ts loses refusal of foreign GC group despite a modeled successful absence probe when this check is removed.
      if (killed.pid !== killed.group) throw new Error('GC interruption group differs from child');
      let absentProcess = false;
      try {
        await readFile(`/proc/${String(killed.pid)}/stat`, 'utf8');
      } catch (cause) {
        // Proof (modeled controller): gc-proc-error removal accepts a non-Error ENOENT object as process absence.
        if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')
          absentProcess = true;
        else throw cause;
      }
      // Proof (modeled controller): registry-collection-controller.test.ts loses refusal of still-present GC process when this check is removed.
      if (!absentProcess) throw new Error('Interrupted GC process remains before recovery');
      let groupAbsent = false;
      try {
        process.kill(-killed.group, 0);
      } catch (cause) {
        // Proof (modeled controller): gc-group-error removal accepts a non-Error ESRCH object as group absence.
        if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') groupAbsent = true;
        else throw cause;
      }
      // Proof (modeled controller): registry-collection-controller.test.ts loses refusal of still-live GC group when this check is removed.
      if (!groupAbsent) throw new Error('Interrupted GC group remains before recovery');
      const collectionStarted = actions.indexOf('collect:entered\n');
      // Proof (modeled controller): registry-collection-controller.test.ts loses refusal of post-collection readonly entry when this check is removed.
      if (
        collectionStarted < 0 ||
        actions.includes('collect:completed\n') ||
        actions.includes('serve-readonly:entered\n', collectionStarted) ||
        evidence.deletions[0]?.state !== 'verified' ||
        !http.observation.events.some(
          (event) => event.method === 'DELETE' && event.path === 'manifest' && event.status === 202,
        ) ||
        !(await absent(manifestPath(expired.repository, expired.root)))
      )
        throw new Error('GC interruption lacks normal completed deletion before failed collection');
      console.log(
        JSON.stringify({
          collectionKilledBeforeRecovery: {
            ...killed,
            processAbsent: true,
            groupAbsent: true,
            normalDeletionVerified: true,
          },
        }),
      );
    } else if (mode === 'unsafe-gc') {
      // Proof: zero-exit guard removal certifies nonzero GC; marker and child absence have independent unknown/present negatives.
      type({
        unsafeGc: { started: 'true', pid: 'number.safe > 0', exitCode: '0', '+': 'reject' },
        '+': 'reject',
      }).assert(fault);
      console.log(JSON.stringify({ deletionNativeReceipt: fault }));
      const markers = retired.stderr
        .split('\n')
        .filter((line) => line.startsWith('task8-deletion-retained:'));
      if (
        markers.length !== 1 ||
        ![
          'task8-deletion-retained:missing-child-revision',
          'task8-deletion-retained:missing-manifest-content',
          'task8-deletion-retained:missing-dependency',
        ].includes(markers[0] ?? '')
      )
        throw new Error('Unsafe GC lacks exact retained census refusal');
      // Proof: removing order check accepts readonly BEFORE collection; this marker alone does not establish phase.
      const collected = actions.indexOf('collect:completed\n');
      if (collected < 0 || actions.indexOf('serve-readonly:entered\n', collected) <= collected)
        throw new Error('Unsafe GC failure did not follow completed GC and retained serving');
      const child = protectedIndex.manifests.find((digest) => digest !== protectedIndex.root);
      if (
        child === undefined ||
        !evidence.retained.some(
          (reference) =>
            reference.repository === protectedIndex.repository && reference.digest === child,
        ) ||
        !(await absent(manifestPath(protectedIndex.repository, child))) ||
        !actions.includes('collect:completed\n') ||
        !actions.includes('serve-readonly:entered\n')
      )
        throw new Error(
          'Unsafe GC did not remove a protected retained child after successful collection',
        );
      console.log(
        JSON.stringify({
          deletionFault: {
            mode,
            gcExit: 0,
            protectedChildRevisionAbsent: true,
            ownerFailed: true,
            fenced: true,
          },
        }),
      );
    } else {
      // Proof: loosening the known-mode contract accepts a consistent0666 original/receipt/physical-link fixture.
      const tagFault = type({
        tagCleanup: {
          injected: 'true',
          revisionAbsent: 'true',
          tagUnchanged: 'true',
          modeRestored: 'true',
          originalMode: '384|420',
          restoredMode: '384|420',
          serverPid: 'number.safe > 0',
          serverTerminal: 'true',
          serverExitCode: '0 <= number.safe <= 255',
          serverSignal: type("'SIGKILL'|'SIGTERM'").or('null'),
          groupAbsent: 'true',
          '+': 'reject',
        },
        '+': 'reject',
      }).assert(fault).tagCleanup;
      console.log(JSON.stringify({ deletionNativeReceipt: fault }));
      // Proof: pending-state and DELETE500 removals accept completed deletion or actual modeled404 as partial-failure evidence.
      const tag = join(
        installed.ordinary.path,
        'docker/registry/v2/repositories/retained/expired/_manifests/tags/expired/current/link',
      );
      // Proof: separate receipt-equality and physical-lstat removals each accept its mismatching-mode negative.
      if (
        tagFault.restoredMode !== tagFault.originalMode ||
        ((await lstat(tag)).mode & 0o7777) !== tagFault.originalMode
      )
        throw new Error('Tag link original mode was not restored');
      if (
        !(await absent(manifestPath(expired.repository, expired.root))) ||
        (await readFile(tag, 'utf8')) !== expired.root ||
        evidence.deletions[0]?.state !== 'pending' ||
        journal.retirements.some((receipt) => receipt.operationId === evidence.operationId) ||
        actions.includes('collect:entered\n') ||
        !http.observation.events.some(
          (event) => event.method === 'DELETE' && event.path === 'manifest' && event.status === 500,
        )
      )
        throw new Error('Tag failure lacks actual500 after unlink with pending deletion and no GC');
      console.log(
        JSON.stringify({
          deletionFault: {
            mode,
            deleteStatus: 500,
            revisionAbsent: true,
            danglingTag: true,
            ownerFailed: true,
            fenced: true,
          },
        }),
      );
    }
    stage = 'protected-read';
    const readonly = await startRegistryFixtureGuard(installed);
    try {
      await readonly.waitMode('readonly');
      for (const digest of mode !== 'unsafe-gc' ? protectedIndex.manifests : [protectedIndex.root])
        await verifyDeletionContent('manifests', digest);
      if (mode !== 'unsafe-gc')
        for (const digest of protectedIndex.blobs) await verifyDeletionContent('blobs', digest);
    } finally {
      await readonly.close();
    }
    if (mode === 'tag-recovery' || mode === 'restore-kill' || mode === 'gc-kill') {
      const lockBefore = await lstat(join(installed.journalPath, 'authority.lock'));
      let censusActions = allActions;
      if (mode !== 'gc-kill') {
        stage = 'partial-census';
        await writeFile(
          '/etc/puni/registry-fixture-retirement-clock.json',
          JSON.stringify({ now: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString() }),
          { mode: 0o644 },
        );
        const census = await run('deletion-census');
        console.log(
          JSON.stringify({ partialCensusOwner: observeRegistryPopulationOutput(census.stderr) }),
        );
        const censusHttp = readRegistryHttpObservationOutput(census.stderr);
        console.log(JSON.stringify({ partialCensusHttp: censusHttp }));
        const censusMarkers = census.stderr
          .split('\n')
          .filter((line) => line.startsWith('task8-partial-census:'));
        // Proof (fixture): removing this refusal accepts owner success as a failed pre-API census.
        if (
          census.code !== 1 ||
          censusMarkers.length !== 1 ||
          censusMarkers[0] !== 'task8-partial-census:current-tag-without-revision' ||
          censusHttp.state !== 'valid' ||
          censusHttp.observation?.pending !== 0 ||
          censusHttp.observation.events.length !== 0
        )
          throw new Error('Partial census lacks exact failed pre-API refusal');
        const censusState: unknown = JSON.parse(
          await readFile(join(installed.journalPath, 'journal.json'), 'utf8'),
        );
        const stillFailed = parseRegistryCommandResponse({ state: censusState }).state;
        censusActions = await readFile('/root/task8-fixture/actions.log', 'utf8');
        // Proof (fixture): removal accepts rewritten action history; the bootstrap restore prefix remains legitimate.
        if (!censusActions.startsWith(actionsBefore))
          throw new Error('Partial census action history changed');
        const censusSuffix = censusActions.slice(actionsBefore.length);
        // Proof (fixture): refusal removal accepts a changed backup or missing maintenance schema.
        if (
          stillFailed.schemaVersion !== 4 ||
          !stillFailed.fenced ||
          stillFailed.maintenance?.phase !== 'failed' ||
          stillFailed.maintenance.operationId !== evidence.operationId ||
          JSON.stringify(stillFailed.maintenanceEvidence?.backup) !==
            JSON.stringify(evidence.backup) ||
          stillFailed.maintenanceEvidence?.deletions[0]?.state !== 'pending' ||
          censusSuffix.includes('collect:entered\n') ||
          censusSuffix.includes('restore-service:entered\n')
        )
          throw new Error('Partial census changed failed retirement lineage');
      }
      if (mode === 'restore-kill') {
        stage = 'restore-interruption';
        // Proof (modeled controller): registry-restore-controller.test.ts loses refusal of unenrolled target when this check is removed.
        if (installed.recovery.state !== 'enrolled')
          throw new Error('Restore interruption requires enrolled recovery target');
        const diagnosticPath = '/root/task8-fixture/restore-worker-failure.json';
        // Proof (modeled controller): registry-restore-controller.test.ts loses refusal of diagnostic from an earlier attempt when this check is removed.
        if (!(await absent(diagnosticPath)))
          throw new Error('Restore interruption diagnostic predates this attempt');
        const expected = {
          operationId: evidence.operationId,
          snapshotId: evidence.backup.snapshotId,
          registryPath: evidence.backup.registryPath,
          journalPath: evidence.backup.journalPath,
          targetRegistryPath: installed.recovery.path,
          targetJournalPath: installed.recovery.stagedJournalPath,
        };
        await writeFile(
          '/root/task8-fixture/restore-interruption.json',
          JSON.stringify({ ...expected, state: 'armed' }),
          { mode: 0o600, flag: 'wx' },
        );
        const armed = inspectRegistryRestoreFault(expected);
        await writeFile(
          '/etc/puni/registry-fixture-retirement-clock.json',
          JSON.stringify({ now: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString() }),
          { mode: 0o644 },
        );
        const interrupted = await run('deletion-recover');
        console.log(
          JSON.stringify({
            restoreInterruptedOwner: observeRegistryPopulationOutput(interrupted.stderr),
          }),
        );
        const interruptedHttp = readRegistryHttpObservationOutput(interrupted.stderr);
        console.log(JSON.stringify({ restoreInterruptedHttp: interruptedHttp }));
        // Proof (modeled controller): registry-restore-controller.test.ts loses refusal of successful owner instead of the required failed restore when this check is removed.
        if (
          interrupted.code !== 1 ||
          interruptedHttp.state !== 'valid' ||
          interruptedHttp.observation?.pending !== 0 ||
          interruptedHttp.observation.events.length !== 0
        )
          throw new Error('Restore interruption lacks failed pre-verification owner');
        const ownerFailure = new Error('Restore interruption owner failed', {
          cause: observeRegistryPopulationOutput(interrupted.stderr),
        });
        let diagnosticWorker: number;
        try {
          const diagnosticBytes = await readFile(diagnosticPath, 'utf8');
          // Proof (modeled controller): registry-restore-controller.test.ts loses refusal of valid but oversized diagnostic when this check is removed.
          if (Buffer.byteLength(diagnosticBytes) > 4096)
            throw new Error('Restore worker diagnostic exceeds bound');
          // Proof (modeled controller): registry-restore-controller.test.ts loses refusal of unexpected diagnostic field when this check is removed.
          const diagnostic = type({
            worker: 'number.safe > 0',
            observation: '0 < string <= 4096',
            '+': 'reject',
          }).assert(JSON.parse(diagnosticBytes));
          const observation = observeRegistryPopulationOutput(diagnostic.observation);
          // Proof (modeled controller): registry-restore-controller.test.ts loses refusal of invalid bounded-observer result when this check is removed.
          if (!observation.bounded || observation.diagnostic !== 'valid')
            throw new Error('Restore worker diagnostic is not a valid bounded observation');
          console.log(
            JSON.stringify({
              restoreWorkerObservation: { worker: diagnostic.worker, observation },
            }),
          );
          diagnosticWorker = diagnostic.worker;
        } catch (cause) {
          // Boundary: preserve the failed-owner outcome as cause and the diagnostic failure in AggregateError.errors.
          throw new AggregateError(
            [ownerFailure, cause],
            // Proof (cause retention): registry-restore-controller.test.ts loses the bounded failed-owner outcome if this aggregation is removed.
            'Restore failure diagnostic is unconfirmed',
            // eslint-disable-next-line preserve-caught-error
            { cause: ownerFailure },
          );
        }
        const consumed = inspectRegistryRestoreFault(expected);
        // Proof (modeled controller): registry-restore-controller.test.ts loses refusal of replaced state inode when this check is removed.
        if (
          consumed.state !== 'consumed' ||
          consumed.dev !== armed.dev ||
          consumed.ino !== armed.ino
        )
          throw new Error('Restore interruption did not consume its exact armed state');
        const terminal = consumed.terminal;
        // Proof (modeled controller): registry-restore-controller.test.ts loses refusal of diagnostic for another worker when this check is removed.
        if (terminal.worker !== diagnosticWorker)
          throw new Error('Restore worker diagnostic belongs to another attempt');
        const bytes = await readFile('/root/task8-fixture/restore-interruption.log', 'utf8');
        // Proof (modeled controller): registry-restore-controller.test.ts loses refusal of oversized or multiline terminal log when this check is removed.
        if (Buffer.byteLength(bytes) > 4096 || bytes.trimEnd().split('\n').length !== 1)
          throw new Error('Restore interruption terminal receipt is not bounded and unique');
        // Proof (modeled controller): registry-restore-controller.test.ts loses refusal of unexpected terminal receipt field when this check is removed.
        const observed = type({
          restoreInterruption: {
            worker: 'number.safe > 0',
            pid: 'number.safe > 0',
            startTicks: /^[1-9][0-9]{0,19}$/,
            group: 'number.safe > 0',
            exitCode: '137',
            signal: "'SIGKILL'",
            '+': 'reject',
          },
          '+': 'reject',
        }).assert(JSON.parse(bytes)).restoreInterruption;
        // Proof (modeled controller): registry-restore-controller.test.ts loses refusal of terminal fields differing from consumed state when this check is removed.
        if (Object.entries(terminal).some(([key, value]) => Reflect.get(observed, key) !== value))
          throw new Error('Restore interruption terminal differs from consumed state');
        for (const pid of [terminal.worker, terminal.pid]) {
          let absent = false;
          try {
            await readFile(`/proc/${String(pid)}/stat`, 'utf8');
          } catch (cause) {
            // Proof (modeled controller): restore-proc-error removal accepts a non-Error ENOENT object as process absence.
            if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') absent = true;
            else throw cause;
          }
          // Proof (modeled controller): registry-restore-controller.test.ts loses refusal of still-present worker when this check is removed.
          if (!absent) throw new Error('Interrupted restore process remains before retry');
        }
        let groupAbsent = false;
        try {
          process.kill(-terminal.group, 0);
        } catch (cause) {
          // Proof (modeled controller): restore-group-error removal accepts a non-Error ESRCH object as group absence.
          if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')
            groupAbsent = true;
          else throw cause;
        }
        // Proof (modeled controller): registry-restore-controller.test.ts loses refusal of still-live worker group when this check is removed.
        if (!groupAbsent) throw new Error('Interrupted restore worker group remains before retry');
        const failedState: unknown = JSON.parse(
          await readFile(join(installed.journalPath, 'journal.json'), 'utf8'),
        );
        const failed = parseRegistryCommandResponse({ state: failedState }).state;
        // Proof (modeled controller): registry-restore-controller.test.ts loses refusal of changed matching-backup lineage when this check is removed.
        if (
          failed.schemaVersion !== 4 ||
          !failed.fenced ||
          failed.maintenance?.phase !== 'failed' ||
          failed.maintenance.operationId !== evidence.operationId ||
          JSON.stringify(failed.maintenanceEvidence?.backup) !== JSON.stringify(evidence.backup)
        )
          throw new Error('Interrupted restore lost durable failed backup lineage');
        const interruptedActions = await readFile('/root/task8-fixture/actions.log', 'utf8');
        // Proof (modeled controller): registry-restore-controller.test.ts loses refusal of rewritten action-history prefix when this check is removed.
        if (!interruptedActions.startsWith(censusActions))
          throw new Error('Interrupted restore action history changed');
        const interruptedSuffix = interruptedActions.slice(censusActions.length);
        // Proof (modeled controller): registry-restore-controller.test.ts loses refusal of verification or serving before retry when this check is removed.
        if (
          !interruptedSuffix.includes('backup-restore:entered\n') ||
          interruptedSuffix.includes('backup-restore:completed\n') ||
          interruptedSuffix.includes('serve-recovery:entered\n') ||
          interruptedSuffix.includes('restore-service:entered\n')
        )
          throw new Error('Interrupted restore reached verification or service before retry');
        console.log(
          JSON.stringify({
            restoreKilledBeforeRetry: {
              ...terminal,
              workerAndChildAbsent: true,
              groupAbsent: true,
              fenced: true,
            },
          }),
        );
      }
      stage = 'staged-recovery';
      await writeFile(
        '/etc/puni/registry-fixture-retirement-clock.json',
        JSON.stringify({ now: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString() }),
        { mode: 0o644 },
      );
      const recovery = await run('deletion-recover');
      console.log(
        JSON.stringify({ partialRecoveryOwner: observeRegistryPopulationOutput(recovery.stderr) }),
      );
      const recoveryHttp = readRegistryHttpObservationOutput(recovery.stderr);
      console.log(JSON.stringify({ partialRecoveryHttp: recoveryHttp }));
      // Proof (fixture): removal certifies a failed recovery owner as a verified handoff.
      if (
        recovery.code !== 0 ||
        recovery.stdout.trim() !== 'partial-recovery-staged-fenced' ||
        recoveryHttp.state !== 'valid' ||
        recoveryHttp.observation?.pending !== 0 ||
        !recoveryHttp.observation.events.some(
          (event) => event.method === 'GET' && event.path === 'manifest' && event.status === 200,
        )
      )
        throw new Error('Partial recovery lacks completed verified owner');
      const recoveryState: unknown = JSON.parse(
        await readFile(join(installed.journalPath, 'journal.json'), 'utf8'),
      );
      const restored = parseRegistryCommandResponse({ state: recoveryState }).state;
      // Proof (fixture): removal accepts a modeled non-maintenance current journal.
      if (restored.schemaVersion !== 4) throw new Error('Partial recovery lost maintenance schema');
      const receipt = requireRegistryRecoveryReceipt(restored, installed.journalPath);
      const lockAfter = await lstat(join(installed.journalPath, 'authority.lock'));
      // Proof (fixture): refusal removal accepts lost current protection or a replaced canonical lock inode.
      if (
        installed.recovery.state !== 'enrolled' ||
        !restored.fenced ||
        restored.maintenance?.phase !== 'restored' ||
        restored.enrollment.registryPath !== installed.recovery.path ||
        restored.enrollment.storageId !== installed.recovery.storageId ||
        receipt.stagedJournalPath !== installed.recovery.stagedJournalPath ||
        JSON.stringify(restored.bundles) !== originals ||
        JSON.stringify(restored.protections) !== JSON.stringify(journal.protections) ||
        JSON.stringify(restored.consumers) !== JSON.stringify(journal.consumers) ||
        JSON.stringify(restored.environments) !== JSON.stringify(journal.environments) ||
        JSON.stringify(restored.deployments) !== JSON.stringify(journal.deployments) ||
        lockAfter.ino !== lockBefore.ino ||
        lockAfter.dev !== lockBefore.dev
      )
        throw new Error('Partial recovery changed current obligations or canonical authority');
      const staged = await readFile(join(receipt.stagedJournalPath, 'journal.json'));
      // Proof (fixture): removal accepts mismatching offline journal bytes.
      if (createHash('sha256').update(staged).digest('hex') !== evidence.backup.journalSha256)
        throw new Error('Partial recovery staged journal differs from verified backup');
      const oldTag = join(
        installed.ordinary.path,
        'docker/registry/v2/repositories/retained/expired/_manifests/tags/expired/current/link',
      );
      const expiredRevision = manifestPath(expired.repository, expired.root);
      const recoveredRevision = join(
        installed.recovery.path,
        expiredRevision.slice(installed.ordinary.path.length + 1),
      );
      // Proof (fixture): removal certifies changed old-store damage as preserved.
      if (
        !(await absent(expiredRevision)) ||
        // Proof (modeled controller): removing the GC old-tag absence requirement accepts a leftover tag in registry-partial-controller.test.ts.
        (mode === 'gc-kill'
          ? !(await absent(oldTag))
          : (await readFile(oldTag, 'utf8')) !== expired.root) ||
        (await readFile(recoveredRevision, 'utf8')) !== expired.root
      )
        throw new Error(
          'Partial recovery did not preserve old damage and restore matching revision',
        );
      const recoveryActions = await readFile('/root/task8-fixture/actions.log', 'utf8');
      // Proof (fixture): removal accepts rewritten recovery action history.
      if (!recoveryActions.startsWith(censusActions))
        throw new Error('Partial recovery action history changed');
      const recoverySuffix = recoveryActions.slice(censusActions.length);
      // Proof (fixture): removal accepts serving restoration after recovery instead of a fenced handoff.
      if (
        !recoverySuffix.includes('backup-restore:completed\n') ||
        !recoverySuffix.includes('serve-recovery:entered\n') ||
        recoverySuffix.includes('restore-service:entered\n') ||
        recoverySuffix.includes('collect:entered\n')
      )
        throw new Error('Partial recovery did not stop at verified fenced handoff');
      console.log(
        JSON.stringify({
          stagedFencedHandoff: {
            strictPartialCensusRefusedBeforeApi: mode !== 'gc-kill',
            matchingOfflineJournal: true,
            currentObligationsPreserved: true,
            canonicalLockPreserved: true,
            oldStorePreserved: true,
            recoveredRevisionPresent: true,
            servingActivationPending: true,
          },
        }),
      );
    }
    console.log(
      JSON.stringify({
        proof: 'owned-deletion-failure',
        mode,
        protectedIndexExplicit: true,
        originalProvenancePreserved: true,
        recoveryRequired: true,
        synthetic:
          'Kubernetes/readers/provider admission; post-publication authority clock plus8days; no deployment history or Docker replay',
      }),
    );
  } catch (cause) {
    console.log(
      JSON.stringify({
        deletionFailure: { mode, stage, ...describeRegistryGuardObservationFailure(cause) },
      }),
    );
    throw cause;
  }
}

async function verifyDeletionContent(kind: 'manifests' | 'blobs', digest: string): Promise<void> {
  const response = await fetch('http://127.0.0.1:5052/v2/retained/index/' + kind + '/' + digest, {
    headers: {
      accept: 'application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json',
    },
    signal: AbortSignal.timeout(5000),
  });
  const bytes = await readRegistryBytes(response.body, 65536, 'Owned protected deletion content');
  if (
    response.status !== 200 ||
    'sha256:' + createHash('sha256').update(bytes).digest('hex') !== digest
  )
    throw new Error('Protected deletion fixture content changed');
}
