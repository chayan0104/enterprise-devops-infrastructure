output "vpc_id" {
  value = aws_vpc.this.id
}

output "vpc_cidr" {
  value = aws_vpc.this.cidr_block
}

output "public_subnet_ids" {
  description = "Used by the ALB"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Used by EC2 (WildFly) and EKS managed node groups"
  value       = aws_subnet.private[*].id
}

output "availability_zones" {
  value = local.azs
}
