import { rejects } from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import { runDockerCli } from '../lib/docker-deadline';
import { observeSourceDatabaseBindings } from '../lib/source-database-binding';
import { sourceDatabaseFixture } from './source-database-binding';
import { roots } from './source-startup';

const boundary = { started: false, settled: false, aborted: false };
try {
  const f = await sourceDatabaseFixture();
  await rejects(
    f.scoped(async (owner, source, solver, deadline) => {
      f.setIntercept(async (args, signal) => {
        if (boundary.started || args[0] !== 'ps') return;
        boundary.started = true;
        signal?.addEventListener(
          'abort',
          () => {
            boundary.aborted = true;
          },
          { once: true },
        );
        try {
          await runDockerCli(args, signal);
        } finally {
          boundary.settled = true;
        }
      });
      await rejects(
        observeSourceDatabaseBindings(
          owner,
          f.layouts,
          source,
          solver,
          f.pins,
          f.contents,
          f.docker,
          deadline,
        ),
        /source database binding refused/,
      );
      if (!boundary.settled) throw new Error('native Docker boundary returned before settlement');
    }, 4000),
  );
  if (!boundary.started || !boundary.settled || !boundary.aborted)
    throw new Error('native Docker boundary did not abort and settle');
  console.log(JSON.stringify(boundary));
} finally {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
}
