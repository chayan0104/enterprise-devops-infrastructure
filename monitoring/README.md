# Monitoring and logging: UAT vs PROD

The brief requires environment-specific monitoring, not two copies of the same
stack.

| | UAT | PROD |
| --- | --- | --- |
| Metrics | Prometheus (plain YAML) | Dynatrace + CloudWatch Container Insights |
| Dashboards | Grafana | Dynatrace dashboards |
| Alerting | Alertmanager → webhook | Dynatrace alerts + CloudWatch alarms |
| Host metrics | node-exporter | Dynatrace OneAgent |
| Object state | kube-state-metrics | Dynatrace Kubernetes monitoring |
| JVM | JMX exporter (WildFly), Micrometer (Spring Boot) | OneAgent JVM + distributed tracing |
| Control-plane logs | CloudWatch (short retention) | CloudWatch (audit retained), archived to S3 |
| Retention of metrics | 7 days (emptyDir) | Per Dynatrace retention contract |

## Why UAT self-hosted and PROD managed

UAT needs cheap, fully inspectable telemetry while teams debug deployments.
Production needs vendor-supported JVM profiling, end-to-end tracing and someone
else on the hook for availability — which is what the Dynatrace contract buys.
Keeping both would mean duplicated dashboards, duplicated alerts and inconsistent
on-call signals, so the split is deliberate and documented.

## Order of installation

1. UAT: `kubectl apply -f monitoring/uat/*.yml` (see `uat/README.md`).
2. PROD: install the Dynatrace Operator (platform prerequisite), create the
   `ehd/prod/dynatrace` secret via External Secrets, apply
   `monitoring/prod/dynatrace.yaml`, then the CloudWatch agent.

Neither stack is part of Terraform: the operator/agent lifecycle belongs to the
platform team, and `terraform apply` should not roll out monitoring agents.
