import { join } from 'node:path';

import { expect, test } from 'bun:test';

const helper = join(import.meta.dir, 'lab-guest-dependencies.py');
const boundary = String.raw`
import hashlib, importlib.util, io, json, os, pathlib, resource, subprocess, sys, tarfile, tempfile, time
os.umask(0o077)
spec=importlib.util.spec_from_file_location('verifier',sys.argv[1])
verifier=importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)
case=sys.argv[2]
real_killpg=os.killpg
if len(sys.argv)>3 and sys.argv[3]=='dependency-killgroup':
    verifier.os.killpg=lambda *_arguments:None
elif len(sys.argv)>3:
    original_require=verifier.require
    def bypass(predicate,category):
        if category!=sys.argv[3]:original_require(predicate,category)
    verifier.require=bypass
def refused(operation,category):
    try: operation()
    except verifier.DependencyRefusal as failure:
        assert str(failure)==category,(str(failure),category)
        assert failure.__cause__ is None
    else: raise AssertionError('unsafe input accepted: '+case)
def digest(content):return hashlib.sha256(content).hexdigest()
def fixture(directory, relation='library (>= 1:2.0~rc1-1)', installed='1:2.0-1', architecture='amd64', metadata=None, provides='', conflicts=''):
    os.chmod(directory,0o700)
    def write(name,content,mode=0o400):
        content=content.encode() if isinstance(content,str) else content
        path=directory+'/'+name
        if os.path.exists(path): os.unlink(path)
        with open(path,'wb') as stream: stream.write(content)
        os.chmod(path,mode)
        return {'path':path,'sha256':digest(content),'bytes':len(content),'uid':os.geteuid(),'mode':mode}
    tree=directory+'/package';os.mkdir(tree);os.mkdir(tree+'/DEBIAN')
    os.chmod(tree,0o755);os.chmod(tree+'/DEBIAN',0o755)
    control='Package: application\nVersion: 3.0-1\nArchitecture: amd64\nMaintainer: Example <example@example.com>\nDescription: fixture\n'
    if relation:control+='Depends: '+relation+'\n'
    if provides:control+='Provides: '+provides+'\n'
    if conflicts:control+='Conflicts: '+conflicts+'\n'
    with open(tree+'/DEBIAN/control','w') as stream:stream.write(control)
    os.chmod(tree+'/DEBIAN/control',0o644)
    child=subprocess.run(['/usr/bin/dpkg-deb','--build','--root-owner-group',tree,directory+'/application.deb'],capture_output=True)
    assert child.returncode==0,child.stderr
    archive=write('application.deb',pathlib.Path(directory+'/application.deb').read_bytes())
    selected=control+'Size: '+str(archive['bytes'])+'\nSHA256: '+archive['sha256']+'\n'
    index=write('vendor-Packages',selected)
    release=write('vendor-InRelease','SHA256:\n '+index['sha256']+' '+str(index['bytes'])+' stable/binary-amd64/Packages\n')
    vendor_key=write('vendor.asc','vendor-key')
    inventory=write('image.manifest','library'+(':'+architecture if architecture!='amd64' else '')+'\t'+installed+'\n')
    image=write('image.img','published-image')
    checksums=write('SHA256SUMS',image['sha256']+' *image.img\n'+inventory['sha256']+' *image.manifest\n')
    signature=write('SHA256SUMS.gpg','reviewed-signature')
    keyring=write('cloud.gpg','cloud-key')
    cloud=write('cloud-receipt.json',json.dumps({'exit_code':0,'status':'[GNUPG:] VALIDSIG '+'A'*40+' retained','expected_cloud_signer':'A'*40,'checksum_sha256':checksums['sha256'],'signature_sha256':signature['sha256'],'keyring_sha256':keyring['sha256']}),0o664)
    vendor=write('archive-receipt.json',json.dumps({'signed_index_verified':True,'cached_archives_verified':True,'gpgv_status':'[GNUPG:] VALIDSIG '+'B'*40+' retained','inputs':[{'name':os.path.basename(pin['path']),'sha256':pin['sha256'],'bytes':pin['bytes']} for pin in [release,index,vendor_key,archive]]}))
    fields={'Package':'library','Version':installed,'Architecture':architecture}
    if metadata:fields.update(metadata)
    base_index=write('base-Packages',''.join(key+': '+value+'\n' for key,value in fields.items()))
    base_release=write('base-InRelease','SHA256:\n '+base_index['sha256']+' '+str(base_index['bytes'])+' main/binary-amd64/Packages\n')
    base=write('inventory-receipt.json',json.dumps({'metadata':[{'suite':'base','signatureOutput':'gpgv: Good signature from reviewed signer','retained':[{'path':pin['path'],'sha256':pin['sha256'],'bytes':pin['bytes']} for pin in [base_release,base_index]]}]}))
    request={'schemaVersion':1,'root':directory,'architecture':'amd64','trustModel':'installed-host-and-operator-reviewed-retained-signatures','receipts':{'cloud':cloud,'archives':vendor,'inventory':base},'image':image,'imageName':'image.img','inventory':inventory,'inventoryName':'image.manifest','checksums':checksums,'signature':signature,'keyring':keyring,'archiveSource':{'release':release,'index':index,'keyring':vendor_key,'indexName':'stable/binary-amd64/Packages'},'inventorySources':[{'suite':'base','release':base_release,'index':base_index,'indexName':'main/binary-amd64/Packages'}],'archives':[archive]}
    return request,write
def verify(request):return verifier.verify_dependencies(request)
if case=='import':
    assert callable(verifier.verify_dependencies)
    assert resource.getrlimit(resource.RLIMIT_FSIZE)[0]!=65536
elif case=='positive':
    with tempfile.TemporaryDirectory() as directory:
        request,_=fixture(directory)
        report=verify(request)
        assert report['schemaVersion']==1 and report['artifactDependencyClosureVerified'] is True
        assert report['guestConfiguredInstallationVerified'] is False and report['runtimeAuthority'] is False
        assert report['requiredEdgeCount']==report['matchedEdgeCount']==1
        assert report['imageSha256']==request['image']['sha256']
        assert report['selectedArtifacts'][0]['sha256']==request['archives'][0]['sha256']
        assert len(report['inputBindings'])==14 and report['receiptSignaturesReplayed'] is False
        assert len(verifier.encode_report(report))<=65536
elif case=='request':
    with tempfile.TemporaryDirectory() as directory:
        request,_=fixture(directory)
        for fault in ['foreign','override','traversal','trust','arch','empty','bool','unconfined']:
            changed=json.loads(json.dumps(request))
            if fault=='foreign':changed['foreign']=True
            elif fault=='override':changed['limits']={}
            elif fault=='traversal':changed['image']['path']=directory+'/../image.img'
            elif fault=='trust':changed['trustModel']='current-self-approved-hashes'
            elif fault=='arch':changed['architecture']='unknown'
            elif fault=='empty':changed['archives']=[]
            elif fault=='bool':changed['schemaVersion']=True
            else:changed['image']['path']='/etc/passwd'
            refused(lambda:verify(changed),'dependency-request-invalid')
elif case=='input':
    with tempfile.TemporaryDirectory() as directory:
        request,_=fixture(directory)
        path=request['image']['path']
        os.rename(path,path+'.retained')
        refused(lambda:verify(request),'dependency-input-absent')
        os.rename(path+'.retained',path);os.chmod(path,0)
        refused(lambda:verify(request),'dependency-input-unreadable')
        os.chmod(path,0o400);os.rename(path,path+'.retained');os.symlink(path+'.retained',path)
        refused(lambda:verify(request),'dependency-input-unsafe')
        os.unlink(path);os.rename(path+'.retained',path)
        os.chmod(path,0o600);open(path,'wb').write(b'x'*request['image']['bytes']);os.chmod(path,0o400)
        refused(lambda:verify(request),'dependency-input-changed')
elif case=='short-read':
    with tempfile.TemporaryDirectory() as directory:
        request,_=fixture(directory)
        original=verifier.os.read
        def shortened(descriptor,count):
            if os.path.samefile('/proc/self/fd/'+str(descriptor),request['image']['path']):return b''
            return original(descriptor,count)
        verifier.os.read=shortened
        refused(lambda:verify(request),'dependency-input-changed')
elif case=='identity':
    with tempfile.TemporaryDirectory() as directory:
        request,_=fixture(directory)
        original=verifier.os.read;replaced=False
        def substitute(descriptor,count):
            global replaced
            payload=original(descriptor,count)
            if not replaced and os.path.samefile('/proc/self/fd/'+str(descriptor),request['image']['path']):
                replaced=True;os.rename(request['image']['path'],request['image']['path']+'.retained')
                open(request['image']['path'],'wb').write(b'x'*request['image']['bytes']);os.chmod(request['image']['path'],0o400)
            return payload
        verifier.os.read=substitute
        refused(lambda:verify(request),'dependency-input-changed')
elif case=='receipt':
    for fault in ['bad-signature','wrong-image-hash','release-hash','control-fields','missing-metadata','ambiguous-metadata','malformed','duplicate-json','public-parent']:
        with tempfile.TemporaryDirectory() as directory:
            request,write=fixture(directory)
            if fault=='public-parent':
                os.chmod(directory,0o750);category='dependency-input-unsafe'
            elif fault in ['malformed','duplicate-json']:
                request['receipts']['cloud']=write('cloud-receipt.json','{' if fault=='malformed' else '{"x":1,"x":2}')
                category='dependency-input-malformed'
            elif fault=='bad-signature':
                fields=json.loads(pathlib.Path(request['receipts']['archives']['path']).read_text());fields['gpgv_status']='unverified'
                request['receipts']['archives']=write('archive-receipt.json',json.dumps(fields));category='dependency-provenance-invalid'
            elif fault=='wrong-image-hash':
                request['image']=write('image.img','substituted-image');category='dependency-provenance-invalid'
            elif fault=='release-hash':
                request['archiveSource']['release']=write('vendor-InRelease','SHA256:\n '+'0'*64+' 1 stable/binary-amd64/Packages\n');category='dependency-provenance-invalid'
            else:
                source=request['archiveSource'] if fault=='control-fields' else request['inventorySources'][0]
                original=pathlib.Path(source['index']['path']).read_text()
                if fault=='control-fields':original=original.replace('Depends: library','Depends: foreign')
                elif fault=='missing-metadata':original=original.replace('Version: 1:2.0-1','Version: 1:3.0-1')
                else:original+='\n'+original.replace('Architecture: amd64','Architecture: arm64')
                source['index']=write(os.path.basename(source['index']['path']),original)
                source['release']=write(os.path.basename(source['release']['path']),'SHA256:\n '+source['index']['sha256']+' '+str(source['index']['bytes'])+' '+source['indexName']+'\n')
                receipt_role='archives' if fault=='control-fields' else 'inventory'
                receipt=json.loads(pathlib.Path(request['receipts'][receipt_role]['path']).read_text())
                rows=receipt['inputs'] if fault=='control-fields' else receipt['metadata'][0]['retained']
                for bound in rows:
                    for pin in [source['index'],source['release']]:
                        if os.path.basename(bound.get('name',bound.get('path','')))==os.path.basename(pin['path']):bound.update({'sha256':pin['sha256'],'bytes':pin['bytes']})
                request['receipts'][receipt_role]=write(os.path.basename(request['receipts'][receipt_role]['path']),json.dumps(receipt))
                category='dependency-control-mismatch' if fault=='control-fields' else ('dependency-metadata-ambiguous' if fault=='ambiguous-metadata' else 'dependency-unsatisfied')
            refused(lambda:verify(request),category)
elif case=='relations':
    for relation,version,arch,metadata,category in [('missing | library (>= 1:2.0~rc1-1)','1:2.0-1','amd64',None,None),('library (>> 1:2.0-1)','1:2.0-1','amd64',None,'dependency-unsatisfied'),('library:native','1:2.0-1','arm64',None,'dependency-unsatisfied'),('library:any','1:2.0-1','arm64',{'Multi-Arch':'allowed'},None),('library:any','1:2.0-1','arm64',None,'dependency-unsatisfied'),('virtual-library','1:2.0-1','amd64',{'Provides':'virtual-library'},'dependency-unsatisfied')]:
        with tempfile.TemporaryDirectory() as directory:
            request,_=fixture(directory,relation,version,arch,metadata)
            if category:refused(lambda:verify(request),category)
            else:assert verify(request)['matchedEdgeCount']==1
elif case=='grammar':
    for expression in ['library (>= 1-)','library,','library (nonsense 1)','Library','library:x:y','library [amd64]','library || missing','library (>= 1) trailing','library (>= 1-)','library (>= 1-abc:bad)']:
        refused(lambda:verifier.parse_relations(expression,'amd64'),'dependency-relation-invalid')
    for expression in ['library (<< 2)','library (<= 2)','library (= 2)','library (>= 2)','library (>> 2)']:
        assert len(verifier.parse_relations(expression,'amd64'))==1
elif case=='conflicts':
    for conflict,category in [('library (<< 1:1)',None),('library (>= 1:2)','dependency-conflict'),('library','dependency-conflict')]:
        with tempfile.TemporaryDirectory() as directory:
            request,_=fixture(directory,conflicts=conflict)
            if category:refused(lambda:verify(request),category)
            else:assert verify(request)['artifactDependencyClosureVerified']
elif case=='control':
    def archive(entries):
        stream=io.BytesIO()
        with tarfile.open(fileobj=stream,mode='w') as tar:
            for name,content,kind in entries:
                member=tarfile.TarInfo(name);member.size=len(content);member.type=kind
                if kind==tarfile.SYMTYPE:member.linkname='/etc/passwd'
                tar.addfile(member,io.BytesIO(content))
        return stream.getvalue()
    good=b'Package: application\nVersion: 1\nArchitecture: amd64\n'
    assert verifier.parse_control(archive([('./control',good,tarfile.REGTYPE)]))['Package']=='application'
    for entries in [[('./control',good,tarfile.REGTYPE),('control',good,tarfile.REGTYPE)],[('../control',good,tarfile.REGTYPE)],[('./control',b'',tarfile.SYMTYPE)],[('./control',b'x'*65537,tarfile.REGTYPE)],[('./control',good+b'Package: duplicate\n',tarfile.REGTYPE)]]:
        refused(lambda:verifier.parse_control(archive(entries)),'dependency-control-invalid')
    refused(lambda:verifier.parse_control(b'not-a-tar'),'dependency-control-invalid')
    refused(lambda:verifier.parse_control(b'x'*(1024**2+1)),'dependency-control-invalid')
elif case=='child':
    assert verifier.run_child(['/usr/bin/python3','-I','-B','-c','print("bounded")'],(),time.monotonic()+2).strip()==b'bounded'
    refused(lambda:verifier.run_child(['/usr/bin/python3','-I','-B','-c','import time;time.sleep(2)'],(),time.monotonic()+.03),'dependency-child-timeout')
    refused(lambda:verifier.run_child(['/usr/bin/python3','-I','-B','-c','print("x"*1100000)'],(),time.monotonic()+2),'dependency-child-bound')
    refused(lambda:verifier.run_child(['/usr/bin/python3','-I','-B','-c','import sys;sys.stderr.write("private-error")'],(),time.monotonic()+2),'dependency-child-failed')
    refused(lambda:verifier.run_child(['/missing/native/tool'],(),time.monotonic()+2),'dependency-tool-unavailable')
elif case=='child-group':
    with tempfile.TemporaryDirectory() as directory:
        marker=directory+'/descendant.json'
        program='import json,os,subprocess,sys;child=subprocess.Popen([sys.executable,"-I","-B","-c","import time;time.sleep(5)"]);open(sys.argv[1],"w").write(json.dumps([os.getpid(),child.pid]));os._exit(0)'
        refused(lambda:verifier.run_child(['/usr/bin/python3','-I','-B','-c',program,marker],(),time.monotonic()+.15),'dependency-child-timeout')
        group,descendant=json.loads(pathlib.Path(marker).read_text())
        try:
            status=pathlib.Path('/proc/'+str(descendant)+'/stat')
            cleanup_deadline=time.monotonic()+.5
            while status.exists() and status.read_text().split(') ',1)[1].split()[0]!='Z' and time.monotonic()<cleanup_deadline:
                time.sleep(.005)
            assert not status.exists() or status.read_text().split(') ',1)[1].split()[0]=='Z','owned descendant survived child deadline'
        finally:
            try:real_killpg(group,9)
            except ProcessLookupError:assert not pathlib.Path('/proc/'+str(descendant)).exists()
elif case=='root':
    with tempfile.TemporaryDirectory() as directory:
        request,_=fixture(directory)
        os.chmod(directory,0)
        refused(lambda:verify(request),'dependency-input-unreadable')
        os.chmod(directory,0o700)
        original=verifier.os.read;changed=False
        def weaken_parent(descriptor,count):
            global changed
            payload=original(descriptor,count)
            if not changed and os.path.samefile('/proc/self/fd/'+str(descriptor),request['receipts']['cloud']['path']):
                changed=True;os.chmod(directory,0o750)
            return payload
        verifier.os.read=weaken_parent
        refused(lambda:verify(request),'dependency-input-changed')
        os.chmod(directory,0o700)
    refused(lambda:verifier.check_deadline(time.monotonic()-1),'dependency-deadline')
elif case=='report':
    refused(lambda:verifier.encode_report({'private':'x'*65536}),'dependency-report-bound')
elif case=='limits':
    with tempfile.TemporaryDirectory() as directory:
        request,_=fixture(directory);verify(request)
        for kind,limit in [(resource.RLIMIT_AS,128*1024**2),(resource.RLIMIT_CPU,20),(resource.RLIMIT_FSIZE,65536),(resource.RLIMIT_NOFILE,64),(resource.RLIMIT_CORE,0)]:
            assert resource.getrlimit(kind)==(limit,limit)
elif case=='tool':
    refused(lambda:verifier.bind_tool('/missing/native/tool'),'dependency-tool-unavailable')
    with tempfile.TemporaryDirectory() as directory:
        request,_=fixture(directory)
        verifier.load_adapter=lambda: (_ for _ in ()).throw(verifier.DependencyRefusal('dependency-tool-unavailable'))
        refused(lambda:verify(request),'dependency-tool-unavailable')
elif case=='cli':
    with tempfile.TemporaryDirectory() as directory:
        request,write=fixture(directory)
        pin=write('request.json',json.dumps(request),0o600)
        child=subprocess.run(['/usr/bin/python3','-I','-B',sys.argv[1],pin['path'],pin['sha256']],capture_output=True)
        assert child.returncode==0,child.stdout
        report=json.loads(child.stdout);assert report['artifactDependencyClosureVerified'] is True and not child.stderr
        child=subprocess.run(['/usr/bin/python3','-I','-B',sys.argv[1],pin['path'],'0'*64],capture_output=True)
        assert child.returncode!=0 and json.loads(child.stdout)=={'category':'dependency-input-changed'} and not child.stderr
        assert len(child.stdout)<=65536
`;

for (const name of [
  'import',
  'positive',
  'request',
  'input',
  'short-read',
  'identity',
  'receipt',
  'relations',
  'grammar',
  'conflicts',
  'control',
  'child',
  'child-group',
  'root',
  'report',
  'tool',
  'limits',
  'cli',
]) {
  test(`bounded dependency verifier ${name} boundary`, () => {
    const child = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-c', boundary, helper, name]);
    expect(child.stderr.toString()).toBe('');
    expect(child.exitCode).toBe(0);
  });
}

for (const [name, category] of [
  ['short-read', 'dependency-input-changed'],
  ['identity', 'dependency-input-changed'],
  ['receipt', 'dependency-provenance-invalid'],
  ['relations', 'dependency-unsatisfied'],
  ['grammar', 'dependency-relation-invalid'],
  ['conflicts', 'dependency-conflict'],
  ['control', 'dependency-control-invalid'],
  ['report', 'dependency-report-bound'],
]) {
  test(`dependency ${name} negative detects removed ${category} guard`, () => {
    const child = Bun.spawnSync([
      '/usr/bin/python3',
      '-I',
      '-B',
      '-c',
      boundary,
      helper,
      name,
      category,
    ]);
    expect(child.exitCode).not.toBe(0);
    expect(child.stderr.toString()).toContain('unsafe input accepted');
  });
}

test('dependency child group negative detects removed owned-group kill', () => {
  const child = Bun.spawnSync([
    '/usr/bin/python3',
    '-I',
    '-B',
    '-c',
    boundary,
    helper,
    'child-group',
    'dependency-killgroup',
  ]);
  expect(child.exitCode).not.toBe(0);
  expect(child.stderr.toString()).toContain('owned descendant survived child deadline');
});
