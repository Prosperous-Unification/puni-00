import { replyReplacePart } from '@website/contracts';
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Conversation } from './build-contract';
import { LiveHarness } from './conversation-harness';

const reply = [
  'Here is the brief as I understand it:',
  '[brief]',
  '- Users: workshop volunteers',
  '[/brief]',
  'Is this right?',
].join('\n');

const briefed: Conversation = {
  stage: 'contact',
  turns: [
    { role: 'user', content: 'A booking tool' },
    { role: 'assistant', content: 'Who uses it?' },
    { role: 'user', content: 'Volunteers' },
    { role: 'assistant', content: 'What do they do today?' },
    { role: 'user', content: 'Paper' },
    { role: 'assistant', content: reply },
  ],
  visitorTurnsRemaining: 5,
  provider: 'openrouter',
  brief: '- Users: workshop volunteers',
  description: 'A booking tool',
  csrfToken: 'a'.repeat(64),
  initialOperation: { state: 'completed', idempotencyKey: 'initial:draft-1', truncated: false },
  latestOperation: {
    state: 'completed',
    idempotencyKey: 'turn-3',
    truncated: false,
    message: 'Paper',
  },
  exhaustedReason: null,
};

test('the rendered thread never shows brief markers', () => {
  const markup = renderToStaticMarkup(
    <LiveHarness initial={briefed} onReload={() => undefined} onHandedOff={() => undefined} />,
  );
  expect(markup).toContain('- Users: workshop volunteers');
  expect(markup).toContain('Is this right?');
  // Proof: rendering `turn.content` unfiltered put both markers in this markup.
  expect(markup).not.toContain('[brief]');
  expect(markup).not.toContain('[/brief]');
});

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:4201/',
});
const realFetch = globalThis.fetch;

beforeAll(() => {
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
});
afterAll(() => {
  globalThis.fetch = realFetch;
  dom.window.close();
});

const decline =
  "I can't help with that request. If there's a software problem you'd like PUNI to look at, describe it and I'll help shape it into a brief.";

/** Waits, inside act, until `isReady` holds or a bounded number of turns pass. */
async function settleUntil(isReady: () => boolean, describe: () => string): Promise<void> {
  for (let turn = 0; turn < 50 && !isReady(); turn += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  if (!isReady()) throw new Error(`The harness never reached the expected state: ${describe()}`);
}

test('a reply replacement shows only the decline, never the partial text glued to it', async () => {
  const unsent: Conversation = {
    ...briefed,
    stage: 'clarify',
    turns: [],
    brief: '',
    visitorTurnsRemaining: 8,
    initialOperation: { state: 'not-started', idempotencyKey: 'initial:draft-1', truncated: false },
    latestOperation: null,
  };
  const encoder = new TextEncoder();
  const sse = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>();
  const refreshed = Promise.withResolvers<Response>();
  globalThis.fetch = Object.assign(
    (input: Parameters<typeof fetch>[0]) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/conversation/stream'))
        return Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                sse.resolve(controller);
              },
            }),
            { headers: { 'content-type': 'text/event-stream' } },
          ),
        );
      // The post-finish reread is held, so the live reply is what the visitor sees.
      if (url.endsWith('/conversation')) return refreshed.promise;
      throw new Error(`Unexpected request ${url}`);
    },
    { preconnect: realFetch.preconnect },
  );
  const container = dom.window.document.createElement('div');
  dom.window.document.body.replaceChildren(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <LiveHarness initial={unsent} onReload={() => undefined} onHandedOff={() => undefined} />,
    );
    await Promise.resolve();
  });
  const form = container.querySelector('form');
  if (!form) throw new Error('composer form missing');
  await act(async () => {
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  const controller = await sse.promise;
  const send = (chunk: unknown) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
  };
  const reply = () => container.querySelector('.build-message.assistant p')?.textContent ?? '';
  send({ type: 'start' });
  send({ type: 'text-start', id: 't1' });
  send({ type: 'text-delta', id: 't1', delta: 'I can’t help build' });
  await settleUntil(() => reply() === 'I can’t help build', reply);
  send({ type: 'text-end', id: 't1' });
  send({ type: replyReplacePart, data: { text: decline } });
  send({ type: 'finish', finishReason: 'stop' });
  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
  controller.close();
  // Proof: dropping the replacement branch in conversation-harness.tsx left "I can’t help build"
  // here; appending the replacement as a delta showed the glued text.
  await settleUntil(() => reply() === decline, reply);
  expect(reply()).toBe(decline);
  expect(container.querySelectorAll('.build-message.assistant')).toHaveLength(1);
  refreshed.resolve(
    new Response(
      JSON.stringify({
        ...unsent,
        turns: [
          { role: 'user', content: unsent.description },
          { role: 'assistant', content: decline },
        ],
        visitorTurnsRemaining: 7,
        initialOperation: {
          state: 'completed',
          idempotencyKey: 'initial:draft-1',
          truncated: false,
        },
        latestOperation: {
          state: 'completed',
          idempotencyKey: 'initial:draft-1',
          truncated: false,
          message: unsent.description,
        },
      }),
      { headers: { 'content-type': 'application/json' } },
    ),
  );
  await settleUntil(
    () => container.querySelector('#build-message:not([readonly])') !== null,
    () => container.innerHTML,
  );
  expect(reply()).toBe(decline);
  act(() => {
    root.unmount();
  });
});
