import hashlib
import json
import os
import pathlib
import re
import stat
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

def require_alertmanager(records):
    """Select only the running owned Alertmanager with its retained persistent volume."""
    selected = [record for record in records if record['Name'] == '/' + PROJECT + '-alertmanager-1']
    # Proof: unique-check omission certifies duplicate-container evidence in alert-secret.test.ts.
    if len(selected) != 1:
        raise RuntimeError('missing or ambiguous Alertmanager container')
    record = selected[0]
    # Proof: identity-check omission executes/certifies a foreign-project container in alert-secret.test.ts.
    if (record['State']['Running'] is not True
            or record['Config']['Labels']['com.docker.compose.project'] != PROJECT
            or record['Config']['Labels']['com.docker.compose.service'] != 'alertmanager'
            or not re.fullmatch(r'[a-f0-9]{64}', record['Id'])):
        raise RuntimeError('untrusted Alertmanager container identity')
    mounts = [mount for mount in record['Mounts'] if mount['Destination'] == '/alertmanager']
    # Proof: mount-check omission executes/certifies a foreign persistent volume in alert-secret.test.ts.
    if (len(mounts) != 1 or mounts[0]['Type'] != 'volume'
            or mounts[0]['Name'] != PROJECT + '_alertmanager' or mounts[0]['RW'] is not True):
        raise RuntimeError('untrusted persistent Alertmanager volume')
    return record

def verify_slack_secret(records):
    """Read only the fixed service-owned secret via its container identity. No bytes enter snapshot output; amtool does not check this dependency."""
    record = require_alertmanager(records)
    command = r'''set -eu
secret=/alertmanager/secrets/slack-webhook
expected=65534:65534:600:1
# Proof: kind-check omission blocks on an actual owned FIFO; the bounded test kills/reaps its own group.
if ! test -f "$secret"; then
  printf '%s\n' 'protected Slack secret is not a regular file' >&2
  exit 1
fi
exec 3<"$secret"
# Proof: canonical-check omission falsely certifies an actual symlink in alert-secret.test.ts.
test "$(readlink -f /proc/self/fd/3)" = "$secret"
# Proof: metadata-check omission falsely certifies public-mode and hardlinked files in alert-secret.test.ts.
test "$(stat -Lc '%u:%g:%a:%h' /proc/self/fd/3)" = "$expected"
# Proof: read-bound omission reads over1025 bytes before later refusal; this is not successful certification.
head -c 1025 <&3
'''
    encoded = subprocess.check_output(
        ['sudo', '-n', 'docker', 'exec', record['Id'], '/bin/sh', '-ec', command],
        timeout=8,
    )
    # Proof: length-check omission certifies a valid1025byte fixture in alert-secret.test.ts.
    if len(encoded) > 1024:
        raise RuntimeError('oversized protected Slack secret')
    # Proof: format-check omission certifies malformed bytes in alert-secret.test.ts.
    if not re.fullmatch(rb'https://hooks[.]slack[.]com/services/T0CDTQBSBU0/[A-Za-z0-9]+/[A-Za-z0-9]+\n', encoded):
        raise RuntimeError('invalid protected Slack secret')
    return 'verified'

def read_notification_file(path):
    """Bound one ordinary config-file read; descriptor identity excludes links and substituted release directories."""
    # Proof: NOFOLLOW omission opens a real symlink before later refusal; NONBLOCK omission blocks on an owned FIFO killed/reaped by notification-files.test.ts.
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        metadata = os.fstat(descriptor)
        # Proof: kind-guard omission falsely emits FIFO file evidence in notification-files.test.ts.
        if not stat.S_ISREG(metadata.st_mode):
            raise RuntimeError('notification config must be a regular file')
        # Proof: canonical-guard omission emits substituted-directory evidence in notification-files.test.ts.
        if pathlib.Path(os.readlink('/proc/self/fd/' + str(descriptor))) != path:
            raise RuntimeError('notification config path is not canonical')
        owner = ROOT.stat()
        # Proof: metadata-guard omission admits actual writable/hardlinked files and modeled foreign UID/GID in notification-files.test.ts.
        if (metadata.st_uid != owner.st_uid or metadata.st_gid != owner.st_gid
                or stat.S_IMODE(metadata.st_mode) != 0o644 or metadata.st_nlink != 1):
            raise RuntimeError('notification config ownership/mode/link count refused')
        # Proof: size-guard omission reads an already oversized ordinary file before later refusal in notification-files.test.ts.
        if metadata.st_size > 65536:
            raise RuntimeError('oversized notification config')
        # Proof: cap omission reads81920 bytes before refusal under modeled concurrent growth in notification-files.test.ts.
        encoded = os.read(descriptor, 65537)
        # Proof: length-guard omission emits oversized evidence under modeled concurrent growth in notification-files.test.ts.
        if len(encoded) > 65536:
            raise RuntimeError('notification config grew beyond read bound')
        return encoded
    finally:
        # Proof: close omission leaves actual descriptors unclosed until process exit in notification-files.test.ts.
        os.close(descriptor)

def read_notification_release(records):
    """Verify owned host release files and checksum the fixed config through the inspected container ID. A host pathname replacement cannot prove the bytes pinned by a file bind mount; only the matching container observation completes this evidence."""
    record = require_alertmanager(records)
    mounts = [mount for mount in record['Mounts'] if mount['Destination'] == '/etc/puni/alertmanager.yaml']
    # Proof: mount-guard omission emits evidence from writable/duplicate/volume config mounts in notification-files.test.ts.
    if (len(mounts) != 1 or mounts[0]['Type'] != 'bind' or mounts[0]['RW'] is not False):
        raise RuntimeError('notification config must have one readonly bind mount')
    mounted = mounts[0]['Source']
    # Proof: path-guard omission reads real existing foreign/old-release files in notification-files.test.ts.
    if not isinstance(mounted, str) or not re.fullmatch(re.escape(str(ROOT)) + r'/releases/slack-[a-f0-9]{40}/alertmanager[.]yaml', mounted):
        raise RuntimeError('notification config must use its owned versioned release')
    directory = pathlib.Path(mounted).parent
    manifest = json.loads(read_notification_file(directory / 'manifest.json'))
    actual = {name: hashlib.sha256(read_notification_file(directory / name)).hexdigest()
              for name in ['alertmanager.yaml', 'compose.slack.json']}
    # Proof: skipping this observation or changing its captured ID/fixed argv/deadline fails the notification-files.test.ts success path and snapshot measurement faults.
    checksum = run('sudo', '-n', 'docker', 'exec', record['Id'], 'sha256sum', '/etc/puni/alertmanager.yaml')
    # Proof: removing this guard admits wrong-path/ambiguous checksum output in actual snapshot-expression tests in notification-files.test.ts.
    if not re.fullmatch(r'[a-f0-9]{64}  /etc/puni/alertmanager[.]yaml', checksum):
        raise RuntimeError('Invalid mounted notification configuration checksum')
    # Proof: removing this guard certifies an actual atomic host-path replacement while a distinct open descriptor models predecessor mount bytes in both reader/snapshot tests.
    if checksum[:64] != actual['alertmanager.yaml']:
        raise RuntimeError('Mounted notification configuration differs from host release')
    return {'directory': str(directory), 'mountedPath': mounted, 'manifest': manifest, 'actual': actual}

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
    # Proof: omitting this production guard falsely certifies missing/unreadable/malformed fixtures and skips the observed reader in alert-secret.test.ts snapshot tests.
    verify_slack_secret(containers)
    # Proof: forwarding a verifier return here exposes the injected credential-shaped return in alert-secret.test.ts actual producer/output test; only this fixed marker is output.
    # Proof: replacing notificationRelease's actual reader with a constant skips all file reads; snapshot-field tests fail in notification-files.test.ts.
    snapshot = {'hostname': run('hostname'), 'slackSecret': 'verified', 'notificationRelease': read_notification_release(containers), 'memory': int(mem['MemAvailable'].split()[0]) * 1024,
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
