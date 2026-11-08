import { readFile, writeFile } from 'node:fs/promises';

import { describeRegistryGuardObservationFailure } from './registry-guard-observation.fixture';
import type { RegistryIndexPublication } from './registry-index-authority.fixture';
import { startRegistryFixtureGuard } from './registry-maintenance-guard.fixture';
import { prepareRegistryHostFixture } from './registry-maintenance-host.fixture';
import {
  readRegistryIndexPublication,
  verifyAbsent,
  verifyPresent,
  verifyTags,
} from './registry-maintenance-index.native';
import { parseRegistryCommandResponse } from './registry-managed-journal';
import { observeRegistryPopulationOutput } from './registry-population-diagnostics.fixture';
import {
  prepareRegistryRetentionReaders,
  refreshRegistryRetentionHistory,
  requireRegistryRetentionHistory,
} from './registry-retention-history.fixture';

type RunOwner = (mode: string) => Promise<{ code: number; stdout: string; stderr: string }>;

/** Count exactly one census line using LF splitting; absent, duplicated or nonexact lines refuse retirement evidence. */
export function requireRegistryHistoryCensus(stderr: string): void {
  // Proof: missing/duplicate receipt cases fail when exact-one admission is removed; nonexact or CRLF lines are not the fixed LF receipt.
  if (
    stderr.split('\n').filter((line) => line === 'task8-history-census:all-promoted-no-staging')
      .length !== 1
  )
    throw new Error('Native history pre-effect census receipt is absent or duplicated');
}

/** Fourteen actual managed publications and strictly ordered original promotions. Two complete synthetic environment readers expose current3/prior2,1 outside newest5–14. Real authority clocks and durable deployment protections remain intact; native backup/retirement/census/API reads prove only release4 disappears. No Docker or elapsed-grace claim. */
export async function proveRegistryRetentionHost(run: RunOwner): Promise<void> {
  let stage: 'setup' | 'bootstrap' | 'publish' | 'promote' | 'retire' | 'retained' = 'setup';
  try {
    const { installed } = await prepareRegistryHostFixture();
    await prepareRegistryRetentionReaders();
    await writeFile('/root/task8-fixture/admission', 'fixture', { mode: 0o600 });
    const invoke = async (mode: string, expected: string) => {
      const completed = await run(mode);
      if (completed.code !== 0 || completed.stdout.trim() !== expected) {
        console.log(
          JSON.stringify({
            indexOwnerFailure: {
              mode,
              observation: observeRegistryPopulationOutput(completed.stderr),
            },
          }),
        );
        throw new Error('History owner stage failed');
      }
      return completed;
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
    const publications: (typeof RegistryIndexPublication.infer)[] = [];
    const guard = await startRegistryFixtureGuard(installed, {
      signal: new AbortController().signal,
      initialMode: 'readonly',
      interceptPermissionReads: false,
    });
    try {
      await invoke('index-reopen', 'population-writable-permitted');
      await guard.waitMode('writable');
      for (const revision of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const) {
        stage = 'publish';
        const published = await run('index-publish-' + String(revision));
        publications.push(readRegistryIndexPublication(revision, published));
        await writeFile(
          '/etc/puni/registry-retention-publications.json',
          JSON.stringify(publications),
          { mode: 0o644 },
        );
        stage = 'promote';
        await invoke('history-promote-' + String(revision), 'history-promoted');
        await refreshRegistryRetentionHistory();
      }
      await verifyTags(
        publications.map((publication) => 'release-' + String(publication.revision)).sort(),
      );
    } finally {
      await guard.close();
    }
    const readJournal = async () =>
      parseRegistryCommandResponse({
        state: JSON.parse(await readFile(installed.journalPath + '/journal.json', 'utf8')),
      } satisfies { state: unknown }).state;
    const before = await readJournal();
    const operations = publications.map((publication) => publication.operationId);
    requireRegistryRetentionHistory(before, operations);
    const expired = publications.find((publication) => publication.revision === 4);
    if (expired === undefined) throw new Error('History release4 receipt is absent');
    const retained = publications.filter((publication) => publication.revision !== 4);
    stage = 'retire';
    const completed = await invoke('history-retire', 'verified-native-retirement');
    requireRegistryHistoryCensus(completed.stderr);
    const after = await readJournal();
    requireRegistryRetentionHistory(after, operations);
    if (
      JSON.stringify(after.bundles) !== JSON.stringify(before.bundles) ||
      JSON.stringify(after.environments) !== JSON.stringify(before.environments)
    )
      throw new Error('History retirement rewrote original publication or environment provenance');
    if (
      after.schemaVersion !== 4 ||
      after.maintenance !== null ||
      !after.fenced ||
      after.lastVerifiedBackup === null
    )
      throw new Error('History retirement lacks terminal verified backup and fence');
    const retirement = after.retirements.find(
      (receipt) => receipt.operationId === 'native-host-retire',
    );
    if (
      retirement === undefined ||
      JSON.stringify(retirement.operations) !== JSON.stringify([expired.operationId]) ||
      retirement.deletions.length !== 3 ||
      retirement.deletions.some(
        (deletion) =>
          deletion.repository !== 'retained/index' || !expired.manifests.includes(deletion.digest),
      )
    )
      throw new Error('History retirement did not delete exactly release4 closure');
    stage = 'retained';
    const readonly = await startRegistryFixtureGuard(installed);
    try {
      await readonly.waitMode('readonly');
      await verifyTags(
        retained.map((publication) => 'release-' + String(publication.revision)).sort(),
      );
      const surviving = new Set(
        retained.flatMap((publication) => [...publication.manifests, ...publication.blobs]),
      );
      for (const publication of retained) {
        for (const digest of publication.manifests) await verifyPresent('manifests', digest);
        for (const digest of publication.blobs) await verifyPresent('blobs', digest);
      }
      for (const digest of expired.manifests) await verifyAbsent('manifests', digest);
      for (const digest of expired.blobs)
        if (!surviving.has(digest)) await verifyAbsent('blobs', digest);
    } finally {
      await readonly.close();
    }
    console.log(
      JSON.stringify({
        proof: 'managed-retention-history',
        publications: 14,
        promoted: 14,
        current: [3, 14],
        priorOutsideNewestTen: [1, 2],
        newestTen: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
        retired: [4],
        retiredManifests: 3,
        retainedIndexes: 13,
        untaggedChildrenRetained: 26,
        originalProvenanceUnchanged: true,
        strictlyOrderedOriginalPromotions: true,
        noUnfinishedOrStagedContent: true,
        realAuthorityClock: true,
        fenceRetained: true,
        synthetic:
          'Kubernetes, complete consumer/history observations, and local provider admission',
      }),
    );
  } catch (cause) {
    console.log(
      JSON.stringify({
        indexFailure: { stage, ...describeRegistryGuardObservationFailure(cause) },
      }),
    );
    throw cause;
  }
}
