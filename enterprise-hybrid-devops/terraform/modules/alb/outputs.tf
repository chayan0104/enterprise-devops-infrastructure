output "alb_arn" {
  value = aws_lb.this.arn
}

output "dns_name" {
  description = "Give this hostname to the DNS team for the application CNAME"
  value       = aws_lb.this.dns_name
}

output "zone_id" {
  value = aws_lb.this.zone_id
}

output "target_group_arn" {
  value = aws_lb_target_group.wildfly.arn
}

output "https_listener_arn" {
  value = aws_lb_listener.https.arn
}
