import Link from "next/link";
import { ArchitectureDiagram } from "@/components/architecture-diagram";
import {
  Arrow,
  Badge,
  Command,
  KeyValue,
  Panel,
  PageHeader,
  Stat,
  StatusPill,
} from "@/components/ui";
import { getOverview } from "@/lib/queries";
import { formatDuration, formatUtc } from "@/lib/format";

export const dynamic = "force-dynamic";

const trafficFlow = [
  {
    title: "Client → public ALB",
    detail: "HTTPS 443 with the existing ACM certificate. Port 80 returns a 301 redirect; there is no plaintext path to the app.",
  },
  {
    title: "ALB → WildFly targets",
    detail: "The ASG registers instances in the target group. Health is GET /health/ready, so a booting instance never receives traffic.",
  },
  {
    title: "WildFly → existing Oracle / S3 / SFTP",
    detail: "Credentials come from Secrets Manager through the instance profile. No endpoint is hardcoded, no secret is on disk.",
  },
  {
    title: "WildFly → internal ALB → order-service",
    detail: "Microservice HTTP calls use the internal ingress hostname. The AWS Load Balancer Controller owns that ALB from the Ingress object.",
  },
  {
    title: "Service → service inside EKS",
    detail: "ClusterIP DNS (order-service.ehd-apps.svc.cluster.local). No pod IPs, no service mesh, no external hop.",
  },
  {
    title: "Kafka consumers → external Kafka",
    detail: "A separate Deployment joins the consumer group with a 60s grace period so offsets are committed before a pod exits.",
  },
];

export default async function OverviewPage() {
  const { environments, components, feed, stats, lastProd, uatWorkloads, prodWorkloads } =
    await getOverview();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Hybrid enterprise platform"
        title="One application tier on EC2, the rest on EKS."
        description="WildFly behind a public ALB, Spring Boot and Kafka consumers on EKS, Terraform for the platform, Jenkins for delivery, and environment-specific monitoring. Existing Oracle, DocumentDB, Kafka and SFTP are consumed, never provisioned."
        right={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/pipelines"
              className="mono rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-accent transition-colors hover:bg-accent/20"
            >
              deploy console
            </Link>
            <Link
              href="/runbook"
              className="mono rounded-md border border-line bg-panel px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-muted transition-colors hover:text-text"
            >
              open runbook
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="environments" value={environments.length} hint="uat + prod · independent tfstate" />
        <Stat
          label="workloads"
          value={components.length}
          hint="1 wildfly asg · 2 services · 1 consumer"
          tone="ok"
        />
        <Stat
          label="deployment success"
          value={`${stats.successRate}%`}
          hint={`${stats.succeeded} succeeded · ${stats.failed} failed · ${stats.rolledBack} rolled back`}
          tone={stats.successRate >= 80 ? "ok" : "warn"}
        />
        <Stat label="runbook entries" value={stats.runbooks} hint="symptom → cause → commands → fix" tone="warn" />
      </div>

      <Panel
        kicker="Architecture"
        title="Traffic, trust and dependency boundaries"
        actions={
          <div className="mono flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.12em]">
            <Badge tone="ok">managed here</Badge>
            <Badge tone="info">eks platform</Badge>
            <Badge tone="warn">external dependency</Badge>
          </div>
        }
      >
        <ArchitectureDiagram />
        <div className="mt-4 grid gap-3 border-t border-line-soft pt-4 md:grid-cols-2 xl:grid-cols-3">
          {trafficFlow.map((step, index) => (
            <div key={step.title} className="rounded-lg border border-line-soft bg-panel-2/60 p-3">
              <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-accent">
                <span className="grid h-4 w-4 place-items-center rounded-sm border border-accent/40 bg-accent/10 text-[9px]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {step.title}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">{step.detail}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        {environments.map((environment) => {
          const workloads = environment.slug === "prod" ? prodWorkloads : uatWorkloads;
          const degraded = workloads.filter((workload) => workload.status === "degraded").length;
          return (
            <Panel
              key={environment.id}
              kicker={`environment · ${environment.stateKey}`}
              title={environment.name}
              actions={
                <Badge tone={degraded > 0 ? "warn" : "ok"}>
                  {degraded > 0 ? `${degraded} degraded` : "all healthy"}
                </Badge>
              }
            >
              <div className="grid grid-cols-2 gap-x-4">
                <KeyValue label="AWS account">{environment.awsAccount}</KeyValue>
                <KeyValue label="region / vpc">{environment.region} · {environment.vpcCidr}</KeyValue>
                <KeyValue label="wildfly">{environment.wildflyCapacity}</KeyValue>
                <KeyValue label="eks">{environment.eksCapacity}</KeyValue>
                <KeyValue label="monitoring">{environment.monitoring}</KeyValue>
                <KeyValue label="state key">{environment.stateKey}</KeyValue>
              </div>

              <div className="mt-3 overflow-hidden rounded-lg border border-line-soft">
                <table className="w-full text-left">
                  <thead className="mono bg-panel-2/70 text-[9px] uppercase tracking-[0.14em] text-muted">
                    <tr>
                      <th className="px-3 py-1.5 font-normal">workload</th>
                      <th className="px-3 py-1.5 font-normal">running</th>
                      <th className="px-3 py-1.5 font-normal">health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workloads.map((workload) => (
                      <tr key={workload.component.id} className="border-t border-line-soft text-[12px]">
                        <td className="px-3 py-1.5 text-text">{workload.component.name}</td>
                        <td className="mono px-3 py-1.5 text-muted">{workload.currentVersion ?? "—"}</td>
                        <td className="px-3 py-1.5">
                          <StatusPill status={workload.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-[11.5px] leading-relaxed text-muted">{environment.notes}</p>
            </Panel>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Panel
          kicker="delivery"
          title="Recent deployments"
          actions={
            <Link href="/pipelines" className="mono text-[10px] uppercase tracking-[0.12em] text-accent hover:underline">
              full history →
            </Link>
          }
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="mono bg-panel-2/60 text-[9px] uppercase tracking-[0.14em] text-muted">
                <tr>
                  <th className="px-4 py-2 font-normal">component</th>
                  <th className="px-3 py-2 font-normal">env</th>
                  <th className="px-3 py-2 font-normal">version</th>
                  <th className="px-3 py-2 font-normal">status</th>
                  <th className="px-3 py-2 font-normal">when</th>
                </tr>
              </thead>
              <tbody>
                {feed.slice(0, 7).map((deployment) => (
                  <tr key={deployment.id} className="border-t border-line-soft text-[12.5px]">
                    <td className="px-4 py-2">
                      <span className="text-text">{deployment.componentName}</span>
                      <span className="mono ml-2 text-[10px] text-muted">{deployment.imageTag}</span>
                    </td>
                    <td className="mono px-3 py-2 text-[11px] uppercase text-muted">{deployment.environmentSlug}</td>
                    <td className="mono px-3 py-2 text-[11.5px] text-text">{deployment.version}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={deployment.status} />
                    </td>
                    <td className="mono px-3 py-2 text-[10.5px] text-muted">{formatUtc(deployment.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel kicker="last production change" title={lastProd ? lastProd.componentName : "No production deployments"}>
            {lastProd ? (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={lastProd.status} />
                  <span className="mono text-[11px] text-muted">{formatUtc(lastProd.startedAt)}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4">
                  <KeyValue label="version">{lastProd.version}</KeyValue>
                  <KeyValue label="change">{lastProd.changeId ?? "not required"}</KeyValue>
                  <KeyValue label="actor">{lastProd.actor}</KeyValue>
                  <KeyValue label="duration">{formatDuration(lastProd.durationSeconds)}</KeyValue>
                </div>
                {lastProd.notes && <p className="text-[12px] leading-relaxed text-muted">{lastProd.notes}</p>}
              </div>
            ) : (
              <p className="text-[12px] text-muted">Nothing deployed to production yet.</p>
            )}
          </Panel>

          <Panel kicker="quick verify" title="What you would run first">
            <Command label="platform">
{`aws sts get-caller-identity
kubectl config current-context
aws elbv2 describe-target-health \\
  --target-group-arn <tg-arn> \\
  --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State]'`}
            </Command>
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
              Target health separates a platform routing problem from an application problem before you open a single log file.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/infrastructure" className="mono text-[10px] uppercase tracking-[0.12em] text-cyan hover:underline">
                terraform modules <Arrow />
              </Link>
              <Link href="/kubernetes" className="mono text-[10px] uppercase tracking-[0.12em] text-cyan hover:underline">
                kubernetes manifests <Arrow />
              </Link>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
