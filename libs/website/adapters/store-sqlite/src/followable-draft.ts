/**
 * SQL condition on an `intake_draft` aliased `draft`: the draft may take new conversation work.
 * An unsubmitted draft qualifies. A submitted draft qualifies only when it is versioned and its
 * `proposal_submission` retention subject is not fenced or erased, so follow-up turns after
 * submission stay under that subject's retention and erasure. A draft consumed by a legacy
 * account request never qualifies. Callers add their own claim and expiry conditions.
 */
// Proof: in submitted-conversation.test.ts, dropping the version clause admitted the submitted legacy turn;
// dropping the fence clause let the fenced settlement reach the scoping fence and throw instead of refusing.
export const followableDraftPredicate = `(draft.consumed_at IS NULL OR (draft.scoping_version IS NOT NULL AND EXISTS (
  SELECT 1 FROM proposal_submission AS submission WHERE submission.draft_id = draft.id
    AND NOT EXISTS (SELECT 1 FROM retention_subject AS fence WHERE fence.subject_kind = 'proposal_submission'
      AND fence.subject_id = submission.id AND fence.erasure_state <> 'none'))))`;
