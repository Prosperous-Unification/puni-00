import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Compile each immediate module directory as its own TypeScript program.
 *
 * @throws When the root has no modules, a module lacks a valid config, or a compiler fails.
 */
async function typecheckModules(root: string): Promise<void> {
  const modules = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (modules.length === 0) throw new Error(`${root} has no module directories`);

  const failures: string[] = [];
  for (const name of modules) {
    const directory = join(root, name);
    const config = join(directory, 'tsconfig.json');
    console.log(`typecheck ${directory}`);
    const compiler = Bun.spawn(['bunx', 'tsc', '-p', config], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(compiler.stdout).text(),
      new Response(compiler.stderr).text(),
      compiler.exited,
    ]);
    if (stdout.length > 0) process.stdout.write(stdout);
    if (stderr.length > 0) process.stderr.write(stderr);
    // Proof: missing tsconfig.json failed the CLI test naming absent; assigning {} to Contract
    // failed it with TS2741. Each of the 18 real module target runs failed on its own Exports = {}.
    if (exitCode !== 0) failures.push(directory);
  }
  if (failures.length > 0) throw new Error(`module typecheck failed: ${failures.join(', ')}`);
}

if (import.meta.main) {
  // Proof: removing this argument-count guard lost the usage diagnostic in the CLI test.
  if (process.argv.length !== 3) {
    throw new Error('usage: bun typecheck-modules.ts <module-root>');
  }
  await typecheckModules(process.argv[2]);
}
