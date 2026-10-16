import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, rename, rmdir } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import {
  type CreationIdentity,
  readCreationAttempt,
  requireDirectory,
  requireIdentity,
  syncDirectory,
} from './creation-journal';
import { labNamesOf } from './k3d-lab-names';

const DockerIdSchema = type(/^[0-9a-f]{64}$/);
const SlotSchema = type("'network'|'registry'");
const binding = {
  // Proof: schema-v2 mutation accepting v1 failed the earlier-unbound-operation negative.
  schemaVersion: '2',
  labId: 'string',
  attemptId: 'string',
  daemonId: 'string',
  slot: SlotSchema,
  // Proof: making kind optional failed separate missing receipt/inspection kind negatives.
  kind: "'network'|'container'",
  // Proof: making name optional failed separate missing receipt/inspection name negatives.
  name: 'string',
  '+': 'reject',
} as const;
const OperationSchema = type.or(
  { ...binding, state: "'pending'" },
  { ...binding, state: "'created'", dockerId: DockerIdSchema },
);
export type CreationSlot = typeof SlotSchema.infer;
export type CreationOperation = typeof OperationSchema.infer;

function requireSlot(slot: CreationSlot): CreationSlot {
  const parsed = SlotSchema(slot);
  // Proof: closed-slot mutation made the invalid-slots production negative fail.
  if (parsed instanceof type.errors) throw new Error('Invalid creation slot');
  return parsed;
}

/** Derive a closed slot target from the same names used by {@link labNamesOf} in Docker creation. */
function targetOf(labId: string, slot: CreationSlot) {
  const names = labNamesOf(labId);
  // Proof: separate network/registry kind and shared-name mutations failed real-up caller fixtures.
  return slot === 'network'
    ? { kind: 'network' as const, name: names.network }
    : { kind: 'container' as const, name: names.registry };
}

function operationDirectory(directory: string, identity: CreationIdentity): string {
  return join(directory, `${identity.attemptId}.operations`);
}

async function writeOperation(path: string, operation: CreationOperation): Promise<void> {
  // Proof: exclusive-reservation mutation allowed the occupied registry callback; lifecycle negative failed.
  const descriptor = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await descriptor.writeFile(`${JSON.stringify(operation)}\n`, 'utf8');
    // Proof: removed file-sync mutation failed reservation/completion file-sync negatives.
    await descriptor.sync();
  } finally {
    await descriptor.close();
  }
}

/**
 * Read a schema-v2 attempt-bound direct creation operation and compare its expected Docker kind/name
 * with the closed slot target. Earlier unbound v1 operations refuse without migration. Pending records preserve uncertainty after
 * a lost Docker response. Neither state grants cleanup authority or ownership of volumes.
 */
export async function readCreationOperation(
  directory: string,
  input: CreationIdentity,
  inputSlot: CreationSlot,
): Promise<CreationOperation> {
  const identity = requireIdentity(input);
  const slot = requireSlot(inputSlot);
  await readCreationAttempt(directory, identity);
  const operations = operationDirectory(directory, identity);
  // Proof: operation-directory bypass mutation failed public-directory and symlink-directory negatives.
  await requireDirectory(operations);
  const descriptor = await open(
    join(operations, `${slot}.json`),
    // Proof: nofollow mutation accepted a same-binding symlink; nonblocking mutation timed out the real FIFO negative.
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const status = await descriptor.stat();
    // Proof: separate regular-file, UID and mode mutations failed descriptor/public-mode negatives.
    if (!status.isFile() || status.uid !== process.getuid?.() || (status.mode & 0o777) !== 0o600)
      throw new Error('Creation operation must be an owner-only regular file');
    const contents: unknown = JSON.parse(await descriptor.readFile('utf8'));
    const operation = OperationSchema(contents);
    // Proof: strict-schema mutation failed the extra-field assessment negative.
    if (operation instanceof type.errors) throw new Error('Malformed creation operation');
    // Proof: four independent binding mutations failed lab/attempt/daemon/slot assessment negatives.
    if (
      operation.labId !== identity.labId ||
      operation.attemptId !== identity.attemptId ||
      operation.daemonId !== identity.daemonId ||
      operation.slot !== slot
    )
      throw new Error('Creation operation binding mismatch');
    const target = targetOf(identity.labId, slot);
    // Proof: record-kind bypass failed both-slot pending/created assessments and real Docker caller negatives.
    if (operation.kind !== target.kind) throw new Error('Creation operation kind mismatch');
    // Proof: record-name bypass failed both-slot pending/created assessments and real Docker caller negatives.
    if (operation.name !== target.name) throw new Error('Creation operation name mismatch');
    return operation;
  } finally {
    await descriptor.close();
  }
}

/**
 * Durably reserve one closed slot before executing Docker, then durably record only its full
 * returned ID. Errors and malformed responses leave pending evidence; retry and adoption are
 * forbidden. A retained exclusive lock refuses interrupted completion. The caller must stop
 * before its next external creation if any persistence step fails.
 */
export async function executeDirectCreation(
  directory: string,
  input: CreationIdentity,
  inputSlot: CreationSlot,
  create: () => Promise<string>,
): Promise<string> {
  const identity = requireIdentity(input);
  const slot = requireSlot(inputSlot);
  const journal = await readCreationAttempt(directory, identity);
  // Proof: creating-journal mutation allowed creation after terminal state; terminal-journals negative failed.
  if (journal.state !== 'creating') throw new Error('Direct creation requires a creating attempt');
  const operations = operationDirectory(directory, identity);
  if (slot === 'network') await mkdir(operations, { mode: 0o700 });
  // Proof: operation-directory bypass mutation failed public-directory and symlink-directory negatives.
  await requireDirectory(operations);
  if (slot === 'registry') {
    const network = await readCreationOperation(directory, identity, 'network');
    // Proof: network-unresolved mutation reached registry creation after malformed network output.
    if (network.state !== 'created') throw new Error('Network creation is unresolved');
  }
  const path = join(operations, `${slot}.json`);
  const target = targetOf(identity.labId, slot);
  await writeOperation(path, { ...identity, ...target, schemaVersion: 2, slot, state: 'pending' });
  // Proof: removed directory-sync mutation failed reservation/completion directory-sync negatives.
  await syncDirectory(operations);
  const response = await create();
  const dockerId = DockerIdSchema(response.endsWith('\n') ? response.slice(0, -1) : response);
  // Proof: full-docker-id mutation failed malformed-response negatives, leaving no valid creation receipt.
  if (dockerId instanceof type.errors) throw new Error('Docker creation returned no full ID');
  const lock = `${path}.lock`;
  // Proof: completion-lock bypass mutation replaced pending evidence; occupied-lock negative failed.
  await mkdir(lock, { mode: 0o700 });
  try {
    const operation = await readCreationOperation(directory, identity, slot);
    // Proof: completion-state mutation overwrote a changed receipt; completion-changed negative failed.
    if (operation.state !== 'pending') throw new Error('Creation operation is terminal');
    const replacement = `${path}.${randomUUID()}`;
    await writeOperation(replacement, {
      ...identity,
      ...target,
      schemaVersion: 2,
      slot,
      state: 'created',
      dockerId,
    });
    await rename(replacement, path);
    // Proof: removed directory-sync mutation failed reservation/completion directory-sync negatives.
    await syncDirectory(operations);
  } finally {
    await rmdir(lock);
  }
  return dockerId;
}

const InspectionSchema = type({
  id: DockerIdSchema,
  // Proof: making kind optional failed separate missing receipt/inspection kind negatives.
  kind: "'network'|'container'",
  // Proof: making name optional failed separate missing receipt/inspection name negatives.
  name: 'string',
  labId: 'string',
  peerIds: DockerIdSchema.array(),
  '+': 'reject',
});
export type CreationInspection = typeof InspectionSchema.infer;

/**
 * Read-only assessment of both direct receipts against the current daemon and exact inspected
 * objects. The inspector must query by the supplied full ID; Docker may resolve that string
 * as a name, so the returned ID, actual kind and normalized actual name are independently compared. Network endpoint IDs must be the
 * receipted registry, and the registry must reference only the receipted network. k3d endpoints
 * therefore refuse assessment. This grants no deletion authority and never inspects volumes.
 */
export async function assessCreationReceipts(
  directory: string,
  identity: CreationIdentity,
  currentDaemonId: string,
  inspect: (slot: CreationSlot, dockerId: string) => Promise<CreationInspection>,
): Promise<{ readonly networkId: string; readonly registryId: string }> {
  // Proof: current-daemon mutation failed daemon-from-Docker negative.
  if (currentDaemonId !== identity.daemonId) throw new Error('Docker daemon identity changed');
  // Proof: absent/unreadable read-bypass mutations failed the separate consuming negatives.
  const network = await readCreationOperation(directory, identity, 'network');
  const registry = await readCreationOperation(directory, identity, 'registry');
  // Proof: pending-assessment mutation failed the older-complete/later-pending attempt negative.
  if (network.state !== 'created' || registry.state !== 'created')
    throw new Error('Direct creation remains unresolved');
  for (const [operation, peerId] of [
    [network, registry.dockerId],
    [registry, network.dockerId],
  ] as const) {
    const inspected = InspectionSchema(await inspect(operation.slot, operation.dockerId));
    // Proof: inspection-schema mutation failed malformed-inspection negative.
    if (inspected instanceof type.errors) throw new Error('Malformed Docker inspection');
    // Proof: independent inspected-ID and label mutations failed returned-ID and foreign-label negatives.
    if (inspected.id !== operation.dockerId || inspected.labId !== identity.labId)
      throw new Error('Docker inspected identity mismatch');
    // Proof: inspected-kind bypass failed both-slot kind negatives with matching IDs and labels.
    if (inspected.kind !== operation.kind) throw new Error('Docker inspected kind mismatch');
    // Proof: inspected-name bypass failed both-slot name negatives with matching IDs and labels.
    if (inspected.name !== operation.name) throw new Error('Docker inspected name mismatch');
    // Proof: foreign-attachments mutation failed foreign-endpoint negative.
    if (inspected.peerIds.some((id) => id !== peerId))
      throw new Error('Docker object has foreign attachments');
    // Proof: registry-network mutation failed missing-network negative.
    if (operation.slot === 'registry' && !inspected.peerIds.includes(peerId))
      throw new Error('Registry does not reference the receipted network');
  }
  return { networkId: network.dockerId, registryId: registry.dockerId };
}
