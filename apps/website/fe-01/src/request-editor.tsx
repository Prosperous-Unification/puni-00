import type { AnalyticsReviewRoute, ConversationScoping } from '@website/contracts';
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { readStartingChoice, useMilestone, useMilestones } from './analytics-flow';
import { ApiFailure, requestJson } from './api';
import { describeFailure } from './app-flow';
import { parseDraft, parseScoping } from './build-contract';
import { siteOrigin } from './chrome';

interface EditableDraft {
  description: string;
  brief: string;
  csrfToken: string;
  scoping?: ConversationScoping;
  expiresAt?: string;
}
interface Fields {
  brief: string;
  references: string;
  email: string;
  savedBrief: string;
  savedReferences: string;
  /** Revision governing the saved baselines; null means an older cache omitted its origin. */
  revision: number | null;
}
interface SavedVersion {
  brief: string;
  references: string;
  revision: number;
}

/** Exact visible submission composition; canonical body never contains an automatically appended reference block. */
export function composeRequest(
  brief: string,
  references: string,
): { kind: 'ready'; text: string } | { kind: 'overflow' } {
  // Proof: dropping the reference block failed the two-purpose reference composition assertion.
  const text = references === '' ? brief : `${brief}\n\nReferences\n${references}`;
  // Proof: removing the bound admits the oversized combined request in request-editor.test.ts.
  return text.length > 8000 ? { kind: 'overflow' } : { kind: 'ready', text };
}

function readFields(draft: EditableDraft): { fields: Fields; failure: string; expiresAt?: number } {
  const references = draft.scoping?.version === 1 ? (draft.scoping.references ?? '') : '';
  const fields = {
    brief: draft.brief || draft.description,
    references,
    email: '',
    savedBrief: draft.brief || draft.description,
    savedReferences: references,
    revision: draft.scoping?.version === 1 ? draft.scoping.revision : 0,
  };
  if (draft.scoping?.version === 1 && draft.expiresAt === undefined)
    return {
      fields,
      failure:
        'Browser recovery is unavailable because the draft expiry was not provided. You can still send this request.',
    };
  if (typeof sessionStorage === 'undefined') return { fields, failure: '' };
  try {
    const key = `puni_editor:${draft.csrfToken}`;
    for (const savedKey of Object.keys(sessionStorage)) {
      if (savedKey.startsWith('puni_editor:') && savedKey !== key)
        sessionStorage.removeItem(savedKey);
    }
    const stored = sessionStorage.getItem(key);
    if (stored === null) return { fields, failure: '' };
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('expiresAt' in parsed) ||
      typeof parsed.expiresAt !== 'number' ||
      !('fields' in parsed) ||
      typeof parsed.fields !== 'object' ||
      parsed.fields === null
    )
      throw new Error('Malformed saved editor');
    // Proof: bypassing expiry restored EXPIRED SECRET in the recovery boundary test.
    if (parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(key);
      return { fields, failure: '' };
    }
    const saved = Object.fromEntries(Object.entries(parsed.fields));
    // Proof: bypassing field validation hid the malformed-cache recovery notice in request-editor.test.tsx.
    if (
      typeof saved['brief'] !== 'string' ||
      typeof saved['references'] !== 'string' ||
      typeof saved['email'] !== 'string' ||
      typeof saved['savedBrief'] !== 'string' ||
      typeof saved['savedReferences'] !== 'string'
    )
      throw new Error('Malformed saved editor fields');
    const revision: unknown = saved['revision'];
    // Proof: accepting malformed cached revisions removed the visible recovery failure in request-editor.test.tsx.
    if (
      revision !== undefined &&
      revision !== null &&
      (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0)
    )
      throw new Error('Malformed saved editor revision');
    return {
      fields: {
        revision: typeof revision === 'number' ? revision : null,
        brief: saved['brief'],
        references: saved['references'],
        email: saved['email'],
        savedBrief: saved['savedBrief'],
        savedReferences: saved['savedReferences'],
      },
      failure: '',
      expiresAt: parsed.expiresAt,
    };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return {
      fields,
      failure: 'Browser recovery is unavailable. Keep this page open until you send your request.',
    };
  }
}

/** Removes only this browser claim's unsent fields after explicit discard or successful submission. */
export function clearRequestEditor(csrfToken: string): void {
  sessionStorage.removeItem(`puni_editor:${csrfToken}`);
}

/**
 * Shared versioned manual/chat review. Saves body and references independently under the current
 * revision; submitted bytes are exactly the final preview. Incoming candidates never replace
 * unsaved fields. Dirty baselines retain their originating revision until explicit reconciliation.
 * Review saves before restoring AI; a failed save preserves local manual submission. Browser
 * recovery is claim-scoped and expires; server saves survive fresh tabs.
 */
export function RequestEditor({
  draft,
  open,
  contact = false,
  route = 'default',
  onOpen,
  onClose,
  onRefresh,
  onFocusChange,
  onSubmitted,
}: {
  draft: EditableDraft;
  open: boolean;
  contact?: boolean;
  route?: AnalyticsReviewRoute;
  onOpen: () => void;
  onClose: () => void;
  onRefresh?: () => Promise<void>;
  onFocusChange?: (isFocused: boolean) => void;
  onSubmitted: () => void;
}) {
  const milestones = useMilestones();
  const [restored] = useState(() => readFields(draft));
  const [fields, setFields] = useState(restored.fields);
  const [failure, setFailure] = useState('');
  const [recoveryFailure, setRecoveryFailure] = useState(restored.failure);
  const [remote, setRemote] = useState<SavedVersion | null>(null);
  const [isPending, setPending] = useState(false);
  const [isContactOpen, setContactOpen] = useState(contact);
  const [isEditing, setEditing] = useState(false);
  // Proof: a dirty cache reload otherwise restored AI with unsaved references in request-editor.mjs.
  const [isEditorOpen, setEditorOpen] = useState(
    open ||
      draft.brief !== '' ||
      fields.brief !== fields.savedBrief ||
      fields.references !== fields.savedReferences,
  );
  const [receipt, setReceipt] = useState<string | null>(null);
  const isWriting = useRef(false);
  const proposalKey = useRef<string>(crypto.randomUUID());
  const expiresAt = useRef(
    draft.expiresAt
      ? Math.min(restored.expiresAt ?? Number.POSITIVE_INFINITY, Date.parse(draft.expiresAt))
      : null,
  );
  const id = useId();
  const briefField = useRef<HTMLTextAreaElement>(null);
  const final = composeRequest(fields.brief, fields.references);
  const isDirty =
    fields.brief !== fields.savedBrief || fields.references !== fields.savedReferences;
  const candidate = draft.scoping?.version === 1 ? draft.scoping.candidateBrief : null;
  // Proof: bypassing dirty-field eligibility enabled candidate acceptance in scoping.mjs.
  const acceptsCandidate =
    !isDirty && remote === null && fields.revision !== null && candidate !== null;
  const hasDeclined = draft.scoping?.version === 1 && draft.scoping.emailInvitationDeclined;

  useLayoutEffect(() => {
    // Proof: dropping dirty-field focus reopened AI after a failed reference save in request-editor.mjs.
    onFocusChange?.(
      isEditorOpen &&
        (isEditing || isContactOpen || isPending || isDirty || remote !== null) &&
        receipt === null,
    );
  }, [isEditorOpen, isEditing, isContactOpen, isPending, isDirty, remote, receipt, onFocusChange]);
  useMilestone(isEditorOpen && receipt === null ? `brief:${draft.csrfToken}` : null, {
    name: 'brief_view',
    route,
    starting_choice: readStartingChoice(draft.scoping),
  });
  useMilestone(
    isEditorOpen && !isEditing && isContactOpen && receipt === null
      ? `email:${draft.csrfToken}`
      : null,
    { name: 'email_request_view', route, starting_choice: readStartingChoice(draft.scoping) },
  );
  useEffect(() => {
    if (open) {
      setEditorOpen(true);
    }
  }, [open]);
  useLayoutEffect(() => {
    if (contact) {
      setContactOpen(true);
      setEditorOpen(true);
    }
  }, [contact]);
  useEffect(() => {
    if (isEditing) briefField.current?.focus();
  }, [isEditing]);
  useLayoutEffect(() => {
    if (draft.scoping?.version !== 1) return;
    const latest = {
      brief: draft.brief || draft.description,
      references: draft.scoping.references ?? '',
      revision: draft.scoping.revision,
    };
    // Proof: discarding the cached origin admitted the dirty-tab reload overwrite in request-editor.mjs.
    if (isDirty) {
      if (fields.revision !== latest.revision) setRemote(latest);
      return;
    }
    if (fields.revision !== null && fields.revision > latest.revision) return;
    setFields((current) => ({
      ...current,
      brief: latest.brief,
      references: latest.references,
      savedBrief: latest.brief,
      savedReferences: latest.references,
      revision: latest.revision,
    }));
    setRemote(null);
  }, [
    draft.brief,
    draft.scoping?.version === 1 ? draft.scoping.references : null,
    draft.scoping?.version === 1 ? draft.scoping.revision : null,
  ]);
  useEffect(() => {
    if (receipt !== null || expiresAt.current === null) return;
    try {
      sessionStorage.setItem(
        `puni_editor:${draft.csrfToken}`,
        JSON.stringify({ expiresAt: expiresAt.current, fields }),
      );
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      setRecoveryFailure(
        'Browser recovery is unavailable. Keep this page open until you send your request.',
      );
    }
  }, [fields, receipt]);

  async function editDraft(
    edit:
      | { kind: 'brief'; brief: string }
      | { kind: 'references'; references: string | null }
      | { kind: 'accept_candidate' }
      | { kind: 'decline_email' },
    currentRevision: number,
  ): Promise<{ revision: number; brief: string }> {
    try {
      const value: unknown = await requestJson('/scoping', {
        method: 'PATCH',
        headers: { 'X-Puni-CSRF': draft.csrfToken },
        body: JSON.stringify({ ...edit, revision: currentRevision }),
      });
      if (
        typeof value !== 'object' ||
        value === null ||
        !('scoping' in value) ||
        !('brief' in value)
      )
        throw new Error('Invalid scoping edit response');
      const scoping = parseScoping(value.scoping);
      if (scoping.version !== 1 || typeof value.brief !== 'string')
        throw new Error('Invalid versioned scoping edit response');
      return { revision: scoping.revision, brief: value.brief };
    } catch (error) {
      if (error instanceof ApiFailure && error.code === 'scoping_stale') {
        const fresh = parseDraft(await requestJson('/draft'));
        if (fresh.scoping?.version !== 1)
          throw new Error('Versioned draft became legacy', { cause: error });
        setRemote({
          brief: fresh.brief || fresh.description,
          references: fresh.scoping.references ?? '',
          revision: fresh.scoping.revision,
        });
        await onRefresh?.();
        throw new Error(
          'The draft changed in another tab. Your edits are still here. Choose which version to keep before saving.',
          { cause: error },
        );
      }
      throw error;
    }
  }

  /** Persists one bounded body/reference snapshot before ordinary AI can use it. */
  async function persistFields(): Promise<number> {
    // Proof: bypassing reconciliation attempted a stale cached write in the two-tab browser regression.
    if (remote !== null || fields.revision === null)
      throw new Error(
        'Review the saved version and choose which edits to keep before saving. AI chat has not received these edits.',
      );
    if (final.kind === 'overflow')
      throw new Error(
        'Shorten your request before saving it for AI. You can still review and edit it.',
      );
    let currentRevision = fields.revision;
    if (fields.references !== fields.savedReferences) {
      const saved = await editDraft(
        { kind: 'references', references: fields.references || null },
        currentRevision,
      );
      currentRevision = saved.revision;
      setFields((current) => ({
        ...current,
        savedReferences: fields.references,
        revision: saved.revision,
      }));
    }
    if (fields.brief !== fields.savedBrief) {
      const saved = await editDraft({ kind: 'brief', brief: fields.brief }, currentRevision);
      currentRevision = saved.revision;
      setFields((current) => ({ ...current, savedBrief: fields.brief, revision: saved.revision }));
    }
    return currentRevision;
  }

  async function saveDraft(): Promise<boolean> {
    if (isWriting.current) return false;
    isWriting.current = true;
    onFocusChange?.(true);
    setPending(true);
    setFailure('');
    try {
      await persistFields();
      setFailure('Draft saved. This has not sent a request.');
      await onRefresh?.();
      return true;
    } catch (error) {
      milestones?.failure(error);
      setFailure(
        `Your edits are still here. AI chat has not received them yet. ${describeFailure(error)}`,
      );
      return false;
    } finally {
      isWriting.current = false;
      setPending(false);
    }
  }

  async function reviewRequest(): Promise<void> {
    // Proof: skipping this flush omitted both references from the real captured provider request.
    await saveDraft();
    setEditing(false);
  }

  function reconcileFields(keepsLocal: boolean): void {
    if (remote === null) return;
    setFields((current) => ({
      ...current,
      brief: keepsLocal ? current.brief : remote.brief,
      references: keepsLocal ? current.references : remote.references,
      savedBrief: remote.brief,
      savedReferences: remote.references,
      revision: remote.revision,
    }));
    setRemote(null);
    setFailure(
      keepsLocal
        ? 'Your edits are kept. Review request will save them against the displayed version.'
        : 'The saved version is restored.',
    );
  }

  async function acceptCandidate(): Promise<void> {
    if (isWriting.current || !acceptsCandidate || fields.revision === null) return;
    isWriting.current = true;
    // Proof: removing this notification left Retry enabled during the pending candidate save.
    onFocusChange?.(true);
    setPending(true);
    setFailure('');
    try {
      const saved = await editDraft({ kind: 'accept_candidate' }, fields.revision);
      setFields((current) => ({
        ...current,
        brief: saved.brief,
        savedBrief: saved.brief,
        revision: saved.revision,
      }));
      await onRefresh?.();
    } catch (error) {
      milestones?.failure(error);
      setFailure(describeFailure(error));
    } finally {
      isWriting.current = false;
      setPending(false);
    }
  }

  async function keepExploring(): Promise<void> {
    if (isWriting.current) return;
    isWriting.current = true;
    onFocusChange?.(true);
    setPending(true);
    setFailure('');
    try {
      const currentRevision = await persistFields();
      const saved = await editDraft({ kind: 'decline_email' }, currentRevision);
      setFields((current) => ({ ...current, revision: saved.revision }));
      setContactOpen(false);
      onClose();
      await onRefresh?.();
    } catch (error) {
      milestones?.failure(error);
      setFailure(describeFailure(error));
    } finally {
      isWriting.current = false;
      setPending(false);
    }
  }

  async function submitRequest(event: React.SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isWriting.current || final.kind !== 'ready' || !fields.brief.trim()) return;
    isWriting.current = true;
    onFocusChange?.(true);
    setPending(true);
    setFailure('');
    try {
      let key = proposalKey.current;
      try {
        key = sessionStorage.getItem('puni_proposal_key') ?? key;
        sessionStorage.setItem('puni_proposal_key', key);
        sessionStorage.setItem(
          'puni_pending_proposal',
          JSON.stringify({
            version: 1,
            email: fields.email,
            brief: final.text,
            idempotencyKey: key,
            csrfToken: draft.csrfToken,
            createdAt: Date.now(),
          }),
        );
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        setRecoveryFailure(
          'Browser receipt recovery is unavailable. Keep this page open for confirmation.',
        );
      }
      proposalKey.current = key;
      const answer = await requestJson<{ receipt: string }>('/proposals', {
        method: 'POST',
        headers: { 'X-Puni-CSRF': draft.csrfToken },
        body: JSON.stringify({
          version: 1,
          email: fields.email,
          brief: final.text,
          idempotencyKey: key,
        }),
      });
      // Proof: moving confirmation before the POST failed mounted confirmation while still pending.
      milestones?.confirm(answer.receipt, {
        name: 'generate_lead',
        route: route === 'manual' ? 'manual' : 'chat',
        funnel_version: draft.scoping?.version === 1 ? '1' : 'legacy',
        starting_choice: readStartingChoice(draft.scoping),
      });
      setReceipt(answer.receipt);
      try {
        sessionStorage.removeItem('puni_pending_proposal');
        sessionStorage.removeItem('puni_proposal_key');
        clearRequestEditor(draft.csrfToken);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        setRecoveryFailure('Request saved; browser recovery cleanup is unavailable.');
      }
      onSubmitted();
    } catch (error) {
      milestones?.failure(error);
      setFailure(
        `${describeFailure(error)} If the response was lost, recover the receipt on the manual page.`,
      );
    } finally {
      isWriting.current = false;
      setPending(false);
    }
  }

  if (receipt !== null)
    return (
      <section className="proposal-card proposal-receipt" role="status">
        <h2>Request saved.</h2>
        <p>
          Your reference <strong className="reference">{receipt}</strong>
        </p>
        <p>Reply address: {fields.email}</p>
        <p>
          Danylo Fedorov will review your brief and reply with a recommended starting point and any
          questions needed to clarify. Saving confirms your request; it does not confirm email
          delivery.
        </p>
      </section>
    );
  return (
    <>
      {!isEditorOpen && (
        <button
          type="button"
          className="harness-text-button"
          onClick={() => {
            setEditorOpen(true);
            setEditing(true);
          }}
        >
          Add references or edit brief
        </button>
      )}
      <section hidden={!isEditorOpen} className="proposal-card" aria-label="Your request editor">
        <h2 className="message-label">[ YOUR REQUEST ]</h2>
        {isEditing ? (
          <>
            <label className="proposal-label" htmlFor={`${id}-brief`}>
              Your brief
            </label>
            <textarea
              id={`${id}-brief`}
              ref={briefField}
              className="proposal-brief"
              rows={5}
              value={fields.brief}
              disabled={isPending}
              onChange={(event) => {
                setFields({ ...fields, brief: event.target.value });
              }}
            />
            <details className="reference-editor" open={fields.references !== '' || undefined}>
              <summary>Optional references</summary>
              <p className="small">
                {draft.scoping?.version === 1 && draft.scoping.startingChoice === 'improve'
                  ? 'Your existing app or demo, and examples of how it should work.'
                  : draft.scoping?.version === 1 &&
                      ['assistant', 'automate'].includes(draft.scoping.startingChoice ?? '')
                    ? 'Tools, workflows, demos or articles that explain your goal.'
                    : 'Apps, websites or examples that inspire your idea.'}{' '}
                Add names or links and what to borrow, change or avoid. We don’t fetch links.
              </p>
              <label className="visually-hidden" htmlFor={`${id}-references`}>
                Optional references
              </label>
              <textarea
                id={`${id}-references`}
                className="proposal-brief"
                rows={3}
                value={fields.references}
                disabled={isPending}
                maxLength={4000}
                onChange={(event) => {
                  setFields({ ...fields, references: event.target.value });
                }}
              />
              <div className="scoping-answers">
                <button
                  type="button"
                  className="harness-text-button"
                  onClick={() => {
                    setFailure('No references needed. You can continue with your brief.');
                  }}
                >
                  No references yet
                </button>
                <button
                  type="button"
                  className="harness-text-button"
                  onClick={() => {
                    setFailure('You can share references later. Continue with your brief.');
                  }}
                >
                  I’ll share it later
                </button>
              </div>
            </details>
            <div className="scoping-answers">
              <button
                type="button"
                className="glass-button"
                disabled={isPending}
                onClick={() => void reviewRequest()}
              >
                Review request
              </button>
              <button
                type="button"
                className="glass-button quiet"
                disabled={isPending || final.kind === 'overflow'}
                onClick={() => void saveDraft()}
              >
                Save draft
              </button>
            </div>
          </>
        ) : (
          <div role="region" aria-label="Final request" className="request-preview">
            <p>
              {final.kind === 'ready'
                ? final.text
                : `${fields.brief}\n\nReferences\n${fields.references}`}
            </p>
          </div>
        )}
        {candidate !== null && candidate !== fields.brief && (
          <details>
            <summary>AI suggested brief</summary>
            <p className="submission-brief">{candidate}</p>
            <button
              type="button"
              className="glass-button quiet"
              disabled={isPending || !acceptsCandidate}
              onClick={() => void acceptCandidate()}
            >
              Use suggested brief
            </button>
            {isDirty && <p>Save your edits before choosing a different brief.</p>}
          </details>
        )}
        {final.kind === 'overflow' && (
          <p role="alert">
            Your brief and references exceed 8,000 characters. Shorten them to send; your text has
            been preserved.
          </p>
        )}
        {!isEditing && (
          <>
            {(!hasDeclined || isContactOpen) && (
              <p className="proposal-lead">
                Want a person at PUNI to review this? Leave your email and send this brief. We’ll
                reply with our recommended starting point and any questions we need to clarify.
              </p>
            )}
            <div className="scoping-answers request-actions">
              <button
                type="button"
                className="harness-text-button"
                onClick={() => {
                  setEditing(true);
                }}
              >
                Change this
              </button>
              {!isContactOpen && (
                <button
                  type="button"
                  className="glass-button"
                  onClick={() => {
                    setContactOpen(true);
                    onOpen();
                  }}
                >
                  Ask PUNI to help
                </button>
              )}
              <button
                type="button"
                className="harness-text-button"
                disabled={isPending}
                onClick={() => void keepExploring()}
              >
                Keep exploring
              </button>
            </div>
            {isContactOpen && (
              <form onSubmit={(event) => void submitRequest(event)}>
                <label className="proposal-label" htmlFor={`${id}-email`}>
                  Email
                </label>
                <div className="proposal-actions">
                  <div className="glass-field">
                    <input
                      id={`${id}-email`}
                      type="email"
                      autoComplete="email"
                      required
                      value={fields.email}
                      disabled={isPending}
                      onChange={(event) => {
                        setFields({ ...fields, email: event.target.value });
                      }}
                    />
                  </div>
                  <button
                    className="composer-send-pill"
                    type="submit"
                    disabled={isPending || final.kind === 'overflow' || !fields.brief.trim()}
                  >
                    {isPending ? 'Sending…' : 'Send my request'}
                  </button>
                </div>
                <p className="proposal-privacy">
                  Danylo Fedorov · <a href="mailto:dany@puni.dev">dany@puni.dev</a>. We use your
                  email to discuss this request. No newsletter signup.{' '}
                  <a href={`${siteOrigin}/privacy/`}>Privacy</a> ·{' '}
                  <a href="/manual">Recover a receipt</a>
                </p>
              </form>
            )}
          </>
        )}
        {remote !== null && (
          <section aria-label="Resolve draft changes" className="request-preview">
            <h3>Saved version changed</h3>
            <p>
              {`${remote.brief}${remote.references ? `\n\nReferences\n${remote.references}` : ''}`}
            </p>
            <p>
              Your local edits are preserved. Choose a version before saving or continuing AI chat.
            </p>
            <div className="scoping-answers">
              <button
                type="button"
                className="glass-button quiet"
                disabled={isPending}
                onClick={() => {
                  reconcileFields(true);
                }}
              >
                Keep my edits
              </button>
              <button
                type="button"
                className="glass-button quiet"
                disabled={isPending}
                onClick={() => {
                  reconcileFields(false);
                }}
              >
                Use saved version
              </button>
            </div>
          </section>
        )}
        {failure && (
          <p className="proposal-failure" role="status">
            {failure}
          </p>
        )}
        {recoveryFailure && <p role="status">{recoveryFailure}</p>}
      </section>
    </>
  );
}
