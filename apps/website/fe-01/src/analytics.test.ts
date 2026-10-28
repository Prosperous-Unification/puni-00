import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';

import { createAppAnalytics, readAnalyticsOptions } from './analytics';

test('the app wrapper defaults off and requires explicit coherent environment settings', () => {
  expect(readAnalyticsOptions({})).toEqual({ enabled: false });
  expect(readAnalyticsOptions({ VITE_ANALYTICS_ENABLED: 'false' })).toEqual({ enabled: false });
  for (const environment of [
    { VITE_ANALYTICS_ENABLED: 'yes' },
    { VITE_ANALYTICS_ENABLED: 'true' },
    { VITE_ANALYTICS_ENABLED: 'true', VITE_ANALYTICS_ENVIRONMENT: 'staging' },
  ])
    expect(() => readAnalyticsOptions(environment)).toThrow();
  const dom = new JSDOM('', { url: 'http://localhost:4201/' });
  const analytics = createAppAnalytics(dom.window, {});
  expect(analytics.getState()).toEqual({ status: 'disabled' });
  analytics.accept();
  expect(dom.window.document.scripts).toHaveLength(0);
  analytics.dispose();
  dom.window.close();
});
