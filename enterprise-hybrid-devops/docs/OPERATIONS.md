# Operations, IAM and connectivity

## 1. Platform prerequisites (owned outside this repository)

| Prerequisite | Why required | Verify |
| --- | --- | --- |
| ACM certificate | HTTPS on the public and internal ALBs | `aws acm list-certificates` |
| DNS zone + record ownership | Hostnames for both ALBs (Route 53 not managed here) | `dig <host>` |
| AWS Load Balancer Controller + `alb` IngressClass | Creates internal ALBs from Ingress | `kubectl get ingressclass` |
| Secrets Store CSI Driver + AWS provider | Mounts Secrets Manager into pods | `kubectl -n kube-system get ds \| grep csi` |
| metrics-server | HPA CPU metrics | `kubectl top nodes` |
| EBS CSI driver | Only if a component needs a PVC | `kubectl get csidrivers` |
| External Secrets Operator (alternative) | Syncs secrets into Kubernetes Secrets | `kubectl get crd \| grep externalsecrets` |
| Dynatrace Operator | PROD APM/OneAgent | `kubectl -n dynatrace get dynakube` |
| Jenkins controller + agents | Delivery | `jenkins.example.com` |
| Terraform state bucket + lock table | Remote state | `aws s3 ls s3://ehd-tfstate-*` |
| Central S3 buckets (artifacts, documents, logs) | Storage | `aws s3api head-bucket` |
| Transit Gateway / VPC peering to Oracle, DocumentDB, Kafka, SFTP | Connectivity | `aws ec2 describe-transit-gateway-attachments` |

## 2. Secret inventory

| Secret path | Consumer | Contents | Owner / rotation |
| --- | --- | --- | --- |
| `ehd/<env>/db` | WildFly (and services needing the schema) | `username`, `password` | DBA, 90 days |
| `ehd/<env>/sftp` | WildFly | `username`, `password` or `private_key` | Integration team, 180 days |
| `ehd/<env>/kafka` | kafka-consumer | `username`, `password` (SCRAM) | Messaging team, on demand |
| `ehd/<env>/internal` | WildFly → microservices | `token` | Platform, 90 days |
| `ehd/<env>/grafana` | UAT Grafana admin | `admin_password` | Platform, UAT only |
| `ehd/prod/dynatrace` | Dynatrace operator | `apiToken`, `dataIngestToken` | Observability team |

Rules:

- Values are written by CI (`TF_VAR_secret_values`) or by the owning team. They
  never appear in Git, Dockerfiles, ConfigMaps, Jenkinsfiles or tfvars.
- Terraform manages the **container**, the KMS key and the **read policy**, not
  the ongoing value.
- Application re-reads the secret on restart; rotation therefore requires a pod
  restart for env-var-injected values. For zero-restart rotation, read the secret
  directly with the AWS SDK and cache it with a TTL.

## 3. Access flows

### WildFly on EC2
```
EC2 instance -> instance profile (ehd-<env>-wildfly-instance)
             -> secretsmanager:GetSecretValue on db/sftp/kafka ARNs only
             -> s3:Put/Get/DeleteObject on <documents-bucket>/main-app/*
             -> kms:Decrypt on the secrets CMK
             -> ssm messages for Session Manager (no inbound SSH)
```

### Spring Boot on EKS (IRSA)
```
pod -> ServiceAccount order-service (IRSA annotation)
    -> STS AssumeRoleWithWebIdentity (OIDC provider from the eks module)
    -> role ehd-<env>-order-service: secretsmanager:GetSecretValue on ehd/<env>/db,
       sftp; s3 on orders/* prefix
    -> Secrets Store CSI driver mounts /mnt/secrets-store
```
Trust policy is pinned to namespace + service account, so a compromised pod in
another namespace cannot use the role.

### Jenkins
```
agent instance profile -> sts:AssumeRole -> ehd-app-deploy / ehd-<env>-terraform-deploy
```
No access keys are stored. Credentials expire with the session (1 hour by
default); the RoleSessionName includes the git SHA for CloudTrail attribution.

## 4. Ports and connectivity matrix

| From | To | Port / proto | Rule location |
| --- | --- | --- | --- |
| Client CIDRs | Public ALB | 443 (80 → redirect) | `security-groups` alb ingress |
| Public ALB | WildFly targets | 8080 | alb egress / wildfly ingress |
| WildFly EC2 | Internal ALB | 443 | wildfly egress / eks-nodes ingress |
| WildFly EC2 | EKS nodes (NodePort, UAT only) | 30000–32767 | SG-to-SG |
| EKS nodes | EKS control plane | 443 | EKS-managed cluster SG |
| EKS nodes | Internet/AWS APIs via NAT | 443 | nat gateway route |
| WildFly / EKS | Oracle RDS primary | 1521/tcp TLS | `external_dependency_cidrs` + DB whitelist |
| WildFly / EKS | DocumentDB | 27017/tcp TLS | as above |
| Kafka consumers | Kafka brokers | 9093 SASL_SSL | NAT EIPs allowed on broker firewall |
| WildFly | SFTP | 22/tcp | NAT EIPs allowed by partner |
| Jenkins agent | EKS API, ECR, S3 | 443 | VPN / private endpoint |
| Ops engineer | EC2 | SSM only, no 22 | instance profile + SSM |

Egress from private subnets leaves through the NAT gateway in UAT (one) and per
AZ in PROD. External dependency traffic uses the Transit Gateway routes that the
network team adds to the private route tables.

## 5. Monitoring runbooks

| Signal | Where | First action |
| --- | --- | --- |
| ALB 5xx | CloudWatch `AWS/ApplicationELB` | target health → app logs |
| Target response time | Dynatrace / CloudWatch | thread dump, DB latency, GC |
| Pod restarts | Dynatrace Kubernetes / kube-state-metrics | `kubectl logs --previous` |
| JVM heap | Dynatrace JVM / Prometheus `jvm_memory_*` | heap dump, then limit review |
| Consumer lag | Dynatrace / `kafka_consumergroup_lag` | broker health, rebalance, scale ≤ partitions |
| Node pressure | Container Insights | add nodes, check evicted pods |
| Certificate expiry | ACM (managed) | verify ALB listener cert |

## 6. Backup and DR responsibilities (documentation only)

No backup resources are created by this project. Ownership:

| Asset | Owner | Mechanism | RPO | RTO |
| --- | --- | --- | --- | --- |
| Oracle RDS primary | DBA | Automated backups, PITR, cross-region snapshot copy | 15 min | 4 h |
| Oracle read replica | DBA | Existing replica promotion procedure | 15 min | 1 h |
| DocumentDB | Data platform | Snapshot policy, cross-region copy | 24 h | 8 h |
| Kafka | Messaging | Broker retention/replication, topic recreation runbook | per contract | per contract |
| S3 documents | Platform | Versioning + cross-region replication | 15 min | 4 h |
| Terraform state | Platform | S3 versioning + lock; code in Git | 0 | 1 h |
| Kubernetes config | Platform | Git; cluster is disposable | 0 | 2 h |
| EC2 AMI | Platform | AMI pipeline; configuration from user data + Git | 24 h | 2 h |
| Log archive (S3) | Security | Lifecycle + encryption | n/a | not a backup |

DR sequence: (1) confirm AWS regional status and account access, (2) verify
Secrets Manager availability in the DR region, (3) `terraform apply` the DR
environment from Git, (4) deploy the last known-good immutable image tags and
WAR versions, (5) restore dependencies from DBA/data-platform backups, (6) point
DNS at the DR ALB, (7) re-run smoke tests. Test twice a year; an untested RTO is
a guess.

## 7. Change and rollback policy

1. Infrastructure: `plan` artifact reviewed → approval → apply **the saved plan**.
2. Microservices: immutable image tag; rollback = `kubectl rollout undo`.
3. Main app: previous WAR retained on the instance; automatic local rollback if
   readiness fails; manual `deploy-wildfly.sh <previous-version>` otherwise.
4. Never hotfix an instance or edit Terraform-managed resources in the console.
   If an emergency change is unavoidable, open a drift ticket the same day.

## 8. Cost notes (interview-ready)

- Single NAT in UAT saves ~$35/month per removed NAT.
- SPOT nodes in UAT cut compute by ~60–70% with the PDB protecting availability.
- ECR lifecycle keeps 15 release images: bounded storage without losing rollback.
- Prometheus/Grafana only in UAT avoids paying for both Dynatrace and a
  self-managed production monitoring stack.
