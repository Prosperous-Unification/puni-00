locals {
  retained_nodes = {
    for node_id, node in var.nodes : node_id => node if node.retained_volume_gb > 0
  }
  public_nodes = {
    for node_id, node in var.nodes : node_id => node if node.public_ipv4
  }
  node_labels = {
    for node_id, node in var.nodes : node_id => merge(node.labels, {
      "puni-fleet"        = "puni"
      "puni-cluster"      = node.cluster
      "puni-logical-node" = node_id
      "puni-operation"    = node.operation_id
      "puni-network"      = node.network
      "puni-k3s-role"     = node.k3s_role
    })
  }
}

resource "hcloud_network" "cluster" {
  for_each = var.networks

  name     = "puni-${each.key}"
  ip_range = each.value.ip_range
  labels = {
    "puni-fleet"   = "puni"
    "puni-cluster" = each.key
  }
}

resource "hcloud_network_subnet" "cluster" {
  for_each = var.networks

  network_id   = hcloud_network.cluster[each.key].id
  type         = "cloud"
  network_zone = each.value.zone
  ip_range     = each.value.subnet
}

resource "hcloud_firewall" "cluster" {
  for_each = var.networks

  name = "puni-${each.key}"
  labels = {
    "puni-fleet"   = "puni"
    "puni-cluster" = each.key
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = var.ssh_recovery_cidrs
  }
}

resource "hcloud_primary_ip" "node" {
  for_each = local.public_nodes

  name        = "puni-${each.key}"
  location    = each.value.location
  type        = "ipv4"
  auto_delete = false
  labels      = local.node_labels[each.key]

  lifecycle {
    prevent_destroy = true
  }
}

resource "hcloud_server" "node" {
  for_each = var.nodes

  name        = each.key
  location    = each.value.location
  server_type = each.value.server_type
  image       = each.value.image
  ssh_keys    = each.value.ssh_key_ids
  labels      = local.node_labels[each.key]
  firewall_ids = [
    hcloud_firewall.cluster[each.value.network].id,
  ]

  public_net {
    ipv4_enabled = each.value.public_ipv4
    ipv4         = each.value.public_ipv4 ? hcloud_primary_ip.node[each.key].id : null
    ipv6_enabled = false
  }

  depends_on = [hcloud_network_subnet.cluster]
}

resource "hcloud_server_network" "node" {
  for_each = var.nodes

  server_id  = hcloud_server.node[each.key].id
  network_id = hcloud_network.cluster[each.value.network].id
  ip         = each.value.private_ip
}

resource "hcloud_volume" "retained" {
  for_each = local.retained_nodes

  name              = "puni-${each.key}"
  location          = each.value.location
  size              = each.value.retained_volume_gb
  format            = "ext4"
  delete_protection = true
  labels            = local.node_labels[each.key]

  lifecycle {
    prevent_destroy = true
  }
}

resource "hcloud_volume_attachment" "retained" {
  for_each = local.retained_nodes

  volume_id = hcloud_volume.retained[each.key].id
  server_id = hcloud_server.node[each.key].id
  automount = false
}
