import { expect, it } from 'vitest';

import { WbsRequestError } from '@/lib/wbs-api';

import { batchRefusalSentence, refusalSentence } from '../wbs/plan-refusal';
import { agentPoolRefusal } from './agent-pool-refusal';
import { credentialRefusal, trustedIssuerRefusal } from './machine-credential-refusal';
const text =
  'Restore a direct organization super-admin grant before retrying. Nothing was changed.';
it('renders CP14 credential refusal', () => {
  expect(credentialRefusal({ error: 'last_super_admin' }, 'revoke', null)).toEqual({
    kind: 'message',
    text,
  });
});
it('renders CP14 issuer refusal', () => {
  expect(trustedIssuerRefusal({ error: 'last_super_admin' }, null)).toEqual({
    kind: 'message',
    text,
  });
});
it('renders CP14 pool refusal', () => {
  expect(agentPoolRefusal({ error: 'last_super_admin' }, 'rekey')).toEqual({
    kind: 'message',
    text,
  });
});
it('renders CP14 directory command refusal', () => {
  expect(batchRefusalSentence({ error: 'last_super_admin', at: 0, kind: 'deletePerson' })).toBe(
    text,
  );
});

it('renders CP14 through the actual typed command error bridge', () => {
  expect(
    refusalSentence(
      new WbsRequestError({
        kind: 'refusal',
        operation: 'postApiProjectsByIdCommands',
        refusal: { error: 'last_super_admin', at: 0, kind: 'deletePerson' },
      }),
    ),
  ).toBe(text);
});
