import {
  type AnalyticsCampaign,
  analyticsCampaigns,
  type AnalyticsPageId,
  analyticsPages,
  parseAnalyticsCampaign,
} from '@website/contracts';

export interface AnalyticsOptions {
  enabled?: boolean;
  environment?: 'development' | 'production';
  measurementId?: string;
  cookieDomain?: string;
  cookiePrefix?: string;
  preferenceName?: string;
}

export interface AnalyticsConfiguration {
  enabled: boolean;
  environment: 'development' | 'production';
  measurementId: string;
  cookieDomain: 'puni.dev';
  cookiePrefix: 'puni_dev' | 'puni_prod';
  preferenceName: string;
  hosts: readonly [string, string];
}

/** Safe before the first vendor command, including its automatic session events. */
export interface MeasurementContext {
  page_id: AnalyticsPageId;
  page_location: string;
  page_title: string;
  page_referrer: string;
  campaign_source: string;
  campaign_medium: string;
  campaign_name: string;
}

/** Explicit enablement is required even on the development host pair; localhost is never a live tag host. */
export function configureAnalytics(
  options: AnalyticsOptions,
  href: string,
): AnalyticsConfiguration {
  const environment = options.environment ?? 'development';
  const cookiePrefix = environment === 'development' ? 'puni_dev' : 'puni_prod';
  // Proof: using the dev preference name for production granted production consent in real-domain-cookies.
  const preferenceName = `${cookiePrefix}_consent_v1`;
  const configuration: AnalyticsConfiguration = {
    enabled: options.enabled === true,
    environment,
    measurementId: options.measurementId ?? '',
    // Proof: narrowing to dev.puni.dev left dev.app.puni.dev denied in real-domain-cookies.
    cookieDomain: 'puni.dev',
    cookiePrefix,
    preferenceName,
    hosts:
      environment === 'development'
        ? ['dev.puni.dev', 'dev.app.puni.dev']
        : ['puni.dev', 'app.puni.dev'],
  };
  if (!configuration.enabled) return configuration;
  // Proof: removing isolation refusal accepted the wrong cookie ancestor in configuration-isolates.
  if (
    (options.cookieDomain !== undefined && options.cookieDomain !== configuration.cookieDomain) ||
    (options.cookiePrefix !== undefined && options.cookiePrefix !== cookiePrefix) ||
    (options.preferenceName !== undefined && options.preferenceName !== preferenceName)
  )
    throw new Error('Incompatible analytics cookie isolation');
  // Proof: removing ID refusal admitted a wrong dev ID; separately allowing the dev ID on production
  // failed configuration-isolates at its production refusal assertion.
  if (
    !/^G-[A-Z0-9]{6,20}$/.test(configuration.measurementId) ||
    (environment === 'development'
      ? configuration.measurementId !== 'G-R0JM3R4SSV'
      : configuration.measurementId === 'G-R0JM3R4SSV')
  )
    throw new Error('Incompatible analytics measurement ID');
  assertHost(configuration, new URL(href));
  return configuration;
}

function assertHost(configuration: AnalyticsConfiguration, url: URL): void {
  // Proof: removing host refusal accepted the production host in a development configuration.
  if (
    url.protocol !== 'https:' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    !configuration.hosts.includes(url.hostname)
  )
    throw new Error('Unapproved analytics host');
}

/** Unknown public paths and operator paths disable measurement; query/hash never enter a location. */
export function resolvePage(
  configuration: AnalyticsConfiguration,
  href: string,
  referrer: string,
  campaigns: readonly AnalyticsCampaign[] = analyticsCampaigns,
): MeasurementContext | null {
  const url = new URL(href);
  assertHost(configuration, url);
  const surface = url.hostname === configuration.hosts[0] ? 'site' : 'app';
  const registered = Object.entries(analyticsPages).find(
    ([, page]) => page.surface === surface && page.path === url.pathname,
  );
  // Proof: replacing unknown routes with Home measured an operator navigation in initialization-and-navigation.
  if (!registered) return null;
  const [pageId, page] = registered;
  let origin = '';
  if (URL.canParse(referrer)) {
    const referring = new URL(referrer);
    if (
      ['https:', 'http:'].includes(referring.protocol) &&
      !referring.username &&
      !referring.password
    )
      // Proof: forwarding referring.href exposed its private path/query in initialization-and-navigation.
      origin = referring.origin;
  }
  const campaign = campaigns
    .map(parseAnalyticsCampaign)
    .find(
      (candidate) =>
        url.searchParams.getAll('utm_source').length === 1 &&
        url.searchParams.getAll('utm_medium').length === 1 &&
        url.searchParams.getAll('utm_campaign').length === 1 &&
        candidate.source === url.searchParams.get('utm_source') &&
        candidate.medium === url.searchParams.get('utm_medium') &&
        candidate.campaign === url.searchParams.get('utm_campaign'),
    );
  return {
    // Object.entries comes only from the fixed page registry above.
    page_id: pageId as AnalyticsPageId,
    // Proof: forwarding href exposed query/hash in initialization-and-navigation and the mounted analytics.mjs metadata case.
    page_location: `${url.origin}${page.path}`,
    page_title: page.title,
    page_referrer: origin,
    campaign_source: campaign?.source ?? '',
    campaign_medium: campaign?.medium ?? '',
    // Proof: forwarding raw utm_campaign admitted an unregistered email in page/campaign mapping.
    campaign_name: campaign?.campaign ?? '',
  };
}
