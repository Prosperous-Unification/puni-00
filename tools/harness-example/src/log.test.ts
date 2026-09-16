import { describe, expect, it } from 'bun:test';

import { type HarnessEvent, LineCoalescer } from './log';

const base = { node: 'implement', task: 'task-a', sessionId: 'abcdef0123' };
const says = (text: string): HarnessEvent => ({
  ...base,
  update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } },
});

describe('LineCoalescer', () => {
  it('merges consecutive text chunks and emits them before the next non-text update', () => {
    const log = new LineCoalescer();
    expect(log.push(says('wro'), 10)).toEqual([]);
    expect(log.push(says('te it'), 20)).toEqual([]);
    const lines = log.push(
      {
        ...base,
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 't1',
          title: 'Write hello.sh',
          kind: 'edit',
        },
      },
      30,
    );
    expect(lines).toEqual([
      '    10ms  implement/task-a       abcdef01  says  wrote it',
      '    30ms  implement/task-a       abcdef01  tool  edit pending: Write hello.sh',
    ]);
    expect(log.flushAll()).toEqual([]);
  });

  it('keeps text of different nodes apart', () => {
    const log = new LineCoalescer();
    log.push(says('a'), 1);
    log.push({ ...says('b'), task: 'task-b' }, 2);
    const lines = log.flushAll();
    expect(lines.map((l) => l.endsWith('says  a') || l.endsWith('says  b'))).toEqual([true, true]);
    expect(lines.map((l) => l.includes('/task-a') || l.includes('/task-b'))).toEqual([true, true]);
  });
});
