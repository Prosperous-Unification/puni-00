import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';

import { readLegacySavedPlanInput } from './legacy-input10';
import { readLegacySavedPlanInput11 } from './legacy-input11';
import { upgradeLegacyPlanInput10 } from './upgrade-plan-input10';
import { readSavedPlanInput, SAVED_PLAN_INPUT_READER_VERSION } from './versioned-plan-input';

/** Reads the constructed11 control emitted before the current writer retired. */
function constructedInput11() {
  return readLegacySavedPlanInput11(
    JSON.parse(
      readFileSync(new URL('./fixtures/constructed-input11-local.txt', import.meta.url), 'utf8'),
    ),
  );
}
const prefix = '../../../../../../openspec/changes/wbs-work-packages/fixtures/';
const records = JSON.parse(
  readFileSync(new URL(prefix + 'legacy-input-captures.json', import.meta.url), 'utf8'),
) as { records: { name: string; path: string; sha256: string; schemaVersion: number }[] };
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
for (const capture of records.records)
  test(
    'frozen eleven reads a constructed projection of genuine ' +
      capture.name +
      ' without rewriting it',
    () => {
      const path = new URL('../../../../../../' + capture.path, import.meta.url);
      const bytes = readFileSync(path, 'utf8');
      expect(hash(bytes)).toBe(capture.sha256);
      const original: unknown = JSON.parse(bytes);
      const projected = upgradeLegacyPlanInput10(
        readLegacySavedPlanInput(original, capture.schemaVersion),
      );
      const decoded = readLegacySavedPlanInput11(projected);
      const current = readSavedPlanInput(original, capture.schemaVersion);
      if (current.schemaVersion !== 11)
        throw new Error('historical body did not retain eleven projection');
      expect(decoded).toEqual(current);
      expect(decoded.schemaVersion).toBe(11);
      expect('ownerId' in decoded.workPackage).toBe(true);
      expect('projectId' in decoded.workPackage).toBe(false);
      expect(readFileSync(path, 'utf8')).toBe(bytes);
      expect(hash(bytes)).toBe(capture.sha256);
    },
  );
test('frozen eleven preserves its constructed pre-retirement control under reader twelve', () => {
  const emitted = constructedInput11();
  const bytes = JSON.stringify(emitted);
  expect(SAVED_PLAN_INPUT_READER_VERSION).toBe(12);
  expect(readLegacySavedPlanInput11(emitted)).toEqual(emitted);
  expect(readSavedPlanInput(emitted, 11)).toEqual(emitted);
  expect(JSON.stringify(emitted)).toBe(bytes);
});
test.each([
  'missing owner',
  'future parent',
  'future schema',
  'mixed root',
  'bad blockage',
  'bad parallel',
  'bad factor',
])('frozen eleven retains existing refusal for %s', (fault) => {
  const body = structuredClone(constructedInput11());
  if (fault === 'missing owner') Reflect.deleteProperty(body.workPackage, 'ownerId');
  if (fault === 'future parent') Reflect.set(body.workPackage, 'projectId', 'future');
  if (fault === 'future schema') Reflect.set(body, 'schemaVersion', 12);
  if (fault === 'mixed root') Reflect.set(body, 'project', body.workPackage);
  if (fault === 'bad blockage')
    Reflect.set(body, 'stepBlockages', [{ workItemId: 'absent', stepId: 'absent', blockedAt: 1 }]);
  if (fault === 'bad parallel')
    Reflect.set(body, 'stepParallels', [
      { workItemId: 'absent', stepId: 'absent', maxParallel: 1001 },
    ]);
  if (fault === 'bad factor') Reflect.set(body.workPackage, 'budgetFactor', 0);
  expect(() => readLegacySavedPlanInput11(body)).toThrow();
  expect(() => readSavedPlanInput(body, 11)).toThrow();
});

test('the public current reader preserves the original declared-version diagnostic', () => {
  const emitted = constructedInput11();
  const wrong = { ...emitted, schemaVersion: 12 };
  expect(() => readSavedPlanInput(wrong, 11)).toThrow('saved history version at $.schemaVersion');
  expect(() => readSavedPlanInput(emitted, 12)).toThrow('saved history version at $.schemaVersion');
  expect(() => readSavedPlanInput(emitted, 13)).toThrow('from-the-future');
});
