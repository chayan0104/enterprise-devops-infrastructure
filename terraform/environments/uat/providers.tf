terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Independent state per environment. Credentials come from the Jenkins
  # AssumeRole session or from the developer's SSO profile, never from Git.
  #
  #   terraform init \
  #     -backend-config="bucket=<state-bucket>" \
  #     -backend-config="key=env/uat/terraform.tfstate" \
  #     -backend-config="region=eu-west-1" \
  #     -backend-config="dynamodb_table=<lock-table>"
  backend "s3" {
    key          = "env/uat/terraform.tfstate"
    encrypt      = true
    use_lockfile = true # S3-native locking (Terraform >= 1.10). Use dynamodb_table on older versions.
  }
}

provider "aws" {
  region = var.aws_region

  # Assume the environment's deployment role instead of using static keys.
  assume_role {
    role_arn     = var.terraform_role_arn
    session_name = "terraform-uat-${var.change_id}"
  }

  default_tags {
    tags = {
      Project     = "enterprise-hybrid-devops"
      Environment = "uat"
      ManagedBy   = "terraform"
      ChangeId    = var.change_id
    }
  }
}
