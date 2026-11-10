# Troubleshooting runbook

Format for every entry: **symptom → likely cause → commands → corrective action**.
Start with the scope guard: `aws sts get-caller-identity` and
`kubectl config current-context` — most incidents are a wrong account or region.

---

## 1. ALB target unhealthy

**Symptom:** `describe-target-health` shows `unhealthy`, `Target.ResponseCodeMismatch`
or `Target.Timeout`. The ALB returns 503.

**Likely cause:** the instance is not listening on 8080, the health path is wrong,
the security group blocks the ALB, or WildFly is still starting.

**Commands**
```bash
aws elbv2 describe-target-health --target-group-arn <tg-arn> \
  --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State,TargetHealth.Reason,TargetHealth.Description]' --output table
aws elbv2 describe-load-balancers --names ehd-prod-alb \
  --query 'LoadBalancers[0].SecurityGroups'
aws ec2 describe-security-groups --group-ids <alb-sg> <wildfly-sg> \
  --query 'SecurityGroups[].[GroupName,IpPermissions]'
# from the instance (SSM, no SSH needed):
TOKEN=$(curl -sX PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds:60")
INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)
aws ssm start-session --target "$INSTANCE_ID"
# then on the host:
curl -v http://127.0.0.1:8080/health/ready
ss -lntp | grep 8080
systemctl status wildfly
```

**Corrective action:** fix the listener/health path. Note the target group health
path must be an application endpoint (`/health/ready`), never `/`. If the SG is
wrong, correct it in `modules/security-groups` and re-apply — do not patch SGs by
hand, drift will bite at the next deploy. If the app is starting, wait out
`health_check_grace_period` (300s).

---

## 2. HTTP 502 / 504 from the ALB

**Symptom:** 502 Bad Gateway or 504 Gateway Timeout in the browser; ALB metrics
`HTTPCode_Target_5XX` or `TargetResponseTime` spikes.

**Likely cause**
- 502: nothing is listening, the process crashed, or TLS/port mismatch.
- 504: the app is too slow (DB lock, heap pressure, missing index) or the ALB
  idle timeout is shorter than the request.

**Commands**
```bash
aws cloudwatch get-metric-statistics --namespace AWS/ApplicationELB \
  --metric-name HTTPCode_Target_5XX_Count --period 300 --statistics Sum \
  --dimensions Name=LoadBalancer,Value=<alb-arn-suffix> \
  --start-time "$(date -u -d '-1 hour' +%FT%TZ)" --end-time "$(date -u +%FT%TZ)"
kubectl -n ehd-apps top pods            # only if the 502 comes from EKS ingress
aws logs tail /aws/ec2/ehd-prod/wildfly --since 30m --follow
aws s3 ls s3://<alb-logs-bucket>/alb/AWSLogs/ --recursive | tail
```
Freeze thread dumps on the instance (`jcmd <pid> Thread.print`) while the 504 is
reproducing; a 504 is nearly always application-side latency.

**Corrective action:** roll the deployment back
(`deploy-wildfly.sh <previous-version>` or `kubectl rollout undo`) to restore
service, then fix the root cause. Align `idle_timeout` with the slowest
legitimate request; never raise it beyond 4000s.

---

## 3. EC2 / WildFly startup failure

**Symptom:** instance never becomes healthy; ASG keeps replacing it; `systemctl
status wildfly` is failed.

**Likely cause:** user data error, missing secret, datasource failure (Oracle
down/blocked), failed WAR deployment, disk full, or JVM memory beyond the
instance size.

**Commands**
```bash
cat /var/log/cloud-init-output.log | tail -100
grep -i "user-data" /var/log/cloud-init.log | tail
journalctl -u wildfly -n 200 --no-pager
tail -200 /opt/wildfly/standalone/log/server.log
ls -l /opt/wildfly/standalone/deployments/   # look for .failed markers
df -h /
aws secretsmanager get-secret-value --secret-id ehd/prod/db --query SecretString --output text | jq 'keys'
```
The `deployments/*.failed` file usually names the reason (e.g. missing datasource,
class not found). The deployment scanner also writes a `.dodeploy`/`.undeployed`
state file.

**Corrective action:** redeploy the last good WAR, fix user data or the missing
secret, then trigger an instance refresh (`aws autoscaling start-instance-refresh
--auto-scaling-group-name ehd-prod-wildfly-asg`). If a single instance is wedged,
terminate it and let the ASG rebuild — never patch a live instance and leave it.

---

## 4. EKS pod `Pending`

**Symptom:** `kubectl -n ehd-apps get pods` shows `Pending`; HPA says
`<unknown>` or requests exceed capacity.

**Likely cause:** insufficient CPU/memory or unavailable instance type, node
group at `max_size`, unsatisfiable node selector/taint, or unbound PVC.

**Commands**
```bash
kubectl -n ehd-apps describe pod <pod> | sed -n '/Events/,$p'
kubectl -n ehd-apps get events --sort-by=.lastTimestamp | tail -30
kubectl describe nodes | grep -A5 "Allocated resources"
kubectl -n ehd-apps get resourcequota,limitrange
aws eks describe-nodegroup --cluster-name ehd-prod --nodegroup-name ehd-prod-app \
  --query 'nodegroup.scalingConfig'
```
`0/4 nodes are available: 4 Insufficient cpu` → capacity. `didn't match
Pod's node selector/affinity` → labels/taints.

**Corrective action:** raise node group `max_size` (Terraform) or lower the
requests if they were inflated. Check that `topologySpreadConstraints`
`whenUnsatisfiable: ScheduleAnyway` is not masking a genuinely unschedulable pod.
For a capacity incident, scale nodes first; do not remove the PDB.

---

## 5. `CrashLoopBackOff`

**Symptom:** restarts climb, pod is `Running` but never Ready.

**Likely cause:** application exception at boot, missing/incorrect secret, wrong
ConfigMap key, Oracle or Kafka unreachable, liveness probe too aggressive, or OOM
kill (exit code 137).

**Commands**
```bash
kubectl -n ehd-apps logs deploy/order-service --previous --tail=200
kubectl -n ehd-apps describe pod <pod> | sed -n '/Last State/,$p'
kubectl -n ehd-apps get pod <pod> -o jsonpath='{.status.containerStatuses[0].lastState.terminated.exitCode}'
kubectl -n ehd-apps get events --field-selector reason=Unhealthy
kubectl -n ehd-apps exec deploy/order-service -- ls -l /mnt/secrets-store
```
Exit code 137 = memory limit. `FileNotFound` under `/mnt/secrets-store` = CSI or
IAM problem (see section 11). `Connection refused` to Oracle = network/DNS.

**Corrective action:** fix the config/secret, or roll back
(`kubectl rollout undo`). Only then adjust probes: increase `startupProbe
failureThreshold` for slow JVMs rather than weakening liveness.

---

## 6. `ImagePullBackOff` / `ErrImagePull`

**Symptom:** pod events show `Failed to pull image` or `401 Unauthorized`.

**Likely cause:** wrong repository/tag, image never pushed, ECR permissions on the
node role, wrong region endpoint, or the immutable tag already exists with
different content.

**Commands**
```bash
kubectl -n ehd-apps describe pod <pod> | sed -n '/Events/,$p'
aws ecr describe-images --repository-name ehd-prod/order-service \
  --query 'sort_by(imageDetails,&imagePushedAt)[-5].[imageTags,imageDigest]'
aws ecr describe-repositories --repository-names ehd-prod/order-service \
  --query 'repositories[0].repositoryUri'
aws sts get-caller-identity   # are you in the workload account?
```
On the node, verify the role is attached to the node group and that the ECR
regional endpoint is reachable through the NAT gateway.

**Corrective action:** push the missing tag, correct the image reference, or fix
the node instance profile (`AmazonEC2ContainerRegistryReadOnly`). Pods in `ehd-apps`
should **not** need an image pull secret; if someone added one, remove it and rely
on the node role.

---

## 7. Kubernetes Service / Ingress connectivity

**Symptom:** the WildFly app cannot call `order-service`; ingress returns 503; the
ALB has no targets.

**Likely cause:** Service selector mismatch, wrong `targetPort` name, ingress
class absent, the ALB controller lacking permissions, or the ingress
`inbound-cidrs`/security group blocking the source.

**Commands**
```bash
kubectl -n ehd-apps get svc order-service -o wide
kubectl -n ehd-apps get endpointslices -l kubernetes.io/service-name=order-service
kubectl -n ehd-apps run nettest --rm -it --image=curlimages/curl --restart=Never -- \
  curl -v http://order-service:8080/api/orders
kubectl -n ehd-apps describe ingress order-service
kubectl -n kube-system logs deploy/aws-load-balancer-controller --tail=100
aws elbv2 describe-load-balancers --query "LoadBalancers[?contains(LoadBalancerName,'k8s-ehdmicroservices')].[DNSName,Scheme]"
```
Empty endpoints = selector/readiness problem, not networking.

**Corrective action:** fix labels/`targetPort`, ensure readiness passes, and keep
the ingress internal (`scheme: internal`). DNS for the internal ALB hostname is a
DNS-team request; Route 53 is out of scope here.

---

## 8. DNS, routing, security groups and NACLs

**Symptom:** `UnknownHostException`, `No route to host`, intermittent timeouts
from one subnet only.

**Likely cause:** wrong resolver/private hosted zone, missing route in the private
route table, missing SG rule for a port, or a NACL denying ephemeral return
traffic (1024–65535).

**Commands**
```bash
dig +short REPLACE-existing-oracle-host
cat /etc/resolv.conf
aws ec2 describe-route-tables --filters Name=vpc-id,Values=<vpc-id> \
  --query 'RouteTables[].[Tags,?Routes]'
aws ec2 describe-network-acls --filters Name=vpc-id,Values=<vpc-id>
# SG flows on an ENI:
aws ec2 describe-network-interfaces --filters Name=group-id,Values=<sg-id> \
  --query 'NetworkInterfaces[].[PrivateIpAddress,Groups]'
aws ec2 get-flow-logs-integration... # or use existing VPC flow logs
```
**Corrective action:** add the missing SG rule in the owning module; add the
peering/TGW route in the network team's configuration; if a NACL is in play,
remember it is stateless — both directions must be allowed. Verify with a `curl
-v telnet`-style check from the actual source subnet, not your laptop.

---

## 9. Oracle connection errors

**Symptom:** `ORA-12170` (timeout), `ORA-12514` (service not registered),
`ORA-01017` (invalid credentials), `ORA-28040` (no matching authentication
protocol), pool exhaustion (`ORA-12519`).

**Likely cause:** endpoint/service name mismatch, route or SG missing, expired or
rotated password in Secrets Manager, driver/TLS mismatch, or too many pooled
connections.

**Commands**
```bash
# connectivity (from an app instance, via SSM session)
timeout 5 bash -c "</dev/tcp/REPLACE-existing-oracle-host/1521" && echo port-ok
curl -v telnet://REPLACE-existing-oracle-host:1521
# what the app actually configured
grep -i oracle /etc/ehd/wildfly-application.properties
# secret content (keys only, never echo the password)
aws secretsmanager get-secret-value --secret-id ehd/prod/db \
  --query SecretString --output text | jq 'keys'
# WildFly datasource health
grep -iE "datasource|ORA-" /opt/wildfly/standalone/log/server.log | tail -50
```
DBA-side checks: `select * from v$session where username=...;`,
`lsnrctl status`, and the service name from `v$service_names`.

**Corrective action:** correct the JDBC URL/service name or the credential, then
restart the app so the datasource re-reads it. Never test with a production
schema from a workstation; use the UAT endpoint. If ORA-12519, reduce
`max-pool-size` or fix the leak.

---

## 10. Kafka connectivity and consumer lag

**Symptom:** `TimeoutException: Topic not present in metadata`, `SaslAuthenticationException`,
or `kafka_consumergroup_lag` rising while pods are idle.

**Likely cause:** broker firewall missing our NAT/node IPs, wrong security
protocol, expired SCRAM credential, topic missing, or more consumers than
partitions (idle pods) — or a poison message blocking a partition.

**Commands**
```bash
# from a debug pod on the approved network path
kubectl -n ehd-apps run kafka-debug --rm -it --image=bitnami/kafka:3.7 --restart=Never -- bash
#   kafka-topics.sh --bootstrap-server REPLACE-kafka-broker-1:9093 \
#     --command-config /tmp/client.properties --describe --topic orders.events
#   kafka-consumer-groups.sh --bootstrap-server ... --command-config ... \
#     --describe --group kafka-consumer
kubectl -n ehd-apps logs deploy/kafka-consumer --tail=200 | grep -iE "warn|error|rebalance"
```
Also look at `sum by (pod) (kafka_consumer_records_lag)` in Prometheus or the
Dynatrace consumer group view.

**Corrective action:** open the firewall for the egress IPs, fix the SASL
mechanism/credentials from Secrets Manager, create the topic with the right
partition count, and keep `maxReplicas <= partitions`. For a poison message,
commit/skip the offset with a documented operational decision — do not redeploy
and hope.

---

## 11. AWS STS AssumeRole / AccessDenied

**Symptom:** Jenkins `AccessDenied: User ... is not authorized to perform:
sts:AssumeRole`, or application `AccessDenied` on S3/Secrets Manager.

**Likely cause:** missing trust policy condition (repository/branch/tag), wrong
role ARN or account, session duration limits, SCP or permissions boundary, or an
IRSA `sub` mismatch.

**Commands**
```bash
aws sts get-caller-identity
aws sts assume-role --role-arn arn:aws:iam::444455556666:role/ehd-app-deploy \
  --role-session-name debug-$(date +%s)
aws iam get-role --role-name ehd-app-deploy \
  --query 'Role.AssumeRolePolicyDocument' --output json
aws iam list-attached-role-policies --role-name ehd-app-deploy
aws iam simulate-principal-policy --policy-source-arn <role-arn> \
  --action-names s3:PutObject --resource-arns <bucket-arn>/main-app/test
# IRSA: decode the token aud/sub and compare to the trust policy
kubectl -n ehd-apps exec deploy/order-service -- env | grep AWS_ROLE_ARN
aws iam list-open-id-connect-providers
```
CloudTrail is the source of truth:
```bash
aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=AssumeRole \
  --max-results 10
```

**Corrective action:** fix the trust policy (exact `sub` for IRSA, correct
principal for Jenkins), remove the need for `iam:PassRole` if it was granted
broadly, and check SCPs before blaming IAM. Re-run the pipeline rather than
creating a static access key — that is the failure mode this design prevents.

---

## 12. Secrets Manager access failures

**Symptom:** `AccessDeniedException: not authorized to perform secretsmanager:GetSecretValue`,
`KMSAccessDeniedException`, or `ResourceNotFoundException` in the pod/instance log.

**Likely cause:** wrong secret name/region, IAM policy scoped to another ARN,
KMS key policy missing the workload role, secret deleted/recovery window, or the
pod's ServiceAccount not annotated.

**Commands**
```bash
aws secretsmanager describe-secret --secret-id ehd/prod/db
aws secretsmanager get-resource-policy --secret-id ehd/prod/db
aws kms describe-key --key-id alias/ehd-prod-app-secrets
aws kms list-grants --key-id <key-id>
kubectl -n ehd-apps describe pod <pod> | grep -i "secretproviderclass\|serviceaccount"
kubectl -n ehd-apps get sa order-service -o jsonpath='{.metadata.annotations}'
kubectl -n ehd-apps logs -l app.kubernetes.io/name=secrets-store-csi-driver -n kube-system --tail=50
```
**Corrective action:** align the secret ARN in the IAM policy with the actual
secret, add the role to the KMS key policy, annotate the ServiceAccount with the
correct role ARN, and restore the secret if it was deleted
(`aws secretsmanager restore-secret`). Never copy the secret value into a
ConfigMap to "unblock" a release.

---

## 13. `SSLHandshakeException`

**Symptom:** `javax.net.ssl.SSLHandshakeException: PKIX path building failed`,
`no cipher suites in common`, `protocol_version`, or hostname mismatch.

**Likely cause:** the internal CA is not in the JVM truststore, TLS 1.3 vs 1.2
mismatch, hostname used for the connection does not match the certificate, or an
expired certificate.

**Commands**
```bash
# inspect what the server actually presents
openssl s_client -connect REPLACE-host:443 -servername REPLACE-host -showcerts </dev/null \
  | openssl x509 -noout -subject -issuer -dates
openssl s_client -connect REPLACE-host:1521 -starttls ... # Oracle TLS, if used
# JVM truststore in use (WildFly/EKS image)
keytool -list -cacerts -storepass changeit | grep -i "internal-ca"
# compare with what the app trusts
grep -i "javax.net.ssl\|truststore" /opt/wildfly/bin/standalone.conf
kubectl -n ehd-apps exec deploy/order-service -- keytool -list -cacerts -storepass changeit | head
```
**Corrective action:** import the enterprise root CA into the image/instance
truststore (bake it into the AMI and the Docker base image, do not mount it at
runtime), use the certificate's real hostname (SAN), and align protocols with the
peer. Fixing it by disabling verification (`trustAllCerts`) is a security defect,
not a fix.

---

## Fast triage cheat sheet

```bash
# Is it the app, the platform or the network?
aws elbv2 describe-target-health --target-group-arn <tg>    # platform routing
kubectl -n ehd-apps get pods,ep,hpa,pdb                     # workload state
kubectl -n ehd-apps logs deploy/<svc> --previous --tail=100 # app state
aws logs tail /aws/eks/ehd-prod/cluster --since 15m         # control plane
aws logs tail /aws/ec2/ehd-prod/wildfly --since 15m         # main app
aws sts get-caller-identity && kubectl config current-context
```
