import { describe, expect, it } from 'bun:test';

import {
  assertMigrationFlag,
  assertStopTheWorldNotImplemented,
  hasNewMigrations,
} from './migrations';

describe('hasNewMigrations', () => {
  it('is true when the head tree has a migration the deployed sha lacks', () => {
    expect(hasNewMigrations(['0001_init'], ['0001_init', '0002_add_col'])).toBe(true);
  });

  it('is false when the migration sets match', () => {
    expect(hasNewMigrations(['0001_init'], ['0001_init'])).toBe(false);
  });

  it('is false on a first-ever deploy with no baseline', () => {
    expect(hasNewMigrations(null, ['0001_init'])).toBe(false);
  });
});

describe('assertMigrationFlag', () => {
  it('passes when there are no new migrations', () => {
    expect(() => {
      assertMigrationFlag(false, false);
    }).not.toThrow();
  });

  it('throws when migrations exist and the flag is not given', () => {
    expect(() => {
      assertMigrationFlag(true, false);
    }).toThrow(/--with-migrations/);
  });

  it('does not suggest --stop-the-world as a remedy', () => {
    try {
      assertMigrationFlag(true, false);
      throw new Error('expected assertMigrationFlag to throw');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      expect(message).not.toMatch(/--stop-the-world for a/);
    }
  });

  it('passes when --with-migrations is given', () => {
    expect(() => {
      assertMigrationFlag(true, true);
    }).not.toThrow();
  });
});

describe('assertStopTheWorldNotImplemented', () => {
  it('passes when the flag is not given', () => {
    expect(() => {
      assertStopTheWorldNotImplemented(false);
    }).not.toThrow();
  });

  it('throws when the flag is given, naming what to do instead', () => {
    let message = '';
    try {
      assertStopTheWorldNotImplemented(true);
    } catch (e: unknown) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toMatch(/not implemented/);
    expect(message).toMatch(/--with-migrations/);
    expect(message).toMatch(/manually/);
  });
});
