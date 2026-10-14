import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { SaxesParser } from 'saxes';

import {
  decodeArchitecturePolicy,
  validateArchitectureDiscovery,
  validateArchitectureMapping,
} from './architecture-policy';

/**
 * Runs the explicitly adopted rule negatives as an isolated Architecture level and writes JUnit.
 * Bun receives literal relative file operands; policy and JUnit identities stay canonical bare paths.
 * A mapping covers an adopted rule, not the full registry; Task 2.1 still needs the other rules.
 * @throws when the policy, selector, fixture, runner or report cannot establish a real run.
 */
export function runArchitectureLevel(root: string, report: string): void {
  // Proof: policy IO before mkdir lost [TEST-AXES-086] report-error precedence.
  mkdirSync(dirname(report), { recursive: true });
  // Proof: removing this clear made the unmapped-fixture production negative leave stale JUnit.
  rmSync(report, { force: true });

  const policyPath = join(root, 'src/architecture-fixtures.json');
  const source = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(policyPath));
  const input: unknown = JSON.parse(source);
  const policy = decodeArchitecturePolicy(input);

  // Proof: discovery before decoding lost [TEST-AXES-086] malformed-policy precedence.
  const architectureRoot = join(root, 'src/architecture');
  const discovered = readdirSync(architectureRoot)
    .filter((name) => name.endsWith('.architecture.test.ts'))
    .map((name) => `src/architecture/${name}`);

  const selected = new Set<string>();
  const mappedRules = new Set<string>();
  for (const fixture of policy.fixtures) {
    // Proof: validating all mappings ahead of IO lost [TEST-AXES-086] missing-first refusal.
    validateArchitectureMapping(fixture, mappedRules);
    const absoluteFile = join(root, fixture.file);
    // Proof: disabling this guard made the missing-fixture production negative fail with a raw
    // lstat ENOENT instead of its named mapped-fixture refusal.
    if (!existsSync(absoluteFile)) {
      throw new Error(`mapped architecture fixture is missing: ${fixture.file}`);
    }
    // Proof: disabling this check made the symlink negative fail at JUnit reconciliation after
    // Bun ran the Unit file, instead of refusing the file before execution.
    if (!lstatSync(absoluteFile).isFile()) {
      throw new Error(`mapped architecture fixture is not a regular file: ${fixture.file}`);
    }
    selected.add(fixture.file);
  }

  validateArchitectureDiscovery(discovered, selected);

  const invocation = Bun.spawnSync(
    [
      process.execPath,
      'test',
      // Proof: removing the ./ prefix made [TEST-AXES-091] execute nested failing decoys
      // and leave their markers for both one and two mapped files.
      ...[...selected].sort().map((file) => `./${file}`),
      '--reporter=junit',
      `--reporter-outfile=${resolve(report)}`,
      '--timeout=60000',
    ],
    { cwd: root, stdout: 'pipe', stderr: 'pipe', env: process.env },
  );
  process.stdout.write(invocation.stdout);
  process.stderr.write(invocation.stderr);
  // Proof: disabling this check made the failed-fixture production negative exit 0 with a
  // failed JUnit testcase, which would present a green Nx target.
  if (invocation.exitCode !== 0) {
    throw new Error(`Architecture test runner exited ${String(invocation.exitCode)}`);
  }
  // Proof: architecture-level.test.ts starts with stale XML and requires a fresh named testcase;
  // removing the report path from the Bun invocation leaves this guard refusing the run.
  if (!existsSync(report) || !lstatSync(report).isFile()) {
    throw new Error(`Architecture JUnit report is missing: ${report}`);
  }
  const passing = new Set<string>();
  let current: { file: string; skipped: boolean } | undefined;
  const parser = new SaxesParser({ xmlns: false });
  parser.on('error', (cause) => {
    throw cause;
  });
  parser.on('opentag', (tag) => {
    if (tag.name === 'testcase') {
      const file = tag.attributes['file'];
      // Proof: with the regular-file guard disabled, the symlink negative reached this check:
      // Bun reported src/unit.test.ts and this refused it as unselected.
      if (typeof file !== 'string' || !selected.has(file)) {
        throw new Error(`Architecture JUnit names an unselected file: ${String(file)}`);
      }
      current = { file, skipped: false };
    }
    if (tag.name === 'skipped' && current !== undefined) current.skipped = true;
  });
  parser.on('closetag', (tag) => {
    if (tag.name === 'testcase' && current !== undefined) {
      if (!current.skipped) passing.add(current.file);
      current = undefined;
    }
  });
  parser.write(readFileSync(report, 'utf8')).close();
  // Proof: architecture-level.test.ts changes the only negative to test.skip; without this
  // guard Bun exits 0 and the target publishes an all-skipped report as a green rule run.
  if ([...selected].some((file) => !passing.has(file))) {
    throw new Error('no-cases: Architecture has no passing rule negatives for every mapped file');
  }
}

if (import.meta.main) {
  if (process.argv.length !== 4) {
    throw new Error('usage: architecture-level.ts <project-root> <junit-report>');
  }
  const [root, report] = process.argv.slice(2);
  runArchitectureLevel(resolve(root), resolve(report));
}
