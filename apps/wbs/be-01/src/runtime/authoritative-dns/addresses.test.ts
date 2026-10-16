import { describe, expect, it } from 'bun:test';

import { canonicalizeIp, isPublicAuthority, parseResolvers } from './addresses';

describe('explicit authoritative DNS destinations', () => {
  it('keeps absent DNS configuration explicitly disabled', () => {
    expect(parseResolvers(undefined)).toBeUndefined();
  });
  it('accepts operator-controlled private recursive IPs and canonicalizes equivalents', () => {
    expect(parseResolvers('10.0.0.53,2001:4860:4860:0:0:0:0:8888')).toEqual([
      '10.0.0.53',
      '2001:4860:4860::8888',
    ]);
    expect(canonicalizeIp('::ffff:8.8.8.8')).toBe('8.8.8.8');
  });
  it.each([
    '',
    ' ',
    '8.8.8.8,',
    ',8.8.8.8',
    '8.8.8.8, 1.1.1.1',
    'dns.example.com',
    'https://8.8.8.8',
    '8.8.8.8:53',
    '[::1]',
    'fe80::1%eth0',
    '8.8.8.8,8.8.8.8',
    '8.8.8.8,::ffff:808:808',
    '1.1.1.1,2.2.2.2,3.3.3.3,4.4.4.4',
  ])('refuses present invalid resolver configuration %s', (configured) => {
    expect(() => parseResolvers(configured)).toThrow();
  });
  it.each([
    '0.1.2.3',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.1.1',
    '172.16.0.1',
    '192.0.0.9',
    '192.0.2.1',
    '192.31.196.1',
    '192.52.193.1',
    '192.88.99.1',
    '192.168.0.1',
    '192.175.48.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '240.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:c0a8:1',
    '64:ff9b::808:808',
    '100::1',
    '2001::1',
    '2001:1::1',
    '2001:db8::1',
    '2002::1',
    '2620:4f:8000::1',
    '3fff::1',
    '5f00::1',
    'fc00::1',
    'fe80::1',
    'ff02::1',
  ])('refuses special-purpose and mapped endpoints %s', (address) => {
    expect(isPublicAuthority(address)).toBe(false);
  });
  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '2606:4700:4700::1111',
    '2001:4860:4860::8888',
    '::ffff:8.8.8.8',
  ])('admits globally allocated ordinary unicast %s', (address) => {
    expect(isPublicAuthority(address)).toBe(true);
  });
});
