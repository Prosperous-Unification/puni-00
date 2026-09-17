import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Build the standalone Twilight Bureaucrat executable into a package root.
 *
 * The bundle contains every workspace import and resolves runtime assets from
 * its installed module location. A failed or ambiguous build throws.
 */
export async function buildPackage(
  destination: string,
  build: (config: Bun.BuildConfig) => Promise<Bun.BuildOutput> = Bun.build,
): Promise<void> {
  const built = await build({
    entrypoints: [join(import.meta.dir, '../bin.ts')],
    target: 'bun',
    format: 'esm',
  });
  // Proof: injecting a successful build with no output made the focused production-path test
  // fail with `Expected promise to reject` when this refusal was removed.
  if (!built.success || built.outputs.length !== 1) {
    throw new Error(`Cannot build Twilight Bureaucrat: ${built.logs.map(String).join('; ')}`);
  }
  const outputDirectory = join(destination, 'dist');
  const executable = join(outputDirectory, 'bin.mjs');
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(executable, `#!/usr/bin/env bun\n${await built.outputs[0].text()}`, 'utf8');
  await chmod(executable, 0o755);
}

if (import.meta.main) {
  await buildPackage(join(import.meta.dir, '../..'));
}
