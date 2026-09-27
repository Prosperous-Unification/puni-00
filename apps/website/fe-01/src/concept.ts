export type ConceptTemplate = 'booking' | 'workflow' | 'dashboard';
export interface Concept {
  kind: 'concept';
  template: ConceptTemplate;
  title: string;
  summary: string;
  sections: { title: string; body: string }[];
  simulated: true;
  provider: 'demo' | 'openrouter';
  revision: 0 | 1;
  subject?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeText(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    !/[<>]/.test(value) &&
    !/(?:https?:|javascript:|data:|www\.)/i.test(value)
  );
}

/** Accepts only text and a fixed component choice; generated markup and remote resources fail closed. */
export function parseConcept(value: unknown): Concept {
  if (!isRecord(value)) throw new Error('Concept response must be an object');
  const allowed = new Set([
    'kind',
    'template',
    'title',
    'summary',
    'sections',
    'simulated',
    'provider',
    'revision',
    'subject',
  ]);
  // Proof: allowing extra keys makes the injected onClick field pass the production parser test.
  if (Object.keys(value).some((key) => !allowed.has(key)))
    throw new Error('Concept contains an unsupported field');
  if (
    value['kind'] !== 'concept' ||
    (value['template'] !== 'booking' &&
      value['template'] !== 'workflow' &&
      value['template'] !== 'dashboard') ||
    value['simulated'] !== true ||
    (value['provider'] !== 'demo' && value['provider'] !== 'openrouter') ||
    (value['revision'] !== 0 && value['revision'] !== 1) ||
    !safeText(value['title'], 100) ||
    !safeText(value['summary'], 400) ||
    (value['subject'] !== undefined && !safeText(value['subject'], 100))
  )
    throw new Error('Concept response is invalid');
  const sections = value['sections'];
  if (
    !Array.isArray(sections) ||
    sections.length < 1 ||
    sections.length > 6 ||
    !sections.every(
      (section) =>
        isRecord(section) &&
        Object.keys(section).every((key) => key === 'title' || key === 'body') &&
        safeText(section['title'], 80) &&
        safeText(section['body'], 300),
    )
  )
    throw new Error('Concept sections are invalid');
  // The runtime guards above establish the server-response boundary for this cast.
  return value as unknown as Concept;
}
