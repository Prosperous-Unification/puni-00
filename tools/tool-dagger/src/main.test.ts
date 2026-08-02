import { describe, expect, it } from 'bun:test';

import { applyRunnerHostAlias, requireRegistryPassword } from './main';

describe('applyRunnerHostAlias', () => {
  it('populates the real variable when only the friendly one is set', () => {
    const env: NodeJS.ProcessEnv = { DAGGER_RUNNER_HOST: 'tcp://127.0.0.1:8080' };
    applyRunnerHostAlias(env);
    expect(env['_EXPERIMENTAL_DAGGER_RUNNER_HOST']).toBe('tcp://127.0.0.1:8080');
  });

  it('leaves an already-set real variable untouched', () => {
    const env: NodeJS.ProcessEnv = {
      DAGGER_RUNNER_HOST: 'tcp://127.0.0.1:9999',
      _EXPERIMENTAL_DAGGER_RUNNER_HOST: 'tcp://127.0.0.1:8080',
    };
    applyRunnerHostAlias(env);
    expect(env['_EXPERIMENTAL_DAGGER_RUNNER_HOST']).toBe('tcp://127.0.0.1:8080');
  });
});

describe('requireRegistryPassword', () => {
  it('returns the password when REGISTRY_PASS is set', () => {
    const env: NodeJS.ProcessEnv = { REGISTRY_PASS: 'hunter2' };
    expect(requireRegistryPassword(env)).toBe('hunter2');
  });

  it('fails fast, naming the variable, rather than allowing an unauthenticated push', () => {
    const env: NodeJS.ProcessEnv = {};
    expect(() => requireRegistryPassword(env)).toThrow(/REGISTRY_PASS/);
  });

  it('treats an empty string the same as unset', () => {
    const env: NodeJS.ProcessEnv = { REGISTRY_PASS: '' };
    expect(() => requireRegistryPassword(env)).toThrow(/REGISTRY_PASS/);
  });
});
