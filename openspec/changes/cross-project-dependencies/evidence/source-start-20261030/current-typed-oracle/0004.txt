import { createHash } from 'node:crypto';

interface SourceFault {
  readonly name: string;
  readonly closing: boolean;
}
interface ProductFault {
  readonly fault: string;
  readonly wrapper: boolean;
}

export const sourceBytes = (() => {
  const clock = '2026-10-24 08:00:00.000000000 +0000';
  const digest = (label: string) => createHash('sha256').update(label).digest('hex');
  function stat(pid: number, parent: number, ticks: number): string {
    const fields = Array.from({ length: 50 }, () => '1');
    fields[0] = 'S';
    fields[1] = String(parent);
    fields[19] = String(ticks);
    return `${String(pid)} (source) ${fields.join(' ')}`;
  }
  const status = (pid: number, inner: number, host = false) =>
    `Name:\tsource\nTgid:\t${String(pid)}\nUid:\t1000\t1000\t1000\t1000\nNSpid:\t${host ? `${String(pid)}\t` : ''}${String(inner)}\n`;

  function read(path: string, sourceFault: SourceFault) {
    const match = /^\/proc\/(6000[1-9])\/(stat|status|cgroup|uid_map|gid_map)$/.exec(path);
    if (match === null) throw new Error('source fixture host path unsupported');
    const pid = Number(match[1]);
    const inner = pid - 60000;
    switch (match[2]) {
      case 'stat':
        return Promise.resolve(
          stat(
            pid,
            inner === 1
              ? 1
              : inner === 2
                ? 60001
                : inner === 3 && sourceFault.name === 'role-parent'
                  ? 60004
                  : 60002,
            pid +
              100000 +
              ((sourceFault.name === 'pid-reuse' ||
                (sourceFault.name === 'closing-host' && sourceFault.closing)) &&
              inner === 3
                ? 1
                : 0),
          ),
        );
      case 'status':
        return Promise.resolve(status(pid, inner, true));
      case 'cgroup':
        return Promise.resolve('0::/docker/source\n');
      case 'uid_map':
      case 'gid_map':
        return Promise.resolve('0 0 4294967295\n');
      default:
        throw new Error('source fixture host field unsupported');
    }
  }
  function sourceFrames(label: 'before' | 'after', sourceFault: SourceFault): string[] {
    const tokens = ['PASS', label];
    const tiers = ['be-01', 'gw-01', 'mcp-01', 'fe-01'];
    const count = ['extra', 'duplicate'].includes(sourceFault.name) ? 7 : 6;
    for (let pid = 1; pid <= count; pid++) {
      if (sourceFault.name === 'missing' && pid === 5) continue;
      const node = pid === 2 || pid === 6;
      const tier = sourceFault.name === 'duplicate' && pid === 7 ? 'be-01' : tiers[pid - 3];
      const argv =
        pid === 1
          ? ['bun', 'run', 'dev']
          : pid === 2
            ? [
                '/usr/local/bin/node',
                '/src/node_modules/nx/dist/bin/nx.js',
                'run-many',
                '-t',
                'serve',
                '--projects=wbs-be-01,wbs-gw-01,wbs-fe-01,wbs-mcp-01',
              ]
            : pid === 6
              ? ['/usr/local/bin/node', '/src/node_modules/vite/bin/vite.js']
              : ['bun', '--watch', 'src/main.ts'];
      if (sourceFault.name === 'watch' && pid === 3) argv[1] = 'run';
      if (sourceFault.name === 'extra' && pid === 7) argv.splice(0, argv.length, 'helper');
      const cwd = pid < 3 ? '/src' : `/src/apps/wbs/${tier}`;
      tokens.push(
        'PROC',
        String(pid),
        stat(
          pid,
          pid === 1 ? 0 : pid === 2 ? 1 : pid === 3 && sourceFault.name === 'role-parent' ? 4 : 2,
          160000 + pid + (sourceFault.name === 'pid-reuse' && pid === 3 ? 1 : 0),
        ),
        status(pid, pid).replace(
          sourceFault.name === 'uid' && pid === 3 ? /1000/g : /NEVERMATCH/g,
          '0',
        ),
        Buffer.from(argv.join('\0') + '\0').toString('base64'),
        sourceFault.name === 'cwd' && pid === 6 ? '/src/apps/wbs/gw-01' : cwd,
        sourceFault.name === 'exe' && pid === 3
          ? '/usr/local/bin/helper'
          : node
            ? '/usr/local/bin/node'
            : '/usr/local/bin/bun',
        `2049:${node ? '992' : sourceFault.name === 'object' ? '993' : '991'}:123456|${clock}|${clock}`,
        digest(node ? 'source-node' : 'source-bun'),
        'pid:[101]',
        'net:[102]',
        sourceFault.name === 'namespace' && pid === 3 ? 'mnt:[999]' : 'mnt:[103]',
      );
      const socket =
        pid === 7 && sourceFault.name === 'duplicate'
          ? 12343
          : pid >= 3 && pid <= 6
            ? sourceFault.name === 'misassigned' && pid === 3
              ? 12344
              : sourceFault.name === 'misassigned' && pid === 4
                ? 12343
                : 12340 + pid
            : null;
      if (socket !== null && !(sourceFault.name === 'helper-listener' && pid === 3))
        tokens.push('FD', String(pid), '3', `socket:[${String(socket)}]`);
      if (sourceFault.name === 'helper-listener' && pid === 2)
        tokens.push('FD', '2', '3', 'socket:[12343]');
    }
    const tcp =
      '  sl  local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n' +
      [3100, 3200, 3300, 4200]
        .map(
          (port, index) =>
            `  ${String(index)}: 0100007F:${port.toString(16).toUpperCase().padStart(4, '0')} 00000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 ${String(12343 + index)}\n`,
        )
        .join('');
    tokens.push(
      'SELF',
      'pid:[101]',
      'net:[102]',
      'mnt:[103]',
      'TCP',
      '4',
      tcp,
      'TCP',
      '6',
      ' sl local_address rem_address st\n',
      'ADDR',
      '1: lo inet 127.0.0.1/8 scope host lo\n',
    );
    if (
      sourceFault.name === 'listener' ||
      (sourceFault.name === 'closing-listener' && label === 'after')
    )
      return tokens.map((token) =>
        token
          .replaceAll('socket:[12343]', 'socket:[22343]')
          .replace('1000 0 12343\n', '1000 0 22343\n'),
      );
    return tokens;
  }

  return { read, frames: sourceFrames };
})();

export const productBytes = (() => {
  const clock = '2026-10-24 08:00:00.000000000 +0000';
  const metadata = (inode: string) => `2049:${inode}:123456|${clock}|${clock}`;
  const digest = (label: string) => createHash('sha256').update(label).digest('hex');
  const stat = (pid: number, parent: number, ticks: number) => {
    const fields = Array.from({ length: 50 }, () => '1');
    fields[0] = 'S';
    fields[1] = String(parent);
    fields[19] = String(ticks);
    return `${String(pid)} (product) ${fields.join(' ')}`;
  };
  const host = (pid: number) => {
    const inner = pid % 100;
    const root = inner === 1;
    const role = pid >= 50000 ? 'gateway' : 'backend';
    return {
      role,
      inner,
      parent: root ? 1 : pid - 1,
      ticks: pid + 100000,
    };
  };
  const status = (pid: number, inner: number, hostPid = false) =>
    `Name:\tproduct\nTgid:\t${String(pid)}\nUid:\t0\t0\t0\t0\nNSpid:\t${hostPid ? `${String(pid)}\t` : ''}${String(inner)}\n`;

  function read(path: string, current: ProductFault) {
    const match = /^\/proc\/(4000[123]|5000[123])\/(stat|status|cgroup|uid_map|gid_map)$/.exec(
      path,
    );
    if (match === null) throw new Error('modeled host proc path unsupported');
    const pid = Number(match[1]);
    const member = host(pid);
    switch (match[2]) {
      case 'stat':
        return Promise.resolve(stat(pid, member.parent, member.ticks));
      case 'status':
        return Promise.resolve(status(pid, member.inner, true));
      case 'cgroup':
        return Promise.resolve(`0::/docker/${member.role}\n`);
      case 'uid_map':
        if (current.fault === 'host-map') return Promise.resolve('0 1000 4294967295\n');
        return Promise.resolve('0 0 4294967295\n');
      case 'gid_map':
        return Promise.resolve('0 0 4294967295\n');
      default:
        throw new Error('modeled proc field unsupported');
    }
  }
  function productFrames(
    role: 'backend' | 'gateway',
    label: 'before' | 'after',
    current: ProductFault,
  ): string[] {
    const rootPid = role === 'backend' ? 40001 : 50001;
    const cwd = `/app/apps/wbs/${role === 'backend' ? 'be-01' : 'gw-01'}`;
    const port = role === 'backend' ? '0C1C' : '0C80';
    const namespace = { pid: 'pid:[101]', net: 'net:[102]', mnt: 'mnt:[103]' };
    const process = (inner: number) => {
      const root = inner === 1;
      const wrapper = current.wrapper && inner === 2;
      const argv = root
        ? [
            '/sbin/docker-init',
            current.fault === 'init-argv' ? '--changed' : '--',
            ...(role === 'gateway' ? ['/usr/local/bin/docker-entrypoint.sh'] : []),
            'bun',
            'run',
            'src/main.ts',
          ]
        : current.fault === 'wrapper-argv' && wrapper
          ? ['/usr/local/bin/bun', 'run', 'src/main.ts']
          : current.wrapper && !wrapper
            ? ['bun', 'src/main.ts']
            : ['bun', 'run', 'src/main.ts'];
      const executable = root ? '/sbin/docker-init' : '/usr/local/bin/bun';
      const inode = root
        ? current.fault === 'init-object'
          ? '993'
          : '991'
        : wrapper && current.fault === 'wrapper-object'
          ? '994'
          : !wrapper && current.fault === 'application-object'
            ? '995'
            : '992';
      return [
        'PROC',
        String(inner),
        stat(inner, root ? 0 : inner - 1, rootPid + inner + 100000 - 1),
        status(inner, inner),
        Buffer.from(`${argv.join('\0')}\0`).toString('base64'),
        root
          ? current.fault === 'init-cwd'
            ? '/changed'
            : cwd
          : wrapper && current.fault === 'wrapper-cwd'
            ? '/changed'
            : cwd,
        executable,
        metadata(inode),
        digest(`${role}-${root ? 'init' : 'bun'}`),
        namespace.pid,
        namespace.net,
        current.fault === 'mount' && !root ? 'mnt:[999]' : namespace.mnt,
      ];
    };
    const tcp = `  sl  local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n  0: 0100007F:${port} 00000000:0000 0A 00000000:00000000 00:00000000 00000000 0 0 12345\n`;
    return [
      'PASS',
      label,
      ...process(1),
      ...(current.fault === 'listener-owner' ? ['FD', '1', '3', 'socket:[12345]'] : []),
      ...process(2),
      ...(current.wrapper ? process(3) : []),
      ...(current.fault === 'listener-owner'
        ? []
        : ['FD', current.wrapper ? '3' : '2', '3', 'socket:[12345]']),
      'SELF',
      namespace.pid,
      namespace.net,
      namespace.mnt,
      'TCP',
      '4',
      tcp,
      'TCP',
      '6',
      '  sl  local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n',
      'ADDR',
      '1: lo inet 127.0.0.1/8 scope host lo\n',
    ];
  }

  return { read, frames: productFrames };
})();
