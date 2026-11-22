import { type ProposalStatus, proposalStatuses, type SubmissionView } from '@website/contracts';
import { useState } from 'react';

import { SubmissionFollowUps } from './submission-follow-ups';

type ActionStatus = Exclude<ProposalStatus, 'submitted'>;

const statusLabels = {
  submitted: 'Submitted',
  reviewing: 'Reviewing',
  contacted: 'Contacted',
  closed: 'Closed',
  irrelevant: 'Irrelevant',
} satisfies Record<ProposalStatus, string>;

/** Renders the operator's saved inbox with an independent status selection. */
export function SubmissionInbox({
  submissions,
  refresh,
  advance,
}: {
  submissions: readonly SubmissionView[];
  refresh: () => void;
  advance: (id: string, status: ActionStatus) => void;
}) {
  const [filter, setFilter] = useState<ProposalStatus | 'all'>('all');
  const visible =
    filter === 'all' ? submissions : submissions.filter(({ status }) => status === filter);

  return (
    <>
      <div className="actions">
        <div className="submission-filter">
          <label htmlFor="submission-status">Status</label>
          <select
            id="submission-status"
            value={filter}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value === 'all') {
                setFilter(value);
                return;
              }
              const status = proposalStatuses.find((choice) => choice === value);
              if (status === undefined) throw new Error('Unknown inbox status filter');
              setFilter(status);
            }}
          >
            <option value="all">All statuses</option>
            {proposalStatuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="button secondary compact" onClick={refresh}>
          Refresh inbox
        </button>
      </div>
      {visible.length === 0 && (
        <p className="empty-state">
          {filter === 'all'
            ? 'No proposals have been submitted yet.'
            : 'No requests match this status.'}
        </p>
      )}
      <div className="inbox">
        {visible.map((submission) => (
          <article className="submission" key={submission.id}>
            <div className="submission-head">
              <span className="tag">{statusLabels[submission.status]}</span>
              <time dateTime={submission.createdAt}>
                {new Date(submission.createdAt).toLocaleString()}
              </time>
            </div>
            <h2>{submission.email}</h2>
            <p className="small">Original request</p>
            <p>{submission.description}</p>
            <p className="small">Submitted brief</p>
            <p className="submission-brief">{submission.brief}</p>
            <SubmissionFollowUps followUps={submission.followUps} />
            {submission.status !== 'irrelevant' && (
              <div className="status-actions">
                {proposalStatuses
                  .filter((status) => status !== 'submitted')
                  .map((status) => (
                    <button
                      type="button"
                      key={status}
                      className="button secondary compact"
                      disabled={submission.status === status}
                      onClick={() => {
                        advance(submission.id, status);
                      }}
                    >
                      {statusLabels[status]}
                    </button>
                  ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
