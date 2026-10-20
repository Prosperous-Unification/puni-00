import { type Type, type } from 'arktype';

import { PLAN_COMMAND_KINDS } from '../commands/definitions';
import type { ParserRefusalCode } from './refusal';
import { responseSchema } from './schema-shape';

export const commandKindsType = type.enumerated(...PLAN_COMMAND_KINDS);
const parserArms = {
  expected_object: type({ error: "'expected_object'", at: 'number', kind: commandKindsType }),
  number_is_derived: type({ error: "'number_is_derived'", at: 'number', kind: commandKindsType }),
  externalRefs_must_be_a_list: type({
    error: "'externalRefs_must_be_a_list'",
    at: 'number',
    kind: commandKindsType,
  }),
  too_many_externalRefs: type({
    error: "'too_many_externalRefs'",
    at: 'number',
    kind: commandKindsType,
  }),
  externalRefs_entry_needs_a_systemId: type({
    error: "'externalRefs_entry_needs_a_systemId'",
    at: 'number',
    kind: commandKindsType,
  }),
  externalRefs_entry_needs_a_url: type({
    error: "'externalRefs_entry_needs_a_url'",
    at: 'number',
    kind: commandKindsType,
  }),
  externalRefs_entry_name_is_not_text: type({
    error: "'externalRefs_entry_name_is_not_text'",
    at: 'number',
    kind: commandKindsType,
  }),
  externalRefs_entry_name_is_too_long: type({
    error: "'externalRefs_entry_name_is_too_long'",
    at: 'number',
    kind: commandKindsType,
  }),
  invalid_actual: type({ error: "'invalid_actual'", at: 'number', kind: commandKindsType }),
  invalid_measure: type({ error: "'invalid_measure'", at: 'number', kind: commandKindsType }),
  invalid_progress: type({ error: "'invalid_progress'", at: 'number', kind: commandKindsType }),
  invalid_outcome: type({
    error: "'invalid_outcome'",
    at: 'number',
    kind: commandKindsType,
  }),
  at_must_be_an_instant: type({
    error: "'at_must_be_an_instant'",
    at: 'number',
    kind: commandKindsType,
  }),
  reference_must_be_text: type({
    error: "'reference_must_be_text'",
    at: 'number',
    kind: commandKindsType,
  }),
  note_must_be_text: type({
    error: "'note_must_be_text'",
    at: 'number',
    kind: commandKindsType,
  }),
  executorPersonId_must_be_an_id: type({
    error: "'executorPersonId_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  attemptNumber_must_be_a_whole_number_from_1: type({
    error: "'attemptNumber_must_be_a_whole_number_from_1'",
    at: 'number',
    kind: commandKindsType,
  }),
  invalid_status: type({ error: "'invalid_status'", at: 'number', kind: commandKindsType }),
  invalid_estimate: type({ error: "'invalid_estimate'", at: 'number', kind: commandKindsType }),
  cannot_send_both_teamIds_and_serviceTeamId: type({
    error: "'cannot_send_both_teamIds_and_serviceTeamId'",
    at: 'number',
    kind: commandKindsType,
  }),
  unknown_kind: type({ error: "'unknown_kind'", at: 'number', kind: commandKindsType }),
  unknown_strategy: type({ error: "'unknown_strategy'", at: 'number', kind: commandKindsType }),
  commands_must_be_a_list: type({
    error: "'commands_must_be_a_list'",
    at: 'number',
    kind: commandKindsType,
  }),
  size_required: type({ error: "'size_required'", at: 'number', kind: commandKindsType }),
  bands_required: type({ error: "'bands_required'", at: 'number', kind: commandKindsType }),
  bands_must_be_an_array: type({
    error: "'bands_must_be_an_array'",
    at: 'number',
    kind: commandKindsType,
  }),
  bands_must_number_5: type({
    error: "'bands_must_number_5'",
    at: 'number',
    kind: commandKindsType,
  }),
  bands_must_be_objects: type({
    error: "'bands_must_be_objects'",
    at: 'number',
    kind: commandKindsType,
  }),
  band_start_must_be_a_whole_number_from_1: type({
    error: "'band_start_must_be_a_whole_number_from_1'",
    at: 'number',
    kind: commandKindsType,
  }),
  band_default_must_be_a_whole_number_from_1: type({
    error: "'band_default_must_be_a_whole_number_from_1'",
    at: 'number',
    kind: commandKindsType,
  }),
  band_label_must_be_1_to_40_characters: type({
    error: "'band_label_must_be_1_to_40_characters'",
    at: 'number',
    kind: commandKindsType,
  }),
  band_labels_must_differ: type({
    error: "'band_labels_must_differ'",
    at: 'number',
    kind: commandKindsType,
  }),
  first_band_must_start_at_1: type({
    error: "'first_band_must_start_at_1'",
    at: 'number',
    kind: commandKindsType,
  }),
  bands_must_start_in_increasing_order: type({
    error: "'bands_must_start_in_increasing_order'",
    at: 'number',
    kind: commandKindsType,
  }),
  band_default_must_be_inside_its_own_band: type({
    error: "'band_default_must_be_inside_its_own_band'",
    at: 'number',
    kind: commandKindsType,
  }),
  parentId_must_be_id_or_null: type({
    error: "'parentId_must_be_id_or_null'",
    at: 'number',
    kind: commandKindsType,
  }),
  afterId_must_be_id_or_null: type({
    error: "'afterId_must_be_id_or_null'",
    at: 'number',
    kind: commandKindsType,
  }),
  personId_must_be_id_or_null: type({
    error: "'personId_must_be_id_or_null'",
    at: 'number',
    kind: commandKindsType,
  }),
  serviceTeamId_must_be_id_or_null: type({
    error: "'serviceTeamId_must_be_id_or_null'",
    at: 'number',
    kind: commandKindsType,
  }),
  accountId_must_be_id_or_null: type({
    error: "'accountId_must_be_id_or_null'",
    at: 'number',
    kind: commandKindsType,
  }),
  name_must_be_text: type({ error: "'name_must_be_text'", at: 'number', kind: commandKindsType }),
  notes_must_be_text: type({ error: "'notes_must_be_text'", at: 'number', kind: commandKindsType }),
  kind_must_be_text: type({ error: "'kind_must_be_text'", at: 'number', kind: commandKindsType }),
  startNoEarlierThanReason_must_be_text: type({
    error: "'startNoEarlierThanReason_must_be_text'",
    at: 'number',
    kind: commandKindsType,
  }),
  stepId_must_be_text: type({
    error: "'stepId_must_be_text'",
    at: 'number',
    kind: commandKindsType,
  }),
  conflicting_step_address: type({
    error: "'conflicting_step_address'",
    at: 'number',
    kind: commandKindsType,
  }),
  invalid_step_node_id: type({
    error: "'invalid_step_node_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  unknown_step_node_encoding: type({
    error: "'unknown_step_node_encoding'",
    at: 'number',
    kind: commandKindsType,
  }),
  invalid_typed_endpoint: type({
    error: "'invalid_typed_endpoint'",
    at: 'number',
    kind: commandKindsType,
  }),
  type_must_be_text: type({ error: "'type_must_be_text'", at: 'number', kind: commandKindsType }),
  dependencyId_must_be_text: type({
    error: "'dependencyId_must_be_text'",
    at: 'number',
    kind: commandKindsType,
  }),
  metric_must_be_text: type({
    error: "'metric_must_be_text'",
    at: 'number',
    kind: commandKindsType,
  }),
  personId_must_be_an_id: type({
    error: "'personId_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  workItemId_must_be_an_id: type({
    error: "'workItemId_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  workItemRef_must_be_an_id: type({
    error: "'workItemRef_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  ref_must_be_an_id: type({ error: "'ref_must_be_an_id'", at: 'number', kind: commandKindsType }),
  parentRef_must_be_an_id: type({
    error: "'parentRef_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  afterRef_must_be_an_id: type({
    error: "'afterRef_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  personRef_must_be_an_id: type({
    error: "'personRef_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  predecessorId_must_be_an_id: type({
    error: "'predecessorId_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  predecessorRef_must_be_an_id: type({
    error: "'predecessorRef_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  teamId_must_be_an_id: type({
    error: "'teamId_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  teamRef_must_be_an_id: type({
    error: "'teamRef_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  tagId_must_be_an_id: type({
    error: "'tagId_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  tagRef_must_be_an_id: type({
    error: "'tagRef_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  typeId_must_be_an_id: type({
    error: "'typeId_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  typeRef_must_be_an_id: type({
    error: "'typeRef_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  serviceId_must_be_an_id: type({
    error: "'serviceId_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  serviceRef_must_be_an_id: type({
    error: "'serviceRef_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  teamIds_must_be_a_list_of_ids: type({
    error: "'teamIds_must_be_a_list_of_ids'",
    at: 'number',
    kind: commandKindsType,
  }),
  teamRefs_must_be_a_list_of_ids: type({
    error: "'teamRefs_must_be_a_list_of_ids'",
    at: 'number',
    kind: commandKindsType,
  }),
  tagIds_must_be_a_list_of_ids: type({
    error: "'tagIds_must_be_a_list_of_ids'",
    at: 'number',
    kind: commandKindsType,
  }),
  tagRefs_must_be_a_list_of_ids: type({
    error: "'tagRefs_must_be_a_list_of_ids'",
    at: 'number',
    kind: commandKindsType,
  }),
  serviceIds_must_be_a_list_of_ids: type({
    error: "'serviceIds_must_be_a_list_of_ids'",
    at: 'number',
    kind: commandKindsType,
  }),
  serviceRefs_must_be_a_list_of_ids: type({
    error: "'serviceRefs_must_be_a_list_of_ids'",
    at: 'number',
    kind: commandKindsType,
  }),
  typeIds_must_be_a_list_of_ids: type({
    error: "'typeIds_must_be_a_list_of_ids'",
    at: 'number',
    kind: commandKindsType,
  }),
  typeRefs_must_be_a_list_of_ids: type({
    error: "'typeRefs_must_be_a_list_of_ids'",
    at: 'number',
    kind: commandKindsType,
  }),
  teamIds_must_be_at_most_10: type({
    error: "'teamIds_must_be_at_most_10'",
    at: 'number',
    kind: commandKindsType,
  }),
  teamRefs_must_be_at_most_10: type({
    error: "'teamRefs_must_be_at_most_10'",
    at: 'number',
    kind: commandKindsType,
  }),
  serviceIds_must_be_at_most_10: type({
    error: "'serviceIds_must_be_at_most_10'",
    at: 'number',
    kind: commandKindsType,
  }),
  serviceRefs_must_be_at_most_10: type({
    error: "'serviceRefs_must_be_at_most_10'",
    at: 'number',
    kind: commandKindsType,
  }),
  typeIds_must_be_at_most_10: type({
    error: "'typeIds_must_be_at_most_10'",
    at: 'number',
    kind: commandKindsType,
  }),
  typeRefs_must_be_at_most_10: type({
    error: "'typeRefs_must_be_at_most_10'",
    at: 'number',
    kind: commandKindsType,
  }),
  work_item_takes_one_type: type({
    error: "'work_item_takes_one_type'",
    at: 'number',
    kind: commandKindsType,
  }),
  tagIds_must_be_at_most_50: type({
    error: "'tagIds_must_be_at_most_50'",
    at: 'number',
    kind: commandKindsType,
  }),
  tagRefs_must_be_at_most_50: type({
    error: "'tagRefs_must_be_at_most_50'",
    at: 'number',
    kind: commandKindsType,
  }),
  startNoEarlierThan_must_be_a_date: type({
    error: "'startNoEarlierThan_must_be_a_date'",
    at: 'number',
    kind: commandKindsType,
  }),
  deadline_must_be_a_date: type({
    error: "'deadline_must_be_a_date'",
    at: 'number',
    kind: commandKindsType,
  }),
  on_must_be_a_date: type({ error: "'on_must_be_a_date'", at: 'number', kind: commandKindsType }),
  factStart_must_be_a_date: type({
    error: "'factStart_must_be_a_date'",
    at: 'number',
    kind: commandKindsType,
  }),
  factEnd_must_be_a_date: type({
    error: "'factEnd_must_be_a_date'",
    at: 'number',
    kind: commandKindsType,
  }),
  priority_must_be_a_whole_number_from_1: type({
    error: "'priority_must_be_a_whole_number_from_1'",
    at: 'number',
    kind: commandKindsType,
  }),
  maxParallel_must_be_a_whole_number_from_1: type({
    error: "'maxParallel_must_be_a_whole_number_from_1'",
    at: 'number',
    kind: commandKindsType,
  }),
  size_must_be_a_whole_number_from_1: type({
    error: "'size_must_be_a_whole_number_from_1'",
    at: 'number',
    kind: commandKindsType,
  }),
  maxParallel_must_be_at_most_1000: type({
    error: "'maxParallel_must_be_at_most_1000'",
    at: 'number',
    kind: commandKindsType,
  }),
  size_must_be_at_most_1000: type({
    error: "'size_must_be_at_most_1000'",
    at: 'number',
    kind: commandKindsType,
  }),
  cascade_must_be_true_or_false: type({
    error: "'cascade_must_be_true_or_false'",
    at: 'number',
    kind: commandKindsType,
  }),
  startNoEarlierThanReason_must_be_at_most_200_characters: type({
    error: "'startNoEarlierThanReason_must_be_at_most_200_characters'",
    at: 'number',
    kind: commandKindsType,
  }),
  allowancePercent_must_be_0_to_1000_with_two_decimals: type({
    error: "'allowancePercent_must_be_0_to_1000_with_two_decimals'",
    at: 'number',
    kind: commandKindsType,
  }),
  runId_must_be_1_to_256_characters: type({
    error: "'runId_must_be_1_to_256_characters'",
    at: 'number',
    kind: commandKindsType,
  }),
  parentClaim_must_be_an_id: type({
    error: "'parentClaim_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  steps_must_be_a_list_of_ids: type({
    error: "'steps_must_be_a_list_of_ids'",
    at: 'number',
    kind: commandKindsType,
  }),
  steps_must_name_a_step: type({
    error: "'steps_must_name_a_step'",
    at: 'number',
    kind: commandKindsType,
  }),
  steps_must_be_at_most_50: type({
    error: "'steps_must_be_at_most_50'",
    at: 'number',
    kind: commandKindsType,
  }),
  kind_is_immutable: type({
    error: "'kind_is_immutable'",
    at: 'number',
    kind: commandKindsType,
  }),
  units_required: type({
    error: "'units_required'",
    at: 'number',
    kind: commandKindsType,
  }),
  units_must_be_a_whole_number_from_0: type({
    error: "'units_must_be_a_whole_number_from_0'",
    at: 'number',
    kind: commandKindsType,
  }),
  units_must_be_a_whole_number_from_1: type({
    error: "'units_must_be_a_whole_number_from_1'",
    at: 'number',
    kind: commandKindsType,
  }),
  units_must_be_at_most_1000000000: type({
    error: "'units_must_be_at_most_1000000000'",
    at: 'number',
    kind: commandKindsType,
  }),
  unitLabel_must_be_at_most_40_characters: type({
    error: "'unitLabel_must_be_at_most_40_characters'",
    at: 'number',
    kind: commandKindsType,
  }),
  unitLabel_must_be_text: type({
    error: "'unitLabel_must_be_text'",
    at: 'number',
    kind: commandKindsType,
  }),
  resourceId_must_be_an_id: type({
    error: "'resourceId_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  resourceRef_must_be_an_id: type({
    error: "'resourceRef_must_be_an_id'",
    at: 'number',
    kind: commandKindsType,
  }),
  resourceKind_must_be_exclusive_or_divisible: type({
    error: "'resourceKind_must_be_exclusive_or_divisible'",
    at: 'number',
    kind: commandKindsType,
  }),
} satisfies Record<ParserRefusalCode, Type>;
/** Validates the finite legacy parser vocabulary before any string becomes a wire refusal. */
// Proof: removing forbidden context fields admitted at:text,400 instead of500 in the mounted parser-refusal case.
export const commandParserRefusal = responseSchema(
  type.or(
    ...Object.values(parserArms),
    type({ error: "'expected_object'", 'at?': 'never', 'kind?': 'never' }),
    type({ error: "'commands_must_be_a_list'", 'at?': 'never', 'kind?': 'never' }),
    type({ error: "'invalid_estimate'", 'at?': 'never', 'kind?': 'never' }),
    type({ error: "'expected_object'", at: 'number', 'kind?': 'never' }),
    type({ error: "'unknown_kind'", at: 'number', 'kind?': 'never' }),
  ),
);
