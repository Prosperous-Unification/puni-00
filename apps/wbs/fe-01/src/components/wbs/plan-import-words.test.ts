import { describe, expect, it } from 'vitest';

import {
  PlanDocumentSchemaError,
  PlanImportRefusalError,
  type PlanImportSummary,
} from '@/lib/wbs-api';

import {
  distinctImportName,
  importRefusalSentence,
  importSummarySentence,
} from './plan-import-words';

const ON_15_OCT = new Date(2026, 9, 15, 10, 30);

const NOTHING_CREATED: PlanImportSummary['created'] = {
  teams: [],
  people: [],
  tags: [],
  services: [],
  types: [],
  externalSystems: [],
};

const summary = (overrides: Partial<PlanImportSummary> = {}): PlanImportSummary => ({
  workPackageId: 'p3',
  rows: 19,
  created: NOTHING_CREATED,
  solutionRef: 'none',
  ...overrides,
});

/** Anything a reader should never see in a toast: a wire code, or a code in parentheses. */
const INTERNAL = /[a-z]+_[a-z_]+|\([a-z_]+\)/;

describe('distinctImportName', () => {
  it('keeps a name nobody in the account uses', () => {
    expect(distinctImportName('Review fixture', ['Paint the fence'], ON_15_OCT)).toBe(
      'Review fixture',
    );
  });

  it('dates a name the account already uses, ignoring case and outer spaces', () => {
    expect(distinctImportName('Review fixture', [' review FIXTURE '], ON_15_OCT)).toBe(
      'Review fixture (imported 15 Oct)',
    );
  });

  it('counts on from the dated name when that is taken too', () => {
    expect(
      distinctImportName(
        'Review fixture',
        [
          'Review fixture',
          'Review fixture (imported 15 Oct)',
          'Review fixture (imported 15 Oct, 2)',
        ],
        ON_15_OCT,
      ),
    ).toBe('Review fixture (imported 15 Oct, 3)');
  });

  it('re-dates an imported copy rather than stacking a second suffix', () => {
    expect(
      distinctImportName(
        'Review fixture (imported 14 Oct)',
        ['Review fixture', 'Review fixture (imported 14 Oct)'],
        ON_15_OCT,
      ),
    ).toBe('Review fixture (imported 15 Oct)');
  });
});

describe('importSummarySentence', () => {
  it('names the work package and says nothing about an absent solution link', () => {
    const sentence = importSummarySentence(summary(), 'Review fixture (imported 15 Oct)');
    expect(sentence).toBe('Imported “Review fixture (imported 15 Oct)” with 19 work items.');
    // Proof: the old sentence `Imported 19 work items. Created no directory
    // names. Solution reference: none.` failed this on `Solution reference`.
    // Observed 2026-10-15.
    expect(sentence).not.toMatch(/Solution reference|directory names/);
  });

  it('lists what it added to the directory, and one work item in the singular', () => {
    expect(
      importSummarySentence(
        summary({
          rows: 1,
          created: { ...NOTHING_CREATED, tags: ['Needs review'], people: ['Ada', 'Bo'] },
        }),
        'Shed',
      ),
    ).toBe('Imported “Shed” with 1 work item. Added 2 people (Ada, Bo) and 1 tag (Needs review).');
  });

  it('says what happened to a solution link the file carried', () => {
    expect(importSummarySentence(summary({ solutionRef: 'kept' }), 'Shed')).toBe(
      'Imported “Shed” with 19 work items. It keeps its solution link.',
    );
    expect(importSummarySentence(summary({ solutionRef: 'left-off' }), 'Shed')).toBe(
      'Imported “Shed” with 19 work items. Its solution link was left off: another work package already has it.',
    );
  });
});

describe('importRefusalSentence', () => {
  it('asks for a project when the import destination is missing', () => {
    expect(importRefusalSentence(new PlanImportRefusalError({ error: 'project_required' }))).toBe(
      'Choose a project before importing a plan.',
    );
  });

  it('asks for another project when the import destination is unavailable', () => {
    expect(importRefusalSentence(new PlanImportRefusalError({ error: 'not_found' }))).toBe(
      'That project is no longer available. Choose another project before importing.',
    );
  });

  it('words an invalid import envelope without claiming its file was malformed', () => {
    expect(importRefusalSentence(new PlanImportRefusalError({ error: 'invalid_body' }))).toBe(
      'The import request could not be read. Reload the page and try again.',
    );
  });

  it('words the server invalid JSON refusal', () => {
    expect(importRefusalSentence(new PlanImportRefusalError({ error: 'invalid_json' }))).toBe(
      'This file is not JSON.',
    );
  });

  it('says a file that is not JSON is not JSON', () => {
    // Proof: the old `Plan JSON import failed (invalid_json).` failed this.
    // Observed 2026-10-15.
    expect(importRefusalSentence(new Error('invalid_json'))).toBe('This file is not JSON.');
  });

  it('says JSON that is not a plan export is not one', () => {
    expect(
      importRefusalSentence(
        new PlanDocumentSchemaError('document', 'must be an object (was an array)'),
      ),
    ).toBe('This JSON is not a plan export.');
    expect(
      importRefusalSentence(new PlanDocumentSchemaError('document.format', 'must be "wbs-plan"')),
    ).toBe('This JSON is not a plan export.');
  });

  it('points at a value inside a plan export in the file’s own words', () => {
    expect(
      importRefusalSentence(
        new PlanDocumentSchemaError(
          'workItems[0].priority',
          'workItems[0].priority must be a number or null (was a string)',
        ),
      ),
    ).toBe(
      'This plan export has a value the app cannot read: workItems[0].priority must be a number or null (was a string).',
    );
  });

  it('words a refusal and keeps where in the file it is', () => {
    expect(
      importRefusalSentence(
        new PlanImportRefusalError({
          error: 'unknown_ref',
          path: 'workItems[12].dependsOn[0]',
          detail: 'missing work item file-row-9',
        }),
      ),
    ).toBe(
      'This plan export refers to something it does not contain (workItems[12].dependsOn[0]: missing work item file-row-9).',
    );
  });

  it('explains dormant external dependency import without exposing the refusal code', () => {
    expect(
      importRefusalSentence(
        new PlanImportRefusalError({ error: 'external_dependencies_inactive', detail: null }),
      ),
    ).toBe(
      'This server does not accept dependencies between work packages yet, so nothing was imported.',
    );
  });

  it('gives every server refusal a sentence that names no code', () => {
    const codes = [
      'invalid_body',
      'invalid_typed_dependency',
      'unsupported_version',
      'unknown_ref',
      'cycle',
      'ancestor',
      'deadline_before_work_package_start',
      'work_item_takes_one_type',
      'engine_unavailable',
      'source_refused',
      'abbreviation_taken',
      'abbreviation_exhausted',
    ] as const;
    for (const error of codes) {
      const sentence = importRefusalSentence(
        new PlanImportRefusalError({ error, path: '', detail: null }),
      );
      expect(sentence, error).not.toMatch(INTERNAL);
      expect(sentence, error).toMatch(/\.$/);
    }
    const bare = [
      'unauthenticated',
      'invalid_origin',
      'insufficient_scope',
      'forbidden',
      'no_active_organization',
      'not_a_member',
      'organization_context_changed',
      'step_blockage_inactive',
    ] as const;
    for (const error of bare) {
      const sentence = importRefusalSentence(new PlanImportRefusalError({ error }));
      expect(sentence, error).not.toMatch(INTERNAL);
    }
  });

  it('names the organization limit with the refusal’s own numbers', () => {
    expect(
      importRefusalSentence(
        new PlanImportRefusalError({ error: 'agent_person_limit', cap: 8, current: 6, added: 3 }),
      ),
    ).toBe(
      'Organization limit: this plan would add 3 agent persons to the 6 of 8 the organization holds, so nothing was imported.',
    );
  });

  it('names the capacity cap with the refusal’s own numbers', () => {
    expect(
      importRefusalSentence(
        new PlanImportRefusalError({
          error: 'capacity_limit',
          resourceId: 'ram',
          cap: 64,
          declared: 48,
          asked: 32,
        }),
      ),
    ).toBe(
      'Organization limit: this plan would state 32 units of resource ram, which your other work packages already state 48 of, past the cap of 64, so nothing was imported.',
    );
  });

  it('falls back to a sentence that names nothing internal', () => {
    for (const message of [
      'http_502',
      'request_failed',
      'something_new',
      'imported_work_package_missing',
    ]) {
      const sentence = importRefusalSentence(new Error(message));
      expect(sentence, message).not.toMatch(INTERNAL);
      expect(sentence, message).not.toContain(message);
    }
    expect(importRefusalSentence('not even an error')).toBe(
      'The plan could not be imported. Try again.',
    );
  });
});

it('explains abbreviation exhaustion without treating it as a broken export', () => {
  expect(
    importRefusalSentence(
      new PlanImportRefusalError({
        error: 'abbreviation_exhausted',
        path: 'work_package',
        detail: null,
      }),
    ),
  ).toContain('available abbreviation');
});

it('explains incompatible inherited budget factor without exposing settings values', () => {
  const sentence = importRefusalSentence(
    new PlanImportRefusalError({ error: 'import_settings_conflict', key: 'budgetFactor' }),
  );
  expect(sentence).toBe(
    'This plan uses a different budget factor from the selected project. Choose a compatible project before importing.',
  );
  expect(sentence).not.toMatch(INTERNAL);
  expect(sentence).not.toContain('budgetFactor');
});

it('bulk estimate import refusal explains an unavailable step without internal codes', () => {
  const sentence=importRefusalSentence(new PlanImportRefusalError({error:'unknown_step',path:'workItems[0].estimates[0]',detail:null}));
  expect(sentence).toBe('A step used by this plan is no longer available, so nothing was imported (workItems[0].estimates[0]).');
  expect(sentence).not.toContain('unknown_step');
});

it('bulk estimate import refusal explains leaf applicability without internal codes', () => {
  const sentence=importRefusalSentence(new PlanImportRefusalError({error:'step_not_resolved',path:'workItems[0].estimates[0]',detail:null}));
  expect(sentence).toBe('An estimate uses a step that does not apply to its work item, so nothing was imported (workItems[0].estimates[0]).');
  expect(sentence).not.toContain('step_not_resolved');
});

it('bulk estimate import refusal explains type conflict without internal codes', () => {
  const sentence=importRefusalSentence(new PlanImportRefusalError({error:'type_conflict',path:'workItems[0].estimates[0]',detail:null}));
  expect(sentence).toBe('This plan would leave a work item with conflicting types, so nothing was imported (workItems[0].estimates[0]).');
  expect(sentence).not.toContain('type_conflict');
});
