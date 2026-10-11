import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'bun:test';
import { ESLint } from 'eslint';

const root = fileURLToPath(new URL('../../../../../..', import.meta.url));
const services = [
  'auth.service',
  'command-normalizers',
  'compensating',
  'directory-usage',
  'numbered-work-item',
  'optimizer-trigger-broadcaster',
  'plan-command',
  'saved-plan-schedule',
  'saved-plan.service',
];

// Proof: importing be-01's repository/schema from adjacent
// gateway-broadcaster.ts failed core:lint at that production import with
// @nx/enforce-module-boundaries: "Projects cannot be imported by a relative or
// absolute path, and must begin with a npm scope" (2026-09-09).
// Proof: importing be-01's repository from command-normalizers.ts failed this
// assertion with the same @nx/enforce-module-boundaries message (2026-09-12).
// Proof: importing be-01's repository from command-bindings.ts failed here with
// the same @nx/enforce-module-boundaries message (2026-09-12).
it('keeps extracted production services inside the core boundary', async () => {
  const files = services.map((name) => `${root}/libs/wbs/application/core/src/service/${name}.ts`);
  for (const file of files) expect(existsSync(file), file).toBe(true);
  const lint = new ESLint({ cwd: root });
  const checked = await lint.lintFiles(files);
  expect(checked.flatMap((file) => file.messages)).toEqual([]);
}, 60_000);
