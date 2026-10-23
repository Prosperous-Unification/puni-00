import subprocess,sys,time,os,json,signal
p=subprocess.Popen(sys.argv[1:],start_new_session=True)
peak=0
ceiling=int(os.environ.get("RUNTIME_CLOSURE_RSS_MIB","768"))*1024*1024
while p.poll() is None:
    records={}
    for name in os.listdir('/proc'):
        if not name.isdigit(): continue
        try:
            fields=open('/proc/'+name+'/stat').read().split(); records[int(name)]=(int(fields[3]),int(fields[23])*os.sysconf('SC_PAGE_SIZE'))
        except (FileNotFoundError,ProcessLookupError,PermissionError): continue
    descendants={p.pid}
    for _ in records:
        grown={pid for pid,(parent,rss) in records.items() if parent in descendants}
        if grown <= descendants: break
        descendants |= grown
    rss=sum(records.get(pid,(0,0))[1] for pid in descendants);peak=max(peak,rss)
    if rss>ceiling:
        os.killpg(p.pid,signal.SIGKILL);p.wait(); print(json.dumps({'ceilingBytes':ceiling,'sampledPeakBytes':peak,'killed':True}));sys.exit(137)
    time.sleep(.02)
print(json.dumps({'ceilingBytes':ceiling,'sampledPeakBytes':peak,'exitCode':p.returncode}));sys.exit(p.returncode)
