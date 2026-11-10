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

  # Production state is in the same bucket, different key. Access to this key
  # is restricted to the prod Terraform role only (bucket policy in platform repo).
  backend "s3" {
    key          = "env/prod/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region

  assume_role {
    role_arn     = var.terraform_role_arn
    session_name = "terraform-prod-${var.change_id}"
  }

  default_tags {
    tags = {
      Project     = "enterprise-hybrid-devops"
      Environment = "prod"
      ManagedBy   = "terraform"
      ChangeId    = var.change_id
    }
  }
}
