import { readFile } from 'node:fs/promises';

import { expect, it } from 'bun:test';

it('explicit scratch mode provisions one bounded volume and existing registry mode refuses it', async () => {
  const helper = process.env['REGISTRY_STORAGE_SSH'];
  const host = process.env['REGISTRY_STORAGE_HOST'];
  if (helper === undefined || host === undefined)
    throw new Error(
      'REGISTRY_STORAGE_SSH and REGISTRY_STORAGE_HOST are required for native scratch proof',
    );
  const storage = await readFile(
    new URL('../roles/registry_storage/files/storage.sh', import.meta.url),
    'utf8',
  );
  const script = `python3 - <<'PY'
import base64,json,os,subprocess,tempfile,pathlib
root=pathlib.Path(tempfile.mkdtemp(prefix='puni-registry-scratch-',dir='/var/tmp'))
os.chmod(root,0o755)
assert os.statvfs('/').f_bavail*os.statvfs('/').f_frsize>=21*1024**3
script=root/'storage.sh';script.write_bytes(base64.b64decode('${Buffer.from(storage).toString('base64')}'))
(root/'fstab').write_text(f'{root}/scratch.ext4 {root}/scratch ext4 loop,noauto,nodiscard,X-fstrim.notrim 0 0\\n')
config={'directory':str(root),'rootReserveBytes':20*1024**3,'fstab':str(root/'fstab'),'volumes':[{'name':'scratch','bytes':32*1024**2,'uid':59001}]}
(root/'config.json').write_text(json.dumps(config))
def run(mode): return subprocess.run(['sh',str(script),mode,str(root/'config.json')],capture_output=True,text=True)
try:
 assert run('provision').returncode!=0
 assert not (root/'scratch.ext4').exists()
 completed=run('provision-scratch');assert completed.returncode==0,completed.stderr
 assert run('verify-scratch').returncode==0
 assert (root/'identities/scratch.receipt').is_file()
 assert (root/'scratch/contents').stat().st_uid==59001
 before=(root/'scratch.ext4').stat().st_blocks
 saturated=subprocess.run(['setpriv','--reuid=59001','--regid=59001','--clear-groups','dd','if=/dev/zero',f'of={root}/scratch/contents/fill','bs=1M','count=40'],capture_output=True,text=True)
 assert saturated.returncode!=0 and 'No space left' in saturated.stderr, (saturated.returncode,saturated.stderr)
 assert before==(root/'scratch.ext4').stat().st_blocks
 assert os.statvfs('/').f_bavail*os.statvfs('/').f_frsize>=20*1024**3
 (root/'scratch/contents/fill').unlink()
 subprocess.run(['umount',str(root/'scratch')],check=True)
 assert run('verify-scratch').returncode!=0
 assert run('mount-scratch').returncode==0
 config['volumes']=[{'name':'registry','bytes':32*1024**2,'uid':59001},{'name':'journal','bytes':32*1024**2,'uid':59001}]
 (root/'config.json').write_text(json.dumps(config))
 assert run('provision-scratch').returncode!=0
 print('PASS scratch cross-mode, mount, identity, ownership, physical ENOSPC',flush=True)
finally:
 if os.path.ismount(root/'scratch'): subprocess.run(['umount',str(root/'scratch')],check=True)
 loops=json.loads(subprocess.check_output(['losetup','--json','--list','--output','NAME,BACK-FILE'],text=True))['loopdevices']
 for loop in loops:
  if loop['back-file']==str(root/'scratch.ext4'): subprocess.run(['losetup','-d',loop['name']],check=True)
 for name in ['scratch.ext4','scratch.identity.json','storage.lock','config.json','fstab','storage.sh','identities/scratch.receipt']:
  path=root/name
  if path.exists():path.unlink()
 for name in ['scratch','identities']:
  path=root/name
  if path.exists():path.rmdir()
 root.rmdir();print('CLEANUP '+str(root)+' absent='+str(not root.exists()),flush=True)
PY`;
  const child = Bun.spawn([helper, host, script], { stdout: 'pipe', stderr: 'pipe' });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  console.log(stdout);
  expect(stderr).toBe('');
  expect(code).toBe(0);
  expect(stdout).toContain('PASS scratch cross-mode, mount, identity, ownership, physical ENOSPC');
  expect(stdout).toContain('absent=True');
}, 120000);
