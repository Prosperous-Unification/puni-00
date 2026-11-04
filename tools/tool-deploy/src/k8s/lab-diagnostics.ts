/** Cap diagnostic output after replacing lab key material; never include a Secret payload. */
export function redactDiagnostic(message: string, secrets: readonly string[]): string {
  let redacted = message;
  // Proof: deleting this replacement exposed generated-key-material in
  // lab-diagnostics.test.ts (2026-09-27); restoring it passed the same test.
  for (const secret of secrets) redacted = redacted.replaceAll(secret, '[REDACTED]');
  redacted = redacted.replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[REDACTED]');
  redacted = redacted.replace(/(MCP_(?:STORE|SIGNING)_KEY_[A-Z]+[=:])[^\s]+/g, '$1[REDACTED]');
  return redacted.slice(0, 8192);
}
