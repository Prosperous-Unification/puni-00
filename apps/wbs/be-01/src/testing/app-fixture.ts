import { openTestSource } from '@wbs/store-memory/testing/owned-source-fixture';

import type { AppOptions } from '../app';
import { composeTestApp } from './app-composition-fixture';
import { testWorkItemService } from './work-item-fixture';

/**
 * An app on the thirteen test doubles, for the callers that want the routes
 * and none of the behaviour behind them.
 *
 * Shared fixture for route composition and generated-document publication tests.
 * The document CLI consumes shared descriptors directly and needs no app fixture.
 *
 * Route registration touches no service, which is what makes the doubles
 * honest here rather than a shortcut: a real service would mean a database
 * file, migrations and a temp directory to produce the same answer.
 *
 * `overrides` is spread last, so a caller that cares about one service — an
 * auth service that answers a particular identity, say — names that one and
 * inherits the rest.
 */
export function testApp(overrides: Partial<AppOptions> = {}): ReturnType<typeof composeTestApp> {
  const workItems = overrides.workItems ?? testWorkItemService(openTestSource());
  return composeTestApp(workItems, overrides);
}
