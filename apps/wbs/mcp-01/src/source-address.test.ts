import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { sourceAddressOf, UNATTRIBUTED_SOURCE } from './source-address';

const ipv4 = fc.ipV4();

describe('the source address under MCP_TRUSTED_PROXY_HOPS', () => {
  it('takes the entry hops from the right, whatever the client wrote left of it', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(ipv4, fc.string()), { maxLength: 5 }),
        fc.array(ipv4, { minLength: 1, maxLength: 4 }),
        (spoofed, written) => {
          const header = [...spoofed, ...written].join(', ');
          expect(sourceAddressOf(header, '10.0.0.9', written.length)).toBe(written[0] ?? '');
        },
      ),
    );
  });

  it('reads the socket address with 0 hops and ignores the header', () => {
    expect(sourceAddressOf('1.2.3.4', '198.51.100.7', 0)).toBe('198.51.100.7');
    expect(sourceAddressOf(null, '2001:db8::1', 0)).toBe('2001:db8::1');
  });

  it('joins several headers in order, as Headers.get does', () => {
    const headers = new Headers();
    headers.append('x-forwarded-for', '1.2.3.4');
    headers.append('x-forwarded-for', '203.0.113.5');
    expect(sourceAddressOf(headers.get('x-forwarded-for'), null, 1)).toBe('203.0.113.5');
  });

  it('counts a request the proxies did not write as unattributed', () => {
    expect(sourceAddressOf(null, '10.0.0.9', 1)).toBe(UNATTRIBUTED_SOURCE);
    expect(sourceAddressOf('203.0.113.5', '10.0.0.9', 2)).toBe(UNATTRIBUTED_SOURCE);
    expect(sourceAddressOf('203.0.113.5, unknown', '10.0.0.9', 1)).toBe(UNATTRIBUTED_SOURCE);
    expect(sourceAddressOf('', '10.0.0.9', 1)).toBe(UNATTRIBUTED_SOURCE);
    expect(sourceAddressOf('1.2.3.4', null, 0)).toBe(UNATTRIBUTED_SOURCE);
  });
});
