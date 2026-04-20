import { buildDeployPlan } from './deploy';

async function main(): Promise<void> {
  const { steps, dryRun } = buildDeployPlan(['be', ...process.argv.slice(2)], ['be']);
  for (const s of steps) console.log(s);
  console.log(`[deploy-be] dry-run=${String(dryRun)}`);
  await Promise.resolve();
}

if (import.meta.main) {
  void main();
}
