from pathlib import Path
import ctypes,json,multiprocessing,os,runpy,signal,stat,sys,tempfile,time
source=Path(sys.argv[1]);directory=Path(tempfile.mkdtemp(prefix='puni-role-transfer-'));library=runpy.run_path(str(source));transfer=library['transfer_stage'];payload=directory/'source.bin';payload.write_bytes(b'x'*2097152);identity=directory/'transport.json';transport=directory/'transport';transport.write_text('#!/usr/bin/python3\nimport json,os,time\nfrom pathlib import Path\np=Path('+repr(str(identity))+')\np.write_text(json.dumps({"pid":os.getpid(),"parent":os.getppid(),"group":os.getpgrp()}))\ntime.sleep(30)\n');transport.chmod(0o700)
remote='/var/tmp/puni-client-role-'+'a'*32
if ctypes.CDLL(None).prctl(36,1,0,0,0)!=0:raise RuntimeError('Required isolated subreaper unavailable')
context=multiprocessing.get_context('fork');parent,child=context.Pipe(False)
def execute():
 os.setsid()
 started=time.monotonic()
 try:transfer(transport,'owned-fixture',b'{}\n',{'source.bin':payload},directory,remote,timeout=0.2)
 except BaseException as cause:child.send({'error':str(cause),'cause':type(cause.__cause__).__name__,'elapsed':time.monotonic()-started})
 else:child.send({'error':None,'cause':None,'elapsed':time.monotonic()-started})
 finally:child.close()
process=context.Process(target=execute);process.start();child.close();process.join(1.5);expired=process.is_alive()
if expired:
 if not identity.is_file():raise RuntimeError('Transfer never reached the controlled stalled reader')
 owned=json.loads(identity.read_text())
 if owned['parent']!=process.pid or owned['group'] not in [process.pid,owned['pid']] or owned['group']==os.getpgrp():raise RuntimeError('Foreign stalled reader group')
 for group in {owned['group'],process.pid}:
  try:os.killpg(group,signal.SIGKILL)
  except ProcessLookupError:pass
 process.join(2)
 if process.is_alive():raise RuntimeError('Owned transfer supervisor did not terminate')
message=None
if parent.poll():
 try:message=parent.recv()
 except EOFError:
  if not expired:raise
parent.close();deadline=time.monotonic()+2
while True:
 try:pid,_=os.waitpid(-1,os.WNOHANG)
 except ChildProcessError:break
 if pid==0:
  if time.monotonic()>deadline:raise RuntimeError('Owned reader process remained')
  time.sleep(.01)
passed=not expired and message is not None and message['cause']=='TimeoutExpired' and remote in message['error'] and message['elapsed']<1.0
print(json.dumps({'deadlineHeld':passed,'outerDeadlineExpired':expired,'observation':message,'ownedChildrenReaped':True,'fixture':str(directory)}),flush=True)
for path in directory.iterdir():
 if not path.is_file() or path.is_symlink():raise RuntimeError('Unexpected local transfer fixture entry')
 path.unlink()
directory.rmdir()
if not passed:raise RuntimeError('Transfer deadline failed before blocked-reader cleanup')
