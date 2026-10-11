import * as fs from 'node:fs';

import { mock } from 'bun:test';

const originalLstat = fs.lstatSync.bind(fs);
const originalFstat = fs.fstatSync.bind(fs);
const originalReadlink = fs.readlinkSync.bind(fs);
const argumentsFromCli: unknown[] = process.argv.slice(2);
const [configurationPath, targetPath, fault] = argumentsFromCli;
if (
  typeof configurationPath !== 'string' ||
  typeof targetPath !== 'string' ||
  typeof fault !== 'string'
)
  throw new Error('filesystem fixture arguments malformed');

void mock.module('node:fs', () => ({
  ...fs,
  lstatSync: (path: string) => {
    const stat = originalLstat(path);
    if (fault === 'ancestor-owner' && path === targetPath)
      Object.defineProperty(stat, 'uid', { value: 777777 });
    return stat;
  },
  fstatSync: (descriptor: number) => {
    const stat = originalFstat(descriptor);
    if (
      fault === 'leaf-owner' &&
      originalReadlink(`/proc/self/fd/${String(descriptor)}`) === targetPath
    )
      Object.defineProperty(stat, 'uid', { value: 777777 });
    return stat;
  },
}));

const { runObservationService } = await import('./observation-service');
let fetches = 0;
const diagnostics: unknown[] = [];
const code = await runObservationService(configurationPath, {
  fetcher: () => {
    fetches += 1;
    return Promise.resolve(new Response('[]'));
  },
  reportDiagnostic: (diagnostic) => {
    diagnostics.push(diagnostic);
  },
});
process.stdout.write(`${JSON.stringify({ code, fetches, diagnostics })}\n`);
