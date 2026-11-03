import { createBrowserAnalytics } from '../../../../libs/website/adapters/analytics/src/browser';

/** Public adapter fixture only; the licensed built Home integration is verified separately. */
const analytics = createBrowserAnalytics(globalThis.window, {
  enabled: true,
  environment: 'development',
  measurementId: 'G-R0JM3R4SSV',
});
Reflect.set(globalThis.window, 'analyticsFixture', analytics);
