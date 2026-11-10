# enterprise-hybrid-devops

A deliberately small, production-oriented hybrid deployment for an enterprise
Java estate:

- **WildFly main application** on EC2 behind a public Application Load Balancer.
- **Spring Boot microservices** (and Kafka consumers) on EKS, images in ECR.
- **Terraform** for infrastructure, **Jenkins** for delivery, **plain YAML** for
  Kubernetes, **AWS Secrets Manager** for credentials.
- **Existing dependencies are not provisioned:** Oracle RDS primary,
  DocumentDB, external/self-managed Kafka, external SFTP. Endpoints are inputs.

Everything here is intended to be explained in an interview without hand-waving:
seven Terraform modules, three pipelines, one Kubernetes namespace pattern.

---

## 1. Architecture

```
                       users / corporate network
                                  |
                     HTTPS 443 (HTTP 80 -> redirect)
                                  v
                    +----------------------------+
                    |  Public ALB (module alb)   |   ACM cert (existing)
                    |  tg: wildfly-http 8080     |   access logs -> S3
                    +-------------+--------------+
                                  |
              +-------------------+-------------------+
              |                                       |
     +--------v--------+                     +--------v--------+
     | EC2 WildFly #1  |  private subnet A   | EC2 WildFly #2  |  private subnet B
     | ASG min 2/prod3 |                     | (ASG, no SSH)   |
     +--------+--------+                     +--------+--------+
              |                                       |
              |  HTTPS (internal ALB) + JDBC/TLS       |
              v                                       v
     +--------------------------+          +-----------------------------+
     | EKS: ehd-apps namespace  |          | EXISTING (external)         |
     | order-service (2..6)     |  ----->  | Oracle RDS primary :1521    |
     | notification-service (2) |  ----->  | DocumentDB :27017           |
     | kafka-consumer (2..6)    |  ----->  | Kafka 9093 (SASL_SSL)       |
     | internal ALB via ingress |  ----->  | SFTP :22                    |
     +--------------------------+          +-----------------------------+
              |  images
              v
     ECR  ehd-<env>/order-service:release-<sha>  (IMMUTABLE tags)
```

Full component and network detail: [`docs/OPERATIONS.md`](docs/OPERATIONS.md).
Issue-by-issue fixes: [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md).

### Traffic flow, end to end

1. Client resolves the application hostname (DNS owned by the network team) to
   the public ALB. Port 80 only redirects to 443.
2. The ALB forwards to a healthy WildFly target on `:8080`. Targets are
   registered by the Auto Scaling Group, health is `GET /health/ready`.
3. WildFly authenticates to Oracle with a password read from Secrets Manager at
   boot (instance profile), stores documents in S3 via the instance role, and
   exchanges files with the external SFTP server.
4. For business calls to microservices, WildFly uses the internal ingress
   hostname. The AWS Load Balancer Controller provisions an **internal** ALB
   from `kubernetes/order-service/ingress.yaml`.
5. In-cluster calls use Kubernetes Service DNS
   (`http://notification-service:8080`), never pod IPs.
6. Kafka consumers run as separate Deployments, joining a consumer group and
   committing offsets while reading from the existing Kafka brokers.
7. Images are pulled from ECR using the node role; the pod's **own** identity
   (IRSA) is only used for Secrets Manager and S3.

## 2. Repository layout

```
terraform/modules/{vpc,security-groups,alb,ec2,eks,ecr,secrets-manager}
terraform/environments/{uat,prod}      # independent state + tfvars
kubernetes/{base,order-service,notification-service,kafka-consumer}
jenkins/Jenkinsfile.{main-app,microservice,terraform}
monitoring/{uat,prod}
services/order-service                 # reference Spring Boot service
scripts/deploy-wildfly.sh              # runs on the instance via SSM
docs/{OPERATIONS,TROUBLESHOOTING}.md
```

## 3. Terraform modules (seven, no more)

| Module | Creates | Key decision |
| --- | --- | --- |
| `vpc` | VPC, 2 public + 2 private subnets, IGW, NAT, route tables | Two AZs, egress-only private subnets; no VPC endpoints module |
| `security-groups` | ALB, WildFly, EKS node groups | SG-to-SG references, not CIDRs between tiers; SSH disabled |
| `alb` | ALB, HTTPS listener, redirect, target group | Stickiness on while sessions are local; drain delay 30s |
| `ec2` | Launch template, ASG, instance profile + policy | IMDSv2 required, SSM instead of SSH, instance refresh for rolling boot |
| `eks` | Cluster, OIDC provider, managed node group, core add-ons | IRSA enabled here because ServiceAccounts need it |
| `ecr` | One repo per image, lifecycle policy | `IMMUTABLE` tags make rollback trustworthy |
| `secrets-manager` | Secret containers, CMK, resource policy | Values injected by CI; only listed roles may read |

IAM lives inside the modules that use it (EC2 instance profile, EKS cluster/node
roles). Everything else is documented as centrally managed. There is **no**
module for backup, CloudWatch, IAM, autoscaling, target groups, node groups or
VPC endpoints.

### UAT vs PROD

| | UAT | PROD |
| --- | --- | --- |
| State key | `env/uat/terraform.tfstate` | `env/prod/terraform.tfstate` |
| NAT / nodes | 1 NAT, SPOT `m6i.large` 2–6 | 2 NATs, ON_DEMAND `m6i.xlarge` 3–8 |
| WildFly | `t3.large` min 2 | `t3.xlarge` min 3, tag-conditioned role assumption |
| EKS API | public, restricted CIDRs | private only |
| Secrets recovery | 0 days | 30 days |
| Terraform role | `ehd-uat-terraform-deploy` | `ehd-prod-terraform-deploy` |
| Monitoring | Prometheus/Grafana/Alertmanager | Dynatrace + CloudWatch |

## 4. Jenkins delivery flow

```
main-app:    checkout -> build+test -> sonar+OWASP -> WAR -> JFrog -> [approval] -> WildFly via SSM -> ALB target health
microservice:checkout -> mvn test  -> sonar       -> docker build -> trivy -> ECR immutable tag -> [approval] -> kubectl set image -> rollout status -> smoke
terraform:   checkout -> fmt -check -> init -> validate -> trivy config -> plan -> [approval] -> apply saved plan
```

- AWS access is **STS AssumeRole** through the AWS Steps plugin. There are no
  permanent keys in Jenkins or in the repository.
- `ehd-app-deploy` (applications) is separate from
  `ehd-<env>-terraform-deploy` (infrastructure). The infra role cannot read
  secret values; the app role cannot create infrastructure.
- Details and trust policies: [`jenkins/README.md`](jenkins/README.md).

## 5. Kubernetes resources

One namespace `ehd-apps` with PSA `restricted`. For each service: Deployment
(2+ replicas, `maxUnavailable: 0`, startup/readiness/liveness probes,
requests+limits, non-root, read-only root FS, dropped capabilities), ClusterIP
Service, HPA, PDB. An internal ALB Ingress only where HTTP is required
(`order-service`). Kafka consumers get their own Deployment, HPA and PDB but no
Service. Secrets arrive through the Secrets Store CSI driver; ServiceAccounts
carry the IRSA annotation. Explanation per file:
[`kubernetes/README.md`](kubernetes/README.md).

## 6. Secrets and IAM access flow

1. Terraform creates secret containers under `ehd/<env>/*` with a CMK and a
   resource policy that allows only the listed workload roles.
2. Values are written by CI (`TF_VAR_secret_values` from Jenkins credentials) or
   by the owning team (DBA, integration) via the console/CLI.
3. **WildFly:** the instance profile has `secretsmanager:GetSecretValue` on those
   three ARNs only, plus `s3:Put/GetObject` under `main-app/` and SSM messages.
4. **Microservices:** the pod's ServiceAccount assumes an IRSA role whose trust
   policy is pinned to `system:serviceaccount:ehd-apps:<service>`. The CSI
   driver fetches only that service's secret and mounts it in the container.
5. Nothing sensitive exists in Git, Jenkinsfiles, Dockerfiles, ConfigMaps or
   `.tfvars`. `tfvars` files contain endpoints and ARNs, which are not secrets.

## 7. Monitoring and logging

- **UAT:** Prometheus + Grafana + Alertmanager + node-exporter +
  kube-state-metrics + JMX exporter for WildFly.
- **PROD:** Dynatrace (APM, JVM, infra, distributed tracing) and CloudWatch
  (AWS metrics, EKS control-plane logs). See [`monitoring/`](monitoring/).
- **Log archive:** CloudWatch subscription → Firehose → S3, KMS-encrypted,
  lifecycle to Glacier IR and 7-year expiry. An archive is **not a backup**.
- ALB access logs go directly to S3 from the load balancer.

## 8. Connectivity with existing dependencies

| Dependency | Port | Path | Change needed |
| --- | --- | --- | --- |
| Oracle RDS primary | 1521/tcp TLS | private subnet → TGW/peering | DB team whitelists the app subnet CIDRs; schema + user created by DBA |
| DocumentDB | 27017/tcp TLS | private subnet → peering | `documentdb.host` variable; TLS CA bundle on the instance |
| Kafka (external) | 9093/tcp SASL_SSL | NAT or peering | broker firewall for node + NAT EIPs; SCRAM user in Secrets Manager |
| SFTP | 22/tcp | NAT egress | partner whitelists our egress IPs; key/credential in Secrets Manager |
| EKS API (CI) | 443 | VPN/private link | Jenkins agent network access, `aws eks update-kubeconfig` |

Fill `external_dependency_cidrs` and the endpoint variables; the modules never
invent hostnames. Placeholders say `REPLACE-…` on purpose.

## 9. Deployment and rollback

**Microservice deploy** (Jenkins does this):
```bash
aws eks update-kubeconfig --name ehd-prod --region eu-west-1
kubectl -n ehd-apps set image deployment/order-service \
  order-service=<ecr>/ehd-prod/order-service:release-<sha>
kubectl -n ehd-apps rollout status deployment/order-service --timeout=240s
kubectl -n ehd-apps rollout undo deployment/order-service    # rollback
kubectl -n ehd-apps rollout history deployment/order-service
```
Rollback is safe because ECR tags are immutable and the previous ReplicaSet is
retained (`revisionHistoryLimit: 5`).

**Main app deploy** (Jenkins does this): WAR → S3 → SSM RunCommand
`/opt/ehd/bin/deploy-wildfly.sh <version>`, which keeps the previous WAR and
restores it automatically if `/health/ready` does not come up. The ALB only sends
traffic to healthy targets, so a bad instance never serves users.

**Infrastructure change:** always `plan` first, review the artifact, then apply
the saved plan. Roll back with the previous commit (`git revert` + plan/apply),
never by editing the console.

## 10. Validation commands

```bash
terraform -chdir=terraform/environments/uat fmt -check -recursive
terraform -chdir=terraform/environments/uat init -backend=false && terraform -chdir=terraform/environments/uat validate
trivy config terraform/environments/uat
kubectl apply --dry-run=client -f kubernetes/
kubectl kustomize >/dev/null 2>&1 || true   # not used; confirms plain YAML only
kubectl -n ehd-apps get deploy,pods,hpa,pdb
aws elbv2 describe-target-health --target-group-arn <tg-arn>
```

## 11. Assumptions and design decisions

- DNS, ACM certificates, central S3 buckets, Transit Gateway/peering, the
  Secrets Store CSI driver, External Secrets Operator, the AWS Load Balancer
  Controller, metrics-server, Dynatrace Operator and Jenkins itself are
  **platform prerequisites** — documented, not provisioned here.
- Two AZs are enough for this workload; a third is a capacity decision, not an
  architectural one.
- Session affinity is enabled on the ALB because the main app still keeps HTTP
  sessions locally. The follow-up ticket is to externalise sessions.
- Kubernetes secret values are not duplicated in Terraform except for the
  container + policy. One owner per secret.
- The reference `order-service` is intentionally tiny: the platform contract
  (probes, config, security context, image) is the point, not the business logic.

## 12. Backup and disaster recovery (responsibility split)

| Asset | Owner | Mechanism | RPO / RTO |
| --- | --- | --- | --- |
| Oracle RDS primary | DBA | Automated backups + PITR, cross-region snapshot copy (existing) | per DB contract |
| DocumentDB | Data platform | Existing snapshot policy | per contract |
| Kafka topics | Integration | Broker-side retention / replication (existing) | per contract |
| S3 documents | App + platform | Versioning + cross-region replication (existing bucket policy) | 15 min / 4 h |
| Terraform state | Platform | S3 versioning + lock; state is reproducible from Git | 0 / 1 h |
| Kubernetes workloads | Platform | Git is the source of truth; rebuild from manifests | 0 / 2 h |
| Log archive | Security | S3 lifecycle, encrypted | not a backup |

Recovery order: infrastructure (`terraform apply`) → secrets availability →
EKS workloads → WildFly ASG → DNS/ALB verification. Full detail in
[`docs/OPERATIONS.md`](docs/OPERATIONS.md).

## 13. Explicitly out of scope

CloudFront, AWS WAF, API Gateway, Route 53, Amazon MSK, Oracle RDS (primary and
read replica), DocumentDB and GoldenGate are **not provisioned** by this project.
They are existing enterprise services consumed through endpoints and variables.
