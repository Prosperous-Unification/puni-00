import {
  type ClientReply,
  createDomainChallenge,
  listOrganizationDomains,
  releaseDomainClaim,
  rotateDomainProof,
  verifyDomainClaim,
} from '@wbs/contracts';
import { useCallback, useEffect, useState } from 'react';

import { browserClient, failureMessage, unreachable } from '@/lib/http';

import {
  type AccessLoss,
  lostAccess,
  READ_ONLY,
  type RefusalOutcome,
  RELOAD,
  said,
} from './organization-access';

const domains = browserClient([
  listOrganizationDomains,
  createDomainChallenge,
  verifyDomainClaim,
  rotateDomainProof,
  releaseDomainClaim,
]);

type DomainClaim = Extract<
  ClientReply<typeof listOrganizationDomains>,
  { kind: 'success' }
>['body']['domains'][number];
type Challenge = Extract<ClientReply<typeof createDomainChallenge>, { kind: 'success' }>['body'];
/** A TXT record on screen, and the claim status it was issued for. */
type ShownChallenge = Challenge & { issuedFor: DomainClaim['status'] };
type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'ready'; claims: readonly DomainClaim[]; readAt: number };

/**
 * The active organization's domain claims. The list carries no proof secret,
 * so the TXT record to publish is shown only from the answer that issued it:
 * a new challenge or a rotation. Every change re-reads the list.
 */
export function DomainsPanel({
  onAccessLost,
}: {
  onAccessLost: (loss: AccessLoss) => void;
}): React.JSX.Element {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [domain, setDomain] = useState('');
  const [challenge, setChallenge] = useState<ShownChallenge | null>(null);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [fault, setFault] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    const reply = await domains.getApiOrganizationDomains({});
    switch (reply.kind) {
      case 'success':
        setView({ kind: 'ready', claims: reply.body.domains, readAt: Date.now() });
        // Proof: 2026-09-29, keeping the record whatever the list said failed
        // `clears the shown TXT record once its claim leaves pending`.
        setChallenge((shown) =>
          shown !== null &&
          reply.body.domains.some(
            (claim) => claim.id === shown.id && claim.status === shown.issuedFor,
          )
            ? shown
            : null,
        );
        return;
      case 'failure':
        setView({ kind: 'failure', message: failureMessage(reply.failure) });
        return;
      case 'refusal': {
        const outcome = domainRefusal(reply.body.error, 'view domains');
        if (outcome.kind === 'lost') onAccessLost(outcome.loss);
        else setView({ kind: 'failure', message: outcome.text });
        return;
      }
      default:
        return unreachable(reply);
    }
  }, [onAccessLost]);

  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      setFault(new Error('Unexpected domain list failure', { cause }));
    });
  }, [refresh]);

  if (fault !== null) throw fault;

  /** Runs one change, then re-reads the list after a success (showing `success`) or an in-place refusal. */
  async function change(
    send: () => Promise<
      ClientReply<
        | typeof createDomainChallenge
        | typeof verifyDomainClaim
        | typeof rotateDomainProof
        | typeof releaseDomainClaim
      >
    >,
    success: string,
  ) {
    setSending(true);
    setMessage('');
    try {
      const reply = await send();
      switch (reply.kind) {
        case 'success':
          setMessage(success);
          await refresh();
          return;
        case 'failure':
          setMessage(failureMessage(reply.failure));
          return;
        case 'refusal': {
          const outcome = domainRefusal(reply.body.error, 'manage domains');
          if (outcome.kind === 'lost') {
            onAccessLost(outcome.loss);
            return;
          }
          setMessage(outcome.text);
          await refresh();
          return;
        }
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      setFault(new Error('Unexpected domain change failure', { cause }));
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-labelledby="domains-heading" className="mb-8">
      <h2 id="domains-heading" className="mb-2 text-xl font-semibold">
        Domains
      </h2>
      {view.kind === 'loading' && <p>Loading domains…</p>}
      {view.kind === 'failure' && <p role="alert">{view.message}</p>}
      {view.kind === 'ready' && (
        <>
          <form
            className="mb-4 flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void change(async () => {
                const reply = await domains.postApiOrganizationDomainsChallenges({
                  body: { domain: domain.trim() },
                });
                if (reply.kind === 'success') {
                  setChallenge({ ...reply.body, issuedFor: 'pending' });
                  setDomain('');
                }
                return reply;
              }, 'Challenge issued. Publish the TXT record below, then verify.');
            }}
          >
            <label htmlFor="domain-name">Domain</label>
            <input
              id="domain-name"
              className="border p-2"
              value={domain}
              onChange={(event) => {
                setDomain(event.target.value);
              }}
              required
              maxLength={253}
            />
            <button type="submit" disabled={sending}>
              Claim domain
            </button>
          </form>
          {challenge !== null && (
            <div aria-label="TXT record to publish" role="region" className="mb-4">
              <p>
                Publish this TXT record for {challenge.domain} before{' '}
                <time dateTime={new Date(challenge.expiresAt).toISOString()}>
                  {new Date(challenge.expiresAt).toLocaleString()}
                </time>
                :
              </p>
              <dl>
                <dt>Name</dt>
                <dd>
                  <code>{challenge.dnsName}</code>
                </dd>
                <dt>Value</dt>
                <dd>
                  <code>{challenge.dnsValue}</code>
                </dd>
              </dl>
            </div>
          )}
          {view.claims.length === 0 ? (
            <p>No domains claimed yet.</p>
          ) : (
            <ul>
              {view.claims.map((claim) => (
                <li key={claim.id} className="mb-2">
                  <span>{claim.domain}</span> <span>{STATUS_NAMES[claim.status]}</span>
                  {/*
                   * Proof: 2026-09-29, keying this notice on `pending` failed
                   * `renders suspension and a failed proof check as distinct states`.
                   */}
                  {claim.status === 'suspended' && (
                    <p>
                      Suspended: the TXT proof has not been found for 14 days. Members and content
                      are kept; publish the proof and verify to recover the domain.
                    </p>
                  )}
                  {claim.status === 'verified' && claim.proofWarning && (
                    <p>
                      The last proof check failed. Keep the TXT record published or the domain will
                      be suspended.
                    </p>
                  )}
                  <p>
                    Last successful check: {moment(claim.lastSuccessAt)}. Last check:{' '}
                    {moment(claim.lastCheckedAt)}.
                  </p>
                  {/*
                   * Proof: 2026-09-29, offering Verify on an expired challenge
                   * failed `replaces Verify on a pending claim whose challenge expired`.
                   */}
                  {isChallengeExpired(claim, view.readAt) && (
                    <p>Challenge expired, issue a new one.</p>
                  )}
                  {claim.status !== 'verified' && !isChallengeExpired(claim, view.readAt) && (
                    <button
                      type="button"
                      disabled={sending}
                      aria-label={`Verify ${claim.domain}`}
                      onClick={() => {
                        void change(
                          () =>
                            domains.postApiOrganizationDomainsByIdVerify({
                              params: { id: claim.id },
                            }),
                          `${claim.domain} is verified.`,
                        );
                      }}
                    >
                      Verify
                    </button>
                  )}
                  {claim.status === 'pending' && (
                    <button
                      type="button"
                      disabled={sending}
                      aria-label={`Issue a new challenge for ${claim.domain}`}
                      onClick={() => {
                        void change(async () => {
                          const reply = await domains.postApiOrganizationDomainsChallenges({
                            body: { domain: claim.domain },
                          });
                          if (reply.kind === 'success')
                            setChallenge({ ...reply.body, issuedFor: 'pending' });
                          return reply;
                        }, 'Challenge issued. Publish the TXT record below, then verify.');
                      }}
                    >
                      New challenge
                    </button>
                  )}
                  {claim.status !== 'pending' && (
                    <button
                      type="button"
                      disabled={sending}
                      aria-label={`Rotate the proof for ${claim.domain}`}
                      onClick={() => {
                        void change(async () => {
                          const reply = await domains.postApiOrganizationDomainsByIdRotate({
                            params: { id: claim.id },
                          });
                          if (reply.kind === 'success')
                            setChallenge({ ...reply.body, issuedFor: claim.status });
                          return reply;
                        }, 'New proof issued. The previous one stays valid for up to 24 hours.');
                      }}
                    >
                      Rotate proof
                    </button>
                  )}
                  {releasing === claim.id ? (
                    <>
                      <button
                        type="button"
                        disabled={sending}
                        aria-label={`Confirm releasing ${claim.domain}`}
                        onClick={() => {
                          setReleasing(null);
                          void change(
                            () =>
                              domains.deleteApiOrganizationDomainsById({
                                params: { id: claim.id },
                              }),
                            `${claim.domain} was released.`,
                          );
                        }}
                      >
                        Confirm release
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReleasing(null);
                        }}
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={sending}
                      aria-label={`Release ${claim.domain}`}
                      onClick={() => {
                        // Proof: 2026-09-29, deleting here without the confirm
                        // step failed `releases only after confirmation`.
                        setReleasing(claim.id);
                      }}
                    >
                      Release
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {message !== '' && <p role="status">{message}</p>}
    </section>
  );
}

const STATUS_NAMES: Record<DomainClaim['status'], string> = {
  pending: 'Pending verification',
  verified: 'Verified',
  suspended: 'Suspended',
};

/** A pending claim whose TXT challenge lapsed when the list was read can no longer verify. */
function isChallengeExpired(claim: DomainClaim, readAt: number): boolean {
  return (
    claim.status === 'pending' &&
    claim.challengeExpiresAt !== null &&
    claim.challengeExpiresAt <= readAt
  );
}

function moment(at: number | null): string {
  return at === null ? 'never' : new Date(at).toLocaleString();
}

type DomainRefusalCode = Extract<
  ClientReply<
    | typeof listOrganizationDomains
    | typeof createDomainChallenge
    | typeof verifyDomainClaim
    | typeof rotateDomainProof
    | typeof releaseDomainClaim
  >,
  { kind: 'refusal' }
>['body']['error'];

/**
 * Every modeled domain refusal receives its own copy.
 *
 * Proof: 2026-09-29, answering `dns_unavailable` with the proof-mismatch copy
 * failed `renders the dns_unavailable verify refusal`.
 */
function domainRefusal(error: DomainRefusalCode, action: string): RefusalOutcome {
  switch (error) {
    case 'unauthenticated':
    case 'no_active_organization':
    case 'not_a_member':
      return lostAccess(error);
    case 'forbidden':
      return said(`Your role cannot ${action}.`);
    case 'invalid_domain':
      return said('Enter a domain name such as example.com.');
    case 'unclaimable':
      return said('That domain cannot be claimed: it is a public email or shared hosting domain.');
    case 'already_claimed':
    case 'domain_taken':
      return said('Another organization already owns that domain.');
    case 'stale':
      return said('That domain changed since the page loaded. Check its state and try again.');
    case 'proof_mismatch':
      return said('The TXT record was not found or does not match. Check the record and retry.');
    case 'dns_unavailable':
      return said('DNS could not be reached. Try again later.');
    case 'not_found':
      return said('That domain claim no longer exists.');
    case 'insufficient_scope':
      return said(READ_ONLY);
    case 'invalid_query':
    case 'invalid_body':
    case 'invalid_json':
    case 'invalid_params':
    case 'invalid_origin':
      return said(RELOAD);
    default:
      return unreachable(error);
  }
}
