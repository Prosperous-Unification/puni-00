export interface SshTarget {
  host: string;
  user: string;
  port?: number;
  identityFile?: string;
}

const DEFAULT_OPTS = ['-o', 'StrictHostKeyChecking=accept-new', '-o', 'ServerAliveInterval=30'];

export function buildSshCommand(target: SshTarget, remoteCmd: string): string[] {
  const port = target.port ? ['-p', String(target.port)] : [];
  const ident = target.identityFile ? ['-i', target.identityFile] : [];
  return ['ssh', ...DEFAULT_OPTS, ...port, ...ident, `${target.user}@${target.host}`, remoteCmd];
}

export function buildScpCommand(target: SshTarget, from: string, remotePath: string): string[] {
  const port = target.port ? ['-P', String(target.port)] : [];
  const ident = target.identityFile ? ['-i', target.identityFile] : [];
  return [
    'scp',
    ...DEFAULT_OPTS,
    ...port,
    ...ident,
    from,
    `${target.user}@${target.host}:${remotePath}`,
  ];
}
