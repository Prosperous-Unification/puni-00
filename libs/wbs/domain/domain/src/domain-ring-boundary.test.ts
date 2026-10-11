import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'bun:test';
import { ESLint } from 'eslint';

const root = fileURLToPath(new URL('../../../../..', import.meta.url));
const domain = `${root}/libs/wbs/domain/domain/src`;

/**
 * The task 6.1 rules that moved out of the core's `service/`; each must stay in the domain ring.
 * `compensating`, `command-normalizers`, `plan-command`, `directory-usage` and
 * `numbered-work-item` were reclassified as application code instead (see `kinds.json`).
 */
const movedRules = [
  'assumed-assignee',
  'clean-name',
  'dependency',
  'roll-up',
  'saved-plan-default-name',
  'saved-plan-input',
  'saved-plan-quota',
  'saved-plan-schedule-body',
  'smoke-echo',
].map((name) => `${domain}/${name}.ts`);

const boundaryRule = '@nx/enforce-module-boundaries';

// The core already depends on this library, so a port import is refused as a circular
// dependency before the `ring:domain` tag constraint is consulted; either is a lint failure.
// The text is linted as a real moved file, because a path outside the project service is a
// parse error rather than a boundary verdict.
// Proof (2026-10-11): turning `@nx/enforce-module-boundaries` off in `eslint.config.js` failed
// this case with `Received: []` (1 pass, 1 fail); importing `WorkItemStore` from
// `@wbs/core/ports/work-item-store` into `roll-up.ts` failed `wbs-domain:lint:fast` with
// `Circular dependency between "wbs-domain" and "wbs-core"`.
it('refuses a port or core parser import inside a moved domain rule', async () => {
  const lint = new ESLint({ cwd: root });
  const leaks = [
    "import type { WorkItem } from '@wbs/core';\n\nexport type Row = WorkItem;\n",
    "import type { WorkItem } from '@wbs/core/ports/work-item-values';\n\nexport type Row = WorkItem;\n",
    "import { capacityOf } from '../../../application/core/src/http/capacity-body';\n\nexport const sizeOf = capacityOf;\n",
  ];
  for (const leak of leaks) {
    const [checked] = await lint.lintText(leak, { filePath: `${domain}/roll-up.ts` });
    expect(checked.messages.map((message) => [message.ruleId, message.line])).toContainEqual([
      boundaryRule,
      1,
    ]);
  }
}, 60_000);

it('keeps every moved rule inside the domain ring', async () => {
  for (const file of movedRules) expect(existsSync(file), file).toBe(true);
  const lint = new ESLint({ cwd: root });
  const checked = await lint.lintFiles(movedRules);
  expect(checked.flatMap((file) => file.messages)).toEqual([]);
}, 60_000);
