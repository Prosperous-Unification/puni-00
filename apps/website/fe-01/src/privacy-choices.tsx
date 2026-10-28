import { useEffect, useId, useState } from 'react';

import { useMilestones } from './analytics-flow';

/** Inline controls reserve layout space; opening privacy choices never covers the request form. */
export function PrivacyChoices() {
  const milestones = useMilestones();
  const analytics = milestones?.analytics;
  const [state, setState] = useState(() => analytics?.getState());
  const [isOpen, setOpen] = useState(() => state?.status === 'denied');
  const id = useId();
  useEffect(() => {
    if (!analytics) return;
    setState(analytics.getState());
    return analytics.subscribe(setState);
  }, [analytics]);
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
            Optional analytics helps us understand visits and completed requests. Your request text
            and email stay out of analytics. You can change this choice here.
          </p>
          <div className="scoping-answers">
            <button
              className="glass-button quiet"
              type="button"
              onClick={() => {
                analytics.accept();
                setOpen(false);
              }}
            >
              Accept analytics
            </button>
            <button
              className="glass-button quiet"
              type="button"
              onClick={() => {
                analytics.reject();
                setOpen(false);
              }}
            >
              Reject analytics
            </button>
          </div>
        </div>
      )}
      {state.status === 'loading' && (
        <p role="status">Analytics is loading. Your request can continue.</p>
      )}
      {state.status === 'unavailable' && (
        <p role="status">Optional analytics is unavailable. Your request can continue.</p>
      )}
      {isOpen && state.status === 'ready' && (
        <p role="status">Analytics is accepted. Reject analytics to withdraw.</p>
      )}
    </aside>
  );
}
