import {
  argument,
  choice,
  command,
  constant,
  flag,
  type InferValue,
  message,
  multiple,
  object,
  option,
  optional,
  or,
  string,
  withDefault,
} from '@optique/core';

import { dashParser, findIncoherence } from './cli-parser';

export type { DashCommand as Request } from './cli-parser';
export { isReleaseCommand, UsageRefusal } from './cli-parser';

/** PUNI-only local artifact selection; standalone Dash retains its original parser. */
const installPuni = command(
  'install-puni',
  object({
    command: constant('install-puni'),
    archive: argument(string({ metavar: 'ARCHIVE', pattern: /^(?!--)(?=[\s\S]*\S)[\s\S]+$/u })),
    sha256: option('--sha256', string({ metavar: 'SHA256', pattern: /^[0-9a-f]{64}$/u })),
    destination: option(
      '--destination',
      string({
        metavar: 'DIRECTORY',
        pattern: /^(?!--)(?=[\s\S]*\S)[\s\S]+$/u,
      }),
    ),
  }),
  {
    brief: message`Install an explicitly authenticated local PUNI artifact into a fresh external client.`,
  },
);

/** Explicit local development ports; this member is not added to standalone Dash. */
const devPorts = command(
  'dev-ports',
  object({
    command: constant('dev-ports'),
    action: argument(choice(['resolve', 'check', 'release'] as const)),
    repository: option(
      '--repository',
      string({ metavar: 'DIRECTORY', pattern: /^(?!--)(?=[\s\S]*\S)[\s\S]+$/u }),
    ),
    appsDirectory: optional(
      option(
        '--apps-dir',
        string({ metavar: 'DIRECTORY', pattern: /^(?!--)(?=[\s\S]*\S)[\s\S]+$/u }),
      ),
    ),
    pairs: multiple(
      argument(string({ metavar: 'TIER:PORT', pattern: /^(?!--)(?=[\s\S]*\S)[\s\S]+$/u })),
    ),
  }),
  { brief: message`Resolve, check, or explicitly release this checkout's development ports.` },
);

/**
 * Embedded deployment HTTP checks, outside standalone Dash.
 * Proof: backend-probe-fault-origin-grammar-v123 admitted a blank origin to the
 * runtime and failed its usage-refusal assertion; exact restoration passed.
 */
const devProbe = command(
  'dev-probe',
  command(
    'be',
    object({
      command: constant('dev-probe'),
      service: constant('be'),
      origin: argument(string({ metavar: 'ORIGIN', pattern: /^(?!--)(?=[\s\S]*\S)[\s\S]+$/u })),
    }),
  ),
  { brief: message`Verify the backend's mounted anonymous authentication response.` },
);

/** Complete PUNI-only foreground development; standalone Dash keeps its original surface. */
const development = command(
  'dev',
  object({
    command: constant('dev'),
    repository: option(
      '--repository',
      string({ metavar: 'DIRECTORY', pattern: /^(?!--)(?=[\s\S]*\S)[\s\S]+$/u }),
    ),
    localSolver: withDefault(flag('--local-solver'), false),
  }),
  { brief: message`Run this checkout's complete development stack with owned foreground output.` },
);

/** The installed Forge owner is a closed PUNI operation, outside standalone Dash. */
const developmentEnvironment = command(
  'dev-env',
  command(
    'supervise',
    object({
      command: constant('dev-env'),
      action: constant('supervise'),
      repository: option(
        '--repository',
        string({ metavar: 'DIRECTORY', pattern: /^(?!--)(?=[\s\S]*\S)[\s\S]+$/u }),
      ),
      terminationLog: option(
        '--termination-log',
        string({ metavar: 'PATH', pattern: /^(?!--)(?=[\s\S]*\S)[\s\S]+$/u }),
      ),
    }),
  ),
  { brief: message`Supervise an explicitly selected installed PUNI development environment.` },
);

/** Execute only an owned browser level against the explicitly selected repository. */
const browser = command(
  'browser',
  object({
    command: constant('browser'),
    mode: argument(choice(['ordinary', 'packaged', 'portable'] as const)),
    repository: option(
      '--repository',
      string({ metavar: 'DIRECTORY', pattern: /^(?!--)(?=[\s\S]*\S)[\s\S]+$/u }),
    ),
  }),
  { brief: message`Execute an ordinary, packaged, or portable browser level.` },
);

/** Policy selection is retained for execution; parsing reads neither files nor environment. */
const performance = command(
  'performance',
  object({
    command: constant('performance'),
    repository: option(
      '--repository',
      string({ metavar: 'DIRECTORY', pattern: /^(?!--)(?=[\s\S]*\S)[\s\S]+$/u }),
    ),
    rulePolicy: optional(
      option(
        '--rule-policy',
        string({ metavar: 'FILE', pattern: /^(?!--)(?=[\s\S]*\S)[\s\S]+$/u }),
      ),
    ),
  }),
  { brief: message`Execute performance observations using an independently selected rule policy.` },
);

/** The composed PUNI surface; legacy standalone parsing and runtime requests stay unchanged. */
export const parser = or(
  dashParser,
  installPuni,
  devPorts,
  devProbe,
  development,
  developmentEnvironment,
  browser,
  performance,
);

export type InstallPuniRequest = InferValue<typeof installPuni>;
export type DevelopmentRequest = InferValue<typeof development>;
export type BrowserRequest = InferValue<typeof browser>;
export type PerformanceRequest = InferValue<typeof performance>;

/** Apply legacy Dash coherence only to its original typed requests. */
export function findRefusal(request: InferValue<typeof parser>): string | undefined {
  return request.command === 'install-puni' ||
    request.command === 'dev-ports' ||
    request.command === 'dev-probe' ||
    request.command === 'dev' ||
    request.command === 'dev-env' ||
    request.command === 'browser' ||
    request.command === 'performance'
    ? undefined
    : findIncoherence(request);
}
