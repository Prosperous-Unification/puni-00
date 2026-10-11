import {
  BrowserLifecycleRefusedError,
  SqliteBrowserAuthLifecycle,
} from '../browser-auth-lifecycle';
import { openConnection } from '../db';
import { WriteCoordinator } from '../gate';

async function race(argv: readonly string[]): Promise<void> {
  if (argv.length !== 2) throw new Error('usage: <dbPath> <successorDigest>');
  const [path, successorDigest] = argv;
  const connection = openConnection(path);
  try {
    const lifecycle = new SqliteBrowserAuthLifecycle(connection.db, new WriteCoordinator());
    const captured = await lifecycle.generation('one');
    process.stdout.write('ready\n');
    let released = false;
    for await (const line of console) {
      if (line !== 'go') throw new Error('invalid race release');
      released = true;
      break;
    }
    if (!released) throw new Error('missing race release');
    try {
      await lifecycle.replace(
        'one',
        captured.generation,
        captured.current,
        { ...captured.current, digest: successorDigest },
        7,
      );
      process.stdout.write('won\n');
    } catch (cause) {
      if (!(cause instanceof BrowserLifecycleRefusedError)) throw cause;
      process.stdout.write('lost\n');
    }
  } finally {
    connection.close();
  }
}

await race(Bun.argv.slice(2));
