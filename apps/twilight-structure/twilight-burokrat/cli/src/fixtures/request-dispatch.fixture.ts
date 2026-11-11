import { mock } from 'bun:test';

import * as grammar from '../cli-parser';

await mock.module('../cli-parser', () => ({
  ...grammar,
  readInvocation: () => {
    throw new Error('typed request entered the argv parser');
  },
  readInstalledRequest: () => {
    throw new Error('typed request entered the argv adapter');
  },
}));

const { executeRequest } = await import('../cli');
await executeRequest(
  JSON.stringify({
    version: 1,
    callerDirectory: process.cwd(),
    request: { command: 'template', action: 'list' },
  }),
);
