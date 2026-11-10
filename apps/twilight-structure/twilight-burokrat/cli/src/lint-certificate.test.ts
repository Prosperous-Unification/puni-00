import { expect, it } from 'bun:test';

import { hasEnforceCertificate } from './lint-certificate';

const certificate = {
  schemaVersion: 1,
  mode: 'enforce',
  trustProvenance: 'ci-preselected',
  accepted: true,
  certified: true,
};
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
it('recognizes the complete enforce certificate and permits extra report fields', () => {
  expect(hasEnforceCertificate(bytes(certificate))).toBe(true);
  expect(hasEnforceCertificate(bytes({ ...certificate, diagnostics: [], retained: 'extra' }))).toBe(
    true,
  );
});
for (const field of ['schemaVersion', 'mode', 'trustProvenance', 'accepted', 'certified'] as const)
  it('refuses a certificate missing ' + field, () => {
    const incomplete = { ...certificate };
    Reflect.deleteProperty(incomplete, field);
    expect(hasEnforceCertificate(bytes(incomplete))).toBe(false);
  });
for (const [field, value] of [
  ['schemaVersion', 2],
  ['mode', 'observe'],
  ['trustProvenance', 'local'],
  ['accepted', false],
  ['certified', false],
] as const)
  it('refuses an incorrect certificate ' + field, () => {
    expect(hasEnforceCertificate(bytes({ ...certificate, [field]: value }))).toBe(false);
  });
for (const [label, invalid] of [
  ['empty', Buffer.alloc(0)],
  ['malformed', Buffer.from('not JSON')],
  ['invalid UTF8', Buffer.from([255])],
  ['null', bytes(null)],
  ['array', bytes([])],
] as const)
  it('refuses ' + label + ' certificate bytes', () => {
    expect(hasEnforceCertificate(invalid)).toBe(false);
  });

it('preserves unexpected certificate decoder failure identity', () => {
  const program = [
    'import{mock}from"bun:test";const cause=new TypeError("injected decoder failure");',
    'mock.module(' +
      JSON.stringify(new URL('./json-input.ts', import.meta.url).href) +
      ',()=>({decodeJsonInput:()=>{throw cause;},JsonInputRefusal:class extends Error{}}));',
    'const{hasEnforceCertificate}=await import(' +
      JSON.stringify(new URL('./lint-certificate.ts', import.meta.url).href) +
      ');let same=false;try{hasEnforceCertificate(Buffer.from("{}"));}catch(caught){same=caught===cause;}process.stdout.write(JSON.stringify({same}));',
  ].join('\n');
  const child = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
    {
      cwd: import.meta.dir,
      env: { PATH: '/usr/bin:/bin' },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 10000,
    },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(child.stdout.toString()).toBe('{"same":true}');
});
