variable "name" {
  description = "Name prefix, e.g. ehd-uat"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block of the VPC"
  type        = string
  default     = "10.40.0.0/16"
}

variable "az_count" {
  description = "Number of AZs / subnet pairs (2 is enough for this workload)"
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2
    error_message = "Use at least two AZs so the ALB and EKS survive one AZ failure."
  }
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDRs, one per AZ (ALB + NAT gateways)"
  type        = list(string)
  default     = ["10.40.0.0/24", "10.40.1.0/24"]
}

variable "private_subnet_cidrs" {
  description = "Private subnet CIDRs, one per AZ (WildFly EC2 + EKS nodes)"
  type        = list(string)
  default     = ["10.40.10.0/24", "10.40.11.0/24"]
}

variable "nat_gateway_count" {
  description = "1 in UAT (cost), 2 in PROD (one per AZ, no shared failure)"
  type        = number
  default     = 1
}

variable "tags" {
  description = "Common tags applied to every resource"
  type        = map(string)
  default     = {}
}
