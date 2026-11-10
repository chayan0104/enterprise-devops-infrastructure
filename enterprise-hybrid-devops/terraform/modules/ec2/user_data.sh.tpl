#!/bin/bash
# ---------------------------------------------------------------------------
# WildFly EC2 bootstrap. Runs once per instance launch.
# No credentials are written here: values are read from Secrets Manager at
# runtime by the application using the instance profile.
# Deployments replace the WAR afterwards from the Jenkins pipeline via SSM.
# ---------------------------------------------------------------------------
set -euo pipefail

ENVIRONMENT="${environment}"
AWS_REGION="${aws_region}"
SECRETS_PREFIX="${secrets_prefix}"
DOCS_BUCKET="${docs_bucket}"
APP_VERSION="${app_version}"
WILDFLY_PORT="${wildfly_port}"
LOG_GROUP="${log_group}"
JMX_EXPORTER_JAR="${jmx_exporter_jar}"
MICROSERVICE_DOMAIN="${microservice_domain}"

echo "Bootstrap ${APP_VERSION} for ${ENVIRONMENT} in ${AWS_REGION}"

# 1. Base packages (AMI already contains WildFly and the JDK).
dnf install -y amazon-cloudwatch-agent awscli || yum install -y aws-cli
systemctl enable --now wildfly || true

# 2. CloudWatch agent: ship WildFly and system logs to CloudWatch Logs.
cat >/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<EOF
{
  "agent": { "metrics_collection_interval": 60, "run_as_user": "root" },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          { "file_path": "/opt/wildfly/standalone/log/server.log", "log_group_name": "$LOG_GROUP", "log_stream_name": "{instance_id}/server.log" },
          { "file_path": "/var/log/messages", "log_group_name": "$LOG_GROUP", "log_stream_name": "{instance_id}/messages" }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "EHD/${ENVIRONMENT}/WildFly",
    "append_dimensions": { "InstanceId": "\$${aws:InstanceId}" },
    "metrics_collected": { "cpu": { "measurement": ["cpu_usage_active"] }, "mem": { "measurement": ["mem_used_percent"] } }
  }
}
EOF
systemctl enable --now amazon-cloudwatch-agent || true

# 3. JMX exporter for Prometheus (UAT) / Dynatrace OneAgent (PROD).
#    Dynatrace is installed by the platform image, not by this script.
if [ -n "$JMX_EXPORTER_JAR" ]; then
  aws s3 cp "$JMX_EXPORTER_JAR" /opt/wildfly/jmx_prometheus_javaagent.jar --region "$AWS_REGION"
fi

# 4. Runtime configuration file: the app reads endpoints from here, and secret
#    VALUES are fetched from Secrets Manager at startup (never stored on disk).
install -d -o wildfly -g wildfly /etc/ehd
cat >/etc/ehd/wildfly-application.properties <<EOF
ehd.environment=$ENVIRONMENT
ehd.secrets.prefix=$SECRETS_PREFIX
ehd.documents.bucket=$DOCS_BUCKET
ehd.http.port=$WILDFLY_PORT
ehd.microservices.domain=$MICROSERVICE_DOMAIN
# Endpoints come from Terraform variables (existing infrastructure), never
# invented here. They are not secrets, so a config file is acceptable:
%{ for key, value in external_endpoints ~}
ehd.${key}=${value}
%{ endfor ~}
EOF

# 5. Start the service and wait for readiness. The ALB health check decides
#    whether the instance enters service; a failing unit means no traffic.
systemctl restart wildfly
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$WILDFLY_PORT/health/ready" >/dev/null; then
    echo "WildFly is ready"
    exit 0
  fi
  sleep 10
done

echo "WildFly did not become ready; see /opt/wildfly/standalone/log/server.log" >&2
exit 1
