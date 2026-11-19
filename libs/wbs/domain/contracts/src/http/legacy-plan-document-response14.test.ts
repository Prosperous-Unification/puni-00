import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';

import {
  createLegacyPlanDocumentV13,
  createLegacyPlanDocumentV14,
} from './legacy-plan-document-response14';
import { planDocumentV13, planDocumentV14 } from './plan-document-shapes';
import { responseSchema } from './schema-shape';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const expected = [
  {
    version: 13,
    build: createLegacyPlanDocumentV13,
    current: planDocumentV13,
    descriptor: '4fd85e9749406ca58f832a1147da090abcac575c2c01b397b2a2bb8a3543bc7c',
    original: 'legacy-document11-ordinary.txt',
    sha256: '8ad535ac5d1050b4839199f778713f07d751ee05c6517988032245664d98f1c6',
  },
  {
    version: 14,
    build: createLegacyPlanDocumentV14,
    current: planDocumentV14,
    descriptor: 'f387c02ea03e6ac1ef12ed93d2704565fab870962e38aec0787e51fa78f7ddad',
    original: 'legacy-document12-connected.txt',
    sha256: 'd5d58dc017a9cabca1ae712f052c79ee6a4f5313e1dfd6c9fb561db2c29ba123',
  },
] as const;
const spellings: Readonly<Record<string, string>> = {
  project: 'workPackage',
  projects: 'workPackages',
  projectId: 'workPackageId',
  projectName: 'workPackageName',
  projectAbbreviation: 'workPackageAbbreviation',
  projectRevision: 'workPackageRevision',
  targetProjectId: 'targetWorkPackageId',
  idleProjects: 'idleWorkPackages',
};
/** A constructed current-epoch control projected from genuine older bytes, not a released13/14 capture. */
function renamed(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(renamed);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => [spellings[key] ?? key, renamed(field)]),
  );
}
function control(entry: (typeof expected)[number]) {
  const path = new URL(
    '../../../../../../openspec/changes/wbs-work-packages/fixtures/' + entry.original,
    import.meta.url,
  );
  const bytes = readFileSync(path, 'utf8');
  expect(hash(bytes)).toBe(entry.sha256);
  const body = renamed(JSON.parse(bytes)) as {
    document: { version: number };
    workPackage: { ownerId: string };
    connected?: { placement: { kind: string; stages?: { boundary: { version: number } }[] } };
  };
  body.document.version = entry.version;
  for (const stage of body.connected?.placement.stages ?? []) stage.boundary.version = 2;
  return { body, bytes, path };
}
for (const entry of expected) {
  test(
    'frozen document' +
      String(entry.version) +
      ' preserves the complete pre-extraction descriptor and current export',
    () => {
      const frozen = entry.build();
      expect(hash(JSON.stringify(frozen.json))).toBe(entry.descriptor);
      expect(frozen.json).toEqual(entry.current.json);
    },
  );
  test(
    'frozen document' +
      String(entry.version) +
      ' accepts constructed current control without changing genuine older bytes',
    () => {
      const { body, bytes, path } = control(entry);
      expect(entry.build().allows(body)).toBe(true);
      expect(entry.current.allows(body)).toBe(true);
      expect(readFileSync(path, 'utf8')).toBe(bytes);
    },
  );
  test(
    'frozen document' +
      String(entry.version) +
      ' keeps required owner, version and known nested types with additive responses',
    () => {
      const { body } = control(entry);
      const frozen = entry.build();
      const missing = structuredClone(body);
      Reflect.deleteProperty(missing.workPackage, 'ownerId');
      expect(frozen.allows(missing)).toBe(false);
      expect(frozen.allows({ ...body, document: { ...body.document, version: 16 } })).toBe(false);
      expect(frozen.allows({ ...body, workPackage: { ...body.workPackage, ownerId: 42 } })).toBe(
        false,
      );
      const response = responseSchema(frozen).validator['~standard'].validate({
        ...body,
        futureMetadata: 'preserved',
      });
      if (response instanceof Promise) throw Error('unexpected asynchronous response schema');
      expect(response.issues).toBeUndefined();
    },
  );
}
