import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resourceRuntimeEvent } from '@wbs/contracts';
import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { loadResourceConfiguration, ResourceRuntime, type ResourceUse } from './runtime';

if (process.env['DASH_RESOURCE_TEST_NAMESPACE'] !== '1') {
  test('managed resource runtime real Linux namespace integration', () => {
    const execution = Bun.spawnSync(
      [
        'unshare',
        '--user',
        '--map-root-user',
        '--pid',
        '--fork',
        '--mount-proc',
        process.execPath,
        'test',
        import.meta.path,
        '--timeout=60000',
      ],
      {
        env: { ...process.env, DASH_RESOURCE_TEST_NAMESPACE: '1' },
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 120000,
      },
    );
    expect(execution.stderr.toString()).not.toContain('Operation not permitted');
    if (execution.exitCode !== 0)
      throw new Error(execution.stdout.toString() + execution.stderr.toString());
    expect(execution.exitCode).toBe(0);
  }, 120000);
} else {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  function fixture(budget = 2) {
    const base = mkdtempSync(join(tmpdir(), 'dash-resources-'));
    roots.push(base);
    const root = join(base, 'managed');
    mkdirSync(root, { mode: 0o700 });
    const config = join(base, 'config.json');
    writeFileSync(
      config,
      JSON.stringify({
        schemaVersion: 1,
        root,
        authorityId: 'runtime-one',
        epoch: 'epoch-one',
        providerId: 'provider-one',
        wbsOrigin: 'http://127.0.0.1:3100',
        credential: 'private-test-credential',
        diskUnitBytes: 1024,
        diskBudgetUnits: budget,
        workspaceSlots: budget,
        headroomBytes: 0,
      }),
      { mode: 0o600 },
    );
    return { base, root, config };
  }
  let now = 1800000000000;
  const clock = { read: () => (now += 1000) };
  const request = {
    projectId: 'project-one',
    resourceId: 'disk-one',
    workItemId: 'work-one',
    agentRun: 'run-one',
    responsiblePersonId: 'developer',
    units: 1,
    diskUnits: 1,
    kind: 'temporary_directory' as const,
  };

  test('disposable directory release atomically returns capacity and retains immutable outbox history', () => {
    const { config } = fixture(1);
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    const use = runtime.create(request);
    writeFileSync(join(use.locator, 'output'), 'disposable');
    expect(runtime.inspect(use.id).state).toBe('active');
    expect(() => runtime.create(request)).toThrow('capacity');
    runtime.requestCleanup(use.id, use.revision, use.incarnation, 'work ended');
    runtime.sweep();
    expect(runtime.inspect(use.id).reason).toBe('provider absence and file holds verified');
    expect(existsSync(use.locator)).toBe(false);
    expect(runtime.inspect(use.id).state).toBe('released');
    expect(runtime.inspect(use.id).releasedDiskUnits).toBe(1);
    expect(runtime.outbox().map((event) => event.kind)).toContain('release_verified');
    expect(runtime.create(request).id).not.toBe(use.id);
    runtime.close();
  });

  test('configuration is owner-only and serialization never exposes reporting credential', () => {
    const { config } = fixture();
    expect(JSON.stringify(loadResourceConfiguration(config))).not.toContain(
      'private-test-credential',
    );
    chmodSync(config, 0o644);
    expect(() => loadResourceConfiguration(config)).toThrow('owner-only');
    chmodSync(config, 0o600);
    writeFileSync(config, '{"credential":"private-test-credential"');
    expect(() => loadResourceConfiguration(config)).toThrow('configuration malformed');
  });

  test('reopening a ledger preserves held capacity and rejects a competing authority', () => {
    const { config } = fixture(1);
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    runtime.create(request);
    runtime.close();
    const reopened = ResourceRuntime.open(loadResourceConfiguration(config), clock);
    expect(() => reopened.create(request)).toThrow('capacity');
    reopened.close();
    const changed = JSON.parse(readFileSync(config, 'utf8')) as { authorityId: string };
    changed.authorityId = 'other';
    writeFileSync(config, JSON.stringify(changed));
    expect(() => ResourceRuntime.open(loadResourceConfiguration(config), clock)).toThrow('binding');
  });

  test('stale revision and incarnation cannot enqueue a new cleanup owner', () => {
    const { config } = fixture();
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    const use = runtime.create(request);
    expect(() =>
      runtime.requestCleanup(use.id, use.revision + 1, use.incarnation, 'stale'),
    ).toThrow('stale');
    expect(() => runtime.requestCleanup(use.id, use.revision, 'replaced', 'stale')).toThrow(
      'stale',
    );
    expect(runtime.inspect(use.id).state).toBe('active');
    runtime.close();
  });

  test('replacement directory and symlink escape remain untouched and charged', () => {
    for (const symlink of [false, true]) {
      const { config, base } = fixture(1);
      const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
      const use = runtime.create(request);
      const moved = join(base, 'original');
      renameSync(use.locator, moved);
      const outside = join(base, 'canary');
      mkdirSync(outside);
      writeFileSync(join(outside, 'keep'), 'source');
      if (symlink) symlinkSync(outside, use.locator);
      else {
        mkdirSync(use.locator);
        writeFileSync(join(use.locator, 'keep'), 'replacement');
      }
      runtime.requestCleanup(use.id, use.revision, use.incarnation, 'done');
      runtime.sweep();
      expect(runtime.inspect(use.id).reason).toContain('identity');
      expect(runtime.inspect(use.id).state).toBe('blocked');
      expect(readFileSync(join(outside, 'keep'), 'utf8')).toBe('source');
      expect(existsSync(use.locator)).toBe(true);
      expect(() => runtime.create(request)).toThrow('capacity');
      runtime.close();
    }
  });

  test('live writer holds block deletion until it exits', async () => {
    const { config } = fixture(1);
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    const use = runtime.create(request);
    const child = Bun.spawn(['/bin/sh', '-c', 'echo ready; exec sleep 30'], {
      cwd: use.locator,
      stdout: 'pipe',
    });
    await child.stdout.getReader().read();
    try {
      runtime.requestCleanup(use.id, use.revision, use.incarnation, 'done');
      runtime.sweep();
      expect(runtime.inspect(use.id).state).toBe('blocked');
      expect(runtime.inspect(use.id).reason).toContain('hold');
      expect(() => runtime.create(request)).toThrow('capacity');
    } finally {
      child.kill();
      await child.exited;
    }
    // The shell child has a separate sleep; stop it by using an exec in the fixture.
    runtime.sweep();
    expect(runtime.inspect(use.id).state).toBe('released');
    runtime.close();
  });

  test('dependency edges and symlink consumers block their producer', () => {
    const { config } = fixture(3);
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    const producer = runtime.create(request);
    const consumer = runtime.create({ ...request, dependencies: [producer.id] });
    runtime.requestCleanup(producer.id, producer.revision, producer.incarnation, 'done');
    runtime.sweep();
    expect(runtime.inspect(producer.id).reason).toContain('dependency');
    runtime.requestCleanup(consumer.id, consumer.revision, consumer.incarnation, 'done');
    runtime.sweep();
    runtime.sweep();
    expect(runtime.inspect(producer.id).state).toBe('released');
    runtime.close();
  });

  test('successful failed and cancelled commands persist outcomes and release their disposable output', async () => {
    const { config } = fixture();
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    for (const exit of [0, 7]) {
      const use = runtime.create(request);
      expect(
        await runtime.run(use.id, [
          '/bin/sh',
          '-c',
          `echo output > artifact; exit ${String(exit)}`,
        ]),
      ).toBe(exit);
      expect(runtime.inspect(use.id).outcome).toBe(exit === 0 ? 'succeeded' : 'failed');
      expect(runtime.inspect(use.id).state).toBe('released');
    }
    const use = runtime.create(request);
    const abort = new AbortController();
    const running = runtime.run(use.id, ['/bin/sleep', '30'], abort.signal);
    abort.abort();
    await running;
    expect(runtime.inspect(use.id).outcome).toBe('cancelled');
    expect(runtime.inspect(use.id).state).toBe('released');
    runtime.close();
  });

  function repository(base: string): string {
    const source = join(base, 'source');
    mkdirSync(source);
    for (const command of [
      ['init'],
      ['config', 'user.name', 'Fixture'],
      ['config', 'user.email', 'fixture@example.invalid'],
    ]) {
      expect(Bun.spawnSync(['git', '-C', source, ...command]).exitCode).toBe(0);
    }
    writeFileSync(join(source, 'canary'), 'durable source');
    expect(Bun.spawnSync(['git', '-C', source, 'add', '.']).exitCode).toBe(0);
    expect(Bun.spawnSync(['git', '-C', source, 'commit', '-m', 'fixture']).exitCode).toBe(0);
    return source;
  }

  test('clean Git worktrees preserve commits and dirty or ignored work is retained with owner', () => {
    const { config, base } = fixture(3);
    const source = repository(base);
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    const clean = runtime.create({ ...request, kind: 'git_worktree', source });
    runtime.requestCleanup(clean.id, clean.revision, clean.incarnation, 'done');
    runtime.sweep();
    expect(runtime.inspect(clean.id).state).toBe('released');
    expect(
      Bun.spawnSync(['git', '-C', source, 'rev-parse', `refs/dash-recovery/${clean.id}`]).exitCode,
    ).toBe(0);
    const dirty = runtime.create({ ...request, kind: 'git_worktree', source });
    writeFileSync(join(dirty.locator, 'unique'), 'keep me');
    runtime.requestCleanup(dirty.id, dirty.revision, dirty.incarnation, 'done');
    runtime.sweep();
    expect(runtime.inspect(dirty.id).state).toBe('retained');
    expect(runtime.inspect(dirty.id).request.responsiblePersonId).toBe('developer');
    expect(readFileSync(join(dirty.locator, 'unique'), 'utf8')).toBe('keep me');
    expect(readFileSync(join(source, 'canary'), 'utf8')).toBe('durable source');
    runtime.close();
  });

  test('a vanished resource without deletion intent stays charged rather than inventing a release', () => {
    const { config, base } = fixture(1);
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    const use = runtime.create(request);
    renameSync(use.locator, join(base, 'moved'));
    runtime.requestCleanup(use.id, use.revision, use.incarnation, 'done');
    runtime.sweep();
    expect(runtime.inspect(use.id).state).toBe('blocked');
    expect(runtime.inspect(use.id).reason).toContain('absence');
    runtime.close();
  });

  test('outbox retries response loss identically and persists cleanup cursor with intent', async () => {
    const { config } = fixture();
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    const use = runtime.create(request);
    const seen: string[] = [];
    let lose = true;
    const server = Bun.serve({
      port: 0,
      async fetch(http) {
        if (http.method === 'PUT') {
          const wire = await http.text();
          seen.push(wire);
          const event = resourceRuntimeEvent.assert(JSON.parse(wire));
          if (lose) {
            lose = false;
            return new Response('lost', { status: 503 });
          }
          return Response.json({
            acceptedSequence: event.sequence,
            useId: event.useId,
            revision: event.revision,
          });
        }
        return Response.json({
          requests: [
            {
              requestId: 1,
              useId: use.id,
              incarnation: use.incarnation,
              expectedRevision: use.revision,
              reason: 'operator request',
              at: clock.read(),
            },
          ],
          nextCursor: '1',
        });
      },
    });
    try {
      const sender = (http: Request) =>
        fetch(
          new Request(
            new URL(new URL(http.url).pathname + new URL(http.url).search, server.url),
            http,
          ),
        );
      let refused = false;
      try {
        await runtime.synchronize(sender);
      } catch (cause) {
        refused = true;
        expect(String(cause)).toContain('HTTP 503');
      }
      expect(refused).toBe(true);
      expect(runtime.outbox()).toHaveLength(1);
      await runtime.synchronize(sender);
      expect(seen[0]).toBe(seen[1]);
      expect(runtime.inspect(use.id).state).toBe('pending');
      expect(runtime.requestCursor()).toBe(1);
      runtime.sweep();
      await runtime.synchronize(sender);
      expect(runtime.outbox()).toHaveLength(0);
      expect(runtime.inspect(use.id).state).toBe('released');
      expect(JSON.stringify(seen)).not.toContain('private-test-credential');
    } finally {
      await server.stop(true);
      runtime.close();
    }
  });

  test('parent completion seals its manifest, cleans child copies, and fences late allocation', async () => {
    const { config } = fixture(3);
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    const parent = runtime.create(request);
    const child = runtime.create({ ...request, parentId: parent.id });
    await runtime.run(parent.id, ['/bin/true']);
    expect(runtime.inspect(parent.id).sealed).toBe(true);
    expect(runtime.inspect(child.id).state).toBe('released');
    expect(() => runtime.create({ ...request, parentId: parent.id })).toThrow('sealed');
    runtime.close();
  });

  test('crash after removal before settlement reconciles one release and never a replacement', () => {
    const { config, root } = fixture(1);
    let runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    const use = runtime.create(request);
    runtime.requestCleanup(use.id, use.revision, use.incarnation, 'done');
    runtime.close();
    const db = new Database(join(root, '.dash', 'resources.sqlite'));
    const row = db
      .query<{ snapshot: string }, [string]>('SELECT snapshot FROM uses WHERE id=?')
      .get(use.id)!;
    const interrupted = JSON.parse(row.snapshot) as ResourceUse;
    interrupted.deleteIntent = true;
    db.query('UPDATE uses SET snapshot=? WHERE id=?').run(JSON.stringify(interrupted), use.id);
    db.close();
    rmSync(use.locator, { recursive: true });
    runtime = ResourceRuntime.open(loadResourceConfiguration(config), clock);
    runtime.sweep();
    runtime.sweep();
    expect(runtime.inspect(use.id).state).toBe('released');
    expect(runtime.outbox().filter((event) => event.kind === 'release_verified')).toHaveLength(1);
    runtime.close();
  });

  test('shared hardlinks remain charged without claiming physical bytes reclaimed', () => {
    const { config, base } = fixture(1);
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    const use = runtime.create(request);
    const source = join(base, 'source-file');
    writeFileSync(source, 'shared');
    linkSync(source, join(use.locator, 'shared'));
    runtime.requestCleanup(use.id, use.revision, use.incarnation, 'done');
    runtime.sweep();
    expect(runtime.inspect(use.id).state).toBe('blocked');
    expect(readFileSync(source, 'utf8')).toBe('shared');
    expect(() => runtime.create(request)).toThrow('capacity');
    runtime.close();
  });

  test('missing trusted ledger is refused without silently creating empty capacity', () => {
    const { config, root } = fixture();
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    runtime.create(request);
    runtime.close();
    rmSync(join(root, '.dash', 'resources.sqlite'));
    expect(() => ResourceRuntime.open(loadResourceConfiguration(config), clock)).toThrow();
    expect(existsSync(join(root, '.dash', 'resources.sqlite'))).toBe(false);
  });

  test('CLI compound execution creates output, records failure, and physically cleans on exit', () => {
    const { config, root, base } = fixture();
    const creation = join(base, 'request.json');
    writeFileSync(creation, JSON.stringify(request));
    const entry = join(import.meta.dir, '..', 'entrypoint.ts');
    const init = Bun.spawnSync([process.execPath, entry, 'resources', 'init', '--config', config]);
    expect(init.exitCode).toBe(0);
    const run = Bun.spawnSync([
      process.execPath,
      entry,
      'resources',
      'exec',
      '--config',
      config,
      '--request',
      creation,
      '--',
      '/bin/sh',
      '-c',
      'echo proof > artifact; exit 7',
    ]);
    expect(run.stderr.toString()).toBe('');
    expect(run.exitCode).toBe(7);
    const runtime = ResourceRuntime.open(loadResourceConfiguration(config), clock);
    const use = runtime.list()[0];
    expect(use.outcome).toBe('failed');
    expect(use.state).toBe('released');
    expect(existsSync(use.locator)).toBe(false);
    expect(readdirSync(root)).toEqual(['.dash']);
    expect(run.stdout.toString()).not.toContain('private-test-credential');
    runtime.close();
  });

  test('concurrent processes serialize the final unit and dead creator cleanup survives restart', async () => {
    const { config, base } = fixture(1);
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    const requestPath = join(base, 'creation.json');
    writeFileSync(requestPath, JSON.stringify(request));
    const command = [
      process.execPath,
      join(import.meta.dir, 'testing-process.test.fixture.ts'),
      config,
      requestPath,
    ];
    const first = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe' });
    const second = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe' });
    const codes = await Promise.all([first.exited, second.exited]);
    expect(codes.sort()).toEqual([0, 2]);
    expect(runtime.list()).toHaveLength(1);
    expect(runtime.list()[0].state).toBe('active');
    now += 61000;
    runtime.sweep();
    expect(runtime.list()[0].state).toBe('released');
    expect(runtime.list()[0].outcome).toBe('lost');
    runtime.close();
  }, 60000);

  test('blocked cleanup uses a bounded retry budget and operator retry resets it', () => {
    const { config, base } = fixture(1);
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    const use = runtime.create(request);
    renameSync(use.locator, join(base, 'preserved'));
    runtime.requestCleanup(use.id, use.revision, use.incarnation, 'done');
    for (let attempt = 0; attempt < 8; attempt++) {
      now += 120000;
      runtime.sweep();
    }
    const blocked = runtime.inspect(use.id);
    expect(blocked.cleanupAttempts).toBe(6);
    expect(blocked.nextRetryAt).toBeNull();
    expect(blocked.reason).toContain('exhausted');
    runtime.requestCleanup(blocked.id, blocked.revision, blocked.incarnation, 'operator retry');
    expect(runtime.inspect(use.id).cleanupAttempts).toBe(0);
    runtime.close();
  });
  test('retention never creates removal evidence for a worktree moved outside the root', () => {
    const { config, base } = fixture(1);
    const source = repository(base);
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    const use = runtime.create({ ...request, kind: 'git_worktree', source });
    writeFileSync(join(use.locator, 'unique'), 'keep');
    runtime.requestCleanup(use.id, use.revision, use.incarnation, 'done');
    runtime.sweep();
    expect(runtime.inspect(use.id).deleteIntent).toBe(false);
    renameSync(use.locator, join(base, 'moved'));
    const retained = runtime.inspect(use.id);
    runtime.requestCleanup(use.id, retained.revision, use.incarnation, 'retry');
    runtime.sweep();
    expect(runtime.inspect(use.id).state).toBe('blocked');
    runtime.close();
  });
  test('surviving command-session children remain charged even after leaving the working directory', async () => {
    const { config } = fixture(1);
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    const use = runtime.create(request);
    await runtime.run(use.id, ['/bin/sh', '-c', '(cd /; sleep 1) >/dev/null 2>&1 & exit 0']);
    expect(runtime.inspect(use.id).state).toBe('blocked');
    expect(runtime.inspect(use.id).reason).toContain('command');
    await Bun.sleep(1100);
    now += 60000;
    runtime.sweep();
    expect(runtime.inspect(use.id).state).toBe('released');
    runtime.close();
  });
  test('corrupt trusted snapshots refuse instead of silently returning capacity', () => {
    const { config, root } = fixture(1);
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    const use = runtime.create(request);
    const db = new Database(join(root, '.dash', 'resources.sqlite'));
    db.query('UPDATE uses SET snapshot=? WHERE id=?').run(
      JSON.stringify({ id: use.id, state: 'released' }),
      use.id,
    );
    db.close();
    expect(() => runtime.inspect(use.id)).toThrow();
    runtime.close();
  });
  test('explicit generated directories are disposable while unknown ignored work remains retained', () => {
    const { config, base } = fixture(2);
    const source = repository(base);
    writeFileSync(join(source, '.gitignore'), 'node_modules/\nprivate/\n');
    expect(Bun.spawnSync(['git', '-C', source, 'add', '.gitignore']).exitCode).toBe(0);
    expect(Bun.spawnSync(['git', '-C', source, 'commit', '-m', 'ignore generated']).exitCode).toBe(
      0,
    );
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    const generated = runtime.create({
      ...request,
      kind: 'git_worktree',
      source,
      disposablePaths: ['node_modules'],
    });
    mkdirSync(join(generated.locator, 'node_modules'));
    writeFileSync(join(generated.locator, 'node_modules', 'generated'), 'reproducible');
    symlinkSync(source, join(generated.locator, 'node_modules', 'source-link'));
    runtime.requestCleanup(generated.id, generated.revision, generated.incarnation, 'done');
    runtime.sweep();
    expect(runtime.inspect(generated.id).state).toBe('released');
    expect(readFileSync(join(source, 'canary'), 'utf8')).toBe('durable source');
    const unknown = runtime.create({
      ...request,
      kind: 'git_worktree',
      source,
      disposablePaths: ['node_modules'],
    });
    mkdirSync(join(unknown.locator, 'private'));
    writeFileSync(join(unknown.locator, 'private', 'notes'), 'unique');
    runtime.requestCleanup(unknown.id, unknown.revision, unknown.incarnation, 'done');
    runtime.sweep();
    expect(runtime.inspect(unknown.id).state).toBe('retained');
    expect(readFileSync(join(unknown.locator, 'private', 'notes'), 'utf8')).toBe('unique');
    runtime.close();
  });
  test('generated policy refuses paths outside its checkout and preserves tracked content', () => {
    const { config, base } = fixture(1);
    const source = repository(base);
    mkdirSync(join(source, 'build'));
    writeFileSync(join(source, 'build', 'source'), 'tracked');
    expect(Bun.spawnSync(['git', '-C', source, 'add', '.']).exitCode).toBe(0);
    expect(Bun.spawnSync(['git', '-C', source, 'commit', '-m', 'tracked build']).exitCode).toBe(0);
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    for (const path of ['../source', '.git', '/tmp', '.'])
      expect(() =>
        runtime.create({ ...request, kind: 'git_worktree', source, disposablePaths: [path] }),
      ).toThrow();
    const use = runtime.create({
      ...request,
      kind: 'git_worktree',
      source,
      disposablePaths: ['build'],
    });
    runtime.requestCleanup(use.id, use.revision, use.incarnation, 'done');
    runtime.sweep();
    expect(runtime.inspect(use.id).state).toBe('blocked');
    expect(readFileSync(join(use.locator, 'build', 'source'), 'utf8')).toBe('tracked');
    runtime.close();
  });
  test('watch reconciliation stops a proven orphan command after its controller is killed', async () => {
    const { config, base } = fixture(1);
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    const requestPath = join(base, 'request.json');
    writeFileSync(requestPath, JSON.stringify(request));
    const controller = Bun.spawn(
      [
        process.execPath,
        join(import.meta.dir, 'testing-process.test.fixture.ts'),
        config,
        requestPath,
        'run',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const reader = controller.stdout.getReader();
    let output = '';
    while (!output.includes('running')) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error('fixture ended before its command started');
      output += new TextDecoder().decode(chunk.value);
    }
    controller.kill('SIGKILL');
    await controller.exited;
    runtime.sweep();
    await Bun.sleep(100);
    now += 60000;
    runtime.sweep();
    expect(runtime.list()[0].state).toBe('released');
    expect(runtime.list()[0].outcome).toBe('lost');
    runtime.close();
  }, 60000);
  test('effective symlink dependencies block their producer without following links during deletion', () => {
    const { config, base } = fixture(2);
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    const producer = runtime.create(request);
    const consumer = runtime.create(request);
    const alias = join(base, 'alias');
    symlinkSync(producer.locator, alias);
    symlinkSync(alias, join(consumer.locator, 'dependency'));
    runtime.requestCleanup(producer.id, producer.revision, producer.incarnation, 'done');
    runtime.sweep();
    expect(runtime.inspect(producer.id).reason).toContain('symlink dependency');
    runtime.requestCleanup(consumer.id, consumer.revision, consumer.incarnation, 'done');
    runtime.sweep();
    now += 60000;
    runtime.sweep();
    expect(runtime.inspect(producer.id).state).toBe('released');
    runtime.close();
  });
  test('managed command launch gate preserves the caller stdin', () => {
    const { config, base } = fixture(1);
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock);
    const requestPath = join(base, 'request.json');
    writeFileSync(requestPath, JSON.stringify(request));
    const execution = Bun.spawnSync(
      [
        process.execPath,
        join(import.meta.dir, 'testing-process.test.fixture.ts'),
        config,
        requestPath,
        'stdin',
      ],
      { stdin: Buffer.from('expected\n'), stdout: 'pipe', stderr: 'pipe' },
    );
    expect(execution.exitCode).toBe(0);
    expect(runtime.list()[0].outcome).toBe('succeeded');
    expect(runtime.list()[0].state).toBe('released');
    runtime.close();
  }, 60000);
}
