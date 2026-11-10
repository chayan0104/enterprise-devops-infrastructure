import { Badge, Command, PageHeader, Panel, Stat } from "@/components/ui";
import { getArtifacts, getEnvironments } from "@/lib/queries";

export const dynamic = "force-dynamic";

const modules = [
  {
    name: "vpc",
    purpose: "VPC, public + private subnets in two AZs, IGW, NAT and route tables.",
    resources: ["aws_vpc", "aws_subnet ×4", "aws_nat_gateway", "route tables"],
    decision: "Private subnets are egress-only: the ALB is the only public surface.",
  },
  {
    name: "security-groups",
    purpose: "Three groups with one owner each: ALB, WildFly, EKS nodes.",
    resources: ["aws_security_group ×3", "node → control-plane rule"],
    decision: "Tier-to-tier traffic uses security group references, not CIDRs.",
  },
  {
    name: "alb",
    purpose: "Public ALB, HTTPS listener, HTTP redirect and the WildFly target group.",
    resources: ["aws_lb", "aws_lb_listener ×2", "aws_lb_target_group"],
    decision: "Stickiness on while the app keeps sessions locally; 30s deregistration.",
  },
  {
    name: "ec2",
    purpose: "WildFly launch template, ASG, instance profile and target tracking scaling.",
    resources: ["aws_launch_template", "aws_autoscaling_group", "aws_iam_role/policy", "ASG policy"],
    decision: "IMDSv2 required, SSM instead of SSH, rolling instance refresh on template change.",
  },
  {
    name: "eks",
    purpose: "Cluster, OIDC provider for IRSA, managed node group and core add-ons.",
    resources: ["aws_eks_cluster", "oidc provider", "aws_eks_node_group", "addons ×3"],
    decision: "IRSA is created here because the ServiceAccounts depend on it.",
  },
  {
    name: "ecr",
    purpose: "One private repository per deployable image with lifecycle control.",
    resources: ["aws_ecr_repository", "lifecycle policy", "optional repo policy"],
    decision: "IMMUTABLE tags: a release tag can never be overwritten, so rollback is truthful.",
  },
  {
    name: "secrets-manager",
    purpose: "Secret containers, KMS key and least-privilege read policy.",
    resources: ["aws_secretsmanager_secret", "version", "secret policy", "KMS key/alias"],
    decision: "Values are injected at apply time from CI; Terraform owns the container, not the value.",
  },
];

const dependencies = [
  { name: "Oracle RDS primary", port: "1521 / TCP TLS", owner: "DBA", how: "JDBC over TGW/peering from private subnets" },
  { name: "DocumentDB endpoint", port: "27017 / TCP TLS", owner: "Data platform", how: "TLS with enterprise CA, host via variable" },
  { name: "Kafka (external)", port: "9093 / SASL_SSL", owner: "Messaging", how: "Consumer Deployment, SCRAM credential in Secrets Manager" },
  { name: "SFTP partner", port: "22 / TCP", owner: "Integration", how: "Egress via NAT, partner whitelists the EIPs" },
];

const excluded = [
  "CloudFront",
  "AWS WAF",
  "API Gateway",
  "Route 53",
  "Amazon MSK",
  "Oracle RDS primary + read replica",
  "DocumentDB",
  "GoldenGate",
];

export default async function InfrastructurePage() {
  const [environments, artifacts] = await Promise.all([getEnvironments(), getArtifacts()]);
  const categories = Array.from(new Set(artifacts.map((artifact) => artifact.category)));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Terraform · seven modules"
        title="Small module surface, explicit environment differences."
        description="Each module owns one concern and its own IAM. There is no module for backup, CloudWatch, IAM, autoscaling, target groups, node groups or VPC endpoints — those concerns live where they are used, or are documented as platform-owned."
        right={<Badge tone="info">independent state per environment</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="modules" value={modules.length} hint="vpc · sg · alb · ec2 · eks · ecr · secrets" tone="ok" />
        <Stat label="environments" value={environments.length} hint="uat + prod roots" />
        <Stat label="terraform state" value="s3" hint="encrypted · versioned · locked" tone="info" />
        <Stat label="external services provisioned" value="0" hint="oracle / documentdb / kafka / sftp" tone="warn" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <Panel key={module.name} kicker={`modules/${module.name}`} title={module.purpose}>
            <p className="mono text-[11px] text-cyan">terraform/modules/{module.name}</p>
            <ul className="mt-3 space-y-1.5">
              {module.resources.map((resource) => (
                <li key={resource} className="mono flex items-start gap-2 text-[11.5px] text-muted">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent/70" />
                  {resource}
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-line-soft pt-2.5 text-[11.5px] leading-relaxed text-muted">
              <span className="mono text-[10px] uppercase tracking-[0.12em] text-accent">decision · </span>
              {module.decision}
            </p>
          </Panel>
        ))}
      </div>

      <Panel kicker="uat vs prod" title="Environment configuration differences" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="mono bg-panel-2/60 text-[9px] uppercase tracking-[0.14em] text-muted">
              <tr>
                <th className="px-4 py-2 font-normal">setting</th>
                {environments.map((environment) => (
                  <th key={environment.id} className="px-4 py-2 font-normal">
                    {environment.slug}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-[12.5px]">
              {[
                ["aws account", (row: (typeof environments)[number]) => row.awsAccount],
                ["vpc", (row: (typeof environments)[number]) => `${row.vpcCidr} · ${row.region}`],
                ["nat gateways", (row: (typeof environments)[number]) => String(row.natGateways)],
                ["wildfly capacity", (row: (typeof environments)[number]) => row.wildflyCapacity],
                ["eks capacity", (row: (typeof environments)[number]) => row.eksCapacity],
                ["eks api endpoint", (row: (typeof environments)[number]) => row.endpointAccess],
                ["monitoring", (row: (typeof environments)[number]) => row.monitoring],
                ["terraform role", (row: (typeof environments)[number]) => row.terraformRole],
                ["state key", (row: (typeof environments)[number]) => row.stateKey],
              ].map(([label, getter]) => (
                <tr key={label as string} className="border-t border-line-soft">
                  <td className="mono px-4 py-2 text-[11px] uppercase tracking-[0.08em] text-muted">{label as string}</td>
                  {environments.map((environment) => (
                    <td key={environment.id} className="px-4 py-2 text-text">
                      {(getter as (row: (typeof environments)[number]) => string)(environment)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel kicker="consumed, never created" title="Existing external dependencies">
          <div className="space-y-2.5">
            {dependencies.map((dependency) => (
              <div key={dependency.name} className="rounded-lg border border-line-soft bg-panel-2/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] text-text">{dependency.name}</span>
                  <span className="mono text-[10px] text-muted">{dependency.port}</span>
                </div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  {dependency.how} · owner: {dependency.owner}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Endpoints are variables with <span className="mono text-amber">REPLACE-…</span> placeholders. The repository
            never invents a hostname, and no Terraform module creates these services.
          </p>
        </Panel>

        <Panel kicker="scope guard" title="Explicitly excluded AWS services">
          <div className="flex flex-wrap gap-2">
            {excluded.map((service) => (
              <span
                key={service}
                className="mono rounded border border-danger/25 bg-danger/5 px-2 py-1 text-[10.5px] uppercase tracking-[0.08em] text-danger/90"
              >
                {service}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            These are existing enterprise services or deliberately out of scope. DNS and certificates are owned
            centrally, so Route 53 and ACM creation stay outside this project. Kafka is self-managed/external, so MSK is
            not an option.
          </p>
          <div className="mt-3 border-t border-line-soft pt-3">
            <Command label="validate without credentials">
{`terraform -chdir=terraform/environments/uat fmt -check -recursive
terraform -chdir=terraform/environments/uat init -backend=false
terraform -chdir=terraform/environments/uat validate
trivy config terraform/environments/uat`}
            </Command>
          </div>
        </Panel>
      </div>

      <Panel kicker="repository map" title="What is in the pull request">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {categories.map((category) => (
            <div key={category}>
              <p className="mono text-[10px] uppercase tracking-[0.14em] text-accent">{category}</p>
              <ul className="mt-2 space-y-1.5">
                {artifacts
                  .filter((artifact) => artifact.category === category)
                  .map((artifact) => (
                    <li key={artifact.id} className="text-[11.5px] leading-snug">
                      <span className="mono text-[11px] text-text">{artifact.path}</span>
                      <span className="block text-[11px] text-muted">{artifact.purpose}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
