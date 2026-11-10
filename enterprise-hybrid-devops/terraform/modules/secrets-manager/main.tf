###############################################################################
# Module: secrets-manager
# One secret per credential bundle. The VALUES are supplied through
# TF_VAR_* / CI environment (never committed). Terraform only manages the
# container, rotation window and the read policy for the owning workload role.
#
# Rotation: the Oracle DBA team owns password rotation; SFTP and Kafka are
# owned by integration teams. They can rotate the value out-of-band and the
# app re-reads it on next start / cache expiry. Enable automatic rotation only
# when the owning team provides a rotation Lambda.
###############################################################################

resource "aws_kms_key" "secrets" {
  count = var.create_kms_key ? 1 : 0

  description             = "${var.name} application secrets"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  tags                    = merge(var.tags, { Name = "${var.name}-secrets" })
}

resource "aws_kms_alias" "secrets" {
  count = var.create_kms_key ? 1 : 0

  name          = "alias/${var.name}-app-secrets"
  target_key_id = aws_kms_key.secrets[0].key_id
}

locals {
  kms_key_arn = var.create_kms_key ? aws_kms_key.secrets[0].arn : var.existing_kms_key_arn

  # Merge the credential payloads with safe JSON metadata. Values come from the
  # caller (CI), never from a committed tfvars file.
  secret_strings = {
    for name, payload in var.secret_values : name => jsonencode(payload)
  }
}

resource "aws_secretsmanager_secret" "this" {
  for_each = var.secret_values

  name                    = "${var.name_prefix}/${each.key}"
  description             = var.secret_descriptions[each.key]
  kms_key_id              = local.kms_key_arn == "" ? null : local.kms_key_arn
  recovery_window_in_days = var.environment_tag == "prod" ? 30 : 0

  tags = merge(var.tags, { Name = "${var.name_prefix}/${each.key}" })
}

resource "aws_secretsmanager_secret_version" "this" {
  for_each = var.secret_values

  secret_id     = aws_secretsmanager_secret.this[each.key].id
  secret_string = local.secret_strings[each.key]
}

# Read policy: only the workload roles passed in can read the secret. This is
# the resource policy; the IAM policy on the role is the second half of the
# least-privilege story (see the ec2 module and kubernetes ServiceAccounts).
data "aws_iam_policy_document" "read" {
  for_each = var.secret_values

  statement {
    sid    = "ReadByOwningWorkloadOnly"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = var.reader_role_arns
    }

    actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = ["*"]
  }

  dynamic "statement" {
    for_each = local.kms_key_arn == "" ? [] : [1]
    content {
      sid       = "AllowUseOfSecretKey"
      effect    = "Allow"
      actions   = ["kms:Decrypt"]
      resources = [local.kms_key_arn]
      principals {
        type        = "AWS"
        identifiers = var.reader_role_arns
      }
    }
  }
}

resource "aws_secretsmanager_secret_policy" "this" {
  for_each = var.secret_values

  secret_arn = aws_secretsmanager_secret.this[each.key].arn
  policy     = data.aws_iam_policy_document.read[each.key].json
}
