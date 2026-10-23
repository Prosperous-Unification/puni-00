import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { Database } from 'bun:sqlite';

import { auditUnmanagedMounts } from '../src/lib/backend-cohort';
import { excludeSourceAndManagedDependencies } from '../src/lib/dependency-activation-owner';
import type { RunDocker } from '../src/lib/docker-deadline';
import { type DockerExec, runDockerExec } from '../src/lib/docker-exec';
import { withDependencyOwner } from '../src/lib/edge-ownership';
import { readFields, readIdentity, readString } from '../src/lib/managed-cohort';
import { verifyContainerNamespace } from '../src/lib/mount-audit';
import {
  inspectExcludedSourceMember,
  inspectSourceDevExclusion,
  type SourceDevExclusion,
  withSourceDevExcluded,
} from '../src/lib/source-dev-exclusion';
import {
  describeFixtureFailure,
  FixtureFailure,
  type FixtureStage,
  requireFixtureRefusal,
  withFixtureStage,
} from './fixture-failure';
import { runSolverDrainAcceptance, type SolverDrainFixture } from './solver-drain';
import { renderManagedParticipant, renderSourceTopology } from './source-exclusion-topology';
import {
  createFixtureDocker,
  type FixtureContainerPlan,
  parseFixtureInspection,
  SOURCE_FIXTURE_OWNER,
} from './source-exclusion-transport';

function requireProof(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const hash = (contents: string) => createHash('sha256').update(contents).digest('hex');

/**
 * Explicit disposable host acceptance. Requires independent local immutable image pins;
 * source and managed processes are namespace/write fixtures, not application acceptance.
 * The unchanged coordinator runs over one complete invocation-labelled Docker universe.
 */
export async function runSourceExclusionAcceptance(): Promise<void> {
  const temporary = tmpdir();
  // Proof: omit-temp-root failed the production temporary-root preflight negative before any fixture effects.
  requireProof(
    (temporary === '/tmp' || temporary.startsWith('/tmp/')) &&
      (await realpath(temporary)) === temporary,
    'fixture temp root must be canonical under /tmp',
  );
  // Proof: omit-preflight-pin failed the option-like image pin negative before any fixture effects.
  for (const role of ['SOURCE', 'BACKEND', 'GATEWAY', 'CADDY', 'SOLVER']) {
    const reference = process.env[`SOURCE_EXCLUSION_${role}_IMAGE`];
    requireProof(
      typeof reference === 'string' &&
        /^[A-Za-z0-9][A-Za-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(reference),
      'independent local image pin required before fixture effects',
    );
  }
  const receipt = process.env['SOURCE_EXCLUSION_RECEIPT'];
  // Proof: omit-receipt-root failed the production receipt-root negative before any fixture effects.
  requireProof(
    typeof receipt === 'string' &&
      !receipt.startsWith('/home/puni1/wbs') &&
      !receipt.startsWith('/run/user/1000/wbs-solver'),
    'production receipt path refused',
  );
  for (const [target, source] of Object.entries({
    SOLVER_DRAIN_SHA: 'SOURCE_EXCLUSION_SHA',
    SOLVER_DRAIN_IMAGE: 'SOURCE_EXCLUSION_SOLVER_IMAGE',
    SOLVER_DRAIN_RECEIPT: 'SOURCE_EXCLUSION_RECEIPT',
  })) {
    const value = process.env[source];
    requireProof(typeof value === 'string', `${source} required`);
    process.env[target] = value;
  }
  await runSolverDrainAcceptance((fixture) =>
    withFixtureStage('fixture-images', () => runIntegratedFixture(fixture)),
  );
}
async function runIntegratedFixture(fixture: SolverDrainFixture): Promise<void> {
  const { token, root, sha, deadline, execute, record } = fixture;
  const sourceName = `source-exclusion-src-${token}`;
  const sourceTag = `${sourceName}:1`;
  const caddyName = `source-exclusion-edge-${token}`;
  const runtime = join(root, 'runtime');
  const caddy = join(root, 'prod', 'caddy');
  const plans: FixtureContainerPlan[] = fixture.attempts.map((attempt) => ({
    name: attempt.name,
    get id() {
      return attempt.id;
    },
    imageRef: fixture.image,
    imageId: fixture.imageId,
  }));
  const created: { name: string; id: string }[] = [];
  const layouts = renderSourceTopology(root, token, fixture.layouts);
  const networks = [layouts.prod.network, layouts.dev.network].map((name) => ({
    name,
    id: '',
    intended: false,
  }));
  const raw: RunDocker = (args, signal) => execute(['docker', ...args], signal);
  let cleaning = false;
  let cleanupDeadline = 0;
  // Solver lifecycle cleanup has its own budget after this component cleanup completes.
  const command: RunDocker = (args, signal) =>
    cleaning
      ? import('./solver-drain-transport').then(({ boundedCommand }) =>
          boundedCommand(
            ['docker', ...args],
            Math.min(10000, cleanupDeadline - performance.now()),
            signal,
          ),
        )
      : raw(args, signal);
  const imagePins = new Map<string, { reference: string; id: string }>();
  for (const role of ['SOURCE', 'BACKEND', 'GATEWAY', 'CADDY']) {
    const reference = process.env[`SOURCE_EXCLUSION_${role}_IMAGE`];
    requireProof(
      typeof reference === 'string' && /^[^\s@]+@sha256:[a-f0-9]{64}$/.test(reference),
      `independent ${role} local image pin required`,
    );
    if (role === 'BACKEND' || role === 'GATEWAY')
      requireProof(
        new RegExp(`/wbs-${role === 'BACKEND' ? 'be' : 'gw'}-01@sha256:`).test(reference),
        'managed image repository differs',
      );
    const id = (await command(['image', 'inspect', '--format', '{{.Id}}', reference])).trim();
    requireProof(/^sha256:[a-f0-9]{64}$/.test(id), 'local image immutable identity malformed');
    imagePins.set(role, { reference, id });
  }
  function pin(role: string) {
    const pinned = imagePins.get(role);
    requireProof(pinned !== undefined, 'fixture image pin absent');
    return pinned;
  }
  const sourcePin = pin('SOURCE');
  let tagIntended = false;
  const cleanupFailures: string[] = [];
  let failure: FixtureFailure | undefined;
  let stage: FixtureStage = 'fixture-files';
  async function actual(id: string): Promise<Record<string, unknown>> {
    const inspected: unknown = parseFixtureInspection(await command(['inspect', id]));
    requireProof(
      Array.isArray(inspected) && inspected.length === 1,
      'owned native inspection absent',
    );
    const container = readFields(inspected[0]);
    requireProof(
      container['Id'] === id &&
        readFields(readFields(container['Config'])['Labels'])[SOURCE_FIXTURE_OWNER] === token &&
        created.some((child) => child.id === id && container['Name'] === `/${child.name}`),
      'owned physical identity differs',
    );
    return container;
  }
  async function effect(args: string[], id: string): Promise<string> {
    await actual(id);
    return command(args);
  }
  async function ownNetwork(physical: {
    name: string;
    id: string;
  }): Promise<Record<string, unknown>> {
    const inspected = parseFixtureInspection(await command(['network', 'inspect', physical.name]));
    requireProof(Array.isArray(inspected) && inspected.length === 1, 'owned network absent');
    const owned = readFields(inspected[0]);
    requireProof(
      owned['Name'] === physical.name &&
        readFields(owned['Labels'])[SOURCE_FIXTURE_OWNER] === token &&
        (physical.id === '' || owned['Id'] === physical.id),
      'network ownership changed',
    );
    return owned;
  }
  const transport = createFixtureDocker({
    token,
    root,
    sourceName,
    sourceTag,
    runtime,
    caddyName,
    plans,
    run: command,
  });
  async function create(
    name: string,
    imageRef: string,
    imageId: string,
    args: string[],
    argv: string[] = [],
  ): Promise<string> {
    requireProof(
      name.includes(token) && name !== 'wbs-dev-src' && name !== 'wbs-caddy-1',
      'production name refused',
    );
    const networkArgument = args.at(args.indexOf('--network') + 1);
    if (args.includes('--network')) {
      const physical = networks.find((candidate) => candidate.name === networkArgument);
      requireProof(physical !== undefined, 'creation network outside physical fixture inventory');
      await ownNetwork(physical);
    }
    const intended = { name, id: '' };
    created.push(intended);
    const planned = { name, imageRef, imageId, id: '' };
    plans.push(planned);
    await record('physical-creation-intent', {
      name,
      imageRef,
      imageId,
      argvSha256: hash(JSON.stringify(args)),
    });
    intended.id = readIdentity(
      (
        await command([
          'create',
          '--pull=never',
          '--name',
          name,
          '--label',
          `${SOURCE_FIXTURE_OWNER}=${token}`,
          ...args,
          imageRef,
          ...argv,
        ])
      ).trim(),
    );
    planned.id = intended.id;
    await actual(intended.id);
    return intended.id;
  }
  async function start(id: string): Promise<void> {
    await effect(['start', id], id);
  }
  async function waitFile(path: string): Promise<string> {
    while (performance.now() < deadline) {
      if (await Bun.file(path).exists()) return readFile(path, 'utf8');
      await Bun.sleep(50);
    }
    throw new Error('fixture write deadline exhausted');
  }
  async function request(id: string, host: string, status: number): Promise<void> {
    const container = await actual(id);
    const bindings: unknown = readFields(readFields(container['NetworkSettings'])['Ports'])[
      '8443/tcp'
    ];
    requireProof(
      Array.isArray(bindings) && bindings.length === 1,
      'fixture HTTP binding ambiguous',
    );
    const binding = readFields(bindings[0]);
    requireProof(binding['HostIp'] === '127.0.0.1', 'fixture HTTP must be loopback');
    const port = readString(binding['HostPort']);
    requireProof(/^[0-9]+$/.test(port), 'fixture HTTP port malformed');
    let last: unknown;
    for (let attempt = 0; attempt < 50; attempt++) {
      requireProof(performance.now() < deadline, 'fixture HTTP deadline exhausted');
      try {
        const response = await fetch(`https://127.0.0.1:${port}/`, {
          headers: { Host: host },
          tls: { serverName: host, rejectUnauthorized: false },
          signal: AbortSignal.timeout(1000),
        });
        requireProof(response.status === status, 'fixture HTTP status differs');
        const body = await response.text();
        if (status === 503)
          requireProof(body === 'WBS dependency maintenance', 'fixture maintenance body differs');
        return;
      } catch (cause) {
        last = cause;
      }
      await Bun.sleep(100);
    }
    throw new Error('fixture HTTP convergence exhausted', { cause: last });
  }
  try {
    for (const directory of [
      runtime,
      caddy,
      join(root, 'caddy-data'),
      join(root, 'caddy-config'),
      join(layouts.dev.root, 'src'),
      join(layouts.dev.root, 'data'),
      join(layouts.prod.root, 'db'),
    ]) {
      await mkdir(directory, { mode: 0o700 });
    }
    for (const directory of [join(layouts.dev.root, 'src'), join(layouts.dev.root, 'data')])
      await chmod(directory, 0o777);
    await writeFile(
      join(layouts.dev.root, 'src', 'package.json'),
      JSON.stringify({ scripts: { dev: 'bun fixture.ts' } }),
      { flag: 'wx' },
    );
    await writeFile(
      join(layouts.dev.root, 'src', 'fixture.ts'),
      `const child = Bun.spawn(['bun','-e',${JSON.stringify("let count=0; setInterval(()=>{require('node:fs').writeFileSync('/data/descendant', JSON.stringify({pid:process.pid,count:++count}))},20)")}]); let count=0; setInterval(()=>{require('node:fs').writeFileSync('/data/parent', JSON.stringify({pid:process.pid,child:child.pid,count:++count}))},20);`,
      { flag: 'wx' },
    );
    const database = new Database(join(layouts.prod.root, 'db', 'wbs.db'));
    database.run('CREATE TABLE acceptance (writer TEXT NOT NULL)');
    database.close();
    const files = {
      Caddyfile:
        '{\n auto_https disable_redirects\n https_port 8443\n local_certs\n}\nimport log-redact.caddy\nimport site.caddy\nimport site-dev.caddy\nimport registry.caddy\nimport aivn.caddy\n',
      'log-redact.caddy': '(access-log) {\n log {\n output stdout\n format json\n }\n}\n',
      'site.caddy': 'prod.owner.test {\n respond "prod original" 200\n import access-log\n}\n',
      'site-dev.caddy': 'dev.owner.test {\n respond "dev original" 200\n import access-log\n}\n',
      'registry.caddy': 'registry.owner.test {\n respond "registry unchanged" 201\n}\n',
      'aivn.caddy': 'aivn.owner.test {\n respond "aivn unchanged" 202\n}\n',
    };
    for (const [name, contents] of Object.entries(files))
      await writeFile(join(caddy, name), contents, { mode: 0o600, flag: 'wx' });
    stage = 'fixture-networks';
    for (const physical of networks) {
      physical.intended = true;
      physical.id = readIdentity(
        (
          await command([
            'network',
            'create',
            '--label',
            `${SOURCE_FIXTURE_OWNER}=${token}`,
            physical.name,
          ])
        ).trim(),
      );
    }
    const networkId = networks.find((physical) => physical.name === layouts.dev.network)?.id;
    requireProof(
      typeof networkId === 'string' && networkId !== '',
      'physical dev network ID absent',
    );
    stage = 'fixture-source-create';
    // Only the UUID tag is created; production's mutable source tag is never mutated.
    const existing = await command([
      'image',
      'ls',
      '--no-trunc',
      '--filter',
      `reference=${sourceTag}`,
      '--format',
      '{{.Repository}}:{{.Tag}}',
    ]);
    requireProof(!existing.split('\n').includes(sourceTag), 'fixture tag already exists');
    tagIntended = true;
    await command(['tag', sourcePin.reference, sourceTag]);
    const sourceId = await create(
      sourceName,
      sourceTag,
      sourcePin.id,
      [
        '--user',
        '1000:1000',
        '--workdir',
        '/src',
        '--network',
        layouts.dev.network,
        '--restart=unless-stopped',
        '--label',
        'com.docker.compose.service=dev-src',
        '--label',
        `com.docker.compose.project=source-${token}`,
        '--mount',
        `type=bind,src=${layouts.dev.root}/src,dst=/src`,
        '--mount',
        `type=bind,src=${layouts.dev.root}/data,dst=/data`,
        '--mount',
        `type=bind,src=${runtime},dst=/run/wbs-solver,readonly`,
      ],
      ['bun', 'run', 'dev'],
    );
    // Effective startup keeps the supplied image’s inherited entrypoint and exact supported argv.
    const sourceInitial = await actual(sourceId);
    requireProof(
      isDeepStrictEqual(readFields(sourceInitial['Config'])['Cmd'], ['bun', 'run', 'dev']),
      'source image must supply the supported bun run dev command',
    );
    const sourcePlan = plans.find((plan) => plan.name === sourceName);
    requireProof(sourcePlan !== undefined, 'source physical plan absent');
    const sourceConfig = structuredClone(sourceInitial['Config']);
    const sourceHost = readFields(sourceInitial['HostConfig']);
    const { RestartPolicy: _policy, ...fixedSourceHost } = sourceHost;
    const sourceMounts = structuredClone(sourceInitial['Mounts']);
    const sourcePlanIndex = plans.indexOf(sourcePlan);
    plans[sourcePlanIndex] = {
      ...sourcePlan,
      validate: (container) => {
        const { RestartPolicy: _restart, ...host } = readFields(container['HostConfig']);
        requireProof(
          isDeepStrictEqual(container['Config'], sourceConfig) &&
            isDeepStrictEqual(host, fixedSourceHost) &&
            isDeepStrictEqual(container['Mounts'], sourceMounts) &&
            readFields(readFields(container['NetworkSettings'])['Networks'])[
              layouts.dev.network
            ] !== undefined &&
            readFields(
              readFields(readFields(container['NetworkSettings'])['Networks'])[layouts.dev.network],
            )['NetworkID'] === networkId,
          'source physical coordinates changed',
        );
      },
    };
    stage = 'fixture-managed-create';
    for (const tier of ['be', 'gw'] as const) {
      const image = pin(tier === 'be' ? 'BACKEND' : 'GATEWAY');
      const rendered = renderManagedParticipant(tier, layouts.prod, token);
      const id = await create(
        rendered.name,
        image.reference,
        image.id,
        rendered.args,
        rendered.argv,
      );
      await record('managed-namespace-fixture', {
        id,
        tier,
        intendedWriterSha256: hash(rendered.program),
      });
      await start(id);
    }
    const writesDeadline = Math.min(deadline, performance.now() + 15000);
    let writers: string[] = [];
    while (performance.now() < writesDeadline) {
      const stored = new Database(join(layouts.prod.root, 'db', 'wbs.db'), { readonly: true });
      try {
        writers = stored
          .query('SELECT writer FROM acceptance')
          .all()
          .map((entry) => readString(readFields(entry)['writer']))
          .sort();
      } finally {
        stored.close();
      }
      if (isDeepStrictEqual(writers, ['be'])) break;
      await Bun.sleep(100);
    }
    requireProof(
      isDeepStrictEqual(writers, ['be']),
      'initialized backend fixture write required before exclusion',
    );
    await record('managed-real-writes', { writers });
    stage = 'fixture-edge-create';
    const caddyPin = pin('CADDY');
    const edgeId = await create(caddyName, caddyPin.reference, caddyPin.id, [
      '--init',
      '--network',
      layouts.prod.network,
      '--restart=no',
      '--publish',
      '127.0.0.1::8443',
      '--mount',
      `type=bind,src=${caddy},dst=/etc/caddy,readonly`,
      '--mount',
      `type=bind,src=${root}/caddy-data,dst=/data`,
      '--mount',
      `type=bind,src=${root}/caddy-config,dst=/config`,
    ]);
    stage = 'fixture-edge-attach';
    const devNetwork = networks.find((physical) => physical.name === layouts.dev.network);
    requireProof(devNetwork !== undefined, 'planned dev network absent');
    await ownNetwork(devNetwork);
    await effect(['network', 'connect', devNetwork.id, edgeId], edgeId);
    stage = 'fixture-source-start';
    await start(sourceId);
    stage = 'fixture-edge-start';
    await start(edgeId);
    stage = 'fixture-tag-negative';
    const negative = {
      prod: { ...layouts.prod, stateDir: join(root, 'negative-prod') },
      dev: { ...layouts.dev, stateDir: join(root, 'negative-dev') },
    };
    for (const directory of [
      negative.prod.stateDir,
      negative.dev.stateDir,
      join(root, 'negative-owner'),
    ])
      await mkdir(directory, { mode: 0o700 });
    const substitution = pin('GATEWAY');
    requireProof(
      substitution.id !== sourcePin.id,
      'tag substitution needs independently distinct local image',
    );
    requireProof(
      (await command(['image', 'inspect', '--format', '{{.Id}}', sourceTag])).trim() ===
        sourcePin.id,
      'owned tag changed before negative',
    );
    await command(['tag', substitution.reference, sourceTag]);
    try {
      await requireFixtureRefusal('fixture-tag-negative', 'source-tag-resolution', () =>
        withDependencyOwner(
          { sha, layouts: [negative.prod, negative.dev] },
          async (owner) => {
            await withSourceDevExcluded(owner, negative, sha, transport, deadline, () => {
              throw new Error('tag negative entered callback');
            });
          },
          join(root, 'negative-owner'),
        ),
      );
    } finally {
      requireProof(
        (await command(['image', 'inspect', '--format', '{{.Id}}', sourceTag])).trim() ===
          substitution.id,
        'substituted tag changed before restore',
      );
      await command(['tag', sourcePin.reference, sourceTag]);
    }
    await record('actual-tag-substitution-refused', {
      tagRefused: true,
      sourceImage: sourcePin.id,
      substitutionImage: substitution.id,
    });
    stage = 'fixture-source-writes';
    const parent = await waitFile(join(layouts.dev.root, 'data', 'parent'));
    const descendant = await waitFile(join(layouts.dev.root, 'data', 'descendant'));
    await Bun.sleep(100);
    requireProof(
      (await readFile(join(layouts.dev.root, 'data', 'parent'), 'utf8')) !== parent &&
        (await readFile(join(layouts.dev.root, 'data', 'descendant'), 'utf8')) !== descendant,
      'parent and descendant writes were not active before stop',
    );
    const processes = await effect(['top', sourceId, '-eo', 'pid,ppid,args'], sourceId);
    requireProof(
      processes.trim().split('\n').length >= 3,
      'real source descendant process tree absent',
    );
    await record('source-real-descendant-writes', {
      processesSha256: hash(processes),
      parentSha256: hash(parent),
      descendantSha256: hash(descendant),
      proof: 'scratch bun run dev namespace only',
    });
    stage = 'fixture-ingress-readiness';
    await request(edgeId, layouts.prod.siteAddress, 200);
    await request(edgeId, layouts.dev.siteAddress, 200);
    const scans: { id: string; done: boolean; reaped: boolean }[] = [];
    const streaming: DockerExec = async (args, nonce, consume, signal) => {
      requireProof(
        isDeepStrictEqual(args.slice(0, 4), ['exec', '-i', '--user', '0:0']),
        'scanner argv prefix differs',
      );
      const id = args[4];
      requireProof(
        typeof id === 'string' && created.some((child) => child.id === id),
        'scanner outside planned fixture',
      );
      await transport(['inspect', id], signal);
      await actual(id);
      const session = { id, done: false, reaped: false };
      scans.push(session);
      await runDockerExec(
        args,
        nonce,
        (token) => {
          if (token === 'DONE') session.done = true;
          if (token === 'REAPED') session.reaped = true;
          return consume(token);
        },
        signal,
      );
    };
    const namespace: typeof verifyContainerNamespace = async (...args) =>
      verifyContainerNamespace(...args);
    let retained:
      | { owner: Parameters<typeof inspectSourceDevExclusion>[0]; source: SourceDevExclusion }
      | undefined;
    const callback = { finished: false };
    stage = 'fixture-composition';
    const completion = await excludeSourceAndManagedDependencies(
      { sha, layouts: [layouts.prod, layouts.dev] },
      fixture.pins,
      { ...fixture.ports, runDocker: transport },
      transport,
      deadline,
      async (owner, source) => {
        stage = 'fixture-protected-callback';
        retained = { owner, source };
        await request(edgeId, layouts.prod.siteAddress, 503);
        await request(edgeId, layouts.dev.siteAddress, 503);
        await inspectSourceDevExclusion(owner, source);
        const terminal = await actual(sourceId);
        requireProof(
          readFields(terminal['State'])['Pid'] === 0 &&
            readFields(terminal['State'])['Running'] === false &&
            readFields(readFields(terminal['HostConfig'])['RestartPolicy'])['Name'] === 'no',
          'source terminal/PID-zero/restart proof missing',
        );
        const terminalParent = await readFile(join(layouts.dev.root, 'data', 'parent'), 'utf8');
        const terminalDescendant = await readFile(
          join(layouts.dev.root, 'data', 'descendant'),
          'utf8',
        );
        const ids = (await transport(['ps', '-a', '--no-trunc', '--format', '{{.ID}}']))
          .trim()
          .split('\n');
        const audit: unknown = parseFixtureInspection(await transport(['inspect', ...ids]));
        requireProof(Array.isArray(audit), 'complete callback audit absent');
        const recognized = await inspectExcludedSourceMember(owner, layouts.prod, source, audit);
        requireProof(
          audit.some((raw: unknown) => raw === recognized) &&
            readFields(recognized)['Id'] === sourceId,
          'source raw-object recognition failed',
        );
        await Bun.sleep(100);
        requireProof(
          (await readFile(join(layouts.dev.root, 'data', 'parent'), 'utf8')) === terminalParent &&
            (await readFile(join(layouts.dev.root, 'data', 'descendant'), 'utf8')) ===
              terminalDescendant,
          'source writes changed after stop',
        );
        // A newly labelled stopped mounted child stays in the same complete universe.
        const unrelatedRoot = join(root, 'unrelated');
        await mkdir(unrelatedRoot, { mode: 0o700 });
        const unrelated = await create(
          `source-exclusion-unrelated-${token}`,
          pin('BACKEND').reference,
          pin('BACKEND').id,
          [
            '--init',
            '--network=none',
            '--restart=no',
            '--mount',
            `type=bind,src=${unrelatedRoot},dst=/opaque`,
          ],
        );
        try {
          const main = await lstat(join(layouts.prod.root, 'db', 'wbs.db'), { bigint: true });
          const directory = await lstat(join(layouts.prod.root, 'db'), { bigint: true });
          const completeIds = (await transport(['ps', '-a', '--no-trunc', '--format', '{{.ID}}']))
            .trim()
            .split('\n');
          const complete = parseFixtureInspection(await transport(['inspect', ...completeIds]));
          requireProof(
            Array.isArray(complete) && complete.length === completeIds.length,
            'unrelated negative complete inventory absent',
          );
          const rawUnrelated: unknown = complete.find(
            (raw: unknown) => readFields(raw)['Id'] === unrelated,
          );
          requireProof(
            rawUnrelated !== undefined &&
              readFields(rawUnrelated)['Name'] === `/source-exclusion-unrelated-${token}`,
            'unrelated negative child omitted from complete census',
          );
          await requireFixtureRefusal('fixture-protected-callback', 'unrelated-namespace', () =>
            auditUnmanagedMounts(
              [rawUnrelated],
              { blue: null, green: null },
              {
                path: '/data/wbs.db',
                host: join(layouts.prod.root, 'db', 'wbs.db'),
                fileIdentity: `${String(main.dev)}:${String(main.ino)}`,
                directoryIdentity: `${String(directory.dev)}:${String(directory.ino)}`,
              },
              pin('BACKEND').reference,
              transport,
              deadline,
              namespace,
            ),
          );
        } finally {
          await effect(['rm', unrelated], unrelated);
        }
        await record('unrelated-mounted-child-refused', { id: unrelated, unrelatedRefused: true });
        callback.finished = true;
        stage = 'fixture-composition';
        return 'protected-interval-completed';
      },
      namespace,
      streaming,
      fixture.ports.edgeState,
    );
    requireProof(callback.finished, 'coordinator did not await callback');
    requireProof(
      scans.length > 0 && scans.every((scan) => scan.done && scan.reaped),
      'real namespace scanner DONE/REAPED absent',
    );
    requireProof(retained !== undefined, 'source token not captured');
    const expiredToken = retained;
    stage = 'fixture-token-expiry';
    await requireFixtureRefusal('fixture-token-expiry', 'source-token-expired', () =>
      inspectSourceDevExclusion(expiredToken.owner, expiredToken.source),
    );
    const expired = true;
    await record('integrated-completion', {
      completion,
      scans,
      callbackFinished: callback.finished,
      expired,
      sourceId,
      edgeId,
      networkId,
    });
  } catch (cause) {
    failure = cause instanceof FixtureFailure ? cause : new FixtureFailure(stage, cause);
  } finally {
    cleaning = true;
    cleanupDeadline = performance.now() + 60000;
    for (const child of created) {
      try {
        const census = (
          await command([
            'ps',
            '-a',
            '--no-trunc',
            '--filter',
            `label=${SOURCE_FIXTURE_OWNER}=${token}`,
            '--filter',
            `name=^/${child.name}$`,
            '--format',
            '{{.ID}}',
          ])
        ).trim();
        if (census !== '') {
          const id = readIdentity(census);
          requireProof(child.id === '' || child.id === id, 'cleanup child identity changed');
          child.id = id;
          await effect(['rm', '--force', id], id);
        }
      } catch (cause) {
        cleanupFailures.push(describeFixtureFailure(cause, 'fixture-component-cleanup'));
      }
    }
    if (tagIntended)
      try {
        requireProof(
          (await command(['image', 'inspect', '--format', '{{.Id}}', sourceTag])).trim() ===
            sourcePin.id,
          'cleanup tag identity changed',
        );
        await command(['image', 'rm', sourceTag]);
      } catch (cause) {
        cleanupFailures.push(describeFixtureFailure(cause, 'fixture-component-cleanup'));
      }
    for (const physical of networks)
      if (physical.intended)
        try {
          const owned = await ownNetwork(physical);
          await command(['network', 'rm', readIdentity(owned['Id'])]);
        } catch (cause) {
          cleanupFailures.push(describeFixtureFailure(cause, 'fixture-component-cleanup'));
        }
    try {
      const remaining = (
        await command([
          'ps',
          '-a',
          '--no-trunc',
          '--filter',
          `label=${SOURCE_FIXTURE_OWNER}=${token}`,
          '--format',
          '{{.ID}}',
        ])
      )
        .trim()
        .split('\n')
        .filter((id) => id !== '');
      requireProof(
        remaining.every((id) => fixture.attempts.some((attempt) => attempt.id === id)),
        'unexpected labelled component survived cleanup',
      );
    } catch (cause) {
      cleanupFailures.push(describeFixtureFailure(cause, 'fixture-component-cleanup'));
    }
    await record('component-cleanup', { cleanupFailures, networks, created });
  }
  if (cleanupFailures.length > 0)
    throw new FixtureFailure(
      'fixture-component-cleanup',
      new AggregateError([failure, ...cleanupFailures], 'integrated cleanup failed', {
        cause: failure,
      }),
    );
  if (failure !== undefined) throw failure;
  // Private runtime/state/source trees remain alongside hash-only receipts for attended review.
  await record('private-evidence', { files: await readdir(root) });
}
if (import.meta.main) await runSourceExclusionAcceptance();
