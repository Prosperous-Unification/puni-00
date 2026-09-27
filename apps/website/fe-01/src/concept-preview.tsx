import { useState } from 'react';

import type { Concept } from './concept';

/** A fixed local-only UI; generated text can label it but cannot create components or actions. */
export function ConceptPreview({ concept }: { concept: Concept }) {
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [reservationCount, setReservationCount] = useState(0);
  const [completed, setCompleted] = useState<string[]>([]);
  const [period, setPeriod] = useState<'Week' | 'Month'>('Week');
  const [view, setView] = useState<'visitor' | 'staff'>('visitor');
  const [simulatedSignedIn, setSimulatedSignedIn] = useState(false);
  const subject = concept.subject ?? concept.sections[0].title;

  let workspace;
  switch (concept.template) {
    case 'booking': {
      const slots = ['Tuesday · 10:00', 'Wednesday · 14:00', 'Friday · 11:30'];
      workspace = (
        <div className="preview-workspace">
          <div className="preview-header">
            <span className="preview-logo">{subject.slice(0, 1).toUpperCase()}</span>
            <span>{subject}</span>
            <button
              type="button"
              aria-pressed={simulatedSignedIn}
              title="Local simulation only"
              onClick={() => {
                setSimulatedSignedIn((current) => !current);
              }}
            >
              {simulatedSignedIn ? 'Sign out · simulation' : 'Sign in · simulation'}
            </button>
          </div>
          <div className="preview-columns">
            <div>
              <p className="eyebrow">DISCOVER</p>
              <h4>Choose a time that works.</h4>
              <p>{concept.sections[0]?.body}</p>
              <div className="slot-list">
                {slots.map((slot) => (
                  <button
                    type="button"
                    className={selectedSlot === slot ? 'selected' : ''}
                    key={slot}
                    onClick={() => {
                      setSelectedSlot(slot);
                    }}
                    aria-pressed={selectedSlot === slot}
                  >
                    {slot}
                    <span>→</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="preview-aside">
              <p className="eyebrow">YOUR SELECTION</p>
              <h4>{selectedSlot ?? 'Select a time'}</h4>
              <p>
                {selectedSlot
                  ? 'A place can be reserved in this local concept.'
                  : 'Select an available time to see the next step.'}
              </p>
              <button
                type="button"
                disabled={!selectedSlot}
                onClick={() => {
                  setReservationCount((count) => count + 1);
                }}
              >
                Reserve in this preview
              </button>
              {reservationCount > 0 && (
                <p role="status">Preview reservation {reservationCount} recorded locally.</p>
              )}
            </div>
          </div>
        </div>
      );
      break;
    }
    case 'workflow': {
      const stages = concept.sections.map((section) => section.title);
      workspace = (
        <div className="preview-workspace">
          <div className="preview-header">
            <span className="preview-logo">{subject.slice(0, 1).toUpperCase()}</span>
            <span>{subject}</span>
            <button
              type="button"
              aria-pressed={simulatedSignedIn}
              title="Local simulation only"
              onClick={() => {
                setSimulatedSignedIn((current) => !current);
              }}
            >
              {simulatedSignedIn ? 'Sign out · simulation' : 'Sign in · simulation'}
            </button>
          </div>
          <p className="eyebrow">WORK QUEUE</p>
          <h4>Move the work forward.</h4>
          <div className="workflow-list">
            {stages.map((stage, index) => (
              <div className="workflow-row" key={`${stage}-${String(index)}`}>
                <div>
                  <strong>{stage}</strong>
                  <p>{concept.sections[index]?.body}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCompleted((current) =>
                      current.includes(stage)
                        ? current.filter((entry) => entry !== stage)
                        : [...current, stage],
                    );
                  }}
                >
                  {completed.includes(stage) ? 'Done ✓' : 'Mark done'}
                </button>
              </div>
            ))}
          </div>
          <p className="preview-status" role="status">
            {completed.length} of {stages.length} stages marked done in this preview.
          </p>
        </div>
      );
      break;
    }
    case 'dashboard': {
      workspace = (
        <div className="preview-workspace">
          <div className="preview-header">
            <span className="preview-logo">{subject.slice(0, 1).toUpperCase()}</span>
            <span>{subject}</span>
            <button
              type="button"
              aria-pressed={simulatedSignedIn}
              title="Local simulation only"
              onClick={() => {
                setSimulatedSignedIn((current) => !current);
              }}
            >
              {simulatedSignedIn ? 'Sign out · simulation' : 'Sign in · simulation'}
            </button>
          </div>
          <div className="dashboard-controls">
            <div>
              <p className="eyebrow">OVERVIEW</p>
              <h4>Your work at a glance.</h4>
            </div>
            <div role="group" aria-label="Time period">
              <button
                type="button"
                aria-pressed={period === 'Week'}
                onClick={() => {
                  setPeriod('Week');
                }}
              >
                Week
              </button>
              <button
                type="button"
                aria-pressed={period === 'Month'}
                onClick={() => {
                  setPeriod('Month');
                }}
              >
                Month
              </button>
            </div>
          </div>
          <div className="dashboard-metrics">
            <div>
              <span>PERIOD</span>
              <strong>{period}</strong>
            </div>
            <div>
              <span>VIEW</span>
              <strong>{view === 'visitor' ? 'Visitor' : 'Staff'}</strong>
            </div>
            <div>
              <span>SECTIONS</span>
              <strong>{concept.sections.length}</strong>
            </div>
          </div>
          <button
            type="button"
            className="preview-switch"
            onClick={() => {
              setView((current) => (current === 'visitor' ? 'staff' : 'visitor'));
            }}
          >
            Switch to {view === 'visitor' ? 'staff' : 'visitor'} view
          </button>
          <div className="dashboard-notes">
            {concept.sections.map((section, index) => (
              <article key={index}>
                <h5>{section.title}</h5>
                <p>{section.body}</p>
              </article>
            ))}
          </div>
        </div>
      );
      break;
    }
    default: {
      throw new Error('Unknown concept template');
    }
  }

  return (
    <div className="concept-card">
      <span className="tag">Illustrative concept · local interactions · simulated auth</span>
      <h3>{concept.title}</h3>
      <p>{concept.summary}</p>
      {workspace}
      <p className="small" role="status">
        {simulatedSignedIn
          ? 'Signed in inside this local preview only. '
          : 'Signed out of this local preview. '}
        This preview uses fixed components and local state. It does not create accounts,
        reservations or production records.
      </p>
    </div>
  );
}
