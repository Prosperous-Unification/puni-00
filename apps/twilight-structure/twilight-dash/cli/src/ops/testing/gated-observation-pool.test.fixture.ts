import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { wallClock } from '../../clock';
import { ampleHost, hostPoolFixture } from '../../resources/host-pool.test.fixture';
import { loadResourceConfiguration, ResourceRuntime } from '../../resources/runtime';
import { catalogueCheckout, fakeSystemdRun } from '../ops.test.fixture';

const root = process.argv.at(2),
  scenario = process.argv.at(3);
if (root === undefined || scenario === undefined)
  throw new Error('missing observation pool operands');
const supplied: unknown = JSON.parse(readFileSync(join(root, 'setup-input.json'), 'utf8'));
if (
  typeof supplied !== 'object' ||
  supplied === null ||
  !('credential' in supplied) ||
  typeof supplied.credential !== 'string'
)
  throw new Error('missing observation pool fixture credential');
const pool = hostPoolFixture({
  cpuCores: 4,
  memoryGib: 4,
  headroom: { cpuCores: 0, memoryGib: 1 },
  gateTrees: 0,
  credential: supplied.credential,
});
ResourceRuntime.initialize(loadResourceConfiguration(pool.config), wallClock(), ampleHost).close();
const checkout = catalogueCheckout(join(pool.base, 'checkout'), [
    { id: 'test-queued', cpuCores: 1, memoryGib: 1, tmpDiskGib: 1 },
  ]),
  bin = fakeSystemdRun(join(pool.base, 'bin'), 'exec'),
  payload = join(pool.base, 'payload.mjs');
writeFileSync(
  payload,
  '#!' +
    process.execPath +
    '\nawait Bun.write(' +
    JSON.stringify(join(pool.base, 'leader-payload-ready')) +
    ',"ready");\n' +
    (scenario === 'leader-error'
      ? 'while(!(await Bun.file(' +
        JSON.stringify(join(pool.base, 'release-leader-payload')) +
        ').exists()))await Bun.sleep(1);\n'
      : '') +
    'process.exitCode=' +
    String(scenario === 'leader-error' ? 37 : 3) +
    ';\n',
  { mode: 0o755 },
);
writeFileSync(
  join(root, 'pool.json'),
  JSON.stringify({ base: pool.base, config: pool.config, checkout, bin, payload }),
);
