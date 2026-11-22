import type { ProposalStatus, SubmissionView } from '@website/contracts';
import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { SubmissionInbox } from './submission-inbox';

function submission(status: ProposalStatus): SubmissionView {
  return {
    id: status,
    status,
    email: `${status}@example.test`,
    description: 'Request description',
    brief: 'Request brief',
    createdAt: '2026-11-22T16:00:00Z',
    updatedAt: '2026-11-22T16:00:00Z',
    followUps: [],
  };
}

test('the status filter stays selected after marking a closed request irrelevant', () => {
  const page = new JSDOM('<div id="root"></div>', { url: 'https://request.puni.dev/operator' });
  const actEnvironment: unknown = Reflect.get(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  const before = {
    window: globalThis.window,
    document: globalThis.document,
    IS_REACT_ACT_ENVIRONMENT: actEnvironment,
  };
  Object.assign(globalThis, {
    window: page.window,
    document: page.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = page.window.document.getElementById('root');
  if (!container) throw new Error('Missing browser fixture root');
  const root = createRoot(container);
  const submitted = submission('submitted');
  const closed = submission('closed');
  const commands: { id: string; status: ProposalStatus }[] = [];
  const render = (proposals: SubmissionView[]) => {
    act(() => {
      root.render(
        <SubmissionInbox
          submissions={proposals}
          refresh={() => undefined}
          advance={(id, status) => commands.push({ id, status })}
        />,
      );
    });
  };
  try {
    render([submitted, closed]);
    expect(container.querySelectorAll('article')).toHaveLength(2);
    const filter = container.querySelector('select');
    if (!filter) throw new Error('Missing status selection');
    expect([...filter.options].map((option) => option.value)).toEqual([
      'all',
      'submitted',
      'reviewing',
      'contacted',
      'closed',
      'irrelevant',
    ]);
    const select = (value: string) => {
      act(() => {
        filter.value = value;
        filter.dispatchEvent(new page.window.Event('change', { bubbles: true }));
      });
    };
    select('closed');
    expect(container.querySelectorAll('article')).toHaveLength(1);
    expect(container.textContent).toContain(closed.email);
    expect(container.textContent).not.toContain(submitted.email);
    const irrelevant = [...container.querySelectorAll<HTMLButtonElement>('article button')].find(
      (button) => button.textContent === 'Irrelevant',
    );
    if (!irrelevant || irrelevant.disabled) throw new Error('Closed request cannot be marked');
    act(() => {
      irrelevant.click();
    });
    expect(commands).toEqual([{ id: closed.id, status: 'irrelevant' }]);
    render([submitted, { ...closed, status: 'irrelevant' }]);
    expect(filter.value).toBe('closed');
    expect(container.querySelectorAll('article')).toHaveLength(0);
    expect(container.textContent).toContain('No requests match this status.');
    select('irrelevant');
    expect(container.querySelectorAll('article')).toHaveLength(1);
    expect(container.textContent).toContain(closed.email);
    expect(container.querySelectorAll('article button')).toHaveLength(0);
  } finally {
    act(() => {
      root.unmount();
    });
    Object.assign(globalThis, before);
    page.window.close();
  }
});
