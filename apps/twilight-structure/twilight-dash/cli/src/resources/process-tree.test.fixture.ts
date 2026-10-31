/** A real same-session child survives TERM after its leader exits; readiness includes its PID. */
export const termIgnoringChild = String.raw`
import os,signal,sys,time
child=os.fork()
if child==0:
 signal.signal(signal.SIGTERM,signal.SIG_IGN)
 with open(sys.argv[1],'w') as ready: ready.write(str(os.getpid()))
 while True: time.sleep(1)
while True: time.sleep(1)
`;
