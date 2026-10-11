import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import {
  readSshTransport,
  renderApiForwardArguments,
  renderControllerTransport,
  renderSshDiscoveryVariables,
  type SshTransport,
  SshTransportRefusal,
  type SshTransportRefusalReason,
} from './ssh-transport';

const pinnedHosts =
  '10.1.0.4 ssh-ed25519 AAAAC3NzaH4claw\n10.1.0.2,h3mon ssh-ed25519 AAAAC3NzaH3mon\n';

let directory: string;
let agentSocket: string;
let agentServer: ReturnType<typeof Bun.listen> | undefined;
// A real socket whose `:` would split Docker's `--volume source:target` specification.
let unmountableSocket: string;
let unmountableServer: ReturnType<typeof Bun.listen> | undefined;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fleet-ssh-transport-'));
  agentSocket = join(directory, 'agent.sock');
  agentServer = Bun.listen({ unix: agentSocket, socket: { data: () => undefined } });
  unmountableSocket = join(directory, 'agent:1.sock');
  unmountableServer = Bun.listen({ unix: unmountableSocket, socket: { data: () => undefined } });
});

afterAll(() => {
  agentServer?.stop(true);
  unmountableServer?.stop(true);
});

async function writeOwnerOnly(path: string, source: string): Promise<string> {
  await writeFile(path, source);
  await chmod(path, 0o600);
  return path;
}

/** One isolated transport file and known_hosts per case, both owner-only unless overridden. */
async function transportCase(
  name: string,
  transport: unknown,
  knownHosts: string | null = pinnedHosts,
): Promise<string> {
  const caseDirectory = join(directory, name);
  await mkdir(caseDirectory);
  const knownHostsFile = join(caseDirectory, 'known_hosts');
  if (knownHosts !== null) await writeOwnerOnly(knownHostsFile, knownHosts);
  const source =
    typeof transport === 'string'
      ? transport
      : JSON.stringify(transport, (_key, value: unknown) =>
          value === '<known_hosts>' ? knownHostsFile : value,
        );
  return writeOwnerOnly(join(caseDirectory, 'transport.json'), source);
}

async function expectRefusal(
  attempt: Promise<unknown>,
  reason: SshTransportRefusalReason,
  diagnostic: RegExp,
): Promise<void> {
  let refusal: unknown;
  try {
    await attempt;
  } catch (cause) {
    refusal = cause;
  }
  // The reason and message are compared together so a failure names the case that advanced.
  expect(
    refusal instanceof SshTransportRefusal ? [refusal.reason, refusal.message] : refusal,
  ).toEqual([reason, expect.stringMatching(diagnostic)]);
}

const addresses = ['10.1.0.4', '10.1.0.2'];

describe('readSshTransport', () => {
  it('validates user, pinned known_hosts, jump, and the forwarded agent into one record', async () => {
    const path = await transportCase('valid', {
      user: 'puni-fleet',
      knownHostsFile: '<known_hosts>',
      jump: { user: 'puni1', address: 'h3mon' },
    });
    const transport = await readSshTransport(path, { SSH_AUTH_SOCK: agentSocket }, addresses);
    expect(transport).toEqual({
      user: 'puni-fleet',
      knownHostsFile: join(directory, 'valid', 'known_hosts'),
      agentSocket,
      jump: { user: 'puni1', address: 'h3mon' },
    });
  });

  it('refuses every unusable transport with a typed reason before any host is reached', async () => {
    const valid = { user: 'puni-fleet', knownHostsFile: '<known_hosts>' };
    const env = { SSH_AUTH_SOCK: agentSocket };
    const cases: readonly {
      readonly name: string;
      readonly transport: unknown;
      readonly knownHosts?: string | null;
      readonly env?: Readonly<Record<string, string | undefined>>;
      readonly reason: SshTransportRefusalReason;
      readonly diagnostic: RegExp;
    }[] = [
      {
        name: 'malformed-json',
        transport: '{',
        reason: 'transport-malformed',
        diagnostic: /malformed JSON/,
      },
      {
        name: 'array-transport',
        transport: '[]',
        reason: 'transport-malformed',
        diagnostic: /not an object/,
      },
      {
        name: 'unknown-option',
        transport: { ...valid, sshArgs: '-o StrictHostKeyChecking=no' },
        reason: 'transport-malformed',
        diagnostic: /unexpected field sshArgs/,
      },
      {
        name: 'missing-user',
        transport: { knownHostsFile: '<known_hosts>' },
        reason: 'user-invalid',
        diagnostic: /user/,
      },
      {
        name: 'option-user',
        transport: { ...valid, user: '-oProxyCommand=sh' },
        reason: 'user-invalid',
        diagnostic: /user/,
      },
      {
        name: 'missing-known-hosts-field',
        transport: { user: 'puni-fleet' },
        reason: 'transport-malformed',
        diagnostic: /knownHostsFile/,
      },
      {
        name: 'relative-known-hosts',
        transport: { ...valid, knownHostsFile: 'known_hosts' },
        reason: 'transport-malformed',
        diagnostic: /knownHostsFile/,
      },
      {
        name: 'jump-without-user',
        transport: { ...valid, jump: { address: 'h3mon' } },
        reason: 'jump-invalid',
        diagnostic: /jump/,
      },
      {
        name: 'jump-extra-field',
        transport: { ...valid, jump: { user: 'puni1', address: 'h3mon', port: 2222 } },
        reason: 'jump-invalid',
        diagnostic: /\{user, address\}/,
      },
      {
        name: 'jump-option-address',
        transport: { ...valid, jump: { user: 'puni1', address: '-oProxyCommand=sh' } },
        reason: 'jump-invalid',
        diagnostic: /jump/,
      },
      {
        name: 'absent-known-hosts',
        transport: valid,
        knownHosts: null,
        reason: 'known-hosts-unreadable',
        diagnostic: /known_hosts/,
      },
      {
        name: 'empty-known-hosts',
        transport: valid,
        knownHosts: '# reviewed keys go here\n',
        reason: 'known-hosts-malformed',
        diagnostic: /no host key/,
      },
      {
        name: 'truncated-known-hosts',
        transport: valid,
        knownHosts: `${pinnedHosts}10.1.0.9 ssh-ed25519\n`,
        reason: 'known-hosts-malformed',
        diagnostic: /line 3/,
      },
      {
        name: 'unpinned-target',
        transport: valid,
        knownHosts: '10.1.0.4 ssh-ed25519 AAAAC3NzaH4claw\n',
        reason: 'host-unpinned',
        diagnostic: /10\.1\.0\.2/,
      },
      {
        name: 'revoked-only-target',
        transport: valid,
        knownHosts:
          '10.1.0.4 ssh-ed25519 AAAAC3NzaH4claw\n@revoked 10.1.0.2 ssh-ed25519 AAAAC3NzaOld\n',
        reason: 'host-unpinned',
        diagnostic: /10\.1\.0\.2/,
      },
      {
        name: 'unpinned-jump',
        transport: { ...valid, jump: { user: 'puni1', address: '10.1.0.3' } },
        reason: 'host-unpinned',
        diagnostic: /10\.1\.0\.3/,
      },
      {
        name: 'agent-unset',
        transport: valid,
        env: {},
        reason: 'agent-unavailable',
        diagnostic: /SSH_AUTH_SOCK must name/,
      },
      {
        name: 'agent-unmountable',
        transport: valid,
        env: { SSH_AUTH_SOCK: unmountableSocket },
        reason: 'agent-unavailable',
        diagnostic: /SSH_AUTH_SOCK must name/,
      },
      {
        name: 'agent-absent',
        transport: valid,
        env: { SSH_AUTH_SOCK: join(directory, 'gone', 'agent.sock') },
        reason: 'agent-unavailable',
        diagnostic: /is absent/,
      },
      {
        name: 'agent-not-socket',
        transport: valid,
        env: { SSH_AUTH_SOCK: join(directory, 'valid', 'known_hosts') },
        reason: 'agent-unavailable',
        diagnostic: /not a socket/,
      },
    ];
    for (const fault of cases) {
      const path = await transportCase(fault.name, fault.transport, fault.knownHosts);
      await expectRefusal(
        readSshTransport(path, fault.env ?? env, addresses),
        fault.reason,
        fault.diagnostic,
      );
    }
  });

  it('distinguishes an absent, unreadable, or shared transport and known_hosts', async () => {
    const env = { SSH_AUTH_SOCK: agentSocket };
    await expectRefusal(
      readSshTransport(join(directory, 'absent.json'), env, addresses),
      'transport-unreadable',
      /absent\.json/,
    );
    await expectRefusal(
      readSshTransport(directory, env, addresses),
      'transport-unreadable',
      /Cannot read/,
    );
    const sharedTransport = await transportCase('shared-transport', {
      user: 'puni-fleet',
      knownHostsFile: '<known_hosts>',
    });
    await chmod(sharedTransport, 0o644);
    await expectRefusal(
      readSshTransport(sharedTransport, env, addresses),
      'insecure-permissions',
      /owner-only/,
    );
    const sharedKnownHosts = await transportCase('shared-known-hosts', {
      user: 'puni-fleet',
      knownHostsFile: '<known_hosts>',
    });
    await chmod(join(directory, 'shared-known-hosts', 'known_hosts'), 0o664);
    await expectRefusal(
      readSshTransport(sharedKnownHosts, env, addresses),
      'insecure-permissions',
      /known_hosts.*owner-only/,
    );
    const directoryKnownHosts = await transportCase('directory-known-hosts', {
      user: 'puni-fleet',
      knownHostsFile: directory,
    });
    await expectRefusal(
      readSshTransport(directoryKnownHosts, env, addresses),
      'known-hosts-unreadable',
      /Cannot read/,
    );
  });
});

const transport: SshTransport = {
  user: 'puni-fleet',
  knownHostsFile: '/home/puni1/.puni/fleet/ops/known_hosts',
  agentSocket: '/tmp/ssh-agent/agent.42',
};

describe('renderSshDiscoveryVariables', () => {
  it('pins the user and exactly the reviewed host keys, never accepting a new key', () => {
    expect(renderSshDiscoveryVariables(transport)).toEqual({
      ansible_user: 'puni-fleet',
      ansible_ssh_common_args:
        '-o UserKnownHostsFile=/home/puni1/.puni/fleet/ops/known_hosts -o GlobalKnownHostsFile=/dev/null -o StrictHostKeyChecking=yes -o BatchMode=yes',
    });
  });

  it('pins the jump host with the same known_hosts inside its ProxyCommand', () => {
    const { ansible_ssh_common_args: commonArgs } = renderSshDiscoveryVariables({
      ...transport,
      jump: { user: 'puni1', address: '10.1.0.3' },
    });
    expect(commonArgs).toBe(
      "-o UserKnownHostsFile=/home/puni1/.puni/fleet/ops/known_hosts -o GlobalKnownHostsFile=/dev/null -o StrictHostKeyChecking=yes -o BatchMode=yes -o 'ProxyCommand=ssh -o UserKnownHostsFile=/home/puni1/.puni/fleet/ops/known_hosts -o GlobalKnownHostsFile=/dev/null -o StrictHostKeyChecking=yes -o BatchMode=yes -l puni1 -W %h:%p 10.1.0.3'",
    );
    expect(commonArgs).not.toMatch(/StrictHostKeyChecking=(?:no|accept-new|off)/);
  });
});

describe('renderControllerTransport', () => {
  it('mounts known_hosts read-only, forwards only the validated agent, and forces host-key checking', () => {
    expect(renderControllerTransport(transport)).toEqual([
      '--volume',
      '/home/puni1/.puni/fleet/ops/known_hosts:/home/puni1/.puni/fleet/ops/known_hosts:ro',
      '--volume',
      '/tmp/ssh-agent/agent.42:/tmp/ssh-agent/agent.42',
      '--env',
      'SSH_AUTH_SOCK=/tmp/ssh-agent/agent.42',
      '--env',
      'ANSIBLE_HOST_KEY_CHECKING=True',
    ]);
  });
});

describe('renderApiForwardArguments', () => {
  it('renders a loopback-only pinned forward that exits when the forward fails', () => {
    expect(
      renderApiForwardArguments(
        { ...transport, jump: { user: 'puni1', address: '10.1.0.3' } },
        '10.1.0.4',
        40123,
        6443,
      ),
    ).toEqual([
      '-N',
      '-o',
      'UserKnownHostsFile=/home/puni1/.puni/fleet/ops/known_hosts',
      '-o',
      'GlobalKnownHostsFile=/dev/null',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'BatchMode=yes',
      '-o',
      'ProxyCommand=ssh -o UserKnownHostsFile=/home/puni1/.puni/fleet/ops/known_hosts -o GlobalKnownHostsFile=/dev/null -o StrictHostKeyChecking=yes -o BatchMode=yes -l puni1 -W %h:%p 10.1.0.3',
      '-o',
      'ExitOnForwardFailure=yes',
      '-l',
      'puni-fleet',
      '-L',
      '127.0.0.1:40123:127.0.0.1:6443',
      '10.1.0.4',
    ]);
  });

  it('refuses a forward host that ssh could read as an option', () => {
    expect(() => renderApiForwardArguments(transport, '-oProxyCommand=sh', 40123, 6443)).toThrow(
      SshTransportRefusal,
    );
  });
});
