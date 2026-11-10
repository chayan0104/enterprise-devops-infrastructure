variable "name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "eks_cluster_name" {
  description = "Cluster name used for the ownership tag on node security group"
  type        = string
}

variable "wildfly_port" {
  description = "HTTP port exposed by WildFly behind the ALB"
  type        = number
  default     = 8080
}

variable "alb_ingress_cidrs" {
  description = "Approved client CIDRs reaching the public ALB (corporate egress ranges)"
  type        = list(string)
  default     = ["0.0.0.0/0"] # PROD: replace with corporate NAT ranges
}

variable "bastion_cidrs" {
  description = "Where SSH is allowed from. Prefer SSM Session Manager and keep this empty."
  type        = list(string)
  default     = []
}

variable "external_dependency_cidrs" {
  description = "CIDRs of Oracle RDS, DocumentDB, Kafka and SFTP (peered/TGW networks)"
  type        = list(string)
  default     = []
}

variable "tags" {
  type    = map(string)
  default = {}
}
