import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { solveBrowserCheck } from '@website/contracts';
import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

// This integration test joins the actual API and mounted browser transport; production has no cross-app import.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createWebsiteApi } from '../../be-01/src/server';
import { parseConversation } from './build-contract';
import { LiveHarness } from './conversation-harness';

for (const situation of [
  'lost-reply',
  'stale-tab',
  'unknown',
  'different-operation',
  'unavailable',
] as const)
  test(`mounted harness reconciles actual completed replay after ${situation}`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'puni-replay-recovery-'));
    const databasePath = join(directory, 'website.sqlite');
    const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', {
      url: 'http://localhost:4201/',
    });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      navigator: dom.window.navigator,
      sessionStorage: dom.window.sessionStorage,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    Object.assign(dom.window.HTMLElement.prototype, { scrollIntoView: () => undefined });
    const network = globalThis.fetch;
    let providerCalls = 0;
    const api = createWebsiteApi({
      databasePath,
      apiBindHost: '127.0.0.1',
      publicOrigin: 'http://localhost:4321',
      appOrigin: 'http://localhost:4201',
      appManualUrl: 'http://localhost:4201/manual',
      secureCookies: false,
      openRouterEnabled: true,
      openRouterKey: 'synthetic-only',
      openRouterModel: 'openai/gpt-4.1-mini',
      openRouterProvider: 'azure/swedencentral',
      openRouterInputUsdPerMillion: 0.44,
      openRouterOutputUsdPerMillion: 1.76,
      openRouterInputCeilingUsdPerMillion: 0.44,
      openRouterOutputCeilingUsdPerMillion: 1.76,
      openRouterPrivacyVerified: true,
      providerFetch: () => {
        providerCalls += 1;
        const reply = JSON.stringify({
          version: 1,
          message: 'Let’s find the blocker.',
          nextQuestionId: 'improve-blocker',
          brief: null,
        });
        const chunks = [
          {
            id: 'synthetic-1',
            choices: [
              { index: 0, delta: { role: 'assistant', content: reply }, finish_reason: null },
            ],
          },
          {
            id: 'synthetic-1',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.0001 },
          },
        ];
        return new Response(
          chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
          { headers: { 'content-type': 'text/event-stream' } },
        );
      },
    });
    const container = dom.window.document.querySelector('#root');
    if (!container) throw new Error('Missing root');
    const root = createRoot(container);
    const settle = async (predicate: () => boolean) => {
      for (let tick = 0; tick < 100 && !predicate(); tick++)
        await act(async () => {
          await Bun.sleep(5);
        });
      expect(predicate()).toBe(true);
    };
    try {
      const intake = await api.fetch(
        new Request('http://localhost:3101/intakes', {
          method: 'POST',
          headers: { origin: 'http://localhost:4321', 'content-type': 'application/json' },
          body: JSON.stringify({ startingChoice: 'improve', startConversation: true }),
        }),
        '127.0.0.1',
      );
      expect(intake.status).toBe(201);
      const cookie = intake.headers.get('set-cookie')?.split(';')[0];
      if (!cookie) throw new Error('Missing cookie');
      const request = (path: string, init: RequestInit = {}) =>
        api.fetch(
          new Request('http://localhost:3101' + path, {
            ...init,
            headers: {
              ...Object.fromEntries(new Headers(init.headers)),
              origin: 'http://localhost:4201',
              cookie,
            },
          }),
          '127.0.0.1',
        );
      const initial = parseConversation(await (await request('/conversation')).json());
      if (!initial.initialOperation || !initial.challenge)
        throw new Error('Missing initial admission');
      if (situation !== 'lost-reply') {
        const challenge = initial.challenge;
        const completed = await request('/conversation/stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-puni-csrf': initial.csrfToken },
          body: JSON.stringify({
            initial: true,
            idempotencyKey: initial.initialOperation.idempotencyKey,
            check: {
              ...challenge,
              number: solveBrowserCheck(challenge.salt, challenge.challenge, challenge.maxnumber),
            },
          }),
        });
        expect(await completed.text()).toContain('"type":"finish"');
      }
      let streamPosts = 0;
      globalThis.fetch = Object.assign(
        async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
          const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
          const response = await request(path, init);
          if (
            path === '/conversation' &&
            ['unknown', 'different-operation', 'unavailable'].includes(situation)
          ) {
            if (situation === 'unavailable')
              return Response.json({ code: 'unavailable' }, { status: 503 });
            const conversation = (await response.json()) as {
              initialOperation: { state: string; idempotencyKey: string };
              latestOperation: { state: string; idempotencyKey: string };
            };
            for (const name of ['initialOperation', 'latestOperation'] as const) {
              if (situation === 'unknown') conversation[name].state = 'unknown';
              else conversation[name].idempotencyKey = 'different-operation';
            }
            return Response.json(conversation);
          }
          if (path === '/conversation/stream') {
            streamPosts++;
            if (situation === 'lost-reply' && streamPosts === 1) {
              expect(await response.text()).toContain('"type":"finish"');
              throw new TypeError('Completed response was lost');
            }
          }
          return response;
        },
        { preconnect: network.preconnect },
      );
      act(() => {
        root.render(
          <LiveHarness
            initial={initial}
            onReload={() => undefined}
            onHandedOff={() => undefined}
            solveCheck={(challenge) =>
              Promise.resolve(
                solveBrowserCheck(challenge.salt, challenge.challenge, challenge.maxnumber),
              )
            }
          />,
        );
      });
      if (situation === 'lost-reply') {
        await settle(() => container.querySelector('.harness-interrupted button') !== null);
        const retry = container.querySelector<HTMLButtonElement>('.harness-interrupted button');
        if (!retry) throw new Error('Missing Retry');
        act(() => {
          retry.click();
        });
      }
      if (situation === 'lost-reply' || situation === 'stale-tab') {
        await settle(() => container.querySelector('[aria-label="Suggested answers"]') !== null);
        expect(container.querySelector('.harness-interrupted')).toBeNull();
        expect(container.querySelectorAll('.build-message.assistant')).toHaveLength(1);
        expect(container.textContent).toContain('Let’s find the blocker.');
        expect(container.textContent).toContain('Recurring bugs');
      } else {
        await settle(() => container.querySelector('.harness-interrupted button') !== null);
        expect(container.querySelector('[aria-label="Suggested answers"]')).toBeNull();
        expect(container.textContent).toContain('The reply stopped before it was confirmed');
      }
      expect(providerCalls).toBe(1);
      expect(streamPosts).toBe(situation === 'lost-reply' ? 2 : 1);
      const database = new Database(databasePath, { readonly: true });
      try {
        expect(
          database
            .query('SELECT state, settlement, settled_micro_usd FROM conversation_operation')
            .all(),
        ).toEqual([{ state: 'completed', settlement: 'usage', settled_micro_usd: 100 }]);
      } finally {
        database.close();
      }
    } finally {
      act(() => {
        root.unmount();
      });
      globalThis.fetch = network;
      api.close();
      dom.window.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
