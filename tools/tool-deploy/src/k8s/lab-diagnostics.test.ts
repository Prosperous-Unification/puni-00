import { expect, it } from 'bun:test';

import { assertSecretApplied, redactDiagnostic } from './lab';

it('bounds pod diagnostics and removes generated key material', () => {
  const secret = 'generated-key-material';
  const diagnostic = `MCP_STORE_KEY_CURRENT=${secret}\nobserved ${secret}\n${'x'.repeat(9000)}`;
  const redacted = redactDiagnostic(diagnostic, [secret]);
  expect(redacted).not.toContain(secret);
  expect(redacted).toContain('[REDACTED]');
  expect(redacted.length).toBeLessThanOrEqual(8192);
});

it('fails a rejected lab Secret write without disclosing its keys', () => {
  expect(() => {
    assertSecretApplied({ exitCode: 1, stderr: 'key=generated-key-material' }, [
      'generated-key-material',
    ]);
  }).toThrow('wbs-mcp-secrets apply failed: key=[REDACTED]');
});
