import { userInfo } from 'node:os';
import { parseArgs } from 'node:util';

import type { OrganizationLimitsChange } from '@wbs/core';
import {
  isOrganizationLimit,
  ORGANIZATION_LIMIT_BOUNDS,
  type OrganizationLimitsReading,
  type OrganizationLimitUsage,
  type OrganizationLimitValues,
} from '@wbs/domain';
import { openExistingConnection } from '@wbs/store-sqlite/db';
import { OrganizationLimitsRepository } from '@wbs/store-sqlite/organization-limits';

import { loadOrganizationDefaultLimits } from './config';

const USAGE =
  'usage: DB_PATH=/path/plan.db bun organization-limits-cli.ts show --organization <id>\n' +
  '       … set --organization <id> [--max-agent-persons <n>] [--max-concurrent-claims <n>] [--max-capacity-units-per-resource <n>] [--apply]\n' +
  '       … reset --organization <id> [--apply]';

/**
 * Every refusal the CLI models, each with its own exit code. A refusal is one
 * JSON line on stderr; anything else that goes wrong throws (exit 1).
 */
const REFUSAL_EXIT_CODES = {
  malformed: 2,
  inactive: 3,
  unknown_organization: 4,
  out_of_bound: 5,
  no_cap: 6,
  no_row: 7,
} as const;

type Refusal =
  | { readonly refusal: 'malformed'; readonly reason: string; readonly usage: string }
  | {
      readonly refusal: 'inactive' | 'unknown_organization' | 'no_row';
      readonly organizationId: string;
    }
  | {
      readonly refusal: 'out_of_bound';
      readonly flag: string;
      readonly value: string;
      readonly least: number;
      readonly most: number;
    }
  | { readonly refusal: 'no_cap'; readonly usage: string };

const CAP_FLAGS = {
  'max-agent-persons': 'maxAgentPersons',
  'max-concurrent-claims': 'maxConcurrentClaims',
  'max-capacity-units-per-resource': 'maxCapacityUnitsPerResource',
} as const satisfies Record<string, keyof OrganizationLimitValues>;

type CapFlag = keyof typeof CAP_FLAGS;

/** The command a well-formed invocation names. */
type Command =
  | { readonly kind: 'show'; readonly organizationId: string }
  | {
      readonly kind: 'set';
      readonly organizationId: string;
      readonly change: OrganizationLimitsChange;
      readonly isApplied: boolean;
    }
  | { readonly kind: 'reset'; readonly organizationId: string; readonly isApplied: boolean };

/**
 * The command `argv` names, or the refusal it earns. Validates the whole
 * invocation before the database is opened, so a malformed one touches nothing.
 */
function parseCommand(argv: readonly string[]): Command | Refusal {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: {
        organization: { type: 'string' },
        'max-agent-persons': { type: 'string' },
        'max-concurrent-claims': { type: 'string' },
        'max-capacity-units-per-resource': { type: 'string' },
        apply: { type: 'boolean', default: false },
      },
      strict: true,
      allowPositionals: true,
    });
  } catch (cause) {
    // `parseArgs` throws only for the invocation it was given: an unknown flag,
    // a flag without its value. That is the modeled `malformed` refusal.
    return malformed(cause instanceof Error ? cause.message : String(cause));
  }
  const { values, positionals } = parsed;
  const [kind, ...extra] = positionals;
  if (positionals.length === 0) return malformed('name a command: show, set or reset');
  if (extra.length > 0) return malformed(`unexpected arguments: ${extra.join(' ')}`);
  const organizationId = values.organization?.trim();
  if (organizationId === undefined || organizationId === '')
    return malformed('--organization <id> is required');
  // `Object.keys` widens to string[]; CAP_FLAGS is a closed literal, so its keys are CapFlag.
  const named = (Object.keys(CAP_FLAGS) as CapFlag[]).filter((flag) => values[flag] !== undefined);
  switch (kind) {
    case 'show':
      if (named.length > 0 || values.apply) return malformed('show takes only --organization');
      return { kind: 'show', organizationId };
    case 'reset':
      if (named.length > 0) return malformed('reset takes no cap');
      return { kind: 'reset', organizationId, isApplied: values.apply };
    case 'set': {
      if (named.length === 0) return { refusal: 'no_cap', usage: USAGE };
      const change: Partial<Record<keyof OrganizationLimitValues, number>> = {};
      for (const flag of named) {
        const text = values[flag];
        // Filtered on `values[flag] !== undefined` above.
        if (text === undefined) throw new Error(`--${flag} vanished after it was named`);
        if (!/^-?\d+$/.test(text))
          return malformed(`--${flag} must be a whole number, not ${text}`);
        const value = Number(text);
        if (!isOrganizationLimit(value))
          return {
            refusal: 'out_of_bound',
            flag: `--${flag}`,
            value: text,
            least: ORGANIZATION_LIMIT_BOUNDS.least,
            most: ORGANIZATION_LIMIT_BOUNDS.most,
          };
        change[CAP_FLAGS[flag]] = value;
      }
      return { kind: 'set', organizationId, change, isApplied: values.apply };
    }
    default:
      return malformed(`unknown command ${kind}`);
  }
}

function malformed(reason: string): Refusal {
  return { refusal: 'malformed', reason, usage: USAGE };
}

/** One cap beside what the organization holds against it (L11, L12). */
type CapLine =
  | {
      readonly name: 'maxAgentPersons' | 'maxConcurrentClaims';
      readonly cap: number;
      readonly usage: number;
    }
  | {
      readonly name: 'maxCapacityUnitsPerResource';
      readonly cap: number;
      readonly usage: OrganizationLimitUsage['capacityUnits'];
    };

function capLines(limits: OrganizationLimitValues, usage: OrganizationLimitUsage): CapLine[] {
  return [
    { name: 'maxAgentPersons', cap: limits.maxAgentPersons, usage: usage.agentPersons },
    { name: 'maxConcurrentClaims', cap: limits.maxConcurrentClaims, usage: usage.concurrentClaims },
    {
      name: 'maxCapacityUnitsPerResource',
      cap: limits.maxCapacityUnitsPerResource,
      usage: usage.capacityUnits,
    },
  ];
}

/**
 * One line per cap the organization's usage exceeds (L11): a warning, never
 * a refusal, since what is held stays held and only the next acquisition of
 * that kind is refused.
 *
 * Proof: 2026-10-22, the agent-person comparison disabled failed `warns, never
 * refuses, when a cap lands below usage` (organization-limits-cli.db.test.ts).
 */
function belowUsageWarnings(
  limits: OrganizationLimitValues,
  usage: OrganizationLimitUsage,
): string[] {
  const warnings: string[] = [];
  if (usage.agentPersons > limits.maxAgentPersons)
    warnings.push(
      `${String(usage.agentPersons)} agent persons exceed maxAgentPersons ${String(limits.maxAgentPersons)}`,
    );
  if (usage.concurrentClaims > limits.maxConcurrentClaims)
    warnings.push(
      `${String(usage.concurrentClaims)} bound claims exceed maxConcurrentClaims ${String(limits.maxConcurrentClaims)}`,
    );
  for (const resource of usage.capacityUnits)
    if (resource.units > limits.maxCapacityUnitsPerResource)
      warnings.push(
        `${String(resource.units)} ${resource.unitLabel} of ${resource.name} (${resource.resourceId}) exceed maxCapacityUnitsPerResource ${String(limits.maxCapacityUnitsPerResource)}`,
      );
  return warnings;
}

/** Raw bytes, one line: Bun's console.error colours its output under FORCE_COLOR, which Nx sets. */
function refuse(refusal: Refusal): void {
  process.stderr.write(`${JSON.stringify(refusal)}\n`);
  process.exitCode = REFUSAL_EXIT_CODES[refusal.refusal];
}

function report(document: Record<string, unknown>, warnings: readonly string[]): void {
  process.stdout.write(`${JSON.stringify({ ...document, warnings }, null, 2)}\n`);
  for (const warning of warnings) process.stderr.write(`warning: ${warning}\n`);
}

/**
 * Who the audit row names (L13): `operator:<os login>`.
 *
 * @throws when the login is unavailable or empty, so no row names nobody.
 */
function operatorActor(): string {
  const login = userInfo().username;
  if (login === '') throw new Error('the operating-system login is empty');
  return `operator:${login}`;
}

const command = parseCommand(process.argv.slice(2));
if ('refusal' in command) refuse(command);
else {
  const dbPath = process.env['DB_PATH'];
  if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');
  const defaults = loadOrganizationDefaultLimits(process.env);
  const connection = openExistingConnection(dbPath);
  try {
    const store = new OrganizationLimitsRepository(connection.db, defaults);
    if (command.kind === 'show') {
      const reading = await store.inspect(command.organizationId);
      if (typeof reading === 'string')
        refuse({ refusal: reading, organizationId: command.organizationId });
      else showReading(command.organizationId, reading);
    } else {
      const act = { actor: operatorActor(), at: Date.now(), auditId: crypto.randomUUID() };
      const mode = command.isApplied ? 'apply' : 'rehearse';
      const outcome =
        command.kind === 'set'
          ? await store.set(command.organizationId, command.change, act, mode)
          : await store.reset(command.organizationId, act, mode);
      if (typeof outcome === 'string')
        refuse({ refusal: outcome, organizationId: command.organizationId });
      else
        report(
          {
            command: command.kind,
            mode: command.isApplied ? 'applied' : 'dry_run',
            change: outcome.change,
            organizationId: command.organizationId,
            before: outcome.before,
            after: outcome.after,
            caps: capLines(outcome.after.limits, outcome.usage),
          },
          belowUsageWarnings(outcome.after.limits, outcome.usage),
        );
    }
  } finally {
    connection.close();
  }
}

function showReading(organizationId: string, reading: OrganizationLimitsReading): void {
  report(
    {
      command: 'show',
      organizationId,
      source: reading.source,
      limits: reading.limits,
      caps: capLines(reading.limits, reading.usage),
    },
    belowUsageWarnings(reading.limits, reading.usage),
  );
}
