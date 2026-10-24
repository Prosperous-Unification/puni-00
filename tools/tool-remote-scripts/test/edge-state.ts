import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';

/** Gives swap CLI tests private admitted state without inheriting a host lock token. */
export function createEdgeEnvironment(): NodeJS.ProcessEnv {
  const state = scratchSync('swap-cli-edge-');
  writeFileSync(join(state, 'edge.lock'), '');
  const environment: NodeJS.ProcessEnv = { ...process.env, WBS_EDGE_STATE: state };
  delete environment['WBS_EDGE_LOCK_FD'];
  return environment;
}
