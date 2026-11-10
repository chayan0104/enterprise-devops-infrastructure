# Kubernetes manifests (plain YAML)

No Helm, no Kustomize. Apply order matters only for the namespace and the
objects the Deployments reference.

```bash
kubectl apply -f base/namespace.yaml
kubectl apply -f base/configmap.yaml
kubectl apply -f base/serviceaccount.yaml
kubectl apply -f base/secretproviderclass.yaml
kubectl apply -f order-service/
kubectl apply -f notification-service/
kubectl apply -f kafka-consumer/
```

## What each file does, in plain language

| File | Why it exists |
| --- | --- |
| `base/namespace.yaml` | Isolates the workloads and enforces the `restricted` Pod Security Standard. |
| `base/configmap.yaml` | Non-secret settings (existing endpoints, Kafka topics, JVM flags). Passwords are **not** here. |
| `base/serviceaccount.yaml` | One identity per workload; the IRSA annotation grants only that workload's AWS permissions. |
| `base/secretproviderclass.yaml` | Tells the Secrets Store CSI driver which Secrets Manager objects to mount, using the pod's own role. |
| `order-service/deployment.yaml` | Pod template: 2 replicas, rolling update `maxUnavailable: 0`, 3 probes, requests/limits, hardened security context, secrets mounted from CSI. |
| `order-service/service.yaml` | Stable in-cluster DNS name `order-service.ehd-apps.svc.cluster.local` on port 8080. |
| `order-service/ingress.yaml` | Internal ALB for HTTP access from the WildFly app; HTTPS only, internal CIDRs only. |
| `order-service/hpa.yaml` | Adds pods when average CPU passes 70% of the request, 2–6 replicas. |
| `order-service/pdb.yaml` | Keeps at least one pod during node drains/upgrades. |
| `notification-service/*` | Same pattern, no Ingress: internal-only service. |
| `kafka-consumer/deployment.yaml` | Consumer Deployment pointed at the existing Kafka; long grace period to commit offsets. |
| `kafka-consumer/hpa.yaml` / `pdb.yaml` | Bounded scaling (never more replicas than partitions) and safe rebalances. |

## Image tags

Manifests intentionally carry `:bootstrap`. The microservice Jenkinsfile pushes
an immutable tag and then runs:

```bash
kubectl -n ehd-apps set image deployment/order-service \
  order-service=<ecr-url>/ehd-prod/order-service:release-<git-sha>
kubectl -n ehd-apps rollout status deployment/order-service --timeout=180s
```

Rollback is `kubectl rollout undo deployment/order-service`, which returns to the
previous ReplicaSet — safe because tags are immutable in ECR.

## Platform prerequisites (installed once, not by this repo)

1. AWS Load Balancer Controller (with its IRSA role) and an `alb` IngressClass.
2. Secrets Store CSI Driver + AWS provider, **or** External Secrets Operator
   (swap `secretproviderclass.yaml` for an `ExternalSecret`; Deployments keep
   using the synced Kubernetes Secret).
3. `metrics-server` for HPAs.
4. IAM roles for the three ServiceAccounts, each with a trust policy scoped to
   `system:serviceaccount:ehd-apps:<name>`.
5. EBS CSI driver if any workload needs a persistent volume.

## Deliberately missing

- No NetworkPolicy: traffic isolation is handled by security groups first. Add
  NetworkPolicies once the platform team ships a CNI with enforcement.
- No Gateway API, no service mesh: the brief asks for the simplest thing that
  works in production.
