import hashlib,json,pathlib,subprocess,xml.etree.ElementTree as ET
root=pathlib.Path.cwd()
authority_path=pathlib.Path('/tmp/shared-test-levels-real-unit-oct17/authority.json')
a=json.loads(authority_path.read_text());o=json.loads(pathlib.Path('/tmp/shared-test-levels-inspector.log').read_text())
def sha(b): return hashlib.sha256(b).hexdigest()
def canonical(v): return (json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)+'\n').encode()
def git(*args): return subprocess.check_output(['git',*args],cwd=root)
assert o['revision']==a['revision'] and o['candidate']==a['candidate']
assert o['certifies'] is False and o['authentication']=={'kind':'absent'}
assert o['junit']['digest']==a['junit']['digest']==sha(pathlib.Path(a['junit']['path']).read_bytes())
assert o['authority']['digest']==sha(authority_path.read_bytes())
xml=ET.fromstring(pathlib.Path(a['junit']['path']).read_bytes())
expected=[]
def walk(node, ancestry=()):
 for child in node:
  if child.tag=='testsuite':
   # The outer file suite is source identity; nested suites belong to title ancestry.
   nested=ancestry if child.attrib['name']==child.attrib.get('file') else (*ancestry,child.attrib['name'])
   walk(child,nested)
  elif child.tag=='testcase':
   status='failed' if child.find('failure') is not None else 'skipped' if child.find('skipped') is not None else 'passed'
   expected.append((a['projectRoot']+'/'+child.attrib['file'],(*ancestry,child.attrib['name']),status))
walk(xml)
expected.sort()
actual=sorted([(c['file'],tuple(c['titlePath']),c['status']) for c in o['cases']])
assert len(expected)==5 and expected==actual and all(c[2]=='passed' for c in actual)
for c in o['cases']:
 assert c['level']==c['isolation']=={'kind':'unresolved'}
 mode,kind,blob=git('ls-tree',a['revision'],'--',c['file']).decode().split('\t')[0].split()
 assert kind=='blob' and c['source']=={'mode':mode,'blob':blob,'contentDigest':sha(git('show',a['revision']+':'+c['file']))}
 # Independent case-id hashing uses only its outcome-independent logical identity.
 assert c['caseId']==sha(canonical([c['project'],c['target'],c['file'],c['titlePath']]))
manifest=o['projectManifest'];assert manifest['contentDigest']==sha(git('show',a['revision']+':'+manifest['path']))==a['projectManifest']['digest']
digest=o.pop('observationDigest');assert digest==sha(canonical(o))
print(json.dumps({'revision':a['revision'],'caseCount':5,'allPassed':True,'allSourcePinsMatchGit':True,'allCaseIdsMatch':True,'completeObservationDigestMatches':True,'observationDigest':digest,'certifies':False},indent=2))
