import { materialize, parseDeployArgs, type Tier } from './affected';
import { mockRemoteState } from './remote-state';
import { buildSshInvocation } from './ssh';

export function buildDeployPlan(
  argv: string[],
  affected: Tier[],
): {
  tiers: Tier[];
  steps: string[];
  dryRun: boolean;
} {
  const args = parseDeployArgs(argv);
  const tiers = materialize(args, affected);
  const steps: string[] = [];

  for (const t of tiers) {
    const state = mockRemoteState(t);
    steps.push(
      `[plan] ${t}: last=${state.lastDeployedSha ?? '(none)'} active=${state.activeColor}`,
    );
    if (!args.skipBuild) steps.push(`[plan] ${t}: nx run tool-dagger:publish-${t}`);
    if (args.host) {
      const cmd = `bun /srv/wbs/bin/swap-${t}.js`;
      steps.push(`[plan] ${t}: ${buildSshInvocation({ host: args.host, user: 'root' }, cmd)}`);
    } else {
      steps.push(`[plan] ${t}: swap would run remotely (no --host provided)`);
    }
  }
  return { tiers, steps, dryRun: args.dryRun };
}

async function main(): Promise<void> {
  const { steps, dryRun, tiers } = buildDeployPlan(process.argv.slice(2), ['be', 'gw', 'fe']);
  console.log(`[tool-deploy] tiers=${tiers.join(',') || '(none)'} dry-run=${String(dryRun)}`);
  for (const s of steps) console.log(s);
  if (dryRun) {
    console.log('[tool-deploy] dry-run only. re-run with --execute to perform a live deploy.');
    return;
  }
  console.log('[tool-deploy] --execute is intentionally not wired to real SSH in the scaffold.');
  await Promise.resolve();
}

if (import.meta.main) {
  void main();
}
