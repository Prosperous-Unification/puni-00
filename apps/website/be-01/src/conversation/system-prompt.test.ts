import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import {
  composeSystemText,
  providerDeclineReply,
  salesPromptVersion,
  salesSystemPrompt,
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
