import { expect, test } from 'bun:test';
import ts from 'typescript';

import { fixture, limits, request, workspace } from './typescript.test.fixture';
import { extractTypeScriptRelationshipsFromSource } from './typescript-core';
import expected from './typescript-derivative.expected.json';
import { extractSerialRelationships } from './typescript-serial';
const expectObservation = (value: unknown) => expect(value);
test('selected and serial complete legacy output is unchanged and differs from derivative', () => {
  const selected = extractTypeScriptRelationshipsFromSource(
    workspace,
    request,
    fixture().source,
    limits,
    ts,
  );
  expectObservation(selected).toEqual(expected.legacy);
  expectObservation(extractSerialRelationships(workspace, request, fixture().source, ts)).toEqual(
    expected.legacy,
  );
  expect(selected.extractor).not.toEqual(expected.derivative.extractor);
});
