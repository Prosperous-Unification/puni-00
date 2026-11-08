import argparse
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import signal
import subprocess
import sys
import tarfile
import tempfile
import uuid


def hash_file(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()


def run_command(argv,*,cwd=None,environment=None,stdin=None,timeout=150):
    completed=subprocess.run(argv,cwd=cwd,env=environment,stdin=stdin,capture_output=True,timeout=timeout)
    if len(completed.stdout)>4*1024**2 or len(completed.stderr)>4*1024**2:
        raise RuntimeError('Rehearsal observation exceeds its bound')
    return completed


def compose_case(repository,output,claim,case,removed):
    source=(repository/'infra/ansible/tests/registry-pulls.native.py').read_text()
    before=r'mount --make-rprivate /\nmount -t tmpfs'
    after=r'mount --make-rprivate /\nmkdir "$1/host-alternatives"\nmount --bind /etc/alternatives "$1/host-alternatives"\nmount -o remount,bind,ro "$1/host-alternatives"\nmount -t tmpfs'
    if source.count(before)!=1:raise RuntimeError('Physical fixture namespace prelude changed')
    source=source.replace(before,after)
    tail="if sys.argv[1:2] == ['worker']:worker(Path(sys.argv[2]))\nelse:outer(STORAGE,NATIVE_SOURCE)\n"
    if source.count(tail)!=1:raise RuntimeError('Physical fixture worker boundary changed')
    worker=(repository/'tools/tool-fleet/src/registry-client-role-worker.fixture.py').read_text()
    source=source.replace(tail,'ROLE_STAGE=Path('+repr(claim['path'])+')\nROLE_INPUTS='+repr(claim['files'])+'\nROLE_CASE='+repr(case)+'\nROLE_REMOVE='+repr(removed)+'\n'+worker+'\n'+tail)
    compile(source,'registry-client-role.native.py','exec')
    (output/'composed.py').write_text(source)
    helper=(repository/'infra/ansible/roles/registry_storage/files/storage.sh').read_bytes()
    script='import base64\nSTORAGE=base64.b64decode('+repr(base64.b64encode(helper).decode())+')\nNATIVE_SOURCE=base64.b64decode('+repr(base64.b64encode(source.encode()).decode())+')\nexec(compile(NATIVE_SOURCE,"registry-client-role.native.py","exec"))\n'
    (output/'execute.py').write_text(script)


def transfer_stage(transport,host,header,paths,output,remote,timeout=120):
    # Proof: registry-client-role-transfer.test.ts's stalled reader exceeded the outer deadline before
    # this transfer-wide wait; the same fault now times out and reaps its children.
    with tempfile.TemporaryFile(dir=output) as payload:
        payload.write(header)
        with tarfile.open(fileobj=payload,mode='w|') as package:
            for name,path in paths.items():package.add(path,arcname=name,recursive=False)
        payload.seek(0)
        with (output/'stage.stdout.log').open('x') as stdout,(output/'stage.stderr.log').open('x') as stderr:
            child=subprocess.Popen([str(transport),host,'python3 -c '+shlex.quote(STAGE_CODE)],stdin=payload,stdout=stdout,stderr=stderr,start_new_session=True)
            try:status=child.wait(timeout=timeout)
            except subprocess.TimeoutExpired as cause:
                try:os.killpg(child.pid,signal.SIGKILL)
                except ProcessLookupError:pass  # The owned transport may exit at the deadline.
                child.wait(timeout=5)
                raise RuntimeError('Stage transfer timed out; preserve and inspect the exact owned directory: '+remote) from cause
    return status


def main():
    parser=argparse.ArgumentParser(description='Actual maintenance client role on disposable enforced storage; requires an approved root fixture host.')
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[3])
    parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--transport',required=True,type=Path)
    parser.add_argument('--host',required=True)
    parser.add_argument('--controller-packages',required=True,type=Path)
    parser.add_argument('--bun',required=True,type=Path)
    parser.add_argument('--crane',required=True,type=Path)
    parser.add_argument('--registry',required=True,type=Path)
    cases=['valid','legacy','extra-key','missing-worker','worker-binding','missing-crane','bad-crane','bad-worker','oversized-worker','empty-worker','source-kind','tool-pin','pool-profile','installed-worker','installed-crane','pool-mode','sparse-backing','storage-output','storage-status','validation-output','validation-status']
    parser.add_argument('--case',choices=['all',*cases],default='all')
    parser.add_argument('--remove',choices=['keys','worker-binding','crane-required','size','size-minimum','source-kind','source-hash','storage-output','storage-status','validation-output','validation-status','physical','validation'])
    options=parser.parse_args()
    if options.remove is not None and options.case=='all':raise RuntimeError('A removal requires one explicit observing case')
    for path in [options.root,options.controller_packages,options.bun,options.crane,options.registry]:
        if not path.is_absolute() or path.resolve(strict=True)!=path:raise RuntimeError('Rehearsal inputs must be canonical absolute paths')
    if not options.root.is_dir() or not options.controller_packages.is_dir() or not (options.controller_packages/'ansible/release.py').is_file():raise RuntimeError('Required repository or Ansible package directory is unavailable')
    if not options.transport.is_absolute() or not options.transport.is_file() or not os.access(options.transport,os.X_OK):raise RuntimeError('Explicit fixture transport is unavailable')
    if not options.output.is_absolute() or options.output.exists():raise RuntimeError('Output must be a new absolute owned directory')
    if hash_file(options.bun)!='10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235':raise RuntimeError('Bun differs from its fixed pin')
    if hash_file(options.crane)!='8e75c326adb43b053cfd78b9b987663f8f4fe4557f4d3915905643f25c730992':raise RuntimeError('Crane differs from its fixed pin')
    if hash_file(options.registry)!='8be11cd37a7d43b87e2a2ad11eb5d14dc64d15a040a37485e7e1cbb4c6c9dd37':raise RuntimeError('Distribution differs from its fixed pin')
    output=options.output;output.mkdir(mode=0o700);repository=options.root
    source_paths=list((repository/'tools/tool-fleet/src').rglob('*.ts'))+list((repository/'infra/ansible/roles/registry_storage').rglob('*'))+[Path(__file__).resolve(),repository/'tools/tool-fleet/src/registry-client-role-worker.fixture.py',repository/'infra/ansible/tests/registry-pulls.native.py',repository/'tools/tool-fleet/project.json',repository/'bun.lock',repository/'tsconfig.base.json']
    source_pins={str(path):hash_file(path) for path in source_paths if path.is_file()}
    (output/'source-inputs.json').write_text(json.dumps(source_pins,indent=2)+'\n')
    build=output/'build';build.mkdir()
    project=json.loads((repository/'tools/tool-fleet/project.json').read_text());command=shlex.split(project['targets']['build']['options']['command'])
    if command[:2]!=['bun','build'] or command[-2:]!=['--outdir','dist/tool-fleet'] or '--target=bun' not in command:raise RuntimeError('Reviewed build command changed')
    command[0]=str(options.bun);command[-1]=str(build)
    completed=run_command(command,cwd=repository,timeout=60);(output/'build.stdout.log').write_bytes(completed.stdout);(output/'build.stderr.log').write_bytes(completed.stderr)
    if completed.returncode!=0:raise RuntimeError('Required current CLI build failed')
    built=list(build.rglob('*.js'))
    if len(built)!=12:raise RuntimeError('Expected twelve current built CLI artifacts')
    def select(name):
        matches=[path for path in built if path.name==name+'.js']
        if len(matches)!=1:raise RuntimeError('Built artifact is missing or ambiguous: '+name)
        return matches[0]
    mapping={'activate':'activate-registry','backup':'backup-registry','backup-worker':'registry-backup-worker-cli','host':'registry-maintenance-host-cli','recover':'recover-registry','retire':'retire-registry','status':'registry-maintenance-status','client-worker':'registry-client-worker-cli'}
    paths={'bun':options.bun,'authority.js':select('registry-managed-journal-cli'),'crane':options.crane,'registry':options.registry}
    paths.update({'bundles/'+name+'.js':select(entry) for name,entry in mapping.items()})
    enrollment=output/'enrollment.ts';enrollment.write_text('import {createRegistryInstallation} from '+json.dumps(str(repository/'tools/tool-fleet/src/registry-installation.fixture.ts'))+';\nawait Bun.write('+json.dumps(str(output/'enrollment.json'))+',JSON.stringify(createRegistryInstallation()));\n')
    completed=run_command([str(options.bun),str(enrollment)],cwd=repository,timeout=30)
    if completed.returncode!=0:raise RuntimeError('Required synthetic enrollment generation failed')
    paths['enrollment.json']=output/'enrollment.json'
    for directory,prefix in [(repository/'infra/ansible/roles/registry_storage','repo/infra/ansible/roles/registry_storage'),(repository/'infra/systemd/registry-backup','repo/infra/systemd/registry-backup'),(options.controller_packages,'packages')]:
        for path in directory.rglob('*'):
            if '__pycache__' in path.parts:continue
            if path.is_symlink():raise RuntimeError('Staged controller/source input is aliased')
            if path.is_file():paths[prefix+'/'+str(path.relative_to(directory))]=path
    files={name:{'sha256':hash_file(path),'bytes':path.stat().st_size} for name,path in paths.items()}
    if len(files)>=4000 or sum(pin['bytes'] for pin in files.values())>=256*1024**2:raise RuntimeError('Staged inputs exceed the approved envelope')
    remote='/var/tmp/puni-client-role-'+uuid.uuid4().hex
    header=json.dumps({'path':remote,'files':files}).encode()+b'\n'
    if len(header)>2097152:raise RuntimeError('Stage manifest exceeds read bound')
    status=transfer_stage(options.transport,options.host,header,paths,output,remote)
    if status!=0:raise RuntimeError('Stage failed; inspect the exact owned directory: '+remote)
    claim=json.loads((output/'stage.stdout.log').read_text())
    if claim['path']!=remote or not claim['complete'] or claim['files']!=files:raise RuntimeError('Stage acknowledgement differs from the requested inputs')
    (output/'stage.json').write_text(json.dumps(claim,indent=2)+'\n')
    terminal=True;receipts=[]
    try:
        for case in cases if options.case=='all' else [options.case]:
            directory=output/case;directory.mkdir(mode=0o700);compose_case(repository,directory,claim,case,options.remove);terminal=False
            with (directory/'execute.py').open('rb') as stdin:completed=run_command([str(options.transport),options.host,'python3 -'],stdin=stdin,timeout=150)
            (directory/'stdout.log').write_bytes(completed.stdout);(directory/'stderr.log').write_bytes(completed.stderr)
            native=json.loads(completed.stdout)
            if not native['workspaceRemoved'] or native['loopLeaks'] or native['mountLeaks']:raise RuntimeError('Owned physical fixture did not close')
            terminal=True;observation=json.loads(native['observation'].splitlines()[-1]);receipt={'case':case,'removed':options.remove,'exitCode':completed.returncode,'native':native,'observation':observation};receipts.append(receipt);(output/'receipts.json').write_text(json.dumps(receipts,indent=2)+'\n')
            if completed.returncode!=0 or native['workerExit']!=0:raise RuntimeError('Actual role case failed: '+case)
            print(json.dumps({'case':case,'passed':True}),flush=True)
    finally:
        if terminal:
            completed=subprocess.run([str(options.transport),options.host,'python3 -c '+shlex.quote(CLOSE_CODE)],input=json.dumps(claim).encode(),capture_output=True,timeout=30)
            (output/'closure.stdout.log').write_bytes(completed.stdout);(output/'closure.stderr.log').write_bytes(completed.stderr)
            if completed.returncode!=0:raise RuntimeError('Owned role stage cleanup failed; preserve and inspect: '+remote)
        else:print('Unconfirmed native termination; stage preserved for inspection: '+remote,file=sys.stderr)
    drift=[name for name,digest in source_pins.items() if hash_file(Path(name))!=digest]
    if drift:raise RuntimeError('Required source inputs changed during rehearsal: '+str(drift))
    print(json.dumps({'cases':len(receipts),'stageRemoved':True,'sourceInputs':len(source_pins),'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}),flush=True)

STAGE_CODE = "from pathlib import Path\nimport hashlib,json,os,re,stat,sys,tarfile\nheader=sys.stdin.buffer.readline(2097153)\nif len(header)>2097152 or not header.endswith(b'\\n'):raise RuntimeError('Oversized stage manifest')\nrequest=json.loads(header);root=Path(request['path']);expected=request['files']\nif not re.fullmatch(r'/var/tmp/puni-client-role-[a-f0-9]{32}',str(root)) or not 0<len(expected)<4000:raise RuntimeError('Invalid stage envelope')\nfor name,pin in expected.items():\n if name.startswith('/') or '..' in Path(name).parts or re.fullmatch(r'[a-zA-Z0-9_./+@=-]+',name) is None or not re.fullmatch(r'[a-f0-9]{64}',pin['sha256']) or type(pin['bytes']) is not int or pin['bytes']<0:raise RuntimeError('Invalid stage entry')\nneeded=sum(p['bytes'] for p in expected.values());fs=os.statvfs('/')\nif os.geteuid()!=0 or needed>=256*1024**2 or fs.f_bavail*fs.f_frsize<20*1024**3+needed+256*1024**2:raise RuntimeError('Insufficient owned stage reserve')\n# Proof: h4 umask000 produced writable nested directories before this fixed mask.\nos.umask(0o077);root.mkdir(mode=0o700);claim={'path':str(root),'device':root.stat().st_dev,'inode':root.stat().st_ino,'files':expected,'complete':False};p=root/'claim.json';p.write_text(json.dumps(claim));p.chmod(0o600);seen=set()\nwith tarfile.open(fileobj=sys.stdin.buffer,mode='r|') as package:\n for member in package:\n  if member.name not in expected or member.name in seen or not member.isfile() or member.size!=expected[member.name]['bytes']:raise RuntimeError('Unexpected stage member')\n  stream=package.extractfile(member)\n  if stream is None:raise RuntimeError('Unreadable stage member')\n  path=root/member.name;path.parent.mkdir(parents=True,exist_ok=True)\n  # Proof: h4 chmod0777 before member write refuses here; removing this audit writes it.\n  for directory in [root,*[root/parent for parent in Path(member.name).parents if str(parent)!='.']]:\n   metadata=directory.lstat()\n   if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid!=0 or stat.S_IMODE(metadata.st_mode)&0o022:raise RuntimeError('Untrusted stage directory')\n  digest=hashlib.sha256()\n  with path.open('xb') as target:\n   while chunk:=stream.read(1024*1024):target.write(chunk);digest.update(chunk)\n  if digest.hexdigest()!=expected[member.name]['sha256']:raise RuntimeError('Stage member digest mismatch')\n  path.chmod(0o700 if member.name=='bun' else 0o600);seen.add(member.name)\nif seen!=set(expected):raise RuntimeError('Incomplete stage')\nclaim['complete']=True;(root/'claim.json').write_text(json.dumps(claim));print(json.dumps(claim))\n"
CLOSE_CODE = "from pathlib import Path\nimport hashlib,json,re,stat,sys\npayload=sys.stdin.buffer.read(2097153)\nif len(payload)>2097152:raise RuntimeError('Oversized role closure claim')\nclaim=json.loads(payload);root=Path(claim['path']);metadata=root.lstat()\nif not re.fullmatch(r'/var/tmp/puni-client-role-[a-f0-9]{32}',str(root)) or not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid!=0 or stat.S_IMODE(metadata.st_mode)&0o022 or metadata.st_dev!=claim['device'] or metadata.st_ino!=claim['inode']:raise RuntimeError('Foreign role stage identity')\np=root/'claim.json';metadata=p.lstat()\nif not stat.S_ISREG(metadata.st_mode) or metadata.st_uid!=0 or metadata.st_nlink!=1 or stat.S_IMODE(metadata.st_mode)!=0o600 or json.loads(p.read_text())!=claim or not claim['complete']:raise RuntimeError('Untrusted completed role stage claim')\n# Proof: h4 symlink and writable-directory faults deleted known sources without this preaudit.\nexpected_directories={str(parent) for name in claim['files'] for parent in Path(name).parents if str(parent)!='.'}\nactual=set();directories=[]\nfor p in root.rglob('*'):\n metadata=p.lstat();name=str(p.relative_to(root))\n if stat.S_ISDIR(metadata.st_mode):\n  if name not in expected_directories or metadata.st_uid!=0 or stat.S_IMODE(metadata.st_mode)&0o022:raise RuntimeError('Unexpected role stage directory')\n  directories.append(p)\n elif stat.S_ISREG(metadata.st_mode):actual.add(name)\n else:raise RuntimeError('Unexpected role stage entry type')\nif actual!=set(claim['files'])|{'claim.json'}:raise RuntimeError('Unexpected role stage entries')\nfor name,pin in claim['files'].items():\n p=root/name;metadata=p.lstat()\n if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid!=0 or metadata.st_nlink!=1 or stat.S_IMODE(metadata.st_mode)!=(0o700 if name=='bun' else 0o600) or p.stat().st_size!=pin['bytes'] or hashlib.sha256(p.read_bytes()).hexdigest()!=pin['sha256']:raise RuntimeError('Changed role stage source')\nif any(line.split()[4]==str(root) or line.split()[4].startswith(str(root)+'/') for line in Path('/proc/self/mountinfo').read_text().splitlines()):raise RuntimeError('Live role stage mount')\nfor name in claim['files']:(root/name).unlink()\n(root/'claim.json').unlink()\nfor directory in sorted(directories,key=lambda p:len(p.parts),reverse=True):\n metadata=directory.lstat()\n if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid!=0:raise RuntimeError('Foreign role stage directory')\n directory.rmdir()\nroot.rmdir()\nif root.exists():raise RuntimeError('Owned role stage remained')\nprint(json.dumps({'workspace':str(root),'exactIdentityAndSourcesVerified':True,'files':len(claim['files']),'removed':True}))\n"

if __name__=='__main__':main()
