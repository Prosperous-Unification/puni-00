import React, { useEffect, useState } from 'react';

import { ApiFailure, requestJson } from './api';
import { describeOperatorFailure } from './app-flow';
import { createOperatorBodyReader } from './operator-view';

/** One alert row as `GET /operator/guardrails` lists it. */
export interface GuardrailAlertView {
  kind: string;
  detail: string;
  createdAt: number;
  delivery: 'recorded' | 'sent' | 'failed';
}

/** The `GET /operator/guardrails` body: counts and states only. */
export interface GuardrailOverviewView {
  pause: { reason: 'site_spend' | 'operator'; pausedAt: number } | null;
  siteSpendMicroUsd: number;
  siteCeilingMicroUsd: number;
  draftsToday: number;
  proposalsToday: number;
  accountLockedUntil: number | null;
  lockedSources: number;
  ceilingSettledToday: { count: number; microUsd: number };
  alerts: GuardrailAlertView[];
}

/** The overview body did not match the API contract. */
export class InvalidGuardrailOverview extends Error {
  constructor(field: string) {
    super(`Invalid guardrail overview: ${field}`);
  }
}

const { readCount, readRecord } = createOperatorBodyReader(InvalidGuardrailOverview);

/**
 * Validates the `GET /operator/guardrails` body at the API boundary.
 * @throws InvalidGuardrailOverview when a field is absent or outside the contract.
 */
export function parseGuardrailOverview(value: unknown): GuardrailOverviewView {
  const body = readRecord(value, 'body');
  let pause: GuardrailOverviewView['pause'] = null;
  if (body['pause'] !== null) {
    const raw = readRecord(body['pause'], 'pause');
    if (raw['reason'] !== 'site_spend' && raw['reason'] !== 'operator')
      throw new InvalidGuardrailOverview('pause.reason');
    pause = { reason: raw['reason'], pausedAt: readCount(raw['pausedAt'], 'pause.pausedAt') };
  }
  if (!Array.isArray(body['alerts'])) throw new InvalidGuardrailOverview('alerts');
  const alerts = body['alerts'].map((candidate: unknown): GuardrailAlertView => {
    const alert = readRecord(candidate, 'alerts');
    const delivery = alert['delivery'];
    if (
      typeof alert['kind'] !== 'string' ||
      typeof alert['detail'] !== 'string' ||
      (delivery !== 'recorded' && delivery !== 'sent' && delivery !== 'failed')
    )
      throw new InvalidGuardrailOverview('alerts');
    return {
      kind: alert['kind'],
      detail: alert['detail'],
      createdAt: readCount(alert['createdAt'], 'alerts.createdAt'),
      delivery,
    };
  });
  const settled = readRecord(body['ceilingSettledToday'], 'ceilingSettledToday');
  return {
    pause,
    siteSpendMicroUsd: readCount(body['siteSpendMicroUsd'], 'siteSpendMicroUsd'),
    siteCeilingMicroUsd: readCount(body['siteCeilingMicroUsd'], 'siteCeilingMicroUsd'),
    draftsToday: readCount(body['draftsToday'], 'draftsToday'),
    proposalsToday: readCount(body['proposalsToday'], 'proposalsToday'),
    accountLockedUntil:
      body['accountLockedUntil'] === null
        ? null
        : readCount(body['accountLockedUntil'], 'accountLockedUntil'),
    lockedSources: readCount(body['lockedSources'], 'lockedSources'),
    ceilingSettledToday: {
      count: readCount(settled['count'], 'ceilingSettledToday.count'),
      microUsd: readCount(settled['microUsd'], 'ceilingSettledToday.microUsd'),
    },
    alerts,
  };
}

function formatUsd(microUsd: number, digits = 2): string {
  return `$${(microUsd / 1_000_000).toFixed(digits)}`;
}

/**
 * The ceiling-settled line: today's operations whose usage never arrived, settled at their full
 * reservation, and the amount recorded for them, by which today's spend may over-count. Three
 * decimals, because one stopped turn reserves fractions of a cent.
 */
export function describeCeilingSettled(settled: GuardrailOverviewView['ceilingSettledToday']) {
  if (settled.count === 0) return 'None';
  const noun = settled.count === 1 ? 'operation' : 'operations';
  return `${String(settled.count)} ${noun} · ${formatUsd(settled.microUsd, 3)} recorded at the full reservation`;
}

/** The pause line: paused by whom and since when, or running. */
export function describePause(pause: GuardrailOverviewView['pause']): string {
  if (pause === null) return 'AI chat is running.';
  const since = new Date(pause.pausedAt).toISOString().slice(0, 16).replace('T', ' ');
  return pause.reason === 'site_spend'
    ? `AI chat is paused: today’s spend reached 80% of the ceiling (since ${since} UTC).`
    : `AI chat is paused by an operator (since ${since} UTC).`;
}

/**
 * The operator's Guardrails panel above the inbox: the pause state with a pause or resume control
 * behind an inline confirmation, today's spend against the ceiling and how much of it was
 * settled at full reservations, draft and proposal counts,
 * login locks and the last alerts with their delivery outcome.
 */
export function GuardrailsPanel({ csrf }: { csrf: string }) {
  const [overview, setOverview] = useState<GuardrailOverviewView | null>(null);
  const [failure, setFailure] = useState('');
  const [isConfirming, setConfirming] = useState(false);
  const [isPending, setPending] = useState(false);

  async function load(): Promise<void> {
    try {
      setOverview(parseGuardrailOverview(await requestJson<unknown>('/operator/guardrails')));
      setFailure('');
    } catch (error) {
      setFailure(describeOperatorFailure(error));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggle(): Promise<void> {
    if (!overview) return;
    setPending(true);
    try {
      await requestJson(
        overview.pause ? '/operator/inference/resume' : '/operator/inference/pause',
        { method: 'POST', headers: { 'X-Puni-CSRF': csrf } },
      );
    } catch (error) {
      // A 409 means another operator already changed the state; the reload shows it.
      if (!(error instanceof ApiFailure && error.status === 409))
        setFailure(describeOperatorFailure(error));
    } finally {
      setPending(false);
      setConfirming(false);
    }
    await load();
  }

  const action = overview?.pause ? 'Resume AI chat' : 'Pause AI chat';
  const pending = '…';
  return (
    <section className="guardrails" aria-labelledby="guardrails-heading">
      <h2 id="guardrails-heading">Guardrails</h2>
      {overview === null && failure ? (
        <p className="small">{failure}</p>
      ) : (
        // While loading, the panel keeps its loaded layout with placeholders, so the panels and
        // inbox below it do not shift when the overview arrives.
        <>
          <p className="guardrails-state" role="status">
            {overview ? describePause(overview.pause) : 'Loading guardrails…'}
          </p>
          {isConfirming && overview ? (
            <div className="guardrails-confirm" role="group" aria-label={`${action}?`}>
              <p>
                {overview.pause
                  ? 'Resume paid AI replies for every visitor?'
                  : 'Pause paid AI replies for every visitor? The manual brief stays open.'}
              </p>
              <button
                type="button"
                className="button compact"
                disabled={isPending}
                onClick={() => void toggle()}
              >
                {action}
              </button>
              <button
                type="button"
                className="button secondary compact"
                onClick={() => {
                  setConfirming(false);
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="actions">
              <button
                type="button"
                className="button secondary compact"
                disabled={overview === null}
                onClick={() => {
                  setConfirming(true);
                }}
              >
                {action}
              </button>
            </div>
          )}
          <dl className="guardrails-figures">
            <dt>Today’s spend</dt>
            <dd>
              {overview
                ? `${formatUsd(overview.siteSpendMicroUsd)} of ${formatUsd(overview.siteCeilingMicroUsd)}`
                : pending}
            </dd>
            <dt>Ceiling-settled today</dt>
            <dd>{overview ? describeCeilingSettled(overview.ceilingSettledToday) : pending}</dd>
            <dt>Drafts today</dt>
            <dd>{overview ? overview.draftsToday : pending}</dd>
            <dt>Proposals today</dt>
            <dd>{overview ? overview.proposalsToday : pending}</dd>
            <dt>Operator login</dt>
            <dd>
              {overview === null
                ? pending
                : overview.accountLockedUntil === null
                  ? 'Open'
                  : `Locked until ${new Date(overview.accountLockedUntil).toISOString().slice(11, 16)} UTC`}
              {overview && overview.lockedSources > 0
                ? ` · ${String(overview.lockedSources)} sources locked`
                : ''}
            </dd>
          </dl>
          <h3 className="small">Recent alerts</h3>
          {overview === null ? (
            <p className="small">{pending}</p>
          ) : overview.alerts.length === 0 ? (
            <p className="small">No alerts.</p>
          ) : (
            <ul className="guardrails-alerts">
              {overview.alerts.map((alert, index) => (
                <li key={index}>
                  <span className="tag">{alert.kind}</span> {alert.detail} ·{' '}
                  {alert.delivery === 'failed' ? 'webhook failed' : alert.delivery}
                </li>
              ))}
            </ul>
          )}
          {failure && (
            <p className="feedback" role="alert">
              {failure}
            </p>
          )}
        </>
      )}
    </section>
  );
}
