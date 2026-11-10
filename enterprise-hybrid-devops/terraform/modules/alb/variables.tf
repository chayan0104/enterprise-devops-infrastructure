variable "name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  description = "At least two public subnets in different AZs"
  type        = list(string)
}

variable "security_group_id" {
  description = "ALB security group from the security-groups module"
  type        = string
}

variable "certificate_arn" {
  description = "Existing ACM certificate ARN. Route 53 is NOT managed here; DNS is owned by the platform team."
  type        = string
}

variable "wildfly_port" {
  type    = number
  default = 8080
}

variable "health_check_path" {
  description = "Application health endpoint, never a static page"
  type        = string
  default     = "/health/ready"
}

variable "enable_stickiness" {
  description = "Keep true while the main app stores sessions locally"
  type        = bool
  default     = true
}

variable "deregistration_delay" {
  description = "Seconds to drain a target before removal (rolling deploy safety)"
  type        = number
  default     = 30
}

variable "idle_timeout" {
  type    = number
  default = 120
}

variable "access_logs_bucket" {
  description = "Existing S3 bucket for ALB access logs (create it outside this project or leave empty to disable)"
  type        = string
  default     = ""
}

variable "access_logs_prefix" {
  type    = string
  default = "alb"
}

variable "tags" {
  type    = map(string)
  default = {}
}
