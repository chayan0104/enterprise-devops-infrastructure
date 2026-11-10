import { revalidatePath } from "next/cache";
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { ensureDbReady } from "@/db/bootstrap";
import { components, deployments, environments } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const deploymentId = Number.parseInt(id, 10);
    if (!Number.isInteger(deploymentId) || deploymentId <= 0) {
      return Response.json({ error: "Invalid deployment id" }, { status: 400 });
    }

    await ensureDbReady();

    const [row] = await db
      .select({ deployment: deployments, component: components, environment: environments })
      .from(deployments)
      .innerJoin(components, eq(deployments.componentId, components.id))
      .innerJoin(environments, eq(deployments.environmentId, environments.id))
      .where(eq(deployments.id, deploymentId));

    if (!row) {
      return Response.json({ error: "Deployment not found" }, { status: 404 });
    }

    const [previous] = await db
      .select()
      .from(deployments)
      .where(
        and(
          eq(deployments.componentId, row.component.id),
          eq(deployments.environmentId, row.environment.id),
          eq(deployments.status, "succeeded"),
          lt(deployments.startedAt, row.deployment.startedAt),
        ),
      )
      .orderBy(desc(deployments.startedAt))
      .limit(1);

    if (!previous) {
      return Response.json(
        { error: "No earlier successful release exists — nothing to roll back to" },
        { status: 409 },
      );
    }

    const [created] = await db
      .insert(deployments)
      .values({
        componentId: row.component.id,
        environmentId: row.environment.id,
        version: previous.version,
        imageTag: previous.imageTag,
        status: "rolled_back",
        actor: "console/operator",
        pipeline: row.deployment.pipeline,
        changeId: row.deployment.changeId,
        durationSeconds: 90 + Math.floor(Math.random() * 120),
        notes:
          row.component.kind === "wildfly"
            ? `Rollback of ${row.deployment.version}: previous WAR restored, WildFly restarted, ALB targets re-checked.`
            : `Rollback of ${row.deployment.version}: kubectl rollout undo to ReplicaSet of ${previous.version}.`,
      })
      .returning();

    revalidatePath("/");
    revalidatePath("/pipelines");
    revalidatePath("/kubernetes");

    return Response.json({
      deployment: {
        id: created.id,
        componentSlug: row.component.slug,
        componentName: row.component.name,
        environmentSlug: row.environment.slug,
        version: created.version,
        imageTag: created.imageTag,
        status: created.status,
      },
    });
  } catch (error) {
    console.error("POST /api/deployments/[id]/rollback failed", error);
    return Response.json({ error: "Unable to roll back the deployment" }, { status: 500 });
  }
}
