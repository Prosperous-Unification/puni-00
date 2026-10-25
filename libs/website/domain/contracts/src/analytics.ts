import {
  type QuestionId,
  scopingQuestions,
  type StartingChoiceId,
  startingChoices,
} from './scoping';

/** Reviewed public content only. Add approved published metadata here, never a visitor's slug/title. */
export const analyticsPages = {
  home: { surface: 'site', path: '/', title: 'PUNI' },
  services: { surface: 'site', path: '/services', title: 'PUNI services' },
  'product-discovery': {
    surface: 'site',
    path: '/services/product-discovery',
    title: 'PUNI product discovery',
  },
  'software-design': {
    surface: 'site',
    path: '/services/software-design',
    title: 'PUNI software design',
  },
  'software-development': {
    surface: 'site',
    path: '/services/software-development',
    title: 'PUNI software development',
  },
  'launch-app-or-website': {
    surface: 'site',
    path: '/services/launch-app-or-website',
    title: 'Launch an app or website',
  },
  'improve-app': {
    surface: 'site',
    path: '/services/improve-app',
    title: 'Improve an existing app',
  },
  'build-something-similar': {
    surface: 'site',
    path: '/services/build-something-similar',
    title: 'Build something similar',
  },
  'ai-assistant': {
    surface: 'site',
    path: '/services/ai-assistant',
    title: 'Set up a personal AI assistant',
  },
  'automate-workflows': {
    surface: 'site',
    path: '/services/automate-workflows',
    title: 'Automate workflows with AI',
  },
  blog: { surface: 'site', path: '/blog', title: 'PUNI journal' },
  privacy: { surface: 'site', path: '/privacy', title: 'PUNI privacy' },
  'a-clearer-first-step-for-software-requests': {
    surface: 'site',
    path: '/blog/a-clearer-first-step-for-software-requests',
    title: 'A clearer first step for software requests',
  },
  build: { surface: 'app', path: '/', title: 'Build with PUNI' },
  manual: { surface: 'app', path: '/manual', title: 'Request PUNI help' },
} as const;

export type AnalyticsPageId = keyof typeof analyticsPages;
export type AnalyticsStartingChoice = StartingChoiceId | 'typed';
export type AnalyticsVersion = '1' | 'legacy';
export type AnalyticsReviewRoute = 'early' | 'default' | 'exhausted' | 'manual';

/** Input contains catalogue identities only; the adapter resolves canonical page metadata. */
export type AnalyticsEvent =
  | { name: 'page_view' | 'services_view' | 'about_view'; page_id: AnalyticsPageId }
  | { name: 'article_view'; article_id: 'a-clearer-first-step-for-software-requests' }
  | {
      name: 'funnel_start';
      starting_choice: AnalyticsStartingChoice;
      entry_point: 'hero' | 'service' | 'article';
      funnel_version: AnalyticsVersion;
    }
  | {
      name: 'conversation_start';
      starting_choice: AnalyticsStartingChoice;
      funnel_version: AnalyticsVersion;
    }
  | {
      name: 'scoping_question_view';
      question_id: QuestionId;
      turn_bucket: '1' | '2-3' | '4-6' | '7+';
      starting_choice: AnalyticsStartingChoice;
    }
  | {
      name: 'scoping_answer';
      question_id: QuestionId;
      answer_mode: 'choice' | 'text' | 'mixed' | 'unsure';
    }
  | {
      name: 'brief_view' | 'email_request_view';
      route: AnalyticsReviewRoute;
      starting_choice: AnalyticsStartingChoice;
    }
  | {
      name: 'generate_lead';
      starting_choice?: AnalyticsStartingChoice;
      route: 'manual' | 'chat';
      funnel_version: AnalyticsVersion;
    }
  | {
      name: 'funnel_failure';
      category: 'unavailable' | 'limit' | 'network' | 'validation' | 'conflict';
    };

const choices = [...startingChoices.map((choice) => choice.id), 'typed'];
const versions = ['1', 'legacy'];
const reviewRoutes = ['early', 'default', 'exhausted', 'manual'];
const pages = Object.keys(analyticsPages);
const fields: Record<AnalyticsEvent['name'], Record<string, readonly string[]>> = {
  page_view: { page_id: pages },
  services_view: { page_id: pages },
  about_view: { page_id: pages },
  article_view: { article_id: ['a-clearer-first-step-for-software-requests'] },
  funnel_start: {
    starting_choice: choices,
    entry_point: ['hero', 'service', 'article'],
    funnel_version: versions,
  },
  conversation_start: { starting_choice: choices, funnel_version: versions },
  scoping_question_view: {
    question_id: Object.keys(scopingQuestions),
    turn_bucket: ['1', '2-3', '4-6', '7+'],
    starting_choice: choices,
  },
  scoping_answer: {
    question_id: Object.keys(scopingQuestions),
    answer_mode: ['choice', 'text', 'mixed', 'unsure'],
  },
  brief_view: { route: reviewRoutes, starting_choice: choices },
  email_request_view: { route: reviewRoutes, starting_choice: choices },
  generate_lead: { starting_choice: choices, route: ['manual', 'chat'], funnel_version: versions },
  funnel_failure: { category: ['unavailable', 'limit', 'network', 'validation', 'conflict'] },
};

/** Throws on programmer mistakes, including extra or non-enumerable fields, even while analytics is disabled. */
export function parseAnalyticsEvent(value: unknown): AnalyticsEvent {
  // Proof: removing the shape guard lost the named-boundary error for malformed event shapes.
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid analytics event');
  const entries = Object.entries(value);
  // Proof: removing this guard let dispatch send funnel_failure without its non-enumerable required category.
  if (Object.getOwnPropertyNames(value).length !== entries.length)
    throw new Error('Invalid analytics field');
  const name: unknown = Reflect.get(value, 'name');
  // Proof: removing name/own-name checks admitted inherited names or lost the named unknown-event error.
  if (!Object.hasOwn(value, 'name') || typeof name !== 'string' || !Object.hasOwn(fields, name))
    throw new Error('Unknown analytics event');
  // The own-key check above bounds the event name to the schema's keys.
  const schema = fields[name as AnalyticsEvent['name']];
  for (const [key, field] of entries) {
    if (key === 'name') continue;
    // Proof: bypassing unknown fields leaked boundary-sentinel@example.test into the actual dispatch sink;
    // removing value membership admitted sentinel values in the bounded-field test.
    if (!Object.hasOwn(schema, key) || typeof field !== 'string' || !schema[key].includes(field))
      throw new Error('Invalid analytics field');
  }
  for (const key of Object.keys(schema)) {
    if (name === 'generate_lead' && key === 'starting_choice' && !Object.hasOwn(value, key))
      continue;
    // Proof: removing required-field checks admitted missing fields in the sentinel boundary test.
    if (!Object.hasOwn(value, key)) throw new Error('Missing analytics field');
  }
  // Every own field and required key was checked against the complete bounded schema above.
  return Object.fromEntries(entries) as AnalyticsEvent;
}

/** No campaigns are approved for launch. Registration is a reviewed source change, not UTM input. */
export const analyticsCampaigns: readonly AnalyticsCampaign[] = [];
export interface AnalyticsCampaign {
  readonly source: string;
  readonly medium: string;
  readonly campaign: string;
}

/** Validate reviewed source registrations; this never registers a visitor-supplied campaign. */
export function parseAnalyticsCampaign(value: unknown): AnalyticsCampaign {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    // Proof: removing own-field checks accepted inherited campaign fields in the record-boundary test.
    Object.keys(value).length !== 3 ||
    !['source', 'medium', 'campaign'].every((key) => Object.hasOwn(value, key))
  )
    throw new Error('Invalid campaign registration');
  const source: unknown = Reflect.get(value, 'source');
  const medium: unknown = Reflect.get(value, 'medium');
  const campaign: unknown = Reflect.get(value, 'campaign');
  // Proof: broadening this pattern admitted an email/oversized campaign in campaign registrations.
  const identifier = /^[a-z][a-z0-9-]{0,63}$/;
  if (
    typeof source !== 'string' ||
    !identifier.test(source) ||
    typeof medium !== 'string' ||
    !identifier.test(medium) ||
    typeof campaign !== 'string' ||
    !identifier.test(campaign)
  )
    throw new Error('Invalid campaign identifier');
  return { source, medium, campaign };
}
