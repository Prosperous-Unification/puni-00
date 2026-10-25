import { expect, test } from 'bun:test';

import { type AnalyticsEvent, analyticsPages, parseAnalyticsEvent } from './analytics';

const events: AnalyticsEvent[] = [
  { name: 'page_view', page_id: 'home' },
  { name: 'services_view', page_id: 'home' },
  { name: 'about_view', page_id: 'home' },
  { name: 'article_view', article_id: 'a-clearer-first-step-for-software-requests' },
  { name: 'funnel_start', starting_choice: 'typed', entry_point: 'hero', funnel_version: '1' },
  { name: 'conversation_start', starting_choice: 'improve', funnel_version: '1' },
  {
    name: 'scoping_question_view',
    question_id: 'improve-blocker',
    turn_bucket: '1',
    starting_choice: 'improve',
  },
  { name: 'scoping_answer', question_id: 'improve-blocker', answer_mode: 'mixed' },
  { name: 'brief_view', route: 'early', starting_choice: 'launch' },
  { name: 'email_request_view', route: 'exhausted', starting_choice: 'unsure' },
  { name: 'generate_lead', starting_choice: 'typed', route: 'manual', funnel_version: 'legacy' },
  { name: 'funnel_failure', category: 'network' },
];

test('accepts the reviewed event table and receipt recovery without invented choice', () => {
  for (const event of events) expect(parseAnalyticsEvent(event)).toEqual(event);
  expect(
    parseAnalyticsEvent({ name: 'generate_lead', route: 'chat', funnel_version: '1' }),
  ).toEqual({ name: 'generate_lead', route: 'chat', funnel_version: '1' });
});

test('rejects sentinel content in every extra or bounded field', () => {
  for (const event of events) {
    expect(() => parseAnalyticsEvent({ ...event, email: 'secret@example.test' })).toThrow();
    for (const key of Object.keys(event)) {
      expect(() => parseAnalyticsEvent({ ...event, [key]: 'secret@example.test' })).toThrow();
      expect(() => parseAnalyticsEvent({ ...event, [key]: null })).toThrow();
      const missing = { ...event };
      Reflect.deleteProperty(missing, key);
      if (event.name !== 'generate_lead' || key !== 'starting_choice')
        expect(() => parseAnalyticsEvent(missing)).toThrow();
    }
  }
});

test('refuses arbitrary pages, articles, titles, paths and monetary values', () => {
  for (const value of [
    null,
    [],
    {},
    { name: 'constructor' },
    { name: 'page_view', page_id: '/operator' },
    { name: 'article_view', article_id: 'unpublished-draft' },
    { name: 'page_view', page_id: 'home', page_title: 'private brief' },
    { name: 'generate_lead', route: 'chat', funnel_version: '1', value: 100 },
  ])
    expect(() => parseAnalyticsEvent(value)).toThrow();
  expect(
    Object.values(analyticsPages).every(
      (page) => !page.path.includes('?') && !page.path.includes('#'),
    ),
  ).toBe(true);
});

test('campaign registrations are bounded reviewed identifiers, never arbitrary field bags', async () => {
  const { parseAnalyticsCampaign } = await import('./analytics');
  expect(
    parseAnalyticsCampaign({ source: 'fixture', medium: 'test', campaign: 'reserved-test' }),
  ).toEqual({ source: 'fixture', medium: 'test', campaign: 'reserved-test' });
  for (const campaign of [
    null,
    {},
    { source: 'email@example.test', medium: 'test', campaign: 'reserved-test' },
    { source: 'fixture', medium: 'test', campaign: 'x'.repeat(65) },
    { source: 'fixture', medium: 'test', campaign: 'reserved-test', email: 'secret@example.test' },
  ])
    expect(() => parseAnalyticsCampaign(campaign)).toThrow();
});

test('event names and campaign fields must belong to the supplied record', async () => {
  const { parseAnalyticsCampaign } = await import('./analytics');
  expect(() =>
    parseAnalyticsEvent(
      Object.assign(Object.create({ name: 'funnel_failure' }), { category: 'network' }),
    ),
  ).toThrow();
  expect(() =>
    parseAnalyticsCampaign(
      Object.assign(
        Object.create({ source: 'fixture', medium: 'test', campaign: 'reserved-test' }),
        { private: 1, other: 2, fields: 3 },
      ),
    ),
  ).toThrow();
});

test('malformed event shapes and names fail at their named boundary', () => {
  for (const value of [null, [], 'event'])
    expect(() => parseAnalyticsEvent(value)).toThrow('Invalid analytics event');
  for (const value of [{}, { name: 'constructor' }, { name: 'private-event' }])
    expect(() => parseAnalyticsEvent(value)).toThrow('Unknown analytics event');
});

test('approved service identities are accepted as bounded page events', () => {
  for (const page_id of [
    'launch-app-or-website',
    'improve-app',
    'build-something-similar',
    'ai-assistant',
    'automate-workflows',
  ] as const)
    expect(parseAnalyticsEvent({ name: 'page_view', page_id })).toEqual({
      name: 'page_view',
      page_id,
    });
  expect(() => parseAnalyticsEvent({ name: 'page_view', page_id: 'unapproved-slug' })).toThrow();
});

test('non-enumerable event fields cannot disappear from the validated event', () => {
  for (const event of events)
    for (const key of Object.keys(event)) {
      const hidden = Object.defineProperty({ ...event }, key, { enumerable: false });
      expect(() => parseAnalyticsEvent(hidden)).toThrow();
    }
  expect(() =>
    parseAnalyticsEvent(
      Object.defineProperty({ name: 'funnel_failure', category: 'network' }, 'email', {
        value: 'secret@example.test',
      }),
    ),
  ).toThrow();
});
