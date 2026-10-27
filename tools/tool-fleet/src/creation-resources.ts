import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import {
  type CreationIdentity,
  readCreationAttempt,
  requireDirectory,
  syncDirectory,
} from './creation-journal';
import { CreationClosure, CreationEvent, CreationPlan } from './k3d-creation';
import { ObjectStoreArchiveSchema } from './object-store-archive';

const digest = /^[a-f0-9]{64}$/;
const filename = /^[a-z][a-z0-9-]{0,127}\.json$/;
const Seal = type({
  schemaVersion: '1',
  files: type({ name: filename, sha256: digest, '+': 'reject' }).array().atLeastLength(1),
  '+': 'reject',
});
const recordSchemas: Readonly<Record<string, (input: unknown) => unknown>> = {
  plan: CreationPlan,
  closure: CreationClosure,
  network: type({ id: digest, '+': 'reject' }),
  inputs: type({
    schemaVersion: '1',
    'objectStore?': {
      sourceRevision: /^[a-f0-9]{40}$/,
      toolchainSha256: digest,
      buildLockSha256: digest,
      // Proof: Widening this field to unknown persisted a malformed private archive receipt; Task21 evidence negative failed.
      archive: ObjectStoreArchiveSchema,
      '+': 'reject',
    },
    configs: type({ name: 'string', sha256: digest, '+': 'reject' }).array(),
    tools: { k3d: digest, kubectl: digest, '+': 'reject' },
    images: type({
      name: 'string',
      id: /^sha256:[a-f0-9]{64}$/,
      volumes: 'string[]',
      '+': 'reject',
    }).array(),
    '+': 'reject',
  }),
  'creation-binding': type({
    schemaVersion: '1',
    labId: 'string',
    attemptId: 'string',
    daemonId: 'string',
    endpoint: /^unix:\/\/\/[^\s]+$/,
    profile: "'app'|'platform'|'fleet'",
    '+': 'reject',
  }),
  'creation-complete': type({ schemaVersion: '1', sha256: digest, '+': 'reject' }),
  'creation-teardown': type({
    schemaVersion: '1',
    state: "'removing'",
    containerIds: type(digest).array(),
    networkId: digest,
    '+': 'reject',
  }),
  'creation-removed': type({
    schemaVersion: '1',
    state: "'removed'",
    retainedVolumes: 'string[]',
    '+': 'reject',
  }),
  complete: Seal,
};
function requireRecord(name: string, entry: unknown): void {
  const schema = /^stopped-[a-f0-9]{64}$/.test(name)
    ? type({
        schemaVersion: '1',
        id: digest,
        forced: 'boolean',
        exitCode: 'number.integer',
        '+': 'reject',
      })
    : /^event-[0-9]{6}$/.test(name)
      ? CreationEvent
      : /^creator-[0-9]{4}$/.test(name)
        ? type({ name: 'string>0', id: digest, '+': 'reject' })
        : Object.hasOwn(recordSchemas, name)
          ? recordSchemas[name]
          : undefined;
  // The key is checked against this module's closed map; no untrusted callable enters the boundary.
  if (schema === undefined || schema(entry) instanceof type.errors)
    throw new Error('Malformed or unknown resource evidence record');
}

export const hashResource = (bytes: string | Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');
const LIMIT = 8 * 1024 * 1024;

/** Reserve an immutable evidence directory beside an existing creating journal; occupied attempts refuse. */
export async function reserveResources(
  directory: string,
  identity: CreationIdentity,
): Promise<string> {
  const journal = await readCreationAttempt(directory, identity);
  if (journal.state !== 'creating') throw new Error('Resources require a creating attempt');
  const path = join(directory, `${identity.attemptId}.resources`);
  await mkdir(path, { mode: 0o700 });
  await syncDirectory(directory);
  return path;
}

/** Read one bounded owner-only evidence file without following links or blocking on special files. */
export async function readResourceFile(path: string): Promise<string> {
  const descriptor = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const status = await descriptor.stat();
    if (
      !status.isFile() ||
      status.uid !== process.getuid?.() ||
      // Proof: Removing this mode check accepted a readable 0644 receipt; public-retained-evidence failed.
      (status.mode & 0o777) !== 0o600 ||
      status.size > LIMIT
    )
      throw new Error('Resource evidence must be bounded owner-only regular files');
    const bytes = await descriptor.readFile('utf8');
    if (Buffer.byteLength(bytes) > LIMIT) throw new Error('Resource evidence exceeded limit');
    return bytes;
  } finally {
    await descriptor.close();
  }
}

/** Persist safe projected evidence exclusively and synchronously; a write failure stops the creator. */
export async function appendResource(
  directory: string,
  name: string,
  entry: unknown,
): Promise<void> {
  await requireDirectory(directory);
  if (!filename.test(`${name}.json`)) throw new Error('Invalid resource evidence filename');
  // Proof: Removing schema validation persisted the private field; private-or-unrecognized-fields failed.
  requireRecord(name, entry);
  const bytes = `${JSON.stringify(entry)}\n`;
  if (Buffer.byteLength(bytes) > LIMIT) throw new Error('Resource evidence exceeded limit');
  const descriptor = await open(
    join(directory, `${name}.json`),
    // Proof: Removing O_EXCL overwrote an existing creator; exclusive-retention negative failed.
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await descriptor.writeFile(bytes);
    // Proof: injected resource-file fsync failure stopped the existing runner before direct creation (task6d durability fault).
    await descriptor.sync();
  } finally {
    await descriptor.close();
  }
  // Proof: injected resource-directory fsync failure stopped the existing runner before direct creation (task6d durability fault).
  await syncDirectory(directory);
}

/** Seal all retained records only after creation closure; this hash is bound by the private lab marker. */
export async function sealResources(directory: string): Promise<string> {
  await requireDirectory(directory);
  const names = (await readdir(directory)).sort();
  if (
    !names.length ||
    names.length > 4096 ||
    names.some((name) => !filename.test(name) || name === 'complete.json')
  )
    throw new Error('Invalid resource evidence set');
  const files = [];
  for (const name of names)
    files.push({ name, sha256: hashResource(await readResourceFile(join(directory, name))) });
  await appendResource(directory, 'complete', { schemaVersion: 1, files });
  return hashResource(await readResourceFile(join(directory, 'complete.json')));
}

/** Require the ready attempt, exact sealed file set and every original byte before ownership consumption. */
export async function readResources(
  directory: string,
  identity: CreationIdentity,
  sha256: string,
): Promise<unknown[]> {
  const journal = await readCreationAttempt(directory, identity);
  // Proof: Removing ready-state refusal accepted a sealed creating attempt; creating-journal negative failed.
  if (journal.state !== 'ready') throw new Error('Resource inventory remains partial');
  const path = join(directory, `${identity.attemptId}.resources`);
  await requireDirectory(path);
  const bytes = await readResourceFile(join(path, 'complete.json'));
  if (!digest.test(sha256) || hashResource(bytes) !== sha256)
    // Proof: Removing the seal hash check accepted edited seal bytes; seal-replaced negative failed.
    throw new Error('Resource seal changed');
  const seal = Seal(JSON.parse(bytes));
  if (seal instanceof type.errors) throw new Error('Malformed resource seal');
  const names = (await readdir(path)).sort();
  const expected = ['complete.json', ...seal.files.map((file) => file.name)].sort();
  if (names.length > 4097 || JSON.stringify(names) !== JSON.stringify(expected))
    // Proof: Removing exact-set comparison accepted an extra record; extra-retained-evidence failed.
    throw new Error('Resource evidence set changed');
  const entries: unknown[] = [];
  for (const file of seal.files) {
    const contents = await readResourceFile(join(path, file.name));
    // Proof: Removing the record hash comparison accepted a changed valid creator ID; retention negative failed.
    if (hashResource(contents) !== file.sha256) throw new Error('Resource evidence changed');
    const entry: unknown = JSON.parse(contents);
    requireRecord(file.name.slice(0, -5), entry);
    entries.push(entry);
  }
  return entries;
}
