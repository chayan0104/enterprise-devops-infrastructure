# enterprise-hybrid-devops · control plane

This repository contains two things that belong together:

1. **`enterprise-hybrid-devops/`** — the actual DevOps project: seven Terraform
   modules, UAT/PROD roots, plain Kubernetes manifests, three Jenkins
   pipelines, a reference Spring Boot service, UAT/PROD monitoring, and the
   README/operations/troubleshooting documentation.
2. **The Next.js control plane in `src/`** — a small, database-backed portal that
   makes the project reviewable: architecture and traffic flow, module and
   environment comparison, Kubernetes manifest explanations, pipeline stages, a
   deployment history you can roll back, secret/IAM flows, and a searchable
   runbook.

Start with [`enterprise-hybrid-devops/README.md`](enterprise-hybrid-devops/README.md)
for the architecture, and
[`enterprise-hybrid-devops/docs/TROUBLESHOOTING.md`](enterprise-hybrid-devops/docs/TROUBLESHOOTING.md)
for the incident runbooks.

## Console pages

| Route | What it shows |
| --- | --- |
| `/` | Architecture diagram, traffic flow, UAT/PROD workload state, recent deployments |
| `/infrastructure` | Terraform modules and decisions, UAT vs PROD matrix, external dependencies, exclusions, repository map |
| `/kubernetes` | Workload shape per component, manifest explorer with plain-language explanations, prerequisites |
| `/pipelines` | Stage-by-stage pipeline map, deploy console, rollback, IAM separation |
| `/monitoring` | UAT Prometheus stack, PROD Dynatrace + CloudWatch, S3 log archive and retention |
| `/secrets` | Secret inventory, EC2 instance-profile flow, EKS IRSA + CSI flow, policy excerpt |
| `/runbook` | 13 searchable entries: symptom → likely cause → commands → corrective action |

## Running locally

```bash
npm install
# DATABASE_URL points at the local PostgreSQL instance
npm run dev
```

The portal self-bootstraps its schema and seed inventory on first request
(`src/db/bootstrap.ts`), so there is no separate migration step for the demo.
`npm run build` + `npm start` runs the production server, and `/api/health`
verifies the database connection.

## API surface

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | database health probe |
| `GET` | `/api/deployments` | deployment feed joined with component/environment |
| `POST` | `/api/deployments` | record a deployment; **rejects production without a change reference**, rejects a repeat version |
| `POST` | `/api/deployments/:id/rollback` | restore the previous successful release and record the rollback |
| `GET` | `/api/runbook?q=&category=` | full-text-ish runbook search across symptom, cause, commands and fix |

## Data model (Drizzle + PostgreSQL)

| Table | Contents |
| --- | --- |
| `environments` | UAT/PROD account, VPC, capacities, monitoring stack, Terraform role and state key |
| `components` | WildFly ASG, the two Spring Boot services and the Kafka consumer |
| `deployments` | Version, immutable image tag, status, actor, change reference, duration; drives the console history and workload health |
| `runbooks` | 13 troubleshooting entries reused by the UI and the JSON API |
| `manifests` | Kubernetes files with purpose, explanation and a representative excerpt |
| `secret_inventory` | Secret path, consumer, payload shape, owner/rotation, access path |
| `artifacts` | Curated repository map shown on the infrastructure page |

The Terraform/Kubernetes/Jenkins files remain the source of truth for
infrastructure; the database stores the inventory and operational records the
console reads and writes.

## Design boundaries

- No AWS credentials are required to review this project. Endpoints in the
  Terraform variables, ConfigMap and manifests are explicit `REPLACE-…`
  placeholders — the implementation never invents an Oracle, DocumentDB, Kafka or
  SFTP endpoint.
- Oracle RDS, DocumentDB, Kafka and SFTP are **existing** dependencies; no
  Terraform module creates them, and CloudFront, WAF, API Gateway, Route 53, MSK
  and GoldenGate are deliberately out of scope.
- The portal never calls AWS. The "run deploy" action writes a deployment record
  and applies the same production change-reference rule as the Jenkins pipeline.
