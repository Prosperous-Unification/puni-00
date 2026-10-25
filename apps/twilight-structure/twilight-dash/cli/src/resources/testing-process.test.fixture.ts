import { readFileSync } from 'node:fs';

import { type CreationRequest, loadResourceConfiguration, ResourceRuntime } from './runtime';
const [config, requestPath] = process.argv.slice(2);
if (!config || !requestPath) throw new Error('fixture configuration and request required');
const runtime = ResourceRuntime.open(loadResourceConfiguration(config), {
  read: () => 1800000000000,
});
try {
  const use = runtime.create(JSON.parse(readFileSync(requestPath, 'utf8')) as CreationRequest);
  process.stdout.write(`${JSON.stringify(use)}\n`);
  if (process.argv[4] === 'stdin')
    process.exitCode = await runtime.run(use.id, [
      '/bin/sh',
      '-c',
      'read payload; test "$payload" = expected',
    ]);
  if (process.argv[4] === 'run')
    await runtime.run(use.id, ['/bin/sh', '-c', 'echo running; exec sleep 30']);
} catch (cause) {
  process.stderr.write(cause instanceof Error ? cause.message : 'fixture refused');
  process.exitCode = 2;
} finally {
  runtime.close();
}
