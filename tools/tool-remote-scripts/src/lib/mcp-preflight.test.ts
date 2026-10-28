import { describe, expect, it } from 'bun:test';

import {
  assertMcpSurfaceReady,
  MCP_PREFLIGHT_CLIS,
  mcpPreflightCommand,
  parseAcceptBreaking,
  parseMcpSettingsReport,
} from './mcp-preflight';

const TARGET = {
  image: `registry/wbs-be-01@sha256:${'b'.repeat(64)}`,
  root: '/home/puni1/wbs',
  databasePath: '/data/plan.db',
  envFiles: ['/home/puni1/wbs/be-01.env', '/home/puni1/wbs/be-01.secrets.env'],
  acceptBreaking: [],
};

async function refusal(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
    return 'resolved';
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** A fake Docker answering the settings CLI, then the audience CLI. */
function candidate(settings: string, audiences = '{"breaking":[],"unaccepted":[]}') {
  const ran: string[] = [];
  const log: string[] = [];
  const sh = (args: string[]) => {
    const script = args.at(-1) ?? '';
    if (script.includes(MCP_PREFLIGHT_CLIS.settings)) {
      ran.push('settings');
      return Promise.resolve(settings);
    }
    ran.push('audiences');
    return Promise.resolve(audiences);
  };
  return {
    ran,
    log,
    check: () =>
      assertMcpSurfaceReady(TARGET, sh, (line) => {
        log.push(line);
      }),
  };
}

describe('parseAcceptBreaking', () => {
  it('reads distinct ids and an empty flag as none', () => {
    expect(parseAcceptBreaking('')).toEqual([]);
    expect(parseAcceptBreaking('ti-legacy,00000000-0000-4000-8000-000000000001')).toEqual([
      'ti-legacy',
      '00000000-0000-4000-8000-000000000001',
    ]);
  });

  it('refuses a malformed accept list', () => {
    for (const raw of ['ti-a,,ti-b', 'ti a', 'ti-a,ti-a', ',', "ti-a;rm -rf '/'", 'ti-a,'])
      expect(() => parseAcceptBreaking(raw)).toThrow('--accept-breaking must be distinct ids');
  });
});

describe('parseMcpSettingsReport', () => {
  it('refuses a malformed settings report', () => {
    for (const output of [
      '{"activation":"maybe","authorizationServer":null}',
      '{"activation":"activated","authorizationServer":3}',
      '{"authorizationServer":null}',
      'null',
      '[]',
    ])
      expect(() => parseMcpSettingsReport(output)).toThrow(
        'candidate reported malformed machine grant settings',
      );
    expect(() => parseMcpSettingsReport('not json')).toThrow();
  });
});

describe('mcpPreflightCommand', () => {
  it('runs the candidate offline on the live data with be-01 env files and the accept list', () => {
    const command = mcpPreflightCommand(
      { ...TARGET, acceptBreaking: ['ti-a', 'ti-b'] },
      MCP_PREFLIGHT_CLIS.audiences,
    );
    expect(command.slice(0, 8)).toEqual([
      'run',
      '--rm',
      '--pull',
      'never',
      '--network',
      'none',
      '--mount',
      'type=bind,source=/home/puni1/wbs/data,target=/data',
    ]);
    expect(command).toContain('DB_PATH=/data/plan.db');
    expect(command).toContain('WBS_ACCEPT_BREAKING_AUDIENCES=ti-a,ti-b');
    expect(command.filter((argument) => argument === '--env-file')).toHaveLength(2);
    expect(mcpPreflightCommand(TARGET, MCP_PREFLIGHT_CLIS.audiences).join(' ')).not.toContain(
      'WBS_ACCEPT_BREAKING_AUDIENCES',
    );
  });
});

describe('assertMcpSurfaceReady', () => {
  it('runs the audience check only when the candidate names a server', async () => {
    const without = candidate('{"activation":"pre_activation","authorizationServer":null}');
    await without.check();
    expect(without.ran).toEqual(['settings']);
    const named = candidate(
      '{"activation":"activated","authorizationServer":"https://wbs.example/mcp/oauth"}',
    );
    await named.check();
    expect(named.ran).toEqual(['settings', 'audiences']);
  });

  it('refuses an activated store reported without a server', async () => {
    const activated = candidate('{"activation":"activated","authorizationServer":null}');
    expect(await refusal(activated.check())).toContain('reported no authorization server');
  });

  it('logs a candidate older than either CLI and skips its check', async () => {
    const old = candidate('"cli-absent"');
    await old.check();
    expect(old.ran).toEqual(['settings']);
    expect(old.log.join('\n')).toContain('predates the MCP preflight');
    const partly = candidate(
      '{"activation":"pre_activation","authorizationServer":"https://wbs.example/mcp/oauth"}',
      '"cli-absent"',
    );
    await partly.check();
    expect(partly.log.join('\n')).toContain('the audience preflight is skipped');
  });

  it('refuses a malformed audience check', async () => {
    const malformed = candidate(
      '{"activation":"pre_activation","authorizationServer":"https://wbs.example/mcp/oauth"}',
      '{"unaccepted":[]}',
    );
    expect(await refusal(malformed.check())).toContain('malformed audience check');
  });
});
