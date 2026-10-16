import hashlib
import json
import os
from pathlib import Path
import selectors
import subprocess
import tempfile
import time


def stop_process(process):
    if process.poll() is None:
        process.terminate()
    try:
        process.wait(timeout=2)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=2)


def run_probe(directory, executable, daemon, crictl, command, expected_pid=None, mode="--cri"):
    process = subprocess.Popen(
        [str(executable), str(directory / 'runtime.sock'), str(daemon.pid if expected_pid is None else expected_pid),
         str(directory), str(crictl), mode, command, str(directory / 'crictl.yaml')],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        if command == 'forbidden' or expected_pid is not None:
            stdout, stderr = process.communicate(timeout=4)
        else:
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                if not selector.select(timeout=3):
                    raise RuntimeError('native BOUND deadline')
                bound = process.stdout.readline()
            if not bound.startswith('BOUND '):
                stdout, stderr = process.communicate(timeout=4)
                raise AssertionError(f'expected BOUND: {bound + stdout!r}, {stderr!r}, exit={process.returncode}')
            stdout, stderr = process.communicate('R', timeout=4)
            stdout = bound + stdout
        child = None
        private = None
        for line in stdout.splitlines():
            if line.startswith('CHILD '):
                child = int(line.split()[1])
            if line.startswith('BOUND '):
                private = Path(line.split()[1]).parent
        observed = {'command': command, 'exit': process.returncode, 'stdout': stdout, 'stderr': stderr,
                    'childAlive': child is not None and Path(f'/proc/{child}').exists(),
                    'privateExists': private is not None and private.exists(), 'mode': mode}
        print(json.dumps(observed), flush=True)
        assert not observed['childAlive'], observed
        assert not observed['privateExists'], observed
        return observed
    finally:
        stop_process(process)


crictl = Path(os.environ['CRI_PROBE_CRICTL']).resolve(strict=True)
expected_hash = '53f836ba94d4d4b5ac2a1d1df6ca7e7159ec994c8d8ea834469910cd5f7de4c6'
# Proof: CRI digest rejection test substitutes /usr/bin/true and observes no daemon receipt;
# omitting this comparison lets the fixture reach disposable daemon startup (2026-10-16).
assert hashlib.sha256(crictl.read_bytes()).hexdigest() == expected_hash, 'crictl executable digest mismatch'
source = Path(os.environ.get('RELAY_SOURCE', Path(__file__).with_name('relay.c')))
with tempfile.TemporaryDirectory(prefix='f9-cri-') as scratch:
    directory = Path(scratch)
    executable = directory / 'relay'
    subprocess.run(['cc', '-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', str(source), '-o', str(executable)], check=True, timeout=10)
    config = f'''version = 4
root = '{directory}/root'
state = '{directory}/state'
imports = []
disabled_plugins = ['io.containerd.nri.v1.nri']
[plugins.'io.containerd.server.v1.grpc']
address = '{directory}/runtime.sock'
[plugins.'io.containerd.server.v1.ttrpc']
address = '{directory}/ttrpc.sock'
[plugins.'io.containerd.internal.v1.opt']
path = '{directory}/opt'
[plugins.'io.containerd.cri.v1.images']
snapshotter = 'native'
[plugins.'io.containerd.cri.v1.runtime']
cdi_spec_dirs = ['{directory}/cdi']
[plugins.'io.containerd.cri.v1.runtime'.cni]
bin_dirs = ['{directory}/cni-bin']
conf_dir = '{directory}/cni-conf'
'''
    (directory / 'config.toml').write_text(config)
    (directory / 'crictl.yaml').write_text('{}\n')
    with (directory / 'daemon.log').open('w+') as log:
        daemon = subprocess.Popen(['/usr/bin/containerd', '--config', str(directory / 'config.toml')], stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 5
            while not (directory / 'runtime.sock').exists():
                if daemon.poll() is not None or time.monotonic() >= deadline:
                    log.seek(0)
                    raise RuntimeError('disposable containerd startup: ' + log.read())
                time.sleep(.02)
            for command in [['version'], ['ps', '-a', '-o', 'json'], ['inspect', 'f9-probe-absent']]:
                direct = subprocess.run([str(crictl), '--config', str(directory / 'crictl.yaml'),
                    '--runtime-endpoint', 'unix://' + str(directory / 'runtime.sock'), '--timeout', '1s', *command],
                    capture_output=True, text=True, timeout=3)
                print(json.dumps({'direct': command, 'exit': direct.returncode, 'stdout': direct.stdout, 'stderr': direct.stderr}), flush=True)
                if command[0] == 'version':
                    assert direct.returncode == 0 and 'RuntimeName:  containerd' in direct.stdout
                elif command[0] == 'ps':
                    assert direct.returncode == 0 and json.loads(direct.stdout) == {'containers': []}
                else:
                    assert direct.returncode != 0 and 'code = NotFound' in direct.stderr
            version = run_probe(directory, executable, daemon, crictl, 'version')
            assert 'RuntimeName:  containerd' in version['stdout'] and 'RuntimeApiVersion:  v1' in version['stdout'], version
            assert (version['exit'] == 0 and version['stderr'] == '') or (version['exit'] == 1 and version['stderr'] in ['relay:read\n', 'relay:write\n']), version
            listing = run_probe(directory, executable, daemon, crictl, 'list')
            assert listing['exit'] != 0 and 'validate CRI v1 image API' in listing['stdout'] and 'connection refused' in listing['stdout'], listing
            status = run_probe(directory, executable, daemon, crictl, 'status')
            assert status['exit'] != 0 and 'validate CRI v1 image API' in status['stdout'] and 'connection refused' in status['stdout'] and status['stderr'] == 'relay:child-exit\n', status
            forbidden = run_probe(directory, executable, daemon, crictl, 'forbidden')
            assert forbidden['exit'] == 64 and forbidden['stdout'] == '', forbidden
            foreign = run_probe(directory, executable, daemon, crictl, 'version', os.getpid())
            assert foreign['exit'] != 0 and foreign['stdout'] == '' and foreign['stderr'] == 'relay:upstream-peer\n', foreign
        finally:
            stop_process(daemon)
            print(json.dumps({'daemonReaped': daemon.poll() is not None, 'daemonExit': daemon.returncode}), flush=True)
