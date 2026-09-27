import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import ts from 'typescript';

/**
 * The `.ts` files a module's config leaves out of its own program.
 *
 * A config whose `include` is dropped inherits the project's solution-style
 * empty inputs, and `tsc -p` then exits 0 having read nothing, so a zero exit
 * alone does not prove the module was checked.
 *
 * @throws When the config is unreadable or malformed.
 */
async function listUncompiled(directory: string, config: string): Promise<string[]> {
  const read = ts.readConfigFile(config, (path) => ts.sys.readFile(path));
  if (read.error !== undefined) {
    throw new Error(`${config}: ${ts.flattenDiagnosticMessageText(read.error.messageText, '\n')}`);
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, directory);
  const compiled = new Set(parsed.fileNames.map((file) => resolve(file)));
  return (await readdir(directory))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => resolve(directory, file))
    .filter((file) => !compiled.has(file));
}

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
    // Proof: with this guard disabled, "names a module its config leaves unchecked" received
    // exit code 0 (tsc read zero files), and wbs-core:typecheck:module passed with
    // authentication/tsconfig.json's `include` deleted.
    const uncompiled = await listUncompiled(directory, config);
    if (uncompiled.length > 0) {
      failures.push(`${directory} (config leaves out ${uncompiled.join(', ')})`);
      continue;
    }
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
    // Proof: assigning {} to Contract failed the CLI test with TS2741; each of the 18 real
    // modules' typecheck:module run failed on its own `<Exports> = {}` (verify.md, task 7.3).
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
