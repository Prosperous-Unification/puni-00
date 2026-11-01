import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import {
  composeScopingSystemText,
  composeSystemText,
  providerDeclineReply,
  salesPromptVersion,
  salesSystemPrompt,
  scopingPromptVersion,
  scopingSystemPrompt,
  stageHint,
} from './system-prompt';

const promptDocument = readFileSync(
  join(import.meta.dir, '../../../../../openspec/changes/build-ai-chat-harness/system-prompt.md'),
  'utf8',
);

test('the shipped prompt equals the reviewed document text', () => {
  const block = /```text\n([\s\S]*?)\n```/.exec(promptDocument)?.[1];
  if (block === undefined) throw new Error('system-prompt.md has no text block');
  // Proof: changing one word in system-prompt.md failed this equality.
  expect(salesSystemPrompt).toBe(block);
  expect(promptDocument).toContain(`# System prompt draft: \`${salesPromptVersion}\``);
});

test('each stage hint equals its row in the reviewed document', () => {
  for (const stage of ['clarify', 'brief', 'contact'] as const) {
    const row = new RegExp(`^\\| \`${stage}\` +\\| \`(.*)\` *\\|$`, 'm').exec(promptDocument);
    if (!row?.[1]) throw new Error(`system-prompt.md has no ${stage} hint`);
    expect(stageHint(stage)).toBe(row[1]);
    expect(composeSystemText(stage)).toBe(`${salesSystemPrompt}\n${row[1]}`);
  }
});

test('the provider decline equals the reviewed document and carries no price, date or marker', () => {
  expect(promptDocument).toContain(`> ${providerDeclineReply}\n`);
  expect(providerDeclineReply).not.toMatch(/[$€£\d[\]]/);
});

test('the separately versioned scoping prompt equals its reviewed source', () => {
  const document = readFileSync(
    join(import.meta.dir, '../../../../../openspec/changes/conversion-scoping/system-prompt.md'),
    'utf8',
  );
  const block = /```text\n([\s\S]*?)\n```/.exec(document)?.[1];
  if (block === undefined) throw new Error('Missing prompt block');
  // Proof: keeping the v3 runtime against the revised v4 source failed this equality.
  expect(scopingSystemPrompt).toBe(block);
  expect(document).toContain(scopingPromptVersion);
});

// Source policy assertions certify reviewed instructions only, never model compliance.
test('future scoping uses v8 offer guidance with visitor-confirmed suggestions', () => {
  expect(scopingPromptVersion).toBe('puni-scoping-v8');
  for (const policy of [
    'The five available offers are Launch an app or website, Improve my app, Build something similar,',
    'Help me choose is an exploration entry, not a sixth offer.',
    'Suggested answers are predefined clickable replies, never automatically selected visitor intent.',
    'Use route-selection when a different starting offer would fit; explain why provisionally',
    'Ask a route-relevant reference question only when it could clarify a preference or workflow.',
    'Email is not required for chat, references or brief review.',
  ])
    expect(scopingSystemPrompt).toContain(policy);
  expect(composeScopingSystemText(false)).toContain('Question catalogue: ');
  expect(composeScopingSystemText(true)).toContain('This is the final available reply.');
});
