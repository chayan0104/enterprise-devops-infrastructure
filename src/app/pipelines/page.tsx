import { DeployConsole } from "@/components/deploy-console";
import { Badge, Command, PageHeader, Panel, Stat } from "@/components/ui";
import { getComponents, getDeploymentFeed, getEnvironments } from "@/lib/queries";

export const dynamic = "force-dynamic";

const pipelines = [
  {
    name: "Jenkinsfile.main-app",
    target: "WildFly on EC2",
    role: "ehd-app-deploy",
    stages: [
      "Checkout",
      "Build and test (Maven)",
      "SonarQube + OWASP dependency check",
      "Package WAR",
      "Publish to JFrog",
      "Approval (prod)",
      "Deploy via SSM",
      "ALB health check",
    ],
    rollback: "Previous WAR is kept on the instance and restored automatically when /health/ready fails.",
  },
  {
    name: "Jenkinsfile.microservice",
    target: "Spring Boot on EKS",
    role: "ehd-app-deploy",
    stages: [
      "Checkout",
      "Maven build and test",
      "SonarQube",
      "Docker build",
      "Trivy image scan",
      "Push immutable tag to ECR",
      "Approval (prod)",
      "kubectl set image",
      "Rollout status",
      "Smoke test",
    ],
    rollback: "kubectl rollout undo returns to the previous ReplicaSet; ECR tags are immutable, so it is exact.",
  },
  {
    name: "Jenkinsfile.terraform",
    target: "AWS infrastructure",
    role: "ehd-<env>-terraform-deploy",
    stages: [
      "Checkout",
      "terraform fmt -check",
      "terraform init",
      "terraform validate",
      "trivy config",
      "terraform plan (saved)",
      "Approval (every apply)",
      "terraform apply tfplan.bin",
    ],
    rollback: "git revert + plan/apply. Never edit Terraform-managed resources in the console.",
  },
];

export default async function PipelinesPage() {
  const [components, environments, feed] = await Promise.all([
    getComponents(),
    getEnvironments(),
    getDeploymentFeed(60),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Jenkins · delivery"
        title="Three pipelines, two AWS roles, no static credentials."
        description="Applications and infrastructure are deployed by different pipelines assuming different roles. Production always has a human approval gate, and every Terraform apply uses the plan that was reviewed."
        right={<Badge tone="ok">sts assume-role only</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="pipelines" value={3} hint="main-app · microservice · terraform" tone="ok" />
        <Stat label="application role" value="app" hint="ECR push · SSM · EKS describe" tone="info" />
        <Stat label="infrastructure role" value="infra" hint="VPC · EC2 · EKS · secrets containers" tone="warn" />
        <Stat label="deployments recorded" value={feed.length} hint="shared history with the overview" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {pipelines.map((pipeline) => (
          <Panel
            key={pipeline.name}
            kicker={pipeline.target}
            title={pipeline.name}
            actions={<Badge tone="neutral">{pipeline.role}</Badge>}
          >
            <ol className="space-y-1.5">
              {pipeline.stages.map((stage, index) => (
                <li key={stage} className="flex items-start gap-2 text-[12px] leading-snug text-muted">
                  <span className="mono mt-0.5 w-4 shrink-0 text-right text-[9.5px] text-accent/80">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={stage.startsWith("Approval") ? "text-amber" : ""}>{stage}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 border-t border-line-soft pt-2.5 text-[11px] leading-relaxed text-muted">
              <span className="mono text-[10px] uppercase tracking-[0.12em] text-cyan">rollback · </span>
              {pipeline.rollback}
            </p>
          </Panel>
        ))}
      </div>

      <Panel
        kicker="delivery console"
        title="Deployment history and rollback"
        actions={<Badge tone="warn">writes to postgres</Badge>}
      >
        <DeployConsole
          components={components.map((component) => ({ slug: component.slug, name: component.name }))}
          environments={environments.map((environment) => ({ slug: environment.slug, name: environment.name }))}
          deployments={feed}
        />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel kicker="jenkins → aws" title="How the role is assumed">
          <Command label="AWS Steps plugin (inside the pipeline)">
{`withAWS(
  role: env.APP_ROLE_ARN,
  roleSessionName: "jenkins-\${env.GIT_SHA}",
  region: "eu-west-1"
) {
  sh 'aws eks update-kubeconfig --name ehd-prod'
}`}
          </Command>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            The agent&apos;s instance profile may only call <span className="mono text-cyan">sts:AssumeRole</span> into
            the two pipeline roles. The trust policy checks the Jenkins principal and (for prod) an MFA/tag condition.
            Credentials expire with the session, and the session name carries the commit SHA for CloudTrail.
          </p>
        </Panel>

        <Panel kicker="permission split" title="What each role can and cannot do">
          <div className="space-y-2.5">
            {[
              {
                role: "ehd-app-deploy",
                can: ["ecr:GetAuthorizationToken + push to app repos", "ssm:SendCommand on tagged instances", "eks:DescribeCluster + sts:GetCallerIdentity"],
                cannot: ["create or delete infrastructure", "read secret values from Terraform state", "touch IAM"],
                tone: "info" as const,
              },
              {
                role: "ehd-<env>-terraform-deploy",
                can: ["VPC, EC2/ASG, ELB, EKS, ECR, Secrets Manager containers", "IAM roles scoped to this project"],
                cannot: ["read the secret values it creates", "deploy application artifacts", "modify Oracle/DocumentDB/Kafka"],
                tone: "warn" as const,
              },
            ].map((item) => (
              <div key={item.role} className="rounded-lg border border-line-soft bg-panel-2/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="mono text-[11.5px] text-text">{item.role}</span>
                  <Badge tone={item.tone}>role</Badge>
                </div>
                <ul className="mt-2 space-y-1">
                  {item.can.map((line) => (
                    <li key={line} className="text-[11.5px] leading-snug text-accent/85">
                      + {line}
                    </li>
                  ))}
                  {item.cannot.map((line) => (
                    <li key={line} className="text-[11.5px] leading-snug text-danger/80">
                      − {line}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
