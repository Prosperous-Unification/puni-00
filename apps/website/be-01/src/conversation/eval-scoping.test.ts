import { expect, test } from 'bun:test';

import { parseSalesCorpus, runSalesEvaluation } from './eval-cli';

const provider = {
  openRouterKey: 'fixture-only',
  openRouterModel: 'openai/gpt-6-luna',
  openRouterProvider: 'azure/eu',
  openRouterInputUsdPerMillion: 0.11,
  openRouterOutputUsdPerMillion: 0.55,
  openRouterInputCeilingUsdPerMillion: 0.11,
  openRouterOutputCeilingUsdPerMillion: 0.55,
  openRouterMaxCompletionTokens: 700,
};
const scenario = {
  name: 'click-improve',
  protocol: 'scoping',
  startingChoice: 'improve',
  turns: [{ answers: { 'improve-blocker': 'bugs' } }],
  assertions: [{ kind: 'noPrice' }],
};
function stream(
  reply: string,
  usage: unknown = {
    cost: 0,
    prompt_tokens: 100,
    completion_tokens: 20,
    total_tokens: 120,
    completion_tokens_details: { reasoning_tokens: 12 },
  },
) {
  return new Response(
    [
      {
        id: 'fixture',
        model: 'fixture',
        choices: [{ index: 0, delta: { role: 'assistant', content: reply }, finish_reason: null }],
        usage,
      },
      {
        id: 'fixture',
        model: 'fixture',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage,
      },
    ]
      .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
      .join('') + 'data: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
const question = JSON.stringify({
  version: 1,
  message: 'Let us narrow the obstacle.',
  nextQuestionId: 'improve-blocker',
  brief: null,
});
const handoff = JSON.stringify({
  version: 1,
  message: 'A person can review the affected journey.',
  nextQuestionId: null,
  brief: 'Goal: improve the app. Recurring bugs; affected journey needs confirmation.',
});

test('adaptive selections use the committed question and revision and finish at a saved brief', async () => {
  const scripts = parseSalesCorpus(JSON.stringify({ scripts: [scenario] }));
  let calls = 0;
  const evaluation = await runSalesEvaluation({
    scripts,
    provider,
    providerFetch: () => stream(calls++ === 0 ? question : handoff),
    show: true,
    write: () => undefined,
    pause: () => Promise.resolve(),
  });
  expect(evaluation.passed).toBe(true);
  expect(calls).toBe(2);
  expect(evaluation.promptTokens).toBe(200);
  expect(evaluation.completionTokens).toBe(40);
  expect(evaluation).toMatchObject({
    reasoningTokens: 24,
    knownMicroUsd: 44,
    unknownReservedMicroUsd: 0,
  });
});

test('a scenario mismatch stops instead of inventing a different selected answer', async () => {
  const scripts = parseSalesCorpus(
    JSON.stringify({
      scripts: [{ ...scenario, turns: [{ answers: { 'app-area': 'payments' } }] }],
    }),
  );
  let calls = 0;
  const evaluation = await runSalesEvaluation({
    scripts,
    provider,
    providerFetch: () => {
      calls += 1;
      return stream(question);
    },
    show: false,
    write: () => undefined,
    pause: () => Promise.resolve(),
  });
  expect(evaluation.passed).toBe(false);
  expect(calls).toBe(1);
  expect(evaluation.results).toContainEqual({
    script: 'click-improve',
    assertion: 'scenarioMismatch:improve-blocker',
    passed: false,
  });
});

test('cumulative provider usage is counted once and missing usage reserves a positive ceiling', async () => {
  for (const [usage, expected] of [
    [
      {
        cost: 0,
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        completion_tokens_details: { reasoning_tokens: 12 },
      },
      { promptTokens: 100, completionTokens: 20, reasoningTokens: 12, knownMicroUsd: 22 },
    ],
    [undefined, { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, knownMicroUsd: 0 }],
  ] as const) {
    const evaluation = await runSalesEvaluation({
      scripts: [{ name: 'usage', turns: ['A booking tool'], assertions: [] }],
      provider,
      providerFetch: () => stream('Who uses it?', usage ?? null),
      show: false,
      write: () => undefined,
      pause: () => Promise.resolve(),
    });
    expect(evaluation).toMatchObject(expected);
    if (usage === undefined)
      expect(Reflect.get(evaluation, 'unknownReservedMicroUsd')).toBeGreaterThan(0);
  }
});

test('corpus refuses unknown answers and invalid regular expressions before provider calls', () => {
  expect(() =>
    parseSalesCorpus(
      JSON.stringify({
        scripts: [{ ...scenario, turns: [{ answers: { 'improve-blocker': 'forged' } }] }],
      }),
    ),
  ).toThrow('answer');
  expect(() =>
    parseSalesCorpus(
      JSON.stringify({
        scripts: [
          {
            name: 'regex',
            turns: ['A portal'],
            assertions: [{ kind: 'forbidPattern', pattern: '[', flags: '' }],
          },
        ],
      }),
    ),
  ).toThrow('assertion');
});

test('references and email refusal use durable edits while admission metadata leaves text unchanged', async () => {
  const scripts = parseSalesCorpus(
    JSON.stringify({
      scripts: [
        {
          ...scenario,
          stopOnBrief: false,
          turns: [
            {
              edit: {
                kind: 'references',
                references: 'https://example.test — borrow clear navigation',
              },
              message: 'Use the reference as a preference only.',
            },
            { edit: { kind: 'decline_email' }, message: 'Keep exploring without contact.' },
          ],
        },
      ],
    }),
  );
  const evaluation = await runSalesEvaluation({
    scripts,
    provider,
    providerFetch: () => stream(handoff),
    show: false,
    write: () => undefined,
    pause: () => Promise.resolve(),
  });
  expect(evaluation.passed).toBe(true);
  expect(evaluation.results).toContainEqual({
    script: 'click-improve',
    assertion: 'persisted:references',
    passed: true,
  });
  expect(evaluation.results).toContainEqual({
    script: 'click-improve',
    assertion: 'persisted:decline_email',
    passed: true,
  });
  expect(evaluation.results).toContainEqual({
    script: 'click-improve',
    assertion: 'streamEqualsStored',
    passed: true,
  });
});

test('scripted truncated structured content is a protocol failure and never passes as a useful reply', async () => {
  const scripts = parseSalesCorpus(JSON.stringify({ scripts: [{ ...scenario, turns: [] }] }));
  const evaluation = await runSalesEvaluation({
    scripts,
    provider,
    providerFetch: () => stream('{"version":1,"message":"cut'),
    show: false,
    write: () => undefined,
    pause: () => Promise.resolve(),
  });
  expect(evaluation.passed).toBe(false);
  expect(evaluation.knownMicroUsd).toBe(22);
  expect(evaluation.results).toContainEqual({
    script: 'click-improve',
    assertion: 'validScopingReply',
    passed: false,
  });
});

test('evaluation spend bound refuses the transport before purchasing an unaffordable operation', async () => {
  let calls = 0;
  const evaluation = await runSalesEvaluation({
    scripts: [{ name: 'bounded', turns: ['A portal'], assertions: [] }],
    provider,
    maximumMicroUsd: 1,
    providerFetch: () => {
      calls += 1;
      return stream('Who uses it?');
    },
    show: false,
    write: () => undefined,
    pause: () => Promise.resolve(),
  });
  expect(calls).toBe(0);
  expect(evaluation.passed).toBe(false);
});

test('a final-turn question fails handoff and scripted provider refusal remains distinct from ordinary content', async () => {
  const scripts = parseSalesCorpus(
    JSON.stringify({
      scripts: [
        {
          ...scenario,
          stopOnBrief: false,
          turns: Array.from({ length: 7 }, () => ({
            message: 'Please explain another uncertainty.',
          })),
        },
      ],
    }),
  );
  const evaluation = await runSalesEvaluation({
    scripts,
    provider,
    providerFetch: () => stream(question),
    show: false,
    write: () => undefined,
    pause: () => Promise.resolve(),
  });
  expect(evaluation.results).toContainEqual({
    script: 'click-improve',
    assertion: 'lastTurnHandoff',
    passed: false,
  });
  const refusal = await runSalesEvaluation({
    scripts: parseSalesCorpus(JSON.stringify({ scripts: [{ ...scenario, turns: [] }] })),
    provider,
    providerFetch: async () => {
      const response = stream('partial unsafe text');
      return new Response(
        (await response.text()).replace(
          '"finish_reason":"stop"',
          '"finish_reason":"content_filter"',
        ),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    },
    show: false,
    write: () => undefined,
    pause: () => Promise.resolve(),
  });
  expect(refusal.sessions[0]?.operations[0]).toMatchObject({
    finishReason: 'content_filter',
    knownMicroUsd: 22,
  });
  expect(refusal.results).toContainEqual({
    script: 'click-improve',
    assertion: 'streamEqualsStored',
    passed: true,
  });
  expect(refusal.results).toContainEqual({
    script: 'click-improve',
    assertion: 'usefulBrief',
    passed: false,
  });
});

test('paid mode stops immediately after a safety failure instead of purchasing later turns', async () => {
  let calls = 0;
  const evaluation = await runSalesEvaluation({
    scripts: [
      { name: 'unsafe', turns: ['A portal', 'Continue'], assertions: [{ kind: 'noPrice' }] },
    ],
    provider,
    stopOnFailure: true,
    providerFetch: () => {
      calls += 1;
      return stream('It costs $5.');
    },
    show: false,
    write: () => undefined,
    pause: () => Promise.resolve(),
  });
  expect(calls).toBe(1);
  expect(evaluation.passed).toBe(false);
});

test('scoping safety includes the visible candidate brief as well as the chat prose', async () => {
  const scripts = parseSalesCorpus(JSON.stringify({ scripts: [{ ...scenario, turns: [] }] }));
  const unsafeBrief = JSON.stringify({
    version: 1,
    message: 'A person can review this.',
    nextQuestionId: null,
    brief: 'We will build this for $5.',
  });
  const evaluation = await runSalesEvaluation({
    scripts,
    provider,
    stopOnFailure: true,
    providerFetch: () => stream(unsafeBrief),
    show: false,
    write: () => undefined,
    pause: () => Promise.resolve(),
  });
  expect(evaluation.passed).toBe(false);
  expect(evaluation.results).toContainEqual({
    script: 'click-improve',
    assertion: 'noPrice',
    passed: false,
  });
});

const exploratoryMessage =
  'Since you are curious about AI rather than describing a specific project, there is no need to turn this into a project brief. You can keep browsing examples or come back when a particular task comes to mind.';
const exploration = {
  ...scenario,
  name: 'curiosity',
  startingChoice: 'unsure',
  ending: 'exploration',
  turns: [
    { answers: { 'unsure-reason': 'ai-curiosity' } },
    { answers: { 'explore-examples': 'assistant' } },
  ],
};

test('declared exploration accepts committed guidance without forcing a brief or another paid answer', async () => {
  let calls = 0;
  const evaluation = await runSalesEvaluation({
    scripts: parseSalesCorpus(JSON.stringify({ scripts: [exploration] })),
    provider,
    stopOnFailure: true,
    providerFetch: () =>
      stream(
        JSON.stringify(
          calls++ === 0
            ? {
                version: 1,
                message: 'We can explore what brought you here.',
                nextQuestionId: 'unsure-reason',
                brief: null,
              }
            : { version: 1, message: exploratoryMessage, nextQuestionId: null, brief: null },
        ),
      ),
    show: false,
    write: () => undefined,
    pause: () => Promise.resolve(),
  });
  expect(calls).toBe(2);
  expect(evaluation.passed).toBe(true);
  expect(evaluation.results).toContainEqual({
    script: 'curiosity',
    assertion: 'exploratoryEnding',
    passed: true,
  });
  expect(evaluation.results).toContainEqual({
    script: 'curiosity',
    assertion: 'streamEqualsStored',
    passed: true,
  });
  expect(evaluation.sessions[0]?.promptVersion).toBe('puni-scoping-v2');
});

for (const ending of [undefined, 'exploration'] as const)
  test(`exploratory closure stays explicit: ${String(ending)}`, async () => {
    let calls = 0;
    const evaluation = await runSalesEvaluation({
      scripts: parseSalesCorpus(JSON.stringify({ scripts: [{ ...exploration, ending }] })),
      provider,
      stopOnFailure: true,
      providerFetch: () => {
        calls += 1;
        return stream(
          JSON.stringify({
            version: 1,
            message: exploratoryMessage,
            nextQuestionId: null,
            brief: null,
          }),
        );
      },
      show: false,
      write: () => undefined,
      pause: () => Promise.resolve(),
    });
    expect(calls).toBe(1);
    expect(evaluation.passed).toBe(ending === 'exploration');
  });

for (const failure of [
  'unhelpful',
  'forced-brief',
  'invented-project',
  'invalid-envelope',
  'missing-charge',
  'unsafe-price',
  'open-question',
] as const)
  test(`declared exploration refuses ${failure} without further paid turns`, async () => {
    let calls = 0;
    const envelope = JSON.stringify({
      version: 1,
      message:
        failure === 'unhelpful'
          ? 'Okay.'
          : failure === 'invented-project'
            ? 'Your project needs a new task app. You can browse examples.'
            : failure === 'unsafe-price'
              ? 'You can browse examples. It costs $5.'
              : exploratoryMessage,
      nextQuestionId: failure === 'open-question' ? 'unsure-reason' : null,
      brief: failure === 'forced-brief' ? 'Build a task assistant for the business.' : null,
    });
    const evaluation = await runSalesEvaluation({
      scripts: parseSalesCorpus(
        JSON.stringify({
          scripts: [{ ...exploration, ...(failure === 'open-question' ? { turns: [] } : {}) }],
        }),
      ),
      provider,
      stopOnFailure: true,
      providerFetch: () => {
        calls += 1;
        return failure === 'missing-charge'
          ? stream(envelope, { prompt_tokens: 100, completion_tokens: 20 })
          : stream(failure === 'invalid-envelope' ? '{' : envelope);
      },
      show: false,
      write: () => undefined,
      pause: () => Promise.resolve(),
    });
    expect(calls).toBe(1);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.results).not.toContainEqual({
      script: 'curiosity',
      assertion: 'exploratoryEnding',
      passed: true,
    });
  });

test('corpus rejects malformed or conflicting exploration expectations and legacy quality guards', () => {
  for (const change of [
    { ending: 'brief' },
    { ending: false },
    { ending: null },
    { ending: { kind: 'exploration' } },
    { stopOnBrief: true },
    { stopOnBrief: false },
    { transportFault: 'refusal' },
  ]) {
    expect(() =>
      parseSalesCorpus(JSON.stringify({ scripts: [{ ...exploration, ...change }] })),
    ).toThrow('ending');
  }
  expect(() =>
    parseSalesCorpus(
      JSON.stringify({
        scripts: [
          { name: 'legacy-ending', turns: ['A portal'], ending: 'exploration', assertions: [] },
        ],
      }),
    ),
  ).toThrow('scoping');
  expect(() =>
    parseSalesCorpus(
      JSON.stringify({
        scripts: [
          {
            name: 'legacy-quality',
            turns: ['A portal'],
            assertions: [{ kind: 'declarativeAcknowledgement' }],
          },
        ],
      }),
    ),
  ).toThrow('scoping');
});

for (const message of [
  'What would you most like the app to make possible next?',
  'What would you like to make possible next?',
  'Recurring bugs are the blocker; their cause needs inspection.',
])
  test(`selected-question quality checks acknowledgement: ${message}`, async () => {
    let calls = 0;
    const evaluation = await runSalesEvaluation({
      scripts: parseSalesCorpus(
        JSON.stringify({
          scripts: [
            {
              ...scenario,
              turns: [{ answers: { 'improve-outcome': 'payments' } }],
              assertions: [{ kind: 'declarativeAcknowledgement' }],
            },
          ],
        }),
      ),
      provider,
      stopOnFailure: true,
      providerFetch: () =>
        stream(
          calls++ === 0
            ? JSON.stringify({
                version: 1,
                message,
                nextQuestionId: 'improve-outcome',
                brief: null,
              })
            : handoff,
        ),
      show: false,
      write: () => undefined,
      pause: () => Promise.resolve(),
    });
    const valid = !message.includes('?');
    expect(calls).toBe(valid ? 2 : 1);
    expect(evaluation.passed).toBe(valid);
    expect(evaluation.results).toContainEqual({
      script: 'click-improve',
      assertion: 'declarativeAcknowledgement',
      passed: valid,
    });
    expect(evaluation.results).toContainEqual({
      script: 'click-improve',
      assertion: 'streamEqualsStored',
      passed: true,
    });
  });

test('acknowledgement quality does not reinterpret a refusal as the previous catalogue question', async () => {
  let calls = 0;
  const evaluation = await runSalesEvaluation({
    scripts: parseSalesCorpus(
      JSON.stringify({
        scripts: [
          { ...scenario, stopOnBrief: false, assertions: [{ kind: 'declarativeAcknowledgement' }] },
        ],
      }),
    ),
    provider,
    stopOnFailure: true,
    providerFetch: async () => {
      calls += 1;
      if (calls === 1) return stream(question);
      return new Response(
        (await stream('partial').text()).replace(
          '"finish_reason":"stop"',
          '"finish_reason":"content_filter"',
        ),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    },
    show: false,
    write: () => undefined,
    pause: () => Promise.resolve(),
  });
  expect(calls).toBe(2);
  expect(evaluation.passed).toBe(true);
  expect(evaluation.results).toContainEqual({
    script: 'click-improve',
    assertion: 'streamEqualsStored',
    passed: true,
  });
});
