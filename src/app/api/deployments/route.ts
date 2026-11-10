import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureDbReady } from "@/db/bootstrap";
import { components, deployments, environments } from "@/db/schema";
import { getDeploymentFeed } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Payload = {
  componentSlug?: unknown;
  environmentSlug?: unknown;
  version?: unknown;
  changeId?: unknown;
  actor?: unknown;
};

const asString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export async function GET() {
  try {
    const feed = await getDeploymentFeed(60);
    return Response.json({ deployments: feed });
  } catch (error) {
    console.error("GET /api/deployments failed", error);
    return Response.json({ error: "Unable to load deployments" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Payload | null;
    if (!body) {
      return Response.json({ error: "JSON body required" }, { status: 400 });
    }

    const componentSlug = asString(body.componentSlug);
    const environmentSlug = asString(body.environmentSlug);
    const version = asString(body.version);
    const changeId = asString(body.changeId);
    const actor = asString(body.actor) || "console/operator";

    if (!componentSlug || !environmentSlug) {
      return Response.json({ error: "componentSlug and environmentSlug are required" }, { status: 400 });
    }
    if (!/^[0-9A-Za-z][0-9A-Za-z._-]{1,40}$/.test(version)) {
      return Response.json(
        { error: "Version must be 2-41 characters (letters, digits, dot, dash, underscore)" },
        { status: 400 },
      );
    }

    await ensureDbReady();

    const [component] = await db.select().from(components).where(eq(components.slug, componentSlug));
    const [environment] = await db.select().from(environments).where(eq(environments.slug, environmentSlug));

    if (!component) {
      return Response.json({ error: `Unknown component: ${componentSlug}` }, { status: 404 });
    }
    if (!environment) {
      return Response.json({ error: `Unknown environment: ${environmentSlug}` }, { status: 404 });
    }

    // Mirrors the Jenkins gate: production requires a change reference.
    if (environment.slug === "prod" && !changeId) {
      return Response.json(
        { error: "A change reference (CHG…) is required for production deployments" },
        { status: 400 },
      );
    }

    const previous = await db
      .select()
      .from(deployments)
      .where(
        and(
          eq(deployments.componentId, component.id),
          eq(deployments.environmentId, environment.id),
          eq(deployments.status, "succeeded"),
        ),
      )
      .orderBy(desc(deployments.startedAt))
      .limit(1);

    if (previous[0]?.version === version) {
      return Response.json(
        { error: `${version} is already the running version on ${environment.slug}` },
        { status: 409 },
      );
    }

    const sha = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const imageTag =
      component.kind === "wildfly" ? `war/${version}-${sha}` : `release-${sha}`;
    const durationSeconds = 120 + Math.floor(Math.random() * 300);

    const [created] = await db
      .insert(deployments)
      .values({
        componentId: component.id,
        environmentId: environment.id,
        version,
        imageTag,
        status: "succeeded",
        actor,
        pipeline: component.kind === "wildfly" ? "main-app" : "microservice",
        changeId: changeId || null,
        durationSeconds,
        notes: `Build → scan → publish → deploy → health verified. Rolling update ${
          component.kind === "wildfly" ? "via SSM across the ASG" : "maxUnavailable: 0"
        }.`,
      })
      .returning();

    revalidatePath("/");
    revalidatePath("/pipelines");
    revalidatePath("/kubernetes");

    return Response.json(
      {
        deployment: {
          id: created.id,
          componentSlug: component.slug,
          componentName: component.name,
          environmentSlug: environment.slug,
          version: created.version,
          imageTag: created.imageTag,
          status: created.status,
          startedAt: created.startedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/deployments failed", error);
    return Response.json({ error: "Unable to record the deployment" }, { status: 500 });
  }
}
