import { expect, test } from 'bun:test';
import { fromMarkdown } from 'mdast-util-from-markdown';

import { extractScenarioHeadingsFromSyntax } from './scenario-headings';

test('scenario heading extraction refuses a parser tree without source offsets', () => {
  const markdown = '#### Scenario: [EXAMPLE-001] First case\n';
  const syntax = fromMarkdown(markdown);
  const heading = syntax.children[0];
  heading.position = undefined;
  expect(() => extractScenarioHeadingsFromSyntax(markdown, syntax)).toThrow(
    'scenario heading has no source offsets',
  );
});
