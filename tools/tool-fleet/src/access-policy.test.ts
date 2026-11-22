import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { judgeAccessPolicy, parseHujson } from './access-policy';

const policyPath = join(import.meta.dir, '../../../infra/access/policy.hujson');

async function committedPolicy(): Promise<Record<string, unknown>> {
  return parseHujson(await readFile(policyPath, 'utf8')) as Record<string, unknown>;
}

interface Grant {
  src: string[];
  dst: string[];
  ip: string[];
}
const grantsOf = (policy: Record<string, unknown>) => policy['grants'] as Grant[];

describe('the tailnet policy file', () => {
  it('parses and gives each tag exactly its row of design decision 12', async () => {
    expect(judgeAccessPolicy(await committedPolicy())).toEqual([]);
  });

  it('parses comments and trailing commas but not a malformed file', () => {
    expect(parseHujson('// a\n{ "a": [1, 2,], /* b */ "c": "//not a comment", }')).toEqual({
      a: [1, 2],
      c: '//not a comment',
    });
    expect(() => parseHujson('{ "a": }')).toThrow(/policy\.hujson is not valid HuJSON/);
  });

  it('refuses a server tag that may reach another device', async () => {
    // Proof: comparing tag names only made this and the three cases below resolve (2026-11-22).
    const policy = await committedPolicy();
    grantsOf(policy).push({ src: ['tag:apps'], dst: ['tag:platform'], ip: ['tcp:6443'] });
    expect(judgeAccessPolicy(policy)).toEqual([
      'tag:apps may reach tag:platform:tcp:6443; its row allows nothing',
    ]);
  });

  it('refuses the CI trigger reaching anything but the CI cluster proxy', async () => {
    const policy = await committedPolicy();
    grantsOf(policy).push({ src: ['tag:ci-trigger'], dst: ['tag:ci'], ip: ['tcp:6443'] });
    expect(judgeAccessPolicy(policy)).toEqual([
      'tag:ci-trigger may reach tag:ci:tcp:6443; its row allows tag:ci-api-proxy:tcp:443',
    ]);
  });

  it("refuses the operators' or their proxies' tags opening a connection", async () => {
    const policy = await committedPolicy();
    grantsOf(policy).push(
      { src: ['tag:platform-operator'], dst: ['tag:platform'], ip: ['*'] },
      { src: ['tag:ci-proxy'], dst: ['tag:ci'], ip: ['tcp:6443'] },
    );
    expect(judgeAccessPolicy(policy)).toEqual([
      'tag:platform-operator may reach tag:platform:*; its row allows nothing',
      'tag:ci-proxy may reach tag:ci:tcp:6443; its row allows nothing',
    ]);
  });

  it("refuses SSH to a server for the tailnet's admins", async () => {
    const policy = await committedPolicy();
    grantsOf(policy)[0].ip.push('tcp:22');
    expect(judgeAccessPolicy(policy).join('\n')).toMatch(
      /autogroup:admin may reach tag:platform:tcp:22/,
    );
  });

  it('refuses a policy that names a person, in a group or a grant', async () => {
    // Proof: skipping the check for groups made the first case resolve (2026-11-22).
    const grouped = await committedPolicy();
    grouped['groups'] = { 'group:owners': ['someone@example.test'] };
    expect(judgeAccessPolicy(grouped)).toEqual([
      'group:owners names someone@example.test, not a tag or a built-in group',
    ]);
    const granted = await committedPolicy();
    grantsOf(granted).push({ src: ['someone@example.test'], dst: ['tag:ci'], ip: ['tcp:6443'] });
    expect(judgeAccessPolicy(granted).join('\n')).toMatch(
      /grant 4 names someone@example\.test, not a tag or a built-in group/,
    );
  });

  it('refuses Tailscale SSH rules and sections the decision does not use', async () => {
    const policy = await committedPolicy();
    policy['ssh'] = [];
    policy['autoApprovers'] = {};
    expect(judgeAccessPolicy(policy)).toEqual([
      'policy has sections other than tagOwners and grants: autoApprovers, ssh',
    ]);
  });
});
