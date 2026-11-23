import { dirname } from 'node:path';

import { runPreparationExecutable } from '../preparation-main';

if (import.meta.main)
  // Proof: c27-entry-hard-exit-prepare-relocation-activation; Linux/x64 isolated native subreaper observes failure exit before exact fixture stage reaping; injected fault failed `actual prepare-relocation-activation exits after unconfirmed Git cleanup before fixture reaping`; restoration passed.
  process.exit(
    await runPreparationExecutable('prepare-relocation-activation', process.argv.slice(2), {
      directory: dirname(import.meta.path),
      runtime: process.execPath,
    }),
  );
