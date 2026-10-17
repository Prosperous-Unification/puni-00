import hashlib,json,pathlib,subprocess,xml.etree.ElementTree as ET
root=pathlib.Path('/tmp/puni-shared-failures-unit-oct17')
authority_path=pathlib.Path('/tmp/shared-failures-real-unit-oct17/authority.json')
a=json.loads(authority_path.read_text());o=json.loads(pathlib.Path('/tmp/shared-failures-inspector.log').read_text())
def sha(b): return hashlib.sha256(b).hexdigest()
def canonical(v): return (json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)+'\n').encode()
def git(*args): return subprocess.check_output(['git',*args],cwd=root)
assert o['revision']==a['revision'] and o['candidate']==a['candidate']
assert o['certifies'] is False and o['authentication']=={'kind':'absent'}
assert o['junit']['digest']==a['junit']['digest']==sha(pathlib.Path(a['junit']['path']).read_bytes())
assert o['authority']['digest']==sha(authority_path.read_bytes())
xml=ET.fromstring(pathlib.Path(a['junit']['path']).read_bytes())
expected=sorted([(a['projectRoot']+'/'+c.attrib['file'],c.attrib['name'],'failed' if c.find('failure') is not None else 'skipped' if c.find('skipped') is not None else 'passed') for c in xml.iter('testcase')])
actual=sorted([(c['file'],c['titlePath'][0],c['status']) for c in o['cases']])
assert len(expected)==20 and expected==actual and all(c[2]=='passed' for c in actual)
for c in o['cases']:
 assert c['level']==c['isolation']=={'kind':'unresolved'}
 mode,kind,blob=git('ls-tree',a['revision'],'--',c['file']).decode().split('\t')[0].split()
 assert kind=='blob' and c['source']=={'mode':mode,'blob':blob,'contentDigest':sha(git('show',a['revision']+':'+c['file']))}
 # Independent case-id hashing uses only its outcome-independent logical identity.
 assert c['caseId']==sha(canonical([c['project'],c['target'],c['file'],c['titlePath']]))
manifest=o['projectManifest'];assert manifest['contentDigest']==sha(git('show',a['revision']+':'+manifest['path']))==a['projectManifest']['digest']
digest=o.pop('observationDigest');assert digest==sha(canonical(o))
print(json.dumps({'revision':a['revision'],'caseCount':20,'allPassed':True,'allSourcePinsMatchGit':True,'allCaseIdsMatch':True,'completeObservationDigestMatches':True,'observationDigest':digest,'certifies':False},indent=2))
