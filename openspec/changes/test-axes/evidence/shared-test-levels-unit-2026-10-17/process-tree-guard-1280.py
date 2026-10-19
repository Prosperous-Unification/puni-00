import os, subprocess, sys, time, json
log=sys.argv[1]
p=subprocess.Popen(sys.argv[2:], stdout=open(log,'w'), stderr=subprocess.STDOUT, env=dict(os.environ,NODE_OPTIONS=os.environ.get('NODE_OPTIONS', '--max-old-space-size=896')))
peak=0
commands=set()
while p.poll() is None:
    parents={}; sizes={}
    for name in os.listdir('/proc'):
        if name.isdigit():
            try:
                lines=open('/proc/'+name+'/status').read().splitlines()
                fields={line.split(':')[0]:line.split(':')[1].strip() for line in lines if ':' in line}
                parents[int(name)]=int(fields['PPid']); sizes[int(name)]=int(fields.get('VmRSS','0 kB').split()[0])
            except (FileNotFoundError,ProcessLookupError): pass
    selected={p.pid}
    while True:
        expanded=selected|{pid for pid,parent in parents.items() if parent in selected}
        if expanded==selected: break
        selected=expanded
    for pid in selected:
        try:
            commands.add(tuple(part.decode('utf-8', errors='replace') for part in open('/proc/'+str(pid)+'/cmdline','rb').read().split(bytes([0])) if part))
        except (FileNotFoundError,ProcessLookupError): pass
    memory=sum(sizes.get(pid,0) for pid in selected); peak=max(memory,peak)
    if memory>1280*1024:
        for pid in selected:
            try: os.kill(pid,9)
            except ProcessLookupError: pass
        p.wait(); break
    time.sleep(.05)
receipt={'command':sys.argv[2:],'exitCode':p.wait(),'peakProcessTreeKiB':peak,'ceilingKiB':1280*1024,'observedArgv':[list(command) for command in sorted(commands)]}
open(log+'.json','w').write(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({key:value for key,value in receipt.items() if key != 'observedArgv'}))
sys.exit(0 if receipt['exitCode']==0 else 1)
