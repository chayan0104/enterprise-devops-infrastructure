import type { ManifestSeed, RunbookSeed } from "./types";

export const runbookSeed: RunbookSeed[] = [
  {
    slug: "alb-unhealthy-targets",
    category: "Load balancing",
    title: "ALB reports unhealthy targets",
    severity: "critical",
    scope: "EC2 · ALB",
    symptom:
      "describe-target-health shows unhealthy with ResponseCodeMismatch or Timeout; users get 503.",
    likelyCause:
      "WildFly not listening on 8080, wrong health path, security group blocking the ALB, or the app still starting inside the grace period.",
    commands: `aws elbv2 describe-target-health --target-group-arn <tg-arn> \\
  --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State,TargetHealth.Reason]' --output table
aws ec2 describe-security-groups --group-ids <alb-sg> <wildfly-sg> \\
  --query 'SecurityGroups[].[GroupName,IpPermissions]'
aws ssm start-session --target <instance-id>
# on the host
curl -v http://127.0.0.1:8080/health/ready
systemctl status wildfly
ss -lntp | grep 8080`,
    correctiveAction:
      "Fix the listener or health path (must be /health/ready, never /) in the owning module and re-apply. Wait out the 300s grace period for fresh instances. Never patch security groups by hand.",
  },
  {
    slug: "http-502-504",
    category: "Load balancing",
    title: "HTTP 502 or 504 from the ALB",
    severity: "critical",
    scope: "ALB · WildFly",
    symptom: "Users see 502 Bad Gateway or 504 Gateway Timeout; CloudWatch shows Target 5XX or high response time.",
    likelyCause:
      "502: nothing listening / crashed process / port mismatch. 504: application latency (DB locks, heap pressure) or ALB idle timeout shorter than the request.",
    commands: `aws cloudwatch get-metric-statistics --namespace AWS/ApplicationELB \\
  --metric-name HTTPCode_Target_5XX_Count --period 300 --statistics Sum \\
  --dimensions Name=LoadBalancer,Value=<alb-arn-suffix> \\
  --start-time "$(date -u -d '-1h' +%FT%TZ)" --end-time "$(date -u +%FT%TZ)"
aws logs tail /aws/ec2/ehd-prod/wildfly --since 30m
jcmd <wildfly-pid> Thread.print > /tmp/threads.txt
aws s3 ls s3://<alb-logs-bucket>/alb/AWSLogs/ --recursive | tail`,
    correctiveAction:
      "Restore service first (roll back the WAR or the Deployment), then fix latency. Align idle_timeout with the slowest legitimate request; never exceed 4000s. A 504 is almost always application-side.",
  },
  {
    slug: "ec2-wildfly-startup",
    category: "Main application",
    title: "EC2 instance never becomes healthy / WildFly fails to start",
    severity: "critical",
    scope: "EC2 · WildFly",
    symptom: "ASG keeps replacing instances, systemctl status wildfly is failed, target never turns healthy.",
    likelyCause:
      "User-data error, missing secret, Oracle datasource failure, failed WAR deployment, disk full or JVM heap beyond the instance size.",
    commands: `tail -100 /var/log/cloud-init-output.log
journalctl -u wildfly -n 200 --no-pager
tail -200 /opt/wildfly/standalone/log/server.log
ls -l /opt/wildfly/standalone/deployments/   # .failed marker names the cause
df -h / && free -m
aws secretsmanager get-secret-value --secret-id ehd/prod/db \\
  --query SecretString --output text | jq 'keys'`,
    correctiveAction:
      "Redeploy the last good WAR, fix user data or the missing permission, then start an instance refresh. Terminate a wedged instance instead of patching it, so the ASG rebuilds it from code.",
  },
  {
    slug: "eks-pending",
    category: "Kubernetes",
    title: "Pods stuck in Pending",
    severity: "high",
    scope: "EKS · scheduler",
    symptom: "kubectl shows Pending; HPA metrics are <unknown>; no traffic served by the new pods.",
    likelyCause:
      "Insufficient CPU/memory, node group at max_size, unsatisfiable nodeSelector/taint, or an unbound PVC.",
    commands: `kubectl -n ehd-apps describe pod <pod> | sed -n '/Events/,$p'
kubectl -n ehd-apps get events --sort-by=.lastTimestamp | tail -30
kubectl describe nodes | grep -A5 "Allocated resources"
aws eks describe-nodegroup --cluster-name ehd-prod --nodegroup-name ehd-prod-app \\
  --query 'nodegroup.scalingConfig'`,
    correctiveAction:
      "Scale the node group (Terraform max_size) or correct requests/labels. Keep the PDB in place; availability during capacity incidents is not negotiable. Check HPA is not pinned by maxReplicas.",
  },
  {
    slug: "crashloopbackoff",
    category: "Kubernetes",
    title: "CrashLoopBackOff",
    severity: "critical",
    scope: "EKS · workloads",
    symptom: "Restart count climbs, pod stays Running but never Ready, rollout never completes.",
    likelyCause:
      "Boot-time exception, missing secret/ConfigMap key, Oracle or Kafka unreachable, over-aggressive liveness probe, or OOM kill (exit 137).",
    commands: `kubectl -n ehd-apps logs deploy/order-service --previous --tail=200
kubectl -n ehd-apps describe pod <pod> | sed -n '/Last State/,$p'
kubectl -n ehd-apps get pod <pod> \\
  -o jsonpath='{.status.containerStatuses[0].lastState.terminated.exitCode}'
kubectl -n ehd-apps exec deploy/order-service -- ls -l /mnt/secrets-store
kubectl -n ehd-apps get events --field-selector reason=Unhealthy`,
    correctiveAction:
      "Exit 137 = memory limit. Missing files under /mnt/secrets-store = CSI/IAM problem. Fix config or roll back with kubectl rollout undo. Increase startupProbe failureThreshold for slow JVMs rather than weakening liveness.",
  },
  {
    slug: "imagepullbackoff",
    category: "Kubernetes",
    title: "ImagePullBackOff / ErrImagePull",
    severity: "high",
    scope: "EKS · ECR",
    symptom: "Pod events show Failed to pull image or 401 Unauthorized; previous ReplicaSet keeps serving.",
    likelyCause:
      "Wrong repository or tag, image never pushed, node role cannot read ECR, wrong region, or an attempt to overwrite an immutable tag.",
    commands: `kubectl -n ehd-apps describe pod <pod> | sed -n '/Events/,$p'
aws ecr describe-images --repository-name ehd-prod/order-service \\
  --query 'sort_by(imageDetails,&imagePushedAt)[-5].[imageTags,imageDigest]'
aws ecr describe-repositories --repository-names ehd-prod/order-service \\
  --query 'repositories[0].repositoryUri'
aws sts get-caller-identity`,
    correctiveAction:
      "Push the missing immutable tag or correct the image reference. Pods must not need an imagePullSecret: the node instance profile provides ECR read. If someone added one, remove it.",
  },
  {
    slug: "service-ingress-connectivity",
    category: "Kubernetes",
    title: "Service or Ingress cannot reach pods",
    severity: "high",
    scope: "EKS · networking",
    symptom: "WildFly gets connection refused/timeouts to order-service; internal ALB returns 503 or has no targets.",
    likelyCause:
      "Service selector mismatch, wrong targetPort name, missing ingress class, ALB controller lacking IAM, or inbound-cidrs excluding the caller.",
    commands: `kubectl -n ehd-apps get svc order-service -o wide
kubectl -n ehd-apps get endpointslices -l kubernetes.io/service-name=order-service
kubectl -n ehd-apps run nettest --rm -it --image=curlimages/curl \\
  --restart=Never -- curl -v http://order-service:8080/api/orders
kubectl -n ehd-apps describe ingress order-service
kubectl -n kube-system logs deploy/aws-load-balancer-controller --tail=100`,
    correctiveAction:
      "Empty endpoints always mean selector/readiness, not networking. Fix labels/ports, then confirm the ingress stays internal and its certificate ARN is the existing one.",
  },
  {
    slug: "dns-routing-sg-nacl",
    category: "Network",
    title: "DNS, routing, security group or NACL problem",
    severity: "high",
    scope: "VPC · hybrid network",
    symptom: "UnknownHostException, No route to host, or timeouts that occur from one subnet/AZ only.",
    likelyCause:
      "Wrong resolver or private zone, missing TGW/peering route in the private route table, missing SG rule, or a NACL denying ephemeral return ports.",
    commands: `dig +short REPLACE-existing-oracle-host
cat /etc/resolv.conf
aws ec2 describe-route-tables --filters Name=vpc-id,Values=<vpc-id>
aws ec2 describe-network-acls --filters Name=vpc-id,Values=<vpc-id>
aws ec2 describe-network-interfaces --filters Name=group-id,Values=<sg-id> \\
  --query 'NetworkInterfaces[].[PrivateIpAddress,Groups]'
# test from the actual source subnet, not your laptop:
timeout 5 bash -c "</dev/tcp/<host>/<port>" && echo port-ok`,
    correctiveAction:
      "Add the missing SG rule in the owning module, or ask the network team for the peering/TGW route. NACLs are stateless: allow 1024–65535 in both directions. Verify from the source subnet.",
  },
  {
    slug: "oracle-errors",
    category: "Dependencies",
    title: "Oracle connection errors",
    severity: "critical",
    scope: "WildFly · Oracle RDS",
    symptom: "ORA-12170 timeout, ORA-12514 service not registered, ORA-01017 invalid credentials, ORA-12519 pool exhaustion.",
    likelyCause:
      "Endpoint/service-name mismatch, missing route/SG, rotated password not updated in Secrets Manager, driver/TLS mismatch, or too many pooled connections.",
    commands: `grep -i oracle /etc/ehd/wildfly-application.properties
timeout 5 bash -c "</dev/tcp/REPLACE-existing-oracle-host/1521" && echo port-ok
aws secretsmanager get-secret-value --secret-id ehd/prod/db \\
  --query SecretString --output text | jq 'keys'
grep -iE "datasource|ORA-" /opt/wildfly/standalone/log/server.log | tail -50
# DBA side: select * from v$session where username='APP_SCHEMA';`,
    correctiveAction:
      "Correct the JDBC URL/service name or update the secret, then restart the app so the datasource re-reads it. ORA-12519 means reduce max-pool-size or fix the leak. Never test production credentials from a workstation.",
  },
  {
    slug: "kafka-connectivity-lag",
    category: "Dependencies",
    title: "Kafka connectivity failure or consumer lag",
    severity: "high",
    scope: "EKS · external Kafka",
    symptom: "Topic not present in metadata, SaslAuthenticationException, or lag growing while consumers are idle.",
    likelyCause:
      "Broker firewall missing NAT/node IPs, wrong security protocol, stale SCRAM credential, missing topic, more consumers than partitions, or a poison message.",
    commands: `kubectl -n ehd-apps logs deploy/kafka-consumer --tail=200 | grep -iE "warn|error|rebalance"
kubectl -n ehd-apps exec deploy/kafka-consumer -- \\
  env | grep -i kafka
# from an approved debug pod:
kafka-consumer-groups.sh --bootstrap-server REPLACE-kafka-broker-1:9093 \\
  --command-config /tmp/client.properties --describe --group kafka-consumer
kubectl -n ehd-apps get hpa kafka-consumer`,
    correctiveAction:
      "Open the broker firewall for our egress IPs, fix SASL credentials from Secrets Manager, ensure the topic exists with enough partitions, and keep maxReplicas <= partitions. Poison messages get a documented offset decision, not a blind redeploy.",
  },
  {
    slug: "sts-assumerole-accessdenied",
    category: "IAM",
    title: "STS AssumeRole or AccessDenied in Jenkins",
    severity: "high",
    scope: "Jenkins · AWS",
    symptom: "AccessDenied on sts:AssumeRole, or S3/Secrets Manager calls fail after assuming a role.",
    likelyCause:
      "Trust policy condition mismatch, wrong role ARN/account, SCP or permissions boundary, or an IRSA subject that does not match the ServiceAccount.",
    commands: `aws sts get-caller-identity
aws sts assume-role --role-arn arn:aws:iam::444455556666:role/ehd-app-deploy \\
  --role-session-name debug-$(date +%s)
aws iam get-role --role-name ehd-app-deploy \\
  --query 'Role.AssumeRolePolicyDocument' --output json
aws iam simulate-principal-policy --policy-source-arn <role-arn> \\
  --action-names s3:PutObject --resource-arns <bucket-arn>/main-app/test
aws cloudtrail lookup-events --lookup-attributes \\
  AttributeKey=EventName,AttributeValue=AssumeRole --max-results 10
aws iam list-open-id-connect-providers`,
    correctiveAction:
      "Fix the trust policy (exact IRSA sub, correct Jenkins principal), confirm no SCP blocks the action, then re-run the pipeline. Creating a static access key is forbidden: it defeats the whole design.",
  },
  {
    slug: "secrets-manager-access",
    category: "IAM",
    title: "Secrets Manager access failure",
    severity: "critical",
    scope: "EC2 · EKS",
    symptom: "AccessDeniedException on GetSecretValue, KMSAccessDeniedException, or ResourceNotFoundException.",
    likelyCause:
      "Wrong secret name/region, IAM scoped to another ARN, KMS key policy missing the role, secret deleted, or ServiceAccount not annotated.",
    commands: `aws secretsmanager describe-secret --secret-id ehd/prod/db
aws secretsmanager get-resource-policy --secret-id ehd/prod/db
aws kms describe-key --key-id alias/ehd-prod-app-secrets
aws kms list-grants --key-id <key-id>
kubectl -n ehd-apps get sa order-service -o jsonpath='{.metadata.annotations}'
kubectl -n ehd-apps logs -l app=secrets-store-csi-driver -n kube-system --tail=50`,
    correctiveAction:
      "Align the secret ARN in the IAM policy, add the role to the KMS key policy, fix the ServiceAccount role annotation, and restore the secret if deleted (aws secretsmanager restore-secret). Never copy the value into a ConfigMap.",
  },
  {
    slug: "sslhandshakeexception",
    category: "Security",
    title: "SSLHandshakeException",
    severity: "high",
    scope: "JVM · TLS",
    symptom: "PKIX path building failed, no cipher suites in common, protocol_version, or hostname mismatch.",
    likelyCause:
      "Enterprise root CA missing from the JVM truststore, TLS version mismatch, certificate SAN not matching the hostname used, or an expired certificate.",
    commands: `openssl s_client -connect REPLACE-host:443 -servername REPLACE-host \\
  -showcerts </dev/null | openssl x509 -noout -subject -issuer -dates
keytool -list -cacerts -storepass changeit | grep -i "internal-ca"
grep -i "javax.net.ssl\\|truststore" /opt/wildfly/bin/standalone.conf
kubectl -n ehd-apps exec deploy/order-service -- \\
  keytool -list -cacerts -storepass changeit | head`,
    correctiveAction:
      "Bake the internal CA into the AMI and the Docker base image, connect using the certificate SAN, and align TLS versions with the peer. Disabling verification is a security defect, not a fix.",
  },
];

export const manifestSeed: ManifestSeed[] = [
  {
    path: "kubernetes/base/namespace.yaml",
    kind: "Namespace",
    purpose: "Isolate workloads and enforce the restricted Pod Security Standard.",
    explanation:
      "One namespace (ehd-apps) for every microservice and consumer. The pod-security.kubernetes.io/enforce=restricted label rejects pods that run as root, keep capabilities or lack a seccomp profile.",
    snippet: `apiVersion: v1
kind: Namespace
metadata:
  name: ehd-apps
  labels:
    pod-security.kubernetes.io/enforce: restricted`,
  },
  {
    path: "kubernetes/base/configmap.yaml",
    kind: "ConfigMap",
    purpose: "Non-secret configuration shared by all services.",
    explanation:
      "Existing Oracle/DocumentDB/Kafka endpoints, topic names, S3 bucket and JVM flags. Endpoints are configuration, passwords are not: secrets are never placed here.",
    snippet: `data:
  SPRING_PROFILES_ACTIVE: "prod"
  ORACLE_HOST: "REPLACE-existing-oracle-host"
  KAFKA_BOOTSTRAP_SERVERS: "REPLACE-kafka-broker-1:9093"
  JAVA_TOOL_OPTIONS: "-XX:MaxRAMPercentage=70 -XX:+ExitOnOutOfMemoryError"`,
  },
  {
    path: "kubernetes/base/serviceaccount.yaml",
    kind: "ServiceAccount",
    purpose: "Give each workload its own AWS identity (IRSA).",
    explanation:
      "The eks.amazonaws.com/role-arn annotation maps the ServiceAccount to an IAM role whose trust policy only accepts system:serviceaccount:ehd-apps:<name>. No shared node-wide permissions.",
    snippet: `kind: ServiceAccount
metadata:
  name: order-service
  namespace: ehd-apps
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::444455556666:role/ehd-prod-order-service`,
  },
  {
    path: "kubernetes/base/secretproviderclass.yaml",
    kind: "SecretProviderClass",
    purpose: "Mount only the secrets this workload needs.",
    explanation:
      "The Secrets Store CSI driver calls Secrets Manager using the pod's own role, mounts the values at /mnt/secrets-store and optionally syncs them into a Kubernetes Secret for env injection.",
    snippet: `spec:
  provider: aws
  parameters:
    useFederatedWorkloadIdentityExtension: "true"
    region: eu-west-1
    objects: |
      - objectName: "ehd/prod/db"
        objectType: secretsmanager`,
  },
  {
    path: "kubernetes/order-service/deployment.yaml",
    kind: "Deployment",
    purpose: "Run order-service with zero-downtime rollouts and hardened pods.",
    explanation:
      "2 replicas minimum, maxUnavailable 0 / maxSurge 1, startup + readiness + liveness probes, requests and limits, non-root read-only root filesystem, dropped capabilities, preStop sleep and secrets mounted read-only.",
    snippet: `strategy:
  rollingUpdate: { maxUnavailable: 0, maxSurge: 1 }
containers:
  - name: order-service
    resources:
      requests: { cpu: 250m, memory: 512Mi }
      limits: { cpu: "1", memory: 1Gi }
    readinessProbe:
      httpGet: { path: /actuator/health/readiness, port: management }`,
  },
  {
    path: "kubernetes/order-service/service.yaml",
    kind: "Service",
    purpose: "Stable in-cluster DNS and load balancing for the pods.",
    explanation:
      "ClusterIP only. WildFly and other services call http://order-service:8080; nothing is exposed to the internet through this object.",
    snippet: `spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: order-service
  ports:
    - name: http
      port: 8080
      targetPort: http`,
  },
  {
    path: "kubernetes/order-service/ingress.yaml",
    kind: "Ingress",
    purpose: "Create an internal ALB for HTTP traffic from the WildFly tier.",
    explanation:
      "AWS Load Balancer Controller annotations: internal scheme, IP target type, HTTPS with the existing ACM cert, inbound CIDRs limited to the VPC, health check on the readiness endpoint. DNS is a separate team's job.",
    snippet: `annotations:
  alb.ingress.kubernetes.io/scheme: internal
  alb.ingress.kubernetes.io/target-type: ip
  alb.ingress.kubernetes.io/ssl-redirect: "443"
  alb.ingress.kubernetes.io/inbound-cidrs: 10.50.0.0/16`,
  },
  {
    path: "kubernetes/order-service/hpa.yaml",
    kind: "HorizontalPodAutoscaler",
    purpose: "Add pods under CPU pressure without flapping.",
    explanation:
      "Targets 70% of the CPU request, 2–6 replicas. Scale-up is fast, scale-down waits 300s so a short spike does not cause churn. Requires metrics-server.",
    snippet: `minReplicas: 2
maxReplicas: 6
metrics:
  - type: Resource
    resource:
      name: cpu
      target: { type: Utilization, averageUtilization: 70 }`,
  },
  {
    path: "kubernetes/order-service/pdb.yaml",
    kind: "PodDisruptionBudget",
    purpose: "Survive node drains and cluster upgrades with capacity intact.",
    explanation:
      "minAvailable 1 means the eviction API refuses to take the last pod, so a rolling node replacement cannot take the service down.",
    snippet: `spec:
  minAvailable: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: order-service`,
  },
  {
    path: "kubernetes/kafka-consumer/deployment.yaml",
    kind: "Deployment",
    purpose: "Consume from the existing external Kafka as an independent workload.",
    explanation:
      "Own ServiceAccount and secret, 60s termination grace period plus a preStop sleep so records are committed before exit. HPA maxReplicas is capped at the partition count, otherwise extra consumers idle.",
    snippet: `terminationGracePeriodSeconds: 60
env:
  - name: KAFKA_USERNAME
    valueFrom:
      secretKeyRef: { name: kafka-consumer-secrets, key: kafka-credentials.json }
lifecycle:
  preStop:
    exec: { command: ["sh", "-c", "sleep 20"] }`,
  },
];

export const artifactCategoryLabels: Record<string, string> = {
  docs: "Documentation",
  terraform: "Terraform",
  kubernetes: "Kubernetes",
  jenkins: "Jenkins",
  monitoring: "Monitoring",
  app: "Application",
  scripts: "Operations scripts",
};
