import * as filesystem from 'node:fs';

import { expect, spyOn, test } from 'bun:test';

import { initialHandoffFixture } from '../fixtures/initial-handoff';
import { envLayout } from './env';
import {
  captureInitialHandoffArtifacts,
  isInitialHandoffCleanupUnknown,
} from './initial-handoff-graph';

for (const fault of ['publication-only', 'activation-only', 'coherent-substitution'] as const)
  test(`raw initial boundary refuses ${fault} layouts before opening files`, async () => {
    const fixture = await initialHandoffFixture();
    const request = structuredClone(fixture.artifactRequest);
    const canonical = [structuredClone(envLayout('prod')), structuredClone(envLayout('dev'))];
    const publication = JSON.parse(request.owner) as { plan: { layouts: typeof canonical } };
    publication.plan.layouts = structuredClone(canonical);
    request.activation.owner.layouts = structuredClone(canonical);
    if (fault !== 'activation-only') publication.plan.layouts = structuredClone(fixture.layouts);
    if (fault !== 'publication-only')
      request.activation.owner.layouts = structuredClone(fixture.layouts);
    request.owner = JSON.stringify(publication) + '\n';
    const capture = captureInitialHandoffArtifacts;
    const open = filesystem.openSync;
    let capturing = false;
    let openedFiles = 0;
    const opening = spyOn(filesystem, 'openSync').mockImplementation(
      (...args: Parameters<typeof open>) => {
        if (capturing) openedFiles++;
        return open(...args);
      },
    );
    let failure: unknown;
    try {
      let observation: ReturnType<typeof capture>;
      capturing = true;
      try {
        // This test sends intentionally malformed raw values through the decoder boundary.
        observation = capture(request as Parameters<typeof capture>[0], performance.now() + 60000);
      } finally {
        capturing = false;
      }
      observation.closeFiles();
    } catch (cause) {
      failure = cause;
    } finally {
      capturing = false;
      opening.mockRestore();
    }
    expect(isInitialHandoffCleanupUnknown(failure)).toBe(false);
    // Proof: omitting raw owner-plan equality admitted publication-only with four raw opens.
    // Proof: omitting canonical equality changed coherent-substitution to the later owner-plan refusal.
    expect({
      message: failure instanceof Error ? failure.message : undefined,
      openedFiles,
    }).toEqual({
      message:
        fault === 'publication-only'
          ? 'managed cohort initial raw owner plan changed or was not excluded'
          : 'managed cohort complete dependency activation canonical layouts changed or was not excluded',
      openedFiles: 0,
    });
    expect(failure).toBeInstanceOf(Error);
  });
