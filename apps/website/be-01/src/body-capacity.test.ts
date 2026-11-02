import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { createWebsiteApi } from './server';

const publicOrigin = 'http://localhost:4321';
const appOrigin = 'http://localhost:4201';

for (const boundary of ['api', 'main'] as const)
  test(
    boundary +
      ' accepts maximum encoded manual requests and editor saves and refuses over-bound bodies',
    async () => {
      const directory = mkdtempSync(join(tmpdir(), 'puni-body-capacity-'));
      const databasePath = join(directory, 'website.sqlite');
      const api =
        boundary === 'api'
          ? createWebsiteApi({
              databasePath,
              apiBindHost: '127.0.0.1',
              publicOrigin,
              appOrigin,
              appManualUrl: appOrigin + '/manual',
              secureCookies: false,
            })
          : null;
      const available = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
      const port = available.port;
      await available.stop(true);
      const base = 'http://127.0.0.1:' + String(port);
      const child =
        boundary === 'main'
          ? Bun.spawn([process.execPath, join(import.meta.dir, 'main.ts')], {
              env: {
                PATH: process.env['PATH'] ?? '',
                WEBSITE_API_HOST: '127.0.0.1',
                WEBSITE_API_PORT: String(port),
                WEBSITE_DATABASE_PATH: databasePath,
                RETENTION_JOURNAL: 'disabled',
                PUBLIC_ORIGIN: publicOrigin,
                APP_ORIGIN: appOrigin,
              },
              stdout: 'pipe',
              stderr: 'pipe',
            })
          : null;
      const errors = child ? new Response(child.stderr).text() : Promise.resolve('');
      const send = (
        path: string,
        method: string,
        origin: string,
        body?: unknown,
        cookie?: string,
        csrf?: string,
      ) => {
        const request = new Request(base + path, {
          method,
          headers: {
            origin,
            'content-type': 'application/json',
            ...(cookie ? { cookie } : {}),
            ...(csrf ? { 'x-puni-csrf': csrf } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return api ? api.fetch(request, '127.0.0.1') : fetch(request);
      };
      try {
        if (child) {
          const reader = child.stdout.getReader();
          const started = await reader.read();
          reader.releaseLock();
          if (started.done) throw new Error(await errors);
          expect(new TextDecoder().decode(started.value)).toContain('Website API listening');
        }
        for (const protocol of ['legacy', 'scoping']) {
          for (const character of ['界', '\u0000']) {
            const intake = await send(
              '/intakes',
              'POST',
              publicOrigin,
              protocol === 'legacy'
                ? { description: 'A booking app' }
                : { startingChoice: 'improve', startConversation: false },
            );
            expect(intake.status).toBe(201);
            const cookie = intake.headers.get('set-cookie')?.split(';')[0];
            if (!cookie) throw new Error('Missing claim');
            const draft = (await (
              await send('/draft', 'GET', appOrigin, undefined, cookie)
            ).json()) as { csrfToken: string };
            const brief = character.repeat(8000);
            if (protocol === 'legacy') {
              expect(
                (await send('/brief', 'PATCH', appOrigin, { brief }, cookie, draft.csrfToken))
                  .status,
              ).toBe(200);
            } else {
              expect(
                (
                  await send(
                    '/scoping',
                    'PATCH',
                    appOrigin,
                    { revision: 0, kind: 'brief', brief },
                    cookie,
                    draft.csrfToken,
                  )
                ).status,
              ).toBe(200);
              expect(
                (
                  await send(
                    '/scoping',
                    'PATCH',
                    appOrigin,
                    { revision: 1, kind: 'references', references: character.repeat(4000) },
                    cookie,
                    draft.csrfToken,
                  )
                ).status,
              ).toBe(200);
            }
            const payload = {
              version: 1,
              brief,
              email:
                'a'.repeat(239) +
                String(protocol.length) +
                String(character.charCodeAt(0) % 10) +
                '@example.test',
              idempotencyKey: 'k'.repeat(128),
            };
            const submitted = await send(
              '/proposals',
              'POST',
              appOrigin,
              payload,
              cookie,
              draft.csrfToken,
            );
            expect(submitted.status).toBe(201);
            const receipt: unknown = await submitted.json();
            expect(
              await (
                await send('/proposals', 'POST', appOrigin, payload, cookie, draft.csrfToken)
              ).json(),
            ).toEqual(receipt);
          }
        }
        const oversized = await send('/intakes', 'POST', publicOrigin, {
          description: 'x'.repeat(65536),
        });
        expect(oversized.status).toBe(boundary === 'main' ? 413 : 400);
      } finally {
        api?.close();
        if (child) {
          child.kill();
          await child.exited;
          await errors;
        }
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
