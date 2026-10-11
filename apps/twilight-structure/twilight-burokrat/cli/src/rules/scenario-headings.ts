import type { Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';

const Prefix = '#### Scenario: ';

export interface ScenarioHeading {
  readonly title: string;
  /** UTF-16 offset immediately before the raw title, for insertion without rewriting Markdown. */
  readonly titleStart: number;
}

/**
 * Finds top-level ATX scenario headings using CommonMark block structure. The journal title is
 * the literal source after `#### Scenario: `, preserving existing spelling, inline syntax and
 * trailing whitespace; the AST decides whether that source line is a heading at all.
 */
export function extractScenarioHeadings(markdown: string): readonly ScenarioHeading[] {
  return extractScenarioHeadingsFromSyntax(markdown, fromMarkdown(markdown));
}

/** Uses an already parsed Markdown tree; the production extractor supplies this tree. */
export function extractScenarioHeadingsFromSyntax(
  markdown: string,
  syntax: Root,
): readonly ScenarioHeading[] {
  const headings: ScenarioHeading[] = [];
  for (const node of syntax.children) {
    // Proof: restoring the previous fence scanner in the production evaluator made all four
    // list-boundary, HTML pre, lone-CR and three-space-heading negatives exit 0.
    if (node.type !== 'heading' || node.depth !== 4) continue;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    // Proof: removing this refusal let a heading with its parser-supplied position deleted
    // reach substring extraction in the injected-parser negative instead of throwing.
    if (start === undefined || end === undefined) {
      throw new Error('scenario heading has no source offsets');
    }
    const raw = markdown.slice(start, end);
    if (!raw.startsWith(Prefix) || /[\r\n]/.test(raw)) continue;
    headings.push({ title: raw.slice(Prefix.length), titleStart: start + Prefix.length });
  }
  return headings;
}
