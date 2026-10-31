import { type Analytics, type AnalyticsState, createBrowserAnalytics } from '@website/analytics';
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createMilestones, MilestonesContext } from './analytics-flow';
import { ArrivalChoice, PrivacyChoices } from './privacy-choices';
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
    sync: () => undefined,
    navigate: () => undefined,
    dispatch: () => 'dropped',
    dispatchLead: () => 'dropped',
    getState: () => state,
    getChoice: () => 'accepted',
    subscribeChoice: () => () => undefined,
    subscribe: (next: typeof listener) => {
      listener = (updated) => {
        state = updated;
        next(updated);
      };
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
    expect(buttons.map((button) => button.textContent)).toEqual(['Privacy choices']);
    act(() => {
      buttons[0]?.click();
    });
    buttons.push(...[...container.querySelectorAll('button')].slice(1));
    expect(container.textContent).toContain('We use basic cookieless measurement');
    expect(container.textContent).toContain('Analytics cookies are off');
    expect(buttons[1]?.className).toBe(buttons[2]?.className);
    act(() => {
      buttons[1]?.click();
    });
    expect(container.textContent).toContain('Analytics is loading');
    act(() => {
      listener({ status: 'unavailable', reason: 'loader' });
    });
    expect(container.textContent).toContain('Analytics is unavailable');
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

for (const action of ['Allow analytics cookies', 'Disable measurement'])
  test(`arrival choice uses canonical storage without moving focus: ${action}`, () => {
    const isolated = new JSDOM(
      '<body><button id="request">Request</button><div id="choices"></div></body>',
      { url: 'https://dev.app.puni.dev/' },
    );
    const analytics = createBrowserAnalytics(isolated.window, {
      enabled: true,
      environment: 'development',
      measurementId: 'G-R0JM3R4SSV',
    });
    const container = isolated.window.document.getElementById('choices');
    const request = isolated.window.document.getElementById('request');
    if (!container || !request) throw new Error('Missing fixture');
    const root = createRoot(container);
    request.focus();
    try {
      act(() => {
        root.render(
          <MilestonesContext.Provider value={createMilestones(analytics)}>
            <ArrivalChoice />
            <PrivacyChoices />
          </MilestonesContext.Provider>,
        );
      });
      expect(container.querySelector('[aria-label="Analytics choice"]')).not.toBeNull();
      expect(isolated.window.document.activeElement).toBe(request);
      expect(container.querySelector('[role="dialog"]')).toBeNull();
      const buttons = [...container.querySelectorAll('button')];
      expect(buttons.map((button) => button.textContent)).toEqual([
        'Allow analytics cookies',
        'Disable measurement',
        'Privacy choices',
      ]);
      expect(buttons[0]?.className).toBe(buttons[1]?.className);
      act(() => buttons.find((button) => button.textContent === action)?.click());
      expect(container.querySelector('[aria-label="Analytics choice"]')).toBeNull();
      expect(analytics.getChoice()).toBe(
        action === 'Allow analytics cookies' ? 'accepted' : 'rejected',
      );
      act(() => {
        isolated.window.document.cookie =
          'puni_dev_consent_v1=; Domain=puni.dev; Path=/; Max-Age=0; Secure';
        analytics.navigate();
      });
      expect(container.querySelector('[data-arrival-choice]')).not.toBeNull();
    } finally {
      act(() => {
        root.unmount();
      });
      analytics.dispose();
      isolated.window.close();
    }
  });

for (const [preference, visible] of [
  [null, true],
  ['malformed', true],
  [JSON.stringify({ version: 1, accepted: true, expires: 1 }), true],
  [JSON.stringify({ version: 1, accepted: true, expires: Date.UTC(2030, 0) }), false],
  [JSON.stringify({ version: 1, accepted: false, expires: Date.UTC(2030, 0) }), false],
] as const)
  test(`arrival choice visibility follows validated preference: ${String(preference)}`, async () => {
    const isolated = new JSDOM('<body><div></div></body>', { url: 'https://dev.app.puni.dev/' });
    if (preference !== null)
      isolated.window.document.cookie = `puni_dev_consent_v1=${encodeURIComponent(preference)}; Domain=puni.dev; Path=/; Secure`;
    const analytics = createBrowserAnalytics(isolated.window, {
      enabled: true,
      environment: 'development',
      measurementId: 'G-R0JM3R4SSV',
    });
    const container = isolated.window.document.body;
    const root = createRoot(container);
    try {
      act(() => {
        root.render(
          <MilestonesContext.Provider value={createMilestones(analytics)}>
            <ArrivalChoice />
            <PrivacyChoices />
          </MilestonesContext.Provider>,
        );
      });
      expect(container.querySelector('[data-arrival-choice]') !== null).toBe(visible);
      await act(async () => {
        isolated.window.document
          .querySelector('script')
          ?.dispatchEvent(new isolated.window.Event('error'));
        await Promise.resolve();
      });
      expect(container.querySelector('[data-arrival-choice]') !== null).toBe(visible);
      act(() => {
        [...container.querySelectorAll('button')]
          .find((button) => button.textContent === 'Privacy choices')
          ?.click();
      });
      expect(
        [...container.querySelectorAll('button')].filter(
          (button) => button.textContent === 'Allow analytics cookies',
        ),
      ).toHaveLength(visible ? 2 : 1);
    } finally {
      act(() => {
        root.unmount();
      });
      analytics.dispose();
      isolated.window.close();
    }
  });

for (const action of ['Allow analytics cookies', 'Disable measurement'])
  test(`arrival choice remains actionable through unreadable and refused persistence: ${action}`, () => {
    const isolated = new JSDOM('<body></body>', { url: 'https://dev.app.puni.dev/' });
    Object.defineProperty(isolated.window.document, 'cookie', {
      configurable: true,
      get: () => {
        throw new isolated.window.DOMException('blocked', 'SecurityError');
      },
      set: () => undefined,
    });
    const analytics = createBrowserAnalytics(isolated.window, {
      enabled: true,
      environment: 'development',
      measurementId: 'G-R0JM3R4SSV',
    });
    const container = isolated.window.document.body;
    const root = createRoot(container);
    try {
      act(() => {
        root.render(
          <MilestonesContext.Provider value={createMilestones(analytics)}>
            <ArrivalChoice />
            <PrivacyChoices />
          </MilestonesContext.Provider>,
        );
      });
      expect(analytics.getChoice()).toBe('unavailable');
      expect(container.textContent).toContain('We couldn’t read or save your choice');
      const footer = container.querySelector('[aria-label="Analytics privacy"]');
      if (!footer) throw new Error('Missing footer');
      act(() => {
        footer.querySelector('button')?.click();
      });
      expect(footer.textContent).toContain('We couldn’t read or save your choice');
      expect(
        [...footer.querySelectorAll('button')].filter((button) => button.textContent === action),
      ).toHaveLength(1);

      act(() =>
        [...footer.querySelectorAll('button')]
          .find((button) => button.textContent === action)
          ?.click(),
      );
      expect(container.querySelector('[data-arrival-choice]')).not.toBeNull();
      expect(footer.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
      Object.defineProperty(isolated.window.document, 'cookie', {
        configurable: true,
        get: () => '',
        set: () => undefined,
      });
      act(() =>
        [...container.querySelectorAll('button')]
          .find((button) => button.textContent === action)
          ?.click(),
      );
      expect(analytics.getChoice()).toBe('unavailable');
      expect(container.querySelector('[data-arrival-choice]')).not.toBeNull();
      Reflect.deleteProperty(isolated.window.document, 'cookie');
      act(() =>
        [...container.querySelectorAll('button')]
          .find((button) => button.textContent === action)
          ?.click(),
      );
      expect(container.querySelector('[data-arrival-choice]')).toBeNull();
    } finally {
      act(() => {
        root.unmount();
      });
      analytics.dispose();
      isolated.window.close();
    }
  });

for (const [enabled, url] of [
  [false, 'https://dev.app.puni.dev/'],
  [true, 'https://dev.app.puni.dev/operator/'],
  [true, 'https://dev.app.puni.dev/unknown/'],
] as const)
  test(`arrival choice absent when disabled or unsupported: ${String(enabled)} ${url}`, () => {
    const isolated = new JSDOM('<body></body>', { url });
    const analytics = createBrowserAnalytics(isolated.window, {
      enabled,
      environment: 'development',
      measurementId: 'G-R0JM3R4SSV',
    });
    const root = createRoot(isolated.window.document.body);
    try {
      act(() => {
        root.render(
          <MilestonesContext.Provider value={createMilestones(analytics)}>
            <ArrivalChoice />
          </MilestonesContext.Provider>,
        );
      });
      expect(isolated.window.document.querySelector('[data-arrival-choice]')).toBeNull();
    } finally {
      act(() => {
        root.unmount();
      });
      analytics.dispose();
      isolated.window.close();
    }
  });

test('focus sync observes another host choice while vendor stays loading', () => {
  const isolated = new JSDOM('<body></body>', { url: 'https://dev.app.puni.dev/' });
  const analytics = createBrowserAnalytics(isolated.window, {
    enabled: true,
    environment: 'development',
    measurementId: 'G-R0JM3R4SSV',
  });
  const root = createRoot(isolated.window.document.body);
  try {
    act(() => {
      root.render(
        <MilestonesContext.Provider value={createMilestones(analytics)}>
          <ArrivalChoice />
        </MilestonesContext.Provider>,
      );
    });
    act(() => {
      isolated.window.document.cookie = `puni_dev_consent_v1=${encodeURIComponent(JSON.stringify({ version: 1, accepted: true, expires: Date.UTC(2030, 0) }))}; Domain=puni.dev; Path=/; Secure`;
      isolated.window.dispatchEvent(new isolated.window.Event('focus'));
    });
    expect(analytics.getState().status).toBe('loading');
    expect(isolated.window.document.querySelector('[data-arrival-choice]')).toBeNull();
    act(() => {
      isolated.window.document.cookie =
        'puni_dev_consent_v1=malformed; Domain=puni.dev; Path=/; Secure';
      isolated.window.dispatchEvent(new isolated.window.Event('pageshow'));
    });
    expect(isolated.window.document.querySelector('[data-arrival-choice]')).not.toBeNull();
  } finally {
    act(() => {
      root.unmount();
    });
    analytics.dispose();
    isolated.window.close();
  }
});

for (const action of ['Allow analytics cookies', 'Disable measurement'])
  test(`fresh footer can persist a choice directly: ${action}`, () => {
    const isolated = new JSDOM('<body></body>', { url: 'https://dev.app.puni.dev/' });
    const analytics = createBrowserAnalytics(isolated.window, {
      enabled: true,
      environment: 'development',
      measurementId: 'G-R0JM3R4SSV',
    });
    const root = createRoot(isolated.window.document.body);
    try {
      act(() => {
        root.render(
          <MilestonesContext.Provider value={createMilestones(analytics)}>
            <ArrivalChoice />
            <PrivacyChoices />
          </MilestonesContext.Provider>,
        );
      });
      const footer = isolated.window.document.querySelector('[aria-label="Analytics privacy"]');
      if (!footer) throw new Error('Missing footer');
      act(() => {
        footer.querySelector('button')?.click();
      });
      const button = [...footer.querySelectorAll('button')].find(
        (button) => button.textContent === action,
      );
      expect(button).toBeDefined();
      act(() => {
        button?.click();
      });
      expect(analytics.getChoice()).toBe(
        action === 'Allow analytics cookies' ? 'accepted' : 'rejected',
      );
      expect(isolated.window.document.querySelector('[data-arrival-choice]')).toBeNull();
    } finally {
      act(() => {
        root.unmount();
      });
      analytics.dispose();
      isolated.window.close();
    }
  });
