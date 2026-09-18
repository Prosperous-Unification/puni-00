"""Ansible half of `tool-fleet:check`, run inside the locked fleet controller image.

Syntax-checks every playbook, then runs the real `hetzner.hcloud` inventory plugin for each
`inventory/*.hcloud.yml` against a loopback Hetzner API stub (the container has no other network),
and prints one JSON report for `check.ts` to judge. The stub honours `label_selector` so a
foreign-cluster server proves the selector filters; it records every selector it was sent.
"""

import glob
import http.server
import json
import os
import subprocess
import sys
import threading
import urllib.parse

ANSIBLE_ROOT = sys.argv[1]
PORT = 8765

LOCATION = {"id": 1, "name": "fsn1", "city": "Falkenstein", "country": "DE", "description": "fsn1",
            "latitude": 0, "longitude": 0, "network_zone": "eu-central"}
SERVER_TYPE = {"id": 1, "name": "cx22", "description": "cx22", "cores": 2, "memory": 4, "disk": 40,
               "storage_type": "local", "cpu_type": "shared", "architecture": "x86", "prices": [],
               "deprecation": None}
IMAGE = {"id": 1, "type": "system", "status": "available", "name": "ubuntu-24.04",
         "description": "Ubuntu 24.04", "os_flavor": "ubuntu", "os_version": "24.04",
         "architecture": "x86", "labels": {}, "rapid_deploy": True,
         "created": "2026-01-01T00:00:00+00:00", "deprecated": None, "bound_to": None,
         "created_from": None, "disk_size": 5, "image_size": None, "protection": {"delete": False}}
DATACENTER = {"id": 1, "name": "fsn1-dc14", "description": "fsn1", "location": LOCATION,
              "server_types": {"available": [], "supported": [], "available_for_migration": []}}


def network(cluster, network_id):
    return {"id": network_id, "name": f"puni-{cluster}", "ip_range": "10.0.0.0/16", "subnets": [],
            "routes": [], "servers": [], "labels": {"puni-fleet": "puni", "puni-cluster": cluster},
            "created": "2026-01-01T00:00:00+00:00", "protection": {"delete": False},
            "load_balancers": [], "expose_routes_to_vswitch": False}


def server(server_id, name, cluster, network_id, ip, labels):
    return {"id": server_id, "name": name, "status": "running",
            "created": "2026-01-01T00:00:00+00:00",
            "public_net": {"ipv4": None, "ipv6": None, "floating_ips": [], "firewalls": []},
            "private_net": [{"network": network_id, "ip": ip, "alias_ips": [],
                             "mac_address": f"86:00:00:00:00:{server_id:02x}"}],
            "server_type": SERVER_TYPE, "datacenter": DATACENTER, "location": LOCATION,
            "image": IMAGE, "iso": None, "rescue_enabled": False, "locked": False,
            "backup_window": None, "outgoing_traffic": 0, "ingoing_traffic": 0,
            "included_traffic": 0, "protection": {"delete": False, "rebuild": False},
            "labels": {"puni-fleet": "puni", "puni-cluster": cluster, "puni-operation": "op-check",
                       **labels},
            "volumes": [], "load_balancers": [], "primary_disk_size": 40,
            "placement_group": None}


def fixture(cluster):
    """Three nodes of `cluster` on its own network, plus one node of another cluster."""
    return {
        "networks": [network(cluster, 7), network("foreign", 8)],
        "servers": [
            server(11, "bootstrap", cluster, 7, "10.0.0.11",
                   {"puni-k3s-role": "server", "puni-k3s-bootstrap": "true",
                    "puni-logical-node": "server-1"}),
            server(12, "joiner", cluster, 7, "10.0.0.12",
                   {"puni-k3s-role": "server", "puni-logical-node": "server-2"}),
            server(13, "agent", cluster, 7, "10.0.0.13",
                   {"puni-k3s-role": "agent", "puni-logical-node": "agent-1"}),
            server(14, "foreigner", "foreign", 8, "10.1.0.14",
                   {"puni-k3s-role": "agent", "puni-logical-node": "agent-9"}),
        ],
        "locations": [LOCATION], "server_types": [SERVER_TYPE], "images": [IMAGE],
        "datacenters": [DATACENTER],
    }


STATE = {"fixture": {}, "selectors": []}


def selected(item, query):
    selector = query.get("label_selector", [None])[0]
    if selector is not None:
        STATE["selectors"].append(selector)
        for clause in selector.split(","):
            key, _, value = clause.partition("=")
            if item.get("labels", {}).get(key) != value:
                return False
    name = query.get("name", [None])[0]
    return name is None or item.get("name") == name


class Api(http.server.BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 - http.server's contract
        url = urllib.parse.urlparse(self.path)
        parts = url.path.strip("/").split("/")
        resource = parts[1] if len(parts) > 1 else ""
        items = STATE["fixture"].get(resource)
        if items is None:
            self.reply(404, {"error": {"code": "not_found", "message": resource}})
            return
        if len(parts) > 2:
            match = [item for item in items if str(item["id"]) == parts[2]]
            if not match:
                self.reply(404, {"error": {"code": "not_found", "message": self.path}})
                return
            self.reply(200, {resource[:-1]: match[0]})
            return
        query = urllib.parse.parse_qs(url.query)
        chosen = [item for item in items if selected(item, query)]
        self.reply(200, {resource: chosen, "meta": {"pagination": {
            "page": 1, "per_page": 50, "previous_page": None, "next_page": None,
            "last_page": 1, "total_entries": len(chosen)}}})

    def reply(self, status, body):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


def run(argv, extra_env):
    env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": os.environ.get("HOME", "/runner"),
           "ANSIBLE_CONFIG": os.path.join(ANSIBLE_ROOT, "ansible.cfg"),
           "ANSIBLE_LOCAL_TEMP": "/tmp/ansible-local", "ANSIBLE_REMOTE_TEMP": "/tmp/ansible-remote",
           **extra_env}
    completed = subprocess.run(argv, cwd=ANSIBLE_ROOT, env=env, capture_output=True, text=True,
                               timeout=300, check=False)
    return completed.returncode, completed.stdout, completed.stderr


def main():
    server_thread = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Api)
    threading.Thread(target=server_thread.serve_forever, daemon=True).start()
    report = {"syntax": [], "inventories": []}
    playbooks = sorted(glob.glob("playbooks/*.yml", root_dir=ANSIBLE_ROOT)
                       + glob.glob("tests/*.yml", root_dir=ANSIBLE_ROOT))
    for playbook in playbooks:
        code, _, stderr = run(["ansible-playbook", "--syntax-check", "-i", "localhost,",
                               playbook], {})
        report["syntax"].append({"playbook": playbook, "exitCode": code, "stderr": stderr[-2000:]})
    for inventory in sorted(glob.glob("inventory/*.hcloud.yml", root_dir=ANSIBLE_ROOT)):
        cluster = os.path.basename(inventory).split(".")[0]
        STATE["fixture"] = fixture(cluster)
        STATE["selectors"] = []
        code, stdout, stderr = run(["ansible-inventory", "-i", inventory, "--list"], {
            "HCLOUD_TOKEN": "c" * 64,
            "HCLOUD_ENDPOINT": f"http://127.0.0.1:{PORT}/v1",
            "ANSIBLE_INVENTORY_UNPARSED_FAILED": "true",
            "ANSIBLE_INVENTORY_ANY_UNPARSED_IS_FAILED": "true",
        })
        try:
            listed = json.loads(stdout) if code == 0 else None
        except json.JSONDecodeError:
            listed = None
        report["inventories"].append({
            "file": inventory, "cluster": cluster, "exitCode": code, "stderr": stderr[-2000:],
            "listed": listed, "selectors": sorted(set(STATE["selectors"])),
        })
    server_thread.shutdown()
    json.dump(report, sys.stdout)


main()
