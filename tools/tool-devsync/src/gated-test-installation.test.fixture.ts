import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

export interface TestInstallation {
  readonly entrypoint: string;
  readonly sha256: string;
  readonly kind: 'source-bundle' | 'sealed-artifact';
  retain(): void;
  dispose(): Promise<
    { readonly kind: 'disposed' } | { readonly kind: 'retained'; readonly directory: string }
  >;
}
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
/** Explicit test-only current-source build, or a caller-supplied artifact sealed by its hash. */
export async function createTestInstallation(): Promise<TestInstallation> {
  const selected = process.env['PUNI_C34_PAYLOAD_BUNDLE'],
    expected = process.env['PUNI_C34_PAYLOAD_BUNDLE_SHA256'];
  let entrypoint: string, sha256: string, owned: string | undefined;
  let kind: 'source-bundle' | 'sealed-artifact';
  if (selected !== undefined) {
    if (!isAbsolute(selected) || expected === undefined || !/^[a-f0-9]{64}$/u.test(expected))
      throw new Error('explicit gated test artifact requires an absolute path and SHA256');
    entrypoint = selected;
    sha256 = hash(await Bun.file(entrypoint).bytes());
    if (sha256 !== expected)
      throw new Error('explicit gated test artifact differs from sealed hash');
    kind =
      process.env['PUNI_C34_TEST_ARTIFACT_KIND'] === 'source-bundle'
        ? 'source-bundle'
        : 'sealed-artifact';
  } else {
    if (expected !== undefined) throw new Error('gated test artifact hash has no selected file');
    owned = mkdtempSync(join(tmpdir(), 'puni-c34-test-bundle-'));
    entrypoint = join(owned, 'puni.mjs');
    const built = await Bun.build({
      entrypoints: [resolve(import.meta.dir, '../../../apps/puni/cli/src/entrypoint.ts')],
      outdir: owned,
      target: 'bun',
      format: 'esm',
      naming: 'puni.mjs',
    });
    if (!built.success)
      throw new AggregateError(built.logs, 'current gated test source bundle failed');
    sha256 = hash(await Bun.file(entrypoint).bytes());
    kind = 'source-bundle';
  }
  let retained = false;
  return {
    entrypoint,
    sha256,
    kind,
    retain() {
      retained = true;
    },
    async dispose() {
      if (hash(await Bun.file(entrypoint).bytes()) !== sha256)
        throw new Error('gated test artifact changed during native controls');
      if (owned !== undefined) {
        if (retained) return { kind: 'retained', directory: owned };
        rmSync(owned, { recursive: true, force: true });
      }
      return { kind: 'disposed' };
    },
  };
}
/** Probe this process's actual user scope availability; an unavailable lane is explicitly named. */
export function readScopeAvailability():
  { readonly kind: 'available' } | { readonly kind: 'unavailable'; readonly reason: string } {
  if (process.platform !== 'linux')
    return { kind: 'unavailable', reason: 'native inherited-FD qualification requires Linux' };
  const manager = Bun.which('systemd-run');
  if (manager === null)
    return { kind: 'unavailable', reason: 'systemd-run is absent from this test PATH' };
  const probe = Bun.spawnSync(
    [manager, '--user', '--scope', '--quiet', '--', process.execPath, '--version'],
    { stdout: 'pipe', stderr: 'pipe', timeout: 5000 },
  );
  return probe.exitCode === 0
    ? { kind: 'available' }
    : {
        kind: 'unavailable',
        reason:
          'actual systemd user-scope probe status ' +
          String(probe.exitCode) +
          ': ' +
          probe.stderr.toString().trim().split('\n')[0],
      };
}
