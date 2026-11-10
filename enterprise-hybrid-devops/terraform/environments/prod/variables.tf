variable "aws_region" {
  type    = string
  default = "eu-west-1"
}

variable "terraform_role_arn" {
  description = "PROD infrastructure role. Separate from the application deploy role."
  type        = string
}

variable "change_id" {
  description = "ServiceNow change reference. Required by policy for prod applies."
  type        = string
}

variable "cost_center" {
  type    = string
  default = "CC-PROD-001"
}

variable "vpc_cidr" {
  type    = string
  default = "10.50.0.0/16"
}

variable "private_subnet_cidrs" {
  type    = list(string)
  default = ["10.50.10.0/24", "10.50.11.0/24"]
}

variable "alb_ingress_cidrs" {
  description = "Corporate egress CIDRs only. Never 0.0.0.0/0 in prod."
  type        = list(string)
}

variable "bastion_cidrs" {
  type    = list(string)
  default = [] # SSM Session Manager only
}

variable "external_dependency_cidrs" {
  description = "Peered/TGW ranges for Oracle RDS, DocumentDB, Kafka and SFTP"
  type        = list(string)
}

variable "eks_public_access_cidrs" {
  description = "Ignored when endpoint_public_access is false (prod sets false)"
  type        = list(string)
  default     = []
}

variable "kubernetes_version" {
  type    = string
  default = "1.31"
}

variable "certificate_arn" {
  type = string
}

variable "access_logs_bucket" {
  description = "Existing central S3 bucket for ALB access logs"
  type        = string
}

variable "documents_bucket" {
  type = string
}

variable "jmx_exporter_url" {
  description = "Empty in PROD: Dynatrace OneAgent handles JVM metrics"
  type        = string
  default     = ""
}

variable "main_app_version" {
  type    = string
  default = "bootstrap"
}

variable "oracle_jdbc_url" {
  type = string
}

variable "oracle_host" {
  type = string
}

variable "oracle_port" {
  type    = string
  default = "1521"
}

variable "documentdb_host" {
  type = string
}

variable "documentdb_port" {
  type    = string
  default = "27017"
}

variable "documentdb_database" {
  type    = string
  default = "documents"
}

variable "sftp_host" {
  type = string
}

variable "sftp_port" {
  type    = string
  default = "22"
}

variable "kafka_bootstrap_servers" {
  type = string
}

variable "microservice_base_url" {
  type = string
}

variable "secret_values" {
  type      = map(map(string))
  default   = {}
  sensitive = true
}
