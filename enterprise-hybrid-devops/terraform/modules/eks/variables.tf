variable "cluster_name" {
  type = string
}

variable "environment_tag" {
  type = string
}

variable "kubernetes_version" {
  type    = string
  default = "1.31"
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  description = "Nodes and control plane ENIs live in these subnets"
  type        = list(string)
}

variable "nodes_security_group_id" {
  description = "eks-nodes group from the security-groups module"
  type        = string
}

variable "node_instance_types" {
  type    = list(string)
  default = ["m6i.large"]
}

variable "capacity_type" {
  description = "ON_DEMAND for prod, SPOT is acceptable in UAT"
  type        = string
  default     = "ON_DEMAND"
}

variable "node_min_size" {
  type    = number
  default = 2
}

variable "node_max_size" {
  type    = number
  default = 6
}

variable "node_desired_size" {
  type    = number
  default = 3
}

variable "endpoint_public_access" {
  description = "UAT true for convenience, PROD false (VPN/SSM only)"
  type        = bool
  default     = false
}

variable "public_access_cidrs" {
  type    = list(string)
  default = ["10.0.0.0/8"]
}

variable "cluster_log_types" {
  description = "Control-plane logs delivered to CloudWatch"
  type        = list(string)
  default     = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
}

variable "tags" {
  type    = map(string)
  default = {}
}
