# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
variable "aws_region" {
  type    = string
  default = "eu-west-1"
}

variable "terraform_role_arn" {
  description = "Role Jenkins assumes to manage UAT infrastructure (infra permissions only)"
  type        = string
}

variable "change_id" {
  description = "Change/incident reference, stamped on every resource tag"
  type        = string
  default     = "local-dev"
}

variable "cost_center" {
  type    = string
  default = "CC-DEV-001"
}

# ---------------------------------------------------------------------------
# Network
# ---------------------------------------------------------------------------
variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}

variable "private_subnet_cidrs" {
  type    = list(string)
  default = ["10.40.10.0/24", "10.40.11.0/24"]
}

variable "alb_ingress_cidrs" {
  description = "UAT is open to the office/VPN range. Tighten before go-live."
  type        = list(string)
  default     = ["10.0.0.0/8"]
}

variable "bastion_cidrs" {
  description = "Prefer SSM Session Manager; leave empty to disable SSH entirely"
  type        = list(string)
  default     = []
}

variable "external_dependency_cidrs" {
  description = "Peered/TGW ranges of Oracle RDS, DocumentDB, Kafka and SFTP"
  type        = list(string)
  default     = []
}

variable "eks_public_access_cidrs" {
  type    = list(string)
  default = ["10.0.0.0/8"]
}

# ---------------------------------------------------------------------------
# Platform
# ---------------------------------------------------------------------------
variable "kubernetes_version" {
  type    = string
  default = "1.31"
}

variable "certificate_arn" {
  description = "Existing ACM certificate ARN (certificates are managed centrally)"
  type        = string
}

variable "access_logs_bucket" {
  description = "Existing S3 bucket for ALB access logs (empty = disabled)"
  type        = string
  default     = ""
}

variable "documents_bucket" {
  description = "Existing S3 bucket for application document storage"
  type        = string
}

variable "jmx_exporter_url" {
  type    = string
  default = ""
}

variable "main_app_version" {
  description = "Starting application version (deploy pipeline owns the WAR afterwards)"
  type        = string
  default     = "bootstrap"
}

# ---------------------------------------------------------------------------
# Existing external dependencies (placeholders only - never invented)
# ---------------------------------------------------------------------------
variable "oracle_jdbc_url" {
  description = "jdbc:oracle:thin:@//<existing-host>:1521/<service>"
  type        = string
}

variable "oracle_host" {
  type = string
}

variable "oracle_port" {
  type    = string
  default = "1521"
}

variable "documentdb_host" {
  description = "Existing DocumentDB / DocumentDB-compatible endpoint. Empty if unused in UAT."
  type        = string
  default     = "REPLACE_WITH_EXISTING_DOCUMENTDB_ENDPOINT"
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
  description = "Existing external/self-managed Kafka brokers host1:9093,host2:9093"
  type        = string
}

variable "microservice_base_url" {
  description = "Internal URL of the EKS microservice entry point (ALB ingress or internal NLB)"
  type        = string
}

# ---------------------------------------------------------------------------
# Secrets: supplied through environment variables, never committed
# ---------------------------------------------------------------------------
variable "secret_values" {
  description = "Map of credential bundles. Set TF_VAR_secret_values in Jenkins (withCredentials)."
  type        = map(map(string))
  default     = {}
  sensitive   = true
}
