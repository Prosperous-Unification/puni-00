import { buildDeployPlan } from './deploy';

async function main(): Promise<void> {
  const { steps, dryRun } = buildDeployPlan(['gw', ...process.argv.slice(2)], ['gw']);
  for (const s of steps) console.log(s);
  console.log(`[deploy-gw] dry-run=${String(dryRun)}`);
  await Promise.resolve();
}

if (import.meta.main) {
  void main();
}
