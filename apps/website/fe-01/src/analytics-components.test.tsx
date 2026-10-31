import type { Analytics, AnalyticsState } from '@website/analytics';
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createMilestones, MilestonesContext } from './analytics-flow';
import { PrivacyChoices } from './privacy-choices';
import { RequestEditor } from './request-editor';

const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://dev.app.puni.dev' });
const originalFetch = globalThis.fetch;
beforeAll(() => {
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    sessionStorage: dom.window.sessionStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  dom.window.close();
});

for (const status of [201, 503])
  test(`mounted confirmation follows server outcome ${String(status)} and survives StrictMode replay`, async () => {
    const events: unknown[] = [];
    let ready = true;
    const analytics = {
      dispatch: (event: unknown) => {
        if (ready) events.push(event);
        return ready ? 'sent' : 'dropped';
      },
      dispatchLead: (_receipt: string, event: unknown) => {
        if (ready) events.push(event);
        return ready ? 'sent' : 'dropped';
      },
    } as Analytics;
    const milestones = createMilestones(analytics);
    const pending = Promise.withResolvers<Response>();
    let posts = 0;
    globalThis.fetch = Object.assign(
      () => {
        posts++;
        return pending.promise;
      },
      { preconnect: originalFetch.preconnect },
    );
    const container = dom.window.document.createElement('div');
    dom.window.document.body.replaceChildren(container);
    const root = createRoot(container);
    const render = () => {
      root.render(
        <StrictMode>
          <MilestonesContext.Provider value={milestones}>
            <RequestEditor
              draft={{
                description: 'DESCRIPTION_SENTINEL',
                brief: '',
                csrfToken: `claim-${String(status)}`,
                expiresAt: new Date(Date.now() + 60000).toISOString(),
                scoping: {
                  version: 1,
                  startConversation: true,
                  startingChoice: 'improve',
                  questionId: null,
                  revision: 0,
                  references: null,
                  candidateBrief: null,
                  emailInvitationDeclined: false,
                },
              }}
              open
              contact
              onOpen={() => undefined}
              onClose={() => undefined}
              onSubmitted={() => undefined}
            />
          </MilestonesContext.Provider>
        </StrictMode>,
      );
    };
    try {
      act(render);
      const form = container.querySelector('form');
      if (!form) throw new Error('Missing mounted form');
      act(() => {
        for (let count = 0; count < 2; count++)
          form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      });
      expect(posts).toBe(1);
      expect(
        events.filter((event) => (event as { name: string }).name === 'generate_lead'),
      ).toEqual([]);
      await act(async () => {
        pending.resolve(
          new Response(
            JSON.stringify(
              status === 201 ? { receipt: 'PRIVATE_RECEIPT' } : { code: 'unavailable' },
            ),
            { status },
          ),
        );
        await pending.promise;
      });
      act(render);
      expect(
        events.filter((event) => (event as { name: string }).name === 'generate_lead'),
      ).toHaveLength(status === 201 ? 1 : 0);
      expect(JSON.stringify(events)).not.toContain('PRIVATE_RECEIPT');
      expect(JSON.stringify(events)).not.toContain('DESCRIPTION_SENTINEL');
      ready = false;
      act(render);
    } finally {
      act(() => {
        root.unmount();
      });
    }
  });

test('mounted consent has equal choices, visible optional failure and no StrictMode disposal', () => {
  let state: AnalyticsState = { status: 'cookieless' };
  let listener: (next: AnalyticsState) => void = () => undefined;
  let disposals = 0;
  const analytics = {
    getState: () => state,
    subscribe: (next: typeof listener) => {
      listener = next;
      return () => undefined;
    },
    accept: () => {
      state = { status: 'loading' };
      listener(state);
    },
    reject: () => {
      state = { status: 'denied' };
      listener(state);
    },
    dispose: () => {
      disposals++;
    },
  } as Analytics;
  const container = dom.window.document.createElement('div');
  dom.window.document.body.replaceChildren(container);
  const root = createRoot(container);
  try {
    act(() => {
      root.render(
        <StrictMode>
          <MilestonesContext.Provider value={createMilestones(analytics)}>
            <PrivacyChoices />
          </MilestonesContext.Provider>
        </StrictMode>,
      );
    });
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Privacy choices',
      'Allow analytics cookies',
      'Disable measurement',
    ]);
    expect(container.textContent).toContain('Basic cookieless measurement starts on arrival');
    expect(container.textContent).toContain('Analytics cookies are off');
    expect(buttons[1]?.className).toBe(buttons[2]?.className);
    act(() => {
      buttons[1]?.click();
    });
    expect(container.textContent).toContain('Analytics is loading');
    act(() => {
      listener({ status: 'unavailable', reason: 'loader' });
    });
    expect(container.textContent).toContain('Optional analytics is unavailable');
    act(() => {
      buttons[0]?.click();
    });
    act(() => {
      listener({ status: 'ready' });
    });
    expect(container.textContent).toContain('Analytics cookies are allowed');
    act(() => {
      listener({ status: 'denied' });
    });
    expect(container.textContent).toContain('Measurement is disabled');
    act(() =>
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent === 'Disable measurement')
        ?.click(),
    );
    expect(state.status).toBe('denied');
  } finally {
    act(() => {
      root.unmount();
    });
  }
  expect(disposals).toBe(0);
});
