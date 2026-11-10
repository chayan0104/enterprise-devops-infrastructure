import { Badge, Command, KeyValue, PageHeader, Panel, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

const uatStack = [
  { name: "Prometheus", role: "scrapes pods, nodes and the JMX exporter; 7-day retention", file: "monitoring/uat/prometheus.yml" },
  { name: "Alertmanager", role: "symptom-based alerts to the platform webhook", file: "monitoring/uat/alertmanager.yml" },
  { name: "Grafana", role: "dashboards as code, admin password from Secrets Manager", file: "monitoring/uat/grafana.yml" },
  { name: "node-exporter", role: "DaemonSet exposing host CPU, memory and disk", file: "monitoring/uat/exporters.yml" },
  { name: "kube-state-metrics", role: "Deployment/pod/HPA/PDB object state", file: "monitoring/uat/exporters.yml" },
  { name: "JMX exporter", role: "WildFly heap, GC and datasource metrics on :9404", file: "monitoring/uat/exporters.yml" },
];

const prodStack = [
  { name: "Dynatrace OneAgent", role: "APM, JVM profiling, infrastructure metrics, distributed tracing", file: "monitoring/prod/dynatrace.yaml" },
  { name: "ActiveGate", role: "Kubernetes API monitoring plus routing to the Dynatrace tenant", file: "monitoring/prod/dynatrace.yaml" },
  { name: "CloudWatch Container Insights", role: "AWS-native node and pod metrics, AWS alarms", file: "monitoring/prod/cloudwatch-agent.yaml" },
  { name: "EKS control-plane logs", role: "api, audit, authenticator, controllerManager, scheduler", file: "terraform/modules/eks (enabled_cluster_log_types)" },
  { name: "CloudWatch Logs → Firehose → S3", role: "central long-term log archive, KMS encrypted", file: "monitoring/prod/README.md" },
];

const retention = [
  ["ALB access logs", "S3 directly from the ALB", "90d Standard → 400d Glacier IR → 7y"],
  ["WildFly application logs", "CloudWatch agent → Logs → Firehose → S3", "30d hot in CloudWatch, 7y archive"],
  ["EKS pod logs", "Fluent Bit → CloudWatch Logs → S3", "30d hot, 7y archive"],
  ["EKS audit logs", "control-plane logging → CloudWatch → S3", "90d hot, 7y archive (compliance)"],
  ["UAT metrics", "Prometheus emptyDir", "7d, diagnostic only"],
  ["PROD metrics / traces", "Dynatrace SaaS", "per retention contract"],
];

const alerts = [
  ["ALB 5XX increase", "CloudWatch alarm → Dynatrace problem → on-call"],
  ["Target unhealthy", "Synthetic + target health alarm"],
  ["JVM heap > 90%", "Dynatrace JVM alert (prod), Prometheus rule (uat)"],
  ["Pod restart loop", "kube-state-metrics rule (uat), Kubernetes events (prod)"],
  ["Consumer lag rising", "Dynatrace consumer group metric"],
  ["Firehose delivery failure", "DeliveryToS3.Success alarm → platform"],
];

export default function MonitoringPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Observability · environment specific"
        title="Debug freely in UAT, buy certainty in PROD."
        description="UAT runs an inspectable Prometheus stack. Production uses the enterprise Dynatrace contract plus CloudWatch for AWS-native signals, with every log path landing in an encrypted S3 archive."
        right={<Badge tone="ok">no duplicated prometheus in prod</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="uat collectors" value={uatStack.length} hint="prometheus · exporters · jmx" tone="info" />
        <Stat label="prod backends" value={2} hint="dynatrace · cloudwatch → s3" tone="ok" />
        <Stat label="log archive" value="7 years" hint="s3 · kms · lifecycle to glacier" />
        <Stat label="backup modules" value={0} hint="backup is documented, not provisioned" tone="warn" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel kicker="uat" title="Self-hosted, fully inspectable" actions={<Badge tone="info">namespace monitoring</Badge>}>
          <div className="space-y-2">
            {uatStack.map((item) => (
              <div key={item.name} className="rounded-lg border border-line-soft bg-panel-2/50 px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[12.5px] text-text">{item.name}</span>
                  <span className="mono text-[9.5px] text-muted">{item.file}</span>
                </div>
                <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{item.role}</p>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Command label="check the stack">
{`kubectl -n monitoring get deploy,pods,svc
kubectl -n monitoring port-forward svc/prometheus 9090:9090
# Prometheus → Status → Targets, then graph
sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="ehd-apps"}[5m]))`}
            </Command>
          </div>
        </Panel>

        <Panel kicker="prod" title="Managed APM + AWS-native signals" actions={<Badge tone="ok">tier-1</Badge>}>
          <div className="space-y-2">
            {prodStack.map((item) => (
              <div key={item.name} className="rounded-lg border border-line-soft bg-panel-2/50 px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[12.5px] text-text">{item.name}</span>
                  <span className="mono text-[9.5px] text-muted">{item.file}</span>
                </div>
                <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{item.role}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
            Dynatrace covers JVM, traces and infrastructure; CloudWatch covers what AWS itself knows. Running both
            Prometheus and Dynatrace in production would duplicate alerts, dashboards and cost — so it is a deliberate
            split, not an omission.
          </p>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Panel kicker="log pipeline" title="How logs reach S3">
          <div className="space-y-2">
            {[
              ["WildFly EC2", "CloudWatch agent ships server.log and messages to /aws/ec2/ehd-prod/wildfly"],
              ["EKS pods", "Fluent Bit (or the CloudWatch agent DaemonSet) ships containers to /aws/eks/ehd-prod/application"],
              ["EKS control plane", "enabled_cluster_log_types writes /aws/eks/ehd-prod/cluster"],
              ["CloudWatch Logs", "subscription filter (all events, debug noise dropped) → Kinesis Firehose"],
              ["Firehose", "60s / 5MB buffering, KMS encryption, error prefix for failed deliveries"],
              ["S3 archive", "s3://ehd-prod-log-archive/<source>/yyyy/mm/dd/ with lifecycle rules"],
            ].map(([step, detail], index) => (
              <div key={step} className="flex gap-3">
                <span className="mono mt-0.5 w-5 shrink-0 text-right text-[10px] text-cyan">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 border-l border-line pl-3 pb-2">
                  <p className="text-[12.5px] text-text">{step}</p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{detail}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 rounded-lg border border-amber/30 bg-amber/5 px-3 py-2 text-[11.5px] leading-relaxed text-amber/90">
            An S3 log archive supports investigation and compliance. It is <strong>not a backup</strong> and cannot
            restore a database or an EBS volume.
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel kicker="retention" title="Where each signal lives" padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left">
                <thead className="mono bg-panel-2/60 text-[9px] uppercase tracking-[0.14em] text-muted">
                  <tr>
                    <th className="px-4 py-2 font-normal">signal</th>
                    <th className="px-3 py-2 font-normal">path</th>
                    <th className="px-3 py-2 font-normal">retention</th>
                  </tr>
                </thead>
                <tbody>
                  {retention.map((row) => (
                    <tr key={row[0]} className="border-t border-line-soft text-[11.5px]">
                      <td className="px-4 py-2 text-text">{row[0]}</td>
                      <td className="px-3 py-2 text-muted">{row[1]}</td>
                      <td className="mono px-3 py-2 text-[10.5px] text-cyan">{row[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel kicker="alerting" title="What actually pages someone">
            <div className="space-y-1.5">
              {alerts.map(([signal, route]) => (
                <div key={signal} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft pb-1.5 last:border-0">
                  <span className="text-[12px] text-text">{signal}</span>
                  <span className="mono text-[10px] text-muted">{route}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4">
              <KeyValue label="uat routing">Alertmanager → webhook</KeyValue>
              <KeyValue label="prod routing">Dynatrace problem → on-call</KeyValue>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
