import { describe, expect, it } from 'bun:test';

import {
  parseProjectAbbreviation,
  parseWorkItemAddress,
  suggestProjectAbbreviations,
} from './project-address';

describe('parseProjectAbbreviation', () => {
  it('accepts one and twenty character manual abbreviations', () => {
    expect(parseProjectAbbreviation('a')).toEqual({ ok: true, abbreviation: 'A' });
    expect(parseProjectAbbreviation('abcdefghijklmnopqrst')).toEqual({
      ok: true,
      abbreviation: 'ABCDEFGHIJKLMNOPQRST',
    });
    expect(parseProjectAbbreviation('puni-core_01')).toEqual({
      ok: true,
      abbreviation: 'PUNI-CORE_01',
    });
  });

  it('rejects empty and twenty-one character abbreviations', () => {
    for (const abbreviation of ['', 'ABCDEFGHIJKLMNOPQRSTU']) {
      expect(parseProjectAbbreviation(abbreviation)).toEqual({
        ok: false,
        reason: 'invalid_abbreviation',
      });
    }
  });

  it('rejects leading digits hyphens and underscores', () => {
    for (const abbreviation of ['1PUNI', '-PUNI', '_PUNI']) {
      expect(parseProjectAbbreviation(abbreviation)).toEqual({
        ok: false,
        reason: 'invalid_abbreviation',
      });
    }
  });

  it('rejects dots whitespace and non-ASCII characters before normalization', () => {
    for (const abbreviation of ['P.UNI', ' PUNI', 'PUNI ', 'PUNI\n', 'PÜNI', 'punı', 'ſ', 'ß']) {
      expect(parseProjectAbbreviation(abbreviation)).toEqual({
        ok: false,
        reason: 'invalid_abbreviation',
      });
    }
  });
});

describe('suggestProjectAbbreviations', () => {
  it('suggests deterministic name-based prefixes', () => {
    expect(suggestProjectAbbreviations('Puni Core')).toEqual(['PUN', 'PUNI', 'PUNIC']);
    expect(suggestProjectAbbreviations('puni-core')).toEqual(['PUN', 'PUNI', 'PUNIC']);
  });

  it('suggests only three to five ASCII letters', () => {
    for (const name of ['A', 'ab', '', '123_---', 'Проєкт', 'ıſß', 'Püni 2026']) {
      const suggestions = suggestProjectAbbreviations(name);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(new Set(suggestions).size).toBe(suggestions.length);
      for (const abbreviation of suggestions) {
        expect(abbreviation).toMatch(/^[A-Z]{3,5}$/);
      }
    }
  });
});

describe('parseWorkItemAddress', () => {
  it('parses PUNI-CORE.080.39 and PUNI_CORE.020.s1-dev', () => {
    expect(parseWorkItemAddress('puni-core.080.39')).toEqual({
      kind: 'qualified',
      abbreviation: 'PUNI-CORE',
      reference: '080.39',
    });
    expect(parseWorkItemAddress('PUNI_CORE.020.s1-dev')).toEqual({
      kind: 'qualified',
      abbreviation: 'PUNI_CORE',
      reference: '020.s1-dev',
    });
    expect(parseWorkItemAddress('PUNI2.080.39.review')).toEqual({
      kind: 'qualified',
      abbreviation: 'PUNI2',
      reference: '080.39.review',
    });
  });

  it('keeps numeric numbers and 010.s1-dev local', () => {
    for (const reference of ['010', '080.39', '010.s1-dev', '020.2.review', '020.2.s02-review']) {
      expect(parseWorkItemAddress(reference)).toEqual({ kind: 'local', reference });
    }
  });

  it('rejects empty qualified endpoints', () => {
    for (const token of ['', 'PUNI', 'PUNI.', '.010', '.']) {
      expect(parseWorkItemAddress(token)).toEqual({ kind: 'invalid' });
    }
  });

  it('rejects malformed project prefixes', () => {
    for (const prefix of ['1PUNI', '-PUNI', '_PUNI', 'PÜNI', 'punı', 'ABCDEFGHIJKLMNOPQRSTU']) {
      expect(parseWorkItemAddress(`${prefix}.010`)).toEqual({ kind: 'invalid' });
    }
  });

  it('rejects malformed local and qualified references', () => {
    for (const reference of [
      '010.',
      '010..2',
      '010.Dev',
      '010.s0-dev',
      '010.s1-',
      '010.s2',
      '010\n',
      '010.s1-dev\n',
      '010.s1-dev\r\n',
      '010.dev ',
    ]) {
      expect(parseWorkItemAddress(reference)).toEqual({ kind: 'invalid' });
      expect(parseWorkItemAddress(`PUNI.${reference}`)).toEqual({ kind: 'invalid' });
    }
  });
});
