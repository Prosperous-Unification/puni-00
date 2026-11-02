import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { solveBrowserCheck } from '@website/contracts';
import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { readConfirmedReply, streamMatchesStored } from './eval-cli';

for (const protocol of ['legacy', 'scoping']) {
  test(`browser provider fixture completes, persists and replays ${protocol} replies through the SDK`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'puni-browser-fixture-proof-'));
    const databasePath = join(directory, 'website.sqlite');
    const capturePath = join(directory, 'outbound.jsonl');
    const available = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
    const port = available.port;
    await available.stop(true);
    const fixture = Bun.spawn(
      [process.execPath, join(import.meta.dir, '../../../fe-01/browser/conversation-api.mjs')],
      {
        env: {
          PATH: process.env['PATH'] ?? '',
          WEBSITE_API_PORT: String(port),
          WEBSITE_DATABASE_PATH: databasePath,
          PUNI_FIXTURE_OUTBOUND_PATH: capturePath,
          PUNI_FAKE_WORD_MS: '0',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    try {
      const started = await fixture.stdout.getReader().read();
      if (started.done) throw new Error(await new Response(fixture.stderr).text());
      const base = `http://127.0.0.1:${String(port)}`;
      const intake = await fetch(`${base}/intakes`, {
        method: 'POST',
        headers: {
          origin: 'http://localhost:4320',
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.30',
        },
        body: JSON.stringify(
          protocol === 'scoping'
            ? { startConversation: true, startingChoice: 'improve' }
            : { description: 'A booking tool for a community bicycle workshop.' },
        ),
      });
      expect(intake.status).toBe(201);
      const cookie = intake.headers.get('set-cookie')?.split(';')[0];
      if (!cookie) throw new Error('Fixture issued no draft cookie');
      const headers = {
        origin: 'http://localhost:4220',
        cookie,
        'x-forwarded-for': '198.51.100.30',
      };
      const view = (await (await fetch(`${base}/conversation`, { headers })).json()) as {
        csrfToken: string;
        initialOperation: { idempotencyKey: string };
        challenge: { salt: string; challenge: string; signature: string; maxnumber: number };
      };
      const check = {
        ...view.challenge,
        number: solveBrowserCheck(
          view.challenge.salt,
          view.challenge.challenge,
          view.challenge.maxnumber,
        ),
      };
      const send = () =>
        fetch(`${base}/conversation/stream`, {
          method: 'POST',
          headers: {
            ...headers,
            'content-type': 'application/json',
            'x-puni-csrf': view.csrfToken,
          },
          body: JSON.stringify({
            initial: true,
            idempotencyKey: view.initialOperation.idempotencyKey,
            check,
          }),
        });
      const response = await send();
      expect(response.status).toBe(200);
      const wire = await response.text();
      const database = new Database(databasePath, { readonly: true });
      try {
        expect(
          database
            .query('SELECT state, settlement, settled_micro_usd FROM conversation_operation')
            .all(),
        ).toEqual([{ state: 'completed', settlement: 'usage', settled_micro_usd: 700 }]);
      } finally {
        database.close();
      }
      const reply = readConfirmedReply(wire);
      expect(reply).not.toBeNull();
      if (reply === null) throw new Error('Fixture did not confirm its assistant reply');
      const stored: unknown = await (await fetch(`${base}/conversation`, { headers })).json();
      expect(streamMatchesStored([reply], stored)).toBe(true);
      const replay = await send();
      expect(replay.status).toBe(200);
      const replayed = await replay.text();
      const frames = replayed
        .split('\n')
        .filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
        .map((line) => JSON.parse(line.slice(6)) as { type: string; delta?: string });
      expect(frames.some((frame) => frame.type === 'error')).toBe(false);
      expect(frames.some((frame) => frame.type === 'text-end')).toBe(true);
      expect(
        frames
          .filter((frame) => frame.type === 'text-delta')
          .map((frame) => frame.delta)
          .join(''),
      ).toBe(reply);
      expect(readFileSync(capturePath, 'utf8').trim().split('\n')).toHaveLength(1);
    } finally {
      fixture.kill();
      await fixture.exited;
      rmSync(directory, { recursive: true, force: true });
    }
  }, 15000);
}
