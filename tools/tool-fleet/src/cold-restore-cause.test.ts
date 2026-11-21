import { describe, expect, it } from 'bun:test';

import { runRecorderFixture } from './cold-restore-recorder.fixture';
import { encodeBech32 } from './recover';

const escrow = {
  token: 'fixture-escrow-token',
  identity: encodeBech32('age-secret-key-', Buffer.alloc(32, 7)).toUpperCase(),
};

describe('recover.ts record-manifest cause isolation', () => {
  it('retains the exact SDK failure for direct recordManifest callers', async () => {
    const receipt = await runRecorderFixture('matching', escrow, 'direct');
    expect(receipt.sdkFaultReceipt).toBe('publication GetObject fault\n');
    expect(receipt.httpRequests).toBe(0);
    expect(receipt.exitCode).toBe(0);
    expect(receipt.stderr).toBe('');
    const failure: unknown = JSON.parse(receipt.stdout);
    expect(failure).toMatchObject({ message: 'Capture publication request failed' });
    expect(failure).toMatchObject({ exactCause: true });
    expect(failure).toMatchObject({ type: 'CaptureObjectReadError' });
  });

  it('writes only the fixed diagnostic from the actual recover CLI', async () => {
    const receipt = await runRecorderFixture('matching', escrow, 'cli');
    expect(receipt.sdkFaultReceipt).toBe('publication GetObject fault\n');
    expect(receipt.httpRequests).toBe(0);
    expect(receipt.exitCode).toBe(1);
    expect(receipt.stdout).toBe('');
    expect(receipt.stderr).not.toContain('f10-synthetic-private-body');
    expect(receipt.stderr).not.toContain('Credential=f10-synthetic-reader/');
    expect(receipt.stderr).not.toContain('Signature=f10-synthetic-signature');
    expect(receipt.stderr).toBe('Capture publication request failed\n');
  });
});
