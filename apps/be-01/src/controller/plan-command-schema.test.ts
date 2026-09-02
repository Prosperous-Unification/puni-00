import { describe, expect, it } from 'bun:test';

import { PLAN_COMMAND_KINDS, type PlanCommandKind } from '../service/plan-command';
import { documentComplaint, PLAN_COMMANDS_BODY } from './plan-command-schema';

/** The document's variants, as the body carries them. */
const variantsOf = (): { title?: unknown }[] => {
  const commands = (PLAN_COMMANDS_BODY as { properties: { commands: unknown } }).properties
    .commands;
  const { oneOf } = (commands as { items: { oneOf: { title?: unknown }[] } }).items;
  return oneOf;
};

/**
 * The rule that keeps mcp-01's command vocabulary honest.
 *
 * A kind the document does not describe is a kind no model is ever told about,
 * because the tool's whole description is this schema. The check ran at module
 * load as `VARIANTS.length !== PLAN_COMMAND_KINDS.length` until 2026-09-02,
 * which is why the shape of these cases is what it is: each injects a fault
 * that leaves the **totals equal**.
 */
describe('the commands document against the kinds the API parses', () => {
  it('has nothing to complain about, for what ships', () => {
    // The production pair, so every case below is measured against a rule that
    // is true of the real document rather than of a fixture.
    expect(documentComplaint(variantsOf(), PLAN_COMMAND_KINDS)).toBeNull();
    expect(variantsOf()).toHaveLength(PLAN_COMMAND_KINDS.length);
  });

  it('names a kind described twice while another is described never', () => {
    // Proof: `documentComplaint`'s body replaced with the length comparison it
    // had until 2026-09-02, this failed on `expect(received).toContain(expected)
    // · Expected: "undescribed: setEstimate" · Received: "(silence)"` — 36
    // variants, 36 kinds, and `setEstimate` shipping with no sentence at all.
    // Watched 2026-09-02, together with the case below.
    const faulted = variantsOf().map((variant) =>
      variant.title === 'setEstimate' ? { ...variant, title: 'clearEstimate' } : variant,
    );

    // `?? '(silence)'`, so a rule that answers `null` fails on what it said
    // rather than on `toContain` being handed a null.
    const complaint = documentComplaint(faulted, PLAN_COMMAND_KINDS) ?? '(silence)';

    expect(complaint).toContain('undescribed: setEstimate');
    expect(complaint).toContain('described twice: clearEstimate');
  });

  it('names a variant for a kind the API does not have', () => {
    // The other way the totals stay equal: a sentence about a command nobody
    // can send, and one real command left undescribed. A model handed this
    // document would call `renameWorkItem` and be refused `unknown_kind`.
    const faulted = variantsOf().map((variant) =>
      variant.title === 'moveWorkItem' ? { ...variant, title: 'renameWorkItem' } : variant,
    );

    const complaint = documentComplaint(faulted, PLAN_COMMAND_KINDS) ?? '(silence)';

    expect(complaint).toContain('undescribed: moveWorkItem');
    expect(complaint).toContain('not a command kind: renameWorkItem');
  });

  it('says nothing about an order the document happens to be in', () => {
    // Deliberately not a check: the variants are written in the union's order
    // for a reader's sake, and asserting it would make reordering one sentence
    // a failing build with nothing wrong.
    const shuffled = [...variantsOf()].reverse();

    expect(documentComplaint(shuffled, PLAN_COMMAND_KINDS)).toBeNull();
  });

  it('enumerates every kind exactly once', () => {
    // `PLAN_COMMAND_KINDS` is `Object.keys` of a record checked against the
    // union, so a duplicate is impossible to write — this says so out loud
    // rather than leaving the reader to infer it from the derivation.
    const seen = new Set<PlanCommandKind>(PLAN_COMMAND_KINDS);

    expect(seen.size).toBe(PLAN_COMMAND_KINDS.length);
  });
});
