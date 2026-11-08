import * as Bun from 'bun';
import process from 'node:process';
import console from 'node:console';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';

const runtime = process.execPath;
assert.equal(Bun.version, '1.4.2');
const directory = mkdtempSync(join(tmpdir(), 'solver-ambient-'));
const home = join(directory, 'home');
const working = join(directory, 'cwd');
mkdirSync(home);
mkdirSync(working);
const preload = join(directory, 'fault.js');
writeFileSync(preload, 'globalThis.ambientFault = "PRELOAD"; console.error("PRELOAD_EXECUTED");');
const bootstrap =
  'console.log(JSON.stringify({fault:globalThis.ambientFault??null,env:process.env.AMBIENT_DOTENV??null}));';
const clean = {
  HOME: home,
  PATH: '/usr/bin:/bin',
  LANG: 'C',
  XDG_CONFIG_HOME: join(home, '.config'),
};

function probe(name, argv = [], environment = {}) {
  const child = Bun.spawnSync([runtime, ...argv, '-e', bootstrap], {
    cwd: working,
    env: { ...clean, ...environment },
    timeout: 5000,
  });
  const stdout = child.stdout.toString().trim();
  const stderr = child.stderr.toString().trim();
  console.log(JSON.stringify({ name, exit: child.exitCode, stdout, stderr }));
  return { exit: child.exitCode, stdout, stderr };
}

try {
  const baseline = probe('baseline');
  assert.equal(baseline.exit, 0);
  assert.equal(baseline.stdout, '{"fault":null,"env":null}');
  const config = `preload = [${JSON.stringify(preload)}]\n`;
  writeFileSync(join(working, 'bunfig.toml'), config);
  assert.match(probe('cwd-bunfig').stderr, /PRELOAD_EXECUTED/);
  // Proof: --mutant=config admits cwd bunfig preload and this empty-stderr assertion fails.
  assert.equal(
    probe(
      'explicit-null-config',
      process.argv.includes('--mutant=config') ? [] : ['--config=/dev/null'],
    ).stderr,
    '',
  );
  assert.match(probe('config-policy-removed').stderr, /PRELOAD_EXECUTED/);
  rmSync(join(working, 'bunfig.toml'));
  writeFileSync(join(home, '.bunfig.toml'), config);
  probe('home-bunfig');
  probe('home-explicit-null-config', ['--config=/dev/null']);
  rmSync(join(home, '.bunfig.toml'));
  mkdirSync(join(home, '.config'));
  mkdirSync(join(home, '.config', 'bun'));
  writeFileSync(join(home, '.config', 'bun', 'bunfig.toml'), config);
  probe('xdg-bunfig');
  rmSync(join(home, '.config', 'bun', 'bunfig.toml'));
  const custom = join(directory, 'custom.toml');
  writeFileSync(custom, config);
  for (const variable of [
    'BUN_CONFIG',
    'BUN_CONFIG_PATH',
    'BUN_CONFIG_REGISTRY',
    'BUN_CONFIG_MAX_HTTP_REQUESTS',
    'BUN_OPTIONS',
    'NODE_OPTIONS',
  ]) {
    probe(variable, [], {
      [variable]: variable.endsWith('OPTIONS')
        ? `--require=${preload}`
        : variable === 'BUN_CONFIG_MAX_HTTP_REQUESTS'
          ? '1'
          : custom,
    });
  }
  const injected = {
    NODE_OPTIONS: `--require=${preload}`,
    BUN_OPTIONS: `--require=${preload}`,
    BUN_CONFIG: custom,
    BUN_CONFIG_PATH: custom,
  };
  const fault = probe('BUN_OPTIONS-positive-fault', [], { BUN_OPTIONS: `--require=${preload}` });
  assert.match(fault.stderr, /PRELOAD_EXECUTED/);
  assert.match(fault.stdout, /"fault":"PRELOAD"/);
  // Proof: retaining BUN_OPTIONS executes PRELOAD before the constant -e body; this control must observe it.
  const isolated = probe(
    'environment-policy',
    ['--no-env-file', '--no-install', '--config=/dev/null'],
    process.argv.includes('--mutant=environment') ? injected : {},
  );
  assert.equal(isolated.stdout, baseline.stdout);
  assert.equal(isolated.stderr, '');
  const removed = probe(
    'environment-policy-removed',
    ['--no-env-file', '--no-install', '--config=/dev/null'],
    injected,
  );
  assert.match(removed.stderr, /PRELOAD_EXECUTED/);
  assert.notEqual(removed.stdout, isolated.stdout);
  writeFileSync(join(working, '.env'), 'AMBIENT_DOTENV=DOTENV\n');
  const dotenv = probe('cwd-dotenv');
  assert.match(dotenv.stdout, /DOTENV/);
  // Proof: --mutant=dotenv admits cwd AMBIENT_DOTENV and the baseline equality fails.
  const noDotenv = probe(
    'no-env-file',
    process.argv.includes('--mutant=dotenv') ? [] : ['--no-env-file'],
  );
  assert.equal(noDotenv.stdout, baseline.stdout);
  rmSync(join(working, '.env'));
  const library = join(directory, 'fault.so');
  const source = join(directory, 'fault.c');
  writeFileSync(
    source,
    '#include <unistd.h>\n__attribute__((constructor)) static void fault(void) { write(2,"LOADER_EXECUTED\\n",16); }\n',
  );
  const compiler = Bun.spawnSync(['/usr/bin/cc', '-shared', '-fPIC', source, '-o', library], {
    timeout: 5000,
  });
  assert.equal(compiler.exitCode, 0, compiler.stderr.toString());
  const loader = probe('LD_PRELOAD-positive-fault', [], { LD_PRELOAD: library });
  assert.match(loader.stderr, /LOADER_EXECUTED/);
  const loaderRemoved = probe(
    'loader-policy-removed',
    ['--no-env-file', '--no-install', '--config=/dev/null'],
    { LD_PRELOAD: library },
  );
  assert.match(loaderRemoved.stderr, /LOADER_EXECUTED/);
  // Proof: --mutant=loader admits the constructor marker and this empty-stderr assertion fails.
  const loaderIsolated = probe(
    'loader-environment-policy',
    ['--no-env-file', '--no-install', '--config=/dev/null'],
    process.argv.includes('--mutant=loader') ? { LD_PRELOAD: library } : {},
  );
  assert.equal(loaderIsolated.stderr, '');
  probe('LD_LIBRARY_PATH-existing', [], { LD_LIBRARY_PATH: directory });
  writeFileSync(join(directory, 'libm.so.6'), 'broken library');
  const shadow = probe('LD_LIBRARY_PATH-shadow', [], { LD_LIBRARY_PATH: directory });
  assert.notEqual(shadow.exit, 0);
  assert.match(shadow.stderr, /libm.so.6/);
  probe('LD_AUDIT-absent-library', [], { LD_AUDIT: join(directory, 'absent.so') });
  mkdirSync(join(working, 'node_modules', 'ambient-package'), { recursive: true });
  writeFileSync(
    join(working, 'node_modules', 'ambient-package', 'package.json'),
    '{"main":"index.js"}',
  );
  writeFileSync(
    join(working, 'node_modules', 'ambient-package', 'index.js'),
    'export default "PACKAGE_EXECUTED";',
  );
  const packageChild = Bun.spawnSync(
    [runtime, '--no-install', '-e', 'console.log((await import("ambient-package")).default)'],
    { cwd: working, env: clean, timeout: 5000 },
  );
  console.log(
    JSON.stringify({
      name: 'package-resolution-no-install',
      exit: packageChild.exitCode,
      stdout: packageChild.stdout.toString().trim(),
      stderr: packageChild.stderr.toString().trim(),
    }),
  );
  assert.equal(packageChild.exitCode, 0);
  assert.match(packageChild.stdout.toString(), /PACKAGE_EXECUTED/);
  console.log(
    'PASS pinned ambient controls; removing environment/config policy admits measured faults; no unit lifecycle exercised',
  );
} finally {
  rmSync(directory, { recursive: true });
}
