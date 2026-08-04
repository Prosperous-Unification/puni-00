import { readFile } from 'node:fs/promises';

/**
 * AGENTS.md caps LLM_README.md at 150 lines, and the file reached 207 before
 * anyone noticed — a stated rule that nothing enforced, which is the same
 * category of defect as a check that cannot fail. The cap exists so the file
 * stays what an agent needs *before* it knows its task; detail belongs in a
 * linked runbook, spec or ADR.
 *
 * Kept as data rather than one hardcoded path so a second capped doc costs one
 * line.
 */
export const DOC_CAPS: readonly { file: string; maxLines: number }[] = [
  { file: 'LLM_README.md', maxLines: 150 },
];

export interface CapIssue {
  file: string;
  reason: string;
}

/**
 * A file that cannot be read is an issue, not a pass. Returning null there
 * would make an unreadable doc indistinguishable from one within its cap.
 */
export async function checkCap(file: string, maxLines: number): Promise<CapIssue | null> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (e: unknown) {
    return {
      file,
      reason: `could not be read (${e instanceof Error ? e.message : String(e)}), so its line cap could not be checked`,
    };
  }
  const lines = raw.split('\n').length - (raw.endsWith('\n') ? 1 : 0);
  if (lines <= maxLines) return null;
  return {
    file,
    reason:
      `${String(lines)} lines, capped at ${String(maxLines)} (AGENTS.md). ` +
      'Move detail into a linked runbook, spec or ADR rather than raising the cap.',
  };
}

async function main(): Promise<void> {
  const issues: CapIssue[] = [];
  for (const { file, maxLines } of DOC_CAPS) {
    const issue = await checkCap(file, maxLines);
    if (issue) issues.push(issue);
  }
  if (issues.length > 0) {
    console.error('[tool-git-hooks] doc-caps failed:');
    for (const i of issues) console.error(`  ${i.file}: ${i.reason}`);
    process.exit(1);
  }
}

if (import.meta.main) {
  void main();
}
