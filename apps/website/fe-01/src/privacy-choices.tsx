import { useId, useState, useSyncExternalStore } from 'react';

import { useMilestones } from './analytics-flow';
import { siteOrigin } from './chrome';

/** Both surfaces observe the controller's validated choice independently of vendor readiness. */
function useAnalyticsChoice() {
  const analytics = useMilestones()?.analytics;
  const state = useSyncExternalStore(
    (notify) => analytics?.subscribe(notify) ?? (() => undefined),
    () => analytics?.getState(),
  );
  const choice = useSyncExternalStore(
    (notify) => analytics?.subscribeChoice(notify) ?? (() => undefined),
    () => analytics?.getChoice(),
  );
  const region = useSyncExternalStore(
    (notify) => analytics?.subscribeRegion(notify) ?? (() => undefined),
    () => analytics?.getRegion(),
  );
  return { analytics, state, choice, region };
}

/** Inline controls reserve layout space; opening privacy choices never covers the request form. */
export function PrivacyChoices() {
  const { analytics, state, choice } = useAnalyticsChoice();
  const [isOpen, setOpen] = useState(false);
  const id = useId();
  if (!analytics || !state || state.status === 'disabled') return null;
  return (
    <aside className="privacy-choices" aria-label="Analytics privacy">
      <button
        className="harness-text-button"
        type="button"
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={() => {
          setOpen(!isOpen);
        }}
      >
        Privacy choices
      </button>
      {isOpen && (
        <div id={id} className="privacy-panel">
          <p>
            We use basic cookieless measurement to understand visits and completed requests. We
            estimate your approximate country on our server. Analytics cookies are allowed by
            regional default outside the consent region, or when you allow them. In the consent
            region and when the country is unknown, cookies stay off until you allow them. Your
            request text and email stay out of analytics. Disable measurement to stop further
            collection. <a href={`${siteOrigin}/privacy/`}>Privacy, source and licence details</a>
          </p>
          <div className="scoping-answers">
            <button
              className="glass-button quiet"
              type="button"
              onClick={() => {
                analytics.accept();
                // Proof: unconditional closing failed both footer refusal tests (expanded expected true, got false).
                if (analytics.getChoice() !== 'unavailable') setOpen(false);
              }}
            >
              Allow analytics cookies
            </button>
            <button
              className="glass-button quiet"
              type="button"
              onClick={() => {
                analytics.reject();
                // Proof: unconditional closing failed both footer refusal tests (expanded expected true, got false).
                if (analytics.getChoice() !== 'unavailable') setOpen(false);
              }}
            >
              Disable measurement
            </button>
          </div>
        </div>
      )}
      {(choice === 'accepted' || choice === 'rejected') && state.status === 'loading' && (
        <p role="status">Analytics is loading. Your request can continue.</p>
      )}
      {(isOpen || choice === 'accepted' || choice === 'rejected') &&
        state.status === 'unavailable' && (
          <p role="status">
            {choice === 'unavailable'
              ? 'We couldn’t read or save your choice. Please try again.'
              : 'Analytics is unavailable. Your request can continue.'}
          </p>
        )}
      {isOpen && state.status === 'cookieless' && (
        <p role="status">Analytics cookies are off. Basic cookieless measurement is active.</p>
      )}
      {isOpen && state.status === 'ready' && (
        <p role="status">Analytics cookies are allowed. Disable measurement to withdraw.</p>
      )}
      {isOpen && state.status === 'denied' && (
        <p role="status">Measurement is disabled. No further analytics is collected.</p>
      )}
    </aside>
  );
}

/** Compact in-flow invitation for unknown/consent-required defaults and recoverable choice failure.
 * Elsewhere hides it without saving a preference. It never moves request focus or covers the form.
 */
export function ArrivalChoice() {
  const { analytics, state, choice, region } = useAnalyticsChoice();
  // Proof: removing this admission exposes the strip for accepted/rejected choices and disabled routes
  // in arrival choice visibility; removing disabled admission fails all three disabled/unsupported cases; replacing choice with loading state misses persisted grants during startup.
  // Proof: removing regional admission failed regional arrival visibility while loading; hiding all
  // elsewhere choices failed regional grant cannot hide a failed preference write.
  if (
    !analytics ||
    !state ||
    state.status === 'disabled' ||
    choice === 'accepted' ||
    choice === 'rejected' ||
    (choice === 'unset' && region === 'elsewhere')
  )
    return null;
  return (
    <aside className="arrival-choice" data-arrival-choice="" aria-label="Analytics choice">
      <div>
        <p>
          <strong>Help improve PUNI.</strong> Analytics cookies are optional.{' '}
          <a href={`${siteOrigin}/privacy/`}>Privacy</a>
        </p>
        {(state.status === 'unavailable' || choice === 'unavailable') && (
          <p role="status">
            {choice === 'unavailable'
              ? 'We couldn’t read or save your choice. Please try again.'
              : 'Analytics is unavailable. Your request can continue.'}
          </p>
        )}
      </div>
      <div className="arrival-actions">
        <button
          className="glass-button quiet"
          type="button"
          onClick={() => {
            analytics.accept();
          }}
        >
          Allow analytics cookies
        </button>
        <button
          className="glass-button quiet"
          type="button"
          onClick={() => {
            analytics.reject();
          }}
        >
          Disable measurement
        </button>
      </div>
    </aside>
  );
}
