import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import process from 'node:process';

const requireOwner = createRequire(join(process.cwd(), 'package.json'));
const eslint = dirname(requireOwner.resolve('eslint/package.json'));
const stylish = requireOwner(join(eslint, 'lib/cli-engine/formatters/stylish.js'));

/** Report every ESLint result, including clean and explicitly ignored files. */
export default function formatCoverage(results, context) {
  const output = stylish(results, context);
  const report = process.env.PUNI_FE_LINT_REPORT;
  if (!report) {
    throw new Error('Missing private frontend lint coverage path');
  }
  const files = results.map(({ filePath, errorCount, warningCount, fatalErrorCount }) => ({
    filePath,
    errorCount,
    warningCount,
    fatalErrorCount,
  }));
  // Proof: a second installed CLI run on the same report path refused EEXIST and left the original bytes intact.
  writeFileSync(report, JSON.stringify({ files }) + '\n', { flag: 'wx', mode: 0o600 });
  return output;
}
