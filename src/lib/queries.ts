import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { ensureDbReady } from "@/db/bootstrap";
import {
  artifacts,
  components,
  deployments,
  environments,
  manifests,
  runbooks,
  secretInventory,
  type Component,
  type Environment,
} from "@/db/schema";

export type DeploymentView = {
  id: number;
  componentSlug: string;
  componentName: string;
  kind: string;
  environmentSlug: string;
  environmentName: string;
  version: string;
  imageTag: string;
  status: string;
  actor: string;
  pipeline: string;
  changeId: string | null;
  durationSeconds: number;
  startedAt: string;
  notes: string | null;
};

export type WorkloadStatus = {
  component: Component;
  status: "healthy" | "degraded" | "unknown";
  currentVersion: string | null;
  lastAttempt: DeploymentView | null;
  lastChange: string | null;
};

function toView(
  row: typeof deployments.$inferSelect,
  component: Component,
  environment: Environment,
): DeploymentView {
  return {
    id: row.id,
    componentSlug: component.slug,
    componentName: component.name,
    kind: component.kind,
    environmentSlug: environment.slug,
    environmentName: environment.name,
    version: row.version,
    imageTag: row.imageTag,
    status: row.status,
    actor: row.actor,
    pipeline: row.pipeline,
    changeId: row.changeId,
    durationSeconds: row.durationSeconds,
    startedAt: row.startedAt.toISOString(),
    notes: row.notes,
  };
}

export async function getEnvironments(): Promise<Environment[]> {
  await ensureDbReady();
  return db.select().from(environments).orderBy(asc(environments.id));
}

export async function getComponents(): Promise<Component[]> {
  await ensureDbReady();
  return db.select().from(components).orderBy(asc(components.id));
}

export async function getDeploymentFeed(limit?: number): Promise<DeploymentView[]> {
  await ensureDbReady();
  const rows = await db
    .select({
      deployment: deployments,
      component: components,
      environment: environments,
    })
    .from(deployments)
    .innerJoin(components, eq(deployments.componentId, components.id))
    .innerJoin(environments, eq(deployments.environmentId, environments.id))
    .orderBy(desc(deployments.startedAt), desc(deployments.id));

  const views = rows.map((row) => toView(row.deployment, row.component, row.environment));
  return typeof limit === "number" ? views.slice(0, limit) : views;
}

export function buildWorkloadStatuses(
  componentRows: Component[],
  feed: DeploymentView[],
  environmentSlug: string,
): WorkloadStatus[] {
  const envFeed = feed.filter((row) => row.environmentSlug === environmentSlug);

  return componentRows.map((component) => {
    const rows = envFeed
      .filter((row) => row.componentSlug === component.slug)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
    const lastAttempt = rows[0] ?? null;
    const lastSuccess = rows.find((row) => row.status === "succeeded") ?? null;
    const status: WorkloadStatus["status"] = !lastSuccess
      ? "unknown"
      : lastAttempt && lastAttempt.status === "failed"
        ? "degraded"
        : "healthy";

    return {
      component,
      status,
      currentVersion: lastSuccess?.version ?? null,
      lastAttempt,
      lastChange: lastSuccess?.changeId ?? null,
    };
  });
}

export async function getOverview() {
  const [envRows, componentRows, feed] = await Promise.all([
    getEnvironments(),
    getComponents(),
    getDeploymentFeed(),
  ]);

  const runbookCount = await countRunbooks();
  const succeeded = feed.filter((row) => row.status === "succeeded").length;
  const failed = feed.filter((row) => row.status === "failed").length;
  const rolledBack = feed.filter((row) => row.status === "rolled_back").length;
  const lastProd = feed.find((row) => row.environmentSlug === "prod") ?? null;

  return {
    environments: envRows,
    components: componentRows,
    feed,
    stats: {
      deployments: feed.length,
      succeeded,
      failed,
      rolledBack,
      runbooks: runbookCount,
      successRate: feed.length === 0 ? 0 : Math.round((succeeded / feed.length) * 100),
    },
    lastProd,
    uatWorkloads: buildWorkloadStatuses(componentRows, feed, "uat"),
    prodWorkloads: buildWorkloadStatuses(componentRows, feed, "prod"),
  };
}

async function countRunbooks(): Promise<number> {
  await ensureDbReady();
  const rows = await db.select({ id: runbooks.id }).from(runbooks);
  return rows.length;
}

export async function getRunbooks(filters: { q?: string; category?: string } = {}) {
  await ensureDbReady();
  const conditions = [];
  if (filters.q && filters.q.trim().length > 0) {
    const needle = `%${filters.q.trim()}%`;
    conditions.push(
      or(
        ilike(runbooks.title, needle),
        ilike(runbooks.symptom, needle),
        ilike(runbooks.likelyCause, needle),
        ilike(runbooks.commands, needle),
        ilike(runbooks.category, needle),
        ilike(runbooks.correctiveAction, needle),
        ilike(runbooks.scope, needle),
      ),
    );
  }
  if (filters.category && filters.category !== "all") {
    conditions.push(eq(runbooks.category, filters.category));
  }

  const rows = await db
    .select()
    .from(runbooks)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(runbooks.category), asc(runbooks.id));

  return rows;
}

export async function getRunbookCategories(): Promise<string[]> {
  await ensureDbReady();
  const rows = await db
    .selectDistinct({ category: runbooks.category })
    .from(runbooks)
    .orderBy(asc(runbooks.category));
  return rows.map((row) => row.category);
}

export async function getManifests() {
  await ensureDbReady();
  return db.select().from(manifests).orderBy(asc(manifests.id));
}

export async function getSecretInventory() {
  await ensureDbReady();
  return db.select().from(secretInventory).orderBy(asc(secretInventory.id));
}

export async function getArtifacts() {
  await ensureDbReady();
  return db.select().from(artifacts).orderBy(asc(artifacts.sortOrder), asc(artifacts.path));
}
