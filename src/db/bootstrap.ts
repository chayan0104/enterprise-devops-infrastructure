import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  artifacts,
  components,
  deployments,
  environments,
  manifests,
  runbooks,
  secretInventory,
} from "@/db/schema";
import {
  artifactSeed,
  componentSeed,
  deploymentSeed,
  environmentSeed,
  secretSeed,
} from "@/db/seed-data";
import { manifestSeed, runbookSeed } from "@/db/content";

/**
 * Self-healing bootstrap: creates the tables if the sandbox database was reset,
 * then inserts the demo inventory once. Safe to call on every request; the work
 * happens at most once per server process and all inserts are conflict-tolerant.
 */

const DDL = `
create table if not exists environments (
  id serial primary key,
  slug text not null unique,
  name text not null,
  aws_account text not null,
  region text not null,
  vpc_cidr text not null,
  cluster_name text not null,
  state_key text not null,
  nat_gateways integer not null,
  wildfly_capacity text not null,
  eks_capacity text not null,
  monitoring text not null,
  endpoint_access text not null,
  terraform_role text not null,
  notes text not null
);
create table if not exists components (
  id serial primary key,
  slug text not null unique,
  name text not null,
  kind text not null,
  runtime text not null,
  namespace text not null,
  artifact text not null,
  critical boolean not null default true,
  replicas_uat text not null,
  replicas_prod text not null,
  description text not null
);
create table if not exists deployments (
  id serial primary key,
  component_id integer not null references components(id) on delete cascade,
  environment_id integer not null references environments(id) on delete cascade,
  version text not null,
  image_tag text not null,
  status text not null,
  actor text not null,
  pipeline text not null,
  change_id text,
  duration_seconds integer not null default 0,
  started_at timestamptz not null default now(),
  notes text
);
create table if not exists runbooks (
  id serial primary key,
  slug text not null unique,
  category text not null,
  title text not null,
  severity text not null,
  scope text not null,
  symptom text not null,
  likely_cause text not null,
  commands text not null,
  corrective_action text not null
);
create table if not exists manifests (
  id serial primary key,
  path text not null unique,
  kind text not null,
  purpose text not null,
  explanation text not null,
  snippet text not null
);
create table if not exists secret_inventory (
  id serial primary key,
  path text not null unique,
  consumer text not null,
  payload text not null,
  owner text not null,
  rotation text not null,
  access_path text not null
);
create table if not exists artifacts (
  id serial primary key,
  path text not null,
  category text not null,
  purpose text not null,
  sort_order integer not null default 0
);
create unique index if not exists artifacts_path_idx on artifacts (path);
`;

async function seed(): Promise<void> {
  const [{ count: envCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(environments);

  if (envCount === 0) {
    await db.insert(environments).values(environmentSeed).onConflictDoNothing();
    await db.insert(components).values(componentSeed).onConflictDoNothing();
    await db.insert(runbooks).values(runbookSeed).onConflictDoNothing();
    await db.insert(manifests).values(manifestSeed).onConflictDoNothing();
    await db.insert(secretInventory).values(secretSeed).onConflictDoNothing();
  }

  const [{ count: artifactCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(artifacts);

  if (artifactCount === 0) {
    await db
      .insert(artifacts)
      .values(artifactSeed)
      .onConflictDoNothing();
  }

  const [{ count: deploymentCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deployments);

  if (deploymentCount === 0) {
    const envRows = await db.select().from(environments);
    const componentRows = await db.select().from(components);
    const envBySlug = new Map(envRows.map((row) => [row.slug, row.id]));
    const componentBySlug = new Map(componentRows.map((row) => [row.slug, row.id]));

    const rows = deploymentSeed.flatMap((seedRow) => {
      const componentId = componentBySlug.get(seedRow.component);
      const environmentId = envBySlug.get(seedRow.environment);
      if (!componentId || !environmentId) return [];
      return [
        {
          componentId,
          environmentId,
          version: seedRow.version,
          imageTag: seedRow.imageTag,
          status: seedRow.status,
          actor: seedRow.actor,
          pipeline: seedRow.pipeline,
          changeId: seedRow.changeId,
          durationSeconds: seedRow.durationSeconds,
          startedAt: seedRow.startedAt,
          notes: seedRow.notes,
        },
      ];
    });

    if (rows.length > 0) {
      await db.insert(deployments).values(rows);
    }
  }
}

let bootstrapPromise: Promise<void> | null = null;

export function ensureDbReady(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await db.execute(sql.raw(DDL));
      await seed();
    })().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }
  return bootstrapPromise;
}
