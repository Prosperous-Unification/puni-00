import { createPerformanceRuntime, monotonicClock } from '@puni/dash/performance-level';

import { createSourceTestLevelContext } from './source-test-level-context';

type Runtime = ReturnType<typeof createPerformanceRuntime>;
type FixtureServices = Parameters<Runtime['runPerformanceFixture']>[2];

/** Historical source client; actual execution lives in Dash and never spawns a tools runner. */
export async function runPerformanceLevel(
  root: string,
  policy?: string,
  services?: FixtureServices,
): Promise<void> {
  const owned = createPerformanceRuntime(createSourceTestLevelContext(monotonicClock()));
  if (services === undefined) await owned.runPerformanceLevel(root, policy);
  else await owned.runPerformanceFixture(root, policy, services);
}
export async function readIdentity(
  ...arguments_: Parameters<Runtime['readIdentity']>
): Promise<string> {
  return await createPerformanceRuntime(
    createSourceTestLevelContext(monotonicClock()),
  ).readIdentity(...arguments_);
}
export {
  assertCandidateServiceDescriptors,
  decodeServiceDescriptors,
} from '@puni/dash/performance-level';
export { decodeCandidateIdentity } from '@puni/dash/test-level-evidence';
export { assertPreflight } from '@puni/dash/test-level-evidence';
export { readVerdict } from '@puni/dash/test-level-evidence';
export { assertPerformanceFindings } from '@puni/dash/test-level-evidence';
export { xmlText } from '@puni/dash/test-level-evidence';
if (import.meta.main) {
  if (process.argv.length !== 2)
    throw new Error('Performance CLI does not accept alternate service arguments');
  await runPerformanceLevel(process.cwd());
}
