output "node_identities" {
  description = "Provider identities recorded before Ansible enrollment."
  value = {
    for node_id, server in hcloud_server.node : node_id => {
      instance_id = tostring(server.id)
      private_ip  = hcloud_server_network.node[node_id].ip
      ipv4_id     = try(hcloud_primary_ip.node[node_id].id, null)
      volume_id   = try(hcloud_volume.retained[node_id].id, null)
    }
  }
}
