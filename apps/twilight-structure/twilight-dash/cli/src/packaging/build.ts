import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Where `twilight-dash:build` writes the launcher: the workspace-root `dist/` of this project. */
export const launcherDirectory = resolve(
  import.meta.dir,
  '../../../../../../dist/apps/twilight-structure/twilight-dash/cli',
);

/**
 * The one Bun build of `activation/observation-service-cli.ts`, the second composition root that
 * the observation service unit pins by path and SHA-256. It is a launcher file rather than a
 * `runDash` command because systemd pins one file and its exact `env -i` argv.
 */
export function launcherBuildConfig(): Bun.BuildConfig {
  return {
    entrypoints: [join(import.meta.dir, '../activation/observation-service-cli.ts')],
    target: 'bun',
    format: 'esm',
  };
}

/**
 * Builds `observation-service.mjs` into `destination` and returns its SHA-256, the layout's
 * `launcherIdentity`. A failed or ambiguous build throws; an existing launcher is replaced.
 */
export async function buildLauncher(
  destination: string,
  build: (config: Bun.BuildConfig) => Promise<Bun.BuildOutput> = Bun.build,
): Promise<string> {
  const built = await build(launcherBuildConfig());
  // Proof: dropping the output-count half made `an unsuccessful or ambiguous launcher build
  // refuses before writing` fail with "TypeError: undefined is not an object" (2026-10-12).
  if (!built.success || built.outputs.length !== 1) {
    throw new Error(`Cannot build the observation launcher: ${built.logs.map(String).join('; ')}`);
  }
  const bytes = new Uint8Array(await built.outputs[0].arrayBuffer());
  const launcher = join(destination, 'observation-service.mjs');
  await mkdir(destination, { recursive: true });
  await rm(launcher, { force: true });
  await writeFile(launcher, bytes, { flag: 'wx', mode: 0o644 });
  return createHash('sha256').update(bytes).digest('hex');
}

if (import.meta.main) {
  const identity = await buildLauncher(launcherDirectory);
  process.stdout.write(`${identity}  ${join(launcherDirectory, 'observation-service.mjs')}\n`);
}
