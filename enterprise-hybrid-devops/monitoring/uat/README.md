# UAT monitoring stack

| Component | File | What it answers |
| --- | --- | --- |
| Prometheus + alert rules | `prometheus.yml` | Are pods, nodes and JVMs healthy? |
| Alertmanager | `alertmanager.yml` | Who gets woken up, and when? |
| node-exporter + kube-state-metrics | `exporters.yml` | Node resources, pod restarts, HPA/PDB state |
| JMX exporter config | `exporters.yml` (ConfigMap) | WildFly heap, GC and datasource metrics |
| Grafana | `grafana.yml` | Dashboards for the team |

```bash
kubectl apply -f monitoring/uat/prometheus.yml
kubectl apply -f monitoring/uat/alertmanager.yml
kubectl apply -f monitoring/uat/exporters.yml
# Create the Grafana admin secret from Secrets Manager (never from Git):
kubectl -n monitoring create secret generic grafana-admin \
  --from-literal=admin-password="$(aws secretsmanager get-secret-value \
      --secret-id ehd/uat/grafana --query SecretString --output text | jq -r .admin_password)"
kubectl apply -f monitoring/uat/grafana.yml

kubectl -n monitoring get pods
kubectl -n monitoring port-forward svc/grafana 3000:3000
kubectl -n monitoring port-forward svc/prometheus 9090:9090
```

Configuration choices worth explaining in a review:

- **emptyDir storage** — UAT metrics are diagnostic, and losing them is
  acceptable. Production metrics live in Dynatrace/CloudWatch, which are managed.
- **Static JMX targets** — the WildFly instances are outside the cluster. Their
  private IPs are placeholders; in a real setup they are registered by a small
  service-discovery job or an ASG-aware scrape config. Do not invent IPs.
- **No Prometheus Operator** — it is a lot of CRDs for one environment. Plain
  Deployments keep the UAT stack explainable.
- **Alerts are symptom-based** (`up == 0`, heap > 90%, crash loops) rather than
  every possible metric, so the on-call channel stays credible.
