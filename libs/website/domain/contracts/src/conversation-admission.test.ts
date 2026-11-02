import { expect, test } from 'bun:test';

import { conversationAdmissionPart, readConversationAdmission } from './conversation-admission';

test('admission parser ignores other parts and refuses malformed recognized markers', () => {
  expect(readConversationAdmission({ type: 'text-delta', delta: 'private' })).toBeNull();
  for (const marker of [
    { kind: 'initial' },
    { kind: 'continuation' },
    { kind: 'answer', question_id: 'improve-blocker', answer_mode: 'unsure' },
  ] as const)
    expect(readConversationAdmission({ type: conversationAdmissionPart, data: marker })).toEqual(
      marker,
    );
  for (const marker of [
    null,
    {},
    { kind: 'initial', text: 'private' },
    { kind: 'answer', question_id: 'private', answer_mode: 'text' },
    { kind: 'answer', question_id: 'improve-blocker', answer_mode: 'private' },
  ])
    expect(() =>
      readConversationAdmission({ type: conversationAdmissionPart, data: marker }),
    ).toThrow('Invalid conversation admission');
});
