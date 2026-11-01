import { type AnalyticsEvent, type AnalyticsRegion, parseAnalyticsEvent } from '@website/contracts';

import {
  type AnalyticsConfiguration,
  type AnalyticsOptions,
  configureAnalytics,
  type MeasurementContext,
  resolvePage,
} from './configuration';
export type { MeasurementContext } from './configuration';
export type { AnalyticsRegion } from '@website/contracts';

/** Loading accepts safe vendor enqueues; cookieless/ready distinguish denied/granted cookie storage.
 * Denied is an explicit complete opt-out. Disabled excludes configuration/routes; unavailable stops
 * optional measurement after a modeled failure without blocking the functional request.
 */
export type AnalyticsState =
  | { status: 'disabled' | 'denied' | 'loading' | 'cookieless' | 'ready' }
  | { status: 'unavailable'; reason: 'storage' | 'loader' | 'transport' };
export type AnalyticsChoice = 'unset' | 'accepted' | 'rejected' | 'unavailable';
export type CookiePermission = 'denied' | 'granted';
export type StorageOutcome = { status: 'ok' } | { status: 'unavailable' };
export type StorageRead<T> = { status: 'ok'; value: T } | { status: 'unavailable' };
export interface VendorEvent {
  name: AnalyticsEvent['name'];
  parameters: Record<string, string | boolean>;
}
export interface AnalyticsPorts {
  now(): number;
  location(): string;
  referrer(): string;
  readPreference(configuration: AnalyticsConfiguration): StorageRead<string | null>;
  writePreference(
    value: string,
    configuration: AnalyticsConfiguration,
    expires: number,
  ): StorageOutcome;
  clearAnalytics(prefix: string, configuration: AnalyticsConfiguration): StorageOutcome;
  readMarker(key: string): StorageRead<string | null>;
  writeMarker(key: string): StorageOutcome;
  vendor: {
    /** Initializes the sanitized command layer synchronously; the promise reports script readiness. */
    load(
      context: MeasurementContext,
      configuration: AnalyticsConfiguration,
      permission: CookiePermission,
    ): Promise<'ready' | 'unavailable'>;
    /** Enqueues a consent update before future events; sent never proves delivery. */
    updateConsent(permission: CookiePermission): 'sent' | 'unavailable';
    update(context: MeasurementContext): void;
    send(event: VendorEvent): 'sent' | 'unavailable';
    disable(): void;
  };
}
/** Sent means vendor enqueue, including during script startup; it does not establish network delivery. */
export type DispatchOutcome = 'sent' | 'dropped' | 'duplicate' | 'unavailable';
export type LeadEvent = Extract<AnalyticsEvent, { name: 'generate_lead' }>;
export interface Analytics {
  getState(): AnalyticsState;
  /** Validated preference, independent of vendor readiness. Unavailable means a failed read/write;
   * a failed write remains unavailable until a successful preference retry.
   */
  getChoice(): AnalyticsChoice;
  /** Approximate regional default; unknown denies cookies without blocking cookieless measurement. */
  getRegion(): AnalyticsRegion;
  /** Notifies regional changes independently of vendor readiness or saved choice. */
  subscribeRegion(listener: (region: AnalyticsRegion) => void): () => void;
  /** Supplies a validated region; never persists an explicit choice or replays events. */
  setRegion(region: AnalyticsRegion): void;
  /** Notifies preference changes even when collection remains loading; sync/navigation refresh expiry. */
  subscribeChoice(listener: (choice: AnalyticsChoice) => void): () => void;
  subscribe(listener: (state: AnalyticsState) => void): () => void;
  accept(): void;
  reject(): void;
  sync(): void;
  navigate(): void;
  dispatch(event: Exclude<AnalyticsEvent, LeadEvent>): DispatchOutcome;
  dispatchLead(receipt: string, event: LeadEvent): DispatchOutcome;
  dispose(): void;
}

/** Only a valid, unexpired v1 choice grants cookies or blocks measurement; other choices are unset. */
function readChoice(value: string | null, now: number): 'unset' | 'accepted' | 'rejected' {
  if (value === null) return 'unset';
  let preference: unknown;
  try {
    preference = JSON.parse(value);
  } catch (error) {
    if (error instanceof SyntaxError) return 'unset';
    throw error;
  }
  if (typeof preference !== 'object' || preference === null || Array.isArray(preference))
    return 'unset';
  const version: unknown = Reflect.get(preference, 'version');
  const accepted: unknown = Reflect.get(preference, 'accepted');
  const expires: unknown = Reflect.get(preference, 'expires');
  // Proof: bypassing expiry/type/version validation granted malformed or expired permission;
  // treating accepted:false as unset loaded Google in valid-legacy-rejection.
  if (
    Object.keys(preference).length !== 3 ||
    version !== 1 ||
    typeof accepted !== 'boolean' ||
    typeof expires !== 'number' ||
    !Number.isSafeInteger(expires) ||
    expires <= now
  )
    return 'unset';
  return accepted ? 'accepted' : 'rejected';
}

/**
 * Framework-neutral controller. Safe events enqueue during startup, preserving the initial page.
 * Unknown region starts cookieless; elsewhere grants a regional cookie default. Valid rejection
 * blocks measurement. Cookie grants update the existing tag without replay. Two explicit load
 * attempts per controller bound optional retry.
 * Consumers must observe functional transitions independently of state notifications: never replay a
 * historical question/brief/receipt when consent changes. See {@link Analytics.dispatchLead}.
 */
export function createAnalytics(options: AnalyticsOptions, ports: AnalyticsPorts): Analytics {
  const configuration = configureAnalytics(options, ports.location());
  let state: AnalyticsState = { status: configuration.enabled ? 'denied' : 'disabled' };
  let choice: AnalyticsChoice = 'unset';
  let region: AnalyticsRegion = 'unknown';
  let preferenceWriteFailed = false;
  const regionListeners = new Set<(region: AnalyticsRegion) => void>();
  const choiceListeners = new Set<(choice: AnalyticsChoice) => void>();
  function setChoice(next: AnalyticsChoice) {
    if (choice === next) return;
    choice = next;
    // Proof: removing this notification left the strip visible in focus-sync while collection stayed loading.
    for (const listener of choiceListeners) listener(choice);
  }
  let generation = 0;
  let attempts = 0;
  let disposed = false;
  let permission: CookiePermission = 'denied';
  let page: MeasurementContext | null = null;
  let sentPage: string | null = null;
  const sentReceipts = new Set<string>();
  const listeners = new Set<(state: AnalyticsState) => void>();
  function setState(next: AnalyticsState) {
    if (JSON.stringify(state) === JSON.stringify(next)) return;
    state = next;
    for (const listener of listeners) listener(state);
  }
  function stop(next: AnalyticsState, clear: boolean) {
    generation++;
    ports.vendor.disable();
    sentPage = null;
    if (clear) sentReceipts.clear();
    if (
      clear &&
      ports.clearAnalytics(configuration.cookiePrefix, configuration).status === 'unavailable'
    ) {
      setState({ status: 'unavailable', reason: 'storage' });
      return;
    }
    setState(next);
  }
  function isCollecting() {
    return state.status === 'loading' || state.status === 'cookieless' || state.status === 'ready';
  }
  function send(event: AnalyticsEvent): DispatchOutcome {
    // Proof: bypassing this admission dispatched after valid rejection; startup-step tests fail
    // when loading is excluded. Events enter only the vendor's sanitized, bounded startup queue.
    if (!isCollecting() || page === null)
      return state.status === 'unavailable' ? 'unavailable' : 'dropped';
    const { name, ...fields } = event;
    const outcome = ports.vendor.send({ name, parameters: { ...page, ...fields } });
    if (outcome === 'unavailable') stop({ status: 'unavailable', reason: 'transport' }, false);
    return outcome;
  }
  function sendPage(): DispatchOutcome {
    if (page === null || !isCollecting())
      return state.status === 'unavailable' ? 'unavailable' : 'dropped';
    if (page.page_location === sentPage) return 'duplicate';
    ports.vendor.update(page);
    const outcome = send({ name: 'page_view', page_id: page.page_id });
    if (outcome === 'sent') sentPage = page.page_location;
    // Proof: deriving success from changed sentPage reported sent after an injected transport outage.
    return outcome;
  }
  function start() {
    // Proof: removing this admission duplicated initialization during first-page/startup.
    if (isCollecting() || page === null) return;
    // Proof: raising the bound started a third attempt in retries-are-bounded.
    if (attempts >= 2) {
      setState({ status: 'unavailable', reason: 'loader' });
      return;
    }
    attempts++;
    const current = ++generation;
    setState({ status: 'loading' });
    const loading = ports.vendor.load(page, configuration, permission);
    // The vendor initializes its command layer synchronously, before its script resolves.
    sendPage();
    void loading.then((loaded) => {
      // Proof: removing the generation fence made a superseded loader ready the newly accepted generation.
      if (current !== generation || disposed || state.status !== 'loading') return;
      const preference = ports.readPreference(configuration);
      if (preference.status === 'unavailable') {
        setChoice('unavailable');
        stop({ status: 'unavailable', reason: 'storage' }, false);
        return;
      }
      if (!applyChoice(readChoice(preference.value, ports.now()))) return;
      if (loaded === 'unavailable') {
        stop({ status: 'unavailable', reason: 'loader' }, false);
        return;
      }
      setState({ status: permission === 'granted' ? 'ready' : 'cookieless' });
    });
  }
  function applyChoice(choice: ReturnType<typeof readChoice>): boolean {
    setChoice(choice);
    if (choice === 'rejected') {
      // Proof: bypassing rejection admission loaded Google for valid-legacy-rejection and
      // sent future events in withdrawal; completion generation remains independently fenced.
      if (state.status !== 'denied') stop({ status: 'denied' }, true);
      permission = 'denied';
      return false;
    }
    // Proof: granting unknown failed regional defaults update; accepted/rejected precedence is
    // covered by regional defaults never override explicit acceptance rejection or unreadable preference.
    const nextPermission = choice === 'accepted' || region === 'elsewhere' ? 'granted' : 'denied';
    // Proof: removing unchanged-permission admission accessed blocked session storage in cookieless-browser-leads.
    if (permission === nextPermission) return true;
    permission = nextPermission;
    if (isCollecting()) {
      // Proof: ignoring consent refusal admitted later events in consent-transport-refusal.
      if (ports.vendor.updateConsent(permission) === 'unavailable') {
        stop({ status: 'unavailable', reason: 'transport' }, false);
        return false;
      }
      if (state.status !== 'loading')
        setState({ status: permission === 'granted' ? 'ready' : 'cookieless' });
    }
    // Proof: omitting downgrade cleanup retained configured analytics cookies after expiry;
    // withdrawal-clears-configured preserves functional and other-environment cookies.
    if (
      permission === 'denied' &&
      ports.clearAnalytics(configuration.cookiePrefix, configuration).status === 'unavailable'
    ) {
      stop({ status: 'unavailable', reason: 'storage' }, false);
      return false;
    }
    return true;
  }
  function sync() {
    if (disposed || !configuration.enabled) return false;
    page = resolvePage(configuration, ports.location(), ports.referrer());
    if (page === null) {
      if (state.status !== 'disabled') stop({ status: 'disabled' }, false);
      return false;
    }
    // Proof: removing this latch revived an older acceptance after failed rejection in a failed
    // preference write cannot revive old acceptance through a regional answer or sync.
    if (preferenceWriteFailed) return false;
    const preference = ports.readPreference(configuration);
    if (preference.status === 'unavailable') {
      // Proof: injecting unset here failed unreadable-preference assertions for both arrival actions.
      setChoice('unavailable');
      stop({ status: 'unavailable', reason: 'storage' }, false);
      return false;
    }
    if (!applyChoice(readChoice(preference.value, ports.now()))) return false;
    // Proof: retrying unavailable states on dispatch exceeded the bounded explicit load attempts.
    if (state.status !== 'unavailable') start();
    return true;
  }
  function choose(accepted: boolean) {
    if (disposed || !configuration.enabled) return;
    const isRetry = state.status === 'unavailable';
    if (!accepted) {
      permission = 'denied';
      stop({ status: 'denied' }, true);
    }
    const expires = new Date(ports.now());
    expires.setUTCMonth(expires.getUTCMonth() + 6);
    const preference = JSON.stringify({ version: 1, accepted, expires: expires.getTime() });
    if (
      ports.writePreference(preference, configuration, expires.getTime()).status === 'unavailable'
    ) {
      preferenceWriteFailed = true;
      permission = 'denied';
      // Proof: injecting a rejected choice here hid both refused actions in arrival-choice persistence tests.
      setChoice('unavailable');
      stop({ status: 'unavailable', reason: 'storage' }, false);
      return;
    }
    preferenceWriteFailed = false;
    if (!accepted) setChoice('rejected');
    if (accepted) {
      page = resolvePage(configuration, ports.location(), ports.referrer());
      if (page === null) {
        stop({ status: 'disabled' }, false);
        return;
      }
      // Proof: bypassing successful sync started a loader despite unreadable preference state;
      // retrying newly failed consent concealed transport refusal in consent-transport-refusal.
      if (sync() && isRetry) start();
    }
  }
  const controller: Analytics = {
    getState: () => state,
    getChoice: () => choice,
    getRegion: () => region,
    subscribeRegion: (listener) => {
      regionListeners.add(listener);
      return () => {
        regionListeners.delete(listener);
      };
    },
    setRegion: (next) => {
      // Proof: removing disposal admission changed the region in regional updates after disposal.
      if (disposed) return;
      const changed = region !== next;
      region = next;
      sync();
      // Proof: removing notification failed regional defaults update while the tag stayed loading.
      if (changed) for (const listener of regionListeners) listener(region);
    },
    subscribeChoice: (listener) => {
      choiceListeners.add(listener);
      return () => {
        choiceListeners.delete(listener);
      };
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    accept: () => {
      choose(true);
    },
    reject: () => {
      choose(false);
    },
    sync,
    navigate: () => {
      sync();
      sendPage();
    },
    dispatch: (input) => {
      const event = parseAnalyticsEvent(input);
      // Proof: removing this refusal let generic dispatch bypass the receipt API in programmer-errors.
      if (event.name === 'generate_lead')
        throw new Error('Use dispatchLead for receipt deduplication');
      sync();
      if (event.name === 'page_view') return sendPage();
      return send(event);
    },
    /** Receipt stays local: ephemeral dedup before permission, validated session markers after it. Sent means enqueue, never delivery. */
    dispatchLead: (receipt, input) => {
      const event = parseAnalyticsEvent(input);
      // Proof: removing confirmation validation admitted empty/malformed receipt inputs in malformed-preference-fields.
      if (
        event.name !== 'generate_lead' ||
        typeof receipt !== 'string' ||
        receipt.length === 0 ||
        receipt.length > 200
      )
        throw new Error('Invalid local lead confirmation');
      sync();
      if (!isCollecting()) return state.status === 'unavailable' ? 'unavailable' : 'dropped';
      const key = `${configuration.cookiePrefix}:lead:${receipt}`;
      // Proof: removing both local marker checks emitted a second lead in lead-receipts-stay-local.
      if (sentReceipts.has(key)) return 'duplicate';
      // Proof: removing the permission fence touches unavailable sessionStorage in cookieless-leads.
      if (permission === 'granted') {
        const marker = ports.readMarker(key);
        if (marker.status === 'unavailable') {
          stop({ status: 'unavailable', reason: 'storage' }, false);
          return 'unavailable';
        }
        // Proof: removing corruption validation accepted an unexpected value in session-marker-corruption.
        if (marker.value !== null && marker.value !== 'sent')
          throw new Error('Invalid analytics receipt marker');
        if (marker.value === 'sent') return 'duplicate';
      }
      const outcome = send(event);
      if (outcome !== 'sent') return outcome;
      sentReceipts.add(key);
      if (permission === 'granted' && ports.writeMarker(key).status === 'unavailable') {
        stop({ status: 'unavailable', reason: 'storage' }, false);
        return 'unavailable';
      }
      return 'sent';
    },
    dispose: () => {
      disposed = true;
      stop({ status: 'disabled' }, false);
      listeners.clear();
      choiceListeners.clear();
      regionListeners.clear();
    },
  };
  sync();
  return controller;
}
