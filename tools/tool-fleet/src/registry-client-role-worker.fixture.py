def configure_case(root,configuration,variables):
    if ROLE_CASE=='legacy':
        configuration.pop('client');variables['puni_registry_maintenance_artifacts'].pop('client-worker');variables.pop('puni_registry_maintenance_crane_source')
    elif ROLE_CASE=='extra-key':variables['puni_registry_maintenance_artifacts']['extra']=dict(variables['puni_registry_maintenance_artifacts']['host'])
    elif ROLE_CASE=='missing-worker':variables['puni_registry_maintenance_artifacts'].pop('client-worker')
    elif ROLE_CASE=='worker-binding':configuration['client']['worker']['sha256']='a'*64
    elif ROLE_CASE=='missing-crane':variables.pop('puni_registry_maintenance_crane_source')
    elif ROLE_CASE=='bad-crane':
        path=root/'wrong-crane';path.write_text('deliberately wrong source');variables['puni_registry_maintenance_crane_source']=str(path)
    elif ROLE_CASE=='bad-worker':
        path=root/'wrong-worker.js';path.write_text('// deliberately wrong source\n');variables['puni_registry_maintenance_artifacts']['client-worker']['source']=str(path)
    elif ROLE_CASE=='empty-worker':
        path=root/'empty-worker.js';path.write_bytes(b'');pin=hashlib.sha256(b'').hexdigest();variables['puni_registry_maintenance_artifacts']['client-worker']={'source':str(path),'sha256':pin};configuration['client']['worker']['sha256']=pin
    elif ROLE_CASE=='oversized-worker':
        path=root/'oversized-worker.js';path.write_bytes(b'//' + b'x'*(17*1024**2));pin=hashlib.sha256(path.read_bytes()).hexdigest();variables['puni_registry_maintenance_artifacts']['client-worker']={'source':str(path),'sha256':pin};configuration['client']['worker']['sha256']=pin
    elif ROLE_CASE=='sparse-backing':command('fallocate','--punch-hole','--offset',str(60*1024**2),'--length',str(1024**2),str(root/'pulls.ext4'))
    elif ROLE_CASE=='tool-pin':configuration['client']['ip']['sha256']='a'*64
    elif ROLE_CASE=='pool-profile':configuration['client']['scratch']['storageId']='11111111-1111-4111-8111-111111111111'

def alter_role(copied):
    sys.dont_write_bytecode=True
    sys.path.insert(0,str(ROLE_STAGE/'packages'))
    import yaml
    maintenance=copied/'tasks/maintenance.yml';source=copied/'tasks/client-source.yml';installation=copied/'tasks/client-installation.yml'
    tasks=yaml.safe_load(maintenance.read_text());sources=yaml.safe_load(source.read_text());installed=yaml.safe_load(installation.read_text());touched=set()
    if ROLE_CASE=='source-kind':
        touched.add(source)
        index=next(i for i,t in enumerate(sources) if t['name']=='Refuse another client build before installation')
        sources.insert(index,{'name':'Inject stat-kind dependency fault','ansible.builtin.set_fact':{'registry_client_source':{'stat':{'isreg':False,'checksum':'8e75c326adb43b053cfd78b9b987663f8f4fe4557f4d3915905643f25c730992'}}}})
    if ROLE_CASE in ['storage-output','storage-status','validation-output','validation-status']:
        touched.add(installation)
        storage=ROLE_CASE.startswith('storage-');task=next(t for t in installed if t['name']==('Verify canonical and pull storage before client grant' if storage else 'Validate installed client profile without journal effects'))
        if ROLE_CASE.endswith('-output'):task['ansible.builtin.command']={'argv':['/bin/sh','-c','printf unexpected']}
        else:task['ansible.builtin.command']={'argv':['/usr/bin/python3','-c','import sys;print('+repr('unchanged' if storage else 'verified')+');sys.exit(1)']}
    if ROLE_CASE in ['installed-worker','installed-crane','pool-mode']:
        touched.add(installation)
        target='Verify canonical and pull storage before client grant' if ROLE_CASE=='pool-mode' else 'Validate installed client profile without journal effects';index=next(i for i,t in enumerate(installed) if t['name']==target)
        injected={'name':'Inject controlled installed dependency fault'}
        if ROLE_CASE=='installed-worker':injected['ansible.builtin.copy']={'content':'// altered installed worker\n','dest':'/usr/local/libexec/puni-registry-maintenance/client-worker.js','owner':'root','group':'root','mode':'0644'}
        elif ROLE_CASE=='installed-crane':injected['ansible.builtin.file']={'path':'/usr/local/libexec/puni-registry-maintenance/crane','state':'absent'}
        else:injected['ansible.builtin.file']={'path':'/var/lib/puni-registry/pulls/contents','mode':'0777'}
        installed.insert(index,injected)
    if ROLE_REMOVE is not None:
        if ROLE_REMOVE in ['keys','worker-binding','crane-required']:
            touched.add(maintenance)
            assertions=tasks[0]['ansible.builtin.assert']['that'];matches=[t for t in assertions if ('artifacts.keys()' in t if ROLE_REMOVE=='keys' else 'client.worker.sha256' in t if ROLE_REMOVE=='worker-binding' else 'crane_source is defined' in t)]
            if len(matches)!=1:raise RuntimeError('Enrollment guard removal is not unique')
            assertions.remove(matches[0])
        elif ROLE_REMOVE=='size-minimum':
            touched.add(maintenance);assertions=next(t for t in tasks if t['name']=='Refuse mismatched maintenance bundles before installation')['ansible.builtin.assert']['that'];matches=[t for t in assertions if '.stat.size' in t]
            if len(matches)!=1:raise RuntimeError('Source minimum guard removal is not unique')
            assertions[assertions.index(matches[0])]='registry_maintenance_source.stat.size <= 16777216'
        elif ROLE_REMOVE=='size':
            touched.add(maintenance)
            assertions=next(t for t in tasks if t['name']=='Refuse mismatched maintenance bundles before installation')['ansible.builtin.assert']['that'];matches=[t for t in assertions if '.stat.size' in t]
            if len(matches)!=1:raise RuntimeError('Source byte guard removal is not unique')
            assertions.remove(matches[0])
        elif ROLE_REMOVE in ['source-kind','source-hash']:
            touched.add(source)
            assertions=next(t for t in sources if t['name']=='Refuse another client build before installation')['ansible.builtin.assert']['that'];matches=[t for t in assertions if ('.isreg' in t if ROLE_REMOVE=='source-kind' else '.checksum' in t)]
            if len(matches)!=1:raise RuntimeError('Client source guard removal is not unique')
            assertions.remove(matches[0])
        elif ROLE_REMOVE in ['storage-output','storage-status','validation-output','validation-status']:
            touched.add(installation)
            storage=ROLE_REMOVE.startswith('storage-');task=next(t for t in installed if t['name']==('Verify canonical and pull storage before client grant' if storage else 'Validate installed client profile without journal effects'));label='registry_client_storage' if storage else 'registry_client_validation'
            task['failed_when']=label+'.rc != 0' if ROLE_REMOVE.endswith('-output') else label+(".stdout not in ['changed', 'unchanged']" if storage else ".stdout != 'verified'")
        elif ROLE_REMOVE=='physical':
            touched.add(installation);installed=[t for t in installed if t['name']!='Verify canonical and pull storage before client grant']
        elif ROLE_REMOVE=='validation':
            touched.add(installation);installed=[t for t in installed if t['name']!='Validate installed client profile without journal effects']
        else:raise RuntimeError('Unknown controlled role guard removal')
    for path,declared in [(maintenance,tasks),(source,sources),(installation,installed)]:
        if path in touched:path.write_text(yaml.safe_dump(declared,sort_keys=False))
    return {path.name:{'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'text':path.read_text()} for path in [maintenance,source,installation]}

ROLE_EXPECTED={
 'extra-key':'Require explicit reviewed maintenance enrollment','missing-worker':'Require explicit reviewed maintenance enrollment','worker-binding':'Require explicit reviewed maintenance enrollment','missing-crane':'Require explicit reviewed maintenance enrollment',
 'bad-crane':'Refuse another client build before installation','source-kind':'Refuse another client build before installation','bad-worker':'Refuse mismatched maintenance bundles before installation','oversized-worker':'Refuse mismatched maintenance bundles before installation',
 'empty-worker':'Refuse mismatched maintenance bundles before installation',
 'tool-pin':'Validate installed client profile without journal effects','pool-profile':'Validate installed client profile without journal effects','installed-worker':'Validate installed client profile without journal effects','installed-crane':'Validate installed client profile without journal effects','pool-mode':'Verify canonical and pull storage before client grant',
 'sparse-backing':'Verify canonical and pull storage before client grant',
 'storage-output':'Verify canonical and pull storage before client grant','storage-status':'Verify canonical and pull storage before client grant','validation-output':'Validate installed client profile without journal effects','validation-status':'Validate installed client profile without journal effects',
}

base_worker = worker

def worker(root):
    directories={ROLE_STAGE}
    for name in ROLE_INPUTS:
        directories.update(ROLE_STAGE/parent for parent in Path(name).parents if str(parent)!='.')
    # Proof: h4 worker-custody-proofs2 refuses directory symlink/UID59001/mode0777;
    # removing this combined audit admits each original fault before source use.
    for directory in directories:
        metadata=directory.lstat()
        if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid!=0 or stat.S_IMODE(metadata.st_mode)&0o022:raise RuntimeError('Untrusted staged role directory')
    base_worker(root)
    for name,pin in ROLE_INPUTS.items():
        path=ROLE_STAGE/name;metadata=path.lstat()
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid!=0 or metadata.st_nlink!=1 or hashlib.sha256(path.read_bytes()).hexdigest()!=pin['sha256']:raise RuntimeError('Untrusted staged role input')
    for destination,size in [('/usr/local',536870912),('/var/lib',2097152),('/run',4194304),('/root',4194304)]:
        command('mount','-t','tmpfs','-o',f'size={size},nr_inodes=4096,mode=0755','tmpfs',destination)
    for directory in ['/etc/puni','/etc/systemd/system','/etc/sudoers.d','/etc/tmpfiles.d','/usr/local/sbin','/var/lib/puni-registry']:
        Path(directory).mkdir(parents=True,exist_ok=True)
    Path('/etc/alternatives').mkdir()
    command('mount','--bind',str(root/'host-alternatives'),'/etc/alternatives')
    command('mount','-o','remount,bind,ro','/etc/alternatives')
    Path('/etc/passwd').write_text('root:x:0:0:root:/root:/bin/bash\npuni-registry-authority:x:59001:59001:registry:/nonexistent:/usr/sbin/nologin\n')
    Path('/etc/group').write_text('root:x:0:\npuni-registry-authority:x:59001:\n')
    command('mount','--rbind',str(root),'/var/lib/puni-registry')
    shutil.copyfile(root/'pulls.json','/etc/puni/registry-pulls.json');Path('/etc/puni/registry-pulls.json').chmod(0o600)
    Path('/etc/systemd/system/puni-registry-storage.service').write_text((ROLE_STAGE/'repo/infra/ansible/roles/registry_storage/templates/puni-registry-storage.service.j2').read_text())
    helper=Path('/usr/local/libexec/puni-registry-storage');helper.mkdir(parents=True)
    shutil.copyfile(root/'storage.sh',helper/'storage.sh');(helper/'storage.sh').chmod(0o755)
    configuration=json.loads((ROLE_STAGE/'enrollment.json').read_text())
    configuration['ordinary']['maximumBytes']=64*1024**2;configuration['journalMaximumBytes']=32*1024**2
    configuration['ordinary']['storageId']=json.loads((root/'registry.identity.json').read_text())['uuid']
    artifact=lambda path:{'path':str(path),'sha256':hashlib.sha256(Path(path).read_bytes()).hexdigest()}
    client={'state':'enrolled','worker':{'path':'/usr/local/libexec/puni-registry-maintenance/client-worker.js','sha256':ROLE_INPUTS['bundles/client-worker.js']['sha256']},'scope':artifact('/usr/bin/systemd-run'),'control':artifact('/usr/bin/systemctl'),'mount':artifact('/usr/bin/mount'),'ip':artifact('/usr/bin/ip'),'scratch':{'path':'/var/lib/puni-registry/pulls/contents','receiptPath':'/var/lib/puni-registry/journal/identities/pulls.receipt','storageId':json.loads((root/'pulls.identity.json').read_text())['uuid'],'maximumBytes':64*1024**2,'maximumInodes':1024}}
    configuration['client']=client;configuration['backupWorker']['sha256']=ROLE_INPUTS['bundles/backup-worker.js']['sha256']
    variables={'puni_registry_authority_enrolled':True,'puni_registry_storage_uid':59001,'puni_registry_authority_bun_source':str(ROLE_STAGE/'bun'),'puni_registry_authority_bun_sha256':ROLE_INPUTS['bun']['sha256'],'puni_registry_authority_bundle_source':str(ROLE_STAGE/'authority.js'),'puni_registry_authority_bundle_sha256':ROLE_INPUTS['authority.js']['sha256'],'puni_registry_maintenance_enrolled':True,'puni_registry_maintenance_configuration':configuration,'puni_registry_maintenance_distribution_source':str(ROLE_STAGE/'registry'),'puni_registry_maintenance_crane_source':str(ROLE_STAGE/'crane'),'puni_registry_maintenance_artifacts':{name:{'source':str(ROLE_STAGE/'bundles'/(name+'.js')),'sha256':ROLE_INPUTS['bundles/'+name+'.js']['sha256']} for name in ['activate','backup','backup-worker','host','recover','retire','status','client-worker']}}
    configure_case(root,configuration,variables)
    role=str(ROLE_STAGE/'repo/infra/ansible/roles/registry_storage')
    play=root/'fixture/ansible/playbooks/main.yml';play.parent.mkdir(parents=True)
    shutil.copytree(ROLE_STAGE/'repo/infra/systemd/registry-backup',root/'fixture/systemd/registry-backup')
    environment={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','PYTHONPATH':str(ROLE_STAGE/'packages'),'PYTHONDONTWRITEBYTECODE':'1','ANSIBLE_LOCAL_TEMP':str(root/'local'),'ANSIBLE_REMOTE_TEMP':str(root/'remote'),'ANSIBLE_CONFIG':str(root/'ansible.cfg'),'ANSIBLE_NOCOLOR':'1','ANSIBLE_PYTHON_INTERPRETER':'/usr/bin/python3'}
    (root/'ansible.cfg').write_text('[defaults]\nretry_files_enabled = False\ninterpreter_python = /usr/bin/python3\n')
    version=subprocess.run(['/usr/bin/python3','-m','ansible.cli.playbook','--version'],env=environment,capture_output=True,text=True,timeout=15)
    if version.returncode!=0 or '[core 2.21.3]' not in version.stdout:raise RuntimeError('Pinned staged controller unavailable: '+version.stderr)
    copied=root/'role';shutil.copytree(role,copied)
    executed_roles=alter_role(copied)
    play.write_text(json.dumps([{'name':'Actual client artifact installation','hosts':'localhost','gather_facts':False,'vars':variables,'tasks':[{'name':'Actual authority installation','ansible.builtin.include_role':{'name':str(copied),'tasks_from':'authority'}},{'name':'Actual maintenance installation','ansible.builtin.include_role':{'name':str(copied),'tasks_from':'maintenance'}}]}]))
    child=subprocess.run(['/usr/bin/python3','-m','ansible.cli.playbook','-i','localhost,','-c','local',str(play)],cwd=root,env=environment,capture_output=True,text=True,timeout=100)
    (root/'ansible.stdout.log').write_text(child.stdout);(root/'ansible.stderr.log').write_text(child.stderr)
    failed_tasks=[];current_task=''
    for line in child.stdout.splitlines():
        if line.startswith('TASK ['):current_task=line
        if 'FAILED!' in line or line.startswith('failed: ['):failed_tasks.append(current_task)
    grant=Path('/etc/sudoers.d/puni-registry-maintenance').exists()
    expected=None if ROLE_CASE in ['valid','legacy'] else ROLE_EXPECTED[ROLE_CASE]
    observation={'case':ROLE_CASE,'removed':ROLE_REMOVE,'roleExit':child.returncode,'failedTasks':failed_tasks,'grantPresent':grant,'maintenanceDirectoryPresent':Path('/usr/local/libexec/puni-registry-maintenance').exists(),'installedClientPresent':Path('/usr/local/libexec/puni-registry-maintenance/client-worker.js').exists(),'cranePresent':Path('/usr/local/libexec/puni-registry-maintenance/crane').exists(),'executedRoles':executed_roles,'stdout':child.stdout[-12000:],'stderr':child.stderr[-6000:]}
    if expected is not None:
        print(json.dumps(observation),flush=True)
        if child.returncode==0 or grant or not any(expected in task for task in failed_tasks):raise RuntimeError('Expected role refusal boundary was bypassed')
        return
    if child.returncode!=0:
        print(json.dumps(observation),flush=True)
        raise RuntimeError('Actual client role failed')
    installed=Path('/usr/local/libexec/puni-registry-maintenance')
    for name in variables['puni_registry_maintenance_artifacts']:
        if hashlib.sha256((installed/(name+'.js')).read_bytes()).hexdigest()!=ROLE_INPUTS['bundles/'+name+'.js']['sha256']:raise RuntimeError('Installed bundle mismatch')
    enrolled=configuration.get('client',{}).get('state')=='enrolled'
    if enrolled and (not (installed/'crane').is_file() or hashlib.sha256((installed/'crane').read_bytes()).hexdigest()!=ROLE_INPUTS['crane']['sha256']):raise RuntimeError('Pinned client missing')
    if not enrolled and ((installed/'crane').exists() or (installed/'client-worker.js').exists()):raise RuntimeError('Unenrolled role installed client effects')
    if not Path('/etc/sudoers.d/puni-registry-maintenance').is_file():raise RuntimeError('Verified installation did not stage its grant')
    if list(Path('/var/lib/puni-registry/journal/contents').iterdir()):raise RuntimeError('Installer opened or changed a journal')
    if ROLE_CASE=='valid':
        play.write_text(json.dumps([{'name':'Repeat actual maintenance installation','hosts':'localhost','gather_facts':False,'vars':variables,'tasks':[{'name':'Actual maintenance installation','ansible.builtin.include_role':{'name':str(copied),'tasks_from':'maintenance'}}]}]))
        repeated=subprocess.run(['/usr/bin/python3','-m','ansible.cli.playbook','-i','localhost,','-c','local',str(play)],cwd=root,env=environment,capture_output=True,text=True,timeout=100)
        if repeated.returncode!=0 or not __import__('re').search(r'changed=0\s',repeated.stdout):
            print(json.dumps({'repeatExit':repeated.returncode,'stdout':repeated.stdout[-12000:],'stderr':repeated.stderr[-6000:]}),flush=True)
            raise RuntimeError('Client artifact installation is not idempotent')
    observation.update({'installedBundles':len(variables['puni_registry_maintenance_artifacts']),'clientEnrolled':enrolled,'journalUnchanged':True,'controllerVersion':version.stdout.splitlines()[0],'repeatUnchanged':ROLE_CASE=='valid'})
    observation.pop('stdout');observation.pop('stderr');print(json.dumps(observation),flush=True)
