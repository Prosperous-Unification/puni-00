import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { expect, test } from 'bun:test';

const SOURCE_ROOT = import.meta.dir;
const RUNTIME_SURFACE = [
  'CandidateReadError',
  'assertAdmissionPacket',
  'assertAuthorityClaimPath',
  'assertAuthorityConflictGroup',
  'assertAuthorityPathAccess',
  'assertAuthoritySessionId',
  'assertAuthorityWorktreePath',
  'assertCheckedIntegrationCandidate',
  'assertNarrative',
  'assertUnambiguousPath',
  'canonicalPaths',
  'canonicalRepository',
  'certifyIntegrationCandidate',
  'compareCanonicalText',
  'decodeAdmissionPacket',
  'decodeAdmissionPacketBody',
  'decodeIntegrationPolicy',
  'hashBytes',
  'hashCanonical',
  'packetAuthorityClaims',
  'packetBody',
  'packetBodyBytes',
  'readBaseEntries',
  'readCandidate',
  'resolveCandidateRoot',
  'serializeCanonical',
  'uniqueSorted',
  'validatePacketAgainstBase',
  'withPacketIdentity',
].sort();

/** Store, runtime-half, Dash, clock and network reads the judge must never reach. */
const FORBIDDEN = [
  { pattern: /from '[^']*authority-store'/, reason: 'imports the authority store' },
  { pattern: /from '[^']*admission-runtime\//, reason: 'imports the runtime half' },
  { pattern: /from 'bun:sqlite'/, reason: 'imports bun:sqlite' },
  { pattern: /twilight-dash/, reason: 'names Twilight Dash' },
  // `new Date(epochMs)` converts a supplied instant; only a zero-argument `Date` reads the clock.
  {
    pattern: /\bDate\.now\b|\bDate\(\s*\)|\bperformance\.now\b|\bprocess\.hrtime\b/,
    reason: 'reads a clock',
  },
  {
    pattern: /from 'node:(?:net|http|https|http2|dgram|tls|dns)'|\bfetch\(|\bWebSocket\b/,
    reason: 'reaches the network',
  },
];

/** Drops whole comment lines only, so a glob literal such as `'**' + '/*'` never hides code. */
function stripComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\/\*\*?|\*)/.test(line))
    .join('\n');
}

/** Every workspace-relative module the facade reaches through relative imports. */
function reachableModules(entry: string): string[] {
  const seen = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const path = pending.pop();
    if (path === undefined || seen.has(path)) continue;
    seen.add(path);
    const source = stripComments(readFileSync(path, 'utf8'));
    for (const match of source.matchAll(/(?:from|import\()\s*'(\.{1,2}\/[^']+)'/g)) {
      pending.push(resolve(dirname(path), `${match[1]}.ts`));
    }
  }
  return [...seen].sort();
}

test('exports exactly the judge surface and nothing that takes a store', async () => {
  // Proof: adding `export { openAuthorityStore } from './admission-runtime/authority-store'` to
  // judge-facade.ts failed the surface equality with `+ "openAuthorityStore"`; appending
  // `Date.now()` to packet-judgment.ts failed the scan with `packet-judgment.ts reads a clock`;
  // importing `node:https` into packet-codec.ts failed it with `packet-codec.ts reaches the
  // network` (2026-10-11).
  expect(Object.keys(await import('./judge-facade')).sort()).toEqual(RUNTIME_SURFACE);
  const modules = reachableModules(join(SOURCE_ROOT, 'judge-facade.ts'));
  expect(modules.length).toBeGreaterThan(5);
  const violations = modules.flatMap((path) => {
    const source = stripComments(readFileSync(path, 'utf8'));
    return FORBIDDEN.filter(({ pattern }) => pattern.test(source)).map(
      ({ reason }) => `${relative(SOURCE_ROOT, path)} ${reason}`,
    );
  });
  expect(violations).toEqual([]);
});
