#!/usr/bin/env -S -u BUN_OPTIONS -u BUN_INSPECT_PRELOAD -u NODE_OPTIONS -u BUN_BE_BUN bun --no-env-file --config=/dev/null
import { runCompatibility } from './ops/lock-compat';

process.exit(
  await runCompatibility(process.argv.slice(2), {
    get callerDirectory() {
      return process.cwd();
    },
    environment: process.env,
  }),
);
