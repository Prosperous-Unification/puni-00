import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** Fixed offline seed; bounded bootstrap categories also reach console before protocol admission. */
export async function renderLabGuestNoCloud(nonce: string) {
  // Proof: removing the nonce guard made the malformed-nonce negative resolve (renderer-fault.log).
  if (!/^[a-f0-9]{32}$/.test(nonce) || nonce.length !== 32)
    throw new Error('Baseline nonce must be exactly 32 lowercase hexadecimal characters');
  const bootstrap = await readFile(new URL('./lab-guest-bootstrap.py', import.meta.url), 'utf8');
  const digest = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
  const bootstrapSha256 = digest(bootstrap);
  const request = JSON.stringify({ schemaVersion: 1, nonce, bootstrapSha256 }) + '\n';
  const config = {
    users: [],
    disable_root: true,
    ssh_pwauth: false,
    ssh_deletekeys: true,
    ssh_keys: {},
    package_update: false,
    package_upgrade: false,
    write_files: [
      {
        path: '/opt/puni-baseline/bootstrap.py',
        permissions: '0500',
        owner: 'root:root',
        content: bootstrap,
      },
      {
        path: '/opt/puni-baseline/request.json',
        permissions: '0400',
        owner: 'root:root',
        content: request,
      },
    ],
    runcmd: [
      [
        '/usr/bin/systemd-run',
        '--unit=puni-baseline',
        '--service-type=exec',
        '--no-block',
        '--property=MemoryMax=128M',
        '--property=MemorySwapMax=0',
        '--property=TasksMax=32',
        '--property=RuntimeMaxSec=750',
        '--property=TimeoutStopSec=30',
        '--property=KillMode=control-group',
        '--property=Restart=no',
        '--property=LimitFSIZE=65536',
        '--property=LimitNOFILE=64',
        '--property=LimitCORE=0',
        '--property=UMask=0077',
        // Proof: omitted console routing failed the rendered preidentity-diagnostic contract.
        '--property=StandardError=journal+console',
        '/usr/bin/python3',
        '/opt/puni-baseline/bootstrap.py',
        '/opt/puni-baseline/request.json',
      ],
    ],
  };
  return {
    userData: '#cloud-config\n' + JSON.stringify(config) + '\n',
    metaData:
      JSON.stringify({ 'instance-id': `puniq-${nonce}`, 'local-hostname': 'puni-baseline' }) + '\n',
    networkConfig: JSON.stringify({ version: 2, ethernets: {} }) + '\n',
    bootstrapSha256,
    requestSha256: digest(request),
    smbios: {
      manufacturer: 'QEMU',
      product: 'Puni bounded baseline',
      uuid: `${nonce.slice(0, 8)}-${nonce.slice(8, 12)}-${nonce.slice(12, 16)}-${nonce.slice(16, 20)}-${nonce.slice(20)}`,
    },
  };
}
