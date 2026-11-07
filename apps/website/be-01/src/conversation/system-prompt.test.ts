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
  scopingPublicMaterial,
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
test('future scoping uses v11 offer guidance with visitor-confirmed suggestions', () => {
  expect(scopingPromptVersion).toBe('puni-scoping-v11');
  for (const policy of [
    'The public scoping material lists the five available offers.',
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

test('v11 exploration directs concrete examples plus an actionable next step without invention', () => {
  expect(scopingSystemPrompt).toContain('Give two concrete illustrative examples');
  expect(scopingSystemPrompt).toContain('an actionable next step');
  expect(scopingSystemPrompt).toContain('Do not ask for an email or invent work');
});

test('v11 references preserve preference, reuse and inspection boundaries in distinct wording', () => {
  expect(scopingSystemPrompt).toContain('Treat references as preference signals.');
  expect(scopingSystemPrompt).toContain('A reference grants no reuse rights.');
  expect(scopingSystemPrompt).toContain('Propose original or licensed work.');
  expect(scopingSystemPrompt).toContain('Do not fetch or claim to inspect a reference.');
  expect(scopingSystemPrompt).toContain(
    'References are optional. Respect later/no-reference choices',
  );
});

test('reviewed public material matches the separately published canonical block', () => {
  const document = readFileSync(
    join(import.meta.dir, '../../../../../openspec/changes/conversion-scoping/system-prompt.md'),
    'utf8',
  );
  const block = /```json\n([\s\S]*?)\n```/.exec(document)?.[1];
  if (block === undefined) throw new Error('Missing public material block');
  const reviewed: unknown = JSON.parse(block);
  expect(reviewed).toEqual(scopingPublicMaterial);
  const publicText = JSON.stringify(scopingPublicMaterial);
  for (const finalTurn of [false, true]) {
    const composed = composeScopingSystemText(finalTurn);
    expect(composed.split(publicText)).toHaveLength(2);
    expect(composed).toStartWith(scopingSystemPrompt + '\nPublic scoping material: ');
  }
  for (const text of [
    ...scopingPublicMaterial.offers,
    ...scopingPublicMaterial.explorationExamples,
    ...scopingPublicMaterial.explorationNextSteps,
    ...scopingPublicMaterial.humanReview,
  ])
    expect(scopingSystemPrompt).not.toContain(text);
});
