# PRODUCTION observability

Two managed backends, one per question:

| Need | Tool | Where it comes from |
| --- | --- | --- |
| Application performance, JVM, distributed tracing, host/pod infra | **Dynatrace** | Operator + `DynaKube` in `dynatrace.yaml` |
| AWS-native metrics, EKS control-plane logs, alarms | **CloudWatch** | EKS log types (Terraform) + CloudWatch agent |
| Long-term log archive | **S3** | CloudWatch Logs subscription → Firehose → S3 |
| ALB access logs | **S3** | `access_logs` on the ALB (Terraform) |

No Prometheus/Grafana in PROD: the managed APM stack covers JVM, traces and
infrastructure. Running both would double alerting and cost, and Dynatrace is the
contractual enterprise standard here.

## Log delivery to S3 (documented, not a Terraform module)

```
WildFly EC2  --CloudWatch agent-->  /aws/ec2/ehd-prod/wildfly  --\
EKS pods     --Fluent Bit/CSI----->  /aws/eks/ehd-prod/application --\
EKS control  --enabled log types-->  /aws/eks/ehd-prod/cluster   ----> CloudWatch Logs
                                                                    |
                                        subscription filter (all events)
                                                                    v
                                                Kinesis Firehose (60s / 5MB buffer)
                                                                    v
                          s3://ehd-prod-log-archive/eks|ec2|rds/yyyy/mm/dd/
```

- **Encryption:** SSE-KMS with the central logs CMK; bucket policy denies
  unencrypted PUTs and enforces TLS (`aws:SecureTransport`).
- **Lifecycle:** 0–90 days S3 Standard → 90–400 days Standard-IA →
  400 days Glacier Instant Retrieval → expire at 7 years (regulatory minimum).
- **Access:** read-only for the security/audit role; no developer write access.
- **Delivery failures:** Firehose writes to a separate `errors/` prefix and emits
  the `DeliveryToS3.Success` metric — alarm on it.
- **Volume guard:** the subscription filter has a `filterPattern` that drops
  debug noise, otherwise log volume is the biggest hidden cost.

Logs in S3 are an **archive for investigation and compliance, not a backup**.
Application data backup is described in `docs/OPERATIONS.md`; log archives cannot
restore a database.

## What is NOT here

- No CloudWatch Terraform module, no log-group module. Log groups are created by
  the EKS cluster and the agent; alarms are managed by the platform team.
- No MSK, no Prometheus in prod, no CloudFront/WAF/API Gateway/Route 53.
