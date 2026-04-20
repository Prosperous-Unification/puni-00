import { describePlan, planSwap } from './swap';

async function main(): Promise<void> {
  const plan = planSwap({ tier: 'fe', activeColor: 'blue', lastDeployedSha: null }, true);
  console.log(describePlan(plan));
  await Promise.resolve();
}

if (import.meta.main) {
  void main();
}
