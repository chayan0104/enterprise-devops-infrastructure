variable "name" {
  type = string
}

variable "environment_tag" {
  description = "uat or prod; also used for conditional IAM hardening"
  type        = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "security_group_id" {
  type = string
}

variable "target_group_arn" {
  description = "ALB target group from the alb module"
  type        = string
}

variable "instance_type" {
  type    = string
  default = "t3.large"
}

variable "ami_id" {
  description = "Hardened WildFly AMI ID. Empty = pick the newest from ami_name_pattern."
  type        = string
  default     = ""
}

variable "ami_owner" {
  description = "AWS account id that owns the golden AMI"
  type        = string
  default     = "self"
}

variable "ami_name_pattern" {
  type    = string
  default = "rhel-9-wildfly-*"
}

variable "min_size" {
  type    = number
  default = 2
}

variable "max_size" {
  type    = number
  default = 4
}

variable "desired_capacity" {
  type    = number
  default = 2
}

variable "root_volume_size" {
  type    = number
  default = 50
}

variable "ebs_kms_key_arn" {
  description = "Optional customer managed KMS key for the root volume"
  type        = string
  default     = ""
}

variable "wildfly_port" {
  type    = number
  default = 8080
}

variable "app_version" {
  description = "Informational: the deploy pipeline replaces the WAR through SSM, not Terraform"
  type        = string
  default     = "bootstrap"
}

variable "secret_arns" {
  description = "Only the secrets this application needs (db, sftp, kafka, internal API token)"
  type        = list(string)
}

variable "kms_key_arns" {
  type    = list(string)
  default = []
}

variable "documents_bucket_arn" {
  description = "Existing S3 bucket used for document storage"
  type        = string
}

variable "documents_prefix" {
  type    = string
  default = "main-app/"
}

variable "documents_bucket" {
  type = string
}

variable "secrets_prefix" {
  description = "Path prefix used to discover secrets at boot, e.g. ehd/uat/"
  type        = string
}

variable "microservice_domain" {
  description = "Internal DNS suffix for in-cluster microservices"
  type        = string
  default     = "svc.cluster.local"
}

variable "external_endpoints" {
  description = "Non-secret endpoint placeholders for existing dependencies (Oracle, DocumentDB, SFTP, Kafka, EKS internal services)"
  type        = map(string)
  default     = {}
}

variable "jmx_exporter_url" {
  description = "JMX exporter javaagent location (S3 URL or internal artifact repo)"
  type        = string
  default     = ""
}

variable "cpu_target_value" {
  type    = number
  default = 65
}

variable "enforce_tag_on_assume" {
  description = "Set true when the account enforces aws:ResourceTag on role assumption"
  type        = bool
  default     = false
}

variable "tags" {
  type    = map(string)
  default = {}
}
