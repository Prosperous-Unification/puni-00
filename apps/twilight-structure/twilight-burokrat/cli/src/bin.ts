import { join } from 'node:path';

import { readInstalledToolkit } from './packaging/installed';
import { packageVersion } from './packaging/manifest';
import { prepareToolkitActivation } from './policy/prepare-activation-cli';
import { prepareRelocationActivation } from './policy/prepare-relocation-activation-cli';

const validatorCommands = new Set([
  'validate',
  'validate-record',
  // Proof: omitting this route failed the installed receipt report in packaging/build.test.ts (2026-10-15).
  'validate-progress-receipt',
  // Proof: removing this route made built executable plan validation exit 1 with unknown
  // command instead of a consistency report (packaging/build.test.ts, 2026-10-13).
  'validate-plan-tasks',
  'read-candidate',
  'classify-candidate',
  'content-manifest',
  'validate-artifacts',
  'extract-relationships',
  'check-indexes',
  'check-root-migration',
  'validate-review-provenance',
  'freeze-exhaustive',
  'verify-exhaustive',
  'evaluate-exhaustive-coverage',
  'lint-local',
  'lint-ci',
  'explain',
  'check',
  'scenario',
  'inspect-manual',
  // Proof: removing registration made the installed executable reject the documented command.
  'inspect-manual-observation',
  // Proof: omitting registration made the built coverage dispatch test report unknown command before installed authority.
  'inspect-evaluation-coverage',
  'inspect-performance',
  // Proof: removing this registration made the built executable reject the command before
  // the validator's named usage refusal (installed-dispatch.test.ts).
  'inspect-performance-sources',
  'inspect-test-reports',
  // Proof: removing registration failed TEST-AXES-131's built installed Browser scenario dispatch.
  'inspect-browser-scenarios',
  'inspect-browser-source-levels',
  // Proof: removing registration failed TEST-AXES-124's built installed Browser level dispatch.
  'inspect-browser-levels',
  'inspect-test-sources',
  // Proof: removing this documented diagnostic's registration failed the same packaged test.
  'inspect-spec-sources',
  // Proof: removing this installed registration fails installed-dispatch.test.ts with an
  // unknown-command refusal instead of the validator's named usage refusal.
  'inspect-level-facts',
  // Proof: removing this registration failed [TEST-AXES-090]'s packaged executable success.
  'inspect-performance-levels',
  // Proof: removing this route failed TEST-AXES-099's real installed scenario dispatch.
  'inspect-performance-scenarios',
  // Proof: removing registration failed TEST-AXES-106's built installed ledger dispatch.
  'inspect-scenario-ledger',
  // Proof: removing registration failed TEST-AXES-139's real built installed dispatch.
  'inspect-browser-scenario-ledger',
  // Proof: removal failed BROWSER-T2-POLICY-PREVIEW-012's real installed dispatch parity.
  'inspect-browser-t2-policy',
  // Proof: registration removal failed TEST-AXES-143's built installed diagnostic parity.
  'inspect-browser-t2',
  // Proof: removing this registration failed TEST-AXES-095's real installed executable success.
  'inspect-browser-memberships',
  // Proof: removing registration failed TEST-AXES-115's real built installed executable dispatch.
  'inspect-browser-performance',
  // Proof: removing registration failed TEST-AXES-111's real built installed executable success.
  'inspect-browser-architecture',
  // Proof: removing registration failed TEST-AXES-103's real built executable success.
  'inspect-browser-conformance',
  'template',
  'validate-policy-activation',
]);

const help = `usage: twilight-burokrat <command> ...

commands:
  twilight-burokrat validate-record <kind> <json>
  twilight-burokrat validate-progress-receipt <receipt.json> <plan-reference.json> <tasks.json>
  twilight-burokrat validate-plan-tasks <plan-reference.json> <tasks.json>
  twilight-burokrat check <committed|staged|working> <repository> <revision-or-base> <rule-policy-json> [--rule <rule-id>] [--performance-evidence <json>]
  twilight-burokrat inspect-evaluation-coverage <repository> <full-sha> <external-rule-policy> <external-coverage-review>
  twilight-burokrat inspect-performance <repository> <committed-sha> <external-rule-policy>
  twilight-burokrat inspect-browser-scenarios <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <review-authority> <conformance-authority> <architecture-authority> <performance-authority> <capability>
  twilight-burokrat inspect-browser-source-levels <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <review-authority> <conformance-authority> <architecture-authority> <performance-authority>
  twilight-burokrat inspect-browser-levels <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <review-authority> <conformance-authority> <architecture-authority> <performance-authority>
  twilight-burokrat inspect-performance-sources <repository> <committed-sha> <external-rule-policy>
  twilight-burokrat inspect-spec-sources <repository> <committed-sha>
  twilight-burokrat inspect-browser-performance <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <external-authority>
  twilight-burokrat inspect-browser-architecture <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <external-authority>
  twilight-burokrat inspect-browser-conformance <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <external-authority>
  twilight-burokrat inspect-browser-memberships <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <external-authority>
  twilight-burokrat inspect-performance-levels <repository> <committed-sha> <external-facts-authority> <external-rule-policy>
  twilight-burokrat inspect-browser-t2-policy <repository> <full-committed-sha> <external-rule-policy> <capability> <external-ledger-authority> <external-proposed-policy> --now <UTC-instant>
  twilight-burokrat inspect-browser-t2 <repository> <full-committed-sha> <external-rule-policy> <capability> <external-ledger-authority> --now <UTC-instant>
  twilight-burokrat inspect-browser-scenario-ledger <repository> <full-committed-sha> <external-rule-policy> <capability> <external-ledger-authority> --now <UTC-instant>
  twilight-burokrat inspect-scenario-ledger <repository> <committed-sha> <external-rule-policy> <external-level-authority> <capability> <external-ledger-authority> --now <UTC instant>
  twilight-burokrat inspect-performance-scenarios <repository> <committed-sha> <external-rule-policy> <external-level-authority> <capability>
  twilight-burokrat inspect-level-facts <repository> <committed-sha> <external-authority>
  twilight-burokrat inspect-manual <repository> <committed-sha> <external-rule-policy> <report-path> --now <UTC instant>
  twilight-burokrat inspect-manual-observation <repository> <committed-sha> <external-rule-policy> <report-path> --now <UTC instant>
  twilight-burokrat explain <rule-id> [<repository> <rule-policy-json>]
  twilight-burokrat scenario <import|allocate|validate> <repository> <openspec-spec-path> [--predecessor <id>]
  twilight-burokrat template <list|show <id>|verify <id> <committed|staged|working> <repository> <revision-or-base> <subject>>
  twilight-burokrat lint <committed|staged|working> <repository> <revision-or-base>
  twilight-burokrat prepare-activation <flags>
  twilight-burokrat prepare-relocation-activation <flags>
`;

function runLint(argv: readonly string[], toolkitDirectory: string): void {
  if (argv.length !== 3) {
    throw new Error(
      'usage: twilight-burokrat lint <committed|staged|working> <repository> <revision-or-base>',
    );
  }
  const invocation = Bun.spawnSync(['bash', join(toolkitDirectory, 'launcher.sh'), ...argv], {
    env: process.env,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  process.stdout.write(invocation.stdout);
  process.stderr.write(invocation.stderr);
  if (invocation.exitCode !== 0) {
    throw new Error(`Twilight Burokrat lint exited ${String(invocation.exitCode)}`);
  }
}

function runValidator(argv: readonly string[], toolkitDirectory: string): void {
  const invocation = Bun.spawnSync(
    [process.execPath, join(toolkitDirectory, 'validator.mjs'), ...argv],
    {
      env: {
        ...process.env,
        TOOL_WIKI_TRUSTED_NODE_MODULES: join(toolkitDirectory, 'trusted-node-modules'),
      },
      stderr: 'pipe',
      stdout: 'pipe',
    },
  );
  process.stdout.write(invocation.stdout);
  process.stderr.write(invocation.stderr);
  // Proof: removing this passthrough failed BROWSER-T2-POLICY-PREVIEW-012's installed refusal stderr parity.
  if (argv[0] === 'inspect-browser-t2-policy' && invocation.exitCode === 1) {
    process.exitCode = 1;
    return;
  }
  if (invocation.exitCode !== 0) {
    throw new Error(`Twilight Burokrat validator exited ${String(invocation.exitCode)}`);
  }
}

async function main(argv: string[]): Promise<void> {
  if (argv.length === 1 && argv[0] === '--version') {
    process.stdout.write(`${packageVersion}\n`);
    return;
  }
  if (argv.length === 1 && argv[0] === '--help') {
    process.stdout.write(help);
    return;
  }
  const [command, ...arguments_] = argv;
  if (
    command !== 'lint' &&
    command !== 'prepare-activation' &&
    command !== 'prepare-relocation-activation' &&
    !validatorCommands.has(command)
  ) {
    throw new Error(`unknown command: ${command}\n${help}`);
  }
  const toolkitDirectory = join(import.meta.dir, 'toolkit');
  const toolkit = readInstalledToolkit(import.meta.dir, toolkitDirectory);
  if (command === 'lint') {
    runLint(arguments_, toolkit.directory);
    return;
  }
  if (command === 'prepare-activation') {
    process.stdout.write(
      `${prepareToolkitActivation(arguments_, toolkit.directory, toolkit.digest).join('\n')}\n`,
    );
    return;
  }
  if (command === 'prepare-relocation-activation') {
    process.stdout.write(`${(await prepareRelocationActivation(arguments_)).join('\n')}\n`);
    return;
  }
  runValidator(argv, toolkit.directory);
}

try {
  await main(process.argv.slice(2));
} catch (cause) {
  process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
  process.exitCode = 1;
}
