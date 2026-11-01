import {
  type Analytics,
  type AnalyticsPorts,
  type CookiePermission,
  createAnalytics,
  type StorageRead,
} from './analytics';
import {
  type AnalyticsConfiguration,
  type AnalyticsOptions,
  configureAnalytics,
  type MeasurementContext,
} from './configuration';

const instances = new WeakMap<Window, { signature: string; analytics: Analytics }>();

/** Only browser storage policy/quota exceptions are modeled optional failures; programming errors escape. */
function accessStorage<T>(operation: () => T): StorageRead<T> {
  try {
    return { status: 'ok', value: operation() };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error.name === 'SecurityError' || error.name === 'QuotaExceededError')
    )
      return { status: 'unavailable' };
    // Proof: catching TypeError as optional lost the first-party-bug exception in focus/pageshow.
    throw error;
  }
}

function readCookie(window: Window, name: string): string | null {
  const cookie = window.document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (cookie === undefined) return null;
  try {
    return decodeURIComponent(cookie.slice(name.length + 1));
  } catch (error) {
    if (error instanceof URIError) return '';
    throw error;
  }
}

function clearCookies(window: Window, configuration: AnalyticsConfiguration): boolean {
  const prefix = `${configuration.cookiePrefix}_ga`;
  for (const cookie of window.document.cookie.split(';')) {
    const name = cookie.trim().split('=')[0];
    // Proof: skipping deletion retained development cookies; removing this filter deleted functional
    // cookies in withdrawal-clears-configured. Only the configured environment is eligible.
    if (name !== prefix && !name.startsWith(`${prefix}_`)) continue;
    for (const domain of [
      '',
      `; Domain=${configuration.cookieDomain}`,
      `; Domain=${window.location.hostname}`,
    ]) {
      window.document.cookie = `${name}=; Max-Age=0; Path=/${domain}; SameSite=Lax; Secure`;
    }
  }
  const storage = window.sessionStorage;
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key === null) throw new Error('Analytics storage enumeration changed');
    if (key.startsWith(`${configuration.cookiePrefix}:lead:`)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
  return (
    !window.document.cookie.split(';').some((cookie) => {
      const name = cookie.trim().split('=')[0];
      return name === prefix || name.startsWith(`${prefix}_`);
    }) && keys.every((key) => storage.getItem(key) === null)
  );
}

/** Commands use an isolated layer and contain safe metadata before insertion. Startup holds at most
 * 100 command records for at most ten seconds per attempt; overflow disables optional measurement.
 * The loaded Google tag owns its standard command layer thereafter. Withdrawal purges the layer.
 */
function createVendor(window: Window): AnalyticsPorts['vendor'] {
  const queue: IArguments[] = [];
  // The Google tag protocol consumes Arguments records, not an arbitrary array/event object.
  function command(..._values: unknown[]) {
    // Google gtag's documented boundary requires real Arguments records; arrays use a different protocol.
    // eslint-disable-next-line prefer-rest-params
    queue.push(arguments);
  }
  let configuration: AnalyticsConfiguration | null = null;
  let initialized = false;
  let enabled = false;
  let cancelLoad: (() => void) | null = null;
  function setDisabled(disabled: boolean) {
    if (configuration !== null)
      // Proof: forcing false left collection enabled on withdrawal in one-browser-controller.
      Reflect.set(window, `ga-disable-${configuration.measurementId}`, disabled);
  }
  function enqueueConsent(kind: 'default' | 'update', permission: CookiePermission) {
    command('consent', kind, {
      analytics_storage: permission,
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }
  function initialize(
    context: MeasurementContext,
    config: AnalyticsConfiguration,
    permission: CookiePermission,
  ) {
    const privacy = {
      allow_google_signals: false,
      campaign_id: '',
      campaign_content: '',
      campaign_term: '',
      url_passthrough: false,
      ads_data_redaction: true,
      allow_ad_personalization_signals: false,
      allow_enhanced_conversions: false,
      user_data: null,
      // Proof: enabling automatic pageviews failed the pre-insertion privacy configuration assertion.
      send_page_view: false,
      cookie_domain: config.cookieDomain,
      cookie_prefix: config.cookiePrefix,
      cookie_flags: 'SameSite=Lax;Secure',
      linker: { domains: [], accept_incoming: false },
      ...context,
    };
    // Proof: forcing granted leaked cookie permission in browser-starts-cookieless;
    // initialization precedes config/events in startup-preserves-Home.
    // Proof: using default after a loaded-tag withdrawal failed returning-permission's required update.
    enqueueConsent(initialized ? 'update' : 'default', permission);
    command('set', privacy);
    command('js', new Date());
    command('config', config.measurementId, privacy);
  }
  return {
    load: (context, config, permission) => {
      configuration = config;
      if (
        Reflect.has(window, 'puniAnalyticsLayer') &&
        Reflect.get(window, 'puniAnalyticsLayer') !== queue
      )
        throw new Error('Analytics layer is already owned');
      Reflect.set(window, 'puniAnalyticsLayer', queue);
      enabled = true;
      setDisabled(false);
      initialize(context, config, permission);
      if (initialized) return Promise.resolve('ready');
      return new Promise((resolve) => {
        const script = window.document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${config.measurementId}&l=puniAnalyticsLayer`;
        let settled = false;
        const timeout = window.setTimeout(() => {
          finish(false);
        }, 10000);
        function finish(ready: boolean) {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          script.onload = null;
          script.onerror = null;
          cancelLoad = null;
          if (ready) initialized = true;
          else {
            enabled = false;
            setDisabled(true);
            queue.length = 0;
            script.remove();
          }
          resolve(ready ? 'ready' : 'unavailable');
        }
        script.onload = () => {
          finish(true);
        };
        script.onerror = () => {
          finish(false);
        };
        cancelLoad = () => {
          finish(false);
        };
        window.document.head.append(script);
      });
    },
    updateConsent: (permission) => {
      // Proof: removing saturation admission silently accepted a consent update beyond the startup bound.
      if (!enabled || (!initialized && queue.length >= 100)) return 'unavailable';
      enqueueConsent('update', permission);
      return 'sent';
    },
    update: (context) => {
      // Proof: removing this bound grew the full layer to 101 during navigation-never-grows;
      // the following send reports overflow and disables measurement.
      if (enabled && (initialized || queue.length < 100)) command('set', context);
    },
    send: (event) => {
      // Proof: removing the 100-command startup bound left collection loading with 110
      // queued interactions in startup-commands-are-bounded.
      if (!enabled || (!initialized && queue.length >= 100)) return 'unavailable';
      command('event', event.name, event.parameters);
      return 'sent';
    },
    disable: () => {
      enabled = false;
      setDisabled(true);
      queue.length = 0;
      cancelLoad?.();
    },
  };
}

/**
 * One controller per Window, shared by React and Astro; incompatible second configuration throws.
 * pageshow/focus/visibility and every dispatch/navigation reread the shared cookie. Call navigate()
 * after client navigation; call dispose() only when the whole page integration is unmounted.
 */
export function createBrowserAnalytics(window: Window, options: AnalyticsOptions = {}): Analytics {
  const configuration = configureAnalytics(options, window.location.href);
  const signature = JSON.stringify(configuration);
  const existing = instances.get(window);
  if (existing !== undefined) {
    // Proof: removing this refusal silently reused an incompatible singleton in one-browser-controller.
    if (existing.signature !== signature)
      throw new Error('Incompatible analytics configuration for this Window');
    return existing.analytics;
  }
  const ports: AnalyticsPorts = {
    now: () => Date.now(),
    location: () => window.location.href,
    referrer: () => window.document.referrer,
    readPreference: (config) => accessStorage(() => readCookie(window, config.preferenceName)),
    writePreference: (value, config, expires) => {
      const written = accessStorage(() => {
        window.document.cookie = `${config.preferenceName}=${encodeURIComponent(value)}; Domain=${config.cookieDomain}; Path=/; Expires=${new Date(expires).toUTCString()}; SameSite=Lax; Secure`;
        return readCookie(window, config.preferenceName) === value;
      });
      return written.status === 'ok' && written.value
        ? { status: 'ok' }
        : { status: 'unavailable' };
    },
    clearAnalytics: (_prefix, config) => {
      const cleared = accessStorage(() => clearCookies(window, config));
      // Proof: omitting readback hid an undeletable cookie in cleanup-failure-even-when-preference-persists.
      return cleared.status === 'ok' && cleared.value
        ? { status: 'ok' }
        : { status: 'unavailable' };
    },
    readMarker: (key) => accessStorage(() => window.sessionStorage.getItem(key)),
    writeMarker: (key) =>
      accessStorage(() => {
        window.sessionStorage.setItem(key, 'sent');
      }),
    vendor: createVendor(window),
  };
  const controller = createAnalytics(options, ports);
  const sync = () => {
    controller.navigate();
  };
  const visible = () => {
    if (window.document.visibilityState === 'visible') sync();
  };
  window.addEventListener('pageshow', sync);
  window.addEventListener('focus', sync);
  window.document.addEventListener('visibilitychange', visible);
  const analytics: Analytics = {
    ...controller,
    dispose: () => {
      window.removeEventListener('pageshow', sync);
      window.removeEventListener('focus', sync);
      window.document.removeEventListener('visibilitychange', visible);
      controller.dispose();
    },
  };
  instances.set(window, { signature, analytics });
  return analytics;
}
