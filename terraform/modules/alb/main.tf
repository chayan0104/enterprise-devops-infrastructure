###############################################################################
# Module: alb
# Public Application Load Balancer in front of the WildFly ASG.
# HTTP listener only redirects; HTTPS is the only path to the application.
# Session affinity is enabled because the main app keeps an HTTP session and
# is not fully stateless (in-memory session until migrated to clustered mode).
###############################################################################

resource "aws_lb" "this" {
  name               = "${var.name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.security_group_id]
  subnets            = var.public_subnet_ids

  # ALB access logs -> existing central logging bucket (no CloudFront/WAF here).
  dynamic "access_logs" {
    for_each = var.access_logs_bucket == "" ? [] : [1]
    content {
      bucket  = var.access_logs_bucket
      prefix  = var.access_logs_prefix
      enabled = true
    }
  }

  # Keep connections alive across deploys; shorter than the app's idle timeout.
  idle_timeout = var.idle_timeout

  tags = merge(var.tags, { Name = "${var.name}-alb" })
}

resource "aws_lb_target_group" "wildfly" {
  name        = "${var.name}-wildfly-tg"
  port        = var.wildfly_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "instance"

  deregistration_delay = var.deregistration_delay

  health_check {
    enabled             = true
    path                = var.health_check_path
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    protocol            = "HTTP"
  }

  stickiness {
    type            = "lb_cookie"
    enabled         = var.enable_stickiness
    cookie_duration = 3600
  }

  tags = merge(var.tags, { Name = "${var.name}-wildfly-tg" })
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.wildfly.arn
  }

  tags = var.tags
}

resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = var.tags
}
