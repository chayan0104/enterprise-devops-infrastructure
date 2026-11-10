# Terraform environments

Two root configurations, `uat/` and `prod/`. They call the **same seven
modules** with different inputs and keep **independent state keys**.

| Concern | UAT | PROD |
| --- | --- | --- |
| State key | `env/uat/terraform.tfstate` | `env/prod/terraform.tfstate` |
| NAT gateways | 1 | 2 (one per AZ) |
| WildFly | `t3.large`, min 2 | `t3.xlarge`, min 3, `enforce_tag_on_assume = true` |
| EKS nodes | SPOT `m6i.large`, 2–6 | ON_DEMAND `m6i.xlarge`, 3–8 |
| EKS API endpoint | public, restricted CIDRs | private only |
| ALB ingress | office/VPN range | corporate egress CIDRs only |
| Secrets recovery window | 0 days (destroy immediately) | 30 days |
| Deploy roles | `ehd-uat-terraform-deploy` | `ehd-prod-terraform-deploy` (separate from app deploy role) |

## State bucket and locking (created once, platform repo)

```bash
aws s3api create-bucket --bucket ehd-tfstate-<account-id> --region eu-west-1 \
  --create-bucket-configuration LocationConstraint=eu-west-1
aws s3api put-bucket-versioning --bucket ehd-tfstate-<account-id> \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket ehd-tfstate-<account-id> \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms"}}]}'
```

Initialize with explicit backend values (keeps account-specific names out of Git):

```bash
terraform -chdir=terraform/environments/uat init \
  -backend-config="bucket=ehd-tfstate-111122223333" \
  -backend-config="region=eu-west-1"
```

## Apply order is module-driven

`vpc` → `security_groups` → `eks` / `alb` / `ecr` → `secrets` → `ec2`.
The `ec2` module needs the ALB target group and the secret ARNs, so it is
declared last. There are no cross-module `depends_on` chains to maintain.

## Notes that prevent surprises

- **No cycles:** `security_groups` does not consume `module.eks` (the eks module
  attaches the node group to that SG and owns the node → control-plane rule).
  The `secrets` module receives the WildFly role ARN as a constructed string,
  because referencing `module.ec2.instance_role_arn` would close a loop
  (ec2 needs the secret ARNs, secrets needed the ec2 role).
- **Node security group:** a node launch template inside the `eks` module lists
  both the project node SG and the EKS cluster SG. That is how ALB → NodePort and
  WildFly → 443 rules actually reach the nodes.
- **No DB resources:** Oracle RDS, DocumentDB, Kafka and SFTP are referenced by
  endpoint variables only.
- **No backup/CloudWatch/IAM modules:** the small IAM roles live inside the
  `ec2` and `eks` modules; CloudWatch log delivery is configured by EKS
  (`enabled_cluster_log_types`) and the CloudWatch agent in the EC2 user data.
- **Secrets values** are passed as `TF_VAR_secret_values` from Jenkins. Empty on
  an initial `plan` is fine; the containers are created and the values can be
  set out-of-band by the owning team.
