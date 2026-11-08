import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const repository = process.env['RESTIC_REPOSITORY'];
if (repository === undefined) throw new Error('Missing fixture repository');
const arguments_ = process.argv.slice(2);
const request = JSON.stringify(arguments_);
if (request === JSON.stringify(['--no-cache', '--no-lock', 'cat', 'config']))
  process.stdout.write(await readFile(join(repository, 'config.json'), 'utf8'));
else if (request === JSON.stringify(['--no-cache', 'snapshots', '--json'])) {
  const failure = await readFile(join(repository, 'failure'), 'utf8');
  if (failure === 'exit') process.exit(1);
  if (failure === 'replace-config')
    await writeFile(join(repository, 'config.json'), JSON.stringify({ id: 'd'.repeat(64) }));
  if (failure === 'hang') await new Promise(() => undefined);
  process.stdout.write(await readFile(join(repository, 'snapshots.json'), 'utf8'));
} else if (
  arguments_[0] === '--no-cache' &&
  arguments_[1] === 'dump' &&
  /^[a-f0-9]{64}$/.test(arguments_[2] ?? '') &&
  arguments_.length === 4
)
  process.stdout.write(await readFile(join(repository, 'journal.json'), 'utf8'));
else throw new Error('Unexpected retention restic invocation: ' + request);
