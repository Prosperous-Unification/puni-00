import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { collectFixture } from '../../test/installed-authority-fixture';
import { withDependencyOwner } from './edge-ownership';
import { envLayout } from './env';
import {
  decodeInstalledAuthorityPins,
  type InstalledAuthorityPorts,
  observeInstalledAuthority,
} from './installed-authorities';
import { withAuthorityFiles } from './installed-authority-files';
import { WRITER_MEMBERS } from './installed-writers';
import { captureSolverFile, solverHostPorts } from './solver-host';
import { SOLVER_EDGE_STATE } from './solver-host';
import {
  SOLVER_SUPERVISOR_BUN,
  SOLVER_SUPERVISOR_BUNDLE,
  SOLVER_SUPERVISOR_CONFIG,
  SOLVER_SUPERVISOR_SERVICE,
  SOLVER_SUPERVISOR_UNIT,
} from './solver-supervisor-install-contract';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, field]) => [key, canonical(field)]),
    );
  return value;
}
function desiredLaunchHash(): string {
  const fragment = {
    path: '/etc/systemd/system/fixture.service',
    sha256: hash('private secret bytes'),
  };
  const units = ['system', 'user'].map((manager) => ({
    manager,
    name: 'fixture.service',
    canonicalId: 'fixture.service',
    names: ['fixture.service'],
    unitFileState: 'enabled',
    loadState: 'loaded',
    fragment,
    dropIns: [],
    transient: false,
    commands: [],
    triggers: [],
    triggeredBy: [],
  }));
  const cron = [
    { source: '/etc/anacrontab', state: 'absent' },
    { source: '/etc/crontab', state: 'present', sha256: hash('# unrelated\n') },
    { source: 'crontab:puni1', state: 'absent' },
    { source: 'crontab:root', state: 'absent' },
  ];
  return hash(JSON.stringify(canonical({ version: 1, cron, units })));
}
function stoppedUnit(): string {
  const exec = (path: string, argv: string) =>
    `{ path=${path} ; argv[]=${argv} ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0 }`;
  return Object.entries({
    LoadState: 'loaded',
    Id: SOLVER_SUPERVISOR_SERVICE,
    Names: SOLVER_SUPERVISOR_SERVICE,
    FragmentPath: SOLVER_SUPERVISOR_UNIT,
    DropInPaths: '',
    Transient: 'no',
    NeedDaemonReload: 'no',
    ExecStart: exec(
      SOLVER_SUPERVISOR_BUN,
      `${SOLVER_SUPERVISOR_BUN} ${SOLVER_SUPERVISOR_BUNDLE.remote} --config=${SOLVER_SUPERVISOR_CONFIG} --admission=policy`,
    ),
    ExecStartPre: '',
    ExecStartPost: '',
    ExecStop: '',
    ExecStopPost: exec('/bin/rm', '/bin/rm -f /run/user/1000/wbs-solver/supervisor.sock'),
    Restart: 'always',
    RestartPreventExitStatus: '78',
    Result: 'success',
    ExecMainStatus: '0',
    KillMode: 'control-group',
    Environment: `WBS_EDGE_STATE=${SOLVER_EDGE_STATE}`,
    ActiveState: 'inactive',
    SubState: 'dead',
    MainPID: '0',
    ControlPID: '0',
    InvocationID: '',
    ControlGroup: '',
    Job: '',
  })
    .map(([key, value]) => `${key}=${value}\n`)
    .join('');
}

test.each([
  'positive',
  'solver-positive',
  'solver-extra',
  'solver-missing',
  'solver-wrong-start',
  'solver-wrong-cgroup',
  'solver-wrong-exe',
  'stopped-extra',
  'installed-hash',
  'owner-final',
  'file-final',
  'solver-final',
  'host',
  'launch',
] as const)('real owner and actual fixture collector enforce %s', async (fault) => {
  const directory = scratchSync('authority-observer-');
  await mkdir(join(directory, 'prod'));
  await mkdir(join(directory, 'dev'));
  const layouts = {
    prod: {
      ...envLayout('prod'),
      root: join(directory, 'prod'),
      stateDir: join(directory, 'prod'),
    },
    dev: { ...envLayout('dev'), root: join(directory, 'dev'), stateDir: join(directory, 'dev') },
  };
  const sourceSha = 'a'.repeat(40);
  const fixed = [
    '/home/puni1/wbs/bin/swap.js',
    '/home/puni1/wbs/bin/smoke.js',
    '/home/puni1/wbs-dev/bin/swap.js',
    '/home/puni1/wbs-dev/bin/smoke.js',
    '/home/puni1/wbs-dev/bin/poll.sh',
    '/home/puni1/wbs-dev/bin/dev-poll-sync.sh',
    '/home/puni1/wbs-dev/bin/bun',
  ];
  const members = WRITER_MEMBERS.map((member, index) => ({
    member,
    origin: 'source',
    hostPath: fixed[index] ?? '/private/needle/' + member,
    reviewed: 'reviewed/' + member,
    installed: 'captured/' + member,
    sha256: hash('expected ' + member),
  }));
  for (const member of members)
    await writeFile(join(directory, member.member), 'expected ' + member.member);
  if (fault === 'installed-hash') await writeFile(join(directory, 'prod-swap'), 'substituted');
  const contents = JSON.stringify({
    version: 1,
    sourceSha,
    buildSha: sourceSha,
    buildId: 'independent-build',
    members,
  });
  const solverPaths = [
    SOLVER_SUPERVISOR_BUN,
    SOLVER_SUPERVISOR_BUNDLE.remote,
    SOLVER_SUPERVISOR_CONFIG,
    SOLVER_SUPERVISOR_UNIT,
  ];
  const config = JSON.stringify({
    socketPath: '/run/user/1000/wbs-solver/supervisor.sock',
    maxSearchWorkers: 2,
    maxMemoryLimitMb: 512,
    pidsLimit: 128,
    maxManagedContainers: 16,
    devSourceSha: sourceSha,
    images: [
      {
        callerName: 'be-01-blue',
        callerImage: 'registry/be@sha256:' + 'b'.repeat(64),
        solverImage: 'registry/solver@sha256:' + 'c'.repeat(64),
      },
    ],
  });
  const solverContents = ['fixture bun', 'fixture bundle', config, 'fixture unit'];
  const modes = [0o755, 0o755, 0o600, 0o644];
  for (const [index, bytes] of solverContents.entries())
    await writeFile(join(directory, 'solver-' + String(index)), bytes, { mode: modes[index] });
  const pins = decodeInstalledAuthorityPins({
    format: 'installed-dependency-authority-pins',
    version: 1,
    sourceSha,
    writerManifestSha256: hash(contents),
    hostMachineIdSha256: fault === 'host' ? '0'.repeat(64) : hash('a'.repeat(32) + '\n'),
    launchConfigurationSha256: fault === 'launch' ? '0'.repeat(64) : desiredLaunchHash(),
    solver: {
      version: 1,
      sourceSha,
      bunSha256: hash(solverContents[0]),
      bundleSha256: hash(solverContents[1]),
      configSha256: hash(config),
      unitSha256: hash(solverContents[3]),
    },
  });
  const databases = [
    {
      environment: 'prod' as const,
      host: layouts.prod.root + '/data/main',
      directoryIdentity: '7:10',
      fileIdentity: '7:10',
    },
    {
      environment: 'dev' as const,
      host: layouts.dev.root + '/data/main',
      directoryIdentity: '7:20',
      fileIdentity: '7:20',
    },
  ];
  let collections = 0;
  const running = fault.startsWith('solver-') && fault !== 'solver-final';
  const group =
    '/user.slice/user-1000.slice/user@1000.service/app.slice/' + SOLVER_SUPERVISOR_SERVICE;
  const unit = running
    ? stoppedUnit()
        .replace('ActiveState=inactive', 'ActiveState=active')
        .replace('SubState=dead', 'SubState=running')
        .replace('MainPID=0', 'MainPID=42')
        .replace('InvocationID=\n', 'InvocationID=' + 'a'.repeat(32) + '\n')
        .replace('ControlGroup=\n', 'ControlGroup=' + group + '\n')
    : stoppedUnit();
  const ports: InstalledAuthorityPorts = {
    withFiles: async (paths, action) => {
      if (
        paths.length !== members.length ||
        paths.some((path, index) => path !== members[index].hostPath)
      )
        throw new Error('fixture rejected changed production writer fragments');
      return withAuthorityFiles(
        members.map((member) => join(directory, member.member)),
        (files, recheck) =>
          action(
            files.map((file, index) => ({ ...file, path: paths[index] })),
            recheck,
          ),
      );
    },
    solver: {
      ...solverHostPorts(),
      runHost: () => Promise.resolve(unit),
      observeProcess: () => Promise.resolve({ pid: 42, startTime: '123', cgroup: group }),
      captureFile: async (path, maximum, decode) => {
        const index = solverPaths.indexOf(path);
        if (index < 0) throw new Error('fixture rejected changed production solver fragment');
        const observed = await captureSolverFile(
          join(directory, 'solver-' + String(index)),
          maximum,
          decode,
        );
        return { ...observed, path };
      },
    },
    collect: async (request, deadline) => {
      const copied: unknown = JSON.parse(JSON.stringify(request));
      if (
        copied === null ||
        typeof copied !== 'object' ||
        !('databases' in copied) ||
        !Array.isArray(copied.databases)
      )
        throw new Error('fixture request malformed');
      copied.databases.forEach((database: unknown, index) => {
        if (
          database === null ||
          typeof database !== 'object' ||
          !('host' in database) ||
          database.host !== databases[index].host
        )
          throw new Error('fixture rejected changed production DB fragment');
        database.host = '/home/puni1/' + (index === 0 ? 'wbs' : 'wbs-dev') + '/data/main';
      });
      const stdout = await collectFixture(
        copied,
        deadline,
        running ? join(directory, 'solver-0') : undefined,
      );
      collections++;
      if (fault === 'owner-final')
        await writeFile(join(directory, 'edge-owner.pending'), 'changed owner');
      if (fault === 'file-final') {
        await rename(join(directory, 'prod-swap'), join(directory, 'old-writer'));
        await writeFile(join(directory, 'prod-swap'), 'expected prod-swap');
      }
      if (fault === 'solver-final') {
        await rename(join(directory, 'solver-0'), join(directory, 'old-solver'));
        await writeFile(join(directory, 'solver-0'), 'fixture bun', { mode: 0o755 });
      }
      if (
        [
          'solver-extra',
          'solver-missing',
          'solver-wrong-start',
          'solver-wrong-cgroup',
          'solver-wrong-exe',
          'stopped-extra',
        ].includes(fault)
      ) {
        const envelope = JSON.parse(stdout) as { relevantProcesses: Record<string, unknown>[] };
        const first = envelope.relevantProcesses.at(0);
        if (fault === 'solver-missing') envelope.relevantProcesses = [];
        else if (fault === 'stopped-extra')
          envelope.relevantProcesses.push({
            pid: 99,
            startTime: '123',
            uid: 1000,
            cgroup: '/manual/unmanaged.scope',
            executable: { device: '7', inode: '99', sha256: hash('fixture bun') },
            argvSha256: hash('manual'),
            cwd: '/src',
          });
        else {
          if (first === undefined) throw new Error('fixture solver projection missing');
          if (fault === 'solver-extra') envelope.relevantProcesses.push({ ...first, pid: 43 });
          if (fault === 'solver-wrong-start') first['startTime'] = '124';
          if (fault === 'solver-wrong-cgroup') first['cgroup'] = '/manual/unmanaged.scope';
          if (fault === 'solver-wrong-exe')
            first['executable'] = { device: '7', inode: '99', sha256: hash('wrong executable') };
        }
        return JSON.stringify(envelope);
      }
      return stdout;
    },
  };
  await withDependencyOwner(
    { sha: sourceSha, layouts: [layouts.prod, layouts.dev] },
    async (owner) => {
      if (fault === 'positive' || fault === 'solver-positive') {
        const observed = await observeInstalledAuthority(
          owner,
          layouts,
          pins,
          contents,
          databases,
          performance.now() + 5000,
          ports,
        );
        expect(observed.activation).toBe('blocked');
        expect(observed.databaseOpeners).toHaveLength(1);
        expect(observed.relevantProcesses).toHaveLength(running ? 1 : 0);
        expect(JSON.stringify(observed)).not.toContain('private secret');
      } else {
        let refusal = '';
        try {
          await observeInstalledAuthority(
            owner,
            layouts,
            pins,
            contents,
            databases,
            performance.now() + 5000,
            ports,
          );
        } catch (error) {
          refusal = String(error);
        }
        expect(refusal).toContain(
          {
            'installed-hash': 'independent writer hash',
            'owner-final': 'owner publication',
            'file-final': 'file changed',
            'solver-final': 'solver changed',
            host: 'collector binding',
            launch: 'collector binding',
            'solver-extra': 'not an exact owned participant',
            'solver-missing': 'solver missing',
            'solver-wrong-start': 'not an exact owned participant',
            'solver-wrong-cgroup': 'not an exact owned participant',
            'solver-wrong-exe': 'not an exact owned participant',
            'stopped-extra': 'not an exact owned participant',
          }[fault],
        );
      }
    },
    directory,
  );
  expect(collections).toBe(fault === 'installed-hash' ? 0 : 1);
});
