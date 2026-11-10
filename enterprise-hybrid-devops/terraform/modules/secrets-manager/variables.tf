variable "name" {
  description = "Human readable bundle name, e.g. ehd-uat-app-secrets"
  type        = string
}

variable "name_prefix" {
  description = "Secret path prefix, e.g. ehd/uat"
  type        = string
}

variable "environment_tag" {
  type = string
}

variable "secret_values" {
  description = <<-EOT
    Map of secret name -> JSON-serialisable object. Supplied at apply time:
      TF_VAR_secret_values='{"db":{"username":"...","password":"..."}}'
    Values must never be committed. Leave empty to only reference existing
    secrets (set secret_descriptions and use data sources instead).
  EOT
  type        = map(map(string))
  default     = {}
  sensitive   = true
}

variable "secret_descriptions" {
  description = "Description per secret, e.g. db = Oracle app schema credential"
  type        = map(string)
  default     = {}
}

variable "reader_role_arns" {
  description = "Workload IAM roles allowed to read these secrets (EC2 instance role, IRSA roles)"
  type        = list(string)
  default     = []
}

variable "create_kms_key" {
  description = "Create a dedicated CMK. False = pass existing_kms_key_arn instead."
  type        = bool
  default     = true
}

variable "existing_kms_key_arn" {
  type    = string
  default = ""
}

variable "tags" {
  type    = map(string)
  default = {}
}
