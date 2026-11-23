import { constants } from 'node:fs';
import { chmod, copyFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

/**
 * Builds a local, fresh poller generation outside its watched source checkout. The installed
 * shell owns the admission bundle's literal digest; later target loaders cannot supply it.
 * Does not publish remotely, acquire locks or change an existing installed generation.
 * @throws On an existing stage, mismatched interpreter pin or failed single-file Bun bundle.
 */
export async function stageDevPoller(directory: string): Promise<void> {
  const root = new URL('../../../', import.meta.url).pathname;
  if (!isAbsolute(directory)) throw new Error('poller staging requires an absolute directory');
  const canonical = join(await realpath(dirname(resolve(directory))), basename(directory));
  const within = relative(await realpath(root), canonical);
  if (!within.startsWith('..' + '/') && within !== '..')
    throw new Error('poller staging must be outside the watched source checkout');
  const version = (
    await readFile(new URL('../../../.bun-version', import.meta.url), 'utf8')
  ).trim();
  if (version !== Bun.version) throw new Error('poller staging requires the pinned Bun ' + version);
  const compilation = await Bun.build({
    entrypoints: [new URL('./initial-access-cli.ts', import.meta.url).pathname],
    target: 'bun',
  });
  const artifact = compilation.outputs.at(0);
  if (!compilation.success || compilation.outputs.length !== 1 || artifact === undefined)
    throw new Error('initial-access admission must bundle to one installed Bun artifact');
  const bytes = new Uint8Array(await artifact.arrayBuffer());
  const digest = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
  const template = await readFile(new URL('../../../bin/dev-poll.sh', import.meta.url), 'utf8');
  const anchor = '__INITIAL_ACCESS_ADMISSION_SHA256__';
  if (template.split(anchor).length !== 2)
    throw new Error('poller admission digest anchor differs');
  await mkdir(directory, { mode: 0o700 });
  await writeFile(join(directory, 'initial-access-admission.js'), bytes, {
    flag: 'wx',
    mode: 0o644,
  });
  await writeFile(join(directory, 'poll.sh'), template.replace(anchor, digest), {
    flag: 'wx',
    mode: 0o755,
  });
  await copyFile(
    new URL('../../../bin/dev-poll-sync.sh', import.meta.url),
    join(directory, 'dev-poll-sync.sh'),
    constants.COPYFILE_EXCL,
  );
  await chmod(join(directory, 'dev-poll-sync.sh'), 0o755);
  await copyFile(
    process.execPath,
    join(directory, 'bun'),
    constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE,
  );
  await chmod(join(directory, 'bun'), 0o755);
  await writeFile(join(directory, 'bun-version'), version + '\n', { flag: 'wx', mode: 0o644 });
}

if (import.meta.main) {
  const directory = process.argv[2];
  if (process.argv.length !== 3)
    throw new Error('usage: stage-dev-poller <fresh-absolute-stage-directory>');
  await stageDevPoller(directory);
}
