import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  describeChatShare,
  FunnelBody,
  InvalidFunnelCounts,
  parseFunnelCounts,
} from './funnel-panel';

const dayMilliseconds = 24 * 60 * 60_000;

function funnelDay(index: number) {
  return {
    utcDay: new Date(Date.UTC(2026, 9, 7) - index * dayMilliseconds).toISOString().slice(0, 10),
    drafts: index === 0 ? 3 : 1,
    conversationsStarted: index === 0 ? 2 : 0,
    briefsCaptured: index === 0 ? 1 : 0,
    exhausted: {
      turns: index === 0 ? 1 : 0,
      conversation_spend: 0,
      source_spend: 0,
      site_spend: 0,
    },
    proposals: { manual: index === 0 ? 1 : 0, fromChat: index === 0 || index === 3 ? 1 : 0 },
    ceilingSettled: { count: index === 0 ? 2 : 0, microUsd: index === 0 ? 5_000 : 0 },
  };
}

const body = { days: Array.from({ length: 30 }, (_, index) => funnelDay(index)) };

test('renders thirty UTC days and the chat share', () => {
  const days = parseFunnelCounts(body);
  const markup = renderToStaticMarkup(createElement(FunnelBody, { days, failure: '' }));
  expect(markup.match(/<tr>/g)?.length).toBe(31);
  expect(markup).toContain('<th scope="row">2026-10-07</th>');
  expect(markup).toContain('<th scope="row">2026-09-08</th>');
  expect(markup).toContain('turns 1');
  expect(describeChatShare(days)).toBe('2 of 3 proposal requests came from the AI chat (67%).');
  expect(markup).toContain('2 of 3 proposal requests came from the AI chat (67%).');
  expect(describeChatShare([])).toBe('No proposal requests in this window.');
});

test('loading and a failed read keep the region and show the state instead of rows', () => {
  const loading = renderToStaticMarkup(createElement(FunnelBody, { days: null, failure: '' }));
  expect(loading).toContain('class="funnel-scroll"');
  expect(loading).toContain('Loading funnel…');
  const failed = renderToStaticMarkup(
    createElement(FunnelBody, { days: null, failure: 'The website API is unreachable.' }),
  );
  expect(failed).toContain('role="alert"');
  expect(failed).not.toContain('<tr>');
});

test('a malformed funnel body throws instead of rendering defaults', () => {
  expect(() => parseFunnelCounts({ days: [{ ...funnelDay(0), drafts: -1 }] })).toThrow(
    InvalidFunnelCounts,
  );
  expect(() => parseFunnelCounts({ days: [{ ...funnelDay(0), utcDay: 'yesterday' }] })).toThrow(
    InvalidFunnelCounts,
  );
  const withoutReason = { ...funnelDay(0), exhausted: { turns: 1 } };
  expect(() => parseFunnelCounts({ days: [withoutReason] })).toThrow(InvalidFunnelCounts);
  expect(() => parseFunnelCounts({ days: null })).toThrow(InvalidFunnelCounts);
});
