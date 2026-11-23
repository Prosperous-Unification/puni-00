import { resolve } from 'node:path';

import type { BrowserRequest, PerformanceRequest } from './grammar-facade';
import { retainTestLevelContext, type TestLevelContext } from './test-levels/test-level-context';

/** Execute the actual Browser engine with root-relative typed operands and retained independent assets. */
export async function runBrowser(
  request: BrowserRequest,
  selection: TestLevelContext,
): Promise<number> {
  const retained = { ...request },
    context = retainTestLevelContext(selection),
    repository = resolve(context.callerDirectory, retained.repository);
  const { createBrowserRuntime } = await import('./test-levels/browser');
  await createBrowserRuntime(context).runBrowserLevel(repository, retained.mode);
  return 0;
}

/** Execute the actual Performance engine; candidate configuration never chooses the judge or runtime. */
export async function runPerformance(
  request: PerformanceRequest,
  selection: TestLevelContext,
): Promise<number> {
  const retained = { ...request },
    context = retainTestLevelContext(selection),
    repository = resolve(context.callerDirectory, retained.repository);
  const configured = context.environment['PUNI_PERFORMANCE_RULE_POLICY'];
  const environment =
    configured === undefined
      ? context.environment
      : {
          ...context.environment,
          PUNI_PERFORMANCE_RULE_POLICY: resolve(context.callerDirectory, configured),
        };
  const policy =
    retained.rulePolicy === undefined
      ? undefined
      : resolve(context.callerDirectory, retained.rulePolicy);
  const { createPerformanceRuntime } = await import('./test-levels/performance');
  await createPerformanceRuntime({ ...context, environment }).runPerformanceLevel(
    repository,
    policy,
  );
  return 0;
}
