import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  browserCheckDifficulty,
  type ConversationProvider,
  type ConversationView,
  deriveStage,
  type DraftView,
} from '@website/contracts';
import {
  type ConversationAdmission,
  conversationAllowance,
  type ConversationPricing,
  type DraftCapRefusal,
  guardrailAllowance,
  type ProposalCapRefusal,
  WebsiteStore,
} from '@website/store-sqlite';

import { mintBrowserCheck, verifyBrowserCheck } from './conversation/browser-check';
import {
  composeConversationRequest,
  defaultConversationReplyTokens,
  priceConversationRequest,
  simulateReply,
  visitorMessageLimit,
} from './conversation/request';
import { createSourceHasher, selectClientAddress } from './conversation/source';
import {
  type ProviderFetch,
  type ProviderRates,
  type ReasoningEffort,
  replayReply,
  streamConfirmedReply,
} from './conversation/stream';
import { providerDeclineReply, salesPromptVersion } from './conversation/system-prompt';
import {
  deliverAlert,
  FloodCounter,
  type GuardrailAlertKind,
  readWebhookUrl,
} from './guardrail-alerts';

export interface WebsiteApiConfig {
  databasePath: string;
  apiBindHost?: string;
  publicOrigin: string;
  appOrigin: string;
  appManualUrl: string;
  appBuildUrl?: string;
  operatorPassword?: string;
  secureCookies: boolean;
  demoAuth?: boolean;
  openRouterKey?: string;
  openRouterModel?: string;
  openRouterEnabled?: boolean;
  openRouterProvider?: string;
  openRouterInputUsdPerMillion?: number;
  openRouterOutputUsdPerMillion?: number;
  openRouterPrivacyVerified?: boolean;
  /** Sent on every paid call as excluded reasoning; unset sends no reasoning field. */
  openRouterReasoningEffort?: ReasoningEffort;
  /**
   * The anonymous conversation's reply cap, reasoning included; it sizes each reservation.
   * Defaults to {@link defaultConversationReplyTokens}.
   */
  openRouterMaxCompletionTokens?: number;
  /**
   * Gateway hops in front of the API whose `X-Forwarded-For` entries are trusted; required for an
   * `https` app origin. Zero (or absent on plain-HTTP loopback) uses the socket address.
   */
  trustedProxyHops?: number;
  providerFetch?: ProviderFetch;
  /** `GUARDRAIL_WEBHOOK_URL`: an `https` ntfy-style target for alerts; unset records alerts only. */
  guardrailWebhookUrl?: string;
  /** Sends the alert webhook; tests pass a fake receiver. Defaults to the global `fetch`. */
  alertFetch?: ProviderFetch;
  /** The operator password check; tests count calls. Defaults to Argon2id `Bun.password.verify`. */
  verifyPassword?: (password: string, hash: string) => Promise<boolean>;
  /** The request clock in epoch milliseconds; tests move it. Defaults to `Date.now`. */
  clock?: () => number;
  /** Opens the store; tests wrap it to observe calls. Defaults to `new WebsiteStore(path)`. */
  openStore?: (databasePath: string) => WebsiteStore;
}

interface AdmissionWindow {
  openedAt: number;
  count: number;
}

/**
 * Request windows: the general window over every route but `GET /health` (per source and global)
 * and the per-path windows (per source or claim, and a global backstop across all sources).
 */
const requestRate = {
  windowMilliseconds: 60_000,
  keyPerMinute: 30,
  globalPerMinute: 300,
  generalSourcePerMinute: 120,
  generalGlobalPerMinute: 3_000,
};

const draftLifetime = 24 * 60 * 60 * 1000;
const sessionLifetime = 8 * 60 * 60 * 1000;

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function secret(): string {
  return randomBytes(32).toString('hex');
}

function equal(left: string, right: string): boolean {
  const leftDigest = Buffer.from(digest(left), 'hex');
  const rightDigest = Buffer.from(digest(right), 'hex');
  return timingSafeEqual(leftDigest, rightDigest);
}

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

function failure(code: string, status: number): Response {
  return json({ code }, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textField(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maximum ? trimmed : null;
}

function emailField(value: unknown): string | null {
  const email = textField(value, 254)?.toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 12_000) return null;
  const reader = request.body?.getReader();
  if (reader === undefined) return null;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let source = '';
  let receivedBytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      receivedBytes += chunk.value.byteLength;
      // Proof: removing this limit causes the chunked-body test to read the injected second chunk and fail.
      if (receivedBytes > 12_000) {
        await reader.cancel();
        return null;
      }
      source += decoder.decode(chunk.value, { stream: true });
    }
    source += decoder.decode();
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.startsWith('application/x-www-form-urlencoded')) {
    const fields = new URLSearchParams(source);
    return Object.fromEntries(fields.entries());
  }
  if (!contentType.startsWith('application/json')) return null;
  try {
    const parsed: unknown = JSON.parse(source);
    return isRecord(parsed) ? parsed : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() === name) return pair.slice(separator + 1).trim();
  }
  return null;
}

/**
 * Request handler for the private website API. The store is closed with close().
 * `clientAddress` is the socket address, used as the conversation source when no proxy hops
 * are trusted.
 *
 * @throws when origins, redirects, demo auth or `trustedProxyHops` are misconfigured.
 */
export function createWebsiteApi(config: WebsiteApiConfig): {
  fetch(request: Request, clientAddress?: string): Promise<Response>;
  /** Waits for every alert webhook attempt in flight. */
  settleAlerts(): Promise<void>;
  close(): void;
} {
  if (!config.publicOrigin || !config.appOrigin || !config.appManualUrl)
    throw new Error('Website origins must be configured');
  const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);
  // Proof: changing this admission to false let the non-loopback demo startup test construct the API.
  if (
    config.demoAuth &&
    (!config.apiBindHost ||
      !loopback(config.apiBindHost) ||
      !loopback(new URL(config.publicOrigin).hostname) ||
      !loopback(new URL(config.appOrigin).hostname))
  )
    throw new Error('Demo auth requires loopback bind and loopback browser origins');
  const manual = new URL(config.appManualUrl);
  if (
    manual.origin !== config.appOrigin ||
    manual.pathname !== '/manual' ||
    manual.search ||
    manual.hash
  )
    throw new Error('Manual redirect must be fixed to the app /manual route');
  const conversationReplyTokens =
    config.openRouterMaxCompletionTokens ?? defaultConversationReplyTokens;
  if (config.appBuildUrl) {
    const build = new URL(config.appBuildUrl);
    // Proof: the invalid Build redirect test rejects an external host before accepting intake.
    if (
      build.origin !== config.appOrigin ||
      (build.pathname !== '/' && build.pathname !== '/studio') ||
      build.search ||
      build.hash
    )
      throw new Error('Build redirect must be fixed to the app root or /studio route');
  }
  if (
    config.trustedProxyHops !== undefined &&
    (!Number.isSafeInteger(config.trustedProxyHops) || config.trustedProxyHops < 0)
  )
    throw new Error('trustedProxyHops (TRUSTED_PROXY_HOPS) must be a nonnegative integer');
  // Proof: removing this refusal let the https-without-hops startup test construct the API.
  if (new URL(config.appOrigin).protocol === 'https:' && config.trustedProxyHops === undefined)
    throw new Error('trustedProxyHops (TRUSTED_PROXY_HOPS) is required for an https app origin');
  const trustedProxyHops = config.trustedProxyHops ?? 0;
  const store = (config.openStore ?? ((path: string) => new WebsiteStore(path)))(
    config.databasePath,
  );
  const clock = config.clock ?? Date.now;
  /** Set by close(); a stream deadline that fires later must not touch the closed store. */
  let isClosed = false;
  const webhookUrl = readWebhookUrl(config.guardrailWebhookUrl);
  const sendAlert: ProviderFetch =
    config.alertFetch ?? ((input, init) => globalThis.fetch(new Request(input, init)));
  /** Dedupe keys this process already raised, so a repeated trigger costs no write. */
  const raisedAlerts = new Set<string>();
  const alertDeliveries = new Set<Promise<void>>();
  const providerFailures = new FloodCounter(10);
  const rateRefusals = new FloodCounter(60);
  const verifyPassword =
    config.verifyPassword ??
    ((password: string, hash: string) => Bun.password.verify(password, hash));
  // Proof: a random per-process salt made the two-process source test store different sources.
  const daySalts = new Map<string, Uint8Array>();
  /**
   * The source salt of one UTC day, read through the store (which creates it and sweeps old
   * salts and counts in a write transaction) once per day per process and cached after that, so
   * reads such as `GET /conversation` write nothing. Only today's and yesterday's are kept.
   */
  function readDaySalt(utcDay: string): Uint8Array {
    const cached = daySalts.get(utcDay);
    // Proof: reading through the store every time counted five more salt writes in the repeated-read test.
    if (cached) return cached;
    const salt = store.readSourceSalt(utcDay);
    daySalts.set(utcDay, salt);
    // Keep the two latest days (today and yesterday, which still verifies browser checks).
    const days = [...daySalts.keys()].sort();
    for (const day of days.slice(0, -2)) daySalts.delete(day);
    return salt;
  }
  const hashSource = createSourceHasher(readDaySalt);
  const draftCookie = config.secureCookies ? '__Host-puni_draft' : 'puni_draft';
  const replayCookie = config.secureCookies ? '__Host-puni_replay' : 'puni_replay';
  const operatorCookie = config.secureCookies ? '__Host-puni_operator' : 'puni_operator';
  const admission = new Map<string, AdmissionWindow>();
  const conversationAborts = new Map<string, AbortController>();
  let operatorPasswordHash: Promise<string> | undefined;

  function cookie(name: string, value: string, maxAge: number): string {
    return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${String(maxAge)}${config.secureCookies ? '; Secure' : ''}`;
  }

  let windowsSweptAt = 0;

  /**
   * Counts one request against fixed one-minute windows, each `[key, limit]`. The request counts
   * against every window only when all of them admit it, so one refused source cannot drain a
   * global window for everyone else. A refusal names the whole seconds until the latest refusing
   * window ends.
   */
  function admitWindows(
    limits: [string, number][],
    now: number,
  ): { kind: 'admitted' } | { kind: 'limited'; retryAfterSeconds: number } {
    if (now - windowsSweptAt >= requestRate.windowMilliseconds) {
      for (const [key, window] of admission)
        if (now - window.openedAt >= requestRate.windowMilliseconds) admission.delete(key);
      windowsSweptAt = now;
    }
    const windows = limits.map(([key, limit]) => {
      const current = admission.get(key);
      const window =
        current && now - current.openedAt < requestRate.windowMilliseconds
          ? current
          : { openedAt: now, count: 0 };
      return { key, limit, window };
    });
    const refusing = windows.filter(({ limit, window }) => window.count >= limit);
    if (refusing.length > 0)
      return {
        kind: 'limited',
        retryAfterSeconds: Math.max(
          1,
          ...refusing.map(({ window }) =>
            Math.ceil((window.openedAt + requestRate.windowMilliseconds - now) / 1000),
          ),
        ),
      };
    for (const { key, window } of windows)
      admission.set(key, { ...window, count: window.count + 1 });
    return { kind: 'admitted' };
  }

  /** Takes back one count from windows a request was admitted to before a later window refused it. */
  function releaseWindows(keys: string[], now: number): void {
    for (const key of keys) {
      const window = admission.get(key);
      if (window && now - window.openedAt < requestRate.windowMilliseconds && window.count > 0)
        admission.set(key, { ...window, count: window.count - 1 });
    }
  }

  function generalWindowKeys(source: string): [string, number][] {
    return [
      ['*|*', requestRate.generalGlobalPerMinute],
      [`*|source:${source}`, requestRate.generalSourcePerMinute],
    ];
  }

  /**
   * The per-path windows: a global backstop of {@link requestRate.globalPerMinute} and
   * {@link requestRate.keyPerMinute} for the hashed source and each extra key (the draft claim on
   * `/conversation/*`). A refusal here also releases this request's general-window count, so a
   * refused request counts against no window.
   */
  function admitRequestRate(
    path: string,
    source: string,
    now: number,
    extraKeys: string[] = [],
  ): { kind: 'admitted' } | { kind: 'limited'; retryAfterSeconds: number } {
    // Proof: keying only on the path made the second source's intake answer 429 in the per-source rate test.
    // Proof: removing the global window let the 301st intake from a new source answer 201 in the backstop test.
    const outcome = admitWindows(
      [
        [`${path}|*`, requestRate.globalPerMinute],
        [`${path}|source:${source}`, requestRate.keyPerMinute],
        ...extraKeys.map((key): [string, number] => [`${path}|${key}`, requestRate.keyPerMinute]),
      ],
      now,
    );
    if (outcome.kind === 'limited')
      releaseWindows(
        generalWindowKeys(source).map(([key]) => key),
        now,
      );
    return outcome;
  }

  /** The salted source hash of a request, or null when its client address is undeterminable. */
  function requestSource(
    request: Request,
    clientAddress: string | undefined,
    now: number,
  ): string | null {
    const address = selectClientAddress(
      request.headers.get('x-forwarded-for'),
      clientAddress,
      trustedProxyHops,
    );
    return address === null ? null : hashSource(address, now);
  }

  /**
   * Records one alert under its dedupe key, then, when a webhook is set, makes its one delivery
   * attempt in the background and records `sent` or `failed`. A delivery never fails the request
   * that raised the alert; {@link settleAlerts} waits for pending deliveries.
   */
  function raiseAlert(kind: GuardrailAlertKind, dedupeKey: string, detail: string): void {
    if (raisedAlerts.has(dedupeKey)) return;
    raisedAlerts.add(dedupeKey);
    // Proof: delivering before this insert sent two webhook calls in the double-crossing dedupe test.
    const recorded = store.recordGuardrailAlert(kind, dedupeKey, detail, clock());
    if (recorded.kind === 'duplicate' || webhookUrl === undefined) return;
    const delivery = deliverAlert(sendAlert, webhookUrl, kind, detail)
      .then((outcome) => {
        // After close, the alert stays `recorded`; the row itself is already durable.
        if (!isClosed) store.markAlertDelivery(recorded.id, outcome, clock());
      })
      // Proof: without this handler the injected markAlertDelivery failure was an unhandled rejection.
      .catch((error: unknown) => {
        // The observed sink for a delivery that could not be recorded: kind and row id, no PII.
        console.error(`guardrail alert ${kind} ${recorded.id}: delivery not recorded`, error);
      });
    alertDeliveries.add(delivery);
    void delivery.finally(() => alertDeliveries.delete(delivery));
  }

  function utcDayOf(now: number): string {
    return new Date(now).toISOString().slice(0, 10);
  }

  function utcHourOf(now: number): string {
    return new Date(now).toISOString().slice(0, 13);
  }

  /** Raises `site_spend_half` once the site's UTC-day spend reaches half the ceiling. */
  function noteSiteSpend(now: number): void {
    const day = utcDayOf(now);
    if (raisedAlerts.has(`site_spend_half:${day}`)) return;
    const spent = store.readSiteSpend(now);
    if (spent >= guardrailAllowance.halfSpendMicroUsd)
      raiseAlert(
        'site_spend_half',
        `site_spend_half:${day}`,
        `site spend ${String(spent)} micro-USD of ${String(conversationAllowance.siteDayMicroUsd)} on ${day}`,
      );
  }

  function notePause(pauseId: string | null, reason: 'site_spend' | 'operator', now: number) {
    if (pauseId === null) return;
    // A spend pause implies the half mark was passed, even when no admission saw it start.
    if (reason === 'site_spend') noteSiteSpend(now);
    raiseAlert(
      'inference_paused',
      `inference_paused:${pauseId}`,
      `inference paused (${reason}) at site spend ${String(store.readSiteSpend(now))} micro-USD on ${utcDayOf(now)}`,
    );
  }

  /** Raises the half and full marks of a site-wide daily cap at the exact count that reaches them. */
  function noteSiteCount(scope: 'draft' | 'proposal', siteCount: number, now: number): void {
    const cap =
      scope === 'draft' ? guardrailAllowance.draftSiteDay : guardrailAllowance.proposalSiteDay;
    const day = utcDayOf(now);
    const mark = siteCount === cap ? 'full' : siteCount === cap / 2 ? 'half' : null;
    if (mark === null) return;
    raiseAlert(
      `${scope}_cap_${mark}`,
      `${scope}_cap_${mark}:${day}`,
      `${String(siteCount)} ${scope}s of ${String(cap)} on ${day}`,
    );
  }

  /** Counts a provider 5xx, timeout or non-refusal stream error; five in ten minutes alert. */
  function noteProviderFailure(): void {
    const now = clock();
    const count = providerFailures.record(now);
    // Proof: firing from the fifth on, with the raised-key set removed, made the sixth failure write again in the provider-failures test.
    if (count === 5)
      raiseAlert(
        'provider_failures',
        `provider_failures:${utcHourOf(now)}`,
        `${String(count)} provider failures in 10 minutes, hour ${utcHourOf(now)}`,
      );
  }

  /** Counts declined completions of the UTC day after one is stored; ten alert. */
  function noteDeclined(): void {
    const now = clock();
    const day = utcDayOf(now);
    if (raisedAlerts.has(`refusals:${day}`)) return;
    const count = store.countDeclinedCompletions(now);
    if (count >= 10)
      raiseAlert('refusals', `refusals:${day}`, `${String(count)} declined completions on ${day}`);
  }

  /** Counts a window or lockout refusal in memory; 500 in an hour write one alert row. */
  function noteRateRefusal(now: number): void {
    const count = rateRefusals.record(now);
    // Proof: writing a row per refusal counted 500 rows in the rate-limit flood test.
    if (count === 500)
      raiseAlert(
        'rate_limited',
        `rate_limited:${utcHourOf(now)}`,
        `${String(count)} refused requests in 60 minutes, hour ${utcHourOf(now)}`,
      );
  }

  /** 429 `rate_limited` with `Retry-After` in whole seconds. */
  function rateRefusal(outcome: { retryAfterSeconds: number }): Response {
    noteRateRefusal(clock());
    return json({ code: 'rate_limited' }, 429, {
      // Proof: deleting this header failed the Retry-After assertion in the windowless-route test.
      'Retry-After': String(outcome.retryAfterSeconds),
    });
  }

  /** 429 for a daily cap with `Retry-After` to the next UTC midnight, when the cap resets. */
  function capRefusal(code: DraftCapRefusal | ProposalCapRefusal, now: number): Response {
    const midnight = Math.floor(now / 86_400_000 + 1) * 86_400_000;
    return json({ code }, 429, {
      'Retry-After': String(Math.ceil((midnight - now) / 1000)),
      'Cache-Control': 'no-store',
    });
  }

  function attachCors(response: Response, origin: string | null): Response {
    if (origin === config.appOrigin) {
      response.headers.set('Access-Control-Allow-Origin', config.appOrigin);
      response.headers.set('Access-Control-Allow-Credentials', 'true');
      response.headers.set('Vary', 'Origin');
    }
    return response;
  }

  function attachSiteCors(response: Response): Response {
    response.headers.set('Access-Control-Allow-Origin', config.publicOrigin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Vary', 'Origin');
    return response;
  }

  function draftClaim(request: Request): string | null {
    const claim = readCookie(request, draftCookie);
    return claim && /^[a-f0-9]{64}$/.test(claim) ? claim : null;
  }

  function entryAvailability(
    request: Request,
    now: number,
  ): {
    available: boolean;
    reason: null | 'missing' | 'expired';
  } {
    const cookieValue = readCookie(request, draftCookie);
    if (cookieValue === null) return { available: false, reason: 'missing' };
    const claim = draftClaim(request);
    // Proof: the expired-claim entry test fails if any cookie is accepted without a live draft.
    return claim && store.findDraft(digest(claim), now)
      ? { available: true, reason: null }
      : { available: false, reason: 'expired' };
  }

  function replayClaim(request: Request): string | null {
    const claim = readCookie(request, replayCookie);
    return claim && /^[a-f0-9]{64}$/.test(claim) ? claim : null;
  }

  function draftCsrf(claim: string): string {
    return digest(`draft-csrf:${claim}`);
  }

  function validDraftCsrf(request: Request, claim: string): boolean {
    const submitted = request.headers.get('x-puni-csrf');
    return submitted !== null && equal(submitted, draftCsrf(claim));
  }

  function operatorSession(
    request: Request,
    now: number,
  ): { token: string; csrfHash: string } | null {
    const token = readCookie(request, operatorCookie);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const session = store.findOperatorSession(digest(token), now);
    return session ? { token, csrfHash: session.csrf_hash } : null;
  }

  /** Captures the validated rates used throughout one paid operation; unavailable pricing returns null. */
  function readProviderRates(): ProviderRates | null {
    const inputUsdPerMillion = config.openRouterInputUsdPerMillion;
    const outputUsdPerMillion = config.openRouterOutputUsdPerMillion;
    // Proof: skipping this check failed the ten bad-rate cases of the mounted "paid inference with ..." conversation test.
    if (
      typeof inputUsdPerMillion !== 'number' ||
      typeof outputUsdPerMillion !== 'number' ||
      !Number.isFinite(inputUsdPerMillion) ||
      !Number.isFinite(outputUsdPerMillion) ||
      inputUsdPerMillion <= 0 ||
      outputUsdPerMillion <= 0
    )
      return null;
    return { inputUsdPerMillion, outputUsdPerMillion };
  }

  function providerReady(
    rates: ProviderRates | null = readProviderRates(),
  ): rates is ProviderRates {
    return Boolean(
      config.openRouterKey &&
      config.openRouterModel &&
      config.openRouterProvider &&
      config.openRouterPrivacyVerified &&
      rates,
    );
  }

  function isInferencePaused(): boolean {
    return store.findOpenInferencePause() !== null;
  }

  /** Who may answer a new anonymous conversation turn under the current configuration. */
  function selectConversationProvider():
    | { kind: 'paid'; rates: ProviderRates }
    | { kind: 'demo' | 'unconfigured' | 'disabled' | 'paused' } {
    if (config.openRouterEnabled) {
      const rates = readProviderRates();
      if (!providerReady(rates)) return { kind: 'unconfigured' };
      // Read per request, so a pause opened by the other colour or a restart is seen at once.
      // Proof: reading the pause once at startup reported `openrouter` in the other-connection pause test.
      return isInferencePaused() ? { kind: 'paused' } : { kind: 'paid', rates };
    }
    return config.demoAuth ? { kind: 'demo' } : { kind: 'disabled' };
  }

  /** Maps a refused or replayed conversation admission to its typed response. */
  function conversationRefusal(
    admitted: Exclude<ConversationAdmission, { kind: 'started' }>,
    provider: ReturnType<typeof selectConversationProvider>['kind'],
  ): Response {
    if (admitted.kind === 'completed') return replayReply(admitted.reply);
    if (admitted.kind === 'exhausted') {
      const reason = admitted.reason;
      const code =
        reason === 'turns'
          ? 'turn_limit'
          : reason === 'conversation_spend'
            ? 'conversation_limit'
            : reason === 'source_spend'
              ? 'source_limit'
              : 'site_limit';
      return json({ code, exhaustedReason: reason }, 429);
    }
    const refusals = {
      draft_unavailable: ['draft_unavailable', 401],
      conflict: ['idempotency_conflict', 409],
      inflight: ['chat_inflight', 409],
      turn_limit: ['turn_limit', 429],
      initial_required: ['initial_required', 409],
      busy: ['provider_busy', 429],
      provider_unavailable: [
        provider === 'unconfigured'
          ? 'provider_unconfigured'
          : provider === 'paused'
            ? 'provider_paused'
            : 'provider_unavailable',
        503,
      ],
      paused: ['provider_paused', 503],
      challenge_required: ['challenge_required', 428],
    } as const;
    const [code, status] = refusals[admitted.kind];
    return failure(code, status);
  }

  // Named `handleRequest`, never `fetch`: a local `fetch` shadowed the global one, so a default
  // fetcher in this closure called this handler instead of the network.
  async function handleRequest(request: Request, clientAddress?: string): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('origin');
    const now = clock();
    if (path === '/health' && request.method === 'GET')
      return json({ ok: true, service: 'puni-website-api' });
    const withCors = (response: Response) =>
      origin === config.publicOrigin ? attachSiteCors(response) : attachCors(response, origin);
    const source = requestSource(request, clientAddress, now);
    if (source === null) return withCors(failure('source_unavailable', 400));
    // The general window runs before any store read; the day salt behind `source` is cached.
    // Proof: keying the general window on the path admitted the 121st request in the windowless-route test.
    const general = admitWindows(generalWindowKeys(source), now);
    if (general.kind !== 'admitted') return withCors(rateRefusal(general));
    if (path === '/entry' && request.method === 'GET') {
      // Proof: the foreign-origin entry test fails if this exact-origin guard is removed.
      if (origin !== config.publicOrigin && origin !== config.appOrigin)
        return failure('origin_forbidden', 403);
      const response = json(entryAvailability(request, now), 200, { 'Cache-Control': 'no-store' });
      if (origin === config.publicOrigin) return attachSiteCors(response);
      return attachCors(response, origin);
    }
    if (request.method === 'OPTIONS') {
      if (origin === config.publicOrigin && (path === '/entry' || path === '/intakes'))
        return attachSiteCors(
          new Response(null, {
            status: 204,
            headers: {
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          }),
        );
      if (origin !== config.appOrigin) return failure('origin_forbidden', 403);
      return attachCors(
        new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Puni-CSRF',
          },
        }),
        origin,
      );
    }
    if (path === '/intakes' && request.method === 'POST') {
      // Proof: replacing this Origin guard with false made the forged-origin intake test fail.
      if (origin !== config.publicOrigin) return failure('origin_forbidden', 403);
      const rate = admitRequestRate('/intakes', source, now);
      if (rate.kind !== 'admitted') return rateRefusal(rate);
      const body = await readBody(request);
      const description = body && textField(body['description'], 2000);
      if (!description) return failure('invalid_description', 400);
      const priorClaim = draftClaim(request);
      const claim = secret();
      const created = store.createDraft(
        crypto.randomUUID(),
        description,
        digest(claim),
        now,
        now + draftLifetime,
        source,
      );
      // Proof: answering 201 with the claim cookie here put a Set-Cookie on the mounted draft-cap refusal.
      if (created.kind !== 'created') return attachSiteCors(capRefusal(created.kind, now));
      noteSiteCount('draft', created.siteCount, now);
      const headers = new Headers({
        'Set-Cookie': cookie(draftCookie, claim, 24 * 60 * 60),
        'Cache-Control': 'no-store',
      });
      // Proof: omitting this replay-only cookie made the old receipt unrecoverable when a new intake replaced its claim.
      if (priorClaim && store.hasReplayClaim(digest(priorClaim), now))
        headers.append('Set-Cookie', cookie(replayCookie, priorClaim, 24 * 60 * 60));
      if (request.headers.get('accept')?.includes('text/html')) {
        headers.set('Location', config.appBuildUrl ?? config.appManualUrl);
        return new Response(null, { status: 303, headers });
      }
      return attachSiteCors(
        json(
          { next: config.appBuildUrl ? new URL(config.appBuildUrl).pathname : '/manual' },
          201,
          headers,
        ),
      );
    }
    // Proof: deleting this guard made the mounted /conversation and /draft/discard foreign-origin tests return 200 and 204.
    if (origin !== config.appOrigin) return failure('origin_forbidden', 403);
    if (path === '/draft' && request.method === 'GET') {
      const claim = draftClaim(request);
      const draft = claim ? store.findDraft(digest(claim), now) : null;
      if (!claim || !draft) return attachCors(failure('draft_unavailable', 401), origin);
      const view: DraftView = {
        description: draft.description,
        brief: draft.brief,
        csrfToken: draftCsrf(claim),
        expiresAt: new Date(draft.expiresAt).toISOString(),
      };
      return attachCors(json(view, 200, { 'Cache-Control': 'no-store' }), origin);
    }
    if (path === '/conversation' && request.method === 'GET') {
      const claim = draftClaim(request);
      const draft = claim ? store.findDraft(digest(claim), now) : null;
      if (!claim || !draft) return attachCors(failure('draft_unavailable', 401), origin);
      // No conversation row means no turn was ever admitted for this draft.
      const conversation = store.findConversation(draft.id);
      const turns = conversation
        ? store.listConversationTurns(conversation.id).map(({ role, content }) => ({
            role,
            content,
          }))
        : [];
      const visitorTurns = turns.filter((turn) => turn.role === 'user').length;
      const initialKey = `initial:${draft.id}`;
      const initialRecord = conversation
        ? store.findConversationOperation(conversation.id, initialKey)
        : null;
      const latest = conversation ? store.findLatestConversationOperation(conversation.id) : null;
      const selected = selectConversationProvider().kind;
      const provider: ConversationProvider =
        selected === 'paid'
          ? 'openrouter'
          : selected === 'demo' || selected === 'paused'
            ? selected
            : 'disabled';
      // The check gates only the attempt that creates the conversation row under paid pricing.
      const challenge =
        provider === 'openrouter' && conversation === null
          ? mintBrowserCheck(
              digest(claim),
              readDaySalt(utcDayOf(now)),
              store.readSiteSpend(now) >= guardrailAllowance.halfSpendMicroUsd
                ? browserCheckDifficulty.elevated
                : browserCheckDifficulty.normal,
              now,
            )
          : null;
      const view: ConversationView = {
        challenge,
        stage: deriveStage(conversation?.state ?? 'open', visitorTurns),
        turns,
        visitorTurnsRemaining: Math.max(0, conversationAllowance.visitorTurns - visitorTurns),
        visitorTurnLimit: conversationAllowance.visitorTurns,
        provider,
        brief: draft.brief,
        description: draft.description,
        csrfToken: draftCsrf(claim),
        initialOperation: {
          state: initialRecord?.state ?? 'not-started',
          idempotencyKey: initialKey,
          truncated: initialRecord?.truncated ?? false,
        },
        latestOperation: latest
          ? {
              state: latest.state,
              idempotencyKey: latest.idempotencyKey,
              truncated: latest.truncated,
              message: latest.message,
            }
          : null,
        exhaustedReason: conversation?.exhaustedReason ?? null,
      };
      return attachCors(json(view, 200, { 'Cache-Control': 'no-store' }), origin);
    }
    if (path === '/conversation/stream' && request.method === 'POST') {
      const claim = draftClaim(request);
      if (!claim) return attachCors(failure('draft_unavailable', 401), origin);
      // Proof: removing this CSRF check made the missing-CSRF conversation stream test answer 200.
      if (!validDraftCsrf(request, claim))
        return attachCors(failure('csrf_forbidden', 403), origin);
      const rate = admitRequestRate('/conversation/stream', source, now, [
        `claim:${digest(claim)}`,
      ]);
      if (rate.kind !== 'admitted') return attachCors(rateRefusal(rate), origin);
      const body = await readBody(request);
      const suppliedKey = body?.['idempotencyKey'];
      if (typeof suppliedKey !== 'string' || !/^[A-Za-z0-9:_-]{8,120}$/.test(suppliedKey))
        return attachCors(failure('invalid_idempotency_key', 400), origin);
      const initial = body?.['initial'] === true;
      const draft = store.findDraft(digest(claim), now);
      if (!draft) return attachCors(failure('draft_unavailable', 401), origin);
      const message = initial
        ? draft.description
        : textField(body?.['message'], visitorMessageLimit);
      if (!message) return attachCors(failure('invalid_message', 400), origin);
      // Proof: using the browser's key for an initial operation made the replay test answer 429.
      const idempotencyKey = initial ? `initial:${draft.id}` : suppliedKey;
      const provider = selectConversationProvider();
      // Only an initial attempt that would create the conversation row is checked; a stale check
      // sent with a retry or a replay is ignored because the row already exists.
      let browserCheck: 'verified' | 'absent' = 'absent';
      if (
        provider.kind === 'paid' &&
        initial &&
        body['check'] !== undefined &&
        store.findConversation(draft.id) === null
      ) {
        const verified = verifyBrowserCheck(body['check'], digest(claim), now, readDaySalt);
        if (verified.kind !== 'verified')
          return attachCors(failure('challenge_invalid', 403), origin);
        browserCheck = 'verified';
      }
      const pricing: ConversationPricing =
        provider.kind === 'paid'
          ? {
              kind: 'paid',
              price: (history, stage) =>
                priceConversationRequest(
                  composeConversationRequest(history, message, stage),
                  provider.rates,
                  // Proof: pricing with the 400-token default failed the reasoning-effort reservation test.
                  conversationReplyTokens,
                ),
            }
          : provider.kind === 'demo'
            ? { kind: 'free' }
            : { kind: 'closed' };
      const admitted = store.admitConversationOperation({
        claimHash: digest(claim),
        sourceHash: source,
        idempotencyKey,
        bodyHash: digest(`${initial ? 'initial' : 'message'}:${message}`),
        message,
        initial,
        promptVersion: salesPromptVersion,
        pricing,
        browserCheck,
        now,
      });
      if (admitted.kind === 'paused') notePause(admitted.openedPauseId, 'site_spend', now);
      if (admitted.kind !== 'started') {
        const response = conversationRefusal(admitted, provider.kind);
        response.headers.set('Cache-Control', 'no-store');
        return attachCors(response, origin);
      }
      if (provider.kind === 'demo') {
        const reply = simulateReply(admitted.stage, draft.description);
        if (!store.completeConversationOperation(admitted.id, reply, null, Date.now(), false))
          throw new Error('Demo conversation operation failed to complete');
        const response = replayReply(reply);
        response.headers.set('Cache-Control', 'no-store');
        return attachCors(response, origin);
      }
      // Proof: the injected broken-store conversation test fails when this invariant is removed.
      if (provider.kind !== 'paid')
        throw new Error('Unavailable provider admitted a new conversation operation');
      noteSiteSpend(now);
      const outbound = composeConversationRequest(admitted.history, message, admitted.stage);
      const response = streamConfirmedReply({
        pin: {
          key: String(config.openRouterKey),
          model: String(config.openRouterModel),
          provider: String(config.openRouterProvider),
          reasoningEffort: config.openRouterReasoningEffort,
          fetch: config.providerFetch,
        },
        rates: provider.rates,
        system: outbound.system,
        messages: outbound.messages,
        maxCompletionTokens: conversationReplyTokens,
        operationId: admitted.id,
        aborts: conversationAborts,
        complete: (reply, actualMicroUsd, truncated) =>
          store.completeConversationOperation(
            admitted.id,
            reply,
            actualMicroUsd,
            Date.now(),
            truncated,
          ),
        markUnknown: () => {
          // After close, startup recovery settles this operation at its ceiling just the same.
          if (!isClosed) store.markConversationOperationUnknown(admitted.id);
        },
        onProviderFailure: noteProviderFailure,
        interruptedText: 'The reply stopped before it was confirmed. You can retry.',
        decline: {
          reply: providerDeclineReply,
          complete: (refusal, actualMicroUsd) => {
            const declined = store.completeDeclinedConversationOperation(
              admitted.id,
              providerDeclineReply,
              actualMicroUsd,
              Date.now(),
              refusal,
            );
            if (declined) noteDeclined();
            return declined;
          },
        },
        recordGeneration: (generationId) => {
          store.recordConversationGeneration(admitted.id, generationId);
        },
        isCompleted: () =>
          store.findConversationOperation(admitted.conversationId, idempotencyKey)?.state ===
          'completed',
      });
      return attachCors(response, origin);
    }
    if (path === '/conversation/cancel' && request.method === 'POST') {
      const claim = draftClaim(request);
      if (!claim) return attachCors(failure('draft_unavailable', 401), origin);
      if (!validDraftCsrf(request, claim))
        return attachCors(failure('csrf_forbidden', 403), origin);
      const body = await readBody(request);
      const key = body?.['idempotencyKey'];
      if (typeof key !== 'string' || !/^[A-Za-z0-9:_-]{8,120}$/.test(key))
        return attachCors(failure('invalid_idempotency_key', 400), origin);
      const draft = store.findDraft(digest(claim), now);
      if (!draft) return attachCors(failure('draft_unavailable', 401), origin);
      const conversation = store.findConversation(draft.id);
      const operation = conversation ? store.findConversationOperation(conversation.id, key) : null;
      if (!operation) return attachCors(failure('chat_unavailable', 404), origin);
      if (operation.state !== 'inflight' || !store.markConversationOperationUnknown(operation.id))
        return attachCors(failure('chat_not_running', 409), origin);
      // Proof: dropping this abort left the provider signal live in the mounted cancel test.
      conversationAborts.get(operation.id)?.abort();
      return attachCors(json({ state: 'unknown' }, 200, { 'Cache-Control': 'no-store' }), origin);
    }
    if (path === '/draft/discard' && request.method === 'POST') {
      const claim = draftClaim(request);
      if (!claim) return attachCors(failure('draft_unavailable', 401), origin);
      // Proof: removing this CSRF check made the missing-CSRF discard test return 204.
      if (!validDraftCsrf(request, claim))
        return attachCors(failure('csrf_forbidden', 403), origin);
      const outcome = store.discardDraft(digest(claim), now);
      if (outcome === 'missing') return attachCors(failure('draft_unavailable', 401), origin);
      if (outcome === 'consumed') return attachCors(failure('draft_consumed', 409), origin);
      return attachCors(
        new Response(null, {
          status: 204,
          headers: { 'Set-Cookie': cookie(draftCookie, '', 0), 'Cache-Control': 'no-store' },
        }),
        origin,
      );
    }
    if (path === '/brief' && request.method === 'PATCH') {
      const claim = draftClaim(request);
      if (!claim || !store.findDraft(digest(claim), now))
        return attachCors(failure('draft_unavailable', 401), origin);
      if (!validDraftCsrf(request, claim))
        return attachCors(failure('csrf_forbidden', 403), origin);
      const rate = admitRequestRate('/brief', source, now);
      if (rate.kind !== 'admitted') return attachCors(rateRefusal(rate), origin);
      const body = await readBody(request);
      const brief = body && textField(body['brief'], 8000);
      if (!brief) return attachCors(failure('invalid_brief', 400), origin);
      if (!store.updateBrief(digest(claim), brief, now))
        return attachCors(failure('draft_unavailable', 401), origin);
      return attachCors(json({ brief }), origin);
    }
    if (path === '/proposals' && request.method === 'POST') {
      const claim = draftClaim(request);
      const priorClaim = replayClaim(request);
      if (!claim && !priorClaim) return attachCors(failure('draft_unavailable', 401), origin);
      const currentCsrf = claim !== null && validDraftCsrf(request, claim);
      const replayCsrf = priorClaim !== null && validDraftCsrf(request, priorClaim);
      if (!currentCsrf && !replayCsrf) return attachCors(failure('csrf_forbidden', 403), origin);
      const rate = admitRequestRate('/proposals', source, now);
      if (rate.kind !== 'admitted') return attachCors(rateRefusal(rate), origin);
      const body = await readBody(request);
      const email = body && emailField(body['email']);
      const brief = body && textField(body['brief'], 8000);
      const idempotencyKey = body && textField(body['idempotencyKey'], 128);
      if (!email || !brief || !idempotencyKey || !/^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey))
        return attachCors(failure('invalid_proposal', 400), origin);
      const bodyHash = digest(JSON.stringify({ email, brief }));
      const receipt = randomBytes(16).toString('hex');
      const priorReplay = priorClaim
        ? store.replaySubmission(digest(priorClaim), idempotencyKey, bodyHash, now)
        : { kind: 'unavailable' as const };
      if (priorReplay.kind !== 'unavailable' && !replayCsrf)
        return attachCors(failure('csrf_forbidden', 403), origin);
      const outcome =
        priorReplay.kind !== 'unavailable'
          ? priorReplay
          : claim && currentCsrf
            ? store.submit(
                digest(claim),
                idempotencyKey,
                bodyHash,
                email,
                brief,
                receipt,
                now,
                source,
              )
            : { kind: 'unavailable' as const };
      if (outcome.kind === 'limited') return attachCors(capRefusal(outcome.code, now), origin);
      if (outcome.kind === 'created') noteSiteCount('proposal', outcome.siteCount, now);
      if (outcome.kind === 'conflict')
        return attachCors(failure('idempotency_conflict', 409), origin);
      if (outcome.kind === 'unavailable')
        return attachCors(failure('draft_unavailable', 401), origin);
      const response = json({ receipt: outcome.receipt }, outcome.kind === 'created' ? 201 : 200, {
        'Cache-Control': 'no-store',
      });
      // Proof: expiring this cookie made a browser lose authority to replay a submitted receipt after a lost response.
      return attachCors(response, origin);
    }
    if (path === '/operator/session' && request.method === 'GET') {
      const session = operatorSession(request, now);
      if (!session) return attachCors(failure('operator_unauthorized', 401), origin);
      return attachCors(
        json({ csrfToken: digest(`operator-csrf:${session.token}`) }, 200, {
          'Cache-Control': 'no-store',
        }),
        origin,
      );
    }
    if (path === '/operator/session' && request.method === 'POST') {
      const operatorPassword = config.operatorPassword;
      if (!operatorPassword) return attachCors(failure('operator_unconfigured', 503), origin);
      const rate = admitRequestRate('/operator/session', source, now);
      if (rate.kind !== 'admitted') return attachCors(rateRefusal(rate), origin);
      const body = await readBody(request);
      const password = body && textField(body['password'], 256);
      if (!password) return attachCors(failure('invalid_credentials', 401), origin);
      // The attempt is counted (and a lock read) in one transaction before any Argon2id work, so
      // a concurrent burst cannot outrun the caps. The answer never says which scope locked: the
      // body is fixed and Retry-After is always the longest lock.
      // Proof: reading the lock and recording the failure around the verify let a 30-guess burst reach it 30 times.
      const attempt = store.reserveLoginAttempt(source, now);
      if (attempt.kind === 'locked') {
        noteRateRefusal(now);
        return attachCors(
          json({ code: 'login_locked' }, 429, {
            // Proof: answering the remaining time of the lock gave 900 for a source and 3600 for the account.
            'Retry-After': String(guardrailAllowance.accountLockMilliseconds / 1000),
          }),
          origin,
        );
      }
      // Proof: bypassing this Argon2id verifier made the wrong-password route test issue a session.
      operatorPasswordHash ??= Bun.password.hash(operatorPassword, 'argon2id');
      if (!(await verifyPassword(password, await operatorPasswordHash))) {
        if (attempt.accountLockOpenedAt !== null)
          raiseAlert(
            'operator_locked',
            `operator_locked:${String(attempt.accountLockOpenedAt)}`,
            `operator login locked after ${String(guardrailAllowance.accountLoginFailures)} failures in 60 minutes on ${utcDayOf(now)}`,
          );
        return attachCors(failure('invalid_credentials', 401), origin);
      }
      store.settleLoginSuccess(source);
      const token = secret();
      const csrfToken = digest(`operator-csrf:${token}`);
      store.createOperatorSession(digest(token), digest(csrfToken), now + sessionLifetime);
      return attachCors(
        json({ csrfToken }, 201, {
          'Set-Cookie': cookie(operatorCookie, token, 8 * 60 * 60),
          'Cache-Control': 'no-store',
        }),
        origin,
      );
    }
    if (path === '/operator/session' && request.method === 'DELETE') {
      const session = operatorSession(request, now);
      if (!session) return attachCors(failure('operator_unauthorized', 401), origin);
      const csrf = request.headers.get('x-puni-csrf');
      if (!csrf || !equal(digest(csrf), session.csrfHash))
        return attachCors(failure('csrf_forbidden', 403), origin);
      store.deleteOperatorSession(digest(session.token));
      return attachCors(
        new Response(null, {
          status: 204,
          headers: { 'Set-Cookie': cookie(operatorCookie, session.token, 0) },
        }),
        origin,
      );
    }
    if (path === '/operator/guardrails' && request.method === 'GET') {
      if (!operatorSession(request, now))
        return attachCors(failure('operator_unauthorized', 401), origin);
      return attachCors(
        json(store.readGuardrailOverview(now), 200, { 'Cache-Control': 'no-store' }),
        origin,
      );
    }
    if (
      (path === '/operator/inference/pause' || path === '/operator/inference/resume') &&
      request.method === 'POST'
    ) {
      const session = operatorSession(request, now);
      if (!session) return attachCors(failure('operator_unauthorized', 401), origin);
      const csrf = request.headers.get('x-puni-csrf');
      // Proof: dropping this check let the missing-CSRF pause control open a pause.
      if (!csrf || !equal(digest(csrf), session.csrfHash))
        return attachCors(failure('csrf_forbidden', 403), origin);
      if (path === '/operator/inference/resume')
        return attachCors(
          store.resumeInferencePause(now)
            ? json({ paused: false }, 200, { 'Cache-Control': 'no-store' })
            : failure('not_paused', 409),
          origin,
        );
      const pauseId = store.openInferencePause('operator', 'operator', now);
      if (pauseId === null) return attachCors(failure('already_paused', 409), origin);
      notePause(pauseId, 'operator', now);
      return attachCors(json({ paused: true }, 201, { 'Cache-Control': 'no-store' }), origin);
    }
    if (path === '/operator/submissions' && request.method === 'GET') {
      if (!operatorSession(request, now))
        return attachCors(failure('operator_unauthorized', 401), origin);
      return attachCors(
        json({ submissions: store.listSubmissions() }, 200, { 'Cache-Control': 'no-store' }),
        origin,
      );
    }
    const statusMatch = /^\/operator\/submissions\/([a-f0-9-]+)$/.exec(path);
    if (statusMatch && request.method === 'PATCH') {
      const session = operatorSession(request, now);
      if (!session) return attachCors(failure('operator_unauthorized', 401), origin);
      const csrf = request.headers.get('x-puni-csrf');
      if (!csrf || !equal(digest(csrf), session.csrfHash))
        return attachCors(failure('csrf_forbidden', 403), origin);
      const body = await readBody(request);
      const status = body?.['status'];
      if (status !== 'reviewing' && status !== 'contacted' && status !== 'closed')
        return attachCors(failure('invalid_status', 400), origin);
      const advanced = store.advanceSubmission(statusMatch[1], status, now);
      return attachCors(advanced ? json({ status }) : failure('invalid_transition', 409), origin);
    }
    return attachCors(failure('not_found', 404), origin);
  }

  return {
    fetch: handleRequest,
    settleAlerts: async () => {
      await Promise.all(alertDeliveries);
    },
    close: () => {
      isClosed = true;
      store.close();
    },
  };
}
