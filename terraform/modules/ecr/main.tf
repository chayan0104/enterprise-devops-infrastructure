###############################################################################
# Module: ecr
# One private repository per deployable microservice. Tags are IMMUTABLE so a
# deployed tag can never be overwritten (that is what makes rollback safe).
# Scan on push gives a baseline CVE report; Trivy in Jenkins is the gate.
###############################################################################

resource "aws_ecr_repository" "this" {
  for_each = toset(var.repository_names)

  name                 = "${var.name_prefix}/${each.value}"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = var.environment_tag != "prod"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = var.kms_key_arn == "" ? "AES256" : "KMS"
    kms_key         = var.kms_key_arn == "" ? null : var.kms_key_arn
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}/${each.value}" })
}

# Keep the last 15 images: enough for rollback, bounded storage cost.
resource "aws_ecr_lifecycle_policy" "this" {
  for_each = aws_ecr_repository.this

  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep the 15 most recent release images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["release-"]
          countType     = "imageCountMoreThan"
          countNumber   = 15
        }
        action = { type = "expire" }
      }
    ]
  })
}

# Cross-account pull access for the EKS nodes in the workload account.
resource "aws_ecr_repository_policy" "this" {
  for_each = var.reader_account_ids == [] ? {} : aws_ecr_repository.this

  repository = each.value.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowWorkloadAccountsPull"
      Effect    = "Allow"
      Principal = { AWS = [for id in var.reader_account_ids : "arn:aws:iam::${id}:root"] }
      Action    = ["ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage", "ecr:BatchCheckLayerAvailability"]
    }]
  })
}
