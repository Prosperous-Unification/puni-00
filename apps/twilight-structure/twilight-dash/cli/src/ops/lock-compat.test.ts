import { expect, it } from 'bun:test';

import { UsageRefusal } from '../cli-parser';
import { readCompatibility } from './lock-compat';

it('decodes only the exact observational legacy status without interpreting queue environment', () => {
  expect(readCompatibility(['status'], { HEAVY_LOCK_POLL_SECONDS: 'invalid' })).toEqual({
    command: 'ops',
    words: 'lock status',
  });
});
it('retains exact legacy payload argv and explicit queue environment without a pathname override', () => {
  const argv = ['program', 'a b', '', '$(literal)', '--value'];
  expect(
    readCompatibility(['--', ...argv], {
      HEAVY_LOCK_LABEL: 'legacy lane',
      HEAVY_LOCK_WAIT_SECONDS: '12',
      HEAVY_LOCK_POLL_SECONDS: '3',
      HEAVY_LOCK_PATH: '/untrusted',
    }),
  ).toEqual({
    command: 'ops',
    words: 'lock run',
    label: 'legacy lane',
    waitSeconds: 12,
    pollSeconds: 3,
    argv,
  });
});
it('models absent and empty optional legacy queue environment using the documented defaults', () => {
  for (const environment of [
    {},
    { HEAVY_LOCK_LABEL: '', HEAVY_LOCK_WAIT_SECONDS: '', HEAVY_LOCK_POLL_SECONDS: '' },
  ])
    expect(readCompatibility(['--', 'program'], environment)).toEqual({
      command: 'ops',
      words: 'lock run',
      label: 'unlabeled',
      waitSeconds: 0,
      pollSeconds: 5,
      argv: ['program'],
    });
});
for (const args of [[], ['status', 'extra'], ['program'], ['--'], ['--', '']])
  it('refuses an unsupported legacy command boundary ' + JSON.stringify(args), () => {
    expect(() => readCompatibility(args, {})).toThrow(UsageRefusal);
  });
for (const [key, values] of [
  ['HEAVY_LOCK_WAIT_SECONDS', ['-1', '1.5', '01', '1e3', '9007199254740992', 'private sentinel']],
  ['HEAVY_LOCK_POLL_SECONDS', ['0', '31', '031', '08', '1.5', 'private sentinel']],
] as const)
  for (const value of values)
    it('refuses malformed ' + key + ' ' + value + ' without quoting its value', () => {
      let refusal: unknown;
      try {
        readCompatibility(['--', 'program'], { [key]: value });
      } catch (cause) {
        refusal = cause;
      }
      expect(refusal).toBeInstanceOf(UsageRefusal);
      if (!(refusal instanceof Error)) throw new Error('usage refusal missing');
      expect(refusal.message).not.toContain(value);
    });
