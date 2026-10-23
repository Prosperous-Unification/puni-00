import { chmod, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Explicit disposable image filesystem and passwd transport; never selected by production environment. */
export async function prepareImageProbe(root: string): Promise<void> {
  if (
    !/^\/tmp\/source-image-[A-Za-z0-9]+$/.test(root) ||
    (await realpath(root)) !== root ||
    (await lstat(root)).mode % 0o1000 !== 0o700
  )
    throw new Error('invalid image probe fixture');
  await writeFile(join(root, 'fixture-owned'), 'source-image-probe-test-only-v1\n');
  for (const path of ['passwd-home', 'image-home', 'src'])
    await mkdir(join(root, path), { mode: 0o700 });
  const resolver = `#!/bin/sh\n[ "$#" -eq 2 ] && [ "$1" = passwd ] && [ "$2" = 1000 ] || exit 73\nprintf '%s\\n' 'fixture:x:1000:1000:fixture:${root}/passwd-home:/bin/sh'\n`;
  await writeFile(join(root, 'getent'), resolver, { mode: 0o700 });
  await chmod(join(root, 'getent'), 0o700);
  await writeFile(join(root, 'find'), '#!/bin/sh\nexec /usr/bin/find "$@"\n', { mode: 0o700 });
  await chmod(join(root, 'find'), 0o700);
}
/** Runs the production native program after validating its exact image-only context and two fixed translations. */
export async function runImageProbe(
  command: readonly string[],
  root: string,
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string; code: number }> {
  if (
    !/^\/tmp\/source-image-[A-Za-z0-9]+$/.test(root) ||
    (await realpath(root)) !== root ||
    (await readFile(join(root, 'fixture-owned'), 'utf8')) !== 'source-image-probe-test-only-v1\n'
  )
    throw new Error('foreign image probe fixture');
  const program = command.at(-1);
  const image = command.at(11);
  if (
    program === undefined ||
    image === undefined ||
    !/^sha256:[a-f0-9]{64}$/.test(image) ||
    !program.startsWith('set -eu\nset -f\n')
  )
    throw new Error('image probe program differs');
  const prefix = [
    'run',
    '--rm',
    '--pull',
    'never',
    '--network',
    'none',
    '--read-only',
    '--user',
    '1000:1000',
    '--entrypoint',
    '/usr/bin/env',
    image,
    '-i',
    'PATH=/usr/local/bin:/usr/bin:/bin',
    'BUN_RUNTIME_TRANSPILER_CACHE_PATH=0',
  ];
  // Docker image position is checked structurally below; no runtime mount or app environment is accepted.
  const actual = command.slice(0, -3);
  const home = actual.at(-1);
  if (typeof home === 'string' && home.startsWith('HOME=')) {
    if (home !== `HOME=${root}/image-home`) throw new Error('foreign image HOME');
    actual.pop();
  }
  if (
    JSON.stringify(actual) !== JSON.stringify(prefix) ||
    command.at(-3) !== '/bin/sh' ||
    command.at(-2) !== '-c' ||
    program.split('/usr/bin/getent').length !== 3 ||
    program.split('/usr/bin/find').length !== 4 ||
    program.split('source=/src').length !== 2
  )
    throw new Error('image probe context differs');
  const translated = program
    .replaceAll('/usr/bin/getent', join(root, 'getent'))
    .replaceAll('/usr/bin/find', join(root, 'find'))
    .replace('source=/src', `source=${root}/src`);
  const environment = command.slice(command.indexOf('-i') + 1, -3);
  const child = Bun.spawn(['/usr/bin/env', '-i', ...environment, '/bin/sh', '-c', translated], {
    stdout: 'pipe',
    stderr: 'pipe',
    signal,
    killSignal: 'SIGKILL',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}
