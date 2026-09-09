import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'bun:test';
import { ESLint } from 'eslint';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const services = [
  'assumed-assignee',
  'auth.service',
  'broadcast',
  'calendar-marker.service',
  'capacity.service',
  'clean-name',
  'directory-usage',
  'directory.service',
  'login-throttle',
  'numbered-work-item',
  'priority-band.service',
  'project.service',
  'step.service',
];

// Proof: importing be-01's repository/schema from adjacent project.service.ts
// failed this assertion and core:lint with @nx/enforce-module-boundaries:
// "Projects cannot be imported by a relative or absolute path, and must begin
// with a npm scope" (2026-09-09).
it('keeps the directory and project production family inside the core boundary', async () => {
  const files = services.map((name) => `${root}/libs/core/src/service/${name}.ts`);
  for (const file of files) expect(existsSync(file), file).toBe(true);
  const lint = new ESLint({ cwd: root });
  const checked = await lint.lintFiles(files);
  expect(checked.flatMap((file) => file.messages)).toEqual([]);
}, 60_000);
