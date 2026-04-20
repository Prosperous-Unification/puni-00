export type DbMode = 'local' | 'server';

export interface DbConfig {
  mode: DbMode;
  server?: {
    httpBaseUrl: string;
    wsUrl: string;
    getJwt: () => Promise<string>;
  };
}

export interface CreateDbConfigArgs {
  mode: DbMode;
  httpBaseUrl?: string;
  wsUrl?: string;
  getJwt?: () => Promise<string>;
}

export function createDbConfig(args: CreateDbConfigArgs): DbConfig {
  if (args.mode === 'local') return { mode: 'local' };
  if (!args.httpBaseUrl || !args.wsUrl || !args.getJwt) {
    throw new Error('server mode requires httpBaseUrl, wsUrl, getJwt');
  }
  return {
    mode: 'server',
    server: { httpBaseUrl: args.httpBaseUrl, wsUrl: args.wsUrl, getJwt: args.getJwt },
  };
}
