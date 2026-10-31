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
  return { analytics, state, choice };
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
            We use basic cookieless measurement to understand visits and completed requests.
            Analytics cookies require your permission. Your request text and email stay out of
            analytics. Disable measurement to stop further collection.
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

/** An in-flow invitation; only a persisted choice hides it. It never moves request focus. */
export function ArrivalChoice() {
  const { analytics, state, choice } = useAnalyticsChoice();
  // Proof: removing this admission exposes the strip for accepted/rejected choices and disabled routes
  // in arrival choice visibility; removing disabled admission fails all three disabled/unsupported cases; replacing choice with loading state misses persisted grants during startup.
  if (
    !analytics ||
    !state ||
    state.status === 'disabled' ||
    choice === 'accepted' ||
    choice === 'rejected'
  )
    return null;
  return (
    <aside className="arrival-choice" data-arrival-choice="" aria-label="Analytics choice">
      <div>
        <p>
          <strong>Help us improve PUNI.</strong>
        </p>
        <p>
          We use basic cookieless measurement to improve PUNI. Allow analytics cookies for a clearer
          view of the journey, or disable measurement.
        </p>
        {(state.status === 'unavailable' || choice === 'unavailable') && (
          <p role="status">
            {choice === 'unavailable'
              ? 'We couldn’t read or save your choice. Please try again.'
              : 'Analytics is unavailable. Your request can continue.'}
          </p>
        )}
        <a href={`${siteOrigin}/privacy/`}>Privacy information</a>
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
