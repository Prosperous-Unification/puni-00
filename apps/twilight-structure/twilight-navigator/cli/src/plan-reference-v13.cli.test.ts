import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { decodeRecord, PlanReferenceRecord, validatePlanTasks } from '@twilight-burokrat/contracts';
import type { PlanDocumentV13 } from '@wbs/contracts';
import { expect, test } from 'bun:test';

test.each([false, true])(
  'actual CLI ordinary13 malformed sparse=%s preserves provenance or refuses before writing',
  (malformed) => {
    const directory = mkdtempSync(join(tmpdir(), 'navigator13-'));
    try {
      const input = JSON.parse(
        readFileSync(join(import.meta.dir, 'fixtures', 'plan-export.v11.json'), 'utf8'),
      ) as PlanDocumentV13;
      Reflect.set(input.document, 'version', 13);
      const parents = new Set(input.workItems.map((row) => row.parentId));
      const owner = input.workItems.find((row) => !parents.has(row.id));
      if (owner === undefined) throw new Error('fixture leaf missing');
      input.stepParallels = [
        { workItemId: owner.id, stepId: input.steps[0].id, maxParallel: malformed ? 1001 : 1 },
      ];
      const bytes = JSON.stringify(input);
      const source = join(directory, 'export.json');
      const requirements = join(directory, 'requirements.md');
      writeFileSync(source, bytes);
      writeFileSync(requirements, '## ADDED Requirements\n');
      const child = Bun.spawnSync(
        [
          process.execPath,
          'run',
          join(import.meta.dir, 'entrypoint.ts'),
          'plan-reference',
          '--export',
          source,
          '--repository',
          'https://github.com/Prosperous-Unification/puni-00',
          '--change',
          'set-step-node-parallelism',
          '--planning-commit',
          '1'.repeat(40),
          '--source-base',
          '2'.repeat(40),
          '--requirements',
          requirements,
          '--output',
          directory,
        ],
        { stdout: 'pipe', stderr: 'pipe' },
      );
      if (malformed) {
        expect(child.exitCode).toBe(1);
        expect(child.stderr.toString()).toContain('plan export is malformed');
        expect(readdirSync(directory).sort()).toEqual(['export.json', 'requirements.md']);
      } else {
        expect(child.exitCode, child.stderr.toString()).toBe(0);
        const record = PlanReferenceRecord.assert(
          JSON.parse(readFileSync(join(directory, 'plan-reference.json'), 'utf8')),
        );
        expect(decodeRecord('plan-reference', record)).toEqual(record);
        expect(record.planDocumentVersion).toBe(13);
        const tasks: unknown = JSON.parse(readFileSync(join(directory, 'tasks.json'), 'utf8'));
        expect(validatePlanTasks(record, tasks)).toMatchObject({
          scope: 'plan-task-consistency',
          referenceDigest: record.referenceDigest,
          taskCount: record.taskCount,
        });
        expect(record.exportDigest).toBe(createHash('sha256').update(bytes).digest('hex'));
        expect(child.stdout.toString()).toBe(`${record.referenceDigest}\n`);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
