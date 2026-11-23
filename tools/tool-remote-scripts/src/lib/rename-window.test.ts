import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, beforeAll, expect, test } from 'bun:test';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const APP_ROOT = join(REPO_ROOT, 'apps/wbs/be-01');
const IMAGE_ID = 'sha256:' + 'a'.repeat(64);
const CONTAINER_ID = 'b'.repeat(64);
const processPath = (() => {
  const path = process.env['PATH'];
  if (path === undefined) throw new Error('host test requires an explicit PATH');
  return path;
})();
const roots: string[] = [];
let predecessor: string;
beforeAll(() => {
  const root = scratchSync('wbs-rename-predecessor-');
  predecessor = join(root, 'predecessor.db');
  const setup = `
    import { runMigrations } from '@wbs/store-sqlite/migrate';
    import { copyRecoveryPrefix } from '@wbs/store-sqlite/testing/recovery-state';
    runMigrations(process.argv[1], copyRecoveryPrefix(process.argv[2], '20261103110000_add_initial_access_offers'));
  `;
  const migrated = Bun.spawnSync([process.execPath, '-e', setup, predecessor, root], {
    cwd: APP_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(migrated.exitCode, migrated.stderr.toString()).toBe(0);
}, 30_000);
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wbs-rename-host-'));
  roots.push(root);
  const artifacts = join(root, 'artifacts');
  mkdirSync(artifacts);
  const stateDir = join(root, 'state');
  mkdirSync(stateDir);
  const sourcePath = join(artifacts, 'source.db');
  const snapshotPath = join(artifacts, 'snapshot.db');
  const reportPath = join(artifacts, 'report.json');
  // The migration subprocess closed its only connection before this template is copied.
  copyFileSync(predecessor, sourcePath);
  const produced = Bun.spawnSync(
    [process.execPath, 'run', 'src/backup-db-cli.ts', snapshotPath, '--report=' + reportPath],
    { cwd: APP_ROOT, env: { ...process.env, DB_PATH: sourcePath }, stdout: 'pipe', stderr: 'pipe' },
  );
  expect(produced.exitCode).toBe(0);
  const container = {
    Id: CONTAINER_ID,
    State: { Running: false, Paused: false, Restarting: false, Status: 'exited' },
    Mounts: [
      { Type: 'bind', Source: artifacts, Destination: artifacts, RW: true },
      { Type: 'bind', Source: REPO_ROOT, Destination: '/app', RW: true },
    ],
  };
  const configPath = join(root, 'docker.json');
  const logPath = join(root, 'docker-argv.jsonl');
  const counterPath = join(root, 'inspect-count');
  writeFileSync(counterPath, '0');
  const config = {
    stateDir,
    first: container,
    last: container,
    imageId: IMAGE_ID,
    mode: 'verify',
    overrideReceipt: null as null | Record<string, unknown>,
  };
  writeFileSync(configPath, JSON.stringify(config));
  const tools = join(root, 'tools');
  mkdirSync(tools);
  const program = [
    '#!/usr/bin/env bun',
    'import{readFileSync,writeFileSync,appendFileSync}from"node:fs";',
    'const configPath=' + JSON.stringify(configPath) + ';',
    'const logPath=' + JSON.stringify(logPath) + ';',
    'const counterPath=' + JSON.stringify(counterPath) + ';',
    'const args=process.argv.slice(2);appendFileSync(logPath,JSON.stringify(args)+"\\n");',
    'const config=JSON.parse(readFileSync(configPath,"utf8"));',
    'if(config.mode==="inspect-failed"&&args[0]==="container"){console.error("inspection unavailable");process.exit(17);}',
    'if(config.mode==="inspect-malformed"&&args[0]==="container"){console.log("{malformed");process.exit(0);}',
    'if(config.mode==="image-failed"&&args[0]==="image"){console.error("image unavailable");process.exit(18);}',
    'if(config.mode==="write-release"&&args[0]==="run")writeFileSync(config.stateDir+"/be.json","new recorded release");',
    'if(args[0]==="container"&&args[1]==="inspect"){const count=Number(readFileSync(counterPath,"utf8"));writeFileSync(counterPath,String(count+1));console.log(JSON.stringify(config.mode==="container-many"?[config.first,config.first]:[config.mode.startsWith("name-rebound")&&args[2]==="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"?config.first:count===0?config.first:config.last]));}',
    'else if(args[0]==="image"&&args[1]==="inspect"){console.log(JSON.stringify(config.mode==="image-many"?[{Id:config.imageId},{Id:config.imageId}]:[{Id:config.imageId}]));}',
    'else if(args[0]==="run"){',
    'if(config.mode==="run-fail"){console.error("candidate verifier refused");process.exit(19);}',
    'if(config.overrideReceipt!==null){console.log(JSON.stringify(config.overrideReceipt));process.exit(0);}',
    'const mounts=args.flatMap((value,index)=>value==="--mount"?[Object.fromEntries(args[index+1].split(",").map(field=>field.split("=")))]:[]);',
    'const translate=(path)=>{const mount=mounts.filter(mount=>path===mount.dst||path.startsWith(mount.dst+"/")).sort((left,right)=>right.dst.length-left.dst.length)[0];if(mount===undefined)throw new Error("fake Docker has no mapping");return mount.src+path.slice(mount.dst.length);};',
    'const source=translate(args.find(value=>value.startsWith("DB_PATH=")).slice("DB_PATH=".length));',
    'const report="--report="+translate(args.find(value=>value.startsWith("--report=")).slice("--report=".length));',
    'const verified=Bun.spawnSync([process.execPath,"run","src/assert-window-cli.ts",report],{cwd:' +
      JSON.stringify(APP_ROOT) +
      ',env:{...process.env,DB_PATH:source},stdout:"pipe",stderr:"pipe"});',
    'process.stdout.write(verified.stdout);process.stderr.write(verified.stderr);process.exitCode=verified.exitCode;',
    '}else{console.error("unexpected docker argv");process.exit(23);}',
  ].join('\n');
  writeFileSync(join(tools, 'docker'), program, { mode: 0o755 });
  const args = [
    stateDir,
    '--container=stopped-app',
    '--candidate-image=candidate:tested',
    '--db-path=' + sourcePath,
    '--backup-report=' + reportPath,
    '--snapshot-path=' + snapshotPath,
  ];
  return {
    root,
    artifacts,
    stateDir,
    sourcePath,
    snapshotPath,
    reportPath,
    config,
    configPath,
    logPath,
    tools,
    args,
  };
}

async function invoke(
  paths: ReturnType<typeof fixture>,
  args: readonly string[] = paths.args,
  path = paths.tools + ':' + processPath,
) {
  writeFileSync(paths.configPath, JSON.stringify(paths.config));
  const child = Bun.spawn(
    [process.execPath, join(REPO_ROOT, 'bin/assert-rename-window.ts'), ...args],
    { cwd: REPO_ROOT, env: { ...process.env, PATH: path }, stdout: 'pipe', stderr: 'pipe' },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const commands = existsSync(paths.logPath)
    ? readFileSync(paths.logPath, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as string[])
    : [];
  return { exitCode, stdout, stderr, commands };
}

test('verifies a real generated report through exact candidate argv without copying the dev source bind', async () => {
  const paths = fixture();
  const verified = await invoke(paths);
  expect(verified.exitCode).toBe(0);
  expect(verified.commands).toHaveLength(4);
  expect(verified.commands[0]).toEqual(['container', 'inspect', 'stopped-app']);
  expect(verified.commands[1]).toEqual(['image', 'inspect', 'candidate:tested']);
  const run = verified.commands.at(2);
  if (run === undefined) throw new Error('missing actual candidate argv');
  expect(run).toContain('--read-only');
  expect(run).toContain('--network');
  expect(run[run.indexOf('--network') + 1]).toBe('none');
  expect(run).not.toContain('--volumes-from');
  expect(run).toContain('--entrypoint');
  expect(run[run.indexOf('--entrypoint') + 1]).toBe('/usr/local/bin/bun');
  expect(run).toContain('--workdir');
  expect(run[run.indexOf('--workdir') + 1]).toBe('/app/apps/wbs/be-01');
  expect(run).toContain(
    'type=bind,src=' + paths.artifacts + ',dst=' + paths.artifacts + ',readonly',
  );
  expect(run.some((value) => value.includes('dst=/app,'))).toBe(false);
  expect(run.slice(-3)).toEqual([
    IMAGE_ID,
    'src/assert-window-cli.ts',
    '--report=' + paths.reportPath,
  ]);
  expect(verified.commands[3]).toEqual(['container', 'inspect', 'stopped-app']);
});

for (const tier of ['be', 'gw', 'fe']) {
  test('refuses recorded ' + tier + ' before Docker even with a real valid report', async () => {
    const paths = fixture();
    writeFileSync(join(paths.stateDir, tier + '.json'), 'recorded release');
    const verified = await invoke(paths);
    expect(verified.exitCode).not.toBe(0);
    expect(verified.stderr).toContain(tier + '.json');
    expect(verified.commands).toEqual([]);
  });
}

test('refuses an unreadable state directory before Docker even with a valid report', async () => {
  const paths = fixture();
  chmodSync(paths.stateDir, 0);
  try {
    const verified = await invoke(paths);
    expect(verified.exitCode).not.toBe(0);
    expect(verified.stderr).toContain(
      'error: state directory must be an existing readable searchable directory',
    );
    expect(verified.commands).toEqual([]);
  } finally {
    chmodSync(paths.stateDir, 0o700);
  }
});

for (const state of [
  'running',
  'restarted',
  'mapping-changed',
  'unknown-image',
  'verifier-failed',
  'wrong-receipt',
] as const) {
  test('refuses ' + state + ' without admitting a rename window', async () => {
    const paths = fixture();
    if (state === 'running')
      paths.config.first = {
        ...paths.config.first,
        State: { Running: true, Paused: false, Restarting: false, Status: 'running' },
      };
    if (state === 'restarted')
      paths.config.last = {
        ...paths.config.last,
        State: { Running: true, Paused: false, Restarting: false, Status: 'running' },
      };
    if (state === 'mapping-changed')
      paths.config.last = {
        ...paths.config.last,
        Mounts: paths.config.last.Mounts.map((mount) => ({
          ...mount,
          Source: mount.Source + '-changed',
        })),
      };
    if (state === 'unknown-image') paths.config.imageId = 'unknown';
    if (state === 'verifier-failed') paths.config.mode = 'run-fail';
    if (state === 'wrong-receipt')
      paths.config.overrideReceipt = {
        ...(JSON.parse(readFileSync(paths.reportPath, 'utf8')) as Record<string, unknown>),
        snapshotPath: paths.snapshotPath + '-wrong',
      };
    const verified = await invoke(paths);
    expect(verified.exitCode).not.toBe(0);
    const diagnostic = {
      running: 'stopped',
      restarted: 'stopped',
      'mapping-changed': 'mapping',
      'unknown-image': 'image',
      'verifier-failed': 'candidate verifier refused',
      'wrong-receipt': 'snapshotPath',
    }[state];
    expect(verified.stderr).toContain(diagnostic);
  });
}

test('refuses missing snapshot argument before Docker', async () => {
  const paths = fixture();
  const verified = await invoke(
    paths,
    paths.args.filter((value) => !value.startsWith('--snapshot-path=')),
  );
  expect(verified.exitCode).not.toBe(0);
  expect(verified.stderr).toContain('error: --snapshot-path is required');
  expect(verified.commands).toEqual([]);
});

test('refuses a missing Docker executable rather than accepting report evidence alone', async () => {
  const paths = fixture();
  const verified = await invoke(paths, paths.args, join(paths.root, 'absent-path'));
  expect(verified.exitCode).not.toBe(0);
  expect(verified.stderr).toContain('docker');
  expect(verified.commands).toEqual([]);
});

for (const flag of ['container', 'candidate-image', 'db-path', 'backup-report']) {
  test('refuses missing ' + flag + ' before invoking Docker', async () => {
    const paths = fixture();
    const verified = await invoke(
      paths,
      paths.args.filter((value) => !value.startsWith('--' + flag + '=')),
    );
    expect(verified.exitCode).not.toBe(0);
    expect(verified.stderr).toContain('error: --' + flag + ' is required');
    expect(verified.commands).toEqual([]);
  });
}

test('refuses the historical skeleton override rather than importing its exception', async () => {
  const paths = fixture();
  const verified = await invoke(paths, [...paths.args, '--override-with-ledger=ignored']);
  expect(verified.exitCode).not.toBe(0);
  expect(verified.stderr).toContain('argument');
  expect(verified.commands).toEqual([]);
});

for (const state of ['missing', 'not-directory']) {
  test('refuses ' + state + ' state directory despite a valid report', async () => {
    const paths = fixture();
    rmSync(paths.stateDir, { recursive: true });
    if (state === 'not-directory') writeFileSync(paths.stateDir, 'not a directory');
    const verified = await invoke(paths);
    expect(verified.exitCode).not.toBe(0);
    expect(verified.commands).toEqual([]);
  });
}

for (const mode of [
  'inspect-failed',
  'inspect-malformed',
  'image-failed',
  'write-release',
] as const) {
  test('refuses ' + mode + ' even when backup artifacts remain valid', async () => {
    const paths = fixture();
    paths.config.mode = mode;
    const verified = await invoke(paths);
    expect(verified.exitCode).not.toBe(0);
    const diagnostic = {
      'inspect-failed': 'inspection unavailable',
      'inspect-malformed': 'malformed',
      'image-failed': 'image unavailable',
      'write-release': 'be.json',
    }[mode];
    expect(verified.stderr).toContain(diagnostic);
    if (mode === 'write-release')
      expect(readFileSync(join(paths.stateDir, 'be.json'), 'utf8')).toBe('new recorded release');
  });
}

for (const mapping of ['absent', 'prefix-only', 'unsupported', 'file-only']) {
  test('refuses ' + mapping + ' database mount before candidate image lookup', async () => {
    const paths = fixture();
    if (mapping === 'absent') paths.config.first.Mounts = [];
    if (mapping === 'prefix-only')
      paths.config.first.Mounts = [
        {
          Type: 'bind',
          Source: paths.artifacts,
          Destination: paths.artifacts.slice(0, -1),
          RW: true,
        },
      ];
    if (mapping === 'unsupported')
      paths.config.first.Mounts = [
        { Type: 'tmpfs', Source: paths.artifacts, Destination: paths.artifacts, RW: true },
      ];
    if (mapping === 'file-only')
      paths.config.first.Mounts = [
        { Type: 'bind', Source: paths.sourcePath, Destination: paths.sourcePath, RW: true },
      ];
    const verified = await invoke(paths);
    expect(verified.exitCode).not.toBe(0);
    expect(verified.stderr).toContain(
      mapping === 'unsupported'
        ? 'bind or volume'
        : mapping === 'file-only'
          ? 'directory mount'
          : 'mapping',
    );
    expect(verified.commands).toHaveLength(1);
  });
}

test('selects the deepest actual artifact mount and never the broader wrong source', async () => {
  const paths = fixture();
  paths.config.first.Mounts.unshift({
    Type: 'bind',
    Source: join(paths.root, 'wrong-source'),
    Destination: paths.root,
    RW: true,
  });
  paths.config.last = paths.config.first;
  const verified = await invoke(paths);
  expect(verified.exitCode).toBe(0);
  expect(verified.commands.at(2)).toContain(
    'type=bind,src=' + paths.artifacts + ',dst=' + paths.artifacts + ',readonly',
  );
});

test('derives readonly bind coverage from an inspected named-volume source', async () => {
  const paths = fixture();
  paths.config.first.Mounts[0].Type = 'volume';
  paths.config.last = paths.config.first;
  const verified = await invoke(paths);
  expect(verified.exitCode).toBe(0);
  expect(verified.commands.at(2)).toContain(
    'type=bind,src=' + paths.artifacts + ',dst=' + paths.artifacts + ',readonly',
  );
});

test('refuses a wrong inspected artifact volume when the real verifier cannot read its report', async () => {
  const paths = fixture();
  const wrong = join(paths.root, 'wrong-volume');
  mkdirSync(wrong);
  paths.config.first.Mounts[0].Source = wrong;
  paths.config.last = paths.config.first;
  const verified = await invoke(paths);
  expect(verified.exitCode).not.toBe(0);
  expect(verified.stderr).toContain('candidate verifier refused');
});

for (const parent of ['/', '/app/artifacts', '/usr/local/artifacts']) {
  test(
    'refuses artifact parent ' + parent + ' that overlaps a protected candidate root',
    async () => {
      const paths = fixture();
      const source = parent === '/' ? '/source.db' : parent + '/source.db';
      const snapshot = parent === '/' ? '/snapshot.db' : parent + '/snapshot.db';
      const report = parent === '/' ? '/report.json' : parent + '/report.json';
      paths.config.first.Mounts = [
        { Type: 'bind', Source: paths.artifacts, Destination: parent, RW: true },
      ];
      const args = paths.args.map((value) =>
        value.startsWith('--db-path=')
          ? '--db-path=' + source
          : value.startsWith('--snapshot-path=')
            ? '--snapshot-path=' + snapshot
            : value.startsWith('--backup-report=')
              ? '--backup-report=' + report
              : value,
      );
      const verified = await invoke(paths, args);
      expect(verified.exitCode).not.toBe(0);
      expect(verified.stderr).toContain('protected candidate root');
      expect(verified.commands).toHaveLength(1);
    },
  );
}

test('refuses conflicting overlapping derived mappings before running a candidate', async () => {
  const paths = fixture();
  const nested = join(paths.artifacts, 'nested');
  paths.config.first.Mounts.push({
    Type: 'bind',
    Source: join(paths.root, 'foreign'),
    Destination: nested,
    RW: true,
  });
  const args = paths.args.map((value) =>
    value.startsWith('--backup-report=') ? '--backup-report=' + join(nested, 'report.json') : value,
  );
  const verified = await invoke(paths, args);
  expect(verified.exitCode).not.toBe(0);
  expect(verified.stderr).toContain('overlapping artifact mapping');
  expect(verified.commands).toHaveLength(1);
});

test('deduplicates demonstrably identical overlapping artifact directory coverage', async () => {
  const paths = fixture();
  const nested = join(paths.artifacts, 'nested');
  mkdirSync(nested);
  const report = join(nested, 'report.json');
  writeFileSync(report, readFileSync(paths.reportPath));
  paths.config.first.Mounts.push({ Type: 'bind', Source: nested, Destination: nested, RW: true });
  paths.config.last = paths.config.first;
  const args = paths.args.map((value) =>
    value.startsWith('--backup-report=') ? '--backup-report=' + report : value,
  );
  const verified = await invoke(paths, args);
  expect(verified.exitCode).toBe(0);
  expect(verified.commands.at(2)?.filter((value) => value === '--mount')).toHaveLength(1);
});

for (const replacement of ['running', 'exited'] as const) {
  test(
    'refuses original container name rebound to a new ' +
      replacement +
      ' object while old ID remains exited',
    async () => {
      const paths = fixture();
      paths.config.mode = 'name-rebound-' + replacement;
      paths.config.last = {
        ...paths.config.last,
        Id: 'c'.repeat(64),
        State: {
          Running: replacement === 'running',
          Paused: false,
          Restarting: false,
          Status: replacement,
        },
      };
      const verified = await invoke(paths);
      expect(verified.exitCode).not.toBe(0);
      expect(verified.stderr).toContain(replacement === 'running' ? 'stopped' : 'identity changed');
      expect(verified.commands.at(-1)).toEqual(['container', 'inspect', 'stopped-app']);
    },
  );
}

test('refuses a zero-exit truncated verifier receipt despite matching source and snapshot paths', async () => {
  const paths = fixture();
  paths.config.overrideReceipt = {
    version: 1,
    sourcePath: paths.sourcePath,
    snapshotPath: paths.snapshotPath,
  };
  const verified = await invoke(paths);
  expect(verified.exitCode).not.toBe(0);
  expect(verified.stderr).toMatch(
    /sourceSha256|sourceBytes|snapshotSha256|snapshotBytes|migrations/,
  );
  expect(verified.commands).toHaveLength(3);
});

for (const mutation of [
  'version',
  'source-hash',
  'source-bytes',
  'unsafe-bytes',
  'snapshot-hash',
  'snapshot-bytes',
  'relative-snapshot',
  'empty-ledger',
  'duplicate-ledger',
  'ledger-hash',
  'ledger-name',
  'ledger-unknown-field',
  'unknown-field',
  'wrong-source',
] as const) {
  test('refuses a complete verifier wire receipt with ' + mutation, async () => {
    const paths = fixture();
    const receipt = JSON.parse(readFileSync(paths.reportPath, 'utf8')) as Record<string, unknown>;
    if (mutation === 'version') receipt['version'] = 2;
    if (mutation === 'source-hash') receipt['sourceSha256'] = 'not-a-hash';
    if (mutation === 'source-bytes') receipt['sourceBytes'] = 0;
    if (mutation === 'unsafe-bytes') receipt['sourceBytes'] = Number.MAX_SAFE_INTEGER + 1;
    if (mutation === 'snapshot-hash') receipt['snapshotSha256'] = 'not-a-hash';
    if (mutation === 'snapshot-bytes') receipt['snapshotBytes'] = 0;
    if (mutation === 'relative-snapshot') receipt['snapshotPath'] = 'relative.db';
    if (mutation === 'empty-ledger') receipt['migrations'] = [];
    if (mutation === 'duplicate-ledger') {
      const entries = receipt['migrations'] as Record<string, unknown>[];
      receipt['migrations'] = [...entries, entries[0]];
    }
    if (mutation === 'ledger-hash') {
      const entries = receipt['migrations'] as Record<string, unknown>[];
      receipt['migrations'] = [{ ...entries[0], hash: 'broken' }, ...entries.slice(1)];
    }
    if (mutation === 'ledger-name' || mutation === 'ledger-unknown-field') {
      const entries = receipt['migrations'] as Record<string, unknown>[];
      receipt['migrations'] = [
        {
          ...entries[0],
          ...(mutation === 'ledger-name' ? { name: '' } : { extra: 'must not be accepted' }),
        },
        ...entries.slice(1),
      ];
    }
    if (mutation === 'unknown-field') receipt['unexpected'] = 'must not be accepted';
    if (mutation === 'wrong-source') receipt['sourcePath'] = paths.sourcePath + '-wrong';
    paths.config.overrideReceipt = receipt;
    const verified = await invoke(paths);
    expect(verified.exitCode).not.toBe(0);
    const diagnostic = {
      version: 'version',
      'source-hash': 'sourceSha256',
      'source-bytes': 'sourceBytes',
      'unsafe-bytes': 'sourceBytes',
      'snapshot-hash': 'snapshotSha256',
      'snapshot-bytes': 'snapshotBytes',
      'relative-snapshot': 'snapshotPath',
      'empty-ledger': 'migrations',
      'duplicate-ledger': 'migrations',
      'ledger-hash': 'migrations',
      'ledger-name': 'migrations',
      'ledger-unknown-field': 'migrations',
      'unknown-field': 'unexpected',
      'wrong-source': 'sourcePath',
    }[mutation];
    expect(verified.stderr).toContain(diagnostic);
    expect(verified.commands).toHaveLength(3);
  });
}

for (const boundary of [
  'malformed-container-name',
  'malformed-image-name',
  'container-id',
  'container-many',
  'image-many',
] as const) {
  test('refuses ' + boundary + ' at its exact host admission boundary', async () => {
    const paths = fixture();
    const sourceBefore = readFileSync(paths.sourcePath);
    const snapshotBefore = readFileSync(paths.snapshotPath);
    const reportBefore = readFileSync(paths.reportPath);
    let args = paths.args;
    if (boundary === 'malformed-container-name')
      args = paths.args.map((value) =>
        value.startsWith('--container=') ? '--container=invalid/name' : value,
      );
    if (boundary === 'malformed-image-name')
      args = paths.args.map((value) =>
        value.startsWith('--candidate-image=') ? '--candidate-image=invalid image' : value,
      );
    if (boundary === 'container-id') paths.config.first.Id = 'not-a-canonical-container-id';
    if (boundary === 'container-many' || boundary === 'image-many') paths.config.mode = boundary;
    const verified = await invoke(paths, args);
    expect(verified.exitCode).not.toBe(0);
    const diagnostic = {
      'malformed-container-name': 'container name is malformed',
      'malformed-image-name': 'candidate image',
      'container-id': 'Id',
      'container-many': 'exactly one container',
      'image-many': 'exactly one image',
    }[boundary];
    expect(verified.stderr).toContain(diagnostic);
    expect(verified.commands).toHaveLength(
      boundary.startsWith('malformed-') ? 0 : boundary === 'image-many' ? 2 : 1,
    );
    expect(readFileSync(paths.sourcePath)).toEqual(sourceBefore);
    expect(readFileSync(paths.snapshotPath)).toEqual(snapshotBefore);
    expect(readFileSync(paths.reportPath)).toEqual(reportBefore);
  });
}

test('refuses missing host state argument before interpreting other options', async () => {
  const paths = fixture();
  const verified = await invoke(paths, []);
  expect(verified.exitCode).not.toBe(0);
  expect(verified.stderr).toContain('error: state directory argument is required');
  expect(verified.commands).toEqual([]);
});

test('refuses a comma in inspected mount Source before Docker can split its fields', async () => {
  const paths = fixture();
  paths.config.first.Mounts = paths.config.first.Mounts.map((mount) =>
    mount.Destination === paths.artifacts
      ? { ...mount, Source: mount.Source + ',readonly' }
      : mount,
  );
  const verified = await invoke(paths);
  expect(verified.exitCode).not.toBe(0);
  expect(verified.stderr).toContain(
    'error: mount Source must be an absolute normalized Docker mount path without delimiters',
  );
  expect(verified.commands).toHaveLength(1);
});
