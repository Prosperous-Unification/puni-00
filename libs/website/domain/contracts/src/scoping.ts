/** A reviewed answer; its label, never a browser-supplied label, enters the conversation. */
export interface SuggestedAnswer {
  readonly id: string;
  readonly label: string;
}

/** The landing choice is retained independently of a visitor's typed opening. */
export const startingChoices = [
  { id: 'launch', label: 'Launch an app or website' },
  { id: 'improve', label: 'Improve my app' },
  { id: 'similar', label: 'Build something similar' },
  { id: 'assistant', label: 'Get an AI assistant' },
  { id: 'automate', label: 'Automate my work' },
  { id: 'unsure', label: 'Help me choose' },
] as const;

export type StartingChoiceId = (typeof startingChoices)[number]['id'];

function defineQuestion(
  label: string,
  choices: readonly (readonly [string, string])[],
): { label: string; answers: readonly SuggestedAnswer[] } {
  return {
    label,
    answers: [
      ...choices.map(([id, label]) => ({ id, label })),
      { id: 'not-sure', label: 'Not sure' },
      { id: 'something-else', label: 'Something else' },
    ],
  };
}

function defineReferenceQuestion(label: string) {
  return defineQuestion(label, [
    ['later', 'I’ll share it later'],
    ['none', 'No references yet'],
  ]);
}

/**
 * Bounded question menu from docs/website/conversion-funnel-options.md, including optional
 * clarifiers and uncertainty bridges. The model selects relevant questions; this is not a script.
 * Every question supports click-only uncertainty, another answer, and independent free text.
 */
export const scopingQuestions = {
  'launch-purpose': defineQuestion('What should it help people do?', [
    ['buy-book', 'Buy or book'],
    ['manage-work', 'Manage work'],
    ['learn-connect', 'Learn or connect'],
    ['present-business', 'Present a business'],
    ['explore-idea', 'Explore an idea'],
  ]),
  'launch-stage': defineQuestion('What do you already have?', [
    ['idea', 'Idea only'],
    ['outline', 'Written outline'],
    ['designs', 'Designs'],
    ['prototype', 'Working prototype'],
  ]),
  'improve-blocker': defineQuestion('What is holding it back?', [
    ['bugs', 'Recurring bugs'],
    ['unfinished', 'Unfinished feature'],
    ['launch', 'Launch uncertainty'],
    ['reliability', 'Slow or unreliable'],
    ['change', 'Difficult to change'],
  ]),
  'improve-outcome': defineQuestion('What would you like to make possible next?', [
    ['first-users', 'Invite first users'],
    ['payments', 'Accept payments'],
    ['reliability', 'Serve existing users reliably'],
    ['growth', 'Handle growth'],
    ['releases', 'Release changes confidently'],
  ]),
  'similar-change': defineQuestion('What would you change about the existing product?', [
    ['audience', 'Different audience'],
    ['simpler', 'Simpler experience'],
    ['workflow', 'Workflow tailored to us'],
    ['control', 'More control over it'],
    ['exploring', 'Still exploring'],
  ]),
  'similar-audience': defineQuestion('Who is it for?', [
    ['me', 'My own use'],
    ['team', 'My team'],
    ['customers', 'Customers'],
    ['market', 'A wider market'],
  ]),
  'assistant-help': defineQuestion('Where would help be most useful?', [
    ['email-calendar', 'Email and calendar'],
    ['research-writing', 'Research and writing'],
    ['tasks', 'Tasks and follow-ups'],
    ['information', 'Finding information'],
    ['tools', 'Coordinating tools'],
  ]),
  'assistant-autonomy': defineQuestion('How much should it do?', [
    ['suggest', 'Prepare suggestions for me'],
    ['approve', 'Act after I approve'],
    ['routine', 'Handle agreed routine tasks'],
  ]),
  'automate-task': defineQuestion('Which work keeps repeating?', [
    ['moving-information', 'Moving information between tools'],
    ['inquiries', 'Customer inquiries'],
    ['documents', 'Documents and reporting'],
    ['scheduling', 'Scheduling and follow-up'],
    ['approvals', 'Approvals'],
  ]),
  'automate-outcome': defineQuestion('What would improve most if this worked better?', [
    ['time', 'Less time spent'],
    ['mistakes', 'Fewer mistakes'],
    ['response', 'Faster response'],
    ['capacity', 'Room for more work'],
    ['visibility', 'Clearer visibility'],
  ]),
  'unsure-reason': defineQuestion('What brought you here?', [
    ['idea', 'A business idea'],
    ['app-problem', 'An app problem'],
    ['repetitive-work', 'Repetitive work'],
    ['ai-curiosity', 'Curiosity about AI'],
  ]),
  'app-area': defineQuestion('Which part needs attention?', [
    ['sign-in', 'Sign-in'],
    ['payments', 'Payments'],
    ['core-task', 'Core customer task'],
    ['deployment', 'Deployment'],
    ['several', 'Several parts'],
  ]),
  'recent-breakage': defineQuestion('What broke most recently?', [
    ['sign-in', 'Sign-in'],
    ['payments', 'Payments'],
    ['core-feature', 'A core feature'],
    ['several', 'Several things'],
  ]),
  'first-users': defineQuestion('Who needs it first?', [
    ['me', 'Me'],
    ['team', 'My team'],
    ['customers', 'Customers'],
    ['community', 'A community'],
  ]),
  'workflow-current': defineQuestion('What happens today?', [
    ['copy-paste', 'Copy and paste'],
    ['spreadsheets', 'Spreadsheets'],
    ['email', 'Email chains'],
    ['tools', 'Several disconnected tools'],
    ['undefined-process', 'A process we have not defined yet'],
  ]),
  impact: defineQuestion('What does this get in the way of?', [
    ['launch', 'Launching'],
    ['customers', 'Serving customers'],
    ['daily-work', 'Finishing daily work'],
    ['growth', 'Growing'],
    ['not-urgent', 'Nothing urgent'],
  ]),
  'explore-examples': defineQuestion('Which example would you like to explore?', [
    ['improve', 'An app ready for customers'],
    ['automate', 'Less repetitive work'],
    ['assistant', 'An assistant for daily tasks'],
    ['launch', 'A new app idea'],
    ['browse', 'Just browsing for now'],
  ]),
  'improve-uncertainty': defineQuestion('What would you like to be different?', [
    ['problems', 'Fewer problems'],
    ['easier', 'Easier to use'],
    ['customers', 'Ready for customers'],
    ['assess', 'Help me assess it'],
  ]),
  'route-selection': defineQuestion(
    'Which starting point fits your description?',
    startingChoices.map(({ id, label }) => [id, label]),
  ),
  'milestone-confirmation': defineQuestion('Is that the milestone you want help reaching?', [
    ['confirm', 'Yes, that’s the milestone'],
    ['confirm-payments', 'Yes, get payments working'],
    ['bigger-problem', 'There’s a bigger problem'],
    ['explain', 'Let me explain'],
  ]),
  'launch-references': defineReferenceQuestion(
    'Are there apps, websites, or articles you’d like to take inspiration from?',
  ),
  'improve-references': defineReferenceQuestion(
    'Can you share your app or an example of how you’d like it to work?',
  ),
  'similar-references': defineReferenceQuestion(
    'Which app should we use as a reference, and what should we borrow or change?',
  ),
  'assistant-references': defineReferenceQuestion(
    'Have you seen an assistant, demo, or article that shows what you want?',
  ),
  'automate-references': defineReferenceQuestion(
    'Any articles, walkthroughs, or examples of the workflow you have in mind?',
  ),
  'unsure-references': defineReferenceQuestion(
    'Seen an app, article, or video that helps explain what you’re looking for?',
  ),
} as const;

export type QuestionId = keyof typeof scopingQuestions;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[] = [],
): boolean {
  return (
    Object.keys(record).every((key) => allowed.includes(key)) &&
    required.every((key) => Object.hasOwn(record, key))
  );
}

function isText(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
}

function isRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Rejects unknown or inherited names before indexing the trusted catalogue. */
export function isQuestionId(value: unknown): value is QuestionId {
  return typeof value === 'string' && Object.hasOwn(scopingQuestions, value);
}

export function isStartingChoiceId(value: unknown): value is StartingChoiceId {
  return startingChoices.some((choice) => choice.id === value);
}

/** @throws when trusted state names a choice outside the reviewed catalogue. */
export function getStartingChoice(id: string) {
  const choice = startingChoices.find((choice) => choice.id === id);
  // Proof: bypassing this guard failed “trusted malformed replies and unknown catalogue identifiers throw” in scoping.test.ts.
  if (!choice) throw new Error(`Unknown starting choice: ${id}`);
  return choice;
}

/** @throws when trusted state names an unknown question, including prototype property names. */
export function getScopingQuestion(id: string) {
  // Proof: bypassing this guard failed “trusted malformed replies and unknown catalogue identifiers throw” in scoping.test.ts.
  if (!isQuestionId(id)) throw new Error(`Unknown scoping question: ${id}`);
  return scopingQuestions[id];
}

/** Invalid external input remains distinct from an absent optional field. */
export type ScopingParse<T> = { kind: 'valid'; value: T } | { kind: 'invalid'; reason: string };

/** Validated complete model response; question and brief may not coexist. */
export interface ScopingReply {
  version: 1;
  message: string;
  nextQuestionId: QuestionId | null;
  brief: string | null;
}

/** Validates a provider's complete object before publishing any question or candidate brief. */
export function parseScopingReply(input: unknown): ScopingParse<ScopingReply> {
  // Proof: bypassing this guard failed “reply rejects non-object” in scoping.test.ts.
  if (
    !isRecord(input) ||
    !hasKeys(
      input,
      ['version', 'message', 'nextQuestionId', 'brief'],
      ['version', 'message', 'nextQuestionId', 'brief'],
    )
  )
    return { kind: 'invalid', reason: 'reply_shape' };
  const { version, message, nextQuestionId, brief } = input;
  // Proof: bypassing this guard failed “reply rejects wrong version” in scoping.test.ts.
  if (version !== 1 || !isText(message, 1200)) return { kind: 'invalid', reason: 'reply_message' };
  // Proof: bypassing this guard failed “reply rejects unknown question” in scoping.test.ts.
  if (nextQuestionId !== null && !isQuestionId(nextQuestionId))
    return { kind: 'invalid', reason: 'reply_question' };
  // Proof: bypassing this guard failed “reply rejects blank brief” in scoping.test.ts.
  if (brief !== null && !isText(brief, 4000)) return { kind: 'invalid', reason: 'reply_brief' };
  // Proof: bypassing this guard failed “reply rejects question and brief” in scoping.test.ts.
  if (nextQuestionId !== null && brief !== null)
    return { kind: 'invalid', reason: 'reply_contradiction' };
  return { kind: 'valid', value: { version, message, nextQuestionId, brief } };
}

/** @throws on unreadable JSON or malformed trusted persisted version-1 replies. */
export function readScopingReply(serialized: string): ScopingReply {
  const parsed = parseScopingReply(JSON.parse(serialized));
  // Proof: bypassing this guard failed “trusted malformed replies and unknown catalogue identifiers throw” in scoping.test.ts.
  if (parsed.kind === 'invalid') throw new Error(`Malformed scoping reply: ${parsed.reason}`);
  return parsed.value;
}

/** Legacy clients remain manual-start; presence of either new field selects the new protocol. */
export type ScopingIntake =
  | { protocol: 'legacy'; description: string; startingChoice: null; startConversation: false }
  | {
      protocol: 'scoping';
      description: string;
      startingChoice: StartingChoiceId | null;
      startConversation: boolean;
    };

/** Validates the intake boundary without treating malformed new fields as legacy defaults. */
export function parseScopingIntake(input: unknown): ScopingParse<ScopingIntake> {
  // Proof: bypassing this guard failed “intake rejects unknown fields rather than falling back to legacy” in scoping.test.ts.
  if (!isRecord(input) || !hasKeys(input, ['description', 'startingChoice', 'startConversation']))
    return { kind: 'invalid', reason: 'intake_shape' };
  const hasChoice = Object.hasOwn(input, 'startingChoice');
  const hasIntent = Object.hasOwn(input, 'startConversation');
  // Proof: bypassing this guard failed “intake rejects blank text rather than falling back to legacy” in scoping.test.ts.
  if (Object.hasOwn(input, 'description') && !isText(input['description'], 2000))
    return { kind: 'invalid', reason: 'intake_description' };
  const description = typeof input['description'] === 'string' ? input['description'] : null;
  if (!hasChoice && !hasIntent) {
    // Proof: bypassing this guard failed “intake rejects missing intent rather than falling back to legacy” in scoping.test.ts.
    if (description === null) return { kind: 'invalid', reason: 'intake_empty' };
    return {
      kind: 'valid',
      value: { protocol: 'legacy', description, startingChoice: null, startConversation: false },
    };
  }
  const choice = input['startingChoice'];
  const intent = input['startConversation'];
  // Proof: bypassing this guard failed “intake rejects null choice rather than falling back to legacy” in scoping.test.ts.
  if (hasChoice && !isStartingChoiceId(choice)) return { kind: 'invalid', reason: 'intake_choice' };
  // Proof: bypassing this guard failed “intake rejects nonboolean intent rather than falling back to legacy” in scoping.test.ts.
  if (hasIntent && typeof intent !== 'boolean') return { kind: 'invalid', reason: 'intake_intent' };
  const startingChoice = isStartingChoiceId(choice) ? choice : null;
  // Proof: bypassing this guard failed “intake rejects new intent without opening rather than falling back to legacy” in scoping.test.ts.
  if (description === null && startingChoice === null)
    return { kind: 'invalid', reason: 'intake_empty' };
  return {
    kind: 'valid',
    value: {
      protocol: 'scoping',
      description: description ?? getStartingChoice(String(startingChoice)).label,
      startingChoice,
      startConversation: typeof intent === 'boolean' ? intent : false,
    },
  };
}

/** The last committed server question; selections must match both identity and revision. */
export interface ScopingQuestionState {
  questionId: QuestionId | null;
  revision: number;
}

export interface ScopingAnswerSelection {
  questionId: QuestionId;
  answerId: string;
  revision: number;
}

export interface ScopingAnswer {
  message: string;
  selected: ScopingAnswerSelection | null;
}

/**
 * Resolves external selections using reviewed labels before paid admission. Typed explanation
 * remains unchanged after the label; standalone text needs no selected question. `stale` maps
 * to a conflict requiring refresh. @throws for malformed trusted question state.
 */
export function resolveScopingAnswer(
  input: unknown,
  current: ScopingQuestionState,
): ScopingParse<ScopingAnswer> | { kind: 'stale' } {
  // Proof: bypassing this guard failed “malformed trusted question state throws before accepting an answer” in scoping.test.ts.
  if (!isRevision(current.revision)) throw new Error('Malformed scoping question revision');
  if (current.questionId !== null) getScopingQuestion(current.questionId);
  // Proof: bypassing this guard failed “answer rejects non-object” in scoping.test.ts.
  if (!isRecord(input) || !hasKeys(input, ['message', 'selected']))
    return { kind: 'invalid', reason: 'answer_shape' };
  const message = input['message'];
  // Proof: bypassing this guard failed “answer rejects oversized selected explanation” in scoping.test.ts.
  if (Object.hasOwn(input, 'message') && (typeof message !== 'string' || message.length > 2000))
    return { kind: 'invalid', reason: 'answer_message' };
  if (!Object.hasOwn(input, 'selected')) {
    // Proof: bypassing this guard failed “answer rejects missing answer” in scoping.test.ts.
    if (!isText(message, 2000)) return { kind: 'invalid', reason: 'answer_empty' };
    return { kind: 'valid', value: { message, selected: null } };
  }
  const selected = input['selected'];
  // Proof: bypassing this guard failed “answer rejects malformed selection” in scoping.test.ts.
  if (
    !isRecord(selected) ||
    !hasKeys(
      selected,
      ['questionId', 'answerId', 'revision'],
      ['questionId', 'answerId', 'revision'],
    )
  )
    return { kind: 'invalid', reason: 'selection_shape' };
  const { questionId, answerId, revision } = selected;
  // Proof: bypassing this guard failed “answer rejects unknown question” in scoping.test.ts.
  if (!isQuestionId(questionId) || typeof answerId !== 'string' || !isRevision(revision))
    return { kind: 'invalid', reason: 'selection_fields' };
  const answer = scopingQuestions[questionId].answers.find((answer) => answer.id === answerId);
  // Proof: bypassing this guard failed “answer rejects unknown answer” in scoping.test.ts.
  if (!answer) return { kind: 'invalid', reason: 'selection_answer' };
  // Proof: bypassing this guard failed “stale question or revision cannot answer the last committed question” in scoping.test.ts.
  if (questionId !== current.questionId || revision !== current.revision) return { kind: 'stale' };
  return {
    kind: 'valid',
    value: {
      message:
        typeof message === 'string' && message.length > 0
          ? `${answer.label}\n\n${message}`
          : answer.label,
      selected: { questionId, answerId, revision },
    },
  };
}

/** Raw visitor input retained for an explicit retry under the original operation identity. */
export type ScopingAnswerRequest =
  | { message: string; selected?: ScopingAnswerSelection }
  | { message?: string; selected: ScopingAnswerSelection };

/** Validates a raw answer independently of live revision; admission owns the revision comparison. */
export function parseScopingAnswerRequest(input: unknown): ScopingParse<ScopingAnswerRequest> {
  // Proof: bypassing this shape guard made the normalized-answer fixture throw on null instead of returning invalid.
  if (!isRecord(input)) return { kind: 'invalid', reason: 'answer_shape' };
  const selected = input['selected'];
  let current: ScopingQuestionState = { questionId: null, revision: 0 };
  if (Object.hasOwn(input, 'selected')) {
    // Proof: bypassing this boundary made the normalized-answer fixture throw on unknown IDs/revisions instead of returning invalid.
    if (
      !isRecord(selected) ||
      !isQuestionId(selected['questionId']) ||
      !isRevision(selected['revision'])
    )
      return { kind: 'invalid', reason: 'selection_fields' };
    current = { questionId: selected['questionId'], revision: selected['revision'] };
  }
  const parsed = resolveScopingAnswer(input, current);
  // Proof: bypassing raw validation failed the normalized-answer fixture for empty/oversized text and forged fields.
  if (parsed.kind !== 'valid') return { kind: 'invalid', reason: 'answer_request' };
  const message = input['message'];
  if (parsed.value.selected !== null)
    return {
      kind: 'valid',
      value: {
        ...(typeof message === 'string' ? { message } : {}),
        selected: parsed.value.selected,
      },
    };
  return { kind: 'valid', value: { message: parsed.value.message } };
}
