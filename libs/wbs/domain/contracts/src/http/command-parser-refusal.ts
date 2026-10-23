import { type } from 'arktype';

import { PLAN_COMMAND_KINDS, type PlanCommandKind } from '../commands/definitions';
import type { ParserRefusalCode } from './refusal';
import { responseSchema } from './schema-shape';

export const commandKindsType = type.enumerated(...PLAN_COMMAND_KINDS);
/**
 * Every parser refusal code once, held to {@link ParserRefusalCode} both ways by
 * `satisfies`: a code the type names and this list lacks, or the reverse, is
 * a compile error.
 */
const PARSER_CODES = {
  expected_object: true,
  number_is_derived: true,
  externalRefs_must_be_a_list: true,
  too_many_externalRefs: true,
  externalRefs_entry_needs_a_systemId: true,
  externalRefs_entry_needs_a_url: true,
  externalRefs_entry_name_is_not_text: true,
  externalRefs_entry_name_is_too_long: true,
  invalid_actual: true,
  invalid_measure: true,
  invalid_progress: true,
  invalid_outcome: true,
  at_must_be_an_instant: true,
  reference_must_be_text: true,
  note_must_be_text: true,
  executorPersonId_must_be_an_id: true,
  attemptNumber_must_be_a_whole_number_from_1: true,
  invalid_status: true,
  invalid_estimate: true,
  invalid_budget: true,
  rateCardDigest_must_be_1_to_128_characters: true,
  cannot_send_both_teamIds_and_serviceTeamId: true,
  unknown_kind: true,
  unknown_strategy: true,
  commands_must_be_a_list: true,
  size_required: true,
  bands_required: true,
  bands_must_be_an_array: true,
  bands_must_number_5: true,
  bands_must_be_objects: true,
  band_start_must_be_a_whole_number_from_1: true,
  band_default_must_be_a_whole_number_from_1: true,
  band_label_must_be_1_to_40_characters: true,
  band_labels_must_differ: true,
  first_band_must_start_at_1: true,
  bands_must_start_in_increasing_order: true,
  band_default_must_be_inside_its_own_band: true,
  parentId_must_be_id_or_null: true,
  afterId_must_be_id_or_null: true,
  personId_must_be_id_or_null: true,
  serviceTeamId_must_be_id_or_null: true,
  accountId_must_be_id_or_null: true,
  providerId_must_be_id_or_null: true,
  name_must_be_text: true,
  notes_must_be_text: true,
  kind_must_be_text: true,
  personKind_must_be_text: true,
  startNoEarlierThanReason_must_be_text: true,
  stepId_must_be_text: true,
  conflicting_step_address: true,
  invalid_step_node_id: true,
  unknown_step_node_encoding: true,
  invalid_typed_endpoint: true,
  type_must_be_text: true,
  dependencyId_must_be_text: true,
  metric_must_be_text: true,
  personId_must_be_an_id: true,
  workItemId_must_be_an_id: true,
  workItemRef_must_be_an_id: true,
  ref_must_be_an_id: true,
  parentRef_must_be_an_id: true,
  afterRef_must_be_an_id: true,
  personRef_must_be_an_id: true,
  predecessorId_must_be_an_id: true,
  predecessorRef_must_be_an_id: true,
  teamId_must_be_an_id: true,
  teamRef_must_be_an_id: true,
  tagId_must_be_an_id: true,
  tagRef_must_be_an_id: true,
  typeId_must_be_an_id: true,
  typeRef_must_be_an_id: true,
  serviceId_must_be_an_id: true,
  serviceRef_must_be_an_id: true,
  teamIds_must_be_a_list_of_ids: true,
  teamRefs_must_be_a_list_of_ids: true,
  tagIds_must_be_a_list_of_ids: true,
  tagRefs_must_be_a_list_of_ids: true,
  serviceIds_must_be_a_list_of_ids: true,
  serviceRefs_must_be_a_list_of_ids: true,
  typeIds_must_be_a_list_of_ids: true,
  typeRefs_must_be_a_list_of_ids: true,
  teamIds_must_be_at_most_10: true,
  teamRefs_must_be_at_most_10: true,
  serviceIds_must_be_at_most_10: true,
  serviceRefs_must_be_at_most_10: true,
  typeIds_must_be_at_most_10: true,
  typeRefs_must_be_at_most_10: true,
  work_item_takes_one_type: true,
  tagIds_must_be_at_most_50: true,
  tagRefs_must_be_at_most_50: true,
  startNoEarlierThan_must_be_a_date: true,
  deadline_must_be_a_date: true,
  on_must_be_a_date: true,
  factStart_must_be_a_date: true,
  factEnd_must_be_a_date: true,
  priority_must_be_a_whole_number_from_1: true,
  maxParallel_must_be_a_whole_number_from_1: true,
  size_must_be_a_whole_number_from_1: true,
  maxParallel_must_be_at_most_1000: true,
  size_must_be_at_most_1000: true,
  cascade_must_be_true_or_false: true,
  startNoEarlierThanReason_must_be_at_most_200_characters: true,
  allowancePercent_must_be_0_to_1000_with_two_decimals: true,
  runId_must_be_1_to_256_characters: true,
  parentClaim_must_be_an_id: true,
  steps_must_be_a_list_of_ids: true,
  steps_must_name_a_step: true,
  steps_must_be_at_most_50: true,
  resources_must_be_a_list: true,
  resources_must_name_a_resource: true,
  resources_must_be_at_most_50: true,
  resources_must_name_each_resource_once: true,
  kind_is_immutable: true,
  units_required: true,
  units_must_be_a_whole_number_from_0: true,
  units_must_be_a_whole_number_from_1: true,
  units_must_be_at_most_1000000000: true,
  unitLabel_must_be_at_most_40_characters: true,
  unitLabel_must_be_text: true,
  resourceId_must_be_an_id: true,
  resourceRef_must_be_an_id: true,
  resourceKind_must_be_exclusive_or_divisible: true,
  measureId_must_be_an_id: true,
  measureRef_must_be_an_id: true,
  key_must_be_a_measure_key: true,
  unit_must_be_text: true,
  unit_must_be_at_most_40_characters: true,
  measureKind_must_be_duration_count_or_money: true,
  scale_must_be_integer_or_real: true,
  threePoint_must_be_true_or_false: true,
  showByDefault_must_be_true_or_false: true,
  schedulesWork_must_be_true_or_false: true,
  order_must_be_a_whole_number_from_0_to_1000000: true,
  currency_must_be_three_capital_letters: true,
} satisfies Record<ParserRefusalCode, true>;

// `Object.keys` answers `string[]`; the object is closed by `satisfies` above.
const parserCodes = Object.keys(PARSER_CODES) as ParserRefusalCode[];

/** One parser refusal with its command context, per code: what the arms declared. */
type ParserArm = {
  [K in ParserRefusalCode]: { error: K; at: number; kind: PlanCommandKind };
}[ParserRefusalCode];
/** Validates the finite legacy parser vocabulary before any string becomes a wire refusal. */
// Proof: removing forbidden context fields admitted at:text,400 instead of500 in the mounted parser-refusal case.
//
// One object over the enumerated codes, not one arm per code: each arm carried
// the whole command-kind enumeration, and arktype's compile of 132 such arms
// held about 400 MB at boot, which put mcp-01 past its 512 Mi pod limit once
// slice 4 of `wbs-measure-budgets` added two kinds and two codes (design D47).
// Proof: with the 132 arms restored, `bounds the memory the contracts take to
// load` (contracts-boot-memory.test.ts) measured 684 MB against its 500 MB
// bound (370 MB with them collapsed); watched 2026-10-23.
export const commandParserRefusal = responseSchema(
  type.or(
    // `.as` restates the inferred type as the per-code union the arms had:
    // the runtime shape is exactly that union, and TypeScript only expands an
    // object with a union property into its variants up to 25 members, so
    // without it the 132-code object would not assign to `Refusal`.
    type({
      error: type.enumerated(...parserCodes),
      at: 'number',
      kind: commandKindsType,
    }).as<ParserArm>(),
    type({ error: "'expected_object'", 'at?': 'never', 'kind?': 'never' }),
    type({ error: "'commands_must_be_a_list'", 'at?': 'never', 'kind?': 'never' }),
    type({ error: "'invalid_estimate'", 'at?': 'never', 'kind?': 'never' }),
    type({ error: "'expected_object'", at: 'number', 'kind?': 'never' }),
    type({ error: "'unknown_kind'", at: 'number', 'kind?': 'never' }),
  ),
);
