import { ManifestExplorer } from "@/components/manifest-explorer";
import { Badge, Command, PageHeader, Panel, Stat, StatusPill } from "@/components/ui";
import { getDeploymentFeed, getComponents, getManifests } from "@/lib/queries";
import { buildWorkloadStatuses } from "@/lib/queries";

export const dynamic = "force-dynamic";

const prerequisites = [
  "AWS Load Balancer Controller + alb IngressClass",
  "Secrets Store CSI Driver with the AWS provider (or External Secrets Operator)",
  "metrics-server for HPAs",
  "IRSA roles for each ServiceAccount, trust policy pinned to namespace/service-account",
  "EBS CSI driver only if a workload needs a persistent volume",
];

export default async function KubernetesPage() {
  const [componentRows, manifests, feed] = await Promise.all([
    getComponents(),
    getManifests(),
    getDeploymentFeed(),
  ]);

  const prodWorkloads = buildWorkloadStatuses(componentRows, feed, "prod");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="EKS · plain yaml"
        title="One namespace, four workloads, no templating layer."
        description="Deployments, Services, one internal Ingress, HPAs and PDBs in the ehd-apps namespace with the restricted Pod Security Standard enforced. Secrets arrive through the Secrets Store CSI driver using each pod's own IRSA identity."
        right={<Badge tone="info">namespace ehd-apps</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="workloads" value={componentRows.length} hint="2 spring · 1 consumer · 1 ec2" tone="ok" />
        <Stat label="min replicas" value="2" hint="public services never run single" />
        <Stat label="manifests" value={manifests.length} hint="hand-written, explained" />
        <Stat label="yaml files in prod run" value="15" hint="base + 3 workload folders" tone="info" />
      </div>

      <Panel kicker="workloads" title="Runtime shape per component" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="mono bg-panel-2/60 text-[9px] uppercase tracking-[0.14em] text-muted">
              <tr>
                <th className="px-4 py-2 font-normal">component</th>
                <th className="px-3 py-2 font-normal">runtime</th>
                <th className="px-3 py-2 font-normal">replicas uat / prod</th>
                <th className="px-3 py-2 font-normal">image / artifact</th>
                <th className="px-3 py-2 font-normal">prod state</th>
              </tr>
            </thead>
            <tbody>
              {componentRows.map((component) => {
                const state = prodWorkloads.find((workload) => workload.component.id === component.id);
                return (
                  <tr key={component.id} className="border-t border-line-soft align-top text-[12.5px]">
                    <td className="px-4 py-3">
                      <span className="text-text">{component.name}</span>
                      <span className="mono block text-[10px] uppercase tracking-[0.1em] text-muted">
                        {component.kind} · {component.namespace}
                      </span>
                      <span className="mt-1 block max-w-[280px] text-[11px] leading-snug text-muted">
                        {component.description}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[11.5px] text-muted">{component.runtime}</td>
                    <td className="mono px-3 py-3 text-[11px] text-text">
                      {component.replicasUat}
                      <span className="block text-muted">{component.replicasProd}</span>
                    </td>
                    <td className="mono px-3 py-3 text-[10.5px] text-cyan">{component.artifact}</td>
                    <td className="px-3 py-3">
                      <StatusPill status={state?.status ?? "unknown"} />
                      <span className="mono mt-1 block text-[10px] text-muted">{state?.currentVersion ?? "—"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel kicker="manifest explorer" title="Every file, and why it is there">
        <ManifestExplorer manifests={manifests} />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Panel kicker="platform prerequisites" title="Installed once, outside this repository">
          <ul className="space-y-2">
            {prerequisites.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan/80" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-line-soft pt-3 text-[11.5px] leading-relaxed text-muted">
            Documenting them instead of installing them keeps Terraform responsible for AWS infrastructure and keeps
            cluster add-ons under the platform team&apos;s lifecycle.
          </p>
        </Panel>

        <Panel kicker="deploy + rollback" title="What the pipeline actually runs">
          <Command label="apply and roll forward">
{`kubectl apply -f kubernetes/base/
kubectl apply -f kubernetes/order-service/
kubectl -n ehd-apps set image deploy/order-service \\
  order-service=<ecr>/ehd-prod/order-service:release-<sha>
kubectl -n ehd-apps rollout status deploy/order-service --timeout=240s`}
          </Command>
          <div className="mt-3">
            <Command label="rollback">
{`kubectl -n ehd-apps rollout history deploy/order-service
kubectl -n ehd-apps rollout undo deploy/order-service
kubectl -n ehd-apps get pods -l app.kubernetes.io/name=order-service`}
            </Command>
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
            Tags are immutable in ECR, so returning to the previous ReplicaSet is deterministic. The PDB protects
            availability while the rollout replaces pods.
          </p>
        </Panel>
      </div>
    </div>
  );
}
