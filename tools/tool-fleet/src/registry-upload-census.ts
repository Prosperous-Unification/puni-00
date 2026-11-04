import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, rmdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import type { RegistryJournal } from './registry-journal';

const Repository = type(
  /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*)*$/,
);
const UploadId = type(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
/** Native Distribution upload paths are a bounded UUID namespace, never arbitrary caller paths. */
export const RegistryUploadCensus = type({
  operationId: '0 < string <= 256',
  repository: Repository,
  uploadId: UploadId,
  digest: /^sha256:[a-f0-9]{64}$/,
  files: type({
    name: /^(?:data|startedat|hashstates\/sha256\/(?:0|[1-9][0-9]*))$/,
    size: 'number.safe >= 0',
    sha256: /^[a-f0-9]{64}$/,
    '+': 'reject',
  })
    .array()
    .atLeastLength(3)
    .atMostLength(2048),
  bytes: 'number.safe >= 0',
  inodes: 'number.safe > 0',
  '+': 'reject',
});
export type RegistryUploadCensus = typeof RegistryUploadCensus.infer;

/**
 * Hash the real staged bytes and native SHA-state files. UUID intent must have been durable
 * before the body; declarations are only limits, never evidence that content exists.
 * Pinned Distribution POST/PATCH probes establish data+startedat+hashstates/sha256/N;
 * unowned UUIDs, symlinks, unknown entries, oversized bodies and malformed state refuse.
 */
export async function readRegistryUpload(
  journal: RegistryJournal,
  repository: string,
  uploadId: string,
): Promise<RegistryUploadCensus> {
  Repository.assert(repository);
  UploadId.assert(uploadId);
  if (journal.schemaVersion !== 4)
    throw new Error('Unowned registry upload lacks schema4 evidence');
  const owners = journal.publicationEvidence.filter((evidence) =>
    evidence.writes.some((write) => write.repository === repository && write.uploadId === uploadId),
  );
  const evidence = owners.at(0);
  const write = evidence?.writes.find(
    (write) => write.repository === repository && write.uploadId === uploadId,
  );
  const content = evidence?.contents.find(
    (content) => content.repository === repository && content.digest === write?.digest,
  );
  // Proof: removing the writing-phase predicate admitted completed staging (task8-removal-upload-intent-phase.log).
  if (
    owners.length !== 1 ||
    evidence === undefined ||
    write === undefined ||
    content === undefined ||
    content.isManifest ||
    write.phase !== 'writing'
  )
    throw new Error('Unowned registry upload or contradictory completed write');
  const base = join(
    journal.enrollment.registryPath,
    'docker/registry/v2/repositories',
    repository,
    '_uploads',
    uploadId,
  );
  const ancestors = [
    'docker',
    'registry',
    'v2',
    'repositories',
    ...repository.split('/'),
    '_uploads',
    uploadId,
  ];
  let ancestor = journal.enrollment.registryPath;
  for (const segment of ['', ...ancestors]) {
    ancestor = join(ancestor, segment);
    const status = await lstat(ancestor);
    if (!status.isDirectory() || status.isSymbolicLink() || (status.mode & 0o500) !== 0o500)
      throw new Error('Unreadable registry upload directory');
  }
  const names: string[] = [];
  let bytes = 0;
  let inodes = 0;
  const walk = async (relative: string): Promise<void> => {
    const path = join(base, relative);
    const status = await lstat(path);
    if (!status.isDirectory() || (status.mode & 0o500) !== 0o500)
      throw new Error('Unreadable registry upload directory');
    bytes += status.blocks * 512;
    inodes++;
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const name = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory() && ['hashstates', 'hashstates/sha256'].includes(name))
        await walk(name);
      else if (
        entry.isFile() &&
        /^(?:data|startedat|hashstates\/sha256\/(?:0|[1-9][0-9]*))$/.test(name)
      )
        names.push(name);
      else throw new Error('Unknown registry upload entry');
      if (names.length > 2048) throw new Error('Registry upload census exceeds bound');
    }
  };
  await walk('');
  if (!['data', 'startedat', 'hashstates/sha256/0'].every((name) => names.includes(name)))
    throw new Error('Incomplete registry upload staging');
  const files: RegistryUploadCensus['files'] = [];
  const buffers = new Map<string, Buffer>();
  let stagedSize = -1;
  for (const name of names.sort()) {
    const descriptor = await open(
      join(base, name),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const before = await descriptor.stat();
      const maximum = name === 'data' ? content.size : name === 'startedat' ? 40 : 108;
      // Proof: removing the size limit admitted bytes beyond the declaration (task8-removal-upload-size.log).
      if (!before.isFile() || before.size > maximum || (before.mode & 0o400) === 0)
        throw new Error('Registry upload exceeds declaration or is unreadable');
      const hash = createHash('sha256');
      const chunks: Buffer[] = [];
      const buffer = Buffer.alloc(65536);
      let size = 0;
      for (;;) {
        const read = await descriptor.read(buffer);
        if (read.bytesRead === 0) break;
        size += read.bytesRead;
        if (size > before.size) throw new Error('Upload changed during census');
        const chunk = buffer.subarray(0, read.bytesRead);
        hash.update(chunk);
        if (name !== 'data') chunks.push(Buffer.from(chunk));
      }
      const after = await descriptor.stat();
      if (
        size !== before.size ||
        after.ctimeMs !== before.ctimeMs ||
        after.mtimeMs !== before.mtimeMs
      )
        throw new Error('Upload changed during census');
      files.push({ name, size, sha256: hash.digest('hex') });
      bytes += before.blocks * 512;
      inodes++;
      if (name === 'data') stagedSize = size;
      else buffers.set(name, Buffer.concat(chunks));
    } finally {
      await descriptor.close();
    }
  }
  // Proof: removing the startedat upper bound makes the historical-owner/current-staging census resolve; restoring original owner timestamps passes without rewriting startedat (task8-staging-clock-removal.log).
  const started = buffers.get('startedat')?.toString('utf8');
  if (
    started === undefined ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(started) ||
    !Number.isFinite(Date.parse(started)) ||
    new Date(started).toISOString().replace('.000Z', 'Z') !== started ||
    Date.parse(started) < Math.floor(Date.parse(evidence.declaredAt) / 1000) * 1000 ||
    Date.parse(started) > Date.parse(write.at)
  )
    throw new Error('Registry upload start differs from pre-body ownership');
  for (const [name, state] of buffers)
    if (name.startsWith('hashstates/')) {
      const offset = Number(name.slice('hashstates/sha256/'.length));
      // Proof: removing state framing/offset verification admitted the mismatched SHA state (task8-removal-upload-sha-state.log).
      if (
        !Number.isSafeInteger(offset) ||
        offset > stagedSize ||
        state.length !== 108 ||
        state.subarray(0, 4).toString('hex') !== '73686103' ||
        state.readBigUInt64BE(100) !== BigInt(offset)
      )
        throw new Error('Malformed upload SHA256 state');
    }
  return RegistryUploadCensus.assert({
    operationId: evidence.operationId,
    repository,
    uploadId,
    digest: content.digest,
    files,
    bytes,
    inodes,
  });
}

/** Exact offline unlink is allowed only for a fresh matching planned UUID census and grace-eligible reconciled owner; partial cleanup always throws and requires recovery. */
export async function discardRegistryUploads(
  journal: RegistryJournal,
  signal: AbortSignal,
  now = Date.now(),
): Promise<string> {
  if (
    journal.schemaVersion !== 4 ||
    journal.maintenance?.phase !== 'deleting' ||
    !journal.fenced ||
    journal.maintenanceEvidence?.backup === null ||
    journal.maintenanceEvidence?.backup === undefined
  )
    throw new Error('Upload retirement requires fenced verified backup');
  const plan = type({
    retireUploads: RegistryUploadCensus.array().atMostLength(2048),
    policy: { retireOperations: 'string[]' },
  }).assert(JSON.parse(journal.maintenanceEvidence.plan ?? 'null'));
  const uploads = plan.retireUploads;
  if (uploads.some((upload) => !plan.policy.retireOperations.includes(upload.operationId)))
    throw new Error('Upload retirement differs from persisted eligible plan');
  for (const upload of uploads) {
    signal.throwIfAborted();
    const owner = journal.bundles.find((bundle) => bundle.operationId === upload.operationId);
    // Proof: removing fresh grace validation deleted the young owned staging fixture (task8-removal-upload-grace.log).
    if (
      owner?.receipt.state !== 'abandoned' ||
      now - Date.parse(owner.receipt.at) < 7 * 24 * 60 * 60 * 1000
    )
      throw new Error('Upload owner is not reconciled and grace-eligible');
    const current = await readRegistryUpload(journal, upload.repository, upload.uploadId);
    // Proof: removing exact census equality deleted changed staged bytes (task8-removal-upload-census-binding.log).
    if (JSON.stringify(current) !== JSON.stringify(upload))
      throw new Error('Staged upload differs from exact retirement plan');
    const base = join(
      journal.enrollment.registryPath,
      'docker/registry/v2/repositories',
      upload.repository,
      '_uploads',
      upload.uploadId,
    );
    for (const file of current.files) {
      signal.throwIfAborted();
      await unlink(join(base, file.name));
    }
    for (const relative of ['hashstates/sha256', 'hashstates', '']) {
      signal.throwIfAborted();
      await rmdir(join(base, relative));
    }
    try {
      await lstat(base);
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') continue;
      throw cause;
    }
    throw new Error('Retired upload directory remains present');
  }
  return createHash('sha256').update(JSON.stringify(uploads)).digest('hex');
}
