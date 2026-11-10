variable "name_prefix" {
  description = "e.g. ehd-uat"
  type        = string
}

variable "environment_tag" {
  type = string
}

variable "repository_names" {
  description = "One entry per deployable image, e.g. order-service, notification-service, kafka-consumer"
  type        = list(string)
}

variable "reader_account_ids" {
  description = "Optional cross-account readers (empty in a single-account setup)"
  type        = list(string)
  default     = []
}

variable "kms_key_arn" {
  type    = string
  default = ""
}

variable "tags" {
  type    = map(string)
  default = {}
}
