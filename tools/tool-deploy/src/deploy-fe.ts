import { buildDeployPlan } from './deploy';

async function main(): Promise<void> {
  const { steps, dryRun } = buildDeployPlan(['fe', ...process.argv.slice(2)], ['fe']);
  for (const s of steps) console.log(s);
  console.log(`[deploy-fe] dry-run=${String(dryRun)}`);
  await Promise.resolve();
}

if (import.meta.main) {
  void main();
}
