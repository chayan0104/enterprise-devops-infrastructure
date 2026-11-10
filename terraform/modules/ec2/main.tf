###############################################################################
# Module: ec2
# WildFly main application: launch template + Auto Scaling Group attached to
# the ALB target group. IAM is created here because it is specific to this
# workload (instance profile -> Secrets Manager + S3 documents + CloudWatch).
# No SSH key is baked in: access is through SSM Session Manager.
###############################################################################

data "aws_partition" "current" {}
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "aws_ami" "wildfly" {
  most_recent = true
  owners      = [var.ami_owner]

  filter {
    name   = "name"
    values = [var.ami_name_pattern]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

# ---------------------------------------------------------------------------
# Least-privilege IAM for the WildFly instances
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "assume_ec2" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }

    # Optional hardening used in regulated accounts: only allow the role to be
    # assumed by instances carrying our environment tag.
    dynamic "condition" {
      for_each = var.enforce_tag_on_assume ? [1] : []
      content {
        test     = "StringEquals"
        variable = "aws:ResourceTag/Environment"
        values   = [var.environment_tag]
      }
    }
  }
}

resource "aws_iam_role" "instance" {
  name               = "${var.name}-wildfly-instance"
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json
  tags               = merge(var.tags, { Name = "${var.name}-wildfly-instance" })
}

data "aws_iam_policy_document" "instance" {
  statement {
    sid       = "ReadOwnApplicationSecrets"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = var.secret_arns
  }

  statement {
    sid    = "DocumentStorage"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:AbortMultipartUpload",
    ]
    resources = ["${var.documents_bucket_arn}/${var.documents_prefix}*"]
  }

  statement {
    sid       = "ListOwnDocumentPrefix"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [var.documents_bucket_arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = [var.documents_prefix, "${var.documents_prefix}*"]
    }
  }

  statement {
    sid    = "DecryptWithApplicationKey"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]
    resources = var.kms_key_arns
  }

  # SSM Session Manager (no inbound SSH, no bastion required in PROD).
  statement {
    sid    = "SessionManager"
    effect = "Allow"
    actions = [
      "ssm:UpdateInstanceInformation",
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "CloudWatchLogs"
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
    resources = ["arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/ec2/${var.name}/wildfly:*"]
  }
}

resource "aws_iam_policy" "instance" {
  name   = "${var.name}-wildfly-instance"
  policy = data.aws_iam_policy_document.instance.json
  tags   = var.tags
}

resource "aws_iam_role_policy_attachment" "instance" {
  role       = aws_iam_role.instance.name
  policy_arn = aws_iam_policy.instance.arn
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "instance" {
  name = "${var.name}-wildfly-instance"
  role = aws_iam_role.instance.name
  tags = var.tags
}

# ---------------------------------------------------------------------------
# Launch template + ASG
# ---------------------------------------------------------------------------
resource "aws_launch_template" "wildfly" {
  name_prefix   = "${var.name}-wildfly-"
  image_id      = var.ami_id != "" ? var.ami_id : data.aws_ami.wildfly.id
  instance_type = var.instance_type

  iam_instance_profile {
    arn = aws_iam_instance_profile.instance.arn
  }

  vpc_security_group_ids = [var.security_group_id]

  # IMDSv2 only: stops SSRF-style credential theft through the app.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  user_data = base64encode(templatefile("${path.module}/user_data.sh.tpl", {
    environment         = var.environment_tag
    aws_region          = data.aws_region.current.name
    secrets_prefix      = var.secrets_prefix
    docs_bucket         = var.documents_bucket
    app_version         = var.app_version
    wildfly_port        = var.wildfly_port
    log_group           = "/aws/ec2/${var.name}/wildfly"
    jmx_exporter_jar    = var.jmx_exporter_url
    microservice_domain = var.microservice_domain
    external_endpoints  = var.external_endpoints
  }))

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = var.root_volume_size
      volume_type           = "gp3"
      encrypted             = true
      kms_key_id            = var.ebs_kms_key_arn != "" ? var.ebs_kms_key_arn : null
      delete_on_termination = true
    }
  }

  tag_specifications {
    resource_type = "instance"
    tags          = merge(var.tags, { Name = "${var.name}-wildfly", Environment = var.environment_tag })
  }

  tag_specifications {
    resource_type = "volume"
    tags          = merge(var.tags, { Name = "${var.name}-wildfly" })
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_autoscaling_group" "wildfly" {
  name                = "${var.name}-wildfly-asg"
  vpc_zone_identifier = var.private_subnet_ids
  target_group_arns   = [var.target_group_arn]

  min_size         = var.min_size
  max_size         = var.max_size
  desired_capacity = var.desired_capacity

  health_check_type         = "ELB"
  health_check_grace_period = 300

  # Rolling instance refresh: launch new instances before terminating old ones.
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 100
      instance_warmup        = 180
    }
  }

  launch_template {
    id      = aws_launch_template.wildfly.id
    version = "$Latest"
  }

  dynamic "tag" {
    for_each = merge(var.tags, {
      Name        = "${var.name}-wildfly"
      Environment = var.environment_tag
      AppVersion  = var.app_version
    })
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [desired_capacity] # CI scales through the ASG API
  }
}

# Scale on CPU using a target tracking policy (no separate autoscaling module).
resource "aws_autoscaling_policy" "cpu" {
  name                   = "${var.name}-wildfly-cpu"
  autoscaling_group_name = aws_autoscaling_group.wildfly.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = var.cpu_target_value
  }
}
