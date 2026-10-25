import { type AnalyticsOptions, createBrowserAnalytics } from '@website/analytics';

/** Build inputs are explicit; absence disables measurement, malformed enabled configuration throws. */
export function readAnalyticsOptions(
  environment: Record<string, string | undefined>,
): AnalyticsOptions {
  const enabled = environment['VITE_ANALYTICS_ENABLED'];
  // Proof: removing the absent-input branch broke the app-wrapper default-disabled assertion.
  if (enabled === undefined || enabled === 'false') return { enabled: false };
  if (enabled !== 'true') throw new Error('Invalid analytics enablement');
  const deployment = environment['VITE_ANALYTICS_ENVIRONMENT'];
  const measurementId = environment['VITE_ANALYTICS_MEASUREMENT_ID'];
  if ((deployment !== 'development' && deployment !== 'production') || !measurementId)
    throw new Error('Missing analytics environment or measurement ID');
  return { enabled: true, environment: deployment, measurementId };
}

/** React and the private Astro site use the same browser controller; this wrapper only reads Vite inputs. */
export function createAppAnalytics(
  window: Window,
  environment: Record<string, string | undefined> = import.meta.env,
) {
  return createBrowserAnalytics(window, readAnalyticsOptions(environment));
}
