import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  attachJournal,
  fenceSubject,
  initJournal,
  MemoryJournalRemote,
  RetentionJournalError,
  WebsiteStore,
} from '@website/store-sqlite';
import { Database } from 'bun:sqlite';
import { afterAll, expect, test } from 'bun:test';

import { createWebsiteApi, type WebsiteApiConfig } from './server';

const directories: string[] = [];
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

const journalId = '7d4f2a8e-5b1c-4e3d-9a6f-0c2b8e1d4a7f';
const writer = { release: 'release-test', privateRevision: 'abc1234', process: 'api' as const };
const appOrigin = 'http://localhost:4201';

function request(url: string, method: string, body?: unknown, cookie?: string, csrf?: string) {
  return new Request(`http://localhost:3101${url}`, {
    method,
    headers: {
      origin: appOrigin,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { 'x-puni-csrf': csrf } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function baseConfig(): WebsiteApiConfig {
  const directory = mkdtempSync(join(tmpdir(), 'puni-retention-routes-'));
  directories.push(directory);
  return {
    databasePath: join(directory, 'website.sqlite'),
    apiBindHost: '127.0.0.1',
    publicOrigin: 'http://localhost:4321',
    appOrigin,
    appManualUrl: `${appOrigin}/manual`,
    operatorPassword: 'local-test-secret',
    secureCookies: false,
  };
}

/** An API whose database is attached to an initialised in-memory journal, opened as `main.ts` does. */
async function journaledApi(overrides: Partial<WebsiteApiConfig> = {}) {
  const config = { ...baseConfig(), ...overrides };
  new WebsiteStore(config.databasePath).close();
  const database = new Database(config.databasePath);
  attachJournal(database, journalId);
  database.close();
  const remote = new MemoryJournalRemote();
  await initJournal(remote, { journalId, environment: 'website-test', writer, now: 1 });
  const api = createWebsiteApi({
    ...config,
    retentionJournal: { remote, options: { journalId, writer, now: Date.now } },
  });
  await api.openRetentionJournal();
  return { api, config, remote };
}

async function operatorLogin(api: ReturnType<typeof createWebsiteApi>) {
  const login = await api.fetch(
    request('/operator/session', 'POST', { password: 'local-test-secret' }),
    '127.0.0.1',
  );
  expect(login.status).toBe(201);
  return {
    cookie: login.headers.get('set-cookie')?.split(';')[0] ?? '',
    csrf: ((await login.json()) as { csrfToken: string }).csrfToken,
  };
}

/** Submits an anonymous manual proposal and returns its submission id. */
async function manualProposal(api: ReturnType<typeof createWebsiteApi>, databasePath: string) {
  const intake = await api.fetch(
    new Request('http://localhost:3101/intakes', {
      method: 'POST',
      headers: { origin: 'http://localhost:4321', 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'A booking tool for a local studio' }),
    }),
    '127.0.0.1',
  );
  expect(intake.status).toBe(201);
  const cookie = intake.headers.get('set-cookie')?.split(';')[0];
  const draft = await api.fetch(request('/draft', 'GET', undefined, cookie), '127.0.0.1');
  const csrf = ((await draft.json()) as { csrfToken: string }).csrfToken;
  const submitted = await api.fetch(
    request(
      '/proposals',
      'POST',
      { email: 'owner@example.test', brief: 'Calendar', idempotencyKey: 'submit-12345' },
      cookie,
      csrf,
    ),
    '127.0.0.1',
  );
  expect(submitted.status).toBe(201);
  const database = new Database(databasePath, { readonly: true });
  try {
    const row = database.query<{ id: string }, []>('SELECT id FROM proposal_submission').get();
    if (!row) throw new Error('no submission');
    return row.id;
  } finally {
    database.close();
  }
}

function classification(databasePath: string, id: string) {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database
      .query<{ classification: string; classification_evidence: string | null }, [string]>(
        'SELECT classification, classification_evidence FROM retention_subject WHERE subject_id = ?',
      )
      .get(id);
  } finally {
    database.close();
  }
}

function appliedSequence(databasePath: string): number | undefined {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database
      .query<{ applied_sequence: number }, []>(
        'SELECT applied_sequence FROM retention_journal_position',
      )
      .get()?.applied_sequence;
  } finally {
    database.close();
  }
}

const designation = (subjectId: string) => ({
  type: 'designate_client',
  kind: 'proposal_submission',
  subjectId,
  evidenceReference: 'contract:2026-001',
});

test('designation requires an operator session and CSRF', async () => {
  const { api, config } = await journaledApi();
  try {
    const subjectId = await manualProposal(api, config.databasePath);
    const operator = await operatorLogin(api);
    const event = designation(subjectId);
    expect(
      (await api.fetch(request('/operator/retention/events', 'POST', event), '127.0.0.1')).status,
    ).toBe(401);
    expect(
      (
        await api.fetch(
          request('/operator/retention/events', 'POST', event, operator.cookie, 'wrong'),
          '127.0.0.1',
        )
      ).status,
    ).toBe(403);
    expect(classification(config.databasePath, subjectId)?.classification).toBe('non_client');
    const accepted = await api.fetch(
      request('/operator/retention/events', 'POST', event, operator.cookie, operator.csrf),
      '127.0.0.1',
    );
    expect({ status: accepted.status, body: (await accepted.json()) as unknown }).toEqual({
      status: 201,
      body: { sequence: 1 },
    });
  } finally {
    api.close();
  }
});

test('a manual proposal can be designated', async () => {
  const { api, config, remote } = await journaledApi();
  try {
    const subjectId = await manualProposal(api, config.databasePath);
    const operator = await operatorLogin(api);
    const accepted = await api.fetch(
      request(
        '/operator/retention/events',
        'POST',
        designation(subjectId),
        operator.cookie,
        operator.csrf,
      ),
      '127.0.0.1',
    );
    expect(accepted.status).toBe(201);
    expect(classification(config.databasePath, subjectId)).toEqual({
      classification: 'client',
      classification_evidence: 'contract:2026-001',
    });
    expect(remote.versionCount('events/000000000001.json')).toBe(1);
    const status = await api.fetch(
      request('/operator/retention/status', 'GET', undefined, operator.cookie),
      '127.0.0.1',
    );
    expect(await status.json()).toMatchObject({
      report: { proposalSubmission: { client: 1 } },
      journal: { journalId, state: 'attached', appliedSequence: 1, headSequence: 1 },
    });
  } finally {
    api.close();
  }
});

test('closed stays non-client', async () => {
  const { api, config } = await journaledApi();
  try {
    const subjectId = await manualProposal(api, config.databasePath);
    const operator = await operatorLogin(api);
    for (const status of ['reviewing', 'contacted', 'closed'])
      expect(
        (
          await api.fetch(
            request(
              `/operator/submissions/${subjectId}`,
              'PATCH',
              { status },
              operator.cookie,
              operator.csrf,
            ),
            '127.0.0.1',
          )
        ).status,
      ).toBe(200);
    expect(classification(config.databasePath, subjectId)?.classification).toBe('non_client');
    expect(appliedSequence(config.databasePath)).toBe(0);
  } finally {
    api.close();
  }
});

test('an invalid transition is 409', async () => {
  const { api, config } = await journaledApi();
  try {
    const subjectId = await manualProposal(api, config.databasePath);
    const operator = await operatorLogin(api);
    const post = (body: unknown) =>
      api.fetch(
        request('/operator/retention/events', 'POST', body, operator.cookie, operator.csrf),
        '127.0.0.1',
      );
    const release = { ...designation(subjectId), type: 'release_hold' };
    expect((await post(release)).status).toBe(409);
    expect((await post({ ...designation(subjectId), subjectId: 'absent-subject' })).status).toBe(
      404,
    );
    expect(
      (await post({ ...designation(subjectId), evidenceReference: 'owner@example.test' })).status,
    ).toBe(400);
    expect((await post({ ...designation(subjectId), type: 'erase' })).status).toBe(400);
    expect((await post({ ...designation(subjectId), type: 'place_hold' })).status).toBe(201);
    expect((await post(designation(subjectId))).status).toBe(409);
    expect((await post(release)).status).toBe(201);
    expect(classification(config.databasePath, subjectId)?.classification).toBe('non_client');
  } finally {
    api.close();
  }
});

test('journal disabled answers 503 without touching the database', async () => {
  const config = baseConfig();
  const api = createWebsiteApi(config);
  try {
    await api.openRetentionJournal();
    const subjectId = await manualProposal(api, config.databasePath);
    const operator = await operatorLogin(api);
    const refused = await api.fetch(
      request(
        '/operator/retention/events',
        'POST',
        designation(subjectId),
        operator.cookie,
        operator.csrf,
      ),
      '127.0.0.1',
    );
    expect({ status: refused.status, body: (await refused.json()) as unknown }).toEqual({
      status: 503,
      body: { code: 'retention_journal_disabled' },
    });
    expect(classification(config.databasePath, subjectId)?.classification).toBe('non_client');
    const status = await api.fetch(
      request('/operator/retention/status', 'GET', undefined, operator.cookie),
      '127.0.0.1',
    );
    expect(await status.json()).toMatchObject({ journal: { state: 'disabled' } });
  } finally {
    api.close();
  }
});

test('a remote failure answers 503 and changes nothing', async () => {
  const { api, config, remote } = await journaledApi();
  try {
    const subjectId = await manualProposal(api, config.databasePath);
    const operator = await operatorLogin(api);
    remote.failPutOnce('events/000000000001.json');
    const refused = await api.fetch(
      request(
        '/operator/retention/events',
        'POST',
        designation(subjectId),
        operator.cookie,
        operator.csrf,
      ),
      '127.0.0.1',
    );
    expect({ status: refused.status, body: (await refused.json()) as unknown }).toEqual({
      status: 503,
      body: { code: 'retention_journal_unavailable' },
    });
    expect(classification(config.databasePath, subjectId)?.classification).toBe('non_client');
    expect(appliedSequence(config.databasePath)).toBe(0);
  } finally {
    api.close();
  }
});

test('startup refuses a journal it cannot verify', async () => {
  const config = baseConfig();
  new WebsiteStore(config.databasePath).close();
  const database = new Database(config.databasePath);
  attachJournal(database, journalId);
  database.close();
  const api = createWebsiteApi({
    ...config,
    retentionJournal: {
      remote: new MemoryJournalRemote(),
      options: { journalId, writer, now: Date.now },
    },
  });
  try {
    expect(api.openRetentionJournal()).rejects.toThrow(RetentionJournalError);
    await api.openRetentionJournal().catch((error: unknown) => {
      expect(error).toMatchObject({ reason: 'uninitialised' });
    });
  } finally {
    api.close();
  }
});

test('a fenced stream completion becomes unknown and keeps its reservation', async () => {
  let databasePath = '';
  const { api, config } = await journaledApi({
    demoAuth: true,
    openRouterEnabled: true,
    openRouterKey: 'fixture-key',
    openRouterModel: 'fixture/model',
    openRouterProvider: 'Fixture',
    openRouterInputUsdPerMillion: 1,
    openRouterOutputUsdPerMillion: 2,
    openRouterPrivacyVerified: true,
    providerFetch: () => {
      // Erasure begins while the provider is still answering.
      const database = new Database(databasePath);
      try {
        const request = database.query<{ id: string }, []>('SELECT id FROM software_request').get();
        if (!request) throw new Error('no request');
        fenceSubject(database, { kind: 'software_request', id: request.id });
      } finally {
        database.close();
      }
      const chunks = [
        {
          id: 'fenced',
          model: 'fixture/model',
          choices: [{ index: 0, delta: { role: 'assistant', content: 'SECRET reply' } }],
        },
        {
          id: 'fenced',
          model: 'fixture/model',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23 },
        },
      ];
      return Promise.resolve(
        new Response(
          chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
          { headers: { 'content-type': 'text/event-stream' } },
        ),
      );
    },
  });
  databasePath = config.databasePath;
  try {
    const login = await api.fetch(
      request('/session/demo', 'POST', { email: 'fenced@example.test' }),
      '127.0.0.1',
    );
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
    const response = await api.fetch(
      request(
        '/chat/stream',
        'POST',
        { message: 'A booking tool', idempotencyKey: 'fenced-key-12345' },
        cookie,
        csrf,
      ),
      '127.0.0.1',
    );
    const text = await response.text();
    // The fenced completion is never confirmed: the stream ends in the interrupted error, not a finish.
    expect(text).toContain('Your allowance remains on hold.');
    expect(text).not.toContain('"type":"finish"');
    const database = new Database(databasePath, { readonly: true });
    try {
      expect({
        operations: database.query('SELECT state, reply FROM chat_operation').all(),
        calls: database.query('SELECT settled_micro_usd FROM provider_call').all(),
        turns: database.query('SELECT count(*) AS count FROM chat_turn').get(),
      }).toEqual({
        operations: [{ state: 'unknown', reply: null }],
        calls: [{ settled_micro_usd: null }],
        turns: { count: 0 },
      });
    } finally {
      database.close();
    }
  } finally {
    api.close();
  }
});
