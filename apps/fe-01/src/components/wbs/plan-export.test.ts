import { describe, expect, it } from 'vitest';

import {
  type ExportRow,
  type PlanExport,
  planFileName,
  planToCsv,
  planToMarkdown,
} from './plan-export';

/**
 * An RFC 4180 reader with no leniency in it, written here rather than imported.
 *
 * The point of writing it in the test is that it knows nothing about the writer
 * it is checking: it doubles quotes back, treats CRLF and only CRLF as the
 * record separator, and keeps everything else — a bare LF included — as data.
 * A writer that ends its lines with `\n`, or that fails to double a quote,
 * produces something this reads as a different table, which is what makes the
 * round-trip assertions below able to fail.
 */
function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let at = 0;
  while (at < text.length) {
    const char = text.slice(at, at + 1);
    if (quoted) {
      if (char === '"') {
        if (text.slice(at + 1, at + 2) === '"') {
          field += '"';
          at += 2;
          continue;
        }
        quoted = false;
        at += 1;
        continue;
      }
      field += char;
      at += 1;
      continue;
    }
    if (char === '"') {
      quoted = true;
      at += 1;
      continue;
    }
    if (char === ',') {
      record.push(field);
      field = '';
      at += 1;
      continue;
    }
    if (char === '\r' && text.slice(at + 1, at + 2) === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      at += 2;
      continue;
    }
    field += char;
    at += 1;
  }
  record.push(field);
  records.push(record);
  return records;
}

const DEV = { id: 'role-dev', name: 'Dev' };
const QA = { id: 'role-qa', name: 'QA' };

const row = (over: Partial<ExportRow> & Pick<ExportRow, 'id' | 'number'>): ExportRow => ({
  name: '',
  notes: '',
  rolledUp: false,
  serviceTeamId: null,
  estimates: {},
  finalDays: {},
  finalTotal: 0,
  dependsOn: [],
  startNoEarlierThan: null,
  dates: null,
  schedule: { earliestStart: 0, earliestFinish: 0, float: 0, critical: false },
  assignees: {},
  doesEveryPhase: null,
  ...over,
});

const plan = (over: Partial<PlanExport> = {}): PlanExport => ({
  projectName: 'Rewire the shed',
  generatedAt: '2026-08-07T09:15:00.000Z',
  method: 'pert',
  startDate: null,
  scheduleError: null,
  roles: [DEV, QA],
  teams: [{ id: 'team-billing', name: 'Billing, Ltd' }],
  people: [
    { id: 'person-ada', name: 'ada' },
    { id: 'person-bo', name: 'Bo "Boss"' },
  ],
  rows: [],
  ...over,
});

/** The cells of the first data row of a CSV, past the header block. */
function csvDataRow(text: string, at = 0): string[] {
  const records = parseCsv(text);
  const blank = records.findIndex((record) => record.length === 1 && record[0] === '');
  return records[blank + 2 + at] ?? [];
}

/** The column headers of a CSV, which are the record after the blank one. */
function csvColumns(text: string): string[] {
  return csvDataRow(text, -1);
}

/** The cells of one Markdown table row, by the number in its first column. */
function markdownRow(text: string, number: string): string[] {
  const line = text.split('\n').find((each) => each.startsWith(`| ${number} |`));
  if (line === undefined) throw new Error(`no row ${number} in\n${text}`);
  return line
    .slice(1, -1)
    .split(' | ')
    .map((cell) => cell.trim());
}

describe('the header block', () => {
  it('leads the Markdown with the project, the method by name and the timestamp', () => {
    const text = planToMarkdown(plan());
    const [first] = text.split('\n');
    expect(first).toBe('**Project:** Rewire the shed');
    expect(text).toContain('**Final figures:** PERT');
    expect(text).toContain('**Generated:** 2026-08-07T09:15:00.000Z');
    // Above the table, not below it: the block ends at the first table row.
    expect(text.indexOf('**Generated:**')).toBeLessThan(text.indexOf('| Number |'));
  });

  it('names every other method as the project named it', () => {
    expect(planToMarkdown(plan({ method: 'realistic' }))).toContain('**Final figures:** realistic');
    expect(planToMarkdown(plan({ method: 'pessimistic' }))).toContain(
      '**Final figures:** pessimistic',
    );
  });

  it('says the figures are unrounded and that an empty cell is not a zero', () => {
    const text = planToMarkdown(plan());
    expect(text).toContain('unrounded');
    expect(text).toContain('never zero');
  });

  it('leads the CSV with key,value rows, then a blank row, then the columns', () => {
    const records = parseCsv(planToCsv(plan()));
    expect(records[0]).toEqual(['Project', 'Rewire the shed']);
    expect(records[1]).toEqual(['Final figures', 'PERT']);
    const blank = records.findIndex((record) => record.length === 1 && record[0] === '');
    expect(blank).toBeGreaterThan(1);
    expect(records[blank + 1]?.[0]).toBe('Number');
  });

  it('says a plan is not on a calendar, and labels its schedule in days', () => {
    const text = planToMarkdown(
      plan({
        startDate: null,
        rows: [
          row({
            id: 'a',
            number: '010',
            schedule: { earliestStart: 2, earliestFinish: 5, float: 1, critical: false },
          }),
        ],
      }),
    );
    expect(text).toContain('**Start date:** not on a calendar');
    expect(markdownRow(text, '010')).toContain('day 2');
    expect(markdownRow(text, '010')).toContain('day 5');
  });

  it('says the dates skip weekends when the plan is on a calendar', () => {
    const text = planToMarkdown(
      plan({
        startDate: '2026-09-01',
        rows: [
          row({
            id: 'a',
            number: '010',
            dates: { startsOn: '2026-09-01', endsOn: '2026-09-03' },
            schedule: { earliestStart: 0, earliestFinish: 2, float: 0, critical: true },
          }),
        ],
      }),
    );
    expect(text).toContain('**Start date:** 2026-09-01');
    expect(text).toContain('dates skip weekends');
    const cells = markdownRow(text, '010');
    expect(cells).toContain('2026-09-01');
    expect(cells).toContain('2026-09-03');
    expect(cells).not.toContain('day 0');
  });

  it('says so when a cycle left the plan with no schedule at all', () => {
    const text = planToMarkdown(
      plan({
        scheduleError: 'cycle',
        rows: [row({ id: 'a', number: '010' })],
      }),
    );
    expect(text).toContain('run in a circle');
    // Not `day 0` for every row, which reads as "everything happens at once".
    expect(markdownRow(text, '010')).not.toContain('day 0');
    expect(markdownRow(text, '010')).toContain('—');
  });
});

describe('the columns', () => {
  it('labels each role final with the method that produced it', () => {
    expect(csvColumns(planToCsv(plan()))).toEqual([
      'Number',
      'Name',
      'Team',
      'Dev optimistic',
      'Dev realistic',
      'Dev pessimistic',
      'Dev final (PERT)',
      'Dev by',
      'QA optimistic',
      'QA realistic',
      'QA pessimistic',
      'QA final (PERT)',
      'QA by',
      'Total days (PERT)',
      'Depends on',
      'Not before',
      'Starts',
      'Ends',
      'Slack',
      'Notes',
    ]);
    expect(csvColumns(planToCsv(plan({ method: 'optimistic' })))).toContain(
      'Dev final (optimistic)',
    );
  });

  it('carries the number as the only outline there is, indenting nothing', () => {
    const text = planToMarkdown(
      plan({
        rows: [
          row({ id: 'a', number: '010', name: 'Wiring' }),
          row({ id: 'b', number: '010.1', name: 'Sockets' }),
        ],
      }),
    );
    expect(markdownRow(text, '010.1')[0]).toBe('010.1');
    expect(markdownRow(text, '010.1')[1]).toBe('Sockets');
  });

  it('resolves the team to its name, and says so when the id names nobody', () => {
    const rows = [
      row({ id: 'a', number: '010', serviceTeamId: 'team-billing' }),
      row({ id: 'b', number: '020', serviceTeamId: 'team-gone' }),
      row({ id: 'c', number: '030' }),
    ];
    const cells = csvDataRow(planToCsv(plan({ rows })));
    expect(cells[2]).toBe('Billing, Ltd');
    expect(csvDataRow(planToCsv(plan({ rows })), 1)[2]).toBe('(unknown)');
    expect(csvDataRow(planToCsv(plan({ rows })), 2)[2]).toBe('');
  });

  it('resolves dependencies to numbers, comma-joined, dropping ones that have gone', () => {
    const rows = [
      row({ id: 'a', number: '010' }),
      row({ id: 'b', number: '020' }),
      row({ id: 'c', number: '030', dependsOn: ['a', 'gone', 'b'] }),
    ];
    const cells = csvDataRow(planToCsv(plan({ rows })), 2);
    expect(cells[14]).toBe('010, 020');
  });

  it('says who is assumed to do a phase nobody was assigned to', () => {
    const rows = [
      row({
        id: 'a',
        number: '010',
        assignees: { 'role-dev': 'person-ada' },
        doesEveryPhase: 'person-ada',
      }),
    ];
    const cells = csvDataRow(planToCsv(plan({ rows })));
    expect(cells[7]).toBe('ada');
    expect(cells[12]).toBe('ada (assumed — the only assignee does every phase)');
  });

  it('names an assignee nobody knows rather than printing an id', () => {
    const rows = [row({ id: 'a', number: '010', assignees: { 'role-dev': 'person-gone' } })];
    const cells = csvDataRow(planToCsv(plan({ rows })));
    expect(cells[7]).toBe('(unknown)');
    expect(cells[12]).toBe('');
  });

  it('marks a critical row rather than printing its slack', () => {
    const rows = [
      row({
        id: 'a',
        number: '010',
        schedule: { earliestStart: 0, earliestFinish: 3, float: 0, critical: true },
      }),
      row({
        id: 'b',
        number: '020',
        schedule: { earliestStart: 0, earliestFinish: 3, float: 2.5, critical: false },
      }),
    ];
    expect(csvDataRow(planToCsv(plan({ rows })))[18]).toBe('critical');
    expect(csvDataRow(planToCsv(plan({ rows })), 1)[18]).toBe('2.5');
  });
});

describe('raw against displayed', () => {
  it('exports a final figure unrounded, not the one-decimal figure on screen', () => {
    const rows = [
      row({
        id: 'a',
        number: '010',
        estimates: { 'role-dev': { optimistic: 2, realistic: 3, pessimistic: 8 } },
        finalDays: { 'role-dev': 22 / 6 },
        finalTotal: 22 / 6,
      }),
    ];
    const cells = csvDataRow(planToCsv(plan({ rows })));
    expect(cells[6]).toBe('3.6666666666666665');
    expect(cells[13]).toBe('3.6666666666666665');
    expect(markdownRow(planToMarkdown(plan({ rows })), '010')).toContain('3.6666666666666665');
  });

  it('leaves an unestimated leaf empty, never zero', () => {
    const rows = [row({ id: 'a', number: '010', name: 'Nobody has looked' })];
    const cells = csvDataRow(planToCsv(plan({ rows })));
    // Every estimate cell of the two roles, their finals, and the total.
    expect(cells.slice(3, 14)).toEqual(['', '', '', '', '', '', '', '', '', '', '']);
    // A zero here would read as "this takes no time" rather than "nobody has
    // looked", which is the whole of the raw-versus-displayed rule.
    expect(markdownRow(planToMarkdown(plan({ rows })), '010').slice(3, 14)).toEqual([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
  });

  it('leaves the roles a row was never estimated for empty while another carries a figure', () => {
    const rows = [
      row({
        id: 'a',
        number: '010',
        estimates: { 'role-dev': { optimistic: 1, realistic: 1, pessimistic: 1 } },
        finalDays: { 'role-dev': 1 },
        finalTotal: 1,
      }),
    ];
    const cells = csvDataRow(planToCsv(plan({ rows })));
    expect(cells.slice(3, 7)).toEqual(['1', '1', '1', '1']);
    expect(cells.slice(8, 12)).toEqual(['', '', '', '']);
    expect(cells[13]).toBe('1');
  });

  it('marks a rolled-up parent’s figures as sums, in Markdown only', () => {
    const rows = [
      row({
        id: 'a',
        number: '010',
        rolledUp: true,
        estimates: { 'role-dev': { optimistic: 4, realistic: 6, pessimistic: 16 } },
        finalDays: { 'role-dev': 7 },
        finalTotal: 7,
      }),
    ];
    expect(markdownRow(planToMarkdown(plan({ rows })), '010')).toContain('7 (sum)');
    expect(planToCsv(plan({ rows }))).not.toContain('(sum)');
    expect(csvDataRow(planToCsv(plan({ rows })))[6]).toBe('7');
  });
});

describe('hostile text', () => {
  const nasty = [
    row({
      id: 'a',
      number: '010',
      name: 'a,b',
      notes: 'say "hi"',
      serviceTeamId: 'team-billing',
    }),
    row({
      id: 'b',
      number: '020',
      name: 'multi\r\nline\nname',
      notes: 'first line\nsecond, line\nthird "line"',
    }),
    row({ id: 'c', number: '030', name: '=SUM(A1)', notes: '@echo' }),
    row({ id: 'd', number: '040', name: '+1 (555) 0100', notes: '-3 days' }),
  ];

  it('round-trips every field through a reader that knows only RFC 4180', () => {
    const records = parseCsv(planToCsv(plan({ rows: nasty })));
    expect(csvDataRow(planToCsv(plan({ rows: nasty })), 0)[1]).toBe('a,b');
    expect(csvDataRow(planToCsv(plan({ rows: nasty })), 0)[19]).toBe('say "hi"');
    expect(csvDataRow(planToCsv(plan({ rows: nasty })), 1)[1]).toBe('multi\r\nline\nname');
    expect(csvDataRow(planToCsv(plan({ rows: nasty })), 1)[19]).toBe(
      'first line\nsecond, line\nthird "line"',
    );
    // Every record has the same width — a field that broke out of its quotes
    // would show up here as a short or a long one.
    const widths = new Set(records.slice(-4).map((record) => record.length));
    expect([...widths]).toEqual([20]);
  });

  it('separates records with CRLF, per RFC 4180', () => {
    const text = planToCsv(plan({ rows: [row({ id: 'a', number: '010' })] }));
    expect(text).toContain('\r\n');
    expect(text.split('\r\n').length).toBeGreaterThan(6);
    // No bare LF outside a quoted field: every line ending is the pair.
    expect(text.replaceAll('\r\n', '')).not.toContain('\n');
  });

  it('prefixes a field a spreadsheet would run as a formula', () => {
    const csv = planToCsv(plan({ rows: nasty }));
    expect(csvDataRow(csv, 2)[1]).toBe("'=SUM(A1)");
    expect(csvDataRow(csv, 2)[19]).toBe("'@echo");
    expect(csvDataRow(csv, 3)[1]).toBe("'+1 (555) 0100");
    expect(csvDataRow(csv, 3)[19]).toBe("'-3 days");
  });

  it('guards the header block too — a project name is a field like any other', () => {
    const csv = planToCsv(plan({ projectName: '=cmd|"/c calc"' }));
    expect(parseCsv(csv)[0]?.[1]).toBe('\'=cmd|"/c calc"');
  });

  it('keeps a Markdown table one row per work item, whatever is typed into it', () => {
    const text = planToMarkdown(plan({ rows: nasty }));
    // A pipe would open a column nobody asked for, and a newline would end the
    // row halfway through it.
    expect(markdownRow(text, '020')[1]).toBe('multi line name');
    const columns = markdownRow(text, '010').length;
    expect(markdownRow(text, '020')).toHaveLength(columns);
    expect(
      planToMarkdown(plan({ rows: [row({ id: 'a', number: '010', name: 'a|b' })] })).split('\n'),
    ).toContainEqual(expect.stringContaining('a\\|b'));
  });

  it('keeps the note’s Markdown source as it was written', () => {
    const text = planToMarkdown(
      plan({ rows: [row({ id: 'a', number: '010', notes: '**bold** and `code`' })] }),
    );
    expect(markdownRow(text, '010')).toContain('**bold** and `code`');
  });
});

describe('planFileName', () => {
  it('slugifies the project and dates the file by the timestamp it was given', () => {
    expect(planFileName(plan())).toBe('rewire-the-shed-2026-08-07.csv');
    expect(planFileName(plan({ projectName: 'Rewire  the Shed!! / v2' }))).toBe(
      'rewire-the-shed-v2-2026-08-07.csv',
    );
  });

  it('falls back to a name a file system can hold', () => {
    expect(planFileName(plan({ projectName: '???' }))).toBe('plan-2026-08-07.csv');
  });
});
