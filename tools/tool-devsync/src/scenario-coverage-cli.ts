import { readFile } from 'node:fs/promises';

import {
  assertReportCovers,
  assertReportIsCurrent,
  collectedFiles,
  levelTargetNamed,
  parseLevelCommand,
  passedCitations,
  readJUnitReport,
  readManifest,
  readSpec,
  scenarioIdentifiers,
  uncoveredScenarios,
  WORKSPACE,
} from './test-levels';

/**
 * Prints the scenario coverage table of one capability from the JUnit reports of
 * the declared level targets that were named.
 *
 * Usage: `bun tools/tool-devsync/src/scenario-coverage-cli.ts <capability> <project:target>…`
 *
 * The report path is not an argument: it is the one the declaration names, so a
 * caller cannot hand the join a file from somewhere else. Each report is then
 * checked against the target that was supposed to write it and against the
 * modification times of the files it names.
 *
 * The hand-run predecessor of `twib coverage scenarios`. It computes no
 * disposition and refuses no scenario: rule T2 is not enforced yet, so an
 * uncovered scenario is reported and the command still exits zero.
 *
 * @throws when no capability or no target is named, when a named target is not a
 * declared level target or is absent from its manifest, when its report is
 * absent, unreadable, malformed, written by another run or older than a file it
 * names, or when the specification has a scenario with no identifier.
 */
async function main(): Promise<void> {
  const argv = Bun.argv.slice(2);
  const capability = argv.at(0);
  const names = argv.slice(1);
  // Proof (E-7, E-8): invoking the command with no arguments and with only the capability each
  // failed with this usage message (2026-09-20).
  if (capability === undefined || names.length === 0) {
    throw new Error('usage: scenario-coverage-cli.ts <capability> <project:target>…');
  }
  const spec = await readSpec(capability);
  const cited = new Set<string>();
  for (const name of names) {
    const target = levelTargetNamed(name);
    const manifest = await readManifest(target.root);
    const command = manifest.targets[target.target]?.options?.command;
    // Proof (E-10): structurally deleting targets["test:unit"].options.command from wbs-core's
    // manifest made the coverage command refuse that declared target by name (2026-09-20).
    if (command === undefined) throw new Error(`${name} is not declared in its project manifest`);
    const collected = collectedFiles(target.root, parseLevelCommand(command).selector);
    let text;
    try {
      text = await readFile(new URL(target.report, WORKSPACE), 'utf8');
    } catch (cause) {
      // Proof (E-6): replacing the core Unit report with absence and then a directory made the
      // coverage command refuse it as unreadable with ENOENT and EISDIR respectively (2026-09-20).
      // Context and rethrow: an absent or unreadable report is trusted state
      // that is gone, and an empty ledger in its place reads as full coverage.
      throw new Error(`${name} has no readable report at ${target.report}`, { cause });
    }
    const cases = readJUnitReport(text);
    assertReportCovers(target, cases, collected);
    await assertReportIsCurrent(target, cases);
    for (const id of passedCitations(cases)) cited.add(id);
  }
  const uncovered = new Set(uncoveredScenarios(spec, cited));
  const rows = scenarioIdentifiers(spec).map(
    (id) => `| ${id} | ${uncovered.has(id) ? '**no**' : 'yes'} |`,
  );
  console.log(
    ['| Scenario | Covered by a passing citing test |', '| --- | --- |', ...rows].join('\n'),
  );
}

await main();
