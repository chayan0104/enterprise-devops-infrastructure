import type {
  Artifact,
  ComponentSeed,
  DeploymentSeed,
  EnvironmentSeed,
  SecretSeed,
} from "./types";

export const environmentSeed: EnvironmentSeed[] = [
  {
    slug: "uat",
    name: "UAT · Integration",
    awsAccount: "111122223333",
    region: "eu-west-1",
    vpcCidr: "10.40.0.0/16",
    clusterName: "ehd-uat",
    stateKey: "env/uat/terraform.tfstate",
    natGateways: 1,
    wildflyCapacity: "t3.large · min 2 / max 4",
    eksCapacity: "SPOT m6i.large · 2–6 nodes",
    monitoring: "Prometheus · Grafana · Alertmanager",
    endpointAccess: "Public API, restricted to 10.0.0.0/8",
    terraformRole: "ehd-uat-terraform-deploy",
    notes:
      "Cost-optimised. Single NAT, SPOT nodes, 7-day metrics retention. Alerts route to the platform webhook.",
  },
  {
    slug: "prod",
    name: "PROD · Core",
    awsAccount: "444455556666",
    region: "eu-west-1",
    vpcCidr: "10.50.0.0/16",
    clusterName: "ehd-prod",
    stateKey: "env/prod/terraform.tfstate",
    natGateways: 2,
    wildflyCapacity: "t3.xlarge · min 3 / max 6",
    eksCapacity: "ON_DEMAND m6i.xlarge · 3–8 nodes",
    monitoring: "Dynatrace · CloudWatch · S3 log archive",
    endpointAccess: "Private EKS endpoint only (VPN / SSM)",
    terraformRole: "ehd-prod-terraform-deploy",
    notes:
      "Tier-1. Two NAT gateways, managed APM, control-plane audit logs archived to S3. Applies require a change reference.",
  },
];

export const componentSeed: ComponentSeed[] = [
  {
    slug: "main-app",
    name: "WildFly main application",
    kind: "wildfly",
    runtime: "WildFly 30 · JDK 17 · EC2 ASG",
    namespace: "n/a (EC2)",
    artifact: "ehd-main-app.war",
    replicasUat: "2 instances",
    replicasProd: "3–6 instances",
    description:
      "Java WAR behind the public ALB. Reads Oracle, SFTP and Kafka credentials from Secrets Manager through its instance profile.",
  },
  {
    slug: "order-service",
    name: "order-service",
    kind: "spring",
    runtime: "Spring Boot 3.3 · JDK 17 · EKS",
    namespace: "ehd-apps",
    artifact: "ecr/ehd-{env}/order-service",
    replicasUat: "2–6 pods",
    replicasProd: "2–6 pods",
    description:
      "Order API called by WildFly over the internal ALB. IRSA role scoped to its own Secrets Manager entries and S3 prefix.",
  },
  {
    slug: "notification-service",
    name: "notification-service",
    kind: "spring",
    runtime: "Spring Boot 3.3 · JDK 17 · EKS",
    namespace: "ehd-apps",
    artifact: "ecr/ehd-{env}/notification-service",
    replicasUat: "2 pods",
    replicasProd: "2 pods",
    description:
      "Internal-only service reached through ClusterIP DNS. No ingress, no public exposure, its own ServiceAccount.",
  },
  {
    slug: "kafka-consumer",
    name: "Kafka consumer",
    kind: "consumer",
    runtime: "Spring Kafka · JDK 17 · EKS",
    namespace: "ehd-apps",
    artifact: "ecr/ehd-{env}/kafka-consumer",
    replicasUat: "2 pods",
    replicasProd: "2–6 pods",
    description:
      "Separate Deployment consuming orders.events from the existing external Kafka. Reads broker credentials via the Secrets Store CSI driver.",
  },
];

const daysAgo = (days: number, hours = 0) =>
  new Date(Date.now() - days * 86_400_000 - hours * 3_600_000);

export const deploymentSeed: DeploymentSeed[] = [
  // main-app
  { component: "main-app", environment: "prod", version: "3.4.1", imageTag: "war/3.4.1-b7c1d2e", status: "succeeded", actor: "jenkins/release-manager", pipeline: "main-app", changeId: "CHG0045121", durationSeconds: 412, startedAt: daysAgo(2, 3), notes: "Autumn release: Oracle connection pool tuned." },
  { component: "main-app", environment: "prod", version: "3.4.0", imageTag: "war/3.4.0-9f8e7d6", status: "succeeded", actor: "jenkins/release-manager", pipeline: "main-app", changeId: "CHG0044880", durationSeconds: 388, startedAt: daysAgo(16), notes: null },
  { component: "main-app", environment: "prod", version: "3.4.2", imageTag: "war/3.4.2-c3d4e5f", status: "rolled_back", actor: "jenkins/release-manager", pipeline: "main-app", changeId: "CHG0045322", durationSeconds: 521, startedAt: daysAgo(5, 6), notes: "Readiness failed on one AZ; automatic WAR rollback kept 3.4.1 serving traffic." },
  { component: "main-app", environment: "uat", version: "3.5.0-rc1", imageTag: "war/3.5.0-rc1-a1b2c3d", status: "succeeded", actor: "jenkins/developer", pipeline: "main-app", changeId: null, durationSeconds: 301, startedAt: daysAgo(1, 2), notes: "Release candidate for integration sign-off." },

  // order-service
  { component: "order-service", environment: "prod", version: "1.8.3", imageTag: "release-4f2c9ab71d33", status: "succeeded", actor: "jenkins/developer", pipeline: "microservice", changeId: "CHG0045288", durationSeconds: 236, startedAt: daysAgo(1, 5), notes: "Immutable tag, Trivy clean. Rollout 2 → 3 → 2 pods." },
  { component: "order-service", environment: "prod", version: "1.8.2", imageTag: "release-9d1e0bc4471a", status: "succeeded", actor: "jenkins/developer", pipeline: "microservice", changeId: "CHG0045011", durationSeconds: 221, startedAt: daysAgo(8), notes: null },
  { component: "order-service", environment: "prod", version: "1.8.4", imageTag: "release-77aa10c3e9b2", status: "failed", actor: "jenkins/developer", pipeline: "microservice", changeId: "CHG0045340", durationSeconds: 144, startedAt: daysAgo(0, 9), notes: "ImagePullBackOff: tag was never pushed. Pods stayed on 1.8.3." },
  { component: "order-service", environment: "uat", version: "1.9.0-rc1", imageTag: "release-b81c47d0aa92", status: "succeeded", actor: "jenkins/developer", pipeline: "microservice", changeId: null, durationSeconds: 198, startedAt: daysAgo(0, 4), notes: null },

  // notification-service
  { component: "notification-service", environment: "prod", version: "2.2.0", imageTag: "release-33de80fa71c4", status: "succeeded", actor: "jenkins/developer", pipeline: "microservice", changeId: "CHG0045066", durationSeconds: 187, startedAt: daysAgo(3, 8), notes: null },
  { component: "notification-service", environment: "prod", version: "2.1.7", imageTag: "release-5c90bb2ad104", status: "succeeded", actor: "jenkins/developer", pipeline: "microservice", changeId: "CHG0044770", durationSeconds: 176, startedAt: daysAgo(19), notes: null },
  { component: "notification-service", environment: "uat", version: "2.3.0-rc2", imageTag: "release-6f0a91cc2b73", status: "failed", actor: "jenkins/developer", pipeline: "microservice", changeId: null, durationSeconds: 154, startedAt: daysAgo(1, 9), notes: "Readiness probe failed: SMTP relay placeholder not configured in UAT." },

  // kafka-consumer
  { component: "kafka-consumer", environment: "prod", version: "1.4.2", imageTag: "release-aa71c4f90b12", status: "succeeded", actor: "jenkins/developer", pipeline: "microservice", changeId: "CHG0045177", durationSeconds: 205, startedAt: daysAgo(4, 2), notes: "Lag-based scaling candidate; HPA capped at 6 = partition count." },
  { component: "kafka-consumer", environment: "prod", version: "1.4.1", imageTag: "release-c0ffee12ab34", status: "rolled_back", actor: "jenkins/developer", pipeline: "microservice", changeId: "CHG0044901", durationSeconds: 268, startedAt: daysAgo(12), notes: "Consumer group rebalance loop after upgrade; kubectl rollout undo." },
  { component: "kafka-consumer", environment: "uat", version: "1.5.0-rc1", imageTag: "release-1234abcd5678", status: "succeeded", actor: "jenkins/developer", pipeline: "microservice", changeId: null, durationSeconds: 191, startedAt: daysAgo(2, 7), notes: "New orders.events schema v2 handled." },
];

export const secretSeed: SecretSeed[] = [
  {
    path: "ehd/{env}/db",
    consumer: "WildFly (main-app) · order-service",
    payload: "username, password",
    owner: "Oracle DBA",
    rotation: "90 days, DBA-owned",
    accessPath: "EC2 instance profile / IRSA ehd-{env}-order-service",
  },
  {
    path: "ehd/{env}/sftp",
    consumer: "WildFly (main-app)",
    payload: "username, password | private_key",
    owner: "Integration team",
    rotation: "180 days",
    accessPath: "EC2 instance profile ehd-{env}-wildfly-instance",
  },
  {
    path: "ehd/{env}/kafka",
    consumer: "kafka-consumer",
    payload: "username, password (SCRAM-SHA-512)",
    owner: "Messaging team",
    rotation: "On broker credential change",
    accessPath: "IRSA ehd-{env}-kafka-consumer + Secrets Store CSI",
  },
  {
    path: "ehd/{env}/internal",
    consumer: "WildFly → EKS microservices",
    payload: "token",
    owner: "Platform engineering",
    rotation: "90 days",
    accessPath: "EC2 instance profile",
  },
  {
    path: "ehd/uat/grafana",
    consumer: "UAT Grafana",
    payload: "admin_password",
    owner: "Platform engineering",
    rotation: "On demand",
    accessPath: "Kubernetes Secret in monitoring namespace",
  },
  {
    path: "ehd/prod/dynatrace",
    consumer: "Dynatrace operator",
    payload: "apiToken, dataIngestToken",
    owner: "Observability team",
    rotation: "180 days",
    accessPath: "External Secrets Operator → dynakube Secret",
  },
];

export const artifactSeed: Omit<Artifact, "id">[] = [
  { path: "README.md", category: "docs", purpose: "Architecture, traffic flow, modules, deploy/rollback, assumptions.", sortOrder: 1 },
  { path: "docs/OPERATIONS.md", category: "docs", purpose: "IAM flows, ports, monitoring runbooks, backup/DR ownership.", sortOrder: 2 },
  { path: "docs/TROUBLESHOOTING.md", category: "docs", purpose: "13 symptom → cause → commands → fix runbooks.", sortOrder: 3 },
  { path: "terraform/modules/vpc", category: "terraform", purpose: "VPC, 2 public + 2 private subnets, IGW, NAT, route tables.", sortOrder: 10 },
  { path: "terraform/modules/security-groups", category: "terraform", purpose: "ALB, WildFly and EKS node groups; SG-to-SG references.", sortOrder: 11 },
  { path: "terraform/modules/alb", category: "terraform", purpose: "Public ALB, HTTPS listener, HTTP redirect, WildFly target group.", sortOrder: 12 },
  { path: "terraform/modules/ec2", category: "terraform", purpose: "Launch template, ASG, instance refresh, least-privilege instance profile.", sortOrder: 13 },
  { path: "terraform/modules/eks", category: "terraform", purpose: "Cluster, OIDC/IRSA, managed node group, core add-ons, control-plane logs.", sortOrder: 14 },
  { path: "terraform/modules/ecr", category: "terraform", purpose: "One repo per image, immutable tags, lifecycle policy.", sortOrder: 15 },
  { path: "terraform/modules/secrets-manager", category: "terraform", purpose: "Secret containers, CMK, resource policy scoped to workload roles.", sortOrder: 16 },
  { path: "terraform/environments/uat", category: "terraform", purpose: "UAT root: independent state key, single NAT, SPOT nodes.", sortOrder: 20 },
  { path: "terraform/environments/prod", category: "terraform", purpose: "PROD root: 2 NATs, ON_DEMAND nodes, private API, change IDs.", sortOrder: 21 },
  { path: "kubernetes/base", category: "kubernetes", purpose: "Namespace (PSA restricted), ConfigMap, ServiceAccounts, SecretProviderClass.", sortOrder: 30 },
  { path: "kubernetes/order-service", category: "kubernetes", purpose: "Deployment, Service, Ingress, HPA, PDB for the public-facing API.", sortOrder: 31 },
  { path: "kubernetes/notification-service", category: "kubernetes", purpose: "Internal-only Deployment, Service and PDB.", sortOrder: 32 },
  { path: "kubernetes/kafka-consumer", category: "kubernetes", purpose: "Consumer Deployment with graceful shutdown, HPA, PDB.", sortOrder: 33 },
  { path: "jenkins/Jenkinsfile.main-app", category: "jenkins", purpose: "WAR build → JFrog → approval → SSM deploy → target health.", sortOrder: 40 },
  { path: "jenkins/Jenkinsfile.microservice", category: "jenkins", purpose: "Maven → Trivy → ECR → kubectl → rollout → smoke test.", sortOrder: 41 },
  { path: "jenkins/Jenkinsfile.terraform", category: "jenkins", purpose: "fmt → init → validate → scan → plan → approval → apply saved plan.", sortOrder: 42 },
  { path: "monitoring/uat", category: "monitoring", purpose: "Prometheus, Grafana, Alertmanager, node-exporter, kube-state-metrics, JMX.", sortOrder: 50 },
  { path: "monitoring/prod", category: "monitoring", purpose: "Dynatrace DynaKube, CloudWatch agent, S3 log archive documentation.", sortOrder: 51 },
  { path: "services/order-service", category: "app", purpose: "Reference Spring Boot service + multi-stage Dockerfile.", sortOrder: 60 },
  { path: "scripts/deploy-wildfly.sh", category: "scripts", purpose: "On-instance WAR deploy with previous-version rollback.", sortOrder: 70 },
];
