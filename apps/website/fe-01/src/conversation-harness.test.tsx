import { expect, test } from 'bun:test';
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
