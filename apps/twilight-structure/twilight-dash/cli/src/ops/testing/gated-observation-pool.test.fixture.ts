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
const killScenario = scenario.startsWith('control-kill-');
const orderedKill = scenario === 'control-kill-ordering';
const checkout = catalogueCheckout(join(pool.base, 'checkout'), [
    {
      id: 'test-queued',
      cpuCores: 1,
      memoryGib: 1,
      tmpDiskGib: 1,
      ...(killScenario ? { maxRuntimeMinutes: 1 } : {}),
    },
  ]),
  bin = fakeSystemdRun(join(pool.base, 'bin'), 'exec'),
  payload = join(pool.base, 'payload.mjs');
writeFileSync(
  payload,
  '#!' +
    process.execPath +
    (killScenario ? '\nprocess.on("SIGTERM",()=>undefined);' : '') +
    (orderedKill
      ? '\nBun.spawn(["setsid","sh","-c",' +
        JSON.stringify(
          'trap "" TERM; echo $$ > ' + join(pool.base, 'escaped-ready') + '; exec sleep 30',
        ) +
        '],{cwd:process.env["TMPDIR"],env:process.env,stdin:"ignore",stdout:"ignore",stderr:"inherit"});\nwhile(!(await Bun.file(' +
        JSON.stringify(join(pool.base, 'escaped-ready')) +
        ').exists()))await Bun.sleep(1);\n'
      : '') +
    '\nawait Bun.write(' +
    JSON.stringify(join(pool.base, 'leader-payload-ready')) +
    ',"ready");\n' +
    (scenario === 'leader-error' || killScenario
      ? 'while(!(await Bun.file(' +
        JSON.stringify(join(pool.base, 'release-leader-payload')) +
        ').exists()))await Bun.sleep(1);\n'
      : '') +
    'process.exitCode=' +
    String(scenario === 'leader-error' ? 37 : 3) +
    ';\n',
  { mode: 0o755 },
);
if (orderedKill) {
  const systemctl = join(bin, 'systemctl');
  const script = readFileSync(systemctl, 'utf8');
  const newline = script.indexOf('\n');
  writeFileSync(
    systemctl,
    script.slice(0, newline + 1) +
      'if [ "$2" = kill ]; then test -f ' +
      join(pool.base, 'keeper-native-joined') +
      ' || { touch ' +
      join(pool.base, 'kill-before-keeper') +
      '; exit 78; }; fi\n' +
      script.slice(newline + 1),
  );
}
writeFileSync(
  join(root, 'pool.json'),
  JSON.stringify({ base: pool.base, config: pool.config, checkout, bin, payload }),
);
