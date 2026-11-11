import { isAbsolute } from 'node:path';

import { parseSecretsOrThrow, type, ValidationError } from '@shared/validation';

import type { InstalledRequest } from './cli-parser';
import { decodeJsonInput, JsonInputRefusal } from './json-input';

export type LintRequest = InstalledRequest<'lint'>;

// Proof: request-nonblank; `installed lint request boundary > refuses invalid request repository: ""` fails with this injected fault and passes after restoration.
// Proof: request-nul; `installed lint request boundary > refuses invalid request repository: "\u0000"` fails with this injected fault and passes after restoration.
const operand = type('string').narrow((value) => /\S/u.test(value) && !value.includes('\0'));
const payload = type({
  // Proof: request-closed-0; `installed lint request boundary > refuses malformed/unsupported envelope {"version":1,"callerDirectory":"/caller with spaces","request":{"command":"lint","kind":"committed","repository":"../candidate with spaces","revision":"HEAD~1","secret":"secret-marker"}}` fails with this injected fault and passes after restoration.
  '+': 'reject',
  // Proof: request-command-value; `installed lint request boundary > refuses invalid request command: ""` fails with this injected fault and passes after restoration.
  // Proof: request-required-command; `installed lint request boundary > requires request command` fails with this injected fault and passes after restoration.
  command: '"lint"',
  // Proof: request-kind-value; `installed lint request boundary > refuses invalid request kind: ""` fails with this injected fault and passes after restoration.
  // Proof: request-required-kind; `installed lint request boundary > requires request kind` fails with this injected fault and passes after restoration.
  kind: '"working"|"staged"|"committed"',
  // Proof: request-required-repository; `installed lint request boundary > requires request repository` fails with this injected fault and passes after restoration.
  // Proof: request-value-repository; `installed lint request boundary > refuses invalid request repository: 42` fails with this injected fault and passes after restoration.
  repository: operand,
  // Proof: request-required-revision; `installed lint request boundary > requires request revision` fails with this injected fault and passes after restoration.
  // Proof: request-value-revision; `installed lint request boundary > refuses invalid request revision: 42` fails with this injected fault and passes after restoration.
  revision: operand,
});
const envelope = type({
  // Proof: request-closed-1; `installed lint request boundary > refuses malformed/unsupported envelope {"version":1,"callerDirectory":"/caller with spaces","request":{"command":"lint","kind":"committed","repository":"../candidate with spaces","revision":"HEAD~1"},"secret":"secret-marker"}` fails with this injected fault and passes after restoration.
  '+': 'reject',
  // Proof: envelope-required-version; `installed lint request boundary > requires envelope version` fails with this injected fault and passes after restoration.
  // Proof: envelope-version-value; `installed lint request boundary > refuses malformed/unsupported envelope {"version":2,"callerDirectory":"/caller with spaces","request":{"command":"lint","kind":"committed","repository":"../candidate with spaces","revision":"HEAD~1"}}` fails with this injected fault and passes after restoration.
  version: '1',
  // Proof: caller-absolute; `installed lint request boundary > refuses malformed/unsupported envelope {"version":1,"callerDirectory":"relative","request":{"command":"lint","kind":"committed","repository":"../candidate with spaces","revision":"HEAD~1"}}` fails with this injected fault and passes after restoration.
  // Proof: caller-nul; `installed lint request boundary > refuses malformed/unsupported envelope {"version":1,"callerDirectory":"/caller\u0000path","request":{"command":"lint","kind":"committed","repository":"../candidate with spaces","revision":"HEAD~1"}}` fails with this injected fault and passes after restoration.
  // Proof: envelope-required-callerDirectory; `installed lint request boundary > requires envelope callerDirectory` fails with this injected fault and passes after restoration.
  callerDirectory: type('string').narrow((value) => isAbsolute(value) && !value.includes('\0')),
  // Proof: envelope-required-request; `installed lint request boundary > requires envelope request` fails with this injected fault and passes after restoration.
  request: payload,
});

/** A malformed internal lint invocation; executable boundaries preserve its usage status. */
export class LintUsageRefusal extends Error {
  override readonly name = 'LintUsageRefusal';
  readonly status = 64;
}

export interface LintInvocation {
  readonly version: 1;
  readonly callerDirectory: string;
  readonly request: LintRequest;
}

/**
 * Decode only the current launcher's closed byte transport. It does not parse argv or enter the
 * ordinary validator union. Invalid input has one source-free diagnostic and no schema cause.
 * @throws LintUsageRefusal for invalid UTF-8, JSON, version, caller directory or request shape.
 */
export function decodeLintRequest(source: Uint8Array): LintInvocation {
  let input: unknown;
  try {
    input = decodeJsonInput(source);
  } catch (cause) {
    if (!(cause instanceof JsonInputRefusal)) throw cause;
    throw new LintUsageRefusal('invalid installed lint request');
  }
  try {
    return parseSecretsOrThrow(envelope, input);
  } catch (cause) {
    // Proof: request-usage-classifier; `does not normalize a trusted lint-schema implementation failure as usage` fails with this injected fault and passes after restoration.
    if (!(cause instanceof ValidationError)) throw cause;
    throw new LintUsageRefusal('invalid installed lint request');
  }
}
