import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { IMPORT_WITH_AI_PROMPT } from './import-with-ai';

/**
 * `docs/import-with-ai.md`, found from `apps/wbs/fe-01`, where both Vitest configs run — the
 * same reason `src/test-tiers.test.ts` reads `process.cwd()` rather than `import.meta.url`.
 */
const GUIDE = join(process.cwd(), '../../../docs/import-with-ai.md');

/** Every client the design reviews named; the guide owes each one a row. */
const CLIENTS = [
  'Claude Code',
  'Claude Desktop',
  'claude.ai',
  'ChatGPT',
  'Cursor desktop',
  'VS Code Copilot',
  'Codex CLI',
  'Gemini CLI',
  'Windsurf',
  'JetBrains AI Assistant',
  'Junie CLI',
  'Zed',
  'Cline',
  'Roo Code',
  'Continue',
  'Goose',
  'Warp desktop',
  'Amazon Q Developer CLI',
  'GitHub Copilot in JetBrains',
  'LM Studio',
  'Raycast',
  'Perplexity',
  'Mistral Le Chat / Work',
  'Microsoft Copilot Studio',
];

/**
 * The statuses a row may carry before a live WBS connection is recorded. `WBS import tested`
 * is deliberately absent: no client has the evidence record the spec requires.
 */
const STATUSES = new Set(['Documented', 'Bridge fallback', 'Unverified', 'Unsupported']);

interface ClientRow {
  client: string;
  status: string;
  checked: string;
  cells: readonly string[];
}

/** The body of the section headed `heading`, up to the next heading of the same depth. */
function sectionOf(guide: string, heading: string): string {
  const start = guide.indexOf(`\n${heading}\n`);
  if (start === -1) throw new Error(`guide has no "${heading}" section`);
  const depth = /^#+/.exec(heading)?.[0] ?? '##';
  const rest = guide.slice(start + heading.length + 2);
  const end = rest.search(new RegExp(`\\n${depth} `));
  return end === -1 ? rest : rest.slice(0, end);
}

/** The client table's body rows, split into cells; the header and divider rows are skipped. */
function clientRowsOf(guide: string): ClientRow[] {
  const lines = sectionOf(guide, '## Client support')
    .split('\n')
    .filter((line) => line.startsWith('|'));
  return lines.slice(2).map((line) => {
    const cells = line
      .slice(1, -1)
      .split(' | ')
      .map((cell) => cell.trim());
    const [client = '', status = '', checked = ''] = cells;
    return { client: client.replaceAll('*', ''), status, checked, cells };
  });
}

/** The fenced `text` block under `## The import prompt`. */
function promptOf(guide: string): string {
  const fenced = /```text\n([\s\S]*?)\n```/.exec(sectionOf(guide, '## The import prompt'));
  if (fenced?.[1] === undefined) throw new Error('guide has no fenced import prompt');
  return fenced[1];
}

describe('docs/import-with-ai.md', () => {
  const guide = readFileSync(GUIDE, 'utf8');

  // Proof: on 2026-09-27, deleting the Raycast row failed this on the missing "Raycast",
  // and relabeling Zed `WBS import tested` failed the status check below on "WBS import tested".
  it('gives every reviewed client exactly one row', () => {
    expect(
      clientRowsOf(guide)
        .map((row) => row.client)
        .sort(),
    ).toEqual([...CLIENTS].sort());
  });

  it('labels no client tested and dates every row', () => {
    for (const row of clientRowsOf(guide)) {
      expect(STATUSES, row.client).toContain(row.status);
      expect(row.checked, row.client).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(guide).toContain('No client is marked **WBS import tested**');
  });

  it('documents ChatGPT as unsupported until a connection is recorded', () => {
    expect(clientRowsOf(guide).find((row) => row.client === 'ChatGPT')?.status).toBe('Unsupported');
  });

  it('links a source for every row', () => {
    for (const row of clientRowsOf(guide)) {
      expect(row.cells.at(-1), row.client).toMatch(/\]\(https:\/\//);
    }
  });

  // Proof: on 2026-09-27, one changed word in the guide's prompt failed this with the diff.
  it('carries the same prompt the in-app copy button hands out', () => {
    expect(promptOf(guide)).toBe(IMPORT_WITH_AI_PROMPT);
  });

  it('confirms the grant-bound organization and role before writing', () => {
    expect(guide).toContain('fresh MCP authorization');
    expect(guide).toMatch(/destination organization/);
    expect(guide).toMatch(/current WBS role/);
  });

  it('asks for write scope rather than assuming sign-in grants it', () => {
    expect(guide).toContain('wbs:read wbs:write');
    expect(guide).toMatch(/defaults? to `wbs:read`/);
  });

  it('prepares each source and troubleshoots each failure', () => {
    for (const heading of [
      '### Jira, Linear and Asana',
      '### Microsoft Project',
      '### Spreadsheets',
      '### The client cannot connect',
      '### Sign-in fails',
      '### Writes are refused for scope',
      '### The import is rejected',
    ]) {
      expect(guide, heading).toContain(`\n${heading}\n`);
    }
  });

  it('never asks for a copied token or promises native .mpp', () => {
    expect(guide).not.toMatch(/\bbearer\b/i);
    expect(guide).not.toMatch(/"headers"\s*:/);
    for (const line of guide.split('\n').filter((text) => text.includes('.mpp'))) {
      expect(line).toMatch(/\bnot\b/);
    }
  });

  it('keeps the public URL a placeholder until the production overlay serves it', () => {
    expect(guide).toContain('<WBS_MCP_URL>');
    expect(guide).not.toMatch(/https:\/\/wbs\.bulletpoints\.club\/mcp/);
  });
});
