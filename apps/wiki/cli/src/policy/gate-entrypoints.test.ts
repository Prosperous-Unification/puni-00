import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import { parse as parseYaml } from 'yaml';

import { hashBytes, hashCanonical } from '../evidence/content-manifest';
import { prepareActivation, selectActivation, verifyActivation } from './activation';
import { resolveValidatorArtifactPaths } from './trust';

const workspace = join(import.meta.dir, '..', '..', '..', '..', '..');
const adapterPath = join(workspace, 'bin', 'tool-wiki-lint.sh');
const gateLibraryPath = join(workspace, 'bin', 'h2puni-gate-lib.sh');
const pushAuditPath = join(workspace, 'bin', 'tool-wiki-push-audit.sh');
const trustedCliPath = join(workspace, 'apps', 'wiki', 'cli', 'src', 'cli.ts');
const scratchPaths: string[] = [];

function streamText(stream: Uint8Array | undefined, subject: string): string {
  if (stream === undefined) throw new Error(`${subject} was unavailable`);
  return Buffer.from(stream).toString('utf8');
}

function write(path: string, source: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source, 'utf8');
}

function workflowStep(workflowPath: string, stepName: string): string {
  const workflow = parseYaml(readFileSync(workflowPath, 'utf8')) as {
    jobs?: {
      gate?: { steps?: { name?: string; run?: string }[] };
      lint?: { steps?: { name?: string; run?: string }[] };
    };
  };
  const steps = workflow.jobs?.gate?.steps ?? workflow.jobs?.lint?.steps ?? [];
  const run = steps.find((step) => step.name === stepName)?.run;
  if (typeof run !== 'string') throw new Error(`workflow step is missing: ${stepName}`);
  return run;
}

function runActivationConfigurationGuard(workflowPath: string, stepName: string, version: string) {
  return Bun.spawnSync(['bash', '-c', workflowStep(workflowPath, stepName)], {
    env: {
      ACTIVATION_ARCHIVE_SHA256: 'a'.repeat(64),
      ACTIVATION_ARCHIVE_URL: 'file:///not-used-before-version-validation',
      ACTIVATION_VERSION: version,
    },
    stderr: 'pipe',
    stdout: 'pipe',
  });
}

function fixture(): {
  directory: string;
  repository: string;
  activationRoot: string;
  cliPath: string;
  bindingPath: string;
  evidencePath: string;
} {
  const directory = mkdtempSync(join(tmpdir(), 'tool-wiki-entrypoints-'));
  scratchPaths.push(directory);
  const repository = join(directory, 'candidate');
  const activationRoot = join(directory, 'activation');
  const cliPath = join(directory, 'validator', 'trusted-cli.ts');
  const bindingPath = join(directory, 'trust', 'binding.json');
  const evidencePath = join(directory, 'trust', 'evidence.json');
  mkdirSync(repository);
  write(
    cliPath,
    "process.stdout.write(`${JSON.stringify({ argv: process.argv.slice(2), binding: process.env['TOOL_WIKI_CI_TRUSTED_BINDING'] })}\\n`);\n",
  );
  write(
    bindingPath,
    `${JSON.stringify({ validator: { artifacts: [{ path: cliPath, sha256: sha256(readFileSync(cliPath)) }] } })}\n`,
  );
  write(evidencePath, '{}\n');
  write(join(activationRoot, 'active-v1'), 'tool-wiki-active-v1\n');
  write(join(activationRoot, 'validator-path'), `${cliPath}\n`);
  write(
    join(activationRoot, 'snapshotter-path'),
    `${join(workspace, 'apps', 'wiki', 'cli', 'src', 'policy', 'snapshot-validator.ts')}\n`,
  );
  write(join(activationRoot, 'local-binding-path'), `${bindingPath}\n`);
  write(join(activationRoot, 'ci-binding-path'), `${bindingPath}\n`);
  write(join(activationRoot, 'evidence-path'), `${evidencePath}\n`);
  return { directory, repository, activationRoot, cliPath, bindingPath, evidencePath };
}

function activationArchiveRoot(sourceRevision: string): string {
  const paths = fixture();
  const sources = join(paths.directory, 'provision-sources');
  const validator = join(sources, 'validator.mjs');
  write(validator, 'process.stdout.write("{}\\n");\n');
  const binding = join(sources, 'binding.json');
  const roleSources = {
    authority: join(sources, 'authority.json'),
    ciBinding: binding,
    evidence: join(sources, 'evidence.json'),
    launcher: adapterPath,
    localBinding: binding,
    mapping: join(sources, 'mapping.json'),
    policy: join(sources, 'policy.json'),
    reviewReceipt: join(sources, 'review.json'),
    snapshotter: join(workspace, 'apps/wiki/cli/src/policy/snapshot-validator.ts'),
    validator,
  };
  for (const role of ['authority', 'evidence', 'mapping', 'policy', 'reviewReceipt'] as const)
    write(roleSources[role], '{}\n');
  write(
    binding,
    `${JSON.stringify({
      policy: { path: 'policy.json', sha256: hashBytes(readFileSync(roleSources.policy)) },
      authority: {
        artifact: {
          path: 'authority.json',
          sha256: hashBytes(readFileSync(roleSources.authority)),
        },
      },
      validator: {
        artifacts: [{ path: 'validator.mjs', sha256: hashBytes(readFileSync(validator)) }],
      },
    })}\n`,
  );
  const prepared = prepareActivation({
    candidateRepository: paths.repository,
    destination: join(paths.activationRoot, 'v1'),
    mappingIdentity: hashBytes(readFileSync(roleSources.mapping)),
    policyIdentity: hashBytes(readFileSync(roleSources.policy)),
    reviewReceiptIdentity: hashBytes(readFileSync(roleSources.reviewReceipt)),
    roleSources,
    sourceRevision,
    validatorIdentity: hashBytes(readFileSync(validator)),
  });
  selectActivation(paths.activationRoot, prepared.directory, prepared.identity);
  write(join(paths.activationRoot, 'toolkit-release'), `wiki-v0.0.1 ${'7'.repeat(64)}\n`);
  return paths.activationRoot;
}

function selectArchiveDirectory(activationRoot: string, directory: string): void {
  const descriptor = join(activationRoot, 'selected.json');
  const selection = JSON.parse(readFileSync(descriptor, 'utf8')) as Record<string, unknown>;
  chmodSync(descriptor, 0o600);
  writeFileSync(descriptor, `${JSON.stringify({ ...selection, directory })}\n`, 'utf8');
}

function packActivationArchive(activationRoot: string): { path: string; digest: string } {
  const transport = mkdtempSync(join(tmpdir(), 'tool-wiki-provision-transport-'));
  scratchPaths.push(transport);
  const path = join(transport, 'tool-wiki-activation.tar');
  const pack = Bun.spawnSync(
    ['tar', '--create', '--file', path, '--directory', activationRoot, '.'],
    { stderr: 'pipe', stdout: 'pipe' },
  );
  if (pack.exitCode !== 0) throw new Error(streamText(pack.stderr, 'tar stderr'));
  return { path, digest: sha256(readFileSync(path)) };
}

/**
 * Runs a provisioning step's own production bash offline. Only the runner's network fetch is
 * substituted — a `curl` shim on PATH copies the `file://` archive — so the pinned digest, the
 * extraction and the manifest join all execute against real bytes.
 */
function runActivationProvisioning(
  workflowPath: string,
  stepName: string,
  archive: { path: string; digest: string },
  version: string,
  prepareRunner?: (runnerTemporary: string) => void,
): { invocation: ReturnType<typeof Bun.spawnSync>; environmentFile: string } {
  const runnerTemporary = mkdtempSync(join(tmpdir(), 'tool-wiki-provision-runner-'));
  const harness = mkdtempSync(join(tmpdir(), 'tool-wiki-provision-harness-'));
  scratchPaths.push(runnerTemporary, harness);
  const environmentFile = join(harness, 'github-env');
  writeFileSync(environmentFile, '', 'utf8');
  const transportShim = join(harness, 'bin', 'curl');
  write(
    transportShim,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'destination=',
      'origin=',
      'while (( $# )); do',
      '  case "$1" in',
      '    --output) destination=$2; shift 2 ;;',
      '    file://*) origin=${1#file://}; shift ;;',
      '    *) shift ;;',
      '  esac',
      'done',
      '[[ -n "$destination" && -n "$origin" ]]',
      'cp -- "$origin" "$destination"',
      '',
    ].join('\n'),
  );
  chmodSync(transportShim, 0o755);
  prepareRunner?.(runnerTemporary);
  const invocation = Bun.spawnSync(['bash', '-c', workflowStep(workflowPath, stepName)], {
    env: {
      ACTIVATION_ARCHIVE_SHA256: archive.digest,
      ACTIVATION_ARCHIVE_URL: `file://${archive.path}`,
      ACTIVATION_VERSION: version,
      GITHUB_ENV: environmentFile,
      PATH: `${join(harness, 'bin')}:${process.env['PATH'] ?? ''}`,
      RUNNER_TEMP: runnerTemporary,
    },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  return { invocation, environmentFile };
}

interface RealFixture {
  repository: string;
  revision: string;
  activationRoot: string;
  bindingPath: string;
  evidencePath: string;
  policyPath: string;
  authorityPath: string;
}

interface ExactEntry {
  path: string;
  mode: '100644' | '100755' | '120000' | '160000';
  blob: string;
}

function git(repository: string, ...argv: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const detail = streamText(invocation.stderr, 'git stderr');
  if (invocation.exitCode !== 0) throw new Error(`git ${argv.join(' ')}: ${detail}`);
  return streamText(invocation.stdout, 'git stdout').trim();
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function entries(repository: string, revision: string): ExactEntry[] {
  const output = git(repository, 'ls-tree', '-r', revision);
  return output.split('\n').map((line) => {
    const match = /^(100644|100755|120000|160000) (?:blob|commit) ([0-9a-f]+)\t(.+)$/.exec(line);
    if (match === null) throw new Error(`malformed fixture tuple: ${line}`);
    const mode = match[1];
    if (mode !== '100644' && mode !== '100755' && mode !== '120000' && mode !== '160000') {
      throw new Error(`unsupported fixture mode: ${mode}`);
    }
    return { path: match[3], mode, blob: match[2] };
  });
}

function candidateIdentity(
  repository: string,
  revision: string,
  exactEntries: ExactEntry[],
): string {
  return hashCanonical({
    selection: {
      kind: 'committed',
      revision,
      tree: git(repository, 'rev-parse', `${revision}^{tree}`),
    },
    entries: exactEntries,
    untracked: [],
  });
}

function realFixture(): RealFixture {
  const repository = mkdtempSync(join(tmpdir(), 'tool-wiki-entry-candidate-'));
  const trust = mkdtempSync(join(tmpdir(), 'tool-wiki-entry-trust-'));
  scratchPaths.push(repository, trust);
  git(repository, 'init', '--initial-branch=main');
  git(repository, 'config', 'user.email', 'entrypoint@example.test');
  git(repository, 'config', 'user.name', 'Entrypoint Fixture');
  const metadata = {
    schemaVersion: 1,
    moduleId: 'module.fixture',
    memberships: [
      { kind: 'path', path: 'src/app.ts' },
      { kind: 'path', path: 'bin/tool-wiki-lint.sh' },
      { kind: 'path', path: 'bin/h2puni-gate-steps.sh' },
    ],
    relationshipSelectors: [],
    applicableChecks: [],
    inapplicableSections: [
      { section: 'relationships', reason: 'No declared relationships.' },
      { section: 'invariants', reason: 'No cross-file invariant.' },
      { section: 'checks', reason: 'The trusted lint is the check.' },
    ],
    externalConsumers: { kind: 'none-known', knowledgeLimit: 'Fixture-local knowledge only.' },
  };
  write(
    join(repository, 'README.md'),
    `# Fixture\n\n<!-- module-index ${JSON.stringify(metadata)} -->\n`,
  );
  write(join(repository, 'src', 'app.ts'), 'export const value = 1;\n');
  write(join(repository, 'bin', 'tool-wiki-lint.sh'), '#!/usr/bin/env bash\nexit 1\n');
  write(join(repository, 'bin', 'h2puni-gate-steps.sh'), '#!/usr/bin/env bash\nexit 1\n');
  chmodSync(join(repository, 'bin', 'tool-wiki-lint.sh'), 0o755);
  chmodSync(join(repository, 'bin', 'h2puni-gate-steps.sh'), 0o755);
  git(repository, 'add', '--all');
  git(repository, 'commit', '--message', 'baseline');
  const revision = git(repository, 'rev-parse', 'HEAD');
  const exactEntries = entries(repository, revision);
  const identity = candidateIdentity(repository, revision, exactEntries);
  const policyPath = join(trust, 'policy.json');
  const authorityPath = join(trust, 'authority.json');
  const evidencePath = join(trust, 'evidence.json');
  const bindingPath = join(trust, 'binding.json');
  const classificationPolicy = {
    schemaVersion: 1,
    policyId: 'classification.entrypoint.v1',
    selectorVersion: 1,
    contentClasses: [
      'source',
      'test',
      'config',
      'script',
      'migration',
      'fixture',
      'generated',
      'vendored',
      'placeholder',
      'document',
      'openspec',
    ],
    contentRules: [
      { contentClass: 'source', include: [{ kind: 'suffix', value: '.ts' }], exclude: [] },
      { contentClass: 'test', include: [{ kind: 'name', value: 'fixture.test.ts' }], exclude: [] },
      { contentClass: 'config', include: [{ kind: 'name', value: 'fixture.json' }], exclude: [] },
      { contentClass: 'script', include: [{ kind: 'suffix', value: '.sh' }], exclude: [] },
      {
        contentClass: 'migration',
        include: [{ kind: 'segment', value: 'migrations' }],
        exclude: [],
      },
      { contentClass: 'fixture', include: [{ kind: 'segment', value: 'fixtures' }], exclude: [] },
      {
        contentClass: 'generated',
        include: [{ kind: 'segment', value: 'generated' }],
        exclude: [],
      },
      { contentClass: 'vendored', include: [{ kind: 'segment', value: 'vendor' }], exclude: [] },
      { contentClass: 'placeholder', include: [{ kind: 'name', value: '.keep' }], exclude: [] },
      { contentClass: 'document', include: [{ kind: 'suffix', value: '.md' }], exclude: [] },
      { contentClass: 'openspec', include: [{ kind: 'prefix', value: 'openspec' }], exclude: [] },
    ],
    evidenceRoots: [
      { path: 'docs/review-evidence', allowedRecordKinds: ['review-receipt'] },
      { path: 'docs/experiment-evidence', allowedRecordKinds: ['experiment-manifest'] },
    ],
    binaryDeclarations: [],
    gitlinkBoundaries: [],
    symlinks: 'inventory-only',
    gitlinks: 'declared-external-boundary',
  };
  const appEntry = exactEntries.find(({ path }) => path === 'src/app.ts');
  if (appEntry === undefined) throw new Error('fixture application tuple is absent');
  write(
    policyPath,
    `${JSON.stringify({
      schemaVersion: 1,
      policyId: 'policy.entrypoint.v1',
      minimumMode: 'enforce',
      classificationPolicy,
      adoptedBoundaryIds: ['boundary.application'],
      activationBoundaryIds: [],
      boundaries: [
        {
          boundaryId: 'boundary.application',
          selector: { kind: 'prefix', value: 'src' },
          baselineEntries: [appEntry],
          obligationIds: ['obligation.application'],
        },
      ],
      obligations: [
        {
          obligationId: 'obligation.application',
          boundaryId: 'boundary.application',
          checkIds: [],
          reviewIds: [],
        },
      ],
      exemptions: [],
    })}\n`,
  );
  const content = exactEntries.map((entry, index) => ({
    kind: 'content',
    inputId: `content.${String(index)}`,
    ...entry,
  }));
  write(
    authorityPath,
    `${JSON.stringify({
      schemaVersion: 1,
      authorityId: 'authority.entrypoint.v1',
      obligationRequest: {
        reviewed: {
          sourceBase: revision,
          candidateIdentity: identity,
          inputs: { content, structural: [], semantic: [], topology: [] },
        },
        current: {
          sourceBase: revision,
          candidateIdentity: identity,
          inputs: { content, structural: [], semantic: [], topology: [] },
        },
        judgments: [],
        policy: { policyId: 'policy.entrypoint.v1', behaviorRules: [] },
        impactClassifications: [],
        writerLabels: [],
        checks: [],
        reviews: [],
      },
      checkReceipts: [],
      audit: {
        schemaVersion: 1,
        auditId: 'audit.entrypoint.v1',
        sourceBase: revision,
        candidateIdentity: identity,
        generation: 1,
        seed: 'seed.entrypoint',
        coverage: 'exhaustive',
        strata: [],
        obligations: [],
        mode: 'enforce',
        claimedCoverage: 'exhaustive',
        reviews: [],
        corrections: [],
        closures: [],
        adjudications: [],
      },
    })}\n`,
  );
  write(
    evidencePath,
    `${JSON.stringify({
      schemaVersion: 1,
      reportMode: 'enforce',
      obligations: [{ obligationId: 'obligation.application', checkIds: [], reviewIds: [] }],
    })}\n`,
  );
  const validatorArtifacts = resolveValidatorArtifactPaths([trustedCliPath]).map((path) => ({
    path,
    sha256: sha256(readFileSync(path)),
  }));
  write(
    bindingPath,
    `${JSON.stringify({
      schemaVersion: 1,
      bindingId: 'binding.entrypoint.v1',
      trustScope: 'ci',
      policy: { path: policyPath, sha256: sha256(readFileSync(policyPath)) },
      authority: {
        authorityId: 'authority.entrypoint.v1',
        journalId: 'journal.entrypoint.v1',
        trustScope: 'external-verifier',
        artifact: { path: authorityPath, sha256: sha256(readFileSync(authorityPath)) },
      },
      validator: { validatorId: 'validator.entrypoint.v1', artifacts: validatorArtifacts },
    })}\n`,
  );
  write(join(trust, 'active-v1'), 'tool-wiki-active-v1\n');
  write(join(trust, 'validator-path'), `${realpathSync(trustedCliPath)}\n`);
  write(
    join(trust, 'snapshotter-path'),
    `${join(workspace, 'apps', 'wiki', 'cli', 'src', 'policy', 'snapshot-validator.ts')}\n`,
  );
  write(join(trust, 'local-binding-path'), `${bindingPath}\n`);
  write(join(trust, 'ci-binding-path'), `${bindingPath}\n`);
  write(join(trust, 'evidence-path'), `${evidencePath}\n`);
  return {
    repository,
    revision,
    activationRoot: trust,
    bindingPath,
    evidencePath,
    policyPath,
    authorityPath,
  };
}

function runRealAdapter(
  selection: 'working' | 'staged' | 'committed',
  fixturePaths: RealFixture,
  environment: Record<string, string> = {},
): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync(
    ['bash', adapterPath, selection, fixturePaths.repository, fixturePaths.revision],
    {
      env: {
        ...process.env,
        TOOL_WIKI_ACTIVATION_ROOT: fixturePaths.activationRoot,
        TOOL_WIKI_TRUSTED_NODE_MODULES: join(workspace, 'node_modules'),
        ...environment,
      },
      cwd: fixturePaths.repository,
      stderr: 'pipe',
      stdout: 'pipe',
    },
  );
}

function runNxLint(
  fixturePaths: RealFixture,
  nxWorkspace = workspace,
): ReturnType<typeof Bun.spawnSync> {
  const command = `bash ${adapterPath} committed ${fixturePaths.repository} HEAD`;
  return Bun.spawnSync(
    [
      join(workspace, 'node_modules', '.bin', 'nx'),
      'run',
      'wiki-cli:lint',
      `--command=${command}`,
      '--output-style=stream',
    ],
    {
      cwd: nxWorkspace,
      env: {
        ...process.env,
        NX_DAEMON: 'false',
        TOOL_WIKI_ACTIVATION_ROOT: fixturePaths.activationRoot,
      },
      stderr: 'pipe',
      stdout: 'pipe',
    },
  );
}

function nxFixture(cache: boolean, inputs: string[]): string {
  const nxWorkspace = mkdtempSync(join(tmpdir(), 'tool-wiki-nx-target-'));
  scratchPaths.push(nxWorkspace);
  write(join(nxWorkspace, 'package.json'), '{"name":"nx-target","private":true}\n');
  write(join(nxWorkspace, 'nx.json'), '{"plugins":[]}\n');
  write(join(nxWorkspace, 'sentinel.txt'), 'unchanged Nx input\n');
  write(
    join(nxWorkspace, 'project.json'),
    `${JSON.stringify({
      name: 'wiki-cli',
      root: '.',
      targets: {
        lint: {
          executor: 'nx:run-commands',
          cache,
          inputs,
          options: { command: 'false' },
        },
      },
    })}\n`,
  );
  symlinkSync(join(workspace, 'node_modules'), join(nxWorkspace, 'node_modules'), 'dir');
  return nxWorkspace;
}

function runAdapter(
  selection: 'working' | 'staged' | 'committed',
  paths: ReturnType<typeof fixture>,
  overrides: Record<string, string> = {},
  cwd?: string,
): ReturnType<typeof Bun.spawnSync> {
  const environment = Object.fromEntries(
    Object.entries({
      PATH: process.env['PATH'] ?? '',
      TOOL_WIKI_ACTIVATION_ROOT: paths.activationRoot,
      TOOL_WIKI_TRUSTED_NODE_MODULES: join(workspace, 'node_modules'),
      ...overrides,
    }),
  );
  return Bun.spawnSync(['bash', adapterPath, selection, paths.repository, 'abc123'], {
    cwd,
    env: environment,
    stderr: 'pipe',
    stdout: 'pipe',
  });
}

afterEach(() => {
  for (const path of scratchPaths.splice(0)) rmSync(path, { force: true, recursive: true });
});

describe('tool-wiki production entrypoint adapter', () => {
  test.each([
    ['working', ['lint-local', 'observe', 'working']],
    ['staged', ['lint-local', 'ratchet', 'staged']],
    ['committed', ['lint-ci', 'committed']],
  ] as const)('%s selects its explicit production CLI route', (selection, expected) => {
    const paths = fixture();
    const invocation = runAdapter(selection, paths);
    const output = streamText(invocation.stdout, 'adapter stdout');

    expect(invocation.exitCode, streamText(invocation.stderr, 'adapter stderr')).toBe(0);
    const routePrefix = [...expected, realpathSync(paths.repository), 'abc123'];
    const route =
      selection === 'committed'
        ? [...routePrefix, paths.evidencePath]
        : [...routePrefix, paths.bindingPath, paths.evidencePath];
    expect(JSON.parse(output)).toMatchObject({ argv: route });
  });

  test('an absent external activation root reports a visible non-certifying rollout state', () => {
    const paths = fixture();
    const invocation = Bun.spawnSync(['bash', adapterPath, 'staged', paths.repository, 'HEAD'], {
      env: { PATH: process.env['PATH'] ?? '' },
      stderr: 'pipe',
      stdout: 'pipe',
    });

    expect(invocation.exitCode, streamText(invocation.stderr, 'adapter stderr')).toBe(0);
    expect(JSON.parse(streamText(invocation.stdout, 'adapter stdout'))).toMatchObject({
      status: 'inactive',
      certified: false,
    });
  });

  test('an absent external activation marker reports a visible non-certifying rollout state', () => {
    const paths = fixture();
    rmSync(join(paths.activationRoot, 'active-v1'));
    const invocation = runAdapter('staged', paths);

    expect(invocation.exitCode, streamText(invocation.stderr, 'adapter stderr')).toBe(0);
    expect(JSON.parse(streamText(invocation.stdout, 'adapter stdout'))).toMatchObject({
      status: 'inactive',
      certified: false,
    });
  });

  test('required admission refuses inactive and non-certified validator output', () => {
    const absentRoot = fixture();
    rmSync(absentRoot.activationRoot, { recursive: true });
    const absent = runAdapter('committed', absentRoot, {
      TOOL_WIKI_REQUIRE_CERTIFIED: '1',
    });
    expect(absent.exitCode).not.toBe(0);
    expect(streamText(absent.stderr, 'adapter stderr')).toContain(
      'required admission has no external activation root',
    );

    const paths = fixture();
    rmSync(join(paths.activationRoot, 'active-v1'));
    const inactive = runAdapter('committed', paths, { TOOL_WIKI_REQUIRE_CERTIFIED: '1' });
    expect(inactive.exitCode).not.toBe(0);

    write(join(paths.activationRoot, 'active-v1'), 'tool-wiki-active-v1\n');
    const uncertified = runAdapter('committed', paths, { TOOL_WIKI_REQUIRE_CERTIFIED: '1' });
    expect(uncertified.exitCode).not.toBe(0);
    expect(streamText(uncertified.stderr, 'adapter stderr')).toContain(
      'required admission did not return certified enforce output',
    );

    write(
      paths.cliPath,
      'process.stdout.write(JSON.stringify({schemaVersion:1,mode:"observe",trustProvenance:"ci-preselected",accepted:true,certified:true}) + "\\n");\n',
    );
    write(
      paths.bindingPath,
      `${JSON.stringify({ validator: { artifacts: [{ path: paths.cliPath, sha256: sha256(readFileSync(paths.cliPath)) }] } })}\n`,
    );
    const observe = runAdapter('committed', paths, { TOOL_WIKI_REQUIRE_CERTIFIED: '1' });
    expect(observe.exitCode).not.toBe(0);

    write(paths.cliPath, 'process.stdout.write("not json\\n");\n');
    write(
      paths.bindingPath,
      `${JSON.stringify({ validator: { artifacts: [{ path: paths.cliPath, sha256: sha256(readFileSync(paths.cliPath)) }] } })}\n`,
    );
    const malformed = runAdapter('committed', paths, { TOOL_WIKI_REQUIRE_CERTIFIED: '1' });
    expect(malformed.exitCode).not.toBe(0);
  });

  test('a prepared and selected package drives the preserved launcher required path', () => {
    const paths = fixture();
    const sources = join(paths.directory, 'package-sources');
    const validator = join(sources, 'validator.mjs');
    write(
      validator,
      'process.stdout.write(JSON.stringify({schemaVersion:1,mode:"enforce",trustProvenance:"ci-preselected",accepted:true,certified:true}) + "\\n");\n',
    );
    const binding = join(sources, 'binding.json');
    const authority = join(sources, 'authority.json');
    const roleSources = {
      authority,
      ciBinding: binding,
      evidence: join(sources, 'evidence.json'),
      launcher: adapterPath,
      localBinding: binding,
      mapping: join(sources, 'mapping.json'),
      policy: join(sources, 'policy.json'),
      reviewReceipt: join(sources, 'review.json'),
      snapshotter: join(workspace, 'apps/wiki/cli/src/policy/snapshot-validator.ts'),
      validator,
    };
    for (const role of ['authority', 'evidence', 'mapping', 'policy', 'reviewReceipt'] as const)
      write(roleSources[role], '{}\n');
    write(
      binding,
      `${JSON.stringify({
        policy: { path: 'policy.json', sha256: hashBytes(readFileSync(roleSources.policy)) },
        authority: {
          artifact: {
            path: 'authority.json',
            sha256: hashBytes(readFileSync(roleSources.authority)),
          },
        },
        validator: {
          artifacts: [
            { path: 'validator.mjs', sha256: hashBytes(readFileSync(roleSources.validator)) },
          ],
        },
      })}\n`,
    );
    const prepared = prepareActivation({
      candidateRepository: paths.repository,
      destination: join(paths.activationRoot, 'v1'),
      mappingIdentity: hashBytes(readFileSync(roleSources.mapping)),
      policyIdentity: hashBytes(readFileSync(roleSources.policy)),
      reviewReceiptIdentity: hashBytes(readFileSync(roleSources.reviewReceipt)),
      roleSources,
      sourceRevision: '4'.repeat(40),
      validatorIdentity: hashBytes(readFileSync(validator)),
    });
    selectActivation(paths.activationRoot, prepared.directory, prepared.identity);

    const preloadMarker = join(paths.directory, 'candidate-preload-ran');
    write(join(paths.repository, 'bunfig.toml'), 'preload = ["./preload.ts"]\n');
    write(
      join(paths.repository, 'preload.ts'),
      `await Bun.write(${JSON.stringify(preloadMarker)}, 'candidate ran\\n');\nprocess.exit(71);\n`,
    );

    const invocation = runAdapter(
      'committed',
      paths,
      { TOOL_WIKI_REQUIRE_CERTIFIED: '1' },
      paths.repository,
    );
    expect(invocation.exitCode, streamText(invocation.stderr, 'adapter stderr')).toBe(0);
    // Proof: required selected-package admission ran both inline trust checks from the candidate
    // cwd and executed its bunfig preload until each inline Bun invocation pinned trusted ground.
    expect(existsSync(preloadMarker)).toBe(false);
    expect(JSON.parse(streamText(invocation.stdout, 'adapter stdout'))).toMatchObject({
      accepted: true,
      certified: true,
      mode: 'enforce',
    });
    chmodSync(join(prepared.directory, 'artifacts/validator.mjs'), 0o600);
    write(join(prepared.directory, 'artifacts/validator.mjs'), 'tampered\n');
    const tampered = runAdapter('committed', paths, { TOOL_WIKI_REQUIRE_CERTIFIED: '1' });
    expect(tampered.exitCode).not.toBe(0);
    expect(streamText(tampered.stderr, 'adapter stderr')).toContain(
      'selected activation package failed digest verification',
    );
  });

  test('a relocated role-complete package drives the real validator in required mode', () => {
    const paths = realFixture();
    const sources = join(dirname(paths.repository), 'real-package-sources');
    const validator = join(sources, 'validator.mjs');
    const build = Bun.spawnSync(
      ['bun', 'build', trustedCliPath, '--target=bun', '--format=esm', `--outfile=${validator}`],
      { stderr: 'pipe', stdout: 'pipe' },
    );
    expect(build.exitCode, streamText(build.stderr, 'build stderr')).toBe(0);
    const policy = join(sources, 'policy.json');
    const authority = join(sources, 'authority.json');
    const evidence = join(sources, 'evidence.json');
    const binding = join(sources, 'binding.json');
    write(policy, readFileSync(paths.policyPath, 'utf8'));
    write(authority, readFileSync(paths.authorityPath, 'utf8'));
    const authorityBytes = readFileSync(authority);
    write(evidence, readFileSync(paths.evidencePath, 'utf8'));
    const bindingRecord = JSON.parse(readFileSync(paths.bindingPath, 'utf8')) as {
      policy: { path: string; sha256: string };
      authority: { artifact: { path: string; sha256: string } };
      validator: { artifacts: { path: string; sha256: string }[] };
    };
    bindingRecord.policy = { path: 'policy.json', sha256: sha256(readFileSync(policy)) };
    bindingRecord.authority.artifact = {
      path: 'authority.json',
      sha256: sha256(readFileSync(authority)),
    };
    bindingRecord.validator.artifacts = [
      { path: 'validator.mjs', sha256: sha256(readFileSync(validator)) },
    ];
    write(binding, `${JSON.stringify(bindingRecord)}\n`);
    const mapping = join(sources, 'mapping.json');
    const reviewReceipt = join(sources, 'review-receipt.json');
    write(mapping, '{}\n');
    write(reviewReceipt, '{}\n');
    const prepared = prepareActivation({
      candidateRepository: paths.repository,
      destination: join(paths.activationRoot, 'real-v1'),
      mappingIdentity: hashBytes(readFileSync(mapping)),
      policyIdentity: hashBytes(readFileSync(policy)),
      reviewReceiptIdentity: hashBytes(readFileSync(reviewReceipt)),
      roleSources: {
        authority,
        ciBinding: binding,
        evidence,
        launcher: adapterPath,
        localBinding: binding,
        mapping,
        policy,
        reviewReceipt,
        snapshotter: join(workspace, 'apps/wiki/cli/src/policy/snapshot-validator.ts'),
        validator,
      },
      sourceRevision: '4'.repeat(40),
      validatorIdentity: hashBytes(readFileSync(validator)),
    });
    rmSync(sources, { recursive: true });
    selectActivation(paths.activationRoot, prepared.directory, prepared.identity);

    const invocation = runRealAdapter('committed', paths, {
      TOOL_WIKI_REQUIRE_CERTIFIED: '1',
    });

    expect(invocation.exitCode, streamText(invocation.stderr, 'adapter stderr')).toBe(0);
    expect(JSON.parse(streamText(invocation.stdout, 'adapter stdout'))).toMatchObject({
      accepted: true,
      certified: true,
      mode: 'enforce',
      trustProvenance: 'ci-preselected',
    });

    rmSync(join(prepared.directory, 'artifacts', 'authority.json'));
    writeFileSync(join(prepared.directory, 'artifacts', 'unlisted-authority.json'), authorityBytes);
    expect(() => verifyActivation(prepared.directory)).toThrow(
      'cannot read activation artifact: artifacts/authority.json',
    );
    const injected = runRealAdapter('committed', paths, {
      TOOL_WIKI_REQUIRE_CERTIFIED: '1',
    });
    expect(injected.exitCode).not.toBe(0);
    expect(streamText(injected.stderr, 'adapter stderr')).toContain(
      'selected activation package failed digest verification',
    );
  });

  test.each([
    ['active-v1', 'committed', 'malformed'],
    ['validator-path', 'committed', 'missing'],
    ['validator-path', 'committed', 'malformed'],
    ['ci-binding-path', 'committed', 'missing'],
    ['ci-binding-path', 'committed', 'malformed'],
    ['local-binding-path', 'staged', 'missing'],
    ['local-binding-path', 'staged', 'malformed'],
    ['evidence-path', 'committed', 'missing'],
    ['evidence-path', 'committed', 'malformed'],
    ['snapshotter-path', 'committed', 'missing'],
    ['snapshotter-path', 'committed', 'malformed'],
  ] as const)(
    'an active rollout refuses a %s artifact for %s selection that is %s',
    (artifact, selection, state) => {
      const paths = fixture();
      const artifactPath = join(paths.activationRoot, artifact);
      if (state === 'missing') rmSync(artifactPath);
      else write(artifactPath, artifact === 'active-v1' ? 'wrong\n' : 'relative\n');
      const invocation = runAdapter(selection, paths);

      expect(invocation.exitCode).not.toBe(0);
      expect(streamText(invocation.stderr, 'adapter stderr')).toContain(
        artifact === 'active-v1' ? 'rollout marker' : 'active rollout',
      );
    },
  );

  test('candidate-local activation state cannot select committed authority', () => {
    const paths = fixture();
    const candidateActivation = join(paths.repository, '.activation');
    write(join(candidateActivation, 'active-v1'), 'tool-wiki-active-v1\n');
    const invocation = runAdapter('committed', paths, {
      TOOL_WIKI_ACTIVATION_ROOT: candidateActivation,
    });

    expect(invocation.exitCode).not.toBe(0);
    expect(streamText(invocation.stderr, 'adapter stderr')).toContain(
      'activation root must be outside',
    );
  });

  test('an external validator-path symlink into the candidate is refused before execution', () => {
    const paths = fixture();
    const marker = join(paths.directory, 'candidate-validator-ran');
    const candidateCli = join(paths.repository, 'candidate-cli.ts');
    const validatorLink = join(paths.directory, 'validator-link.ts');
    write(candidateCli, `await Bun.write(${JSON.stringify(marker)}, 'ran\\n');\n`);
    symlinkSync(candidateCli, validatorLink);
    write(join(paths.activationRoot, 'validator-path'), `${validatorLink}\n`);

    const invocation = runAdapter('committed', paths);

    expect(invocation.exitCode).not.toBe(0);
    expect(streamText(invocation.stderr, 'adapter stderr')).toContain('validator must be outside');
    expect(existsSync(marker)).toBe(false);
  });

  test('candidate-contained runtime modules are refused before validator execution', () => {
    const paths = fixture();
    const candidateModules = join(paths.repository, 'node_modules');
    write(join(candidateModules, 'typescript', 'package.json'), '{"name":"typescript"}\n');

    const invocation = runAdapter('committed', paths, {
      TOOL_WIKI_TRUSTED_NODE_MODULES: candidateModules,
    });

    expect(invocation.exitCode).not.toBe(0);
    expect(streamText(invocation.stderr, 'adapter stderr')).toContain(
      'trusted TypeScript runtime modules must be outside the candidate',
    );
  });

  test('a candidate child whose name begins with two dots is refused before validator execution', () => {
    const paths = fixture();
    const marker = join(paths.directory, 'candidate-dot-prefix-dependency-ran');
    const dependency = join(paths.repository, '..trust', 'dependency.ts');
    const importPath = relative(dirname(paths.cliPath), dependency).split(sep).join('/');
    write(dependency, `await Bun.write(${JSON.stringify(marker)}, 'ran\\n');\n`);
    write(
      paths.cliPath,
      `import ${JSON.stringify(importPath)};\nprocess.stdout.write(JSON.stringify({ argv: process.argv.slice(2) }));\n`,
    );
    write(
      paths.bindingPath,
      `${JSON.stringify({
        validator: {
          artifacts: [paths.cliPath, dependency].map((path) => ({
            path,
            sha256: sha256(readFileSync(path)),
          })),
        },
      })}\n`,
    );

    const invocation = runAdapter('committed', paths);

    expect(existsSync(marker)).toBe(false);
    expect(invocation.exitCode).not.toBe(0);
    expect(streamText(invocation.stderr, 'adapter stderr')).toContain(
      'artifact resolves inside candidate',
    );
  });

  test('validator execution uses its complete snapshot after the reviewed original is swapped', () => {
    const paths = fixture();
    const marker = join(paths.directory, 'swapped-validator-ran');
    const candidateCli = join(paths.repository, 'candidate-cli.ts');
    const wrapperDirectory = join(paths.directory, 'bun-wrapper');
    const wrapperPath = join(wrapperDirectory, 'bun');
    const swapMarker = join(paths.directory, 'snapshot-finished');
    write(candidateCli, `await Bun.write(${JSON.stringify(marker)}, 'ran\\n');\n`);
    write(
      wrapperPath,
      `#!/usr/bin/env bash
set -euo pipefail
real_bun=${JSON.stringify(realpathSync(Bun.which('bun') ?? ''))}
if [[ "$*" == *snapshot-validator.ts* ]]; then
  "$real_bun" "$@"
  status=$?
  mv ${JSON.stringify(paths.cliPath)} ${JSON.stringify(`${paths.cliPath}.reviewed`)}
  ln -s ${JSON.stringify(candidateCli)} ${JSON.stringify(paths.cliPath)}
  printf ready > ${JSON.stringify(swapMarker)}
  exit "$status"
fi
if [[ ! -e ${JSON.stringify(swapMarker)} ]]; then
  mv ${JSON.stringify(paths.cliPath)} ${JSON.stringify(`${paths.cliPath}.reviewed`)}
  ln -s ${JSON.stringify(candidateCli)} ${JSON.stringify(paths.cliPath)}
fi
exec "$real_bun" "$@"
`,
    );
    chmodSync(wrapperPath, 0o755);

    const invocation = runAdapter('committed', paths, {
      PATH: `${wrapperDirectory}:${process.env['PATH'] ?? ''}`,
    });

    expect(invocation.exitCode, streamText(invocation.stderr, 'adapter stderr')).toBe(0);
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(swapMarker)).toBe(true);
    const output = JSON.parse(streamText(invocation.stdout, 'adapter stdout')) as {
      argv: string[];
    };
    expect(output.argv.slice(0, 2)).toEqual(['lint-ci', 'committed']);
  });

  test('validator compilation reads a dependency only from its captured reviewed bytes', () => {
    const paths = fixture();
    const dependency = join(dirname(paths.cliPath), 'dependency.ts');
    const marker = join(paths.directory, 'during-build-dependency-ran');
    const reviewedSource = 'export const reviewed = true;\n';
    const unreviewedSource = `await Bun.write(${JSON.stringify(marker)}, 'ran\\n');\nexport const reviewed = false;\n`;
    write(dependency, reviewedSource);
    write(
      paths.cliPath,
      `import './dependency';\nprocess.stdout.write(JSON.stringify({ argv: process.argv.slice(2) }));\n`,
    );
    write(
      paths.bindingPath,
      `${JSON.stringify({
        validator: {
          artifacts: [paths.cliPath, dependency].map((path) => ({
            path,
            sha256: sha256(readFileSync(path)),
          })),
        },
      })}\n`,
    );
    const raceSnapshotter = join(paths.directory, 'snapshotter', 'during-build-race.ts');
    const productionSnapshotter = join(
      workspace,
      'apps',
      'wiki',
      'cli',
      'src',
      'policy',
      'snapshot-validator.ts',
    );
    write(
      raceSnapshotter,
      `import { readFileSync, writeFileSync } from 'node:fs';
const originalBuild = Bun.build;
const reviewedBytes = readFileSync(${JSON.stringify(dependency)});
Bun.build = async (configuration) => {
  writeFileSync(${JSON.stringify(dependency)}, ${JSON.stringify(unreviewedSource)}, 'utf8');
  try {
    return await originalBuild(configuration);
  } finally {
    writeFileSync(${JSON.stringify(dependency)}, reviewedBytes);
  }
};
await import(${JSON.stringify(productionSnapshotter)});
`,
    );
    write(join(paths.activationRoot, 'snapshotter-path'), `${raceSnapshotter}\n`);

    const invocation = runAdapter('committed', paths);

    expect(invocation.exitCode, streamText(invocation.stderr, 'adapter stderr')).toBe(0);
    expect(readFileSync(dependency, 'utf8')).toBe(reviewedSource);
    expect(existsSync(marker)).toBe(false);
    const output = JSON.parse(streamText(invocation.stdout, 'adapter stdout')) as {
      argv: string[];
    };
    expect(output.argv.slice(0, 2)).toEqual(['lint-ci', 'committed']);
  });

  test('the snapshot refuses a binding that omits an executed validator dependency', () => {
    const paths = fixture();
    const marker = join(paths.directory, 'omitted-dependency-ran');
    const dependency = join(dirname(paths.cliPath), 'dependency.ts');
    write(dependency, `await Bun.write(${JSON.stringify(marker)}, 'ran\\n');\n`);
    write(
      paths.cliPath,
      `import './dependency';\nprocess.stdout.write(JSON.stringify({ argv: process.argv.slice(2) }));\n`,
    );
    write(
      paths.bindingPath,
      `${JSON.stringify({ validator: { artifacts: [{ path: paths.cliPath, sha256: sha256(readFileSync(paths.cliPath)) }] } })}\n`,
    );

    const invocation = runAdapter('committed', paths);

    expect(invocation.exitCode).not.toBe(0);
    expect(streamText(invocation.stderr, 'adapter stderr')).toContain(
      'binding artifacts do not match the complete validator closure',
    );
    expect(existsSync(marker)).toBe(false);
  });

  test('trusted Bun ignores a candidate-cwd bunfig preload and inherited execution variables', () => {
    const paths = realFixture();
    const marker = join(paths.repository, '..candidate-preload-ran');
    write(join(paths.repository, 'bunfig.toml'), 'preload = ["./preload.ts"]\n');
    write(
      join(paths.repository, 'preload.ts'),
      "await Bun.write(process.env['BUN_PRELOAD_MARKER'] ?? 'missing-marker', 'candidate ran\\n');\n",
    );

    const invocation = runRealAdapter('committed', paths, {
      BUN_PRELOAD_MARKER: marker,
      NODE_OPTIONS: '--require=./preload.ts',
    });

    expect(invocation.exitCode, streamText(invocation.stderr, 'lint stderr')).toBe(0);
    expect(existsSync(marker)).toBe(false);
  });

  test('Nx, host gate, CI and lefthook select the whole tree without caching', () => {
    const project = JSON.parse(
      readFileSync(join(workspace, 'apps', 'wiki', 'cli', 'project.json'), 'utf8'),
    ) as {
      targets: Partial<
        Record<string, { cache?: boolean; inputs?: string[]; options?: { command?: string } }>
      >;
    };
    const hostGate = readFileSync(join(workspace, 'bin', 'h2puni-gate.sh'), 'utf8');
    const hostSteps = readFileSync(join(workspace, 'bin', 'h2puni-gate-steps.sh'), 'utf8');
    const ci = readFileSync(join(workspace, '.github', 'workflows', 'ci.yml'), 'utf8');
    const trustedCi = readFileSync(
      join(workspace, '.github', 'workflows', 'trusted-wiki.yml'),
      'utf8',
    );
    const lefthook = readFileSync(join(workspace, 'lefthook.yml'), 'utf8');
    const workspacePackage = JSON.parse(readFileSync(join(workspace, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    // Proof: changing cache to true while narrowing inputs to `{projectRoot}/**/*` failed here
    // with the received cache/input pair printed beside these exact whole-tree expectations.
    expect(project.targets['lint']).toMatchObject({
      cache: false,
      inputs: ['{workspaceRoot}/**/*'],
      options: { command: 'bash bin/tool-wiki-lint.sh working . HEAD' },
    });
    expect(project.targets['lint:source']?.options?.command).toBe('bunx eslint apps/wiki/cli/src');
    expect(hostGate).not.toContain('cp "$repo_root/bin/tool-wiki-lint.sh"');
    expect(hostGate).toContain(
      'launcher_source=$(resolve_tool_wiki_launcher "$activation_root" "$repo_root")',
    );
    expect(hostGate).toContain('if [[ -n "$1" ]]; then bash "$1" committed');
    expect(ci).toContain('bash bin/tool-wiki-lint.sh committed . "$GITHUB_SHA"');
    expect(ci).toContain("github.event_name == 'push'");
    expect(ci).toContain('diagnostic/non-certifying');
    expect(ci).toContain('bash bin/tool-wiki-push-audit.sh . "$GITHUB_SHA"');
    expect(ci).not.toContain('Stage trusted runtime modules outside the push candidate');
    expect(ci).not.toContain('${{ runner.temp }}/tool-wiki-trusted-node-modules');
    const pushProvision = ci.indexOf(
      'name: Provision immutable external activation for push audit',
    );
    const pushAudit = ci.indexOf('bash bin/tool-wiki-push-audit.sh . "$GITHUB_SHA"');
    expect(pushProvision).toBeGreaterThan(-1);
    expect(pushProvision).toBeLessThan(pushAudit);
    expect(ci).toContain('ACTIVATION_ARCHIVE_URL: ${{ vars.TOOL_WIKI_ACTIVATION_ARCHIVE_URL }}');
    expect(ci).toContain(
      'ACTIVATION_ARCHIVE_SHA256: ${{ vars.TOOL_WIKI_ACTIVATION_ARCHIVE_SHA256 }}',
    );
    expect(ci).toContain('ACTIVATION_VERSION: ${{ vars.TOOL_WIKI_ACTIVATION_VERSION }}');
    expect(ci.indexOf('sha256sum --check --strict')).toBeLessThan(ci.indexOf('tar --extract'));
    expect(trustedCi).toContain('pull_request_target:');
    expect(trustedCi).toContain('permissions:\n  contents: read');
    // Proof: the public admission workflow resolved mutable action tags until terminal review
    // showed those actions could replace the digest-pinned trust decision without a repo change.
    const trustedActionRefs = [...trustedCi.matchAll(/uses:\s+[^\s@]+@([^\s#]+)/g)].map(
      (match) => match[1],
    );
    expect(trustedActionRefs.length).toBeGreaterThan(0);
    expect(trustedActionRefs.every((ref) => /^[0-9a-f]{40}$/.test(ref))).toBe(true);
    const ciActionRefs = [...ci.matchAll(/uses:\s+[^\s@]+@([^\s#]+)/g)].map((match) => match[1]);
    expect(ciActionRefs.length).toBeGreaterThan(0);
    expect(ciActionRefs.every((ref) => /^[0-9a-f]{40}$/.test(ref))).toBe(true);
    expect(trustedCi).not.toContain('if: ${{ vars.TOOL_WIKI_ACTIVATION_');
    expect(trustedCi.indexOf('name: Require immutable activation configuration')).toBeLessThan(
      trustedCi.indexOf('name: Check out trusted launcher'),
    );
    expect(trustedCi.match(/persist-credentials: false/g)).toHaveLength(2);
    expect(trustedCi).toContain('ref: ${{ vars.TOOL_WIKI_ACTIVATION_VERSION }}');
    expect(trustedCi).toContain('bun install --frozen-lockfile --ignore-scripts');
    expect(trustedCi).toContain(
      'TOOL_WIKI_TRUSTED_NODE_MODULES: ${{ github.workspace }}/trusted/node_modules',
    );
    expect(trustedCi).toContain('ref: ${{ github.event.pull_request.head.sha }}');
    expect(trustedCi).toContain('$RUNNER_TEMP/tool-wiki-lint.sh');
    // Proof: removing the selected-package check and required-certification environment from the
    // production workflow failed here with each missing literal instead of accepting exit 0.
    expect(trustedCi).toContain("TOOL_WIKI_REQUIRE_CERTIFIED: '1'");
    expect(trustedCi).toContain('selected.json');
    expect(trustedCi.indexOf('sha256sum --check --strict')).toBeLessThan(
      trustedCi.indexOf('tar --extract'),
    );
    expect(trustedCi).not.toContain('candidate/bin/');
    expect(trustedCi).not.toContain('h2puni-gate-steps.sh');
    expect(trustedCi).toContain('CANDIDATE_SHA: ${{ github.event.pull_request.head.sha }}');
    expect(trustedCi).toContain('committed "$GITHUB_WORKSPACE/candidate" "$CANDIDATE_SHA"');
    expect(trustedCi).not.toContain('"${{ github.event.pull_request.head.sha }}"');
    expect(lefthook).toContain('run: bash bin/tool-wiki-lint.sh staged . HEAD');
    expect(hostSteps).toContain('--exclude=wiki-cli');
    expect(hostSteps).toContain('bunx nx run wiki-cli:lint:source --skip-nx-cache');
    expect(ci).toContain('--exclude=wiki-cli');
    expect(ci).toContain('bunx nx run wiki-cli:lint:source --skip-nx-cache');
    expect(workspacePackage.scripts['lint']).toBe(
      'nx run-many -t lint --exclude=wiki-cli && nx run wiki-cli:lint:source',
    );
  });

  const provisioningSteps = [
    {
      path: join(workspace, '.github', 'workflows', 'trusted-wiki.yml'),
      step: 'Provision immutable external activation',
    },
    {
      path: join(workspace, '.github', 'workflows', 'ci.yml'),
      step: 'Provision immutable external activation for push audit',
    },
  ];

  test('activation workflows refuse a mutable activation version before using it as authority', () => {
    const workflows = [
      {
        path: join(workspace, '.github', 'workflows', 'trusted-wiki.yml'),
        step: 'Require immutable activation configuration',
      },
      {
        path: join(workspace, '.github', 'workflows', 'ci.yml'),
        step: 'Provision immutable external activation for push audit',
      },
    ];

    for (const workflow of workflows) {
      const mutable = runActivationConfigurationGuard(workflow.path, workflow.step, 'main');
      expect(mutable.exitCode).not.toBe(0);
      expect(streamText(mutable.stderr, 'activation guard stderr')).toContain(
        'activation version must be a full commit SHA',
      );
    }

    const immutable = runActivationConfigurationGuard(
      workflows[0].path,
      workflows[0].step,
      '0123456789abcdef0123456789abcdef01234567',
    );
    expect(immutable.exitCode, streamText(immutable.stderr, 'activation guard stderr')).toBe(0);
  });

  test('activation provisioning refuses an archive the configured version does not name', () => {
    const certifiedRevision = '4'.repeat(40);
    const configuredRevision = '5'.repeat(40);
    for (const workflow of provisioningSteps) {
      const archive = packActivationArchive(activationArchiveRoot(certifiedRevision));
      // Proof: with the manifest join deleted this case exited 0 and exported an activation root
      // for an archive certifying a commit the repository variables never named.
      const foreign = runActivationProvisioning(
        workflow.path,
        workflow.step,
        archive,
        configuredRevision,
      );
      const detail = streamText(foreign.invocation.stderr, 'provisioning stderr');
      expect(foreign.invocation.exitCode, detail).toBe(78);
      expect(detail).toContain(certifiedRevision);
      expect(detail).toContain(configuredRevision);
      expect(readFileSync(foreign.environmentFile, 'utf8')).toBe('');

      const named = runActivationProvisioning(
        workflow.path,
        workflow.step,
        archive,
        certifiedRevision,
      );
      expect(
        named.invocation.exitCode,
        streamText(named.invocation.stderr, 'provisioning stderr'),
      ).toBe(0);
      expect(readFileSync(named.environmentFile, 'utf8')).toContain(`TOOL_WIKI_ACTIVATION_ROOT=`);
      expect(readFileSync(named.environmentFile, 'utf8')).toContain(certifiedRevision);
      expect(streamText(named.invocation.stdout, 'provisioning stdout')).toContain(
        'toolkit release: wiki-v0.0.1',
      );
    }
  });

  test('activation provisioning refuses a selection that leaves the extracted archive root', () => {
    const decoyRevision = '6'.repeat(40);
    for (const workflow of provisioningSteps) {
      const activationRoot = activationArchiveRoot('4'.repeat(40));
      selectArchiveDirectory(activationRoot, '../decoy');
      const archive = packActivationArchive(activationRoot);
      // Proof: with the selection shape refused only by the launcher, this case read
      // `<extraction parent>/decoy/manifest.json`, matched the configured version and exited 0 —
      // the step joined a manifest the pinned archive never carried.
      const escaped = runActivationProvisioning(
        workflow.path,
        workflow.step,
        archive,
        decoyRevision,
        (runnerTemporary) => {
          write(
            join(runnerTemporary, 'tool-wiki-activation', 'decoy', 'manifest.json'),
            `${JSON.stringify({ sourceRevision: decoyRevision })}\n`,
          );
        },
      );
      const detail = streamText(escaped.invocation.stderr, 'provisioning stderr');
      expect(escaped.invocation.exitCode, detail).toBe(78);
      expect(detail).toContain('../decoy');
      expect(readFileSync(escaped.environmentFile, 'utf8')).toBe('');
    }
  });

  test('push audit reports inactive external activation without certifying', () => {
    const candidate = mkdtempSync(join(tmpdir(), 'tool-wiki-push-candidate-'));
    scratchPaths.push(candidate);
    const invocation = Bun.spawnSync(['bash', pushAuditPath, candidate, 'abc123'], {
      cwd: candidate,
      env: { PATH: process.env['PATH'] ?? '' },
      stderr: 'pipe',
      stdout: 'pipe',
    });

    expect(invocation.exitCode, streamText(invocation.stderr, 'push audit stderr')).toBe(0);
    expect(JSON.parse(streamText(invocation.stdout, 'push audit stdout'))).toMatchObject({
      schemaVersion: 1,
      status: 'inactive',
      certified: false,
    });
  });

  test('push audit refuses a configured root whose activation marker is absent', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tool-wiki-push-missing-marker-'));
    scratchPaths.push(directory);
    const candidate = join(directory, 'candidate');
    const activation = join(directory, 'activation');
    mkdirSync(candidate);
    mkdirSync(activation);
    const invocation = Bun.spawnSync(['bash', pushAuditPath, candidate, 'abc123'], {
      cwd: candidate,
      env: {
        PATH: process.env['PATH'] ?? '',
        TOOL_WIKI_ACTIVATION_ROOT: activation,
      },
      stderr: 'pipe',
      stdout: 'pipe',
    });

    expect(invocation.exitCode).toBe(78);
    expect(streamText(invocation.stderr, 'push audit stderr')).toContain(
      'configured activation root has no marker',
    );
  });

  test('push audit resolves a relative external launcher from its activation root', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tool-wiki-push-audit-'));
    scratchPaths.push(directory);
    const candidate = join(directory, 'candidate');
    const activation = join(directory, 'activation');
    mkdirSync(candidate);
    mkdirSync(activation);
    write(join(activation, 'active-v1'), 'tool-wiki-active-v1\n');
    write(join(activation, 'launcher-path'), 'launcher.sh\n');
    write(join(activation, 'trusted-node-modules/typescript/package.json'), '{}\n');
    write(
      join(activation, 'launcher.sh'),
      '#!/usr/bin/env bash\nprintf \'%s|%s|%s|%s|%s\\n\' "$1" "$2" "$3" "$TOOL_WIKI_TRUSTED_NODE_MODULES" "$TOOL_WIKI_REQUIRE_CERTIFIED"\n',
    );
    chmodSync(join(activation, 'launcher.sh'), 0o555);

    const invocation = Bun.spawnSync(['bash', pushAuditPath, candidate, 'abc123'], {
      cwd: candidate,
      env: {
        PATH: process.env['PATH'] ?? '',
        TOOL_WIKI_ACTIVATION_ROOT: activation,
      },
      stderr: 'pipe',
      stdout: 'pipe',
    });

    expect(invocation.exitCode, streamText(invocation.stderr, 'push audit stderr')).toBe(0);
    expect(streamText(invocation.stdout, 'push audit stdout')).toBe(
      `committed|${realpathSync(candidate)}|abc123|${realpathSync(join(activation, 'trusted-node-modules'))}|1\n`,
    );
  });

  test('push audit refuses an activation archive without trusted runtime modules', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tool-wiki-push-runtime-missing-'));
    scratchPaths.push(directory);
    const candidate = join(directory, 'candidate');
    const activation = join(directory, 'activation');
    mkdirSync(candidate);
    mkdirSync(activation);
    write(join(activation, 'active-v1'), 'tool-wiki-active-v1\n');
    write(join(activation, 'launcher-path'), 'launcher.sh\n');
    write(join(activation, 'launcher.sh'), '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(join(activation, 'launcher.sh'), 0o555);

    const invocation = Bun.spawnSync(['bash', pushAuditPath, candidate, 'abc123'], {
      cwd: candidate,
      env: { PATH: process.env['PATH'] ?? '', TOOL_WIKI_ACTIVATION_ROOT: activation },
      stderr: 'pipe',
      stdout: 'pipe',
    });

    expect(invocation.exitCode).toBe(78);
    expect(streamText(invocation.stderr, 'push audit stderr')).toContain(
      'no trusted TypeScript runtime modules',
    );
  });

  test('push audit refuses a candidate-contained trusted runtime override', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tool-wiki-push-runtime-boundary-'));
    scratchPaths.push(directory);
    const candidate = join(directory, 'candidate');
    const activation = join(directory, 'activation');
    write(join(candidate, 'node_modules/typescript/package.json'), '{}\n');
    mkdirSync(activation);
    write(join(activation, 'active-v1'), 'tool-wiki-active-v1\n');
    write(join(activation, 'launcher-path'), 'launcher.sh\n');
    write(join(activation, 'launcher.sh'), '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(join(activation, 'launcher.sh'), 0o555);

    const invocation = Bun.spawnSync(['bash', pushAuditPath, candidate, 'abc123'], {
      cwd: candidate,
      env: {
        PATH: process.env['PATH'] ?? '',
        TOOL_WIKI_ACTIVATION_ROOT: activation,
        TOOL_WIKI_TRUSTED_NODE_MODULES: join(candidate, 'node_modules'),
      },
      stderr: 'pipe',
      stdout: 'pipe',
    });

    expect(invocation.exitCode).toBe(78);
    expect(streamText(invocation.stderr, 'push audit stderr')).toContain(
      'runtime modules resolved inside candidate checkout',
    );
  });

  test('push audit refuses a launcher resolving into a symlinked candidate workspace', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tool-wiki-push-boundary-'));
    scratchPaths.push(directory);
    const candidate = join(directory, 'candidate');
    const candidateAlias = join(directory, 'candidate-alias');
    const activation = join(directory, 'activation');
    mkdirSync(candidate);
    mkdirSync(activation);
    symlinkSync(candidate, candidateAlias, 'dir');
    write(join(candidate, 'candidate-launcher.sh'), '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(join(candidate, 'candidate-launcher.sh'), 0o555);
    write(join(activation, 'active-v1'), 'tool-wiki-active-v1\n');
    write(join(activation, 'launcher-path'), 'candidate-link.sh\n');
    symlinkSync(join(candidate, 'candidate-launcher.sh'), join(activation, 'candidate-link.sh'));

    const invocation = Bun.spawnSync(['bash', pushAuditPath, candidateAlias, 'abc123'], {
      cwd: candidateAlias,
      env: {
        PATH: process.env['PATH'] ?? '',
        TOOL_WIKI_ACTIVATION_ROOT: activation,
      },
      stderr: 'pipe',
      stdout: 'pipe',
    });

    expect(invocation.exitCode).toBe(78);
    expect(streamText(invocation.stderr, 'push audit stderr')).toContain(
      'external launcher resolved inside candidate checkout',
    );
  });

  test('push audit refuses an activation root inside the candidate workspace', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tool-wiki-push-root-boundary-'));
    scratchPaths.push(directory);
    const candidate = join(directory, 'candidate');
    const activation = join(candidate, 'activation');
    const launcher = join(directory, 'external-launcher.sh');
    mkdirSync(activation, { recursive: true });
    write(launcher, '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(launcher, 0o555);
    write(join(activation, 'active-v1'), 'tool-wiki-active-v1\n');
    write(join(activation, 'launcher-path'), `${launcher}\n`);

    const invocation = Bun.spawnSync(['bash', pushAuditPath, candidate, 'abc123'], {
      cwd: candidate,
      env: {
        PATH: process.env['PATH'] ?? '',
        TOOL_WIKI_ACTIVATION_ROOT: activation,
      },
      stderr: 'pipe',
      stdout: 'pipe',
    });

    expect(invocation.exitCode).toBe(78);
    expect(streamText(invocation.stderr, 'push audit stderr')).toContain(
      'external activation root resolved inside candidate checkout',
    );
  });

  test('CI gives the complete uncached gate its chosen finite allowance', () => {
    const ci = readFileSync(join(workspace, '.github', 'workflows', 'ci.yml'), 'utf8');
    const gate = /jobs:\n {2}gate:\n {4}runs-on: ubuntu-latest\n {4}timeout-minutes: ([0-9]+)/.exec(
      ci,
    );
    if (gate === null) throw new Error('CI gate timeout is absent or malformed');

    // Proof: the production workflow's obsolete 20-minute value failed here on
    // `Expected: 45 · Received: 20` after CI canceled required Tool Wiki work at 20m11s.
    expect(Number(gate[1])).toBe(45);
  });

  test('committed entrypoint certifies the exact external-trust fixture', () => {
    const paths = realFixture();
    const invocation = runRealAdapter('committed', paths);
    const output = streamText(invocation.stdout, 'lint stdout');

    expect(invocation.exitCode, streamText(invocation.stderr, 'lint stderr')).toBe(0);
    expect(JSON.parse(output)).toMatchObject({
      accepted: true,
      certified: true,
      candidateSelection: { kind: 'committed', revision: paths.revision },
    });
  });

  test.each(['staged', 'committed'] as const)(
    '%s whole-tree lint finds a deletion through the unchanged reverse index',
    (selection) => {
      const paths = realFixture();
      git(paths.repository, 'rm', 'src/app.ts');
      if (selection === 'committed') {
        git(paths.repository, 'commit', '--message', 'delete indexed target');
        paths.revision = git(paths.repository, 'rev-parse', 'HEAD');
      }

      const invocation = runRealAdapter(selection, paths);
      const output = `${streamText(invocation.stdout, 'lint stdout')}${streamText(
        invocation.stderr,
        'lint stderr',
      )}`;
      expect(invocation.exitCode).toBe(1);
      expect(output).toContain('membership target absent: src/app.ts');
    },
  );

  test('working whole-tree lint reports untracked content instead of narrowing to tracked paths', () => {
    const paths = realFixture();
    write(join(paths.repository, 'src', 'untracked.ts'), 'export const untracked = true;\n');

    const invocation = runRealAdapter('working', paths);
    const output = `${streamText(invocation.stdout, 'lint stdout')}${streamText(
      invocation.stderr,
      'lint stderr',
    )}`;
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('untracked.ts');
  });

  test('committed entrypoint refuses a stale enforced blob at wiki lint', () => {
    const paths = realFixture();
    write(join(paths.repository, 'src', 'app.ts'), 'export const value = 2;\n');
    git(paths.repository, 'add', '--all');
    git(paths.repository, 'commit', '--message', 'stale application review');
    paths.revision = git(paths.repository, 'rev-parse', 'HEAD');

    const invocation = runRealAdapter('committed', paths);
    const output = streamText(invocation.stdout, 'lint stdout');
    expect(invocation.exitCode, streamText(invocation.stderr, 'lint stderr')).toBe(1);
    expect(JSON.parse(output)).toMatchObject({
      accepted: false,
      unmetObligationIds: ['obligation.application'],
      changedBoundaryIds: ['boundary.application'],
    });
  });

  test('the host gate fails specifically at wiki lint for a stale enforced blob', () => {
    const paths = realFixture();
    const trustedCheckout = paths.revision;
    write(join(paths.repository, 'src', 'app.ts'), 'export const value = 2;\n');
    const candidateAdapter = join(paths.repository, 'bin', 'tool-wiki-lint.sh');
    const candidateSteps = join(paths.repository, 'bin', 'h2puni-gate-steps.sh');
    const suppressedMarker = join(dirname(paths.bindingPath), 'candidate-step-ran');
    write(candidateAdapter, '#!/usr/bin/env bash\nexit 0\n');
    write(
      candidateSteps,
      `#!/usr/bin/env bash\nprintf ran > ${JSON.stringify(suppressedMarker)}\n`,
    );
    chmodSync(candidateAdapter, 0o755);
    chmodSync(candidateSteps, 0o755);
    git(paths.repository, 'add', '--all');
    git(paths.repository, 'commit', '--message', 'stale host candidate');
    paths.revision = git(paths.repository, 'rev-parse', 'HEAD');
    git(paths.repository, 'checkout', '--detach', '--quiet', trustedCheckout);
    const lock = join(dirname(paths.bindingPath), 'host-lock');
    const command =
      'source "$1"; gate_with_pinned_head "$2" "$3" "$4" -- bash -c \'set -euo pipefail; bash "$1" committed "$2" "$3"; exec bash "$4" "$2" "$3"\' pinned "$5" "$2" HEAD "$2/bin/h2puni-gate-steps.sh"';
    const invocation = Bun.spawnSync(
      [
        'bash',
        '-c',
        command,
        'tool-wiki-host-gate-test',
        gateLibraryPath,
        paths.repository,
        lock,
        paths.revision,
        adapterPath,
      ],
      {
        env: {
          ...process.env,
          HEAVY_LOCK_WAIT_SECONDS: '0',
          TOOL_WIKI_ACTIVATION_ROOT: paths.activationRoot,
        },
        stderr: 'pipe',
        stdout: 'pipe',
      },
    );
    const output = `${streamText(invocation.stdout, 'host stdout')}${streamText(
      invocation.stderr,
      'host stderr',
    )}`;

    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('"unmetObligationIds":["obligation.application"]');
    expect(output).not.toContain('Successfully ran');
    expect(existsSync(suppressedMarker)).toBe(false);
    expect(git(paths.repository, 'rev-parse', 'HEAD')).toBe(trustedCheckout);

    const secondInvocation = Bun.spawnSync(
      [
        'bash',
        '-c',
        command,
        'tool-wiki-host-gate-test',
        gateLibraryPath,
        paths.repository,
        lock,
        paths.revision,
        adapterPath,
      ],
      {
        env: {
          ...process.env,
          HEAVY_LOCK_WAIT_SECONDS: '0',
          TOOL_WIKI_ACTIVATION_ROOT: paths.activationRoot,
        },
        stderr: 'pipe',
        stdout: 'pipe',
      },
    );
    expect(secondInvocation.exitCode).toBe(1);
    expect(git(paths.repository, 'rev-parse', 'HEAD')).toBe(trustedCheckout);
    expect(existsSync(suppressedMarker)).toBe(false);
    // Two real validator launches take 4.2s on an idle h2puni and 5.3s under concurrent gates.
    // Keep the test bounded without letting Bun's 5s default kill the second refusal as SIGPIPE.
  }, 15_000);

  test('the real Nx target reruns an omitted-input mutation and a controlled cache fault does not', () => {
    const paths = realFixture();
    if (process.env['NX_TASK_TARGET_PROJECT'] !== undefined) {
      expect(runRealAdapter('committed', paths).exitCode).toBe(0);
      write(join(paths.repository, 'src', 'app.ts'), 'export const nestedNxFault = true;\n');
      git(paths.repository, 'add', 'src/app.ts');
      git(paths.repository, 'commit', '--message', 'nested Nx direct oracle');
      paths.revision = git(paths.repository, 'rev-parse', 'HEAD');
      expect(runRealAdapter('committed', paths).exitCode).toBe(1);
      return;
    }
    const warm = runNxLint(paths);
    expect(
      warm.exitCode,
      `${streamText(warm.stdout, 'warm stdout')}${streamText(warm.stderr, 'warm stderr')}`,
    ).toBe(0);

    write(join(paths.repository, 'src', 'app.ts'), 'export const omittedInputFault = true;\n');
    git(paths.repository, 'add', 'src/app.ts');
    git(paths.repository, 'commit', '--message', 'mutate would-be omitted input');
    paths.revision = git(paths.repository, 'rev-parse', 'HEAD');
    const afterMutation = runNxLint(paths);
    // Proof: the production wiki-cli:lint target reran and failed on obligation.application;
    // the cache-enabled target below returned its warmed success for this same omitted mutation.
    expect(afterMutation.exitCode, streamText(afterMutation.stderr, 'mutated stderr')).toBe(1);

    const cachedPaths = realFixture();
    const nxWorkspace = nxFixture(true, ['{projectRoot}/sentinel.txt']);
    const cachedWarm = runNxLint(cachedPaths, nxWorkspace);
    expect(cachedWarm.exitCode, streamText(cachedWarm.stderr, 'cached warm stderr')).toBe(0);
    write(join(cachedPaths.repository, 'src', 'app.ts'), 'export const cachedFault = true;\n');
    git(cachedPaths.repository, 'add', 'src/app.ts');
    git(cachedPaths.repository, 'commit', '--message', 'cached omitted input');
    cachedPaths.revision = git(cachedPaths.repository, 'rev-parse', 'HEAD');
    const uncachedOracle = runRealAdapter('committed', cachedPaths);
    expect(uncachedOracle.exitCode).toBe(1);
    const cachedMutation = runNxLint(cachedPaths, nxWorkspace);
    const cachedOutput = `${streamText(cachedMutation.stdout, 'cached stdout')}${streamText(cachedMutation.stderr, 'cached stderr')}`;
    expect(cachedMutation.exitCode, cachedOutput).toBe(0);
  }, 30_000);
});
