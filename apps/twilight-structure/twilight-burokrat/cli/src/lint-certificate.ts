import { parseSecretsOrThrow, type, ValidationError } from '@shared/validation';

import { decodeJsonInput, JsonInputRefusal } from './json-input';

const certificate = type({
  // Proof: certificate-required-schemaVersion; `refuses a certificate missing schemaVersion` failed under its recorded source fault and passed after restoration.
  // Proof: certificate-value-schemaVersion; `refuses an incorrect certificate schemaVersion` failed under its recorded source fault and passed after restoration.
  schemaVersion: '1',
  // Proof: certificate-required-mode; `refuses a certificate missing mode` failed under its recorded source fault and passed after restoration.
  // Proof: certificate-value-mode; `refuses an incorrect certificate mode` failed under its recorded source fault and passed after restoration.
  mode: '"enforce"',
  // Proof: certificate-required-trustProvenance; `refuses a certificate missing trustProvenance` failed under its recorded source fault and passed after restoration.
  // Proof: certificate-value-trustProvenance; `refuses an incorrect certificate trustProvenance` failed under its recorded source fault and passed after restoration.
  trustProvenance: '"ci-preselected"',
  // Proof: certificate-required-accepted; `refuses a certificate missing accepted` failed under its recorded source fault and passed after restoration.
  // Proof: certificate-value-accepted; `refuses an incorrect certificate accepted` failed under its recorded source fault and passed after restoration.
  accepted: 'true',
  // Proof: certificate-required-certified; `refuses a certificate missing certified` failed under its recorded source fault and passed after restoration.
  // Proof: certificate-value-certified; `refuses an incorrect certificate certified` failed under its recorded source fault and passed after restoration.
  certified: 'true',
});

/**
 * Recognize full enforce/ci-preselected certification, allowing additional report fields.
 * Expected JSON/UTF8/schema refusals return false; unexpected decoder/schema failures propagate.
 */
export function hasEnforceCertificate(bytes: Uint8Array): boolean {
  let input: unknown;
  try {
    input = decodeJsonInput(bytes);
  } catch (cause) {
    // Proof: certificate-decoder-classifier; `preserves unexpected certificate decoder failure identity` failed under its recorded source fault and passed after restoration.
    if (!(cause instanceof JsonInputRefusal)) throw cause;
    return false;
  }
  try {
    parseSecretsOrThrow(certificate, input);
    return true;
  } catch (cause) {
    // Proof: certificate-schema-classifier; `preserves internal certificate schema TypeErrors` failed under its recorded source fault and passed after restoration.
    if (!(cause instanceof ValidationError)) throw cause;
    return false;
  }
}
