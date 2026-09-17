import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { hashBytes } from '../evidence/content-manifest';
import { assertPinnedTypeScript, assertReleaseRuntime, planToolkit } from '../policy/release';
import {
  buildValidatorBundle,
  copyTrustedModules,
  hashTrustedModules,
  packageDirectory,
  trustedModuleNames,
} from '../policy/trusted-modules';
import { packageManifestBytes, packageVersion } from './manifest';

function gitText(repository: string, argv: readonly string[], subject: string): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  if (invocation.exitCode !== 0) {
    throw new Error(`${subject}: ${invocation.stderr.toString('utf8').trim()}`);
  }
  return invocation.stdout.toString('utf8').trim();
}

async function buildToolkit(repository: string, destination: string): Promise<Uint8Array> {
  assertReleaseRuntime(Bun.version, await readFile(join(repository, '.bun-version'), 'utf8'));
  const sourceRevision = gitText(repository, ['rev-parse', 'HEAD'], 'cannot resolve source HEAD');
  const roleBytes = {
    'launcher.sh': await readFile(join(repository, 'bin/tool-wiki-lint.sh')),
    'snapshotter.ts': await readFile(
      join(repository, 'apps/wiki/cli/src/policy/snapshot-validator.ts'),
    ),
    'validator.mjs': await buildValidatorBundle(join(repository, 'apps/wiki/cli/src/cli.ts')),
    'prepare-activation.mjs': await buildValidatorBundle(
      join(repository, 'apps/wiki/cli/src/policy/prepare-activation-cli.ts'),
    ),
    'prepare-relocation-activation.mjs': await buildValidatorBundle(
      join(repository, 'apps/wiki/cli/src/policy/prepare-relocation-activation-cli.ts'),
    ),
  } as const;
  const modulesRoot = join(repository, 'node_modules');
  const rootManifest = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const installedTypeScript = JSON.parse(
    await readFile(join(packageDirectory(modulesRoot, 'typescript'), 'package.json'), 'utf8'),
  ) as { version?: string };
  assertPinnedTypeScript(
    rootManifest.devDependencies?.['typescript'] ?? rootManifest.dependencies?.['typescript'],
    installedTypeScript.version ?? '(absent)',
  );
  const trustedNodeModules = trustedModuleNames(modulesRoot);
  const closure = join(destination, 'trusted-node-modules');
  copyTrustedModules(closure, modulesRoot, trustedNodeModules);
  const toolkit = planToolkit({
    tag: `twilight-bureaucrat-v${packageVersion}`,
    sourceRevision,
    bunVersion: Bun.version,
    roleBytes,
    trustedNodeModules,
    trustedNodeModulesIdentity: hashTrustedModules(closure),
  });
  for (const [role, bytes] of Object.entries(roleBytes)) {
    await writeFile(join(destination, role), bytes);
  }
  await chmod(join(destination, 'launcher.sh'), 0o555);
  await writeFile(join(destination, 'toolkit.json'), toolkit.descriptor);
  await writeFile(join(destination, 'SHA256SUMS'), toolkit.checksums);
  return packageManifestBytes(sourceRevision, hashBytes(toolkit.descriptor));
}

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
  // Proof: rebuilding over the generated 0555 launcher failed with EACCES in the focused package
  // test and in the exact-commit Nx pack target until the owned output was recreated as a unit.
  await rm(outputDirectory, { force: true, recursive: true });
  await mkdir(outputDirectory, { recursive: true });
  const toolkitDirectory = join(outputDirectory, 'toolkit');
  await mkdir(toolkitDirectory, { recursive: true });
  const packageManifest = await buildToolkit(
    resolve(import.meta.dir, '../../../../..'),
    toolkitDirectory,
  );
  await writeFile(executable, `#!/usr/bin/env bun\n${await built.outputs[0].text()}`, 'utf8');
  await chmod(executable, 0o755);
  await writeFile(join(outputDirectory, 'package-manifest.json'), packageManifest);
}

if (import.meta.main) {
  await buildPackage(join(import.meta.dir, '../..'));
}
