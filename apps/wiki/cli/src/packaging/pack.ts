import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

interface PackInvocation {
  exitCode: number;
  stderr: Uint8Array;
}

/** Pack the built package and refuse a package-manager failure. */
export async function packPackage(
  packageRoot: string,
  destination: string,
  run: (
    command: string[],
    options: { cwd: string; stderr: 'pipe'; stdout: 'inherit' },
  ) => PackInvocation = (command, options) => Bun.spawnSync(command, options),
): Promise<void> {
  await mkdir(destination, { recursive: true });
  const packed = run(['bun', 'pm', 'pack', '--destination', destination], {
    cwd: packageRoot,
    stderr: 'pipe',
    stdout: 'inherit',
  });
  // Proof: injecting exit 23 made the focused production-path test fail with
  // `Expected promise to reject` when this refusal was removed.
  if (packed.exitCode !== 0) {
    throw new Error(`Cannot pack Twilight Bureaucrat: ${new TextDecoder().decode(packed.stderr)}`);
  }
}

if (import.meta.main) {
  const packageRoot = join(import.meta.dir, '../..');
  await packPackage(packageRoot, join(packageRoot, '../../../dist/twilight-bureaucrat-pack'));
}
