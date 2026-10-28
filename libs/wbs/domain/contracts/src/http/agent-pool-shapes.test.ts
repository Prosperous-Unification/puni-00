import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { agentPoolKeys } from './agent-pool-shapes';

/**
 * Twilight Dash reads the keys document with its own copy of the shape (its product boundary does
 * not reach `@wbs/contracts`). Its tests import this committed document; reading it here, as
 * bytes, pins the two shapes together without an import across the boundary.
 */
const DASH_FIXTURE = join(
  import.meta.dir,
  '../../../../../../apps/twilight-structure/twilight-dash/cli/src/mcp/testing/pool-keys.v1.json',
);

describe('agentPoolKeys', () => {
  test("accepts the document Twilight Dash's pool import is tested with", () => {
    const fixture: unknown = JSON.parse(readFileSync(DASH_FIXTURE, 'utf8'));
    // Proof: with `mcpResource` removed from the fixture this failed (2026-10-28).
    expect(agentPoolKeys.allows(fixture)).toBe(true);
  });
});
