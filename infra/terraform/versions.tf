terraform {
  required_version = "= 1.16.3"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "= 1.69.0"
    }
  }
}

provider "hcloud" {}
