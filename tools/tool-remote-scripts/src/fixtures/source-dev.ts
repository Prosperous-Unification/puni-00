import { envLayout, sourceDevContract } from '../lib/env';

export function sourceFixture(init: boolean | null = null) {
  const layout = envLayout('dev');
  const contract = sourceDevContract(layout);
  return {
    Id: 'a'.repeat(64),
    Path: 'bun',
    Args: ['run', 'dev'],
    Name: `/${contract.name}`,
    Image: `sha256:${'b'.repeat(64)}`,
    Config: {
      Image: contract.image,
      WorkingDir: '/src',
      Cmd: ['bun', 'run', 'dev'],
      Entrypoint: null,
      User: '1000:1000',
      Labels: {
        'com.docker.compose.service': contract.service,
        'com.docker.compose.project': contract.project,
      },
    },
    HostConfig: {
      Init: init,
      PidMode: '',
      Privileged: false,
      CapAdd: null,
      NetworkMode: layout.network,
      RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 },
    },
    Mounts: contract.mounts.map((mount) => ({
      Type: 'bind',
      Source: mount.source,
      Destination: mount.target,
      RW: mount.writable,
    })),
    NetworkSettings: { Networks: { [layout.network]: { NetworkID: 'c'.repeat(64) } } },
    RestartCount: 0,
    State: {
      Running: true,
      Paused: false,
      Restarting: false,
      Dead: false,
      OOMKilled: false,
      Pid: 100,
      Status: 'running',
      StartedAt: '2026-10-23T00:00:00Z',
      FinishedAt: '0001-01-01T00:00:00Z',
      ExitCode: 0,
      Error: '',
    },
  };
}
