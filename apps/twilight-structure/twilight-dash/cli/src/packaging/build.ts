import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** The checkout this module was loaded from. */
export const workspaceRoot = resolve(import.meta.dir, '../../../../../..');

/** Where `twilight-dash:build` writes the launcher: the workspace-root `dist/` of this project. */
export const launcherDirectory = join(
  workspaceRoot,
  'dist/apps/twilight-structure/twilight-dash/cli',
);

const launcherEntrypoint =
  'apps/twilight-structure/twilight-dash/cli/src/activation/observation-service-cli.ts';

/**
 * The one Bun build of `activation/observation-service-cli.ts`, the second composition root that
 * the observation service unit pins by path and SHA-256. It is a launcher file rather than a
 * `runDash` command because systemd pins one file and its exact `env -i` argv. Whitespace
 * minification drops the bundler's per-module source-path comments, which name paths relative to
 * the building process's working directory.
 */
export function launcherBuildConfig(root = workspaceRoot): Bun.BuildConfig {
  return {
    entrypoints: [join(root, launcherEntrypoint)],
    target: 'bun',
    format: 'esm',
    minify: { whitespace: true },
  };
}

/**
 * Makes the launcher depend on the revision alone. Bun inlines a CommonJS module's `__dirname`
 * and `__filename` as absolute paths (TypeScript's compiler, reached through the judge's
 * relationship extractor), so every occurrence of the checkout root becomes workspace-relative.
 * The launcher never reads those paths on a host, which has no `node_modules`. Throws if the root
 * survives, as it would inside a string the replacement cannot see whole.
 */
export function normaliseLauncher(source: string, root: string): string {
  const normalised = source.replaceAll(`${root}/`, '');
  if (normalised.includes(root)) throw new Error(`launcher still names its checkout: ${root}`);
  return normalised;
}

/**
 * Builds `observation-service.mjs` into `destination` and returns its SHA-256, the layout's
 * `launcherIdentity`. A failed or ambiguous build throws; an existing launcher is replaced.
 */
export async function buildLauncher(
  destination: string,
  build: (config: Bun.BuildConfig) => Promise<Bun.BuildOutput> = Bun.build,
  root = workspaceRoot,
): Promise<string> {
  const built = await build(launcherBuildConfig(root));
  // Proof: dropping the output-count half made `an unsuccessful or ambiguous launcher build
  // refuses before writing` fail with "TypeError: undefined is not an object" (2026-10-12).
  if (!built.success || built.outputs.length !== 1) {
    throw new Error(`Cannot build the observation launcher: ${built.logs.map(String).join('; ')}`);
  }
  // Proof: without this normalisation and the whitespace minification, two copies of the build
  // inputs at different roots built different launchers; `two checkouts at different paths build
  // byte-identical launchers` failed naming the first root (2026-10-12).
  const bytes = new TextEncoder().encode(normaliseLauncher(await built.outputs[0].text(), root));
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
