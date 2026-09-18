import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { parse as parseYaml } from 'yaml';

import {
  auditReview,
  candidateIdentityAt,
  createRelocationCandidate,
  disposeRelocationFixtures,
  type RelocationFixture,
  write,
} from '../policy/relocation-fixtures';

const workspace = resolve(import.meta.dir, '../../../../..');
const bootstrapSource = join(workspace, 'infra/ci/bureaucrat');
const trustedWorkflow = join(workspace, '.github/workflows/trusted-wiki.yml');
const compatibilityRoute = join(workspace, 'bin/tool-wiki-package-lint.sh');
const packedTarball = join(
  workspace,
  'dist/twilight-bureaucrat-pack/twilight-bureaucrat-0.1.0.tgz',
);
const scratchRoots: string[] = [];

function scratch(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  scratchRoots.push(root);
  return root;
}

interface Invocation {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Async so the in-process registries below can answer the package manager it spawns. */
async function run(argv: string[], cwd: string, env: Record<string, string>): Promise<Invocation> {
  const child = Bun.spawn(argv, { cwd, env, stderr: 'pipe', stdout: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
}

/** Only HOME and PATH, plus the pinned Volta location Nx needs to launch Node for checks. */
function plainEnvironment(home: string): Record<string, string> {
  const volta = process.env['VOLTA_HOME'];
  return {
    HOME: home,
    PATH: process.env['PATH'] ?? '',
    ...(volta === undefined ? {} : { VOLTA_HOME: volta }),
  };
}

interface Registry {
  url: string;
  integrity: string;
  requests: string[];
  stop: () => void;
}

/** A minimal npm registry serving one tarball as `twilight-bureaucrat@0.1.0`. */
function serveRegistry(tarball: string): Registry {
  const bytes = readFileSync(tarball);
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  const requests: string[] = [];
  const tarballPath = '/twilight-bureaucrat/-/twilight-bureaucrat-0.1.0.tgz';
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request): Response {
      const path = new URL(request.url).pathname;
      requests.push(path);
      if (path === '/twilight-bureaucrat') {
        return Response.json({
          name: 'twilight-bureaucrat',
          'dist-tags': { latest: '0.1.0' },
          versions: {
            '0.1.0': {
              name: 'twilight-bureaucrat',
              version: '0.1.0',
              bin: { 'twilight-bureaucrat': 'dist/bin.mjs' },
              dist: {
                tarball: new URL(tarballPath, request.url).href,
                integrity,
                shasum: createHash('sha1').update(bytes).digest('hex'),
              },
            },
          },
        });
      }
      if (path === tarballPath) return new Response(bytes);
      return new Response('not found', { status: 404 });
    },
  });
  return { url: server.url.href, integrity, requests, stop: () => void server.stop(true) };
}

/** The post-publication pin step: resolve the base-owned manifest into a lock, nothing more. */
async function pinLock(directory: string, registry: string): Promise<void> {
  const home = scratch('twilight-bureaucrat-pin-home-');
  const pinned = await run(
    ['bun', 'install', '--lockfile-only', '--registry', registry],
    directory,
    plainEnvironment(home),
  );
  expect(pinned.exitCode, pinned.stderr).toBe(0);
}

interface WorkflowStep {
  name?: string;
  run?: string;
  env?: Record<string, string>;
}

function workflowSteps(): WorkflowStep[] {
  // The repository's YAML parser owns this shape; each claimed field is checked before use.
  const workflow = parseYaml(readFileSync(trustedWorkflow, 'utf8')) as {
    jobs?: { lint?: { steps?: WorkflowStep[] } };
  };
  const steps = workflow.jobs?.lint?.steps;
  if (steps === undefined) throw new Error('trusted-wiki has no lint job steps');
  return steps;
}

function workflowStep(name: string): WorkflowStep & { run: string } {
  const step = workflowSteps().find((candidate) => candidate.name === name);
  if (step?.run === undefined) throw new Error(`trusted-wiki step is missing: ${name}`);
  return { ...step, run: step.run };
}

/** One simulated runner: its workspace, temp directory and accumulated step outputs. */
interface Runner {
  workspace: string;
  temporary: string;
  outputs: Map<string, string>;
}

function createRunner(): Runner {
  const root = scratch('twilight-bureaucrat-runner-');
  const runner = {
    workspace: join(root, 'workspace'),
    temporary: join(root, 'runner-temp'),
    outputs: new Map<string, string>(),
  };
  mkdirSync(runner.workspace);
  mkdirSync(runner.temporary);
  return runner;
}

/**
 * Executes one production run block from `trusted-wiki.yml` the way the runner does: bash from
 * the workspace, the step's own `env:` with its expressions resolved, and `$GITHUB_OUTPUT`
 * collected afterwards. `inherited` is the process environment a hostile runner could carry.
 */
async function runWorkflowStep(
  runner: Runner,
  name: string,
  expressions: Record<string, string>,
  inherited: Record<string, string>,
): Promise<Invocation> {
  const step = workflowStep(name);
  const outputFile = join(runner.temporary, `output-${String(runner.outputs.size)}-${name}`);
  writeFileSync(outputFile, '');
  const stepEnvironment: Record<string, string> = {};
  for (const [key, value] of Object.entries(step.env ?? {})) {
    const expression = /^\$\{\{ (.+) \}\}$/.exec(value)?.[1];
    if (expression === undefined) {
      stepEnvironment[key] = value;
      continue;
    }
    const outputReference = /^steps\.bootstrap\.outputs\.(\w+)$/.exec(expression)?.[1];
    if (outputReference !== undefined) {
      // GitHub renders an output the step never wrote as the empty string.
      stepEnvironment[key] = runner.outputs.get(outputReference) ?? '';
    } else if (Object.hasOwn(expressions, expression)) {
      stepEnvironment[key] = expressions[expression];
    } else {
      throw new Error(`unresolved workflow expression: ${expression}`);
    }
  }
  const invocation = await run(['bash', '-e', '-c', step.run], runner.workspace, {
    ...inherited,
    ...plainEnvironment(join(runner.temporary, 'home')),
    GITHUB_OUTPUT: outputFile,
    GITHUB_WORKSPACE: runner.workspace,
    RUNNER_TEMP: runner.temporary,
    ...stepEnvironment,
  });
  for (const line of readFileSync(outputFile, 'utf8').split('\n')) {
    const separator = line.indexOf('=');
    if (separator > 0) runner.outputs.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return invocation;
}

/** Simulates the sparse base checkout: the bootstrap directory as the base commit carries it. */
function checkOutBase(runner: Runner, lock: string | undefined, consumer: object): string {
  const directory = join(runner.workspace, 'trusted-base/infra/ci/bureaucrat');
  mkdirSync(directory, { recursive: true });
  for (const name of ['bootstrap.sh', 'admit.sh', 'package.json'] as const) {
    cpSync(join(bootstrapSource, name), join(directory, name));
  }
  writeFileSync(join(directory, 'consumer.json'), `${JSON.stringify(consumer)}\n`);
  if (lock !== undefined) cpSync(lock, join(directory, 'bun.lock'));
  return directory;
}

function preparationArguments(fixture: RelocationFixture, out: string): string[] {
  const strata = join(out, 'audit-strata.json');
  write(
    strata,
    `${JSON.stringify({
      strata: [
        { stratumId: 'risk.public-admission', sampleRateBps: 10000, disagreementTriggerBps: 10000 },
      ],
      obligations: { 'review.fixture.module': 'risk.public-admission' },
    })}\n`,
  );
  const review = join(out, 'review.json');
  write(
    review,
    `${JSON.stringify(
      auditReview(
        'review.fixture.module',
        fixture.candidateRevision,
        candidateIdentityAt(fixture.repository, fixture.candidateRevision),
      ),
    )}\n`,
  );
  return [
    'prepare-activation',
    '--candidate-repository',
    fixture.repository,
    '--candidate-sha',
    fixture.candidateRevision,
    '--candidate-policy',
    'docs/wiki-policy/policy.json',
    '--candidate-mapping',
    'docs/wiki-policy/modules.json',
    '--review-record',
    review,
    '--audit-strata',
    strata,
    '--destination',
    join(out, 'activation'),
    '--work',
    join(out, 'work'),
    '--resource-lane',
    'lane.consumer-bootstrap',
    '--cwd-identity',
    'cwd.consumer-bootstrap',
  ];
}

async function git(repository: string, ...argv: string[]): Promise<string> {
  const invocation = await run(['git', '-C', repository, ...argv], repository, {
    ...plainEnvironment(repository),
    GIT_AUTHOR_NAME: 'Candidate',
    GIT_AUTHOR_EMAIL: 'candidate@example.test',
    GIT_COMMITTER_NAME: 'Candidate',
    GIT_COMMITTER_EMAIL: 'candidate@example.test',
  });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr);
  return invocation.stdout.trim();
}

/** Packs a same-name, same-version package whose every entrypoint writes a sentinel. */
async function packHostileTarball(sentinels: string): Promise<string> {
  const source = scratch('twilight-bureaucrat-hostile-source-');
  const touch = (name: string) =>
    `bun -e 'await Bun.write(${JSON.stringify(join(sentinels, name))}, "ran")'`;
  write(
    join(source, 'package.json'),
    `${JSON.stringify({
      name: 'twilight-bureaucrat',
      version: '0.1.0',
      bin: { 'twilight-bureaucrat': 'dist/bin.mjs' },
      scripts: {
        preinstall: touch('hostile-package-preinstall'),
        postinstall: touch('hostile-package-postinstall'),
      },
    })}\n`,
  );
  write(
    join(source, 'dist/bin.mjs'),
    `await Bun.write(${JSON.stringify(join(sentinels, 'hostile-package-executable'))}, "ran");\n`,
  );
  const destination = scratch('twilight-bureaucrat-hostile-pack-');
  const packed = await run(
    ['bun', 'pm', 'pack', '--destination', destination],
    source,
    plainEnvironment(source),
  );
  expect(packed.exitCode, packed.stderr).toBe(0);
  return join(destination, 'twilight-bureaucrat-0.1.0.tgz');
}

let registry: Registry;
let hostileRegistry: Registry;
let baseLock: string;
let hostileLock: string;
let hostileTarball: string;
let sentinels: string;
let fixture: RelocationFixture;
let activationRoot: string;
let hostileInheritance: Record<string, string>;

beforeAll(async () => {
  if (!existsSync(packedTarball)) throw new Error(`packed tarball is absent: ${packedTarball}`);
  sentinels = scratch('twilight-bureaucrat-sentinels-');
  registry = serveRegistry(packedTarball);
  hostileTarball = await packHostileTarball(sentinels);
  hostileRegistry = serveRegistry(hostileTarball);

  const pinned = scratch('twilight-bureaucrat-base-pin-');
  cpSync(join(bootstrapSource, 'package.json'), join(pinned, 'package.json'));
  await pinLock(pinned, registry.url);
  baseLock = join(pinned, 'bun.lock');
  const hostilePin = scratch('twilight-bureaucrat-hostile-pin-');
  write(
    join(hostilePin, 'package.json'),
    `${JSON.stringify({ name: 'hostile', private: true, dependencies: { 'twilight-bureaucrat': '0.1.0' } })}\n`,
  );
  await pinLock(hostilePin, hostileRegistry.url);
  hostileLock = join(hostilePin, 'bun.lock');

  const preload = join(sentinels, '..', `${String(process.pid)}-hostile-preload.ts`);
  scratchRoots.push(preload);
  writeFileSync(
    preload,
    `await Bun.write(${JSON.stringify(join(sentinels, 'inherited-bun-options'))}, "ran");\n`,
  );
  hostileInheritance = {
    BUN_CONFIG_REGISTRY: hostileRegistry.url,
    BUN_OPTIONS: `--preload=${preload}`,
    NPM_CONFIG_REGISTRY: hostileRegistry.url,
    npm_config_registry: hostileRegistry.url,
  };

  // A real certified activation, prepared by the installed package from real review evidence
  // fixtures for exactly one revision, as an operator would before selecting it.
  const runner = createRunner();
  checkOutBase(runner, baseLock, {
    schemaVersion: 1,
    admission: 'installed-package',
    registry: registry.url,
  });
  const bootstrap = await runWorkflowStep(runner, 'Bootstrap trusted package', {}, {});
  expect(bootstrap.exitCode, bootstrap.stderr).toBe(0);
  fixture = createRelocationCandidate({ materializeModules: true });
  const out = scratch('twilight-bureaucrat-consumer-activation-');
  const prepared = await run(
    [
      'bun',
      join(
        runner.temporary,
        'twilight-bureaucrat/consumer/node_modules/twilight-bureaucrat/dist/bin.mjs',
      ),
      ...preparationArguments(fixture, out),
    ],
    out,
    plainEnvironment(out),
  );
  expect(prepared.exitCode, `${prepared.stdout}${prepared.stderr}`).toBe(0);
  activationRoot = join(out, 'activation');
}, 600_000);

afterAll(() => {
  registry.stop();
  hostileRegistry.stop();
  disposeRelocationFixtures();
  for (const root of scratchRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function installedConsumer(runner: Runner): string {
  return join(runner.temporary, 'twilight-bureaucrat/consumer');
}

function lockIntegrity(consumer: string): string {
  // Bun owns this lock format; the one claimed entry is compared, never trusted.
  const lock = Bun.JSONC.parse(readFileSync(join(consumer, 'bun.lock'), 'utf8')) as {
    packages: Record<string, unknown[] | undefined>;
  };
  return String(lock.packages['twilight-bureaucrat']?.[3]);
}

/** Candidate checkout: a clone of the certified fixture, optionally with one hostile commit. */
async function checkOutCandidate(
  runner: Runner,
  mutate?: (candidate: string) => void,
): Promise<string> {
  const candidate = join(runner.workspace, 'candidate');
  await git(runner.workspace, 'clone', '--quiet', '--no-checkout', fixture.repository, candidate);
  await git(candidate, 'checkout', '--quiet', fixture.candidateRevision);
  if (mutate === undefined) return fixture.candidateRevision;
  mutate(candidate);
  await git(candidate, 'add', '--all', '--force');
  await git(candidate, 'commit', '--quiet', '--no-verify', '--message', 'hostile candidate');
  return git(candidate, 'rev-parse', 'HEAD');
}

/** Candidate-controlled install inputs, also dropped at the runner workspace root. */
function writeHostileInstallInputs(root: string, label: string): void {
  const touch = (name: string) =>
    `bun -e 'await Bun.write(${JSON.stringify(join(sentinels, `${label}-${name}`))}, "ran")'`;
  write(
    join(root, 'package.json'),
    `${JSON.stringify({
      name: 'hostile',
      private: true,
      dependencies: { 'twilight-bureaucrat': '0.1.0' },
      trustedDependencies: ['twilight-bureaucrat'],
      scripts: { preinstall: touch('preinstall'), postinstall: touch('postinstall') },
    })}\n`,
  );
  cpSync(hostileLock, join(root, 'bun.lock'));
  write(join(root, '.npmrc'), `registry=${hostileRegistry.url}\n`);
  write(
    join(root, `${label}-preload.ts`),
    `await Bun.write(${JSON.stringify(join(sentinels, `${label}-bunfig-preload`))}, "ran");\n`,
  );
  write(
    join(root, 'bunfig.toml'),
    `preload = ["./${label}-preload.ts"]\n\n[install]\nregistry = "${hostileRegistry.url}"\n`,
  );
}

/**
 * Label, mutation, and the trusted validator's refusal. Every refusal is the reviewed validator
 * classifying committed candidate paths as data; none reads candidate configuration as config.
 */
type HostileCase = readonly [string, (candidate: string) => void, string];

const hostileCases: readonly HostileCase[] = [
  [
    'package pin',
    (candidate) => {
      cpSync(hostileTarball, join(candidate, 'hostile.tgz'));
      write(
        join(candidate, 'package.json'),
        `${JSON.stringify({
          name: 'relocation-fixture',
          private: true,
          devDependencies: { 'twilight-bureaucrat': 'file:./hostile.tgz' },
        })}\n`,
      );
    },
    'undeclared binary content at hostile.tgz',
  ],
  [
    'lockfile',
    (candidate) => {
      cpSync(hostileLock, join(candidate, 'bun.lock'));
    },
    'ordinary content bun.lock matched 0 classification rules',
  ],
  [
    'npmrc and bunfig',
    (candidate) => {
      write(join(candidate, '.npmrc'), `registry=${hostileRegistry.url}\n`);
      write(
        join(candidate, 'bunfig.toml'),
        `preload = ["./preload.ts"]\n\n[install]\nregistry = "${hostileRegistry.url}"\n`,
      );
      write(
        join(candidate, 'preload.ts'),
        `await Bun.write(${JSON.stringify(join(sentinels, 'candidate-bunfig-preload'))}, "ran");\n`,
      );
    },
    'ordinary content .npmrc matched 0 classification rules',
  ],
  [
    'lifecycle scripts',
    (candidate) => {
      writeHostileInstallInputs(candidate, 'candidate');
    },
    'ordinary content .npmrc matched 0 classification rules',
  ],
  [
    'validator source',
    (candidate) => {
      const validator = join(candidate, 'src/new/cli.ts');
      writeFileSync(
        validator,
        `await Bun.write(${JSON.stringify(join(sentinels, 'candidate-validator'))}, "ran");\n${readFileSync(validator, 'utf8')}`,
      );
    },
    '"reason":"selected policy obligation is unmet"',
  ],
  [
    'Nx plugin',
    (candidate) => {
      write(
        join(candidate, 'nx.json'),
        `${JSON.stringify({ plugins: ['./tools/sentinel-plugin.cjs'] })}\n`,
      );
      write(
        join(candidate, 'tools/sentinel-plugin.cjs'),
        `require('node:fs').writeFileSync(${JSON.stringify(join(sentinels, 'candidate-nx-plugin'))}, 'ran');\nmodule.exports = {};\n`,
      );
    },
    'ordinary content tools/sentinel-plugin.cjs matched 0 classification rules',
  ],
  [
    'activation variables and wrapper',
    (candidate) => {
      const forged = join(candidate, 'forged-activation');
      write(join(forged, 'active-v1'), 'tool-wiki-active-v1\n');
      write(join(forged, 'launcher-path'), 'launcher.sh\n');
      write(
        join(forged, 'toolkit-release'),
        readFileSync(join(activationRoot, 'toolkit-release'), 'utf8'),
      );
      const certify = `#!/usr/bin/env bash\ntouch ${JSON.stringify(join(sentinels, 'candidate-wrapper'))}\nprintf '%s\\n' '{"schemaVersion":1,"certified":true}'\n`;
      write(join(forged, 'launcher.sh'), certify);
      write(join(candidate, 'bin/tool-wiki-lint.sh'), certify);
      chmodSync(join(candidate, 'bin/tool-wiki-lint.sh'), 0o755);
      write(
        join(candidate, '.env'),
        `TOOL_WIKI_ACTIVATION_ROOT=${forged}\nTOOL_WIKI_REQUIRE_CERTIFIED=0\nTOOL_WIKI_TRUSTED_NODE_MODULES=${join(candidate, 'node_modules')}\n`,
      );
    },
    'ordinary content .env matched 0 classification rules',
  ],
];

function packageBase(runner: Runner): void {
  checkOutBase(runner, baseLock, {
    schemaVersion: 1,
    admission: 'installed-package',
    registry: registry.url,
  });
}

describe('package-backed trusted admission', () => {
  test('the workflow installs the base-owned bootstrap before any candidate byte exists', () => {
    const names = workflowSteps().map((step) => step.name);
    const base = names.indexOf('Check out base-owned package bootstrap');
    const bootstrap = names.indexOf('Bootstrap trusted package');
    const candidate = names.indexOf('Check out exact candidate');
    expect(base).toBeGreaterThan(-1);
    expect(base).toBeLessThan(bootstrap);
    expect(bootstrap).toBeLessThan(candidate);
    const baseCheckout = workflowSteps()[base] as { with?: Record<string, unknown> };
    expect(baseCheckout.with).toEqual({
      ref: '${{ github.event.pull_request.base.sha }}',
      path: 'trusted-base',
      'sparse-checkout': 'infra/ci/bureaucrat/',
      'sparse-checkout-cone-mode': false,
      'persist-credentials': false,
    });
  });

  test('the committed configuration keeps the archive launcher route and installs nothing', async () => {
    const runner = createRunner();
    const directory = join(runner.workspace, 'trusted-base/infra/ci/bureaucrat');
    mkdirSync(dirname(directory), { recursive: true });
    cpSync(bootstrapSource, directory, { recursive: true });
    const bootstrap = await runWorkflowStep(runner, 'Bootstrap trusted package', {}, {});
    expect(bootstrap.exitCode, bootstrap.stderr).toBe(0);
    expect(runner.outputs.get('route')).toBe('archive-launcher');
    expect(existsSync(join(installedConsumer(runner), 'node_modules'))).toBe(false);
    expect(existsSync(join(directory, 'bun.lock'))).toBe(false);
  });

  test('an unselected route refuses instead of skipping admission', async () => {
    const runner = createRunner();
    const verify = await runWorkflowStep(
      runner,
      'Verify exact candidate with external trust',
      { 'github.event.pull_request.head.sha': fixture.candidateRevision },
      {},
    );
    expect(verify.exitCode).toBe(78);
    expect(verify.stderr).toContain('admission route was not selected');
  });

  test('the exact tested tarball installs from the explicit registry and certifies the reviewed candidate', async () => {
    const runner = createRunner();
    packageBase(runner);
    const bootstrap = await runWorkflowStep(runner, 'Bootstrap trusted package', {}, {});
    expect(bootstrap.exitCode, bootstrap.stderr).toBe(0);
    expect(runner.outputs.get('route')).toBe('installed-package');
    expect(runner.outputs.get('package')).toBe('twilight-bureaucrat@0.1.0');
    expect(runner.outputs.get('integrity')).toBe(registry.integrity);
    const sha = await checkOutCandidate(runner);
    const verify = await runWorkflowStep(
      runner,
      'Verify exact candidate with external trust',
      { 'github.event.pull_request.head.sha': sha },
      { TOOL_WIKI_ACTIVATION_ROOT: activationRoot },
    );
    expect(verify.exitCode, `${verify.stdout}${verify.stderr}`).toBe(0);
    expect(verify.stdout).toContain('"certified":true');
    const installedManifest = JSON.parse(
      readFileSync(
        join(
          installedConsumer(runner),
          'node_modules/twilight-bureaucrat/dist/package-manifest.json',
        ),
        'utf8',
      ),
    ) as { toolkitIdentity: string };
    const selected = JSON.parse(readFileSync(join(activationRoot, 'selected.json'), 'utf8')) as {
      identity: string;
    };
    expect(
      JSON.parse(
        readFileSync(join(runner.temporary, 'twilight-bureaucrat/admission.json'), 'utf8'),
      ),
    ).toEqual({
      schemaVersion: 1,
      sourceSha: sha,
      package: {
        name: 'twilight-bureaucrat',
        version: '0.1.0',
        integrity: registry.integrity,
        toolkitIdentity: installedManifest.toolkitIdentity,
      },
      activation: { version: fixture.candidateRevision, manifestIdentity: selected.identity },
    });
  }, 300_000);

  test.each(hostileCases)(
    'a candidate changing its %s cannot steer the install or execute a sentinel',
    async (_label, mutate, refusal) => {
      const runner = createRunner();
      packageBase(runner);
      // Worst case for ordering: candidate bytes already sit in the workspace, including at its
      // root, before the bootstrap step runs.
      writeHostileInstallInputs(runner.workspace, 'workspace');
      const sha = await checkOutCandidate(runner, mutate);
      const hostileRequests = hostileRegistry.requests.length;
      const bootstrap = await runWorkflowStep(
        runner,
        'Bootstrap trusted package',
        {},
        hostileInheritance,
      );
      expect(bootstrap.exitCode, bootstrap.stderr).toBe(0);
      expect(runner.outputs.get('integrity')).toBe(registry.integrity);
      expect(lockIntegrity(installedConsumer(runner))).toBe(registry.integrity);
      const verify = await runWorkflowStep(
        runner,
        'Verify exact candidate with external trust',
        { 'github.event.pull_request.head.sha': sha },
        { ...hostileInheritance, TOOL_WIKI_ACTIVATION_ROOT: activationRoot },
      );
      expect(verify.exitCode, `${verify.stdout}${verify.stderr}`).not.toBe(0);
      expect(verify.stdout).not.toContain('"certified":true');
      // Pinning the reason catches a validator that starts reading candidate config (bunfig.toml,
      // nx.json, .npmrc) as configuration: the refusal would move or the sentinel would appear.
      expect(`${verify.stdout}${verify.stderr}`).toContain(refusal);
      expect(existsSync(join(runner.temporary, 'twilight-bureaucrat/admission.json'))).toBe(false);
      expect(hostileRegistry.requests.length).toBe(hostileRequests);
      expect(readdirSync(sentinels)).toEqual([]);
    },
    300_000,
  );

  test('a package whose toolkit differs from the activation refuses without replacing it', async () => {
    const runner = createRunner();
    packageBase(runner);
    const bootstrap = await runWorkflowStep(runner, 'Bootstrap trusted package', {}, {});
    expect(bootstrap.exitCode, bootstrap.stderr).toBe(0);
    const sha = await checkOutCandidate(runner);
    const older = scratch('twilight-bureaucrat-older-activation-');
    cpSync(activationRoot, older, { recursive: true });
    const olderRelease = `twilight-bureaucrat-v0.1.0 ${'0'.repeat(64)}\n`;
    writeFileSync(join(older, 'toolkit-release'), olderRelease);
    const mismatched = await runWorkflowStep(
      runner,
      'Verify exact candidate with external trust',
      { 'github.event.pull_request.head.sha': sha },
      { TOOL_WIKI_ACTIVATION_ROOT: older },
    );
    expect(mismatched.exitCode).toBe(78);
    expect(mismatched.stderr).toContain('activation was prepared from another toolkit');
    expect(mismatched.stdout).not.toContain('"certified":true');
    expect(readFileSync(join(older, 'toolkit-release'), 'utf8')).toBe(olderRelease);

    rmSync(join(older, 'toolkit-release'));
    const legacy = await runWorkflowStep(
      runner,
      'Verify exact candidate with external trust',
      { 'github.event.pull_request.head.sha': sha },
      { TOOL_WIKI_ACTIVATION_ROOT: older },
    );
    expect(legacy.exitCode).toBe(78);
    expect(legacy.stderr).toContain('activation names no toolkit release');

    const unconfigured = await runWorkflowStep(
      runner,
      'Verify exact candidate with external trust',
      { 'github.event.pull_request.head.sha': sha },
      {},
    );
    expect(unconfigured.exitCode).toBe(78);
    expect(unconfigured.stderr).toContain('required admission has no external activation root');
  }, 300_000);

  test('a scrubbed environment keeps inherited Bun options out of admission', async () => {
    const runner = createRunner();
    packageBase(runner);
    const bootstrap = await runWorkflowStep(
      runner,
      'Bootstrap trusted package',
      {},
      hostileInheritance,
    );
    expect(bootstrap.exitCode, bootstrap.stderr).toBe(0);
    const sha = await checkOutCandidate(runner);
    const verify = await runWorkflowStep(
      runner,
      'Verify exact candidate with external trust',
      { 'github.event.pull_request.head.sha': sha },
      { ...hostileInheritance, TOOL_WIKI_ACTIVATION_ROOT: activationRoot },
    );
    expect(verify.exitCode, `${verify.stdout}${verify.stderr}`).toBe(0);
    expect(readdirSync(sentinels)).toEqual([]);
  }, 300_000);
});

describe('staged and malformed bootstrap inputs refuse', () => {
  async function bootstrapWith(
    consumer: object,
    lock: string | undefined,
    edit?: (directory: string) => void,
  ): Promise<{ runner: Runner; invocation: Invocation }> {
    const runner = createRunner();
    const directory = checkOutBase(runner, lock, consumer);
    edit?.(directory);
    const invocation = await runWorkflowStep(runner, 'Bootstrap trusted package', {}, {});
    return { runner, invocation };
  }

  const packageRoute = () => ({
    schemaVersion: 1,
    admission: 'installed-package',
    registry: registry.url,
  });

  test('installed-package without a pinned lock refuses before any install', async () => {
    const { runner, invocation } = await bootstrapWith(packageRoute(), undefined);
    expect(invocation.exitCode).toBe(78);
    expect(invocation.stderr).toContain('base-owned bootstrap lock is absent');
    expect(existsSync(join(installedConsumer(runner), 'node_modules'))).toBe(false);
  });

  test('absent, unreadable and malformed consumer configuration each refuse by name', async () => {
    const absent = await bootstrapWith(packageRoute(), baseLock, (directory) => {
      rmSync(join(directory, 'consumer.json'));
    });
    expect(absent.invocation.exitCode).toBe(78);
    expect(absent.invocation.stderr).toContain('consumer configuration is absent');
    const unreadable = await bootstrapWith(packageRoute(), baseLock, (directory) => {
      rmSync(join(directory, 'consumer.json'));
      mkdirSync(join(directory, 'consumer.json'));
    });
    expect(unreadable.invocation.exitCode).toBe(78);
    expect(unreadable.invocation.stderr).toContain('consumer configuration is unreadable');
    for (const consumer of [
      { ...packageRoute(), admission: 'candidate-choice' },
      { ...packageRoute(), extra: true },
      { ...packageRoute(), registry: 'http://registry.example.test/' },
    ]) {
      const malformed = await bootstrapWith(consumer, baseLock);
      expect(malformed.invocation.exitCode).toBe(78);
      expect(malformed.invocation.stderr).toContain('consumer configuration is malformed');
      expect(malformed.runner.outputs.has('route')).toBe(false);
    }
  });

  test('a base manifest carrying lifecycle scripts refuses before install', async () => {
    const { runner, invocation } = await bootstrapWith(packageRoute(), baseLock, (directory) => {
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as Record<
        string,
        unknown
      >;
      manifest['scripts'] = {
        preinstall: `bun -e 'await Bun.write(${JSON.stringify(join(sentinels, 'base-preinstall'))}, "ran")'`,
      };
      writeFileSync(join(directory, 'package.json'), `${JSON.stringify(manifest)}\n`);
    });
    expect(readdirSync(sentinels)).toEqual([]);
    expect(invocation.exitCode).toBe(78);
    expect(invocation.stderr).toContain('must pin exactly twilight-bureaucrat');
    expect(existsSync(join(installedConsumer(runner), 'node_modules'))).toBe(false);
  });

  test('a lock resolving from another registry refuses', async () => {
    const { invocation } = await bootstrapWith(packageRoute(), hostileLock, (directory) => {
      const lock = readFileSync(join(directory, 'bun.lock'), 'utf8').replace(
        '"name": "hostile"',
        '"name": "puni-twilight-bureaucrat-bootstrap"',
      );
      writeFileSync(join(directory, 'bun.lock'), lock);
    });
    expect(invocation.exitCode).toBe(78);
    expect(invocation.stderr).toContain('base-owned bootstrap lock does not pin');
  });

  test('a reused scratch directory refuses', async () => {
    const { runner, invocation } = await bootstrapWith(packageRoute(), baseLock);
    expect(invocation.exitCode, invocation.stderr).toBe(0);
    const again = await runWorkflowStep(runner, 'Bootstrap trusted package', {}, {});
    expect(again.exitCode).toBe(78);
    expect(again.stderr).toContain('scratch directory already exists');
  });
});

describe('root compatibility route', () => {
  function routeRoot(pin: string | undefined): string {
    const root = scratch('twilight-bureaucrat-route-root-');
    cpSync(compatibilityRoute, join(root, 'bin/tool-wiki-package-lint.sh'));
    write(
      join(root, 'package.json'),
      `${JSON.stringify({
        name: 'route-root',
        private: true,
        ...(pin === undefined ? {} : { devDependencies: { 'twilight-bureaucrat': pin } }),
      })}\n`,
    );
    return root;
  }

  test('routes to the installed executable and keeps the inactive and certified states', async () => {
    const root = routeRoot('0.1.0');
    const installed = await run(
      ['bun', 'install', '--ignore-scripts', '--registry', registry.url],
      root,
      plainEnvironment(root),
    );
    expect(installed.exitCode, installed.stderr).toBe(0);
    const route = join(root, 'bin/tool-wiki-package-lint.sh');
    const inactive = await run(
      ['bash', route, 'committed', fixture.repository, fixture.candidateRevision],
      root,
      plainEnvironment(root),
    );
    expect(inactive.exitCode, inactive.stderr).toBe(0);
    expect(JSON.parse(inactive.stdout)).toMatchObject({ status: 'inactive', certified: false });
    const certified = await run(
      ['bash', route, 'committed', fixture.repository, fixture.candidateRevision],
      root,
      {
        ...plainEnvironment(root),
        TOOL_WIKI_ACTIVATION_ROOT: activationRoot,
        TOOL_WIKI_REQUIRE_CERTIFIED: '1',
      },
    );
    expect(certified.exitCode, certified.stderr).toBe(0);
    expect(certified.stdout).toContain('"certified":true');
  }, 300_000);

  test('a root without an exact pin refuses', async () => {
    for (const pin of [undefined, '^0.1.0']) {
      const root = routeRoot(pin);
      const refused = await run(
        ['bash', join(root, 'bin/tool-wiki-package-lint.sh'), 'working', root, 'HEAD'],
        root,
        plainEnvironment(root),
      );
      expect(refused.exitCode).toBe(78);
      expect(refused.stderr).toContain('no exact twilight-bureaucrat devDependency');
    }
  });

  test('a package lint that calls the route again is refused instead of recursing', async () => {
    const root = routeRoot('0.1.0');
    const counter = join(root, 'depth');
    const packageRoot = join(root, 'node_modules/twilight-bureaucrat');
    write(join(packageRoot, 'package.json'), '{"name":"twilight-bureaucrat","version":"0.1.0"}\n');
    write(
      join(packageRoot, 'dist/bin.mjs'),
      [
        "import { existsSync, readFileSync, writeFileSync } from 'node:fs';",
        "if (process.argv[2] === '--version') { process.stdout.write('0.1.0\\n'); process.exit(0); }",
        `const counter = ${JSON.stringify(counter)};`,
        "const depth = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) + 1 : 1;",
        'writeFileSync(counter, String(depth));',
        'if (depth >= 3) process.exit(0);',
        `const child = Bun.spawnSync(['bash', ${JSON.stringify(join(root, 'bin/tool-wiki-package-lint.sh'))}, ...process.argv.slice(3)], { stdio: ['inherit', 'inherit', 'inherit'] });`,
        'process.exit(child.exitCode ?? 1);',
        '',
      ].join('\n'),
    );
    const recursed = await run(
      ['bash', join(root, 'bin/tool-wiki-package-lint.sh'), 'working', root, 'HEAD'],
      root,
      plainEnvironment(root),
    );
    expect(recursed.exitCode).toBe(70);
    expect(recursed.stderr).toContain('compatibility route re-entered itself');
    expect(readFileSync(counter, 'utf8')).toBe('1');
  });
});
