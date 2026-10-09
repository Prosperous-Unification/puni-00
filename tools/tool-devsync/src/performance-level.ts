import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { decodePerformanceCases } from '@shared/test-evidence';

const declarationPath = 'apps/wbs/fe-01/playwright.performance.cases.json';
const configPath = 'apps/wbs/fe-01/playwright.performance.config.ts';
const reportPath = 'tmp/junit/wbs-fe-01.performance.xml';
const bindingPath = 'tmp/junit/wbs-fe-01.performance.manifest.json';

/** Clears prior evidence, then reads the candidate's Performance selection. */
export async function runPerformanceLevel(candidateRoot: string): Promise<void> {
  const report = join(candidateRoot, reportPath);
  const binding = join(candidateRoot, bindingPath);
  await mkdir(join(candidateRoot, 'tmp/junit'), { recursive: true });
  // Proof: omitting this removal left the stale passing XML readable after the named no-cases
  // refusal, and "clears stale JUnit and refuses a valid empty selection" failed.
  await rm(report, { force: true });
  // Proof: omitting this removal left stale passing provenance readable after the
  // no-cases refusal, failing "clears stale JUnit and refuses a valid empty selection".
  await rm(binding, { force: true });

  const source = await readFile(join(candidateRoot, declarationPath), 'utf8');
  const declaration = decodePerformanceCases(JSON.parse(source));
  // Proof: disabling this match made the changed-config production test fail with the
  // later runner error instead of refusing the candidate's replacement config.
  if (declaration.config !== configPath) {
    throw new Error(`Performance config identity mismatch: ${declaration.config}`);
  }
  // Proof: skipping this read made the missing-config production test report no-cases instead
  // of ENOENT; the absent/unreadable-config test failed before reaching its EISDIR branch.
  await readFile(join(candidateRoot, configPath));
  // Proof: disabling this match made the changed-project production test fail with the
  // later runner error instead of refusing the candidate's replacement project.
  if (declaration.project !== 'chromium') {
    throw new Error(`Performance project identity mismatch: ${declaration.project}`);
  }
  // Proof: replacing this predicate with false made the production empty-selection test receive
  // "runner execution is not yet implemented" instead of the named no-cases refusal.
  if (declaration.cases.length === 0) {
    throw new Error('no-cases: no performance fixtures declare thresholds');
  }
  throw new Error('Performance runner execution is not yet implemented');
}

if (import.meta.main) {
  await runPerformanceLevel(process.cwd());
}
