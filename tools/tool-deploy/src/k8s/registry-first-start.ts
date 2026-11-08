import {
  closeSync,
  fsyncSync,
  openSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

import {
  advanceRegistryHistory,
  parseRegistryHistory,
  readRegistryOwnerFile,
  readRegistrySource,
  type RegistryHistory,
} from '@tools/registry-publication';
import { type } from 'arktype';

import { type FirstStartRequest, parseFirstStartRequest } from './first-start';
import {
  type FirstStartProgress,
  parseFirstStartProgress,
  requireFirstStartFields,
} from './first-start-state';
import { sha256Of } from './migration-capture';
import type { ReleaseRegistryBinding } from './release';

/** Version3 owns managed history; version2 is compatible only without ownership fields. */
export interface RegistryFirstStartState extends FirstStartProgress {
  version: 2 | 3;
  registry?: ReleaseRegistryBinding | null;
  registryHistory?: RegistryHistory | null;
  registryTransfer?: { destination: string; sourceBytes: string; sha256: string };
}

/** Missing is a new transaction; malformed/unreadable state always throws. */
export interface RegistryFirstStartJournal {
  path: string;
  read(): unknown;
  write(state: RegistryFirstStartState): void;
}

/** Validates sealed disk state before any Lease or cluster mutation, including terminal receipts. */
export function parseRegistryFirstStartState(
  raw: unknown,
  request: FirstStartRequest,
  path: string,
): RegistryFirstStartState {
  const fields = requireFirstStartFields(raw);
  // Proof: removing this check accepted unsupported version4 without optional ownership metadata.
  if (fields['version'] !== 2 && fields['version'] !== 3)
    throw new Error('first-start state belongs to another request or version');
  parseFirstStartProgress(fields, request);
  if (fields['version'] === 3) {
    const binding = type.or('null', {
      registryId: 'string > 0',
      operationId: 'string > 0',
      references: type({ repository: 'string > 0', digest: /^sha256:[0-9a-f]{64}$/, '+': 'reject' })
        .array()
        .atLeastLength(1),
      '+': 'reject',
    })(fields['registry']);
    if (
      binding instanceof type.errors ||
      // Proof: omitting equality accepted foreign operation binding in managed first-start corruption.
      (binding !== null && binding.operationId !== fields['transaction'])
    )
      throw new Error('first-start has an invalid registry binding');
    if (binding === null) {
      if (fields['registryHistory'] !== null)
        throw new Error('Unmanaged first-start carries registry history');
    } else {
      const history = parseRegistryHistory(fields['registryHistory'], path);
      // Proof: omitting scope comparison accepted foreign target history in registry-first-start.test.ts.
      if (history.registryId !== binding.registryId || history.target !== firstStartTarget(request))
        throw new Error('First-start registry history scope differs');
    }
  } else if (fields['registry'] !== undefined || fields['registryHistory'] !== undefined)
    throw new Error('legacy first-start cannot carry a registry binding');
  if (fields['registryTransfer'] !== undefined) {
    const transfer = type({
      destination: type('string > 0').narrow(isAbsolute),
      sourceBytes: 'string > 0',
      sha256: /^[0-9a-f]{64}$/,
      '+': 'reject',
    })(fields['registryTransfer']);
    if (
      transfer instanceof type.errors ||
      transfer.destination === path ||
      // Proof: digest-check removal accepted a changed transfer checksum in managed envelope tests.
      transfer.sha256 !== sha256Of(transfer.sourceBytes) ||
      fields['phase'] !== 'complete'
    )
      throw new Error('Malformed first-start history transfer');
    const sealed = requireFirstStartFields(JSON.parse(transfer.sourceBytes) as unknown);
    const current = { ...fields };
    delete current['registryTransfer'];
    if (
      sealed['registryTransfer'] !== undefined ||
      // Proof: seal comparison removal accepted resealed changed source bytes before history reads.
      JSON.stringify(sealed) !== JSON.stringify(current)
    )
      throw new Error('First-start history transfer source changed');
  }
  // Boundary: protocol fields, phase, request binding and receipt were checked above.
  return fields as unknown as RegistryFirstStartState;
}

/** Atomic fsync/rename state, in the protected operator state directory. */
export function registryFirstStartJournal(path: string): RegistryFirstStartJournal {
  return {
    path,
    read() {
      try {
        const parsed: unknown = JSON.parse(readRegistryOwnerFile(path));
        // Proof: null-file omission treated malformed trusted state as absent in the durable-file test.
        if (parsed === null) throw new Error('first-start state cannot be null');
        return parsed;
      } catch (cause) {
        if (
          typeof cause === 'object' &&
          cause !== null &&
          'code' in cause &&
          cause.code === 'ENOENT'
        )
          return null;
        throw new Error(`first-start state ${path} is unreadable or malformed`, { cause });
      }
    },
    write(state) {
      const serialized = `${JSON.stringify(state)}\n`;
      // Proof: guard removal wrote an oversized managed owner file in the write-budget negative.
      if (Buffer.byteLength(serialized) > 4 * 1024 ** 2)
        throw new Error('First-start owner journal capacity exceeded');
      const pending = join(dirname(path), `.${String(process.pid)}.first-start`);
      const fd = openSync(pending, 'w', 0o600);
      try {
        writeSync(fd, serialized);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(pending, path);
      const directory = openSync(dirname(path), 'r');
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
    },
  };
}

/** Stable authority operation shared by export, manifest creation and first-start recovery. */
export function firstStartOperation(descriptorSha256: string, target: string): string {
  return `first-start-${sha256Of(JSON.stringify([descriptorSha256, target])).slice(0, 16)}`;
}

/** Bind image ownership to immutable cluster identity and both consumer namespaces. */
export function firstStartTarget(request: FirstStartRequest): string {
  return `k8s:${request.cluster.uid}/${request.namespaces.app}/${request.namespaces.backend}`;
}

/** Initialize first-start's own empty history before any image-bearing source exists; never overwrite. */
export async function initializeFirstStartHistory(
  path: string,
  scope: { registryId: string; product: string; environment: string; target: string },
  observe: () => Promise<{
    sourceRevision: string;
    images: readonly string[];
    hasReleaseEvidence: boolean;
  }>,
): Promise<void> {
  const directory = dirname(path);
  const status = statSync(directory);
  if (
    !isAbsolute(path) ||
    realpathSync(directory) !== directory ||
    !status.isDirectory() ||
    status.uid !== process.getuid?.() ||
    (status.mode & 0o777) !== 0o700
  )
    throw new Error('First-start history directory is not canonical and owner-only');
  const source = await observe();
  // Proof: a retained release ConfigMap with zero images was accepted by initialization without this evidence check.
  if (source.images.length !== 0 || source.hasReleaseEvidence)
    throw new Error('Existing release evidence prevents first-install history initialization');
  const registryHistory = parseRegistryHistory(
    {
      ...scope,
      schemaVersion: 1,
      source: path,
      genesis: { at: new Date().toISOString(), sourceRevision: source.sourceRevision },
      authorityRevision: 0,
      releases: [],
      promotion: null,
    },
    path,
  );
  const descriptor = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(
      descriptor,
      `${JSON.stringify({ version: 3, kind: 'registry-genesis', registryHistory })}\n`,
    );
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  const parent = openSync(directory, 'r');
  try {
    fsyncSync(parent);
  } finally {
    closeSync(parent);
  }
}

/** Only an explicitly initialized first-start journal may establish empty managed history. */
export function parseFirstStartGenesis(input: unknown, path: string): RegistryHistory | undefined {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('kind' in input) ||
    input.kind !== 'registry-genesis'
  )
    return undefined;
  const genesis = type({
    version: '3',
    kind: "'registry-genesis'",
    registryHistory: 'unknown',
    '+': 'reject',
  })(input);
  if (genesis instanceof type.errors) throw new Error('Malformed first-start history genesis');
  const history = parseRegistryHistory(genesis.registryHistory, path);
  // Proof: guard removal accepted populated genesis in registry-first-start.test.ts.
  if (history.releases.length !== 0 || history.promotion !== null)
    throw new Error('First-start genesis is not empty');
  return history;
}

/** Transfer completed source-owned history using its immutable bytes and a fresh authority receipt. */
export async function inheritFirstStartHistory(
  source: string,
  path: string,
  verify: (history: RegistryHistory) => Promise<unknown>,
): Promise<void> {
  const directory = dirname(path);
  const status = statSync(directory);
  if (
    !isAbsolute(path) ||
    source === path ||
    realpathSync(directory) !== directory ||
    !status.isDirectory() ||
    status.uid !== process.getuid?.() ||
    (status.mode & 0o777) !== 0o700
  )
    throw new Error('Release history directory is not canonical and owner-only');
  const snapshot = await readRegistrySource(source);
  const fields = requireFirstStartFields(JSON.parse(snapshot.text) as unknown);
  if (typeof fields['requestBytes'] !== 'string')
    throw new Error('First-start has no immutable request');
  const request = parseFirstStartRequest(JSON.parse(fields['requestBytes']) as unknown);
  const state = parseRegistryFirstStartState(fields, request, source);
  if (
    state.phase !== 'complete' ||
    state.registry == null ||
    state.registryHistory?.promotion?.operationId !== state.transaction
  )
    throw new Error('First-start history transfer requires completed authority promotion');
  const history = advanceRegistryHistory(
    state.registryHistory,
    await verify(state.registryHistory),
  );
  if (JSON.stringify(history) !== JSON.stringify(state.registryHistory))
    throw new Error('First-start source history differs from authority');
  if (state.registryTransfer !== undefined && state.registryTransfer.destination !== path)
    throw new Error('First-start history was transferred elsewhere');
  const sourceBytes = state.registryTransfer?.sourceBytes ?? snapshot.text;
  const registryHistory = parseRegistryHistory(
    {
      ...history,
      source: path,
      inheritance: { source, sha256: sha256Of(sourceBytes), operationId: state.transaction },
    },
    path,
  );
  const serialized = `${JSON.stringify({ schemaVersion: 4, kind: 'registry-inheritance', registryHistory })}\n`;
  // Record ownership transfer before creating the destination: a missing destination then refuses,
  // and the exact sealed source supports retry without inferring first-install from absence.
  if (state.registryTransfer === undefined)
    registryFirstStartJournal(source).write({
      ...state,
      registryTransfer: { destination: path, sourceBytes, sha256: sha256Of(sourceBytes) },
    });
  let descriptor: number;
  try {
    descriptor = openSync(path, 'wx', 0o600);
  } catch (cause) {
    if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'EEXIST') {
      if ((await readRegistrySource(path)).text === serialized) return;
      throw new Error('Release history transfer destination already contains different state', {
        cause,
      });
    }
    throw cause;
  }
  try {
    writeFileSync(descriptor, serialized);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  const parent = openSync(directory, 'r');
  try {
    fsyncSync(parent);
  } finally {
    closeSync(parent);
  }
}
