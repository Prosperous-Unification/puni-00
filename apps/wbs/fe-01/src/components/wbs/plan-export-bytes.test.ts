import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { sliceView } from '@/testing/views';

import { type PlanExport, planToCsv, planToMarkdown } from './plan-export';
import { planToMermaid, planToMermaidDocument } from './plan-mermaid';

/** Fixed input captured before extracting the export model. */
const document: PlanExport = {
  workPackageName: 'A, "quoted" | plan',
  generatedAt: '2026-08-07T09:15:00.000Z',
  method: 'pert',
  startDate: '2026-09-01',
  scheduleError: null,
  steps: [{ id: 'dev', name: 'Dev' }],
  teams: [],
  tags: [],
  services: [],
  priorityBands: [],
  people: [],
  rows: [
    {
      id: 'a',
      parentId: null,
      number: '010',
      name: '=Strip: "pipes" | cables',
      notes: 'First line\n**second** ``` fenced',
      rolledUp: false,
      teamIds: [],
      tagIds: [],
      serviceIds: [],
      estimates: { dev: { optimistic: 1, realistic: 2, pessimistic: 3 } },
      finalDays: { dev: 2 },
      finalTotal: 2,
      dependsOn: [],
      startNoEarlierThan: null,
      startNoEarlierThanReason: null,
      deadline: null,
      status: 'unknown',
      factStart: null,
      factEnd: null,
      priority: null,
      maxParallel: 1,
      dates: { startsOn: '2026-09-01', endsOn: '2026-09-02' },
      schedule: { earliestStart: 0, earliestFinish: 2, float: 0, critical: true },
      assignees: {},
      doesEveryStep: null,
    },
  ],
  slices: [
    sliceView({
      id: 'slice-a',
      workItemId: 'a',
      stepId: 'dev',
      earliestStart: 0,
      earliestFinish: 2,
      duration: 2,
      effort: 2,
      width: 1,
      critical: true,
    }),
  ],
};

describe('fixed plan export documents', () => {
  it('changes only the explicit work-package headers and preserves every other byte', () => {
    const mermaid = planToMermaid(document);
    const bundled = planToMermaidDocument(document);
    if (!mermaid.drawn || !bundled.drawn) throw new Error('Fixed plan must produce diagrams');
    const csv = planToCsv(document);
    const markdown = planToMarkdown(document);
    const texts = [csv, markdown, mermaid.text, bundled.text];
    const fingerprints = texts.map((text) =>
      createHash('sha256').update(text, 'utf8').digest('hex'),
    );
    // Proof: appending LF to production CSV changed its hash and failed this test.
    // Proof: export-csv-one-lf-fault-v121 appended an actual LF in the production
    // writer; the current fingerprint failed, then both fingerprint sets passed restored.
    expect(fingerprints).toEqual([
      'cb3a1ff6cc3eeef8c44983e11597d7ba9ee534306a3a4301b8b1959acf78132d',
      '639003454a314b8786f13e33a6c1c1d0e2e0d0733614bc3ccd8e8b459a363ae7',
      '8d6d2ec64ff9c3601c6cd4a184cd5f1ffadb5e9faf17d3cb90b19de1e40f121a',
      '8db5a3a4d2bb6e288675853da189b3bb418368e3ca57352bf949409dc1e412f8',
    ]);
    const beforeRename = [
      csv.replace(/^Work package,/, 'Project,'),
      markdown.replace(/^\*\*Work package:\*\*/, '**Project:**'),
      mermaid.text,
      bundled.text.replace(/^\*\*Work package:\*\*/, '**Project:**'),
    ];
    expect(
      beforeRename.map((text) => createHash('sha256').update(text, 'utf8').digest('hex')),
    ).toEqual([
      '070768dfcba15195091fe1f1f8092fd978aae4715d2569dd73ce670eb02e5a57',
      '95fad110e5fe057eb5add3a1dd5e5fdcfe81a9a86d176875796aa4ffb85df124',
      '8d6d2ec64ff9c3601c6cd4a184cd5f1ffadb5e9faf17d3cb90b19de1e40f121a',
      'f1860846b1b9833d2c72c340f882616f910013143cdb86fcbb8e152650250685',
    ]);
  });
});
