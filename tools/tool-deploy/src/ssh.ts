export interface SshTarget {
  host: string;
  user: string;
}

export function buildSshInvocation(target: SshTarget, remoteCmd: string): string {
  return `ssh ${target.user}@${target.host} ${JSON.stringify(remoteCmd)}`;
}

export function buildScpInvocation(target: SshTarget, src: string, dest: string): string {
  return `scp ${src} ${target.user}@${target.host}:${dest}`;
}
