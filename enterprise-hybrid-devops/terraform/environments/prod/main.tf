###############################################################################
# PRODUCTION environment
# Independent state: s3://<state-bucket>/env/prod/terraform.tfstate
# Differences vs UAT (intentional, keep this list short):
#   - 2 NAT gateways, ON_DEMAND nodes, 3 WildFly instances min
#   - EKS API endpoint private only, control-plane logs always on
#   - Deletion protection on the app's persistent resources
#   - Terraform role is prod-infra (separate from the app deploy role)
###############################################################################

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  name        = "ehd-prod"
  environment = "prod"

  # Built from the documented role name to avoid a secrets <-> ec2 module cycle.
  wildfly_role_arn = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:role/${local.name}-wildfly-instance"

  tags = {
    Project     = "enterprise-hybrid-devops"
    Environment = local.environment
    Owner       = "platform-engineering"
    ManagedBy   = "terraform"
    CostCenter  = var.cost_center
    Criticality = "tier-1"
  }

  # Existing dependencies (placeholders supplied per environment).
  external_endpoints = {
    "oracle.jdbc.url"    = var.oracle_jdbc_url
    "oracle.host"        = var.oracle_host
    "oracle.port"        = var.oracle_port
    "documentdb.host"    = var.documentdb_host
    "documentdb.port"    = var.documentdb_port
    "documentdb.db"      = var.documentdb_database
    "sftp.host"          = var.sftp_host
    "sftp.port"          = var.sftp_port
    "kafka.bootstrap"    = var.kafka_bootstrap_servers
    "microservices.base" = var.microservice_base_url
  }
}

module "vpc" {
  source = "../../modules/vpc"

  name                 = local.name
  vpc_cidr             = var.vpc_cidr
  az_count             = 2
  nat_gateway_count    = 2
  private_subnet_cidrs = var.private_subnet_cidrs
  tags                 = local.tags
}

module "security_groups" {
  source = "../../modules/security-groups"

  name                          = local.name
  vpc_id                        = module.vpc.vpc_id
  eks_cluster_name              = local.name
  alb_ingress_cidrs             = var.alb_ingress_cidrs
  bastion_cidrs                 = var.bastion_cidrs
  external_dependency_cidrs = var.external_dependency_cidrs
  tags                       = local.tags
}

module "ecr" {
  source = "../../modules/ecr"

  name_prefix     = local.name
  environment_tag = local.environment
  repository_names = [
    "order-service",
    "notification-service",
    "kafka-consumer",
  ]
  tags = local.tags
}

module "eks" {
  source = "../../modules/eks"

  cluster_name            = local.name
  environment_tag         = local.environment
  kubernetes_version      = var.kubernetes_version
  vpc_id                  = module.vpc.vpc_id
  private_subnet_ids      = module.vpc.private_subnet_ids
  nodes_security_group_id = module.security_groups.eks_nodes_security_group_id
  node_instance_types     = ["m6i.xlarge"]
  capacity_type           = "ON_DEMAND"
  node_min_size           = 3
  node_max_size           = 8
  node_desired_size       = 4
  endpoint_public_access  = false
  public_access_cidrs     = var.eks_public_access_cidrs
  tags                    = local.tags
}

module "alb" {
  source = "../../modules/alb"

  name               = local.name
  vpc_id             = module.vpc.vpc_id
  public_subnet_ids  = module.vpc.public_subnet_ids
  security_group_id  = module.security_groups.alb_security_group_id
  certificate_arn    = var.certificate_arn
  health_check_path  = "/health/ready"
  idle_timeout       = 180
  access_logs_bucket = var.access_logs_bucket
  tags               = local.tags
}

module "secrets" {
  source = "../../modules/secrets-manager"

  name            = "${local.name}-app-secrets"
  name_prefix     = "ehd/prod"
  environment_tag = local.environment
  secret_values   = var.secret_values
  reader_role_arns = [local.wildfly_role_arn]

  secret_descriptions = {
    db       = "Oracle application schema credential (existing RDS primary)"
    sftp     = "External SFTP user credential"
    kafka    = "External Kafka SASL/SCRAM credential"
    internal = "WildFly -> EKS microservice service token"
  }

  tags = local.tags
}

module "ec2" {
  source = "../../modules/ec2"

  name                 = local.name
  environment_tag      = local.environment
  private_subnet_ids   = module.vpc.private_subnet_ids
  security_group_id    = module.security_groups.wildfly_security_group_id
  target_group_arn     = module.alb.target_group_arn
  instance_type        = "t3.xlarge"
  min_size             = 3
  max_size             = 6
  desired_capacity     = 3
  app_version          = var.main_app_version
  secret_arns          = [module.secrets.secret_arns["db"], module.secrets.secret_arns["sftp"], module.secrets.secret_arns["kafka"]]
  kms_key_arns         = [module.secrets.kms_key_arn]
  documents_bucket     = var.documents_bucket
  documents_bucket_arn = "arn:aws:s3:::${var.documents_bucket}"
  secrets_prefix       = "ehd/prod/"
  jmx_exporter_url     = var.jmx_exporter_url
  external_endpoints   = local.external_endpoints
  enforce_tag_on_assume = true
  tags                 = local.tags
}
