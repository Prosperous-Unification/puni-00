import { describe, expect, it } from 'bun:test';

import { assertMigrationFlag, hasNewMigrations } from './migrations';

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
      assertMigrationFlag(false, false, false);
    }).not.toThrow();
  });

  it('throws when migrations exist and neither flag is given', () => {
    expect(() => {
      assertMigrationFlag(true, false, false);
    }).toThrow(/--with-migrations/);
  });

  it('passes when --with-migrations is given', () => {
    expect(() => {
      assertMigrationFlag(true, true, false);
    }).not.toThrow();
  });

  it('passes when --stop-the-world is given', () => {
    expect(() => {
      assertMigrationFlag(true, false, true);
    }).not.toThrow();
  });
});
