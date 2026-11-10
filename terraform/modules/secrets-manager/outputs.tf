output "secret_arns" {
  description = "Map of secret name -> ARN, wired into workload IAM policies"
  value       = { for name, secret in aws_secretsmanager_secret.this : name => secret.arn }
}

output "secret_names" {
  value = { for name, secret in aws_secretsmanager_secret.this : name => secret.name }
}

output "kms_key_arn" {
  value = local.kms_key_arn
}
