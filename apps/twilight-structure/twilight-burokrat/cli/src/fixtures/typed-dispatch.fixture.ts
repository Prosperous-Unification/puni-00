import { mock } from 'bun:test';

import * as grammar from '../cli-parser';

await mock.module('../cli-parser', () => ({
  ...grammar,
  readInstalledRequest: () => {
    throw new Error('typed dispatch re-entered the argv adapter');
  },
}));

const { runCli } = await import('../cli');
await runCli({ command: 'template', action: 'list' });
