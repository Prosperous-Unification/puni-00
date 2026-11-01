import { expect, test } from 'bun:test';

import { parseProviderScopingReply } from './scoping-reply';

const reply = {
  version: 1,
  message: 'A useful next step.',
  nextQuestionId: null,
  brief: null,
} as const;
test('provider parser accepts the strict envelope and rejects incomplete or unsafe output', () => {
  expect(parseProviderScopingReply(JSON.stringify(reply), false)).toEqual({
    kind: 'valid',
    value: reply,
  });
  for (const text of [
    '{',
    'null',
    JSON.stringify({ ...reply, extra: 'injected' }),
    JSON.stringify({ ...reply, message: ' ' }),
    JSON.stringify({ ...reply, message: 'x'.repeat(1201) }),
    JSON.stringify({ ...reply, nextQuestionId: 'unknown' }),
    JSON.stringify({ ...reply, nextQuestionId: 'launch-purpose', brief: 'contradiction' }),
    JSON.stringify({ ...reply, brief: 'x'.repeat(4001) }),
    ' '.repeat(32001) + JSON.stringify(reply),
  ])
    expect(parseProviderScopingReply(text, false).kind).toBe('invalid');
  expect(parseProviderScopingReply(JSON.stringify(reply), true).kind).toBe('invalid');
});
