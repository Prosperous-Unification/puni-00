import hashlib
import json
import pathlib
import subprocess
import sys
import time

PROJECT = 'puni-dev-observability'
ROOT = pathlib.Path('/home/monitor/puni-dev-observability')

def run(*argv):
    return subprocess.check_output(argv, text=True, timeout=8).strip()

def load(path):
    # Proof: actual absent/unreadable filesystem reads raise FileNotFoundError/PermissionError.
    # Proof: removing this bound admits the oversized trusted-file fixture.
    if path.stat().st_size > 1048576:
        raise RuntimeError('oversized trusted file: ' + str(path))
    return json.loads(path.read_text())

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def resolve_release_file(directory, name):
    # Proof: traversal/absolute-path negatives execute this production boundary with real Python.
    if pathlib.PurePath(name).name != name:
        raise RuntimeError('manifest path must be a basename')
    return directory / name

def docker(*argv):
    return json.loads(run('sudo', '-n', 'docker', *argv))

def container(record):
    return {'id': record['Id'], 'name': record['Name'],
            'startedAt': record['State']['StartedAt'], 'restartCount': record['RestartCount'],
            'status': record['State']['Status'], 'image': record['Config']['Image'],
            'memory': record['HostConfig']['Memory'], 'cpuQuota': record['HostConfig']['NanoCpus'], 'pidsLimit': record['HostConfig']['PidsLimit'],
            'networks': sorted(record['NetworkSettings']['Networks']),
            'project': record['Config']['Labels'].get('com.docker.compose.project', ''),
            'service': record['Config']['Labels'].get('com.docker.compose.service', ''),
            'ports': [{'target': int(port.split('/')[0]), 'ip': binding['HostIp'], 'port': int(binding['HostPort'])}
                      for port, bindings in record['NetworkSettings']['Ports'].items() if bindings for binding in bindings],
            'volumes': [mount['Name'] for mount in record['Mounts'] if mount['Type'] == 'volume'],
            'aliases': (record['NetworkSettings']['Networks'].get('h3mon-observability_query') or {}).get('Aliases') or []}

if sys.argv[1:] == ['h3']:
    base = ROOT / 'releases/a1ffe27e7'
    release = ROOT / 'releases/c811f34bf'
    baseline = load(base / 'baseline.json')
    checks = []
    manifests = []
    for directory in [base, release]:
        manifest = load(directory / 'manifest.json')
        manifests.append(manifest)
        for name, expected in manifest['files'].items():
            path = resolve_release_file(directory, name)
            checks.append({'path': str(path), 'expected': expected, 'actual': digest(path)})
    for name, expected in baseline['preservedHashes'].items():
        checks.append({'path': name, 'expected': expected, 'actual': digest(pathlib.Path(name))})
    identifiers = run('sudo', '-n', 'docker', 'ps', '-aq').split()
    containers = docker('inspect', *identifiers)
    volumes = docker('volume', 'inspect', *[PROJECT + '_' + name for name in ['elasticsearch', 'kibana', 'collector', 'gateway', 'prometheus', 'alertmanager']])
    mem = dict(line.split(':', 1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
    snapshot = {'hostname': run('hostname'), 'memory': int(mem['MemAvailable'].split()[0]) * 1024,
                'storage': run('sudo', '-n', 'df', '-Pk', '/var/lib/docker'),
                'dockerVersion': run('sudo', '-n', 'docker', 'version', '--format', '{{.Server.Version}}'),
                'listeners': run('ss', '-H', '-ltn'), 'checks': checks, 'manifests': manifests,
                'baseline': baseline, 'containers': [container(record) for record in containers],
                'volumes': [{'name': volume['Name'], 'project': volume['Labels']['com.docker.compose.project'], 'volume': volume['Labels']['com.docker.compose.volume']} for volume in volumes],
                'network': {key: docker('network', 'inspect', 'h3mon-observability_query')[0][key] for key in ['Id', 'Driver', 'Internal']}}
elif sys.argv[1:] == ['h1']:
    lib = pathlib.Path('/home/claw/.local/lib/puni-dev-observability/ab4f7cf6e')
    state = pathlib.Path('/home/claw/.local/state/puni-dev-observability')
    manifest = load(lib / 'manifest.json')
    baseline = load(state / 'baseline.json')
    old = pathlib.Path('/home/claw/.config/systemd/user/h3mon-tunnel.service')
    mem = dict(line.split(':', 1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
    snapshot = {'hostname': run('hostname'), 'user': run('id', '-un'), 'arch': run('uname', '-m'),
                'memory': int(mem['MemAvailable'].split()[0]) * 1024,
                'storage': run('df', '-Pk', '/home/claw'),
                'manifest': manifest, 'binaryHash': digest(lib / 'observer'), 'binaryBytes': (lib / 'observer').stat().st_size,
                'baseline': baseline, 'existingTunnelHash': digest(old),
                'existingTunnel': run('systemctl', '--user', 'show', 'h3mon-tunnel.service', '--property=MainPID,ActiveState'),
                'linger': run('loginctl', 'show-user', 'claw', '--property=Linger', '--value'),
                'probe': load(state / 'probe.json'), 'health': load(state / 'health.json'),
                'listeners': run('ss', '-H', '-ltnp'),
                'units': {name: (pathlib.Path('/home/claw/.config/systemd/user') / name).read_text() if (pathlib.Path('/home/claw/.config/systemd/user') / name).exists() else None for name in ['puni-dev-observability.service', 'puni-dev-observability-tunnel.service']}}
    snapshot['tunnelPid'] = int(run('systemctl', '--user', 'show', 'puni-dev-observability-tunnel.service', '--property=MainPID', '--value')) if snapshot['units']['puni-dev-observability-tunnel.service'] is not None else 0
else:
    raise RuntimeError('fixed h1 or h3 mode required')
snapshot['observedAt'] = int(time.time() * 1000)
print(json.dumps(snapshot, separators=(',', ':')))
