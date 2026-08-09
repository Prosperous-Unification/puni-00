import { afterEach, describe, expect, it, vi } from 'vitest';

import { httpProjectApi, roleRefusalSentence, type RoleUsage } from './wbs-api';

/**
 * A Response as be-01 would really produce one.
 *
 * An empty body is passed as `null` rather than `''`: a 204 with a body is not
 * a response the constructor will build at all, and 204 is exactly what a
 * removal answers.
 */
const response = (status: number, body: string): Response =>
  new Response(body === '' ? null : body, { status });

/** What be-01 answers a first, uncascaded removal of a phase somebody is using. */
const IN_USE: RoleUsage = {
  estimates: 2,
  assignments: 1,
  assumedAssignees: [{ workItemId: 'w2', assumedNow: null, assumedAfter: 'p1' }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('removing a phase', () => {
  it('reads the counts out of the refusal rather than throwing the code', async () => {
    // The whole reason this call does not go through `send`: `send` throws the
    // `error` field and drops `inUse` with it, and `inUse` is what the
    // confirmation is made of.
    // Proof: the `in_use` branch deleted so the 409 falls through to the throw
    // below, this failed on `promise rejected "Error: in_use" instead of
    // resolving`. Watched, 2026-08-09.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(response(409, JSON.stringify({ error: 'in_use', inUse: IN_USE }))),
      ),
    );
    await expect(httpProjectApi('t').removeRole('p1', 'role-qa', false)).resolves.toEqual({
      ok: false,
      reason: 'in_use',
      inUse: IN_USE,
    });
  });

  it('throws a 409 that is not the refusal this client models', async () => {
    // There is no such answer from `roleController` today. The branch exists so
    // that if one ever arrives it is a failure somebody sees, rather than being
    // read as an `in_use` with no counts in it.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(response(409, JSON.stringify({ error: 'taken' })))),
    );
    await expect(httpProjectApi('t').removeRole('p1', 'role-qa', false)).rejects.toThrow('taken');
  });

  it('throws an in_use with no counts rather than confirming against nothing', async () => {
    // A body claiming the refusal without the numbers is a be-01 that has
    // changed shape. Confirming a cascade from an empty confirmation is exactly
    // the silent-default this repository refuses.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(response(409, JSON.stringify({ error: 'in_use' })))),
    );
    await expect(httpProjectApi('t').removeRole('p1', 'role-qa', false)).rejects.toThrow('in_use');
  });

  it('asks for the cascade only when it is given one', async () => {
    const fetched = vi.fn(() => Promise.resolve(response(204, '')));
    vi.stubGlobal('fetch', fetched);
    const api = httpProjectApi('t');
    await api.removeRole('p1', 'role-qa', false);
    await api.removeRole('p1', 'role-qa', true);
    expect(fetched.mock.calls.map((call) => call[0])).toEqual([
      '/api/projects/p1/roles/role-qa',
      '/api/projects/p1/roles/role-qa?cascade=true',
    ]);
  });

  it('answers a removal be-01 performed outright', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(response(204, ''))),
    );
    await expect(httpProjectApi('t').removeRole('p1', 'role-qa', false)).resolves.toEqual({
      ok: true,
    });
  });
});

describe('adding and renaming a phase', () => {
  it('sends the name and answers with the phase', async () => {
    const fetched = vi.fn(() =>
      Promise.resolve(response(200, JSON.stringify({ role: { id: 'r3', name: 'Design' } }))),
    );
    vi.stubGlobal('fetch', fetched);
    await expect(httpProjectApi('t').addRole('p1', 'Design')).resolves.toEqual({
      id: 'r3',
      name: 'Design',
    });
    expect(fetched.mock.calls[0]?.[0]).toBe('/api/projects/p1/roles');
    expect((fetched.mock.calls[0]?.[1] as RequestInit | undefined)?.body).toBe(
      JSON.stringify({ name: 'Design' }),
    );
  });

  it('throws be-01’s code for a duplicate, for the caller to phrase', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(response(409, JSON.stringify({ error: 'taken' })))),
    );
    await expect(httpProjectApi('t').renameRole('p1', 'r3', 'Dev')).rejects.toThrow('taken');
  });
});

describe('what a refused phase change says', () => {
  it('has a sentence for every code roleController answers with', () => {
    // The list is `statusFor` in `apps/be-01/src/controller/role.controller.ts`
    // plus `unknown_role`, which the estimate and assignee writes answer with
    // once a phase has gone. A code with no sentence would reach a toast as
    // itself, which is what this change exists to stop.
    for (const code of [
      'taken',
      'name_required',
      'in_use',
      'unknown_role',
      'not_found',
      'forbidden',
    ]) {
      const sentence = roleRefusalSentence(code);
      expect(sentence).not.toContain(code);
      expect(sentence.endsWith('.')).toBe(true);
    }
  });

  it('names the code it does not know rather than swallowing it', () => {
    // Not a default sentence with the code dropped: an unrecognised refusal is
    // something to report, and a message that hid it would leave nobody able to
    // say what be-01 answered.
    expect(roleRefusalSentence('http_502')).toContain('http_502');
  });
});
