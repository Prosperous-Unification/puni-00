import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import { runObservationService } from './observation-service';
import { initializeObservationState, migrateObservationRecoveryState } from './observation-state';

const scratch: string[] = [];
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

function fixture(): {
  readonly configurationPath: string;
  readonly stateDirectory: string;
  readonly service: Record<string, unknown>;
} {
  const root = mkdtempSync(join(tmpdir(), 'activation-observation-service-'));
  chmodSync(root, 0o700);
  scratch.push(root);
  const stateDirectory = join(root, 'state');
  const configurationDirectory = join(root, 'config');
  mkdirSync(stateDirectory, { mode: 0o700 });
  mkdirSync(configurationDirectory, { mode: 0o700 });
  const bootstrapPath = join(configurationDirectory, 'bootstrap.json');
  const bootstrapBytes = serializeCanonical({
    schemaVersion: 1,
    authorityGeneration: 3,
    reviewer: {
      kind: 'external-audit-provider',
      providerId: 'review.provider',
      executorId: 'review.executor',
      protocolIdentity: 'a'.repeat(64),
      promptIdentity: 'b'.repeat(64),
    },
    journal: {
      kind: 'authenticated-external-journal',
      verifierId: 'journal.verifier',
      issuerId: 'journal.issuer',
      endpoint: 'https://journal.example.invalid/v1',
    },
    publisher: {
      kind: 'immutable-external-store',
      issuerId: 'publisher.issuer',
      endpoint: 'https://store.example.invalid/activations',
    },
    admission: { requiredWorkflow: '.github/workflows/trusted-wiki.yml', protectedBranch: 'main' },
  });
  writeFileSync(bootstrapPath, bootstrapBytes, { mode: 0o600 });
  const service = {
    schemaVersion: 1,
    stateDirectory,
    bootstrapPath,
    pin: {
      identity: hashBytes(bootstrapBytes),
      journalIssuerId: 'journal.issuer',
      publisherIssuerId: 'publisher.issuer',
    },
    binding: {
      repositoryId: 8241,
      owner: 'Prosperous-Unification',
      name: 'puni-00',
      targetRef: 'refs/heads/main',
      policyIdentity: '3'.repeat(64),
      mappingIdentity: '4'.repeat(64),
      toolkitIdentity: '5'.repeat(64),
      readDeadlineMs: 1000,
    },
    policy: {
      maxAttempts: 2,
      wholeTickMs: 500,
      maxSubjects: 100,
      initialDelayMs: 100,
      maxDelayMs: 400,
      fallbackDelayMs: 200,
      recoveryProbeMs: 1000,
      horizonMs: 5000,
    },
    cleanupMs: 100,
    credentialPath: null,
  };
  const configurationPath = join(configurationDirectory, 'service.json');
  writeFileSync(configurationPath, serializeCanonical(service), { mode: 0o600 });
  return { configurationPath, stateDirectory, service };
}

function saveConfiguration(source: ReturnType<typeof fixture>): void {
  writeFileSync(source.configurationPath, serializeCanonical(source.service), { mode: 0o600 });
}

test('executable observation service preserves deferred exit without provider work', async () => {
  const source = fixture();
  const state = {
    ...source.service,
    clock: Date.now,
  } as Parameters<typeof initializeObservationState>[0];
  await initializeObservationState(state);
  await migrateObservationRecoveryState(state);
  const database = new Database(join(source.stateDirectory, 'activation.sqlite'), {
    create: false,
    strict: true,
  });
  try {
    database
      .query('UPDATE activation_observation_recovery SET next_attempt_at=?')
      .run(Date.now() + 60_000);
  } finally {
    database.close();
  }
  const child = Bun.spawn(
    [
      'bun',
      '--no-env-file',
      join(import.meta.dir, 'observation-service-cli.ts'),
      source.configurationPath,
    ],
    { cwd: source.stateDirectory, stdout: 'pipe', stderr: 'pipe' },
  );
  const exitCode = await child.exited;
  expect(exitCode).toBe(75);
  expect(await new Response(child.stderr).text()).toBe('');
});

test('executable observation service propagates refusal and bounded diagnostic', async () => {
  const source = fixture();
  rmSync(source.configurationPath);
  const child = Bun.spawn(
    [
      'bun',
      '--no-env-file',
      join(import.meta.dir, 'observation-service-cli.ts'),
      source.configurationPath,
    ],
    { cwd: source.stateDirectory, stdout: 'pipe', stderr: 'pipe' },
  );
  expect(await child.exited).toBe(1);
  const diagnostic = await new Response(child.stderr).text();
  expect(diagnostic).toContain('service-config-invalid');
  expect(diagnostic).not.toContain(source.configurationPath);
});

test('service refuses absent, overly permissive, and malformed protected configuration', async () => {
  const source = fixture();
  let fetches = 0;
  const diagnostics: unknown[] = [];
  const options = {
    fetcher: () => {
      fetches += 1;
      return Promise.resolve(new Response('[]'));
    },
    reportDiagnostic: (diagnostic: unknown) => {
      diagnostics.push(diagnostic);
    },
  };
  rmSync(source.configurationPath);
  expect(await runObservationService(source.configurationPath, options)).toBe(1);
  saveConfiguration(source);
  chmodSync(source.configurationPath, 0o644);
  expect(await runObservationService(source.configurationPath, options)).toBe(1);
  chmodSync(source.configurationPath, 0o600);
  writeFileSync(source.configurationPath, '{bad json');
  expect(await runObservationService(source.configurationPath, options)).toBe(1);
  expect(fetches).toBe(0);
  expect(diagnostics).toEqual(
    Array.from({ length: 3 }, () => ({
      kind: 'observation-service-failure',
      code: 'service-config-invalid',
      action: 'inspect protected observation service configuration',
    })),
  );
});

test('service distinguishes actual EACCES on protected configuration', async () => {
  const source = fixture();
  expect(process.getuid?.()).not.toBe(0);
  chmodSync(source.configurationPath, 0o000);
  try {
    openSync(source.configurationPath, 'r');
    throw new Error('expected protected configuration to be unreadable');
  } catch (error) {
    expect((error as NodeJS.ErrnoException).code).toBe('EACCES');
  }
  const diagnostics: unknown[] = [];
  expect(
    await runObservationService(source.configurationPath, {
      reportDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic);
      },
    }),
  ).toBe(1);
  expect(diagnostics).toEqual([
    {
      kind: 'observation-service-failure',
      code: 'service-config-invalid',
      action: 'inspect protected observation service configuration',
    },
  ]);
});

test('service refuses a replaceable trusted ancestor before controller work', async () => {
  const source = fixture();
  chmodSync(dirname(source.configurationPath), 0o777);
  const diagnostics: unknown[] = [];
  expect(
    await runObservationService(source.configurationPath, {
      reportDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic);
      },
    }),
  ).toBe(1);
  expect(diagnostics).toEqual([
    {
      kind: 'observation-service-failure',
      code: 'service-config-invalid',
      action: 'inspect protected observation service configuration',
    },
  ]);
});

test('service refuses a foreign-owned ancestor independently of file ownership', () => {
  const source = fixture();
  const child = Bun.spawnSync([
    'bun',
    '--no-env-file',
    join(import.meta.dir, 'observation-service.fs-fixture.ts'),
    source.configurationPath,
    dirname(source.configurationPath),
    'ancestor-owner',
  ]);
  expect(child.exitCode).toBe(0);
  const observed = JSON.parse(new TextDecoder().decode(child.stdout)) as {
    code: number;
    diagnostics: unknown[];
  };
  expect(observed.code).toBe(1);
  expect(observed.diagnostics).toEqual([
    {
      kind: 'observation-service-failure',
      code: 'service-config-invalid',
      action: 'inspect protected observation service configuration',
    },
  ]);
});

test('service refuses a foreign-owned config leaf with trusted root-owned ancestors', () => {
  const source = fixture();
  const directPath = join(
    tmpdir(),
    `observation-foreign-leaf-${String(process.pid)}-${String(Date.now())}.json`,
  );
  scratch.push(directPath);
  writeFileSync(directPath, serializeCanonical(source.service), { mode: 0o600 });
  const child = Bun.spawnSync([
    'bun',
    '--no-env-file',
    join(import.meta.dir, 'observation-service.fs-fixture.ts'),
    directPath,
    directPath,
    'leaf-owner',
  ]);
  expect(child.exitCode).toBe(0);
  const observed = JSON.parse(new TextDecoder().decode(child.stdout)) as {
    code: number;
    diagnostics: unknown[];
  };
  expect(observed.code).toBe(1);
  expect(observed.diagnostics).toEqual([
    {
      kind: 'observation-service-failure',
      code: 'service-config-invalid',
      action: 'inspect protected observation service configuration',
    },
  ]);
});

test('service refuses multiply linked protected config leaf', async () => {
  const source = fixture();
  linkSync(source.configurationPath, join(dirname(source.configurationPath), 'second-link.json'));
  const diagnostics: unknown[] = [];
  expect(
    await runObservationService(source.configurationPath, {
      reportDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic);
      },
    }),
  ).toBe(1);
  expect(diagnostics).toEqual([
    {
      kind: 'observation-service-failure',
      code: 'service-config-invalid',
      action: 'inspect protected observation service configuration',
    },
  ]);
});

test('service refuses oversized protected configuration before provider work', async () => {
  const source = fixture();
  const binding = source.service['binding'] as { owner: string };
  const baselineBytes = serializeCanonical(source.service);
  binding.owner = 'x'.repeat(
    16 * 1024 + 1 - (Buffer.byteLength(baselineBytes) - binding.owner.length),
  );
  saveConfiguration(source);
  expect(Buffer.byteLength(serializeCanonical(source.service))).toBe(16 * 1024 + 1);
  let fetches = 0;
  const diagnostics: unknown[] = [];
  expect(
    await runObservationService(source.configurationPath, {
      fetcher: () => {
        fetches += 1;
        return Promise.resolve(new Response('[]'));
      },
      reportDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic);
      },
    }),
  ).toBe(1);
  expect(fetches).toBe(0);
  expect(diagnostics).toEqual([
    {
      kind: 'observation-service-failure',
      code: 'service-config-invalid',
      action: 'inspect protected observation service configuration',
    },
  ]);
});

test('service rejects valid noncanonical configuration and changed bootstrap pin before GET', async () => {
  const source = fixture();
  let fetches = 0;
  const diagnostics: unknown[] = [];
  const options = {
    fetcher: () => {
      fetches += 1;
      return Promise.resolve(new Response('[]'));
    },
    reportDiagnostic: (diagnostic: unknown) => {
      diagnostics.push(diagnostic);
    },
  };
  writeFileSync(source.configurationPath, JSON.stringify(source.service, null, 2), { mode: 0o600 });
  expect(await runObservationService(source.configurationPath, options)).toBe(1);
  expect(diagnostics.at(-1)).toEqual({
    kind: 'observation-service-failure',
    code: 'service-config-invalid',
    action: 'inspect protected observation service configuration',
  });
  saveConfiguration(source);
  const pin = source.service['pin'] as { identity: string };
  pin.identity = 'f'.repeat(64);
  saveConfiguration(source);
  expect(await runObservationService(source.configurationPath, options)).toBe(1);
  expect(fetches).toBe(0);
  expect(diagnostics.at(-1)).toEqual({
    kind: 'observation-service-failure',
    code: 'service-config-invalid',
    action: 'inspect protected observation service configuration',
  });
});

test('service never creates or migrates an absent administrator-owned state database', async () => {
  const source = fixture();
  let fetches = 0;
  const diagnostics: unknown[] = [];
  expect(
    await runObservationService(source.configurationPath, {
      fetcher: () => {
        fetches += 1;
        return Promise.resolve(new Response('[]'));
      },
      reportDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic);
      },
    }),
  ).toBe(1);
  expect(fetches).toBe(0);
  expect(existsSync(join(source.stateDirectory, 'activation.sqlite'))).toBe(false);
  expect(diagnostics).toHaveLength(1);
});

test('service accepts only explicit credential file and ignores ambient token', async () => {
  const source = fixture();
  const state = { ...source.service, clock: Date.now } as Parameters<
    typeof initializeObservationState
  >[0];
  await initializeObservationState(state);
  await migrateObservationRecoveryState(state);
  const headers: Headers[] = [];
  const fetcher = (_url: string, init: RequestInit) => {
    headers.push(new Headers(init.headers));
    return Promise.resolve(new Response('[]', { status: 200 }));
  };
  const original = process.env['GITHUB_TOKEN'];
  process.env['GITHUB_TOKEN'] = 'harmless-ambient-sentinel';
  try {
    expect(await runObservationService(source.configurationPath, { fetcher })).toBe(0);
    expect(headers.at(-1)?.has('authorization')).toBe(false);
    const credentialPath = join(dirname(source.configurationPath), 'github-token');
    writeFileSync(credentialPath, 'github_pat_explicit_sentinel', { mode: 0o600 });
    source.service['credentialPath'] = credentialPath;
    saveConfiguration(source);
    expect(await runObservationService(source.configurationPath, { fetcher })).toBe(0);
    expect(headers.at(-1)?.get('authorization')).toBe('Bearer github_pat_explicit_sentinel');
    expect(headers.at(-1)?.get('authorization')).not.toContain('ambient');
  } finally {
    if (original === undefined) delete process.env['GITHUB_TOKEN'];
    else process.env['GITHUB_TOKEN'] = original;
  }
});

test('service rejects symlinked credential without provider read or token diagnostic', async () => {
  const source = fixture();
  const state = { ...source.service, clock: Date.now } as Parameters<
    typeof initializeObservationState
  >[0];
  await initializeObservationState(state);
  await migrateObservationRecoveryState(state);
  const target = join(dirname(source.configurationPath), 'private-token');
  const link = join(dirname(source.configurationPath), 'link-token');
  writeFileSync(target, 'github_pat_harmless_sentinel', { mode: 0o600 });
  symlinkSync(target, link);
  source.service['credentialPath'] = link;
  saveConfiguration(source);
  let fetches = 0;
  const diagnostics: unknown[] = [];
  expect(
    await runObservationService(source.configurationPath, {
      fetcher: () => {
        fetches += 1;
        return Promise.resolve(new Response('[]'));
      },
      reportDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic);
      },
    }),
  ).toBe(1);
  expect(fetches).toBe(0);
  expect(JSON.stringify(diagnostics)).not.toContain('github_pat_harmless_sentinel');
  expect(diagnostics).toEqual([
    {
      kind: 'observation-service-failure',
      code: 'service-config-invalid',
      action: 'inspect protected observation service configuration',
    },
  ]);
});

test('service refuses malformed explicit token before any provider read', async () => {
  const source = fixture();
  const state = { ...source.service, clock: Date.now } as Parameters<
    typeof initializeObservationState
  >[0];
  await initializeObservationState(state);
  await migrateObservationRecoveryState(state);
  const path = join(dirname(source.configurationPath), 'malformed-token');
  writeFileSync(path, 'token with space', { mode: 0o600 });
  source.service['credentialPath'] = path;
  saveConfiguration(source);
  let fetches = 0;
  const diagnostics: unknown[] = [];
  expect(
    await runObservationService(source.configurationPath, {
      fetcher: () => {
        fetches += 1;
        return Promise.resolve(new Response('[]'));
      },
      reportDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic);
      },
    }),
  ).toBe(1);
  expect(fetches).toBe(0);
  expect(diagnostics).toEqual([
    {
      kind: 'observation-service-failure',
      code: 'service-config-invalid',
      action: 'inspect protected observation service configuration',
    },
  ]);
});

test('service refuses a credential FIFO promptly rather than blocking its tick', async () => {
  const source = fixture();
  const fifoPath = join(dirname(source.configurationPath), 'credential-fifo');
  const created = Bun.spawnSync(['mkfifo', fifoPath]);
  expect(created.exitCode).toBe(0);
  source.service['credentialPath'] = fifoPath;
  saveConfiguration(source);
  const child = Bun.spawn(
    [
      'bun',
      '--no-env-file',
      join(import.meta.dir, 'observation-service-cli.ts'),
      source.configurationPath,
    ],
    { cwd: source.stateDirectory, stdout: 'pipe', stderr: 'pipe' },
  );
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const exit = await Promise.race([
    child.exited,
    new Promise<'timeout'>((resolve) => {
      timeout = setTimeout(() => {
        resolve('timeout');
      }, 2000);
    }),
  ]);
  if (timeout !== undefined) clearTimeout(timeout);
  if (exit === 'timeout') child.kill();
  expect(exit).toBe(1);
});

test('service refuses a bootstrap FIFO before its tick can hang', async () => {
  const source = fixture();
  const bootstrapPath = source.service['bootstrapPath'] as string;
  rmSync(bootstrapPath);
  const created = Bun.spawnSync(['mkfifo', bootstrapPath]);
  expect(created.exitCode).toBe(0);
  const child = Bun.spawn(
    [
      'bun',
      '--no-env-file',
      join(import.meta.dir, 'observation-service-cli.ts'),
      source.configurationPath,
    ],
    { cwd: source.stateDirectory, stdout: 'pipe', stderr: 'pipe' },
  );
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const exit = await Promise.race([
    child.exited,
    new Promise<'timeout'>((resolve) => {
      timeout = setTimeout(() => {
        resolve('timeout');
      }, 2000);
    }),
  ]);
  if (timeout !== undefined) clearTimeout(timeout);
  if (exit === 'timeout') child.kill();
  expect(exit).toBe(1);
});
