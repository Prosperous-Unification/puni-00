import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

import { createWebsiteApi } from '../../be-01/src/server.ts';

// A loopback website API whose paid provider is a scripted OpenRouter stream: every admission,
// reservation, cancel and settlement runs through the real API and store, and no network call or
// key is used. Replies stream one word every `PUNI_FAKE_WORD_MS` milliseconds (default 45); a
// visitor message containing "slowly" streams one word every 400 ms so a browser can press Stop;
// one containing "refuse" streams a partial reply and then an in-stream refusal error chunk, as
// OpenRouter sends a provider refusal mid-reply.
const port = Number(env['WEBSITE_API_PORT'] ?? '3120');
const appOrigin = env['APP_ORIGIN'] ?? 'http://localhost:4220';
const publicOrigin = env['PUBLIC_ORIGIN'] ?? 'http://localhost:4320';
const databasePath =
  env['WEBSITE_DATABASE_PATH'] ??
  join(mkdtempSync(join(tmpdir(), 'puni-conversation-fixture-')), 'website.sqlite');
const wordMilliseconds = Number(env['PUNI_FAKE_WORD_MS'] ?? '45');

const replies = {
  clarify:
    'Thanks, that helps. Who will use the booking tool first, and how do they book a repair slot today?',
  brief: [
    'Here is the brief as I understand it:',
    '[brief]',
    '- Users: workshop volunteers and members who bring bikes for repair.',
    '- Problem: paper slots get double-booked and nobody sees the week at a glance.',
    '- First release: a shared calendar of repair slots that members can book online.',
    '[/brief]',
    'Is this right?',
  ].join('\n'),
  contact:
    'A person at PUNI reads every brief and replies by email. Which email should they use? You can also press Request a proposal below.',
};

/** Reads the stage hint the API appended to the system message, and the latest visitor text. */
function readOutbound(body) {
  const messages = JSON.parse(body).messages;
  const text = (message) =>
    typeof message.content === 'string'
      ? message.content
      : message.content.map((part) => part.text).join('');
  const hint = text(messages[0]).split('\n').at(-1) ?? '';
  const stage = /^Stage: (clarify|brief|contact)\./.exec(hint)?.[1];
  if (!stage) throw new Error('Outbound system message lacks its stage hint');
  return { stage, visitor: text(messages.at(-1)) };
}

function chunk(id, delta, finish = null, usage = null) {
  return `data: ${JSON.stringify({
    id,
    model: 'openai/gpt-4.1-mini',
    choices: [{ index: 0, delta, finish_reason: finish }],
    ...(usage ? { usage } : {}),
  })}\n\n`;
}

/** The refusal error chunk OpenRouter streams inside an HTTP 200 response. */
function refusalChunk(id) {
  return `data: ${JSON.stringify({
    id,
    object: 'chat.completion.chunk',
    error: { code: 403, message: 'Upstream refused', metadata: { error_type: 'refusal' } },
    choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }],
    usage: { prompt_tokens: 900, completion_tokens: 4, total_tokens: 904 },
  })}\n\n`;
}

/** A scripted OpenRouter SSE response that honours the request's abort signal. */
function providerFetch(_input, init) {
  const { stage, visitor } = readOutbound(init.body);
  const isRefused = /refuse/i.test(visitor);
  const words = (isRefused ? 'I can’t help build' : replies[stage]).split(/(?<= )/);
  const delay = /slowly/i.test(visitor) ? 400 : wordMilliseconds;
  const id = `gen-fixture-${String(Date.now())}`;
  const encoder = new globalThis.TextEncoder();
  const signal = init.signal;
  return new globalThis.Response(
    new globalThis.ReadableStream({
      async start(controller) {
        let isClosed = false;
        const aborted = () => signal?.aborted === true;
        signal?.addEventListener('abort', () => {
          if (!isClosed)
            controller.error(
              new globalThis.DOMException('The operation was aborted.', 'AbortError'),
            );
        });
        for (const word of words) {
          if (aborted()) return;
          controller.enqueue(encoder.encode(chunk(id, { role: 'assistant', content: word })));
          await globalThis.Bun.sleep(delay);
        }
        if (aborted()) return;
        controller.enqueue(
          encoder.encode(
            isRefused
              ? refusalChunk(id)
              : chunk(id, {}, 'stop', {
                  prompt_tokens: 1200,
                  completion_tokens: 80,
                  total_tokens: 0,
                }),
          ),
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        isClosed = true;
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}

const api = createWebsiteApi({
  databasePath,
  apiBindHost: '127.0.0.1',
  publicOrigin,
  appOrigin,
  appManualUrl: `${appOrigin}/manual`,
  secureCookies: false,
  // Browser runs name a distinct visitor per context with X-Forwarded-For, so the per-source
  // conversation ceiling (three a day) does not stop a long regression run from one machine.
  trustedProxyHops: 1,
  openRouterEnabled: true,
  openRouterKey: 'fixture-only-no-network',
  openRouterModel: 'openai/gpt-4.1-mini',
  openRouterProvider: 'azure/swedencentral',
  openRouterInputUsdPerMillion: 0.44,
  openRouterOutputUsdPerMillion: 1.76,
  openRouterPrivacyVerified: true,
  operatorPassword: env['OPERATOR_PASSWORD'],
  providerFetch,
});

globalThis.Bun.serve({
  hostname: '127.0.0.1',
  port,
  idleTimeout: 60,
  fetch: (request, server) => api.fetch(request, server.requestIP(request)?.address),
});
globalThis.console.info(
  `Conversation fixture API on ${String(port)} (database ${databasePath}, scripted provider)`,
);
