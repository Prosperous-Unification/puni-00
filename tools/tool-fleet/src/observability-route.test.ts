import { createHash } from 'node:crypto';
import * as filesystem from 'node:fs';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { hashHistory, routeProviderChecks } from '@tools/observability-route';
import { routeChecks } from '@tools/observability-route-contract';
import { createRouteFixture } from '@tools/observability-route-fixture';
import { expect, spyOn, test } from 'bun:test';

import { type DiscoveryCommand, runDiscoveryCommand } from './discover';
import { fixture as createPreflightFixture } from './observability-preflight.fixture';
import { runObservabilityRoute, UncertainRouteOperation } from './observability-route';
import { runObservabilityRouteCli } from './observability-route-cli';

async function expectRefusal(operation: Promise<unknown>, category: string) {
  const refusal: unknown = await operation.then(
    () => undefined,
    (failure: unknown) => failure,
  );
  expect(refusal).toBeInstanceOf(Error);
  if (!(refusal instanceof Error)) throw new Error('Expected route refusal');
  expect(refusal.message).toContain(category);
}

test('route CLI refuses missing reviewed request before mutation with a fixed diagnostic', () => {
  const invocation = Bun.spawnSync([
    process.execPath,
    new URL('./observability-route-cli.ts', import.meta.url).pathname,
    'switch',
    '/tmp/puni-task79-deliberately-absent-request.json',
  ]);
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout.toString()).toBe('');
  expect(invocation.stderr.toString().trim()).toBe('route-file-absent');
});

async function composedFixture() {
  const observer = await createRouteFixture(),
    preflight = await createPreflightFixture();
  const oldAgent = process.env['SSH_AUTH_SOCK'];
  process.env['SSH_AUTH_SOCK'] = join(preflight.directory, 'agent.sock');
  const renameNamespace = (wire: unknown): unknown =>
    Array.isArray(wire)
      ? wire.map(renameNamespace)
      : wire !== null && typeof wire === 'object'
        ? Object.fromEntries(
            Object.entries(wire).map(([key, value]) => [key, renameNamespace(value)]),
          )
        : wire === 'observability'
          ? 'observability-dev'
          : wire;
  const request = renameNamespace(preflight.request) as typeof preflight.request;
  const snapshot = renameNamespace(preflight.snapshot) as typeof preflight.snapshot;
  const artifact = readFileSync(request.candidate[0].artifactPath, 'utf8').replace(
    'namespace: observability\n',
    'namespace: observability-dev\n',
  );
  writeFileSync(request.candidate[0].artifactPath, artifact);
  request.candidate[0].artifactSHA256 = createHash('sha256').update(artifact).digest('hex');
  const preflightReference = observer.put(join(observer.home, 'preflight.json'), request);
  const adapterRevision = 'd'.repeat(40);
  const adapterBundleSHA256 = observer.put(join(observer.home, 'operation-bundle'), {
    componentFixture: true,
    sourceRevision: adapterRevision,
  }).sha256;
  const producer = { revision: adapterRevision, bundleSHA256: adapterBundleSHA256 };
  const staged = {
    environment: 'dev' as const,
    sourceRevision: request.candidateRevision,
    candidateRevision: request.candidateRevision,
    observedRevision: observer.initialApplicationRevision,
    adapterRevision,
    artifactSHA256: hashHistory(
      request.candidate.map((candidate) => ({
        path: candidate.artifactPath,
        sha256: candidate.artifactSHA256,
      })),
    ),
    target: hashHistory({
      fleetId: request.fleetId,
      targetMarker: request.targetMarker,
      identityUID: request.identityUID,
      context: request.context,
      controllerContext: request.controllerContext,
    }),
    source: hashHistory(observer.pin),
    selection: hashHistory({
      resources: request.resources,
      source: {
        kind: request.source.kind,
        name: request.source.name,
        namespace: request.source.namespace,
        uid: request.source.uid,
      },
      nodes: request.nodes.map(({ name, uid, machineID }) => ({ name, uid, machineID })),
      workloads: request.candidate.map(
        ({ kind, instance, namespace, name, node, replicaUIDs }) => ({
          kind,
          instance,
          namespace,
          name,
          node,
          replicaUIDs,
        }),
      ),
    }),
    stores: hashHistory({
      claims: request.claims,
      docker: request.docker,
      candidateClaims: request.candidate.map((candidate) => ({
        namespace: candidate.namespace,
        name: candidate.name,
        claims: candidate.claims,
      })),
    }),
    routes: observer.afterSHA256,
  };
  const acceptance = () => {
    const now = Date.now();
    const window = (
      binding: typeof staged,
      role: string,
      observationId: string,
      observedAt: number,
    ) => {
      const identity = {
        environment: 'dev',
        service: 'be-01',
        revision: observer.initialApplicationRevision,
        observationId,
      };
      const found = { state: 'found', identity, observedAt, proof: { kind: 'record' } };
      const trace = {
        ...found,
        proof: {
          kind: 'trace',
          traceId: '1',
          parentSpanId: '2',
          childSpanId: '3',
          childParentSpanId: '2',
        },
      };
      return {
        observationId,
        observedAt,
        capture: observer.put(join(observer.home, `${role}-${observationId}-${String(now)}`), {
          version: 1,
          kind: 'stored-observation',
          target: binding.target,
          source: binding.source,
          identity,
          observedAt,
          evidence: { log: found, metric: found, trace },
          queries: [
            observer.put(join(observer.home, `${role}-${observationId}-${String(now)}-query`), {
              stored: observationId,
            }),
          ],
        }),
      };
    };
    const member = (binding: typeof staged, role: string) => ({
      binding,
      startedAt: now - 120000,
      completedAt: now - 1,
      checks: routeChecks.map((check) => {
        const output = observer.put(join(observer.home, `${role}-${check}-stdout`), {
          componentFixture: true,
          observation: check,
        });
        const capture = observer.put(join(observer.home, `${role}-${check}-capture`), {
          version: 1,
          kind: 'observed-runtime-commands',
          target: binding.target,
          source: binding.source,
          startedAt: now - 100000,
          completedAt: now - 1,
          commands: [{ argv: ['fixture-verifier', check], exitCode: 0, stdout: output }],
        });
        const projection = observer.put(join(observer.home, `${role}-${check}-projection`), {
          version: 1,
          kind: 'operator-reviewed-observation',
          check,
          providerCheck: routeProviderChecks[check],
          target: binding.target,
          captureSHA256: capture.sha256,
          finding: 'reviewed-satisfied',
          observations: [check],
        });
        return { check, capture, projection };
      }),
      windows: [
        window(binding, role, 'one', now - 90000),
        window(binding, role, 'two', now - 1000),
      ],
    });
    const rehearsal = { ...staged, target: '9'.repeat(64) };
    return {
      receipt: observer.put(join(observer.home, `acceptance-${String(now)}.json`), {
        version: 1,
        kind: 'reviewed-observability-acceptance',
        rehearsal: member(rehearsal, 'rehearsal'),
        staged: member(staged, 'staged'),
      }),
      rehearsal,
      staged,
      maxAgeMs: 300000,
      freshnessWindowMs: 30000,
    };
  };
  const operation = {
    version: 1,
    observer: observer.pin,
    adapterRevision,
    adapterBundleSHA256,
    before: observer.before,
    after: observer.after,
    beforeSHA256: observer.beforeSHA256,
    afterSHA256: observer.afterSHA256,
    preflight: preflightReference,
    sshTransportPath: preflight.transportPath,
    clusterHost: 'h3mon',
    history: { receipt: observer.history, routes: observer.before },
    grafana: observer.put(join(observer.home, 'grafana.json'), {
      schema: 1,
      owner: 'puni-dev-observability',
      phase: 'applied',
      baseline: 'a'.repeat(64),
      datasourceHash: 'b'.repeat(64),
      dashboardHash: 'c'.repeat(64),
    }),
    acceptance: acceptance(),
  };
  const run = async (command: DiscoveryCommand) => {
    observer.put(join(preflight.directory, 'snapshot.json'), snapshot);
    if (command.source.startsWith('ssh-facts:'))
      return runDiscoveryCommand({ ...command, executable: join(preflight.bin, 'ssh') });
    const remote = command.arguments.at(-1);
    if (!remote?.startsWith("'sudo' '-n' 'k3s' 'kubectl'"))
      throw new Error('fixture requires the actual remote preflight command');
    return runDiscoveryCommand({
      ...command,
      executable: '/bin/sh',
      arguments: [
        '-c',
        remote.replace("'sudo' '-n' 'k3s' 'kubectl'", `'${join(preflight.bin, 'kubectl')}'`),
      ],
    });
  };
  return {
    observer,
    preflight,
    operation,
    request,
    snapshot,
    acceptance,
    producer,
    run,
    invoke: (kind: string, wire: unknown = operation, wait = observer.tick) =>
      runObservabilityRoute(
        [kind, observer.put(join(observer.home, `request-${kind}.json`), wire).path],
        { context: observer.context, producer, run, wait },
      ),
    close() {
      preflight.server.stop(true);
      if (oldAgent === undefined) delete process.env['SSH_AUTH_SOCK'];
      else process.env['SSH_AUTH_SOCK'] = oldAgent;
      observer.close();
    },
  };
}

async function recoveryFixture() {
  const fixture = await composedFixture();
  const manager = JSON.parse(readFileSync(fixture.observer.managerState, 'utf8')) as {
    reload: boolean;
  };
  manager.reload = true;
  fixture.observer.put(fixture.observer.managerState, manager);
  const failed = await fixture.invoke('switch').catch((failure: unknown) => failure);
  if (!(failed instanceof UncertainRouteOperation)) {
    fixture.close();
    throw new Error('Expected fixture uncertainty');
  }
  const preparedPath = join(failed.directory, 'prepared.json');
  const child = Bun.spawnSync(
    [
      process.execPath,
      '--eval',
      `const fs=await import('node:fs');const p=process.env.PUNI_PREPARED;const prepared=JSON.parse(fs.readFileSync(p));prepared.ownerPID=process.pid;fs.writeFileSync(p,JSON.stringify(prepared));fs.writeFileSync(process.env.PUNI_OWNER,JSON.stringify({operationId:prepared.operationId,pid:process.pid}));console.log(process.pid);`,
    ],
    {
      env: {
        ...process.env,
        PUNI_PREPARED: preparedPath,
        PUNI_OWNER: join(fixture.observer.state, 'route.lock/owner.json'),
      },
    },
  );
  if (child.exitCode !== 0) {
    fixture.close();
    throw new Error('Expected inactive fixture owner');
  }
  manager.reload = false;
  fixture.observer.put(fixture.observer.managerState, manager);
  const prepared = JSON.parse(readFileSync(preparedPath, 'utf8')) as {
    beforeUnit: string;
    afterUnit: string;
  };
  const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
  const args = [
    'recover',
    preparedPath,
    sha(readFileSync(preparedPath)),
    sha(prepared.afterUnit),
    sha(prepared.beforeUnit),
    child.stdout.toString().trim(),
    '--reconciled',
  ];
  const options = {
    context: fixture.observer.context,
    producer: fixture.producer,
    run: fixture.run,
    wait: fixture.observer.tick,
  };
  return {
    ...fixture,
    priorDirectory: failed.directory,
    preparedPath,
    prepared,
    args,
    options,
    recover: (operands = args) => runObservabilityRoute(operands, options),
  };
}

async function recoveryChild(
  fixture: Awaited<ReturnType<typeof recoveryFixture>>,
  fault: 'handoff-sync' | 'lease-cleanup',
) {
  const script = join(fixture.observer.home, `recovery-child-${fault}.ts`);
  writeFileSync(
    script,
    `
    import * as fs from 'node:fs';
    import { spyOn, setSystemTime } from 'bun:test';
    import { runObservabilityRouteCli } from ${JSON.stringify(new URL('./observability-route-cli.ts', import.meta.url).pathname)};
    import { runDiscoveryCommand } from ${JSON.stringify(new URL('./discover.ts', import.meta.url).pathname)};
    const context = ${JSON.stringify(fixture.observer.context)};
    setSystemTime(JSON.parse(fs.readFileSync(${JSON.stringify(join(fixture.observer.home, 'clock.json'))}, 'utf8')));
    context.readProcess = () => { const manager = JSON.parse(fs.readFileSync(${JSON.stringify(fixture.observer.managerState)}, 'utf8')); return { executable: manager.loadedCommand.split(' ')[0], arguments: manager.loadedCommand.split(' ') }; };
    const lock = ${JSON.stringify(join(fixture.observer.state, 'route.lock'))};
    const prior = JSON.parse(fs.readFileSync(lock+'/owner.json', 'utf8')).operationId;
    let injected = false;
    const sync = fs.fsyncSync, unlink = fs.unlinkSync;
    if (${JSON.stringify(fault)} === 'handoff-sync') spyOn(fs, 'fsyncSync').mockImplementation((fd) => {
      if (!injected && fs.readlinkSync('/proc/self/fd/'+fd) === lock && JSON.parse(fs.readFileSync(lock+'/owner.json', 'utf8')).operationId !== prior) { injected = true; throw new Error('injected-final-owner-sync'); }
      sync(fd);
    });
    else spyOn(fs, 'unlinkSync').mockImplementation((path) => {
      if (!injected && path === lock+'/recovery-owner.json') { injected = true; throw new Error('injected-lease-cleanup'); }
      unlink(path);
    });
    await runObservabilityRouteCli(${JSON.stringify(fixture.args)}, { context, producer: ${JSON.stringify(fixture.producer)}, run: async (command) => {
      if (!command.source.startsWith('ssh-facts:')) throw new Error('fixture refuses non-retained transport');
      return runDiscoveryCommand({ ...command, executable: ${JSON.stringify(join(fixture.preflight.bin, 'ssh'))} });
    }, wait: async () => { throw new Error('fixture refuses unexpected post-invocation wait'); } });
    console.log(JSON.stringify({fixtureFaultInjected: injected}));
  `,
    { mode: 0o600 },
  );
  const child = Bun.spawn([process.execPath, script], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  console.info(JSON.stringify({ fix1RecoveryChild: { fault, exitCode, stdout, stderr } }));
  expect(exitCode).toBe(1);
  return { ...JSON.parse(stderr), ...JSON.parse(stdout) } as {
    state: string;
    directory: string;
    recoveryCommands: string[][];
    persistenceFailures: string[];
    fixtureFaultInjected: boolean;
  };
}

for (const fault of ['handoff-sync', 'lease-cleanup'] as const) {
  test(`fix1 ${fault} leaves a supported exact command after the recovery process exits`, async () => {
    const fixture = await recoveryFixture();
    try {
      const before = readFileSync(fixture.observer.unit),
        originalOwner = readFileSync(join(fixture.observer.state, 'route.lock/owner.json'));
      const originalUncertain = readFileSync(join(fixture.priorDirectory, 'uncertain.json'));
      if (fault === 'lease-cleanup') fixture.observer.faults.history = true;
      const diagnostic = await recoveryChild(fixture, fault);
      expect(diagnostic.state).toBe('uncertain');
      expect(readFileSync(fixture.observer.unit)).toEqual(before);
      expect(diagnostic.fixtureFaultInjected).toBe(true);
      expect(existsSync(join(fixture.observer.state, 'route.lock/recovery-owner.json'))).toBe(true);
      if (fault === 'handoff-sync') {
        const archive = readdirSync(fixture.priorDirectory).find((name) =>
          name.startsWith('reconciled-owner-'),
        );
        if (archive === undefined) throw new Error('Missing durable original ownership');
        expect(readFileSync(join(fixture.priorDirectory, archive))).toEqual(originalOwner);
      } else {
        expect(readFileSync(join(fixture.observer.state, 'route.lock/owner.json'))).toEqual(
          originalOwner,
        );
        expect(diagnostic.persistenceFailures).toContain('ownership-release-failed');
      }
      fixture.observer.faults.history = false;
      const command = diagnostic.recoveryCommands.find((argv) => argv.includes(fixture.args[3]));
      if (command === undefined) throw new Error('Missing exact successor or original command');
      const recovered = await fixture.recover(command.slice(command.indexOf('recover')));
      expect(readFileSync(fixture.observer.unit, 'utf8')).toBe(fixture.prepared.beforeUnit);
      expect(readFileSync(join(fixture.priorDirectory, 'uncertain.json'))).toEqual(
        originalUncertain,
      );
      expect((JSON.parse(readFileSync(recovered.receipt, 'utf8')) as { phase: string }).phase).toBe(
        'completed',
      );
    } finally {
      fixture.close();
    }
  });
}

for (const state of ['active', 'unknown', 'foreign'] as const) {
  test(`fix1 explicit recovery refuses ${state} lease without changing ownership or unit`, async () => {
    const fixture = await recoveryFixture();
    let restoreDenial: (() => void) | undefined;
    try {
      const ownerPath = join(fixture.observer.state, 'route.lock/owner.json'),
        owner = JSON.parse(readFileSync(ownerPath, 'utf8')) as { operationId: string; pid: number };
      const leaseId = '11111111-1111-4111-8111-111111111111';
      filesystem.mkdirSync(join(fixture.observer.state, `route-${leaseId}`), { mode: 0o700 });
      const leasePath = join(fixture.observer.state, 'route.lock/recovery-owner.json');
      fixture.observer.put(leasePath, {
        operationId: leaseId,
        parentOperationId:
          state === 'foreign' ? '22222222-2222-4222-8222-222222222222' : owner.operationId,
        pid: state === 'foreign' ? owner.pid : process.pid,
      });
      const before = readFileSync(fixture.observer.unit),
        ownerBytes = readFileSync(ownerPath),
        leaseBytes = readFileSync(leasePath);
      if (state === 'unknown') {
        const original = process.kill.bind(process);
        const denial = spyOn(process, 'kill').mockImplementation((pid, signal) => {
          if (pid === process.pid)
            throw Object.assign(new Error('injected-lease-denial'), { code: 'EPERM' });
          return original(pid, signal);
        });
        restoreDenial = () => {
          denial.mockRestore();
        };
      }
      const refused = await fixture.recover().catch((failure: unknown) => failure);
      expect(readFileSync(fixture.observer.unit)).toEqual(before);
      expect(readFileSync(ownerPath)).toEqual(ownerBytes);
      expect(readFileSync(leasePath)).toEqual(leaseBytes);
      expect(refused).toBeInstanceOf(Error);
    } finally {
      restoreDenial?.();
      fixture.close();
    }
  });
}

test('fix1 recovery lease drift during preparation prevents ownership transfer and unit mutation', async () => {
  const fixture = await recoveryFixture();
  try {
    const ownerPath = join(fixture.observer.state, 'route.lock/owner.json'),
      before = readFileSync(fixture.observer.unit),
      owner = readFileSync(ownerPath);
    const readProcess = fixture.observer.context.readProcess;
    let inspections = 0;
    fixture.observer.context.readProcess = (pid) => {
      if (++inspections === 3) {
        const path = join(fixture.observer.state, 'route.lock/recovery-owner.json');
        const lease = JSON.parse(readFileSync(path, 'utf8')) as { operationId: string };
        fixture.observer.put(path, {
          ...lease,
          operationId: '33333333-3333-4333-8333-333333333333',
        });
      }
      return readProcess(pid);
    };
    const failed = await fixture.recover().catch((failure: unknown) => failure);
    expect(readFileSync(fixture.observer.unit)).toEqual(before);
    expect(readFileSync(ownerPath)).toEqual(owner);
    expect(inspections).toBe(3);
    expect(failed).toBeInstanceOf(UncertainRouteOperation);
  } finally {
    fixture.close();
  }
});

test('fix1 recovery history refusal retains original ownership and an emitted retry succeeds', async () => {
  const fixture = await recoveryFixture();
  try {
    const ownerPath = join(fixture.observer.state, 'route.lock/owner.json');
    const owner = readFileSync(ownerPath),
      unit = readFileSync(fixture.observer.unit),
      prepared = readFileSync(fixture.preparedPath),
      uncertain = readFileSync(join(fixture.priorDirectory, 'uncertain.json'));
    fixture.observer.faults.history = true;
    const failed = await fixture.recover().catch((failure: unknown) => failure);
    expect(readFileSync(fixture.observer.unit)).toEqual(unit);
    expect(readFileSync(ownerPath)).toEqual(owner);
    expect(readFileSync(fixture.preparedPath)).toEqual(prepared);
    expect(readFileSync(join(fixture.priorDirectory, 'uncertain.json'))).toEqual(uncertain);
    expect(failed).toBeInstanceOf(UncertainRouteOperation);
    if (!(failed instanceof UncertainRouteOperation)) throw new Error('Missing supported retry');
    const command = failed.recoveryCommands.find((argv) => argv.includes(fixture.args[3]));
    if (command === undefined) throw new Error('Missing pinned current-unit retry');
    fixture.observer.faults.history = false;
    await fixture.recover(command.slice(command.indexOf('recover')));
    expect(readFileSync(fixture.observer.unit, 'utf8')).toBe(fixture.prepared.beforeUnit);
    expect(readFileSync(join(fixture.priorDirectory, 'uncertain.json'))).toEqual(uncertain);
  } finally {
    fixture.close();
  }
});

for (const phase of [
  'reservation',
  'compensation',
  'recovery-source',
  'recovery-destination',
  'recovery-archive-file',
] as const) {
  test(`fix1 ${phase} directory entry sync failure prevents the next unit mutation`, async () => {
    const recovering = phase.startsWith('recovery') ? await recoveryFixture() : undefined;
    const fixture = recovering ?? (await composedFixture());
    const original = filesystem.fsyncSync;
    const priorOwner =
      recovering === undefined
        ? undefined
        : (
            JSON.parse(
              readFileSync(join(fixture.observer.state, 'route.lock/owner.json'), 'utf8'),
            ) as { operationId: string }
          ).operationId;
    let injected = false;
    const sync = spyOn(filesystem, 'fsyncSync').mockImplementation((descriptor) => {
      const path = filesystem.readlinkSync(`/proc/self/fd/${String(descriptor)}`);
      const operations = readdirSync(fixture.observer.state).filter((name) =>
        name.startsWith('route-'),
      );
      const archived = operations.some((name) =>
        readdirSync(join(fixture.observer.state, name)).some((entry) =>
          entry.startsWith('reconciled-owner-'),
        ),
      );
      const ownerPath = join(fixture.observer.state, 'route.lock/owner.json');
      const owner = existsSync(ownerPath)
        ? (JSON.parse(readFileSync(ownerPath, 'utf8')) as { operationId: string }).operationId
        : undefined;
      const matches =
        phase === 'reservation'
          ? path === fixture.observer.state
          : phase === 'compensation'
            ? path === fixture.observer.state && operations.length === 2
            : phase === 'recovery-source'
              ? archived &&
                owner !== undefined &&
                owner !== priorOwner &&
                path === join(fixture.observer.state, `route-${owner}`)
              : phase === 'recovery-destination'
                ? archived &&
                  owner !== priorOwner &&
                  path === join(fixture.observer.state, 'route.lock')
                : path.includes('/reconciled-owner-') &&
                  !filesystem.statSync(`/proc/self/fd/${String(descriptor)}`).isDirectory();
      if (!injected && matches) {
        injected = true;
        throw new Error('injected-parent-directory-sync');
      }
      original(descriptor);
    });
    try {
      const before = readFileSync(fixture.observer.unit);
      if (recovering !== undefined) await recovering.recover().catch(() => undefined);
      else if (phase === 'reservation') await fixture.invoke('switch').catch(() => undefined);
      else
        await fixture
          .invoke('switch', fixture.operation, async (milliseconds) => {
            await fixture.observer.tick(milliseconds);
            fixture.observer.faults.candidateStored = true;
          })
          .catch(() => undefined);
      const expected =
        phase === 'compensation'
          ? readFileSync(fixture.observer.unit, 'utf8').includes(fixture.observer.after.directory)
          : readFileSync(fixture.observer.unit).equals(before);
      expect(expected).toBe(true);
      expect(injected).toBe(true);
    } finally {
      sync.mockRestore();
      fixture.close();
    }
  }, 15000);
}

for (const fault of [
  'occupied',
  'file-sync',
  'directory-sync',
  'compensation-sync',
  'prepared-reread',
] as const) {
  test(`fix1 CLI preserves actionable uncertainty after ${fault} recording failure`, async () => {
    const fixture = await composedFixture();
    const before = readFileSync(fixture.observer.unit);
    const manager = JSON.parse(readFileSync(fixture.observer.managerState, 'utf8')) as {
      reload: boolean;
      restart: boolean;
    };
    if (fault !== 'compensation-sync') {
      manager.reload = true;
      fixture.observer.put(fixture.observer.managerState, manager);
    }
    let occupied = '';
    const readProcess = fixture.observer.context.readProcess;
    if (fault === 'occupied')
      fixture.observer.context.readProcess = (pid) => {
        const directory = readdirSync(fixture.observer.state).find((name) =>
          name.startsWith('route-'),
        );
        if (directory !== undefined && occupied === '') {
          occupied = join(fixture.observer.state, directory, 'uncertain.json');
          writeFileSync(occupied, 'earlier-uncertainty', { mode: 0o600 });
        }
        return readProcess(pid);
      };
    const originalSync = filesystem.fsyncSync;
    const originalOpen = filesystem.openSync;
    let reread = false;
    const open = spyOn(filesystem, 'openSync').mockImplementation((path, flags, mode) => {
      if (
        fault === 'prepared-reread' &&
        typeof path === 'string' &&
        path.endsWith('/prepared.json') &&
        !readFileSync(fixture.observer.unit).equals(before)
      ) {
        reread = true;
        throw Object.assign(new Error('injected-prepared-reread-denial'), { code: 'EACCES' });
      }
      return originalOpen(path, flags, mode);
    });
    let injected = false;
    const sync = spyOn(filesystem, 'fsyncSync').mockImplementation((descriptor) => {
      const path = filesystem.readlinkSync(`/proc/self/fd/${String(descriptor)}`);
      const owner = JSON.parse(
        readFileSync(join(fixture.observer.state, 'route.lock/owner.json'), 'utf8'),
      ) as { operationId: string };
      const matches =
        fault === 'file-sync'
          ? path.endsWith('/uncertain.json')
          : fault === 'directory-sync'
            ? path.startsWith(`${fixture.observer.state}/route-`) &&
              filesystem.statSync(`/proc/self/fd/${String(descriptor)}`).isDirectory() &&
              existsSync(join(path, 'uncertain.json'))
            : fault === 'compensation-sync'
              ? path.endsWith('/uncertain.json') && !path.includes(`/route-${owner.operationId}/`)
              : false;
      if (!injected && matches) {
        injected = true;
        throw new Error('injected-secret-bearing-disk-failure');
      }
      originalSync(descriptor);
    });
    const lines: string[] = [],
      previousExit = process.exitCode ?? 0;
    const stderr = spyOn(console, 'error').mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    try {
      await runObservabilityRouteCli(
        [
          'switch',
          fixture.observer.put(join(fixture.observer.home, 'cli-request.json'), fixture.operation)
            .path,
        ],
        {
          context: fixture.observer.context,
          producer: fixture.producer,
          run: fixture.run,
          wait: async (milliseconds) => {
            await fixture.observer.tick(milliseconds);
            if (fault === 'compensation-sync') {
              fixture.observer.faults.candidateStored = true;
              const active = JSON.parse(readFileSync(fixture.observer.managerState, 'utf8')) as {
                restart: boolean;
              };
              active.restart = true;
              fixture.observer.put(fixture.observer.managerState, active);
            }
          },
        },
      );
      const owner = JSON.parse(
        readFileSync(join(fixture.observer.state, 'route.lock/owner.json'), 'utf8'),
      ) as { operationId: string };
      const ownerDirectory = join(fixture.observer.state, `route-${owner.operationId}`);
      const proof = {
        fault,
        unitMatchesBefore: readFileSync(fixture.observer.unit).equals(before),
        prepared: existsSync(join(ownerDirectory, 'prepared.json')),
        attempted: existsSync(join(ownerDirectory, 'mutation-started.json')),
        injected:
          fault === 'occupied' ? occupied !== '' : fault === 'prepared-reread' ? reread : injected,
        stderr: lines,
      };
      console.info(JSON.stringify({ fix1UncertaintyProof: proof }));
      expect(proof.unitMatchesBefore).toBe(fault === 'compensation-sync');
      expect(proof.prepared).toBe(true);
      expect(proof.attempted).toBe(true);
      if (fault !== 'prepared-reread') expect(proof.injected).toBe(true);
      expect(lines.join('\n')).toContain('"state":"uncertain"');
      const diagnostic = JSON.parse(lines.at(-1) ?? 'null') as {
        state: string;
        directory: string;
        recoveryCommands: string[][];
        persistenceFailures: string[];
        uncertaintyRecorded: boolean;
      };
      expect(diagnostic.state).toBe('uncertain');
      expect(diagnostic.recoveryCommands.length).toBe(2);
      const hash = createHash('sha256').update(readFileSync(fixture.observer.unit)).digest('hex');
      expect(
        diagnostic.recoveryCommands.some(
          (command) => command.includes(hash) && command.includes('--reconciled'),
        ),
      ).toBe(true);
      expect(existsSync(join(fixture.observer.state, 'route.lock/owner.json'))).toBe(true);
      if (fault === 'prepared-reread') {
        expect(reread).toBe(false);
        expect(diagnostic.persistenceFailures).toEqual([]);
      } else
        expect(diagnostic.persistenceFailures).toContain(
          fault === 'compensation-sync'
            ? 'compensation-uncertainty-write-failed'
            : 'uncertainty-write-failed',
        );
      expect(diagnostic.uncertaintyRecorded).toBe(
        fault === 'compensation-sync' || fault === 'prepared-reread',
      );
      expect(lines.join('\n')).not.toContain('secret-bearing');
      if (fault === 'occupied') expect(readFileSync(occupied, 'utf8')).toBe('earlier-uncertainty');
      else if (fault !== 'prepared-reread') expect(injected).toBe(true);
      expect(readFileSync(fixture.observer.unit).equals(before)).toBe(
        fault === 'compensation-sync',
      );
    } finally {
      stderr.mockRestore();
      sync.mockRestore();
      open.mockRestore();
      process.exitCode = previousExit;
      fixture.close();
    }
  }, 15000);
}

test('Task79 failed candidate keeps source unit and all historical receipts unchanged', async () => {
  const fixture = await composedFixture();
  try {
    const before = readFileSync(fixture.observer.unit),
      history = readFileSync(fixture.observer.history.path);
    fixture.snapshot.resources[1].ready = false;
    await expectRefusal(fixture.invoke('switch'), 'route-operation-refused');
    expect(readFileSync(fixture.observer.unit)).toEqual(before);
    expect(readFileSync(fixture.observer.history.path)).toEqual(history);
  } finally {
    fixture.close();
  }
});

for (const identity of ['controller', 'repository', 'node', 'replica'] as const) {
  test(`fix1 reviewed cohort refuses recreated ${identity} with matching fresh live pins`, async () => {
    const fixture = await composedFixture();
    try {
      const before = readFileSync(fixture.observer.unit);
      const uid = {
        controller: 'flux-uid',
        repository: 'source-uid',
        node: 'node-uid',
        replica: 'pod-uid',
      }[identity];
      const change = <T>(pin: T): T =>
        JSON.parse(JSON.stringify(pin).replaceAll(uid, `${uid}-recreated`)) as T;
      Object.assign(fixture.request, change(fixture.request));
      Object.assign(fixture.snapshot, change(fixture.snapshot));
      const preflight = fixture.observer.put(
        join(fixture.observer.home, 'recreated-preflight.json'),
        fixture.request,
      );
      const refusal = await fixture.invoke('switch', { ...fixture.operation, preflight }).then(
        () => undefined,
        (failure: unknown) => failure,
      );
      expect(readFileSync(fixture.observer.unit)).toEqual(before);
      expect(refusal).toBeInstanceOf(Error);
    } finally {
      fixture.close();
    }
  });
}

test('fix1 reviewed cohort permits a fetched unapplied repository head with a refreshed live pin', async () => {
  const fixture = await composedFixture();
  try {
    const revision = `main@sha1:${'e'.repeat(40)}`;
    fixture.snapshot.source.revision = revision;
    fixture.request.source.requiredRevision = revision;
    const preflight = fixture.observer.put(
      join(fixture.observer.home, 'fetched-head-preflight.json'),
      fixture.request,
    );
    const switched = await fixture.invoke('switch', { ...fixture.operation, preflight });
    expect(JSON.parse(readFileSync(switched.receipt, 'utf8')) as unknown).toMatchObject({
      phase: 'completed',
    });
  } finally {
    fixture.close();
  }
});

test('fix1 reviewed cohort refuses an applied controller revision with refreshed live pins', async () => {
  const fixture = await composedFixture();
  try {
    const before = readFileSync(fixture.observer.unit);
    const pin = fixture.request.resources.find(
      (entry) => entry.kind === 'Kustomization' && entry.requiredRevision !== '',
    );
    if (pin === undefined) throw new Error('Missing applied controller fixture');
    const live = fixture.snapshot.resources.find((entry) => entry.uid === pin.uid);
    if (live === undefined) throw new Error('Missing live controller fixture');
    pin.requiredRevision = `main@sha1:${'e'.repeat(40)}`;
    live.revision = pin.requiredRevision;
    fixture.snapshot.source.revision = pin.requiredRevision;
    fixture.request.source.requiredRevision = pin.requiredRevision;
    const preflight = fixture.observer.put(
      join(fixture.observer.home, 'applied-revision-preflight.json'),
      fixture.request,
    );
    const refused = await fixture
      .invoke('switch', { ...fixture.operation, preflight })
      .catch((failure: unknown) => failure);
    expect(readFileSync(fixture.observer.unit)).toEqual(before);
    expect(refused).toBeInstanceOf(Error);
  } finally {
    fixture.close();
  }
});

test('Task79 two concurrent composed operations admit only one owned mutation', async () => {
  const fixture = await composedFixture();
  try {
    const outcomes = await Promise.allSettled([fixture.invoke('switch'), fixture.invoke('switch')]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(
      readdirSync(fixture.observer.state).filter((name) => name.startsWith('route-')),
    ).toHaveLength(1);
  } finally {
    fixture.close();
  }
});

test('Task79 occupied prepared capture prevents mutation and preserves earlier bytes', async () => {
  const fixture = await composedFixture();
  try {
    const before = readFileSync(fixture.observer.unit),
      readProcess = fixture.observer.context.readProcess;
    let occupiedPath = '';
    fixture.observer.context.readProcess = (pid) => {
      const directory = readdirSync(fixture.observer.state).find((name) =>
        name.startsWith('route-'),
      );
      if (directory !== undefined && occupiedPath === '') {
        occupiedPath = join(fixture.observer.state, directory, 'prepared.json');
        writeFileSync(occupiedPath, 'earlier-capture', { mode: 0o600 });
      }
      return readProcess(pid);
    };
    await expectRefusal(fixture.invoke('switch'), 'route-operation-refused');
    expect(readFileSync(fixture.observer.unit)).toEqual(before);
    expect(readFileSync(occupiedPath, 'utf8')).toBe('earlier-capture');
  } finally {
    fixture.close();
  }
});

test('Task79 candidate inventory expiry before mutation preserves the current unit', async () => {
  const fixture = await composedFixture();
  try {
    const before = readFileSync(fixture.observer.unit);
    let inspections = 0;
    await expectRefusal(
      runObservabilityRoute(
        [
          'switch',
          fixture.observer.put(join(fixture.observer.home, 'expiry.json'), fixture.operation).path,
        ],
        {
          context: fixture.observer.context,
          producer: fixture.producer,
          wait: fixture.observer.tick,
          run: async (command) => {
            const observed = await fixture.run(command);
            if (command.source.startsWith('ssh-facts:') && ++inspections === 2)
              await fixture.observer.tick(fixture.request.maxAgeMs + 1);
            return { ...observed, observedAt: new Date().toISOString() };
          },
        },
      ),
      'route-operation-refused',
    );
    expect(readFileSync(fixture.observer.unit)).toEqual(before);
  } finally {
    fixture.close();
  }
});

test('Task79 forged completed parent cannot detach its operation request from prepared evidence', async () => {
  const fixture = await composedFixture();
  try {
    const switched = await fixture.invoke('switch');
    const forged = JSON.parse(readFileSync(switched.receipt, 'utf8')) as {
      request: { adapterBundleSHA256: string };
    };
    forged.request.adapterBundleSHA256 = '0'.repeat(64);
    const parent = fixture.observer.put(switched.receipt, forged);
    const before = readFileSync(fixture.observer.unit);
    const refusal = await fixture
      .invoke('rollback', {
        ...fixture.operation,
        before: fixture.observer.after,
        after: fixture.observer.before,
        beforeSHA256: fixture.observer.afterSHA256,
        afterSHA256: fixture.observer.beforeSHA256,
        parent,
      })
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );
    expect(refusal).toBeInstanceOf(Error);
    expect(readFileSync(fixture.observer.unit)).toEqual(before);
  } finally {
    fixture.close();
  }
});

for (const phase of ['file', 'directory'] as const) {
  test(`Task79 failed prepared ${phase} sync prevents unit mutation`, async () => {
    const fixture = await composedFixture();
    const original = filesystem.fsyncSync;
    let injected = false;
    const sync = spyOn(filesystem, 'fsyncSync').mockImplementation((descriptor) => {
      const path = filesystem.readlinkSync(`/proc/self/fd/${String(descriptor)}`);
      if (
        !injected &&
        (phase === 'file'
          ? path.endsWith('/prepared.json')
          : path.startsWith(`${fixture.observer.state}/route-`) &&
            filesystem.statSync(`/proc/self/fd/${String(descriptor)}`).isDirectory())
      ) {
        injected = true;
        throw new Error('injected-prepared-sync');
      }
      original(descriptor);
    });
    try {
      const before = readFileSync(fixture.observer.unit);
      await expectRefusal(fixture.invoke('switch'), 'route-operation-refused');
      expect(readFileSync(fixture.observer.unit)).toEqual(before);
      const directories = readdirSync(fixture.observer.state).filter((name) =>
        name.startsWith('route-'),
      );
      expect(
        directories.every(
          (name) => !existsSync(join(fixture.observer.state, name, 'mutation-started.json')),
        ),
      ).toBe(true);
    } finally {
      sync.mockRestore();
      fixture.close();
    }
  });
}

test('Task79 failed compensation stays uncertain and retains both operation receipts and lock', async () => {
  const fixture = await composedFixture();
  try {
    await expectRefusal(
      fixture.invoke('switch', fixture.operation, async (milliseconds) => {
        fixture.observer.advanceApplication('e'.repeat(40));
        await fixture.observer.tick(milliseconds);
        fixture.observer.faults.candidateStored = true;
        const manager = JSON.parse(readFileSync(fixture.observer.managerState, 'utf8')) as {
          restart: boolean;
        };
        manager.restart = true;
        fixture.observer.put(fixture.observer.managerState, manager);
      }),
      'route-mutation-uncertain',
    );
    const directories = readdirSync(fixture.observer.state).filter((name) =>
      name.startsWith('route-'),
    );
    expect(directories).toHaveLength(2);
    expect(
      directories.every((name) => existsSync(join(fixture.observer.state, name, 'uncertain.json'))),
    ).toBe(true);
    expect(existsSync(join(fixture.observer.state, 'route.lock/owner.json'))).toBe(true);
  } finally {
    fixture.close();
  }
}, 15000);

for (const fault of [
  'request',
  'producer',
  'production',
  'evidence',
  'selection',
  'unready',
  'owner',
  'volume',
] as const) {
  test(`Task79 composed operation refuses ${fault} before unit write`, async () => {
    const fixture = await composedFixture();
    try {
      const before = readFileSync(fixture.observer.unit);
      let wire: unknown = fixture.operation;
      if (fault === 'request')
        wire = { ...fixture.operation, unconsumedCredential: 'SYNTHETIC-PRIVATE-MARKER' };
      if (fault === 'producer')
        wire = { ...fixture.operation, adapterBundleSHA256: '0'.repeat(64) };
      if (fault === 'production') {
        const selected = structuredClone(fixture.request);
        selected.candidate[0].instance = 'prod';
        wire = {
          ...fixture.operation,
          preflight: fixture.observer.put(join(fixture.observer.home, 'production.json'), selected),
        };
      }
      if (fault === 'evidence') writeFileSync(fixture.operation.acceptance.receipt.path, 'changed');
      if (fault === 'selection') {
        const cohort = JSON.parse(
          readFileSync(fixture.operation.acceptance.receipt.path, 'utf8'),
        ) as { staged: { binding: { artifactSHA256: string } } };
        cohort.staged.binding.artifactSHA256 = '0'.repeat(64);
        wire = {
          ...fixture.operation,
          acceptance: {
            ...fixture.operation.acceptance,
            staged: { ...fixture.operation.acceptance.staged, artifactSHA256: '0'.repeat(64) },
            receipt: fixture.observer.put(
              join(fixture.observer.home, 'wrong-selected-artifact.json'),
              cohort,
            ),
          },
        };
      }
      if (fault === 'unready') fixture.snapshot.pods[0].ready = false;
      if (fault === 'owner') fixture.snapshot.docker.containers[0].project = 'foreign';
      if (fault === 'volume') fixture.snapshot.docker.volumes[0].createdAt = '2026-10-02T00:00:00Z';
      const refusal = await fixture.invoke('switch', wire).then(
        () => undefined,
        (failure: unknown) => failure,
      );
      expect(refusal).toBeInstanceOf(Error);
      expect(readFileSync(fixture.observer.unit)).toEqual(before);
    } finally {
      fixture.close();
    }
  });
}

test('Task79 post-start binding drift cannot replace the independently accepted route commitment', async () => {
  const fixture = await composedFixture();
  try {
    const manager = JSON.parse(readFileSync(fixture.observer.managerState, 'utf8')) as Record<
      string,
      unknown
    >;
    manager['bindingDrift'] = true;
    fixture.observer.put(fixture.observer.managerState, manager);
    await expectRefusal(fixture.invoke('switch'), 'route-mutation-uncertain');
  } finally {
    fixture.close();
  }
});

test('Task79 failed post-switch acceptance compensates with a distinct retained-route receipt', async () => {
  const fixture = await composedFixture();
  try {
    const oldUnit = readFileSync(fixture.observer.unit),
      frozenHistory = readFileSync(fixture.observer.history.path);
    await expectRefusal(
      fixture.invoke('switch', fixture.operation, async (milliseconds) => {
        fixture.observer.advanceApplication('e'.repeat(40));
        await fixture.observer.tick(milliseconds);
        fixture.observer.faults.candidateStored = true;
      }),
      'route-operation-compensated',
    );
    expect(readFileSync(fixture.observer.unit)).toEqual(oldUnit);
    const operations = readdirSync(fixture.observer.state).filter((name) =>
      name.startsWith('route-'),
    );
    expect(operations).toHaveLength(2);
    const receipts = operations.map((name) => readdirSync(join(fixture.observer.state, name)));
    expect(receipts.some((names) => names.includes('completed.json'))).toBe(true);
    expect(receipts.some((names) => names.includes('compensated.json'))).toBe(true);
    const completed = operations.find((name) =>
      readdirSync(join(fixture.observer.state, name)).includes('completed.json'),
    );
    if (completed === undefined) throw new Error('Missing compensated completion');
    const recovered = JSON.parse(
      readFileSync(join(fixture.observer.state, completed, 'completed.json'), 'utf8'),
    ) as { observations: { revision: string }[] };
    expect(
      recovered.observations.every((observation) => observation.revision === 'e'.repeat(40)),
    ).toBe(true);
    expect(readFileSync(fixture.observer.history.path)).toEqual(frozenHistory);
  } finally {
    fixture.close();
  }
}, 15000);

test('Task79 explicit recovery refuses active owner and tampered unit pins', async () => {
  const fixture = await composedFixture();
  try {
    const manager = JSON.parse(readFileSync(fixture.observer.managerState, 'utf8')) as {
      reload: boolean;
    };
    manager.reload = true;
    fixture.observer.put(fixture.observer.managerState, manager);
    await expectRefusal(fixture.invoke('switch'), 'route-mutation-uncertain');
    const operation = readdirSync(fixture.observer.state).find((name) => name.startsWith('route-'));
    if (operation === undefined) throw new Error('Missing fixture operation');
    const preparedPath = join(fixture.observer.state, operation, 'prepared.json');
    const prepared = JSON.parse(readFileSync(preparedPath, 'utf8')) as {
      beforeUnit: string;
      afterUnit: string;
    };
    const sha = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
    const args = [
      'recover',
      preparedPath,
      sha(readFileSync(preparedPath)),
      sha(prepared.afterUnit),
      sha(prepared.beforeUnit),
      String(process.pid),
      '--reconciled',
    ];
    const assertRecoveryRefuses = async (category: string) => {
      const unit = readFileSync(fixture.observer.unit),
        owner = readFileSync(join(fixture.observer.state, 'route.lock/owner.json'));
      const directories = readdirSync(fixture.observer.state).filter((name) =>
        name.startsWith('route-'),
      );
      const refusal = await runObservabilityRoute(args, {
        context: fixture.observer.context,
        producer: fixture.producer,
        run: fixture.run,
        wait: fixture.observer.tick,
      }).then(
        () => undefined,
        (failure: unknown) => failure,
      );
      expect(readFileSync(fixture.observer.unit)).toEqual(unit);
      expect(readFileSync(join(fixture.observer.state, 'route.lock/owner.json'))).toEqual(owner);
      expect(
        readdirSync(fixture.observer.state).filter((name) => name.startsWith('route-')),
      ).toEqual(directories);
      expect(refusal).toBeInstanceOf(Error);
      if (!(refusal instanceof Error)) throw new Error('Expected recovery refusal');
      expect(refusal.message).toContain(category);
    };
    await assertRecoveryRefuses('route-owner-active');
    const probe = spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('injected-owner-denial'), { code: 'EPERM' });
    });
    try {
      await assertRecoveryRefuses('route-owner-unknown');
    } finally {
      probe.mockRestore();
    }
    args[4] = '0'.repeat(64);
    await assertRecoveryRefuses('route-recovery-pins');
    args[4] = sha(prepared.beforeUnit);
    writeFileSync(fixture.observer.unit, 'foreign-unit');
    args[3] = sha('foreign-unit');
    await assertRecoveryRefuses('route-recovery-pins');
  } finally {
    fixture.close();
  }
});

for (const variant of ['lost-reload', 'failed-start'] as const) {
  test(`Task79 explicit recovery completes after inactive owner with ${variant}`, async () => {
    const fixture = await composedFixture();
    try {
      const manager = JSON.parse(readFileSync(fixture.observer.managerState, 'utf8')) as {
        reload: boolean;
        inactive: boolean;
        pid: number;
        loadedCommand: string;
      };
      manager.reload = true;
      fixture.observer.put(fixture.observer.managerState, manager);
      await expectRefusal(fixture.invoke('switch'), 'route-mutation-uncertain');
      const operation = readdirSync(fixture.observer.state).find((name) =>
        name.startsWith('route-'),
      );
      if (operation === undefined) throw new Error('Missing fixture operation');
      const directory = join(fixture.observer.state, operation),
        preparedPath = join(directory, 'prepared.json');
      const uncertain = readFileSync(join(directory, 'uncertain.json'));
      // Component crash fixture: a real child durably owns the modeled capture, then exits.
      // These synthetic ownership bytes are not actual-host evidence or runtime certification.
      const child = Bun.spawnSync(
        [
          process.execPath,
          '--eval',
          `const fs=await import('node:fs');const path=process.env.PUNI_ROUTE_TEST_PREPARED;const owner=process.env.PUNI_ROUTE_TEST_OWNER;const prepared=JSON.parse(fs.readFileSync(path));prepared.ownerPID=process.pid;fs.writeFileSync(path,JSON.stringify(prepared));fs.writeFileSync(owner,JSON.stringify({operationId:prepared.operationId,pid:process.pid}));console.log(process.pid);`,
        ],
        {
          env: {
            ...process.env,
            PUNI_ROUTE_TEST_PREPARED: preparedPath,
            PUNI_ROUTE_TEST_OWNER: join(fixture.observer.state, 'route.lock/owner.json'),
          },
        },
      );
      expect(child.exitCode).toBe(0);
      const ownerPID = Number(child.stdout.toString().trim());
      const prepared = JSON.parse(readFileSync(preparedPath, 'utf8')) as {
        beforeUnit: string;
        afterUnit: string;
      };
      manager.reload = false;
      fixture.observer.advanceApplication('e'.repeat(40));
      if (variant === 'failed-start') {
        manager.inactive = true;
        manager.pid = 0;
        manager.loadedCommand = prepared.afterUnit
          .split('\n')
          .find((line) => line.startsWith('ExecStart='))!
          .slice(10);
      }
      fixture.observer.put(fixture.observer.managerState, manager);
      const sha = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
      const args = [
        'recover',
        preparedPath,
        sha(readFileSync(preparedPath)),
        sha(prepared.afterUnit),
        sha(prepared.beforeUnit),
        String(ownerPID),
        '--reconciled',
      ];
      if (variant === 'lost-reload') {
        const before = readFileSync(fixture.observer.unit),
          owner = readFileSync(join(fixture.observer.state, 'route.lock/owner.json'));
        const invalid = [...args];
        invalid[4] = '0'.repeat(64);
        const refusal = await runObservabilityRoute(invalid, {
          context: fixture.observer.context,
          producer: fixture.producer,
          run: fixture.run,
          wait: fixture.observer.tick,
        }).then(
          () => undefined,
          (failure: unknown) => failure,
        );
        expect(readFileSync(fixture.observer.unit)).toEqual(before);
        expect(readFileSync(join(fixture.observer.state, 'route.lock/owner.json'))).toEqual(owner);
        expect(refusal).toBeInstanceOf(Error);
      }
      const recovered = await runObservabilityRoute(args, {
        context: fixture.observer.context,
        producer: fixture.producer,
        run: async (command) =>
          runDiscoveryCommand({ ...command, executable: join(fixture.preflight.bin, 'ssh') }),
        wait: fixture.observer.tick,
      });
      expect(readFileSync(fixture.observer.unit, 'utf8')).toBe(prepared.beforeUnit);
      expect(readFileSync(join(directory, 'uncertain.json'))).toEqual(uncertain);
      expect(JSON.parse(readFileSync(recovered.receipt, 'utf8'))).toMatchObject({
        kind: 'rollback',
        phase: 'completed',
      });
      const completion = JSON.parse(readFileSync(recovered.receipt, 'utf8')) as {
        observations: { revision: string }[];
      };
      expect(
        completion.observations.every((observation) => observation.revision === 'e'.repeat(40)),
      ).toBe(true);
    } finally {
      fixture.close();
    }
  });
}

test('Task79 composed switch rollback during Kubernetes failure and restore retain every prior receipt', async () => {
  const fixture = await composedFixture();
  try {
    const switched = await fixture.invoke('switch');
    const switchedBytes = readFileSync(switched.receipt),
      originalHistory = readFileSync(fixture.observer.history.path);
    fixture.snapshot.resources[1].ready = false;
    const rollbackRequest = {
      ...fixture.operation,
      before: fixture.observer.after,
      after: fixture.observer.before,
      beforeSHA256: fixture.observer.afterSHA256,
      afterSHA256: fixture.observer.beforeSHA256,
      parent: {
        path: switched.receipt,
        sha256: createHash('sha256').update(switchedBytes).digest('hex'),
      },
    };
    const rolledBack = await fixture.invoke('rollback', rollbackRequest);
    expect(readFileSync(switched.receipt)).toEqual(switchedBytes);
    fixture.snapshot.resources[1].ready = true;
    const freshRollback = fixture.observer.put(
      join(fixture.observer.home, 'new-preflight-rollback.json'),
      {
        operationId: 'rollback-fresh',
        candidateRevision: fixture.request.candidateRevision,
        capturedAt: new Date().toISOString(),
        claimUIDs: fixture.request.claims.map((claim) => claim.uid),
        dockerVolumes: fixture.request.docker.retainedVolumes,
      },
    );
    const freshPreflight = fixture.observer.put(
      join(fixture.observer.home, 'fresh-preflight.json'),
      {
        ...fixture.request,
        rollbackOperationId: 'rollback-fresh',
        rollbackPath: freshRollback.path,
        rollbackSHA256: freshRollback.sha256,
      },
    );
    const restored = await fixture.invoke('restore', {
      ...fixture.operation,
      acceptance: fixture.acceptance(),
      preflight: freshPreflight,
      parent: {
        path: rolledBack.receipt,
        sha256: createHash('sha256').update(readFileSync(rolledBack.receipt)).digest('hex'),
      },
    });
    expect(new Set([switched.operationId, rolledBack.operationId, restored.operationId]).size).toBe(
      3,
    );
    expect(readFileSync(switched.receipt)).toEqual(switchedBytes);
    expect(readFileSync(fixture.observer.history.path)).toEqual(originalHistory);
  } finally {
    fixture.close();
  }
});

test('Task79 forward settles preloaded candidate A while current observer and app progressed to B', async () => {
  const fixture = await composedFixture();
  try {
    const history = readFileSync(fixture.observer.history.path);
    fixture.observer.candidate.store(fixture.observer.initial);
    fixture.observer.advanceApplication('e'.repeat(40));
    await fixture.observer.tick(1000);
    const switched = await fixture.invoke('switch');
    const completion = JSON.parse(readFileSync(switched.receipt, 'utf8')) as {
      observations: { revision: string }[];
    };
    expect(
      completion.observations.every((observation) => observation.revision === 'e'.repeat(40)),
    ).toBe(true);
    expect(readFileSync(fixture.observer.history.path)).toEqual(history);
  } finally {
    fixture.close();
  }
}, 15000);

test('Task79 app advancement preserves cutover and retained rollback without changing immutable pins', async () => {
  const fixture = await composedFixture();
  try {
    const pins = JSON.stringify(fixture.operation.observer),
      history = readFileSync(fixture.observer.history.path);
    let windows = 0;
    const switched = await fixture.invoke('switch', fixture.operation, (milliseconds) => {
      if (++windows === 2) fixture.observer.advanceApplication('e'.repeat(40));
      return fixture.observer.tick(milliseconds);
    });
    const completion = JSON.parse(readFileSync(switched.receipt, 'utf8')) as {
      observations: { revision: string }[];
    };
    expect(completion.observations.map((observation) => observation.revision)).toEqual([
      fixture.observer.initialApplicationRevision,
      'e'.repeat(40),
    ]);
    expect(JSON.stringify(fixture.operation.observer)).toBe(pins);
    fixture.snapshot.resources[1].ready = false;
    const rolledBack = await fixture.invoke('rollback', {
      ...fixture.operation,
      before: fixture.observer.after,
      after: fixture.observer.before,
      beforeSHA256: fixture.observer.afterSHA256,
      afterSHA256: fixture.observer.beforeSHA256,
      parent: {
        path: switched.receipt,
        sha256: createHash('sha256').update(readFileSync(switched.receipt)).digest('hex'),
      },
    });
    const recovered = JSON.parse(readFileSync(rolledBack.receipt, 'utf8')) as {
      observations: { revision: string }[];
    };
    expect(
      recovered.observations.every((observation) => observation.revision === 'e'.repeat(40)),
    ).toBe(true);
    expect(readFileSync(fixture.observer.history.path)).toEqual(history);
  } finally {
    fixture.close();
  }
});
