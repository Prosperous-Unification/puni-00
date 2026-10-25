import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { composeRequest, RequestEditor } from './request-editor';

test('final request includes two purpose-labelled references exactly once and refuses overflow', () => {
  expect(
    composeRequest('Keep my words', 'One — borrow search\nhttps://two.test — avoid checkout'),
  ).toEqual({
    kind: 'ready',
    text: 'Keep my words\n\nReferences\nOne — borrow search\nhttps://two.test — avoid checkout',
  });
  expect(composeRequest('x'.repeat(7990), 'Reference')).toEqual({ kind: 'overflow' });
  expect(composeRequest('Body', '')).toEqual({ kind: 'ready', text: 'Body' });
});

test('fresh server-only editor shows separate canonical body and references in exact final preview', () => {
  const markup = renderToStaticMarkup(
    <RequestEditor
      draft={{
        description: 'Opening',
        brief: 'Human body',
        csrfToken: 'new-claim',
        scoping: {
          version: 1,
          startConversation: true,
          startingChoice: 'improve',
          questionId: null,
          revision: 3,
          references: 'Demo — borrow navigation',
          candidateBrief: 'Later suggestion',
          emailInvitationDeclined: false,
        },
      }}
      contact
      open
      onOpen={() => undefined}
      onClose={() => undefined}
      onSubmitted={() => undefined}
    />,
  );
  expect(markup).toContain('Human body');
  expect(markup).toContain('Demo — borrow navigation');
  expect(markup).toContain('Final request');
  expect(markup).toContain('Later suggestion');
  expect(markup).toContain('Send my request');
});

test('expired or malformed browser recovery cannot replace the current claim brief', () => {
  const previousStorage = globalThis.sessionStorage;
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  Object.assign(globalThis, { sessionStorage: storage });
  const draft = { description: 'Current claim', brief: '', csrfToken: 'cache-claim' };
  const render = () =>
    renderToStaticMarkup(
      <RequestEditor
        draft={draft}
        contact
        open
        onOpen={() => undefined}
        onClose={() => undefined}
        onSubmitted={() => undefined}
      />,
    );
  try {
    values.set(
      'puni_editor:cache-claim',
      JSON.stringify({
        expiresAt: Date.now() - 1,
        fields: {
          brief: 'EXPIRED SECRET',
          references: '',
          email: '',
          savedBrief: '',
          savedReferences: '',
        },
      }),
    );
    expect(render()).not.toContain('EXPIRED SECRET');
    expect(values.has('puni_editor:cache-claim')).toBe(false);
    values.set(
      'puni_editor:cache-claim',
      JSON.stringify({
        expiresAt: Date.now() + 1000,
        fields: { brief: 42, references: '', email: '', savedBrief: '', savedReferences: '' },
      }),
    );
    expect(render()).toContain('Browser recovery is unavailable');
    storage.getItem = () => {
      throw new Error('Storage denied');
    };
    expect(render()).toContain('Current claim');
    expect(render()).toContain('Browser recovery is unavailable');
  } finally {
    Object.assign(globalThis, { sessionStorage: previousStorage });
  }
});

test('missing versioned expiry visibly disables browser recovery without blocking review', () => {
  const markup = renderToStaticMarkup(
    <RequestEditor
      draft={{
        description: 'Ready request',
        brief: '',
        csrfToken: 'missing-expiry',
        scoping: {
          version: 1,
          startConversation: false,
          startingChoice: null,
          questionId: null,
          revision: 0,
          references: null,
          candidateBrief: null,
          emailInvitationDeclined: false,
        },
      }}
      contact
      open
      onOpen={() => undefined}
      onClose={() => undefined}
      onSubmitted={() => undefined}
    />,
  );
  expect(markup).toContain('draft expiry was not provided');
  expect(markup).toContain('Ready request');
  expect(markup).toContain('Send my request');
});
