import type { BuildArg, Platform } from '@dagger.io/dagger';
import { connect } from '@dagger.io/dagger';

import { imageRef, parseDigest, type ReleaseRecord, renderRelease, type Tier } from './lib/publish';

const DOCKERFILE: Record<Tier, string> = {
  be: 'apps/be-01/Dockerfile',
  gw: 'apps/gw-01/Dockerfile',
  fe: 'apps/fe-01/Dockerfile',
};

const PUBLIC_URL = process.env['WBS_PUBLIC_URL'] ?? 'https://wbs.bulletpoints.club';
const REGISTRY = process.env['REGISTRY'] ?? 'registry.infra.bulletpoints.club';
const REGISTRY_USER = process.env['REGISTRY_USER'] ?? 'wbs';

// linux/amd64 is pinned explicitly so a client running on arm64 (a dev laptop,
// or a build host) produces the same image the amd64 production host runs.
// When the engine isn't natively amd64 it builds this under QEMU emulation —
// that's what apps/fe-01/Dockerfile's BUN_JSC_useJIT=0 works around; that
// workaround lives in the Dockerfile itself, so it carries over unchanged
// regardless of who invokes the build (docker CLI or Dagger).
const TARGET_PLATFORM = 'linux/amd64' as Platform;

function buildArgs(tier: Tier): BuildArg[] {
  if (tier !== 'fe') return [];
  const wsHost = PUBLIC_URL.replace(/^https?:\/\//, '');
  const wsScheme = PUBLIC_URL.startsWith('https://') ? 'wss' : 'ws';
  return [
    { name: 'VITE_BE_URL', value: PUBLIC_URL },
    { name: 'VITE_GW_URL', value: PUBLIC_URL },
    { name: 'VITE_WS_URL', value: `${wsScheme}://${wsHost}/ws` },
  ];
}

/**
 * Dagger's TypeScript SDK reads its engine address from
 * _EXPERIMENTAL_DAGGER_RUNNER_HOST (still experimentally prefixed as of
 * v0.21.8), which is an awkward thing to type at a call site. If the
 * friendlier DAGGER_RUNNER_HOST is set and the real variable isn't, copy it
 * across — explicitly, and logged, rather than silently, so a typo in the
 * real variable's name doesn't fail in a way that's hard to trace back here.
 */
export function applyRunnerHostAlias(env: NodeJS.ProcessEnv): void {
  const friendly = env['DAGGER_RUNNER_HOST'];
  const real = env['_EXPERIMENTAL_DAGGER_RUNNER_HOST'];
  if (friendly !== undefined && friendly !== '' && (real === undefined || real === '')) {
    console.error(
      `[tool-dagger] DAGGER_RUNNER_HOST=${friendly} -> _EXPERIMENTAL_DAGGER_RUNNER_HOST (Dagger's real variable)`,
    );
    env['_EXPERIMENTAL_DAGGER_RUNNER_HOST'] = friendly;
  }
}

/**
 * Reads the registry password from the environment, failing loudly rather
 * than letting publishAll silently attempt (and fail) an unauthenticated
 * push. Kept separate from publishAll so the check runs, and can fail,
 * before any Dagger engine connection is opened.
 */
export function requireRegistryPassword(env: NodeJS.ProcessEnv): string {
  const pass = env['REGISTRY_PASS'];
  if (pass === undefined || pass === '') {
    throw new Error(
      'REGISTRY_PASS must be set to authenticate the publish — refusing to attempt an unauthenticated push',
    );
  }
  return pass;
}

export async function publishAll(tiers: Tier[], sha: string): Promise<ReleaseRecord> {
  applyRunnerHostAlias(process.env);
  const registryPassword = requireRegistryPassword(process.env);
  const record: ReleaseRecord = {};
  await connect(
    async (client) => {
      // Wrapped in Dagger's secret mechanism rather than interpolated into
      // any string, so the plaintext password is never logged and can't end
      // up in an error message.
      const registrySecret = client.setSecret('registry-password', registryPassword);
      // A single host directory snapshot is reused as the build context for
      // every tier so each Dockerfile sees the same source tree.
      const src = client
        .host()
        .directory('.', { exclude: ['node_modules', 'dist', '.git', '.nx'] });
      for (const tier of tiers) {
        const ref = imageRef(REGISTRY, tier, sha);
        const published = await src
          .dockerBuild({
            dockerfile: DOCKERFILE[tier],
            platform: TARGET_PLATFORM,
            buildArgs: buildArgs(tier),
          })
          // The address here is the registry host (REGISTRY), not the
          // per-image ref — withRegistryAuth authenticates against the
          // registry itself, not a specific repository/tag within it.
          .withRegistryAuth(REGISTRY, REGISTRY_USER, registrySecret)
          .publish(ref);
        record[tier] = { sha, digest: parseDigest(published), ref };
      }
    },
    { LogOutput: process.stderr },
  );
  return record;
}

async function main(): Promise<void> {
  const sha = process.env['WBS_SHA'];
  if (sha === undefined || sha === '') throw new Error('WBS_SHA must be set');
  const arg = process.argv[2] ?? 'be,gw,fe';
  const tiers = arg.split(',').filter((t): t is Tier => t === 'be' || t === 'gw' || t === 'fe');
  const record = await publishAll(tiers, sha);
  await Bun.write('dist/tool-dagger/release.json', renderRelease(record));
  console.log(renderRelease(record));
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error('[tool-dagger] publish failed:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
