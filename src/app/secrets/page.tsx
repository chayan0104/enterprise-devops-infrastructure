import { Badge, Command, PageHeader, Panel, Stat } from "@/components/ui";
import { getSecretInventory } from "@/lib/queries";

export const dynamic = "force-dynamic";

const rules = [
  "No secret in Git, Jenkinsfiles, Dockerfiles, ConfigMaps or tfvars.",
  "One secret path per credential bundle; one owning role per path.",
  "Terraform manages the container, KMS key and read policy — CI or the owning team writes the value.",
  "EC2 uses an instance profile; EKS pods use IRSA pinned to namespace/service-account.",
  "Rotation requires a restart for env-injected values; use SDK reads with a TTL for zero-restart rotation.",
];

export default async function SecretsPage() {
  const secrets = await getSecretInventory();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Secrets & IAM · least privilege"
        title="Every workload reads only what it needs."
        description="AWS Secrets Manager holds database, SFTP and Kafka credentials. WildFly authenticates with an EC2 instance profile; each microservice gets an IRSA role whose trust policy names its exact ServiceAccount."
        right={<Badge tone="ok">no long-lived AWS keys</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="secret bundles" value={secrets.length} hint="one path per credential" tone="ok" />
        <Stat label="identity types" value={2} hint="ec2 instance profile · eks irsa" tone="info" />
        <Stat label="terraform-managed values" value={0} hint="CI injects values at apply time" />
        <Stat label="permanent jenkins keys" value={0} hint="sts assume-role only" tone="warn" />
      </div>

      <Panel kicker="inventory" title="Secret paths and their consumers" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead className="mono bg-panel-2/60 text-[9px] uppercase tracking-[0.14em] text-muted">
              <tr>
                <th className="px-4 py-2 font-normal">secret path</th>
                <th className="px-3 py-2 font-normal">consumer</th>
                <th className="px-3 py-2 font-normal">payload</th>
                <th className="px-3 py-2 font-normal">owner · rotation</th>
                <th className="px-3 py-2 font-normal">access path</th>
              </tr>
            </thead>
            <tbody>
              {secrets.map((secret) => (
                <tr key={secret.id} className="border-t border-line-soft align-top text-[12px]">
                  <td className="mono px-4 py-2.5 text-cyan">{secret.path}</td>
                  <td className="px-3 py-2.5 text-text">{secret.consumer}</td>
                  <td className="mono px-3 py-2.5 text-[10.5px] text-muted">{secret.payload}</td>
                  <td className="px-3 py-2.5 text-muted">
                    {secret.owner}
                    <span className="mono block text-[10px] text-muted/80">{secret.rotation}</span>
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-muted">{secret.accessPath}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel kicker="flow 01" title="WildFly on EC2">
          <div className="space-y-2">
            {[
              "Instance profile ehd-{env}-wildfly-instance is attached by the launch template.",
              "Role policy allows secretsmanager:GetSecretValue only on the db, sftp and kafka ARNs.",
              "KMS policy allows kms:Decrypt with the application CMK; no wildcard resources.",
              "At boot, the app fetches the bundles and keeps them in memory — never on disk.",
              "S3 document writes are limited to the main-app/ prefix with s3:prefix conditions.",
            ].map((step, index) => (
              <div key={step} className="flex gap-2.5">
                <span className="mono mt-0.5 text-[10px] text-accent">0{index + 1}</span>
                <p className="text-[12px] leading-relaxed text-muted">{step}</p>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Command label="verify the identity actually used">
{`aws sts get-caller-identity
aws secretsmanager get-secret-value \\
  --secret-id ehd/prod/db --query SecretString --output text | jq 'keys'`}
            </Command>
          </div>
        </Panel>

        <Panel kicker="flow 02" title="Spring Boot on EKS (IRSA + CSI)">
          <div className="space-y-2">
            {[
              "ServiceAccount order-service is annotated with its IAM role ARN.",
              "The OIDC trust policy accepts only system:serviceaccount:ehd-apps:order-service.",
              "The Secrets Store CSI driver uses that identity to call Secrets Manager.",
              "Values are mounted at /mnt/secrets-store and optionally synced into one Kubernetes Secret.",
              "A pod in another namespace cannot assume the role — the sub claim does not match.",
            ].map((step, index) => (
              <div key={step} className="flex gap-2.5">
                <span className="mono mt-0.5 text-[10px] text-cyan">0{index + 1}</span>
                <p className="text-[12px] leading-relaxed text-muted">{step}</p>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Command label="verify the pod identity">
{`kubectl -n ehd-apps get sa order-service -o jsonpath='{.metadata.annotations}'
kubectl -n ehd-apps exec deploy/order-service -- env | grep AWS_ROLE_ARN
kubectl -n ehd-apps exec deploy/order-service -- ls -l /mnt/secrets-store`}
            </Command>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        <Panel kicker="non-negotiables" title="Secrets rules">
          <ul className="space-y-2">
            {rules.map((rule) => (
              <li key={rule} className="flex items-start gap-2 text-[12px] leading-relaxed text-muted">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/80" />
                {rule}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel kicker="reference" title="Least-privilege policy fragment">
          <Command label="EC2 instance policy (excerpt)">
{`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadOwnApplicationSecrets",
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": [
        "arn:aws:secretsmanager:eu-west-1:444455556666:secret:ehd/prod/db-*",
        "arn:aws:secretsmanager:eu-west-1:444455556666:secret:ehd/prod/sftp-*",
        "arn:aws:secretsmanager:eu-west-1:444455556666:secret:ehd/prod/kafka-*"
      ]
    },
    {
      "Sid": "DocumentStorage",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::documents-bucket/main-app/*"
    }
  ]
}`}
          </Command>
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
            No <span className="mono text-danger">Resource: &quot;*&quot;</span> for secret reads, no
            <span className="mono text-danger"> iam:PassRole</span>, no console login. The EKS node role is separate
            from workload roles, so a pod cannot inherit node permissions.
          </p>
        </Panel>
      </div>
    </div>
  );
}
