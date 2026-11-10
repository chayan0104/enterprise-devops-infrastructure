# Jenkins pipelines

Three declarative pipelines, one concern each:

| File | Concern | AWS role assumed | Approval |
| --- | --- | --- | --- |
| `Jenkinsfile.main-app` | WildFly WAR on EC2 | `ehd-app-deploy` | prod only |
| `Jenkinsfile.microservice` | Spring Boot image on EKS | `ehd-app-deploy` | prod only |
| `Jenkinsfile.terraform` | Infrastructure | `ehd-<env>-terraform-deploy` | every apply |

## How Jenkins gets AWS access (no permanent keys)

1. Jenkins runs on an EC2 agent with an **instance profile that can only call
   `sts:AssumeRole`** into the two pipeline roles, plus S3 for the state bucket.
2. Each pipeline calls the AWS Steps plugin:
   ```groovy
   withAWS(role: env.APP_ROLE_ARN, roleSessionName: "jenkins-${env.GIT_SHA}", region: 'eu-west-1')
   ```
   The plugin calls STS and exports short-lived credentials into the block scope.
3. The role's trust policy limits who can assume it:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Principal": { "AWS": "arn:aws:iam::111122223333:role/ehd-jenkins-agent" },
       "Action": "sts:AssumeRole",
       "Condition": {
         "StringEquals": { "aws:PrincipalTag/team": "platform-engineering" },
         "Bool": { "aws:MultiFactorAuthPresent": "true" }
       }
     }]
   }
   ```
4. Nothing AWS-related is stored in the Jenkinsfile. Non-AWS credentials
   (JFrog, Sonar, secret JSON for Terraform) use the Jenkins credential store
   and `withCredentials`.

## Separation of duties

- **Infrastructure role** (`ehd-<env>-terraform-deploy`): VPC, EC2, ASG, ELB,
  EKS, ECR repositories, Secrets Manager, IAM. Cannot read secret *values*.
- **Application role** (`ehd-app-deploy`): `ecr:GetAuthorizationToken`, push to
  the two application repositories, `ssm:SendCommand` on tagged instances,
  `eks:DescribeCluster` + `sts:GetCallerIdentity`, and read of the two deploy
  secrets. It cannot create or delete infrastructure.

## Jenkins prerequisites

- Plugins: Pipeline, AWS Steps, SonarQube Scanner, Credentials Binding,
  JUnit, Blue Ocean (optional), HTML Publisher (optional).
- Agents: `maven-jdk17`, `docker-maven`, `terraform` labels.
- Tools installed on agents: Maven 3.9, JDK 17, Docker 24+, `aws` CLI v2,
  `kubectl` (same minor version as the cluster), `trivy` 0.5x, `terraform`
  1.9.x, `jq`.
- Credentials: `jfrog-artifactory` (username/password),
  `ehd-secret-values-json` (secret text), SonarQube server `sonar-corp`.
- Agents must reach: ECR, EKS API (private endpoint via VPN), the artifact
  repository, and the existing Kafka/SFTP networks if integration tests run.

## Trigger

- Main app: multi-branch job on `main` and `release/*`; prod requires the
  `release-managers` group to approve.
- Microservice: one parameterised job; `SERVICE` selects the image.
- Terraform: manual only. Never trigger an apply automatically on merge.
