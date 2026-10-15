import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { ClassificationPolicy } from '../contracts/records';
import type { ClassifiedCandidate } from '../inventory/classify-entries';
import { buildPackage } from '../packaging/build';
import { packPackage } from '../packaging/pack';

const workspace = resolve(import.meta.dir, '../../../../../..');
const packageSource = join(workspace, 'apps/twilight-structure/twilight-burokrat/cli');
const scratch = mkdtempSync(join(tmpdir(), 'website-binaries-'));
const paths = [
  'apps/website/fe-01/public/apple-touch-icon.png',
  'apps/website/fe-01/public/favicon-32.png',
  'apps/website/fe-01/public/favicon.ico',
  'apps/website/fe-01/src/assets/fonts/Geist-variable.ttf',
  'apps/website/fe-01/src/assets/fonts/InterTight-variable.ttf',
];
const policy = JSON.parse(
  readFileSync(join(workspace, 'docs/code-organization/rule-policy.json'), 'utf8'),
) as { classificationPolicy: ClassificationPolicy; ruleModes: { ruleId: string; mode: string }[] };
const declarations = policy.classificationPolicy.binaryDeclarations.filter(
  (declaration: { path: string }) => paths.includes(declaration.path),
);
const installed = join(scratch, 'consumer/node_modules/.bin/twib');

function runCommand(command: string[], cwd = scratch) {
  return Bun.spawnSync(command, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, BUN_TMPDIR: scratch, BUN_INSTALL_CACHE_DIR: join(scratch, 'cache') },
  });
}

function runGit(repository: string, ...argv: string[]): string {
  const invocation = runCommand(['git', '-C', repository, ...argv]);
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}

function createCandidate() {
  const repository = mkdtempSync(join(scratch, 'candidate-'));
  runGit(repository, 'init', '--initial-branch=main');
  runGit(repository, 'config', 'user.email', 'website@example.test');
  runGit(repository, 'config', 'user.name', 'Website Fixture');
  for (const path of paths) {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    copyFileSync(join(workspace, path), join(repository, path));
  }
  runGit(repository, 'add', '--all');
  runGit(repository, 'commit', '-m', 'five website binaries');
  return { repository, revision: runGit(repository, 'rev-parse', 'HEAD') };
}

function writePolicy(omitted?: string): string {
  const path = join(scratch, 'policy.json');
  writeFileSync(
    path,
    JSON.stringify({
      ...policy,
      ruleModes: policy.ruleModes.map((rule: { ruleId: string; mode: string }) => ({
        ...rule,
        mode: rule.ruleId === 'INV-CLASSIFY' ? 'enforce' : rule.mode,
      })),
      classificationPolicy: {
        ...policy.classificationPolicy,
        binaryDeclarations: policy.classificationPolicy.binaryDeclarations.filter(
          (declaration: { path: string }) => declaration.path !== omitted,
        ),
      },
    }),
  );
  return path;
}

beforeAll(async () => {
  const packaged = join(scratch, 'package');
  await buildPackage(packaged);
  copyFileSync(join(packageSource, 'package.json'), join(packaged, 'package.json'));
  await packPackage(packaged, join(scratch, 'tarballs'), (command, options) =>
    Bun.spawnSync(command, { ...options, stdout: 'pipe' }),
  );
  mkdirSync(join(scratch, 'consumer'));
  writeFileSync(join(scratch, 'consumer/package.json'), '{"private":true}');
  const added = runCommand(
    ['bun', 'add', '--ignore-scripts', join(scratch, 'tarballs/twilight-burokrat-0.1.0.tgz')],
    join(scratch, 'consumer'),
  );
  expect(added.exitCode, added.stderr.toString()).toBe(0);
}, 120_000);

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

for (const [name, executable] of [
  ['production CLI', join(packageSource, 'src/cli.ts')],
  ['installed package', installed],
]) {
  describe(`website binaries through ${name}`, () => {
    function checkCandidate(repository: string, revision: string, omitted?: string) {
      return runCommand([
        process.execPath,
        executable,
        'check',
        'committed',
        repository,
        revision,
        writePolicy(omitted),
        '--rule',
        'INV-CLASSIFY',
      ]);
    }

    // Proof: removing the five repository declarations made both positive entrypoint
    // tests fail at the real CLI: expected acceptance exit 0, observed refusal exit 1.
    test('accepts five actual binaries and emits their exact declarations', () => {
      const { repository, revision } = createCandidate();
      const invocation = checkCandidate(repository, revision);
      expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
      expect(declarations).toEqual(
        paths.map((path) => ({
          path,
          format: path.endsWith('.ttf')
            ? 'font/ttf'
            : path.endsWith('.ico')
              ? 'image/vnd.microsoft.icon'
              : 'image/png',
          consumer: path.endsWith('.ttf')
            ? 'apps/website/fe-01/src/style.css'
            : 'apps/website/fe-01/index.html',
          regenerationAuthority: {
            kind: 'source',
            path: path.endsWith('.ttf')
              ? 'apps/website/fe-01/src/assets/fonts/README.md'
              : 'docs/website/app-icons.md',
          },
        })),
      );
      const verdict = JSON.parse(invocation.stdout.toString()) as {
        allowed: boolean;
        unevaluated: unknown[];
      };
      expect(verdict.allowed).toBe(true);
      expect(verdict.unevaluated).toEqual([]);
      const classification = join(scratch, 'classification.json');
      writeFileSync(classification, JSON.stringify(policy.classificationPolicy));
      const classified = runCommand([
        process.execPath,
        executable,
        'classify-candidate',
        'committed',
        repository,
        revision,
        classification,
      ]);
      expect(classified.exitCode, classified.stderr.toString()).toBe(0);
      const { entries } = JSON.parse(classified.stdout.toString()) as ClassifiedCandidate;
      expect(entries).toHaveLength(5);
      for (const declaration of declarations) {
        expect(entries.find((entry) => entry.path === declaration.path)?.classification).toEqual({
          kind: 'content',
          contentClass: 'binary',
          format: declaration.format,
          consumer: declaration.consumer,
          regenerationAuthority: declaration.regenerationAuthority,
        });
      }
    }, 60_000);

    // Proof: each declaration removed independently makes this real CLI refuse its exact asset.
    test('refuses each individually omitted declaration', () => {
      const { repository, revision } = createCandidate();
      for (const path of paths) {
        const invocation = checkCandidate(repository, revision, path);
        expect(invocation.exitCode).toBe(1);
        expect(invocation.stdout.toString()).toContain(`undeclared binary content at ${path}`);
      }
    }, 60_000);

    // Proof: widening the production binary lookup to include neighbor.png made both
    // entrypoint tests fail: expected refusal exit 1, observed acceptance exit 0.
    test('refuses an undeclared neighboring PNG', () => {
      const { repository } = createCandidate();
      const path = 'apps/website/fe-01/public/neighbor.png';
      copyFileSync(join(repository, paths[0]), join(repository, path));
      runGit(repository, 'add', '--all');
      runGit(repository, 'commit', '-m', 'unknown neighbor');
      const invocation = checkCandidate(repository, runGit(repository, 'rev-parse', 'HEAD'));
      expect(invocation.exitCode).toBe(1);
      expect(invocation.stdout.toString()).toContain(`undeclared binary content at ${path}`);
    }, 60_000);

    // Proof: accepting a declaration without checking binary bytes made both entrypoint
    // tests fail: expected refusal exit 1, observed acceptance exit 0.
    test('refuses ordinary UTF-8 at every declared binary path', () => {
      for (const path of paths) {
        const { repository } = createCandidate();
        writeFileSync(join(repository, path), 'ordinary text\n');
        runGit(repository, 'add', '--all');
        runGit(repository, 'commit', '-m', 'contradict binary declaration');
        const invocation = checkCandidate(repository, runGit(repository, 'rev-parse', 'HEAD'));
        expect(invocation.exitCode).toBe(1);
        expect(invocation.stdout.toString()).toContain(
          `declared binary ${path} contains ordinary UTF-8 text`,
        );
      }
    }, 60_000);

    // Proof: routing committed selections through readStaged made both entrypoint tests
    // fail: expected acceptance exit 0, observed refusal exit 1 for the staged text decoys.
    test('classifies the requested commit despite staged and working text replacements', () => {
      const { repository, revision } = createCandidate();
      for (const path of paths) writeFileSync(join(repository, path), 'staged text\n');
      runGit(repository, 'add', '--all');
      for (const path of paths) writeFileSync(join(repository, path), 'working text\n');
      const invocation = checkCandidate(repository, revision);
      expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
      const verdict = JSON.parse(invocation.stdout.toString()) as { unevaluated: unknown[] };
      expect(verdict.unevaluated).toEqual([]);
    }, 60_000);
  });
}
