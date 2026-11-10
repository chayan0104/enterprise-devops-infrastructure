output "autoscaling_group_name" {
  value = aws_autoscaling_group.wildfly.name
}

output "launch_template_id" {
  value = aws_launch_template.wildfly.id
}

output "instance_role_arn" {
  value = aws_iam_role.instance.arn
}

output "instance_profile_name" {
  description = "Used by the deploy pipeline to run remote commands via SSM"
  value       = aws_iam_instance_profile.instance.name
}

output "ami_id_in_use" {
  value = var.ami_id != "" ? var.ami_id : data.aws_ami.wildfly.id
}
