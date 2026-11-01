import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { BuildPage } from './build-page';
import { clearRequestEditor } from './request-editor';

test('successful Start over still navigates when sessionStorage removeItem raises SecurityError', async () => {
  const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', {
    url: 'http://localhost:4201/',
  });
  const network = globalThis.fetch;
  const storage = globalThis.sessionStorage;
  const navigations: string[] = [];
  let discards = 0;
  let removals = 0;
  Object.assign(dom.window, {
    matchMedia: () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  Object.assign(globalThis, {
    window: new Proxy(dom.window, {
      get(target, key): unknown {
        return key === 'location'
          ? { assign: (url: string) => navigations.push(url) }
          : Reflect.get(target, key);
      },
    }),
    document: dom.window.document,
    navigator: dom.window.navigator,
    sessionStorage: {
      removeItem: () => {
        removals++;
        throw new DOMException('Storage denied', 'SecurityError');
      },
    },
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  globalThis.fetch = Object.assign(
    async (input: Parameters<typeof fetch>[0]) => {
      await Promise.resolve();
      const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
      if (path === '/entry') return Response.json({ available: true, reason: null });
      if (path === '/conversation')
        return Response.json({
          scoping: { version: 'legacy' },
          stage: 'clarify',
          turns: [],
          visitorTurnsRemaining: 8,
          visitorTurnLimit: 8,
          provider: 'disabled',
          brief: '',
          description: 'Booking app',
          csrfToken: 'a'.repeat(64),
          initialOperation: null,
          latestOperation: null,
          exhaustedReason: null,
          challenge: null,
        });
      if (path === '/draft/discard') {
        discards++;
        return new Response(null, { status: 204 });
      }
      throw new Error('Unexpected ' + path);
    },
    { preconnect: network.preconnect },
  );
  const container = dom.window.document.querySelector('#root');
  if (!container) throw new Error('Missing root');
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<BuildPage />);
      await Bun.sleep(10);
    });
    const click = (label: string) => {
      const button = [...container.querySelectorAll('button')].find((button) =>
        button.textContent.includes(label),
      );
      if (!button) throw new Error('Missing ' + label);
      act(() => {
        button.click();
      });
    };
    click('Start over');
    await act(async () => {
      click('Discard');
      await Bun.sleep(10);
    });
    expect(discards).toBe(1);
    expect(removals).toBe(1);
    expect(navigations).toHaveLength(1);
    expect(navigations[0]).toEndWith('/#request');
    expect(container.querySelector('.start-over-failure')).toBeNull();
  } finally {
    act(() => {
      root.unmount();
    });
    globalThis.fetch = network;
    Object.assign(globalThis, { sessionStorage: storage });
    dom.window.close();
  }
});

test('editor cleanup does not swallow programmer errors', () => {
  const storage = globalThis.sessionStorage;
  Object.assign(globalThis, {
    sessionStorage: {
      removeItem: () => {
        throw new TypeError('Broken storage adapter');
      },
    },
  });
  try {
    expect(() => clearRequestEditor('claim')).toThrow('Broken storage adapter');
  } finally {
    Object.assign(globalThis, { sessionStorage: storage });
  }
});
