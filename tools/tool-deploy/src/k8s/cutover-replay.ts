import { createHash } from 'node:crypto';

import { parseDescriptor } from './descriptor';
import { buildReplayCapabilitiesCommand, buildReplayInventoryCommand } from './replay-capability';
import type { ReplayCount } from './replay-receipt';

export interface CutoverIdentity {
  descriptorBytes: string;
  /** Hash of original file bytes including whitespace; the canonical promotion identity is separate. */
  descriptorSha256: string;
  oldBackendImage: string;
  backendImage: string;
}

/** Cutover-only evidence; its version is independent of the release journal schema. */
export interface CutoverReplay extends CutoverIdentity {
  version: 1;
  inventory: readonly ReplayCount[];
  capabilities: readonly string[];
  exportSha256: string;
}

/** Self-contained boundary validator also embedded in the immutable image's generated command. */
function validateCutoverIdentity(raw: unknown): CutoverIdentity {
  // Proof: absent cutover identity refuses legacy API calls before command rendering.
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new Error('cutover identity is required');
  // Boundary: the non-null object check permits reading unknown fields.
  const fields = raw as Record<string, unknown>;
  const { descriptorBytes, descriptorSha256, oldBackendImage, backendImage } = fields;
  // Proof: changed/foreign descriptor pins fail before export snapshots.
  if (
    typeof descriptorBytes !== 'string' ||
    typeof descriptorSha256 !== 'string' ||
    createHash('sha256').update(descriptorBytes).digest('hex') !== descriptorSha256
  )
    throw new Error('cutover descriptor differs from original SHA-256');
  // Proof: the foreign-image fixture refuses differing immutable backend digests.
  if (
    typeof oldBackendImage !== 'string' ||
    typeof backendImage !== 'string' ||
    !/^[^\s@]+@sha256:[0-9a-f]{64}$/.test(oldBackendImage) ||
    !/^[^\s@]+@sha256:[0-9a-f]{64}$/.test(backendImage) ||
    oldBackendImage.split('@')[1] !== backendImage.split('@')[1]
  )
    throw new Error('cutover backend images must have the exact same immutable digest');
  const descriptor: unknown = JSON.parse(descriptorBytes);
  // Proof: a resealed [] descriptor refuses before source capture.
  if (typeof descriptor !== 'object' || descriptor === null || Array.isArray(descriptor))
    throw new Error('cutover descriptor is malformed');
  // Boundary: descriptor object shape was checked; CLI additionally parses the complete admission schema.
  const parsed = descriptor as Record<string, unknown>;
  const images = parsed['images'];
  // Proof: resealed unsupported descriptor version or foreign backend refuses capture.
  if (
    parsed['schemaVersion'] !== 1 ||
    typeof images !== 'object' ||
    images === null ||
    Array.isArray(images) ||
    !Object.entries(images).some(([key, value]) => key === 'backend' && value === backendImage)
  )
    throw new Error('cutover descriptor names another backend image');
  return { descriptorBytes, descriptorSha256, oldBackendImage, backendImage };
}

/** Validate the original descriptor at the operator boundary; aliases may name the same digest. */
export function createCutoverIdentity(
  descriptorBytes: string,
  descriptorSha256: string,
  oldBackendImage: string,
  backendImage: string,
): CutoverIdentity {
  const identity = validateCutoverIdentity({
    descriptorBytes,
    descriptorSha256,
    oldBackendImage,
    backendImage,
  });
  parseDescriptor(JSON.parse(descriptorBytes) as unknown);
  return identity;
}

/** Refuse legacy or foreign evidence; generated restore commands use this exact validator. */
export function validateCutoverReplay(
  raw: unknown,
  identity: CutoverIdentity,
  exportSha256: string,
): CutoverReplay {
  validateCutoverIdentity(identity);
  // Proof: legacy export/restore reports fail verification instead of authorizing restore.
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new Error('legacy cutover report: replay evidence is required');
  // Boundary: object shape permits inspection of unknown protocol fields.
  const fields = raw as Record<string, unknown>;
  // Proof: foreign version/image/export identities fail generated restore and CLI verification.
  if (
    fields['version'] !== 1 ||
    !/^[0-9a-f]{64}$/.test(exportSha256) ||
    fields['exportSha256'] !== exportSha256 ||
    fields['descriptorBytes'] !== identity.descriptorBytes ||
    fields['descriptorSha256'] !== identity.descriptorSha256 ||
    fields['oldBackendImage'] !== identity.oldBackendImage ||
    fields['backendImage'] !== identity.backendImage
  )
    throw new Error(
      'cutover replay evidence has foreign version, descriptor, image or export identity',
    );
  const inventory = fields['inventory'];
  const capabilities = fields['capabilities'];
  // Proof: malformed/numeric/duplicate capability output is refused even for an empty journal.
  if (
    !Array.isArray(inventory) ||
    !Array.isArray(capabilities) ||
    capabilities.some((kind: unknown) => typeof kind !== 'string' || kind === '') ||
    new Set(capabilities).size !== capabilities.length
  )
    throw new Error('cutover replay observation is malformed');
  const kinds = new Set<string>();
  for (const rawCount of inventory) {
    // Proof: malformed replay inventory rows refuse versioned report verification.
    if (typeof rawCount !== 'object' || rawCount === null || Array.isArray(rawCount))
      throw new Error('cutover replay inventory is malformed');
    // Boundary: count object checked before accessing unknown fields.
    const count = rawCount as Record<string, unknown>;
    const kind = count['kind'];
    // Proof: zero/unknown/duplicate count identities fail versioned report verification;
    // deleting delete_state_v1 admission refused its matching cutover control.
    if (
      (kind !== 'replace_blockage' && kind !== 'move_progress_v1' && kind !== 'delete_state_v1') ||
      typeof count['count'] !== 'number' ||
      !Number.isSafeInteger(count['count']) ||
      count['count'] <= 0 ||
      kinds.has(kind)
    )
      throw new Error('cutover replay inventory is malformed');
    kinds.add(kind);
    // Proof: empty/move-only image capabilities cannot export or restore guarded history.
    if (!capabilities.includes(kind))
      throw new Error(`cutover replay ${kind} unsupported by ${identity.backendImage}`);
  }
  // Boundary: every inventory row and capability string was validated above.
  return {
    ...identity,
    version: 1,
    inventory: inventory as ReplayCount[],
    capabilities: capabilities as string[],
    exportSha256,
  };
}

/** Required identity is carried as original bytes; no reconstructed descriptor replaces its pin. */
export function cutoverEnvironment(identity: CutoverIdentity | undefined): Record<string, string> {
  const checked = validateCutoverIdentity(identity);
  return {
    PUNI_DESCRIPTOR_BYTES: checked.descriptorBytes,
    PUNI_DESCRIPTOR_SHA256: checked.descriptorSha256,
    PUNI_OLD_BACKEND_IMAGE: checked.oldBackendImage,
    PUNI_BACKEND_IMAGE: checked.backendImage,
  };
}

/** Image-local observation executes coordinator traversal and the image's own capability CLI. */
export const CUTOVER_REPLAY_SCRIPT = `
const createHash = require('node:crypto').createHash;
${validateCutoverIdentity.toString()}
${validateCutoverReplay.toString()}
const cutoverIdentity = () => validateCutoverIdentity({descriptorBytes:process.env.PUNI_DESCRIPTOR_BYTES,descriptorSha256:process.env.PUNI_DESCRIPTOR_SHA256,oldBackendImage:process.env.PUNI_OLD_BACKEND_IMAGE,backendImage:process.env.PUNI_BACKEND_IMAGE});
function observeCutoverReplay(path, sha256) {
  const identity = cutoverIdentity();
  function observe(command) {
    const child = Bun.spawnSync({cmd:command,env:{...process.env,DB_PATH:path},stdout:'pipe',stderr:'pipe'});
    // Proof: a CLI printing [] then failing is refused with empty retained history.
    if(child.exitCode!==0) throw new Error('cutover replay observation failed: '+child.stderr.toString());
    return JSON.parse(child.stdout.toString());
  }
  const inventory=observe(${JSON.stringify(buildReplayInventoryCommand())});
  const capabilities=observe(${JSON.stringify(buildReplayCapabilitiesCommand())});
  return validateCutoverReplay({...identity,version:1,inventory,capabilities,exportSha256:sha256},identity,sha256);
}
`;
