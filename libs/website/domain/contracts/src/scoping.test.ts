import { expect, test } from 'bun:test';

import {
  getScopingQuestion,
  getStartingChoice,
  parseScopingAnswerRequest,
  parseScopingIntake,
  parseScopingReply,
  type QuestionId,
  readScopingReply,
  resolveScopingAnswer,
  scopingQuestions,
  type ScopingReply,
  startingChoices,
} from './scoping';

const reply: ScopingReply = {
  version: 1,
  message: 'A useful starting point.',
  nextQuestionId: null,
  brief: null,
};

const paths = [
  {
    start: 'launch',
    turns: [
      ['launch-purpose', 'buy-book', 'Buy or book'],
      ['launch-stage', 'idea', 'Idea only'],
    ],
  },
  {
    start: 'improve',
    turns: [
      ['improve-blocker', 'bugs', 'Recurring bugs'],
      ['app-area', 'payments', 'Payments'],
      ['improve-outcome', 'payments', 'Accept payments'],
    ],
  },
  {
    start: 'similar',
    turns: [
      ['similar-change', 'audience', 'Different audience'],
      ['similar-audience', 'team', 'My team'],
    ],
  },
  {
    start: 'assistant',
    turns: [
      ['assistant-help', 'email-calendar', 'Email and calendar'],
      ['assistant-autonomy', 'approve', 'Act after I approve'],
    ],
  },
  {
    start: 'automate',
    turns: [
      ['automate-task', 'moving-information', 'Moving information between tools'],
      ['automate-outcome', 'time', 'Less time spent'],
    ],
  },
  {
    start: 'unsure',
    turns: [
      ['unsure-reason', 'ai-curiosity', 'Curiosity about AI'],
      ['explore-examples', 'browse', 'Just browsing for now'],
    ],
  },
] as const;

for (const path of paths) {
  test(`${path.start} can supply all scoping answers using clicks alone`, () => {
    const intake = parseScopingIntake({ startingChoice: path.start, startConversation: true });
    expect(intake.kind).toBe('valid');
    let revision = 1;
    for (const [questionId, answerId, text] of path.turns) {
      expect(parseScopingReply({ ...reply, nextQuestionId: questionId }).kind).toBe('valid');
      expect(
        resolveScopingAnswer(
          { selected: { questionId, answerId, revision } },
          { questionId, revision },
        ),
      ).toEqual({
        kind: 'valid',
        value: { message: text, selected: { questionId, answerId, revision } },
      });
      revision += 1;
    }
  });
}

test('every question has contextual uncertainty and another answer without requiring typing', () => {
  for (const question of Object.values(scopingQuestions)) {
    expect(question.answers.some((answer) => answer.id === 'not-sure')).toBe(true);
    expect(question.answers.some((answer) => answer.id === 'something-else')).toBe(true);
    expect(new Set(question.answers.map((answer) => answer.id)).size).toBe(question.answers.length);
  }
  expect(
    getScopingQuestion('improve-uncertainty').answers.some((answer) => answer.id === 'assess'),
  ).toBe(true);
  expect(
    getScopingQuestion('milestone-confirmation').answers.some(
      (answer) => answer.id === 'bigger-problem',
    ),
  ).toBe(true);
  expect(
    getScopingQuestion('route-selection').answers.some((answer) => answer.id === 'launch'),
  ).toBe(true);
  expect(startingChoices.map((choice) => choice.id)).toEqual([
    'launch',
    'improve',
    'similar',
    'assistant',
    'automate',
    'unsure',
  ]);
});

test('question catalogue covers optional clarifiers and references without requiring a URL', () => {
  const ids: QuestionId[] = [
    'first-users',
    'workflow-current',
    'impact',
    'recent-breakage',
    'launch-references',
    'improve-references',
    'similar-references',
    'assistant-references',
    'automate-references',
    'unsure-references',
  ];
  for (const questionId of ids)
    expect(getScopingQuestion(questionId).answers.length).toBeGreaterThan(2);
  expect(
    resolveScopingAnswer(
      { selected: { questionId: 'similar-references', answerId: 'later', revision: 1 } },
      { questionId: 'similar-references', revision: 1 },
    ),
  ).toEqual({
    kind: 'valid',
    value: {
      message: 'I’ll share it later',
      selected: { questionId: 'similar-references', answerId: 'later', revision: 1 },
    },
  });
});

test('selected server label and typed explanation both reach the conversation', () => {
  const selected = { questionId: 'app-area', answerId: 'payments', revision: 4 } as const;
  expect(
    resolveScopingAnswer(
      { selected, message: ' Checkout failed after login changed. ' },
      { questionId: 'app-area', revision: 4 },
    ),
  ).toEqual({
    kind: 'valid',
    value: { selected, message: 'Payments\n\n Checkout failed after login changed. ' },
  });
  expect(
    resolveScopingAnswer({ message: 'My own answer' }, { questionId: null, revision: 0 }),
  ).toEqual({ kind: 'valid', value: { message: 'My own answer', selected: null } });
});

for (const [name, input] of [
  ['non-object', null],
  ['unknown key', { ...reply, extra: true }],
  ['missing field', { version: 1, message: 'Hello', nextQuestionId: null }],
  ['wrong version', { ...reply, version: 2 }],
  ['blank message', { ...reply, message: '  ' }],
  ['oversized message', { ...reply, message: 'x'.repeat(1201) }],
  ['unknown question', { ...reply, nextQuestionId: 'invented' }],
  ['question and brief', { ...reply, nextQuestionId: 'app-area', brief: 'A repair' }],
  ['blank brief', { ...reply, brief: ' ' }],
  ['oversized brief', { ...reply, brief: 'x'.repeat(4001) }],
  ['prototype question', { ...reply, nextQuestionId: 'toString' }],
  ['wrong question type', { ...reply, nextQuestionId: 12 }],
  ['wrong brief type', { ...reply, brief: false }],
] as const)
  test(`reply rejects ${name}`, () => {
    expect(parseScopingReply(input).kind).toBe('invalid');
  });

test('reply accepts bounded questions, handoffs and answers without further scoping', () => {
  for (const valid of [
    reply,
    { ...reply, nextQuestionId: 'app-area', message: 'x'.repeat(1200) },
    { ...reply, brief: 'x'.repeat(4000) },
  ] satisfies ScopingReply[]) {
    expect(parseScopingReply(valid)).toEqual({ kind: 'valid', value: valid });
    expect(readScopingReply(JSON.stringify(valid))).toEqual(valid);
  }
});

test('trusted malformed replies and unknown catalogue identifiers throw', () => {
  expect(() => readScopingReply('{')).toThrow();
  expect(() => readScopingReply(JSON.stringify({ ...reply, version: 9 }))).toThrow();
  expect(() => getScopingQuestion('invented')).toThrow();
  expect(() => getStartingChoice('invented')).toThrow();
});

test('intake explicitly distinguishes legacy manual start from new scoping', () => {
  expect(parseScopingIntake({ description: ' My project ' })).toEqual({
    kind: 'valid',
    value: {
      protocol: 'legacy',
      description: ' My project ',
      startingChoice: null,
      startConversation: false,
    },
  });
  expect(parseScopingIntake({ startingChoice: 'improve', startConversation: true })).toEqual({
    kind: 'valid',
    value: {
      protocol: 'scoping',
      description: 'Improve my app',
      startingChoice: 'improve',
      startConversation: true,
    },
  });
  expect(parseScopingIntake({ description: ' My project ', startingChoice: 'launch' })).toEqual({
    kind: 'valid',
    value: {
      protocol: 'scoping',
      description: ' My project ',
      startingChoice: 'launch',
      startConversation: false,
    },
  });
  expect(parseScopingIntake({ description: 'Typed opening', startConversation: true })).toEqual({
    kind: 'valid',
    value: {
      protocol: 'scoping',
      description: 'Typed opening',
      startingChoice: null,
      startConversation: true,
    },
  });
});

for (const [name, input] of [
  ['non-object', []],
  ['missing intent', {}],
  ['unknown choice', { startingChoice: 'invented' }],
  ['null choice', { description: 'Valid', startingChoice: null }],
  ['undefined choice', { description: 'Valid', startingChoice: undefined }],
  ['new intent without opening', { startConversation: true }],
  ['nonboolean intent', { description: 'Valid', startConversation: 'true' }],
  ['undefined intent', { description: 'Valid', startConversation: undefined }],
  ['blank text', { description: ' ' }],
  ['oversized text', { description: 'x'.repeat(2001) }],
  ['malformed text with choice', { description: 9, startingChoice: 'launch' }],
  ['unknown fields', { description: 'Valid', typo: true }],
] as const)
  test(`intake rejects ${name} rather than falling back to legacy`, () => {
    expect(parseScopingIntake(input).kind).toBe('invalid');
  });

for (const [name, input] of [
  ['non-object', null],
  ['missing answer', {}],
  ['empty typed answer', { message: ' ' }],
  ['oversized typed answer', { message: 'x'.repeat(2001) }],
  ['unknown field', { message: 'Hello', label: 'Forged' }],
  ['wrong typed type', { message: 7 }],
  ['malformed selection', { selected: null }],
  ['missing selection field', { selected: { questionId: 'app-area', revision: 4 } }],
  [
    'oversized selected explanation',
    {
      selected: { questionId: 'app-area', answerId: 'payments', revision: 4 },
      message: 'x'.repeat(2001),
    },
  ],
  [
    'wrong selected explanation type',
    { selected: { questionId: 'app-area', answerId: 'payments', revision: 4 }, message: 7 },
  ],
  ['unknown question', { selected: { questionId: 'invented', answerId: 'payments', revision: 4 } }],
  ['unknown answer', { selected: { questionId: 'app-area', answerId: 'invented', revision: 4 } }],
  [
    'forged label',
    { selected: { questionId: 'app-area', answerId: 'payments', revision: 4, label: 'Forged' } },
  ],
  [
    'malformed revision',
    { selected: { questionId: 'app-area', answerId: 'payments', revision: -1 } },
  ],
] as const)
  test(`answer rejects ${name}`, () => {
    expect(resolveScopingAnswer(input, { questionId: 'app-area', revision: 4 }).kind).toBe(
      'invalid',
    );
  });

test('stale question or revision cannot answer the last committed question', () => {
  expect(
    resolveScopingAnswer(
      { selected: { questionId: 'app-area', answerId: 'payments', revision: 3 } },
      { questionId: 'app-area', revision: 4 },
    ).kind,
  ).toBe('stale');
  expect(
    resolveScopingAnswer(
      { selected: { questionId: 'app-area', answerId: 'payments', revision: 4 } },
      { questionId: 'improve-blocker', revision: 4 },
    ).kind,
  ).toBe('stale');
  expect(
    resolveScopingAnswer(
      { selected: { questionId: 'app-area', answerId: 'payments', revision: 4 } },
      { questionId: null, revision: 4 },
    ).kind,
  ).toBe('stale');
});

test('malformed trusted question state throws before accepting an answer', () => {
  expect(() =>
    resolveScopingAnswer({ message: 'Hello' }, { questionId: 'app-area', revision: -1 }),
  ).toThrow();
});

test('normalized answer requests preserve exact retry fields and reject forged identity', () => {
  const selected = { questionId: 'launch-purpose' as const, answerId: 'buy-book', revision: 4 };
  expect(parseScopingAnswerRequest({ selected, message: '  Exact explanation  ' })).toEqual({
    kind: 'valid',
    value: { selected, message: '  Exact explanation  ' },
  });
  expect(parseScopingAnswerRequest({ selected })).toEqual({ kind: 'valid', value: { selected } });
  expect(parseScopingAnswerRequest({ message: '  Typed only  ' })).toEqual({
    kind: 'valid',
    value: { message: '  Typed only  ' },
  });
  for (const input of [
    null,
    [],
    {},
    { message: '' },
    { selected: null },
    { selected: { ...selected, answerId: 'unknown' } },
    { selected: { ...selected, questionId: 'unknown' } },
    { selected: { ...selected, revision: -1 } },
    { selected: { ...selected, revision: '4' } },
    { selected, message: 'x'.repeat(2001) },
    { selected, extra: 'forged' },
  ])
    expect(parseScopingAnswerRequest(input).kind).toBe('invalid');
});
