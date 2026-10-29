import { type AnalyticsEvent, parseAnalyticsEvent } from '@website/contracts';

import {
  type AnalyticsConfiguration,
  type AnalyticsOptions,
  configureAnalytics,
  type MeasurementContext,
  resolvePage,
} from './configuration';
export type { MeasurementContext } from './configuration';

export type AnalyticsState =
  | { status: 'disabled' | 'denied' | 'loading' | 'ready' }
  | { status: 'unavailable'; reason: 'storage' | 'loader' | 'transport' };
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
    load(
      context: MeasurementContext,
      configuration: AnalyticsConfiguration,
    ): Promise<'ready' | 'unavailable'>;
    update(context: MeasurementContext): void;
    send(event: VendorEvent): 'sent' | 'unavailable';
    disable(): void;
  };
}
export type DispatchOutcome = 'sent' | 'dropped' | 'duplicate' | 'unavailable';
export type LeadEvent = Extract<AnalyticsEvent, { name: 'generate_lead' }>;
export interface Analytics {
  getState(): AnalyticsState;
  subscribe(listener: (state: AnalyticsState) => void): () => void;
  accept(): void;
  reject(): void;
  sync(): void;
  navigate(): void;
  dispatch(event: Exclude<AnalyticsEvent, LeadEvent>): DispatchOutcome;
  dispatchLead(receipt: string, event: LeadEvent): DispatchOutcome;
  dispose(): void;
}

/** Preference lifetime is six calendar months, version 1; expired/malformed/new-policy means denial. */
function readAcceptance(value: string | null, now: number): boolean {
  if (value === null) return false;
  let preference: unknown;
  try {
    preference = JSON.parse(value);
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
  if (typeof preference !== 'object' || preference === null || Array.isArray(preference))
    return false;
  const version: unknown = Reflect.get(preference, 'version');
  const accepted: unknown = Reflect.get(preference, 'accepted');
  const expires: unknown = Reflect.get(preference, 'expires');
  // Proof: bypassing version, accepted or expiry checks resumed rejected/expired/old-policy preferences;
  // removing safe-integer validation loaded a fractional expiry in malformed preference fields.
  return (
    Object.keys(preference).length === 3 &&
    version === 1 &&
    accepted === true &&
    typeof expires === 'number' &&
    Number.isSafeInteger(expires) &&
    expires > now
  );
}

/**
 * Framework-neutral controller. Interactions while denied/loading are dropped, never queued.
 * Only the current page is emitted after loading. Two explicit load attempts per page bound optional retry.
 * Consumers must observe functional transitions independently of state notifications: never replay a
 * historical question/brief/receipt when consent changes. See {@link Analytics.dispatchLead}.
 */
export function createAnalytics(options: AnalyticsOptions, ports: AnalyticsPorts): Analytics {
  const configuration = configureAnalytics(options, ports.location());
  let state: AnalyticsState = { status: configuration.enabled ? 'denied' : 'disabled' };
  let generation = 0;
  let attempts = 0;
  let disposed = false;
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
  function send(event: AnalyticsEvent): DispatchOutcome {
    // Proof: bypassing readiness dispatched a denied interaction; injecting a backlog replayed a brief
    // on acceptance in basic blocking. No historical interaction is retained here.
    if (state.status !== 'ready' || page === null)
      return state.status === 'unavailable' ? 'unavailable' : 'dropped';
    const { name, ...fields } = event;
    const outcome = ports.vendor.send({ name, parameters: { ...page, ...fields } });
    if (outcome === 'unavailable') stop({ status: 'unavailable', reason: 'transport' }, false);
    return outcome;
  }
  function sendPage(): DispatchOutcome {
    if (page === null || state.status !== 'ready')
      return state.status === 'unavailable' ? 'unavailable' : 'dropped';
    if (page.page_location === sentPage) return 'duplicate';
    ports.vendor.update(page);
    const outcome = send({ name: 'page_view', page_id: page.page_id });
    if (outcome === 'sent') sentPage = page.page_location;
    // Proof: deriving success from changed sentPage reported sent after an injected transport outage.
    return outcome;
  }
  function start() {
    // Proof: removing loading admission started two loaders in basic blocking.
    if (state.status === 'loading' || state.status === 'ready' || page === null) return;
    // Proof: raising the bound started a third attempt in retries-are-bounded.
    if (attempts >= 2) {
      setState({ status: 'unavailable', reason: 'loader' });
      return;
    }
    attempts++;
    const current = ++generation;
    setState({ status: 'loading' });
    void ports.vendor.load(page, configuration).then((loaded) => {
      // Proof: removing the generation fence made a superseded loader ready the newly accepted generation.
      if (current !== generation || disposed || state.status !== 'loading') return;
      const preference = ports.readPreference(configuration);
      if (preference.status === 'unavailable') {
        stop({ status: 'unavailable', reason: 'storage' }, false);
        return;
      }
      // Proof: injecting start before this consent decision loaded a tag in basic blocking without acceptance.
      if (!readAcceptance(preference.value, ports.now())) {
        stop({ status: 'denied' }, true);
        return;
      }
      if (loaded === 'unavailable') {
        stop({ status: 'unavailable', reason: 'loader' }, false);
        return;
      }
      setState({ status: 'ready' });
      sendPage();
    });
  }
  function sync() {
    if (disposed || !configuration.enabled) return;
    page = resolvePage(configuration, ports.location(), ports.referrer());
    if (page === null) {
      if (state.status !== 'disabled') stop({ status: 'disabled' }, false);
      return;
    }
    const preference = ports.readPreference(configuration);
    if (preference.status === 'unavailable') {
      stop({ status: 'unavailable', reason: 'storage' }, false);
      return;
    }
    if (!readAcceptance(preference.value, ports.now())) {
      if (state.status !== 'denied') stop({ status: 'denied' }, true);
      return;
    }
    if (state.status === 'disabled' || state.status === 'denied') start();
  }
  function choose(accepted: boolean) {
    if (disposed || !configuration.enabled) return;
    if (!accepted) stop({ status: 'denied' }, true);
    const expires = new Date(ports.now());
    expires.setUTCMonth(expires.getUTCMonth() + 6);
    const preference = JSON.stringify({ version: 1, accepted, expires: expires.getTime() });
    if (
      ports.writePreference(preference, configuration, expires.getTime()).status === 'unavailable'
    ) {
      stop({ status: 'unavailable', reason: 'storage' }, false);
      return;
    }
    if (accepted) {
      page = resolvePage(configuration, ports.location(), ports.referrer());
      if (page === null) {
        stop({ status: 'disabled' }, false);
        return;
      }
      start();
    }
  }
  const controller: Analytics = {
    getState: () => state,
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
    /** Receipt is a local session-storage key only. A sent marker means vendor enqueue, never delivery. */
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
      if (state.status !== 'ready')
        return state.status === 'unavailable' ? 'unavailable' : 'dropped';
      const key = `${configuration.cookiePrefix}:lead:${receipt}`;
      // Proof: removing both local marker checks emitted a second lead in lead-receipts-stay-local.
      if (sentReceipts.has(key)) return 'duplicate';
      const marker = ports.readMarker(key);
      if (marker.status === 'unavailable') {
        stop({ status: 'unavailable', reason: 'storage' }, false);
        return 'unavailable';
      }
      // Proof: removing corruption validation accepted an unexpected session value in session-marker-corruption.
      if (marker.value !== null && marker.value !== 'sent')
        throw new Error('Invalid analytics receipt marker');
      if (marker.value === 'sent') return 'duplicate';
      const outcome = send(event);
      if (outcome !== 'sent') return outcome;
      sentReceipts.add(key);
      if (ports.writeMarker(key).status === 'unavailable') {
        stop({ status: 'unavailable', reason: 'storage' }, false);
        return 'unavailable';
      }
      return 'sent';
    },
    dispose: () => {
      disposed = true;
      stop({ status: 'disabled' }, false);
      listeners.clear();
    },
  };
  sync();
  return controller;
}
