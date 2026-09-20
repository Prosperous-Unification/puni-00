import { Buffer } from 'node:buffer';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

const cliPath = join(import.meta.dir, '..', 'cli.ts');

function runCli(argv: string[]): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync([process.execPath, 'run', cliPath, ...argv], {
    cwd: import.meta.dir,
    env: process.env,
    stderr: 'pipe',
    stdout: 'pipe',
  });
}

function stdoutOf(invocation: ReturnType<typeof Bun.spawnSync>): string {
  if (invocation.stdout === undefined) throw new Error('stdout pipe was unavailable');
  return Buffer.from(invocation.stdout).toString('utf8');
}

function stderrOf(invocation: ReturnType<typeof Bun.spawnSync>): string {
  if (invocation.stderr === undefined) throw new Error('stderr pipe was unavailable');
  return Buffer.from(invocation.stderr).toString('utf8');
}

interface TemplateListing {
  schemaVersion: number;
  templates: { id: string; version: string; subject: string; generates: string }[];
}

interface ShownTemplate {
  id: string;
  subject: string;
  files: { path: string; required: boolean; content: string }[];
  requirements: { id: string; statement: string; rules: string[]; constraint: { kind: string } }[];
}

describe('template registry CLI', () => {
  test('lists every registered template in identifier order', () => {
    const invocation = runCli(['template', 'list']);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    const listing = JSON.parse(stdoutOf(invocation)) as TemplateListing;
    expect(listing.schemaVersion).toBe(1);
    expect(listing.templates.map((template) => template.id)).toEqual([
      'feature-service',
      'repository',
      'resource-service',
    ]);
    expect(listing.templates.map((template) => template.subject)).toEqual(['file', 'file', 'file']);
  }, 30_000);

  test('shows one template with its skeleton files and its constrained requirements', () => {
    const invocation = runCli(['template', 'show', 'repository']);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    const shown = JSON.parse(stdoutOf(invocation)) as ShownTemplate;
    expect(shown.files.map((file) => file.path)).toEqual([
      'contract.ts',
      '<name>.repository.ts',
      '<name>.repository.test.ts',
    ]);
    expect(shown.files[1].content).toContain('// @port ./contract#<Name>Port');
    expect(shown.requirements.map((requirement) => requirement.id)).toEqual([
      'repository.suffix',
      'repository.one-kind',
      'repository.port',
      'repository.conformance-test',
      'repository.no-service-import',
    ]);
    expect(shown.requirements.map((requirement) => requirement.constraint.kind)).toEqual([
      'name-suffix',
      'one-kind-per-file',
      'declares-one',
      'sibling-test',
      'imports-no-kind',
    ]);
  }, 30_000);

  test('refuses an unregistered template identifier and names every registered template', () => {
    const invocation = runCli(['template', 'show', 'NO-SUCH-TEMPLATE']);
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain(
      'unknown template: NO-SUCH-TEMPLATE (registered: feature-service, repository, resource-service)',
    );
  }, 30_000);

  test('refuses an unknown template action', () => {
    const invocation = runCli(['template', 'summon']);
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain('usage: twilight-bureaucrat template <list|show');
  }, 30_000);
});

const scratchRoots: string[] = [];

afterEach(() => {
  for (const root of scratchRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function runGit(repository: string, argv: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  expect(invocation.exitCode, invocation.stderr.toString('utf8')).toBe(0);
  return invocation.stdout.toString('utf8').trim();
}

function write(root: string, path: string, source: string): void {
  const absolutePath = join(root, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source, 'utf8');
}

const conformingReadme = `# Widget

One sentence on the value this module delivers.

## What it owns

- The widget gesture.

## What it does not own

- The widget's stored shape.

## Relationships

The exported types are in \`contract.ts\`.

## Checks

The \`test\` target runs \`widget.feature.test.ts\`.
`;

const conformingFeature = `import type { Widget } from './contract';

/** One gesture. */
// @capability widget-editing
export function createWidget(): Widget {
  return { ready: true };
}
`;

const conformingRepository = `/** Raw access to the store. */
// @port ./contract#WidgetPort
export function store(): void {}
`;

function initFixture(prefix: string): string {
  const repository = mkdtempSync(join(tmpdir(), prefix));
  scratchRoots.push(repository);
  runGit(repository, ['init', '--initial-branch=main']);
  runGit(repository, ['config', 'user.email', 'templates@example.test']);
  runGit(repository, ['config', 'user.name', 'Templates Fixture']);
  return repository;
}

/** Commits whatever the test has just written and returns the new revision. */
function commit(repository: string, message: string): string {
  runGit(repository, ['add', '--all']);
  runGit(repository, ['commit', '--message', message]);
  return runGit(repository, ['rev-parse', 'HEAD']);
}

/** A module directory that satisfies every requirement of every template. */
function createConformingCandidate(): { repository: string; revision: string } {
  const repository = initFixture('twilight-templates-');
  write(repository, 'src/modules/widget/README.md', conformingReadme);
  write(
    repository,
    'src/modules/widget/contract.ts',
    'export interface Widget {\n  readonly ready: boolean;\n}\n',
  );
  write(repository, 'src/modules/widget/widget.feature.ts', conformingFeature);
  write(repository, 'src/modules/widget/store.repository.ts', conformingRepository);
  write(
    repository,
    'src/modules/widget/store.repository.test.ts',
    "import { test } from 'bun:test';\ntest('adapter', () => {});\n",
  );
  write(
    repository,
    'src/modules/widget/widget.feature.test.ts',
    "import { test } from 'bun:test';\ntest('gesture', () => {});\n",
  );
  write(repository, 'src/modules/widget/view/use-widget.ts', 'export const view = 1;\n');
  return { repository, revision: commit(repository, 'fixture') };
}

interface Verification {
  schemaVersion: number;
  templateId: string;
  templateVersion: string;
  subject: string;
  conforms: boolean;
  findings: { requirementId: string; path: string; message: string }[];
  certifies: boolean;
}

function verificationOf(invocation: ReturnType<typeof Bun.spawnSync>): Verification {
  return JSON.parse(stdoutOf(invocation)) as Verification;
}

function verify(
  templateId: string,
  repository: string,
  revision: string,
  subject: string,
): ReturnType<typeof Bun.spawnSync> {
  return runCli(['template', 'verify', templateId, 'committed', repository, revision, subject]);
}

describe('template verify, one file', () => {
  test('allows a repository adapter that names its port and has its sibling test', () => {
    const { repository, revision } = createConformingCandidate();
    const invocation = verify(
      'repository',
      repository,
      revision,
      'src/modules/widget/store.repository.ts',
    );
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verificationOf(invocation)).toEqual({
      schemaVersion: 1,
      templateId: 'repository',
      templateVersion: '1.0.0',
      subject: 'src/modules/widget/store.repository.ts',
      conforms: true,
      findings: [],
      certifies: false,
    });
  }, 30_000);

  test('reports a file whose name lacks the kind suffix', () => {
    const { repository, revision } = createConformingCandidate();
    const invocation = verify(
      'feature-service',
      repository,
      revision,
      'src/modules/widget/contract.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings).toEqual([
      {
        requirementId: 'feature.suffix',
        path: 'src/modules/widget/contract.ts',
        message: 'file name does not end in .feature.ts',
      },
      {
        requirementId: 'feature.capability',
        path: 'src/modules/widget/contract.ts',
        message: 'file states 0 @capability tags, expected exactly 1',
      },
    ]);
  }, 30_000);

  test('reports a service that states two declaration tags', () => {
    const { repository } = createConformingCandidate();
    write(
      repository,
      'src/modules/widget/widget.feature.ts',
      `${conformingFeature}// @capability widget-sharing\n`,
    );
    const revision = commit(repository, 'two capabilities');
    const invocation = verify(
      'feature-service',
      repository,
      revision,
      'src/modules/widget/widget.feature.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings).toEqual([
      {
        requirementId: 'feature.capability',
        path: 'src/modules/widget/widget.feature.ts',
        message: 'file states 2 @capability tags, expected exactly 1',
      },
    ]);
  }, 30_000);

  test('counts a declaration tag only when it is a real line comment', () => {
    const { repository } = createConformingCandidate();
    write(
      repository,
      'src/modules/widget/widget.feature.ts',
      `const quoted = \`\n// @capability quoted-widget\n\`;\n/*\n// @capability commented-widget\n*/\nexport const sample = quoted;\n`,
    );
    const revision = commit(repository, 'tags that are not declarations');
    const invocation = verify(
      'feature-service',
      repository,
      revision,
      'src/modules/widget/widget.feature.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings).toEqual([
      {
        requirementId: 'feature.capability',
        path: 'src/modules/widget/widget.feature.ts',
        message: 'file states 0 @capability tags, expected exactly 1',
      },
    ]);
  }, 30_000);

  test('does not count a fake declaration inside a nested template literal', () => {
    const { repository } = createConformingCandidate();
    write(
      repository,
      'src/modules/widget/widget.feature.ts',
      `const quoted = \`outer \${\`\n// @capability fake\n\`} tail\`;\nexport const sample = quoted;\n`,
    );
    const revision = commit(repository, 'a fake tag inside a nested template');
    const invocation = verify(
      'feature-service',
      repository,
      revision,
      'src/modules/widget/widget.feature.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings).toEqual([
      {
        requirementId: 'feature.capability',
        path: 'src/modules/widget/widget.feature.ts',
        message: 'file states 0 @capability tags, expected exactly 1',
      },
    ]);
  }, 30_000);

  test('counts a genuine declaration inside a template interpolation', () => {
    const { repository } = createConformingCandidate();
    write(
      repository,
      'src/modules/widget/widget.feature.ts',
      `import type { Widget } from './contract';\n\nconst label = \`outer \${(() => {\n// @capability widget-editing\nreturn 'inner';\n})()} tail\`;\nexport function createWidget(): Widget {\n  return { ready: true };\n}\n`,
    );
    const revision = commit(repository, 'a real declaration inside an interpolation');
    const invocation = verify(
      'feature-service',
      repository,
      revision,
      'src/modules/widget/widget.feature.ts',
    );
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verificationOf(invocation).findings).toEqual([]);
  }, 30_000);

  test('reports a side-effect import of a repository and ignores comments and strings', () => {
    const { repository } = createConformingCandidate();
    write(
      repository,
      'src/modules/widget/widget.feature.ts',
      `import './store.repository';\n// import { store } from './other.repository';\nconst sample = "from './third.repository'";\n${conformingFeature}export const used = sample;\n`,
    );
    const revision = commit(repository, 'a side-effect import');
    const invocation = verify(
      'feature-service',
      repository,
      revision,
      'src/modules/widget/widget.feature.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings).toEqual([
      {
        requirementId: 'feature.no-repository-import',
        path: 'src/modules/widget/widget.feature.ts',
        message: 'the file imports ./store.repository, which declares the repository kind',
      },
    ]);
  }, 30_000);

  test('reports a resource that imports a feature and a repository that imports a resource', () => {
    const { repository } = createConformingCandidate();
    write(
      repository,
      'src/modules/widget/widget.resource.ts',
      "import { createWidget } from './widget.feature';\n/** A resource. */\n// @term widget\nexport const widget = createWidget;\n",
    );
    write(
      repository,
      'src/modules/widget/store.repository.ts',
      `import { widget } from './widget.resource';\n${conformingRepository}export const held = widget;\n`,
    );
    const revision = commit(repository, 'forbidden imports');
    const resource = verify(
      'resource-service',
      repository,
      revision,
      'src/modules/widget/widget.resource.ts',
    );
    expect(resource.exitCode).toBe(1);
    expect(verificationOf(resource).findings).toEqual([
      {
        requirementId: 'resource.no-feature-import',
        path: 'src/modules/widget/widget.resource.ts',
        message: 'the file imports ./widget.feature, which declares the feature kind',
      },
    ]);
    const adapter = verify(
      'repository',
      repository,
      revision,
      'src/modules/widget/store.repository.ts',
    );
    expect(adapter.exitCode).toBe(1);
    expect(verificationOf(adapter).findings).toEqual([
      {
        requirementId: 'repository.no-service-import',
        path: 'src/modules/widget/store.repository.ts',
        message: 'the file imports ./widget.resource, which declares the resource kind',
      },
    ]);
  }, 30_000);

  test('reports a repository adapter with no sibling test', () => {
    const { repository } = createConformingCandidate();
    rmSync(join(repository, 'src/modules/widget/store.repository.test.ts'));
    const revision = commit(repository, 'drop the conformance test');
    const invocation = verify(
      'repository',
      repository,
      revision,
      'src/modules/widget/store.repository.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings).toEqual([
      {
        requirementId: 'repository.conformance-test',
        path: 'src/modules/widget/store.repository.ts',
        message: 'no sibling store.repository.test.ts proves this file',
      },
    ]);
  }, 30_000);

  test('reports a standalone file whose name declares two kinds', () => {
    const { repository } = createConformingCandidate();
    write(repository, 'src/modules/widget/widget.feature.resource.ts', conformingFeature);
    const revision = commit(repository, 'two kinds in one name');
    const invocation = verify(
      'resource-service',
      repository,
      revision,
      'src/modules/widget/widget.feature.resource.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings.map((finding) => finding.requirementId)).toEqual([
      'resource.one-kind',
      'resource.term',
    ]);
  }, 30_000);

  test('refuses a file that does not parse', () => {
    const { repository } = createConformingCandidate();
    write(repository, 'src/modules/widget/widget.feature.ts', 'import { a } from ;;;\n');
    const revision = commit(repository, 'unparsable');
    const invocation = verify(
      'feature-service',
      repository,
      revision,
      'src/modules/widget/widget.feature.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain(
      'cannot scan the imports of src/modules/widget/widget.feature.ts',
    );
    expect(stdoutOf(invocation)).toBe('');
  }, 30_000);

  test('refuses a candidate file that is not UTF-8', () => {
    const { repository } = createConformingCandidate();
    writeFileSync(
      join(repository, 'src/modules/widget/widget.feature.ts'),
      Buffer.from([0x2f, 0x2f, 0x20, 0xff, 0x0a]),
    );
    const revision = commit(repository, 'invalid bytes');
    const invocation = verify(
      'feature-service',
      repository,
      revision,
      'src/modules/widget/widget.feature.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain(
      'candidate file src/modules/widget/widget.feature.ts is not UTF-8',
    );
  }, 30_000);

  test('refuses a subject that selects nothing', () => {
    const { repository, revision } = createConformingCandidate();
    const invocation = verify(
      'feature-service',
      repository,
      revision,
      'src/modules/widget/absent.feature.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain(
      'subject selects no candidate file: src/modules/widget/absent.feature.ts',
    );
  }, 30_000);

  test('refuses a subject that is not candidate-relative', () => {
    const { repository, revision } = createConformingCandidate();
    const invocation = verify('feature-service', repository, revision, '/etc/passwd');
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain(
      'subject must be a candidate-relative path: /etc/passwd',
    );
  }, 30_000);

  test('refuses a file template pointed at a directory', () => {
    const { repository, revision } = createConformingCandidate();
    const invocation = verify('feature-service', repository, revision, 'src/modules/widget');
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain(
      'template feature-service verifies one file; src/modules/widget is not one',
    );
  }, 30_000);

  test('refuses an unknown candidate selection kind', () => {
    const { repository, revision } = createConformingCandidate();
    const invocation = runCli([
      'template',
      'verify',
      'feature-service',
      'bogus',
      repository,
      revision,
      'src/modules/widget/widget.feature.ts',
    ]);
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain('usage: twilight-bureaucrat template <list|show');
    expect(stdoutOf(invocation)).toBe('');
  }, 30_000);
});

describe('the template record drives verification', () => {
  const probeFile = {
    path: 'a/b.feature.ts',
    relativePath: 'b.feature.ts',
    text: 'export const value = 1;\n',
  };
  const probeTemplate = {
    id: 'feature-service',
    version: '9.9.9',
    subject: 'file',
    generates: 'a probe',
    files: [],
    requirements: [
      {
        id: 'probe.tag',
        statement: 'the probe names one capability',
        rules: [],
        constraint: { kind: 'declares-one', tag: 'capability' },
      },
    ],
  } as const;

  test('evaluates exactly the requirements the template states', async () => {
    const { verifyArtifact } = await import('./verify');
    expect(verifyArtifact(probeTemplate, probeFile.path, [probeFile], () => []).findings).toEqual([
      {
        requirementId: 'probe.tag',
        path: 'a/b.feature.ts',
        message: 'file states 0 @capability tags, expected exactly 1',
      },
    ]);
    expect(
      verifyArtifact({ ...probeTemplate, requirements: [] }, probeFile.path, [probeFile], () => [])
        .conforms,
    ).toBe(true);
  });

  test('refuses a requirement whose constraint no file artifact can satisfy', async () => {
    const { verifyArtifact } = await import('./verify');
    const mismatched = {
      ...probeTemplate,
      requirements: [
        {
          id: 'probe.module',
          statement: 'the probe carries an index',
          rules: [],
          constraint: { kind: 'required-file', path: 'README.md' },
        },
      ],
    } as const;
    expect(() => verifyArtifact(mismatched, probeFile.path, [probeFile], () => [])).toThrow(
      'template requirement probe.module states a required-file constraint, which no file artifact can satisfy',
    );
  });
});
