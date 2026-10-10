import React, { useEffect, useState } from 'react';

import { requestJson } from './api';
import { describeOperatorFailure } from './app-flow';

const exhaustedReasons = ['turns', 'conversation_spend', 'source_spend', 'site_spend'] as const;

/** Why a conversation was exhausted, as `GET /operator/funnel` keys its counts. */
export type ExhaustedReason = (typeof exhaustedReasons)[number];

/** One UTC day of `GET /operator/funnel`: counts only. */
export interface FunnelDayView {
  utcDay: string;
  drafts: number;
  conversationsStarted: number;
  briefsCaptured: number;
  exhausted: Record<ExhaustedReason, number>;
  proposals: { manual: number; fromChat: number };
  ceilingSettled: { count: number; microUsd: number };
}

/** The funnel body did not match the API contract. */
export class InvalidFunnelCounts extends Error {
  constructor(field: string) {
    super(`Invalid funnel counts: ${field}`);
  }
}

function readCount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new InvalidFunnelCounts(field);
  return value;
}

function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new InvalidFunnelCounts(field);
  return Object.fromEntries(Object.entries(value));
}

function parseFunnelDay(value: unknown): FunnelDayView {
  const day = readRecord(value, 'days');
  const utcDay = day['utcDay'];
  if (typeof utcDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(utcDay))
    throw new InvalidFunnelCounts('days.utcDay');
  const exhausted = readRecord(day['exhausted'], 'days.exhausted');
  const proposals = readRecord(day['proposals'], 'days.proposals');
  const settled = readRecord(day['ceilingSettled'], 'days.ceilingSettled');
  return {
    utcDay,
    drafts: readCount(day['drafts'], 'days.drafts'),
    conversationsStarted: readCount(day['conversationsStarted'], 'days.conversationsStarted'),
    briefsCaptured: readCount(day['briefsCaptured'], 'days.briefsCaptured'),
    exhausted: {
      turns: readCount(exhausted['turns'], 'days.exhausted.turns'),
      conversation_spend: readCount(
        exhausted['conversation_spend'],
        'days.exhausted.conversation_spend',
      ),
      source_spend: readCount(exhausted['source_spend'], 'days.exhausted.source_spend'),
      site_spend: readCount(exhausted['site_spend'], 'days.exhausted.site_spend'),
    },
    proposals: {
      manual: readCount(proposals['manual'], 'days.proposals.manual'),
      fromChat: readCount(proposals['fromChat'], 'days.proposals.fromChat'),
    },
    ceilingSettled: {
      count: readCount(settled['count'], 'days.ceilingSettled.count'),
      microUsd: readCount(settled['microUsd'], 'days.ceilingSettled.microUsd'),
    },
  };
}

/**
 * Validates the `GET /operator/funnel` body at the API boundary and returns its days, newest
 * first as served.
 * @throws InvalidFunnelCounts when a field is absent or outside the contract.
 */
export function parseFunnelCounts(value: unknown): FunnelDayView[] {
  const body = readRecord(value, 'body');
  if (!Array.isArray(body['days'])) throw new InvalidFunnelCounts('days');
  return body['days'].map(parseFunnelDay);
}

/** The share of the window's proposal requests whose draft was handed off from the AI chat. */
export function describeChatShare(days: FunnelDayView[]): string {
  const fromChat = days.reduce((sum, day) => sum + day.proposals.fromChat, 0);
  const total = days.reduce((sum, day) => sum + day.proposals.manual + day.proposals.fromChat, 0);
  if (total === 0) return 'No proposal requests in this window.';
  return `${String(fromChat)} of ${String(total)} proposal requests came from the AI chat (${String(Math.round((fromChat / total) * 100))}%).`;
}

function describeExhausted(exhausted: FunnelDayView['exhausted']): string {
  const parts = exhaustedReasons
    .filter((reason) => exhausted[reason] > 0)
    .map((reason) => `${reason} ${String(exhausted[reason])}`);
  return parts.length === 0 ? '0' : parts.join(', ');
}

/**
 * The window's chat share above a fixed-height region that scrolls on its own, so the page never
 * shifts when the counts arrive: while loading and on failure the region keeps its height and
 * shows the state instead of the thirty UTC day rows.
 */
export function FunnelBody({ days, failure }: { days: FunnelDayView[] | null; failure: string }) {
  return (
    <>
      <p className="funnel-share">{days === null ? '' : describeChatShare(days)}</p>
      <div className="funnel-scroll" role="region" aria-label="Funnel by UTC day" tabIndex={0}>
        {days !== null ? (
          <table className="funnel-table">
            <thead>
              <tr>
                <th scope="col">UTC day</th>
                <th scope="col">Drafts</th>
                <th scope="col">Chats</th>
                <th scope="col">Briefs</th>
                <th scope="col">Exhausted</th>
                <th scope="col">Manual</th>
                <th scope="col">From chat</th>
                <th scope="col">Ceiling-settled</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.utcDay}>
                  <th scope="row">{day.utcDay}</th>
                  <td>{day.drafts}</td>
                  <td>{day.conversationsStarted}</td>
                  <td>{day.briefsCaptured}</td>
                  <td>{describeExhausted(day.exhausted)}</td>
                  <td>{day.proposals.manual}</td>
                  <td>{day.proposals.fromChat}</td>
                  <td>{day.ceilingSettled.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : failure ? (
          <p className="feedback" role="alert">
            {failure}
          </p>
        ) : (
          <p className="small">Loading funnel…</p>
        )}
      </div>
    </>
  );
}

/**
 * The operator's Funnel panel below Guardrails: thirty UTC days counted from stored rows, with
 * the share of proposal requests that came from the AI chat.
 */
export function FunnelPanel() {
  const [days, setDays] = useState<FunnelDayView[] | null>(null);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    requestJson<unknown>('/operator/funnel')
      .then((body) => {
        setDays(parseFunnelCounts(body));
      })
      .catch((error: unknown) => {
        setFailure(describeOperatorFailure(error));
      });
  }, []);

  return (
    <section className="funnel" aria-labelledby="funnel-heading">
      <h2 id="funnel-heading">Funnel</h2>
      <p className="small">
        Last 30 UTC days, counted from stored rows. Exhaustions count on the conversation’s first
        day.
      </p>
      <FunnelBody days={days} failure={failure} />
    </section>
  );
}
