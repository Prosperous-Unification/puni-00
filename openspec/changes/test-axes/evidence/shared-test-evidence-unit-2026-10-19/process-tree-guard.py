import os,sys,time,json,subprocess,signal
from pathlib import Path
label=sys.argv[1]; command=sys.argv[2:]
cap=2*1024*1024; minimum=12*1024*1024; deadline=360
available=int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')))
if available<minimum: raise RuntimeError(f'MemAvailable {available} KiB below required {minimum} KiB')
started=time.monotonic(); peak=0; stop=None
with open(label+'.stdout','w') as stdout,open(label+'.stderr','w') as stderr:
 process=subprocess.Popen(command,stdout=stdout,stderr=stderr,start_new_session=True)
 while process.poll() is None:
  parents={}; sizes={}
  for entry in Path('/proc').iterdir():
   if not entry.name.isdigit(): continue
   try:
    fields={line.split(':',1)[0]:line.split(':',1)[1].strip() for line in (entry/'status').read_text().splitlines() if ':' in line}
    parents[int(entry.name)]=int(fields['PPid']); sizes[int(entry.name)]=int(fields.get('VmRSS','0 kB').split()[0])
   except (FileNotFoundError,ProcessLookupError): pass
  descendants={process.pid}
  while True:
   expanded=descendants|{pid for pid,parent in parents.items() if parent in descendants}
   if expanded==descendants: break
   descendants=expanded
  peak=max(peak,sum(sizes.get(pid,0) for pid in descendants))
  if peak>cap: stop='rss_limit'
  if time.monotonic()-started>deadline: stop='timeout'
  if stop:
   try: os.killpg(process.pid,signal.SIGKILL)
   except ProcessLookupError: pass
   process.wait();break
  time.sleep(.05)
receipt={'command':command,'cwd':os.getcwd(),'exitCode':process.wait(),'peakProcessTreeKiB':peak,'ceilingKiB':cap,'timeoutSeconds':deadline,'seconds':round(time.monotonic()-started,3),'availableBeforeKiB':available,'minimumAvailableKiB':minimum,'stopReason':stop}
Path(label+'.receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
sys.exit(receipt['exitCode'] if stop is None and receipt['exitCode'] >= 0 else 1)
