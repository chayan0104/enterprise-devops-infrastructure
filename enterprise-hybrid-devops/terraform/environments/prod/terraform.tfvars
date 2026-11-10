# PROD non-secret configuration. Secrets arrive as TF_VAR_secret_values from
# the Jenkins credential store; they are never written to a file in this repo.

aws_region         = "eu-west-1"
terraform_role_arn = "arn:aws:iam::444455556666:role/ehd-prod-terraform-deploy"
cost_center        = "CC-PROD-001"
change_id          = "CHG-REPLACE-WITH-CHANGE-NUMBER"

vpc_cidr                  = "10.50.0.0/16"
private_subnet_cidrs      = ["10.50.10.0/24", "10.50.11.0/24"]
alb_ingress_cidrs         = ["203.0.113.0/24", "198.51.100.0/24"] # corporate egress only
external_dependency_cidrs = ["10.20.0.0/16", "10.30.0.0/16"]

kubernetes_version = "1.31"
certificate_arn    = "arn:aws:acm:eu-west-1:444455556666:certificate/REPLACE-EXISTING-CERT"
access_logs_bucket = "REPLACE-existing-central-alb-logs-bucket"
documents_bucket   = "REPLACE-existing-documents-bucket"

oracle_jdbc_url         = "jdbc:oracle:thin:@//REPLACE-existing-oracle-host:1521/REPLACE_SERVICE"
oracle_host             = "REPLACE-existing-oracle-host"
oracle_port             = "1521"
documentdb_host         = "REPLACE-existing-documentdb-endpoint"
documentdb_port         = "27017"
documentdb_database     = "documents"
sftp_host               = "REPLACE-existing-sftp-host"
sftp_port               = "22"
kafka_bootstrap_servers = "REPLACE-kafka-broker-1:9093,REPLACE-kafka-broker-2:9093,REPLACE-kafka-broker-3:9093"
microservice_base_url   = "https://REPLACE-internal-alb-hostname"
