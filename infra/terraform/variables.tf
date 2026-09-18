variable "networks" {
  description = "Private networks keyed by stable cluster identity."
  type = map(object({
    ip_range = string
    zone     = string
    subnet   = string
  }))
}

variable "nodes" {
  description = "Reviewed nodes keyed by stable logical node ID; map position never carries identity."
  type = map(object({
    cluster            = string
    k3s_role           = string
    operation_id       = string
    location           = string
    server_type        = string
    image              = string
    network            = string
    private_ip         = string
    ssh_key_ids        = set(string)
    public_ipv4        = bool
    retained_volume_gb = number
    labels             = map(string)
  }))

  validation {
    condition = alltrue([
      for node_id, node in var.nodes :
      length(node_id) > 0 &&
      length(node.cluster) > 0 &&
      contains(["server", "agent"], node.k3s_role) &&
      length(node.operation_id) > 0 &&
      contains(keys(var.networks), node.network) &&
      length(node.ssh_key_ids) > 0 &&
      node.retained_volume_gb >= 0
    ])
    error_message = "Every node requires stable identity, cluster, known network, SSH keys, and nonnegative storage."
  }
}

variable "ssh_recovery_cidrs" {
  description = "Explicit operator recovery networks allowed to reach SSH."
  type        = set(string)
}

variable "budget_cap_eur" {
  description = "Reviewed maximum monthly cost for this provisioning operation."
  type        = number
  validation {
    condition     = var.budget_cap_eur > 0
    error_message = "The provisioning budget cap must be positive."
  }
}

variable "estimated_monthly_cost_eur" {
  description = "Provider price estimate captured before the saved plan was reviewed."
  type        = number
  validation {
    condition     = var.estimated_monthly_cost_eur > 0 && var.estimated_monthly_cost_eur <= var.budget_cap_eur
    error_message = "The reviewed monthly estimate must be positive and within the budget cap."
  }
}
