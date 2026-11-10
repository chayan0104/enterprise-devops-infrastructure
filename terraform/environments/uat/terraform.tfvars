# UAT non-secret configuration. Safe to commit.
# Secrets are NOT here: the pipeline exports TF_VAR_secret_values from
# Jenkins credentials / Secrets Manager at apply time.

aws_region          = "eu-west-1"
terraform_role_arn  = "arn:aws:iam::111122223333:role/ehd-uat-terraform-deploy"
cost_center         = "CC-DEV-001"

vpc_cidr             = "10.40.0.0/16"
private_subnet_cidrs = ["10.40.10.0/24", "10.40.11.0/24"]
alb_ingress_cidrs    = ["10.0.0.0/8"]
bastion_cidrs        = []
external_dependency_cidrs = ["10.20.0.0/16", "10.30.0.0/16"]

kubernetes_version = "1.31"
certificate_arn    = "arn:aws:acm:eu-west-1:111122223333:certificate/REPLACE-EXISTING-CERT"
access_logs_bucket = "REPLACE-existing-central-alb-logs-bucket"
documents_bucket   = "REPLACE-existing-documents-bucket"

# Existing dependencies: values owned by other teams. Placeholders only.
oracle_jdbc_url        = "jdbc:oracle:thin:@//REPLACE-existing-oracle-host:1521/REPLACE_SERVICE"
oracle_host            = "REPLACE-existing-oracle-host"
oracle_port            = "1521"
sftp_host              = "REPLACE-existing-sftp-host"
sftp_port              = "22"
kafka_bootstrap_servers = "REPLACE-kafka-broker-1:9093,REPLACE-kafka-broker-2:9093"
microservice_base_url  = "https://REPLACE-internal-alb-hostname"
