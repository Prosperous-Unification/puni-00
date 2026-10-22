import type { PlanCommandKind } from '../commands/definitions';

/**
 * Modeled HTTP failures; status/code pairing is narrowed by each endpoint shape.
 * A classified OIDC defect is the one modeled 500; thrown failures still bypass
 * endpoint replies and reach the adapter error boundary.
 */
export type RefusalStatus = 400 | 401 | 403 | 404 | 405 | 409 | 422 | 429 | 500 | 501 | 503;

/** Portable command discriminants, shared with runtime command refusal context. */
export type { PlanCommandKind } from '../commands/definitions';

/**
 * Existing parser messages enumerate their field callers, never arbitrary templates.
 * Proof (type boundary only): adding `${string}_must_be_an_id` makes the invalid
 * password-field fixture fail with TS2578. Production endpoint proof is pending.
 */
export type ParserRefusalCode =
  | 'expected_object'
  | 'number_is_derived'
  | 'externalRefs_must_be_a_list'
  | 'too_many_externalRefs'
  | 'externalRefs_entry_needs_a_systemId'
  | 'externalRefs_entry_needs_a_url'
  | 'externalRefs_entry_name_is_not_text'
  | 'externalRefs_entry_name_is_too_long'
  | 'invalid_actual'
  | 'invalid_measure'
  | 'invalid_progress'
  /** An `endAttempt` outcome outside `ATTEMPT_OUTCOMES`. */
  | 'invalid_outcome'
  /** An attempt's `at` that is not a whole epoch millisecond from 0. */
  | 'at_must_be_an_instant'
  | 'invalid_status'
  | 'invalid_estimate'
  | 'conflicting_step_address'
  | 'invalid_step_node_id'
  | 'unknown_step_node_encoding'
  | 'invalid_typed_endpoint'
  | 'type_must_be_text'
  | 'dependencyId_must_be_text'
  | 'cannot_send_both_teamIds_and_serviceTeamId'
  | 'unknown_kind'
  | 'unknown_strategy'
  | 'commands_must_be_a_list'
  | 'size_required'
  | 'bands_required'
  | 'bands_must_be_an_array'
  | 'bands_must_number_5'
  | 'bands_must_be_objects'
  | 'band_start_must_be_a_whole_number_from_1'
  | 'band_default_must_be_a_whole_number_from_1'
  | 'band_label_must_be_1_to_40_characters'
  | 'band_labels_must_differ'
  | 'first_band_must_start_at_1'
  | 'bands_must_start_in_increasing_order'
  | 'band_default_must_be_inside_its_own_band'
  | `${'parentId' | 'afterId' | 'personId' | 'serviceTeamId' | 'accountId'}_must_be_id_or_null`
  | `${'name' | 'notes' | 'kind' | 'startNoEarlierThanReason' | 'stepId' | 'metric' | 'reference' | 'note' | 'unitLabel'}_must_be_text`
  | `${'workItemId' | 'workItemRef' | 'ref' | 'parentRef' | 'afterRef' | 'personRef' | 'predecessorId' | 'predecessorRef' | 'teamId' | 'teamRef' | 'personId' | 'tagId' | 'tagRef' | 'typeId' | 'typeRef' | 'serviceId' | 'serviceRef' | 'executorPersonId' | 'resourceId' | 'resourceRef'}_must_be_an_id`
  | `${'teamIds' | 'teamRefs' | 'tagIds' | 'tagRefs' | 'serviceIds' | 'serviceRefs' | 'typeIds' | 'typeRefs'}_must_be_a_list_of_ids`
  | `${'teamIds' | 'teamRefs' | 'serviceIds' | 'serviceRefs' | 'typeIds' | 'typeRefs'}_must_be_at_most_10`
  | `${'tagIds' | 'tagRefs'}_must_be_at_most_50`
  /**
   * More than one distinct type in one patch's `typeIds` or `typeRefs`
   * (WBS 010.4.10). The `typeIds_must_be_at_most_10` arms above are retired by it
   * and stay for an outgoing be-01 answering mid-swap.
   */
  | 'work_item_takes_one_type'
  | 'startNoEarlierThan_must_be_a_date'
  | 'deadline_must_be_a_date'
  | 'on_must_be_a_date'
  | `${'factStart' | 'factEnd'}_must_be_a_date`
  | `${'priority' | 'maxParallel' | 'size' | 'attemptNumber' | 'units'}_must_be_a_whole_number_from_1`
  | `${'maxParallel' | 'size'}_must_be_at_most_1000`
  | 'cascade_must_be_true_or_false'
  | 'startNoEarlierThanReason_must_be_at_most_200_characters'
  | 'allowancePercent_must_be_0_to_1000_with_two_decimals'
  /** A `claimWorkItem` run that is not text of 1 to 256 characters (`wbs-team-claims`). */
  | 'runId_must_be_1_to_256_characters'
  | 'parentClaim_must_be_an_id'
  | 'steps_must_be_a_list_of_ids'
  | 'steps_must_be_at_most_50'
  /** A `claimWorkItem` or `releaseWorkItem` whose `steps` is an empty list. */
  | 'steps_must_name_a_step'
  /** A `claimWorkItem` whose `resources` is not a list of `{ resourceId, units }` (`wbs-resources` R4). */
  | 'resources_must_be_a_list'
  | 'resources_must_name_a_resource'
  | 'resources_must_be_at_most_50'
  | 'resources_must_name_each_resource_once'
  // Resources (`wbs-resources`): a `patchResource` naming the kind, a capacity or
  // demand without its units, a capacity below 0, a figure above the product
  // bound, and a unit label too long to sit beside a number.
  | 'kind_is_immutable'
  | 'resourceKind_must_be_exclusive_or_divisible'
  | 'units_required'
  | 'units_must_be_a_whole_number_from_0'
  | 'units_must_be_at_most_1000000000'
  | 'unitLabel_must_be_at_most_40_characters';

/** Service/runner refusals after a command kind has been recognized. */
export type CommandRefusalCode =
  // Proof: omission failed the closed command compiler fixture (mutation-closed-command-registry.txt).
  | 'referenced_by_step_parallel'
  | 'too_many_commands'
  | 'project_required'
  | 'unknown_ref'
  | 'missing_id'
  | 'duplicate_ref'
  | 'name_required'
  | 'not_found'
  | 'forbidden'
  | 'strategy_required'
  | 'cycle'
  | 'calendar_range'
  /**
   * **Retired at ADR 0023 and deliberately still here.** No release since
   * produces it: a frozen work item moves like any other, so `move` has no
   * frozen refusal left to answer with.
   *
   * It stays in the union because blue and green serve one deployment in turn
   * — a browser holding the new fe-01 can be answered by the outgoing be-01
   * for the length of a swap — and an arm missing from this union is a 409 the
   * client cannot parse at all, which reads to the user as a broken drag
   * rather than as a refusal with a reason.
   */
  | 'frozen'
  /**
   * `arrangeBySchedule` on a project whose selected engine is `optimized` and
   * whose displayed variant has not finished solving.
   *
   * A conflict rather than a fault: the same request is accepted the moment
   * the solve lands, and arranging by Fast instead would put the rows in an
   * order the reader did not pick (ADR 0022's reasoning about unmarked dates).
   */
  | 'schedule_not_ready'
  | 'minutes_not_integer'
  | 'minutes_above_max'
  | 'rolled_up'
  | 'has_children'
  | 'ancestor'
  /** A typed dependency resolving a step node onto itself. */
  | 'self_node'
  | 'not_a_parent'
  | 'node_on_parent'
  | 'descendant_step_on_leaf'
  | 'referenced_by_external_dependency'
  | 'unknown_dependency'
  | 'external_dependencies_inactive'
  | 'duplicate_dependency'
  | 'unsupported_relationship_type'
  | 'too_large'
  | 'unknown_step'
  | 'unknown_metric'
  | 'unknown_person'
  /** `patchPerson.accountId` naming no account that is a member of the person's organization. */
  | 'unknown_account'
  | 'unknown_team'
  | 'unknown_tag'
  | 'unknown_service'
  | 'unknown_type'
  | 'unknown_system'
  /** A resource the directory does not hold, or one another organization owns (`wbs-resources`). */
  | 'unknown_resource'
  /** `setDemand` of other than 1 unit on an `exclusive` resource. */
  | 'exclusive_demand_is_one'
  /** A patch whose bound `typeIds` and `typeRefs` name more than one type. */
  | 'work_item_takes_one_type'
  | 'not_before_reason_needs_a_date'
  | 'deadline_before_project_start'
  /** `setStatus` `ready` or `draft` once a step has spoken (`add-work-item-statuses`). */
  | 'readiness_after_progress'
  /** `setStatus` `on_hold` or `blocked` on a row reading done. */
  | 'cannot_hold_done'
  /** `setStatus` `in_progress` or `done` in a project with no steps. */
  | 'no_steps'
  /** `startAttempt` on a node whose statement is `done` (`step-node-attempts` D2). */
  | 'node_done'
  /** `startAttempt` on a node with a running attempt. */
  | 'attempt_running'
  /** An attempt's `at` after the write stamp. */
  | 'attempt_in_future'
  /** `endAttempt` on a node with no running attempt. */
  | 'no_running_attempt'
  /** `endAttempt` whose `at` precedes the running attempt's start. */
  | 'attempt_ends_before_start'
  /** `removeAttempt` naming a number the node does not hold. */
  | 'unknown_attempt'
  | 'invalid_kind'
  | 'nothing_to_change'
  | 'taken'
  | 'in_use'
  // `claimWorkItem` and `releaseWorkItem` (`wbs-team-claims`), in the spec's order.
  | 'person_not_bound'
  | 'credential_not_for_person'
  | 'parent_claim_unknown'
  | 'parent_claim_foreign'
  | 'parent_claim_not_ancestor'
  | 'steps_on_subtree'
  | 'item_done'
  | 'not_startable'
  | 'prerequisites_unmet'
  | 'step_done'
  | 'already_claimed'
  // `claimWorkItem` occupancy (`wbs-resources` R3, R4), between already_claimed
  // and inside_subtree_claim in the claim's order.
  | 'resources_on_subtree'
  | 'below_declared_demand'
  | 'below_held_occupancy'
  | 'resources_exhausted'
  | 'inside_subtree_claim'
  | 'overlaps_subtree_claim'
  | 'not_claimed_by'
  /** `moveWorkItem` under a leaf whose steps are claimed; names the holders. */
  | 'destination_claimed'
  /**
   * `deleteWorkItem` promoting the parent while claims sit on more than one
   * deleted row, or on that parent as well; names the holders.
   */
  | 'children_claimed';

/** One claim a claim refusal names: the claim, its person by id and name, and its run. */
export interface ClaimRefusalHolder {
  claimId: string;
  personId: string;
  name: string;
  runId: string | null;
}

/** One holder `resources_exhausted` names: a claimant and run on one leaf. */
export interface OccupancyRefusalHolder {
  personId: string;
  name: string;
  runId: string | null;
  workItemId: string;
}

/**
 * Proof (type boundary only): making kind optional produces TS2578 for both the
 * runtime and global incomplete-command fixtures. Production binding is pending.
 */
export interface CommandContext {
  at: number;
  kind: PlanCommandKind;
}

/** A parser can fail before an index or recognized kind exists; runtime commands cannot. */
type ParserContext = undefined | { at: number; kind?: never } | CommandContext;

export type DirectoryEffect =
  | { kind: 'assignment_dropped'; step: { id: string; name: string } }
  | { kind: 'claim_released'; step: { id: string; name: string } | null }
  | { kind: 'label_nulled' }
  | { kind: 'label_removed' }
  | { kind: 'capacity_released'; size: number; fromId: string }
  /** The row's demand on the resource being removed goes with it (`wbs-resources`). */
  | { kind: 'demand_removed'; units: number }
  | { kind: 'assumed_assignee_changed'; assumedNow: string | null; assumedAfter: string | null };

/** What a resource removal would take, counted (`wbs-resources` R8). */
export interface ResourceUsageCounts {
  demands: number;
  capacities: number;
  occupancies: number;
}

/** Both affected-project and directory-member lists are present, including when empty. */
export interface DirectoryUsage {
  projects: {
    id: string;
    name: string;
    workItems: { id: string; number: string; name: string; effects: DirectoryEffect[] }[];
  }[];
  members: { id: string; name: string }[];
  /**
   * Linked credentials pinned to the person, revoked by a confirmed removal.
   * Optional on the wire: an outgoing be-01 mid-swap counts no pins.
   */
  pinnedCredentials?: number;
  /**
   * Unrevoked machine credentials of the person, revoked by a confirmed
   * removal and refusing an unbind or rebind. Optional on the wire: an
   * outgoing be-01 mid-swap counts none.
   */
  machineCredentials?: number;
}

/**
 * Mirrors libs/wbs/application/core/src/module/step/step.resource.ts::StepInUse, including explicit
 * assignments omitted by the initial HTTP inventory. Proof (type boundary only):
 * making assignments optional produces TS2578 for its missing-field fixture.
 */
export interface StepInUse {
  /** Absent only when an older server cannot report direct blockage facts. */
  blockages?: number;
  estimates: number;
  actuals: number;
  progress: number;
  measures: number;
  /** Optional on the wire: an outgoing be-01 mid-swap counts no attempts. */
  attempts?: number;
  /** Optional on the wire: an outgoing be-01 mid-swap counts no claims. */
  claims?: number;
  assignments: number;
  assumedAssignees: {
    workItemId: string;
    assumedNow: string | null;
    assumedAfter: string | null;
  }[];
}

export interface Quota {
  limit: 'body_bytes' | 'plan_count' | 'project_bytes';
  asked: number;
  allowed: number;
}

/**
 * Saved-body integrity failures preserve hash and reader-version evidence.
 * Proof (type boundary only): admitting input in schedule_input_mismatch makes
 * its incorrect-body fixture fail with TS2578. Production binding is pending.
 */
export type Integrity = { savedPlanId: string } & (
  | { reason: 'body_missing'; body: 'input' | 'schedule' }
  | { reason: 'body_hash_mismatch'; body: 'input' | 'schedule'; stored: string; recomputed: string }
  | {
      reason: 'schedule_input_mismatch';
      body: 'schedule';
      scheduleInputSha256: string;
      inputSha256: string;
    }
  | {
      reason: 'input_version_unreadable';
      body: 'input';
      storedVersion: number;
      readerVersion: number;
      versionReason: 'from-the-future' | 'no-upgrade-path' | 'not-a-version';
    }
);

/** Command-specific fields are finite; at/kind are required independently of the refusal code. */
export type CommandRefusalDetail = {
  [C in CommandRefusalCode]: CommandContext &
    // Proof: making projectDayZero optional caused TS2578 in the deadline refusal type fixture.
    (C extends 'deadline_before_project_start'
      ? { workItemId: string; projectDayZero: string }
      : // Proof: optional nodes made the missing-detail compiler negative unused (mutation-optional-command-nodes.txt).
        C extends 'referenced_by_step_parallel'
        ? { nodes: { workItemId: string; stepId: string }[] }
        : C extends
              'node_on_parent' | 'descendant_step_on_leaf' | 'referenced_by_external_dependency'
          ? { dependencyIds: string[] }
          : C extends 'in_use'
            ? { usage: DirectoryUsage; counts?: ResourceUsageCounts }
            : C extends 'taken'
              ? { name?: string }
              : C extends 'not_startable'
                ? { status: string }
                : C extends 'prerequisites_unmet'
                  ? {
                      stepIds: string[];
                      blockers: {
                        workItemId: string;
                        stepId: string | null;
                        type: 'FS' | 'SS' | 'FF';
                        provenance: 'workflow' | 'legacy' | 'authored';
                        relationshipId: string | null;
                      }[];
                    }
                  : C extends 'step_done'
                    ? { stepIds: string[] }
                    : C extends 'already_claimed' | 'destination_claimed' | 'children_claimed'
                      ? { holders: ClaimRefusalHolder[] }
                      : C extends 'inside_subtree_claim' | 'overlaps_subtree_claim'
                        ? { holder: ClaimRefusalHolder }
                        : C extends 'below_declared_demand'
                          ? { resourceId: string; asked: number; declared: number }
                          : C extends 'below_held_occupancy'
                            ? { resourceId: string; asked: number; held: number }
                            : C extends 'resources_exhausted'
                              ? {
                                  resourceId: string;
                                  asked: number;
                                  free: number;
                                  holders: OccupancyRefusalHolder[];
                                }
                              : Record<never, never>);
};

type BareRefusalCode =
  // Proof: omission failed the closed-registry compiler case with TS2345 (mutation-registry.txt, 2026-10-17).
  | 'unsupported_step_parallelism'
  | 'step_blockage_inactive'
  | 'unauthenticated'
  | 'insufficient_scope'
  /** A browser operation names a different organization than its current authority. */
  | 'organization_context_changed'
  /** Authenticated, but the session is bound to no organization (after activation). */
  | 'no_active_organization'
  | 'onboarding_inactive'
  | 'context_inactive'
  | 'invalid_binding'
  /** mcp-01 asked for a delegation the deployment cannot issue: no key pair (after activation). */
  | 'delegation_inactive'
  /** An MCP session's upstream token now resolves to another account than it was bound to. */
  | 'binding_changed'
  /**
   * An MCP consent family's credential is revoked, names another family, or its
   * person is no longer bound to the account (`wbs-machine-credentials` A20).
   */
  | 'credential_revoked'
  | 'email_verification_required'
  | 'password_account_required'
  | 'address_conflict'
  | 'challenge_invalid'
  | 'invitation_invalid'
  | 'recipient_mismatch'
  | 'delivery_failed'
  | 'already_member'
  | 'domain_matched'
  | 'invalid_domain'
  | 'unclaimable'
  | 'stale'
  | 'proof_mismatch'
  | 'domain_taken'
  | 'dns_unavailable'
  | 'join_request_pending'
  | 'request_resolved'
  | 'domain_changed'
  /** Authenticated, but the bound organization no longer lists the user. */
  | 'not_a_member'
  | 'invalid_origin'
  | 'unauthorized'
  /**
   * A verified machine token (no groups claim) whose `(issuer, subject)` no
   * account is linked to (`wbs-team-claims` D6b): refused before any account
   * is minted. Also a `wbs_mk_` API key that is malformed or that no live
   * machine credential admits (`wbs-machine-credentials` A13, A22).
   */
  | 'unknown_identity'
  | 'invalid_body'
  | 'invalid_allowance'
  | 'invalid_estimate_unit'
  | 'invalid_query'
  | 'unsupported_format'
  | 'bad_start_date'
  | 'bad_pert_weights'
  | 'optimizer_unavailable'
  /** Another of the organization's projects holds the requested solution slug. */
  | 'solution_taken'
  | 'abbreviation_taken'
  | 'abbreviation_exhausted'
  | 'invalid_abbreviation'
  | 'engine_unavailable'
  | 'snapshot_busy'
  | 'invalid_client'
  | 'rate_limited'
  | 'invalid_credentials'
  | 'invalid_token'
  | 'invalid'
  | 'method_not_allowed'
  | 'duplicate_parameter'
  | 'invalid_json'
  | 'invalid_params'
  | 'unsupported_version'
  | 'invalid_oidc_callback'
  | 'invalid_oidc_session'
  | 'refresh_in_progress'
  | 'oidc_identity_conflict'
  // A step's chosen code (ADR 0031): breaks the grammar, lies in the ordinal
  // alias's namespace, or is already held in the project.
  | 'invalid_code'
  | 'reserved_code'
  | 'code_taken'
  // Why a step reference does not resolve to a step node now.
  | 'malformed_reference'
  | 'stale_reference'
  | 'unknown_work_item'
  | 'parent_work_item'
  | 'unknown_code'
  | 'alias_mismatch'
  // A membership change that would leave the organization without a
  // super-admin (task 3.7).
  | 'last_super_admin'
  // A project reach change or a step removal that would close a step-node
  // dependency cycle. Outside a batch, so it carries no command position.
  | 'dependency_cycle'
  // Spaces (`add-spaces`): legacy access with no legacy organization to own a
  // space; a space name the organization already holds; a project already in
  // the space; a write addressed to the virtual All projects.
  | 'organization_required'
  | 'name_taken'
  | 'already_in_space'
  | 'virtual_space'
  // Work-item pages (`list-search-and-paging`): a cursor whose work item has
  // left the project; a `parentId` naming no work item of the project.
  | 'stale_cursor'
  | 'unknown_parent'
  // Capacity mode (`share-people-across-projects` 8.1): a mode this release
  // does not list in `SUPPORTED_CAPACITY_MODES`.
  | 'capacity_mode_unsupported'
  | 'restore_approval_conflict'
  // A project PATCH naming a zone the server runtime does not support
  // (`step-node-attempts` D3).
  | 'invalid_timezone'
  // Enterprise SSO (`organization-sso`): connection administration refusals,
  // a domain release a connection still names, and an unknown login slug.
  | 'domain_not_verified'
  | 'sso_connection_exists'
  | 'login_slug_taken'
  | 'provisioning_active'
  | 'sso_connection_unproven'
  | 'enforcement_would_lock_out_actor'
  | 'sso_connection_not_found'
  // Provisioning tokens (`organization-scim`): two tokens already live
  // (`sso_connection_unproven` above also refuses a token).
  | 'token_limit'
  // Machine credentials (`wbs-machine-credentials`): an agent person bound to
  // an account that is no member; a second rotation inside the window; a
  // rotation of a credential whose secret its issuer rotates.
  | 'account_not_member'
  | 'rotation_in_progress'
  | 'rotation_at_issuer'
  // OIDC credentials and trusted issuers (`wbs-machine-credentials` A16):
  // registration's discovery and gate refusals, a credential naming another
  // organization's issuer, and a pair another credential holds.
  | 'issuer_unreachable'
  | 'issuer_mismatch'
  | 'issuer_reserved'
  | 'issuer_not_oidc'
  | 'issuer_taken'
  | 'unknown_sso_connection'
  | 'unknown_trusted_issuer'
  | 'subject_taken'
  // A25: another organization registered the issuer with this audience; an
  // organization at its trusted issuer cap.
  | 'audience_taken'
  | 'trusted_issuer_limit';

type SharedCommandCode =
  | 'external_dependencies_inactive'
  | 'not_found'
  | 'forbidden'
  | 'name_required'
  | 'taken'
  | 'in_use'
  | 'calendar_range'
  | 'referenced_by_step_parallel'
  | 'already_claimed'
  | 'unknown_team'
  | 'unknown_person'
  | 'person_not_bound';

/**
 * Details by finite code. Undefined means no detail, never an open object bag.
 * Per-endpoint response schemas narrow the applicable route variant and status.
 * The new OIDC/health/parser codes describe approved wire translations still
 * awaiting production endpoint binding; they do not classify thrown exceptions.
 * Approved translations preserve statuses: bodiless callback 400 becomes
 * invalid_oidc_callback; callback/refresh 401 becomes invalid_oidc_session;
 * unresolved OIDC account 409 becomes oidc_identity_conflict. Health 503 becomes
 * dependency_unavailable and retains status/commit. Malformed JSON 400 becomes
 * invalid_json; freeform smoke/internal validation 400 becomes invalid_body
 * (existing invalid_body 422 arms stay 422). Cookies, logs and timing stay local
 * to their endpoint; RefusalStatus does not infer a status from a code.
 */
export type RefusalDetail = Record<BareRefusalCode, undefined> &
  Record<ParserRefusalCode, ParserContext> & {
    [C in Exclude<CommandRefusalCode, SharedCommandCode>]: CommandRefusalDetail[C];
  } & {
    not_found: { savedPlanId?: string } | { field?: 'markerId' } | CommandContext;
    forbidden: undefined | CommandContext;
    name_required: undefined | CommandContext;
    /** Bare from a step PATCH's allowance; with its command context from a batch. */
    calendar_range: undefined | CommandContext;
    taken: undefined | { field?: 'markerId' } | CommandRefusalDetail['taken'];
    /** Bare from a domain claim; with its holders from a `claimWorkItem` batch. */
    already_claimed: undefined | CommandRefusalDetail['already_claimed'];
    /** Bare from the startable read's `team` filter; with its command context from a batch. */
    unknown_team: undefined | CommandRefusalDetail['unknown_team'];
    /** Bare from the by-person read; with its command context from a batch. */
    unknown_person: undefined | CommandRefusalDetail['unknown_person'];
    /** Naming the person from a machine credential create; with its command context from a batch. */
    person_not_bound: { personId: string } | CommandRefusalDetail['person_not_bound'];
    /** Also a trusted issuer that unrevoked machine credentials name (`wbs-machine-credentials` A16). */
    in_use: { inUse: StepInUse } | { machineCredentials: number } | CommandRefusalDetail['in_use'];
    /** The typed dependencies naming a step that a removal would take away. */
    referenced_by_dependency: { dependencyIds: string[] };
    // Proof: omitted registry entry made removeStep fail TS2345 in the smallest step-module typecheck, 2026-10-17.
    referenced_by_step_parallel:
      | { nodes: { workItemId: string; stepId: string }[] }
      | CommandRefusalDetail['referenced_by_step_parallel'];
    estimates_present: { count: number };
    external_dependencies_inactive:
      { detail: string | null } | CommandRefusalDetail['external_dependencies_inactive'];
    nothing_to_undo: { detail: string | null };
    stale_undo: { detail: string | null };
    stale_address_revision: { addressRevision: string };
    /**
     * A plan export of a project holding steps an older writer left uncoded:
     * each such step, and the be-01 backfill command that codes them.
     */
    uncoded_steps: { steps: { id: string; name: string }[]; command: string };
    unresolvable_reference: {
      reason:
        | 'malformed'
        | 'unknown_work_item'
        | 'ambiguous_work_item'
        | 'parent'
        | 'unknown_code'
        | 'alias_mismatch';
    };
    malformed: { field: 'body' | 'markerId' | 'date' | 'name' | 'color' };
    contrast: { field: 'color' };
    quota: { refusal: Quota };
    corrupt: { refusal: Integrity; savedPlanId?: string };
    unsupported_body_version: {
      savedPlanId: string;
      body: 'input' | 'schedule';
      version: number;
      supported: readonly number[];
    };
    dependency_unavailable: {
      status: 'migrating' | 'database_unreachable' | 'schema_missing';
      commit: string | null;
    };
    /** Enforced SSO refused this credential in this organization only (`organization-sso`). */
    sso_required: { organizationId: string; login: string; link: true };
    /** A session policy bound is exceeded or unknown (`organization-session-policy`). */
    reauthentication_required: {
      organizationId: string;
      reason: 'max_session' | 'reauthenticate_after';
      login: string;
    };
  };

export type RefusalCode = keyof RefusalDetail;

/** Archival imports retain the first document path and optional offending reference. */
export interface ImportRefusal {
  error:
    | 'invalid_body'
    | 'invalid_typed_dependency'
    | 'unsupported_version'
    | 'unknown_ref'
    | 'cycle'
    | 'ancestor'
    | 'deadline_before_project_start'
    | 'engine_unavailable'
    | 'source_refused'
    | 'abbreviation_taken'
    | 'abbreviation_exhausted'
    /** A row with several types; `detail` lists every such row's file id. */
    | 'work_item_takes_one_type';
  path: string;
  detail: string | null;
}

type UnionKeys<T> = T extends T ? keyof T : never;
/** Prevents mixing route-specific fields merely because their error codes coincide. */
type ClosedVariants<T, Whole = T> = T extends T
  ? T & Partial<Record<Exclude<UnionKeys<Whole>, keyof T>, never>>
  : never;
type Envelope<C, D> = D extends undefined ? { error: C } : { error: C } & D;

/**
 * One discriminated envelope, without batch metadata on non-command routes.
 * Proof (type boundary only): replacing this with an open unknown-valued record
 * produces eleven TS2578 diagnostics for invalid detail/context fixtures.
 * Endpoint response validation and wire status correlation remain pending.
 */
type ErrorRefusal<C extends RefusalCode = RefusalCode> = {
  [K in C]: ClosedVariants<Envelope<K, RefusalDetail[K]>>;
}[C];

/** Retry retains the coordinator decision as `code`; clients branch on this established envelope. */
export type OptimizerRetryRefusal =
  | { code: 'stale-input-hash'; currentInputHash: string }
  | {
      code: 'not-retryable';
      state: 'ready' | 'pending' | 'retrying' | 'failed' | 'corrupt' | 'plan-infeasible' | 'idle';
    }
  | { code: 'already-running' }
  | {
      code: 'schedule-input-unavailable';
      reason: 'engine_unavailable' | 'cycle' | 'calendar_range';
      projectId: string;
    };

export type Refusal<C extends RefusalCode = RefusalCode> = ErrorRefusal<C> | OptimizerRetryRefusal;

/** Runtime command failures always retain their command index and recognized kind. */
export type CommandRefusal<C extends CommandRefusalCode = CommandRefusalCode> = {
  [K in C]: { error: K } & CommandRefusalDetail[K];
}[C];
