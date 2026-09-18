terraform {
  # Address, locking endpoints, TLS credentials, and access credentials are supplied through the
  # standard TF_HTTP_* environment boundary. The backend service must encrypt and version state.
  backend "http" {}
}
