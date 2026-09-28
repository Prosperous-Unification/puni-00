import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isCanonicalDomain, type PublicEmailPolicy } from '@wbs/domain';

// Source execution reads the maintained asset; Bun's single-file build places
// the same checked pair beside its output through the be-01 build target.
// Proof: 2026-09-28, retaining the source-relative path in a Bun bundle made
// `loads checked assets beside a bundled backend module` fail with ENOENT at
// /domain/domain/src/public-email-policy.manifest.json; the paired asset smoke
// passes when the bundle resolves its own packaged directory.
const POLICY_DIRECTORY = new URL(
  import.meta.url.endsWith('/public-email-policy.ts')
    ? '../../../domain/domain/src/'
    : './public-email-policy/',
  import.meta.url,
).pathname;
const MANIFEST = 'public-email-policy.manifest.json';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function domains(value: unknown, category: string): ReadonlySet<string> {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`malformed ${category} policy`);
  const names = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string' || !isCanonicalDomain(entry) || names.has(entry))
      throw new Error(`malformed ${category} policy`);
    names.add(entry);
  }
  return names;
}

/**
 * Reads the versioned reviewed policy for every claim decision. Missing,
 * unreadable, malformed and checksum-invalid trusted assets throw; no empty
 * policy is an acceptable fallback. The manifest pins the exact asset bytes.
 *
 * Proof: 2026-09-28, removing the digest comparison made the mounted `throws
 * through the mounted route for missing, malformed and checksum-invalid
 * policy` issue a challenge against altered bytes (201 instead of 500).
 * Removing relay loading made mounted `canonicalizes exact IDNA` issue that
 * relay (201 instead of 409); removing suffix loading made mounted `honors a
 * checked suffix override beyond the pinned PSL` issue that override.
 * Missing (ENOENT),
 * unreadable (EISDIR) and valid-checksum malformed JSON each reached this
 * loader through that mounted route and answered 500.
 */
export function loadPublicEmailPolicy(directory = POLICY_DIRECTORY): PublicEmailPolicy {
  const manifestText = readFileSync(join(directory, MANIFEST), 'utf8');
  const manifest: unknown = JSON.parse(manifestText);
  if (
    !record(manifest) ||
    typeof manifest['revision'] !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}\.\d+$/.test(manifest['revision']) ||
    manifest['asset'] !== 'public-email-policy.v1.json' ||
    // Proof: 2026-09-28, removing either metadata comparison separately made
    // `refuses a changed policy licence or PSL package revision` accept it.
    manifest['license'] !== 'MIT' ||
    manifest['suffixPackage'] !== 'tldts@7.4.12' ||
    typeof manifest['sha256'] !== 'string' ||
    !/^[a-f0-9]{64}$/.test(manifest['sha256'])
  )
    throw new Error('malformed public email policy manifest');
  const asset = readFileSync(join(directory, manifest['asset']));
  const digest = createHash('sha256').update(asset).digest('hex');
  if (digest !== manifest['sha256']) throw new Error('public email policy checksum mismatch');
  const parsed: unknown = JSON.parse(asset.toString('utf8'));
  if (
    !record(parsed) ||
    parsed['revision'] !== manifest['revision'] ||
    parsed['license'] !== manifest['license'] ||
    typeof parsed['source'] !== 'string'
  )
    throw new Error('malformed public email policy');
  return {
    revision: manifest['revision'],
    providers: domains(parsed['providers'], 'provider'),
    relays: domains(parsed['relays'], 'relay'),
    suffixes: domains(parsed['suffixes'], 'suffix'),
  };
}
