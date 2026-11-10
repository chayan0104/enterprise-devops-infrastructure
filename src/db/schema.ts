import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Operational data for the Enterprise Hybrid DevOps control plane.
 * The Terraform/Kubernetes/Jenkins source of truth is the repository; these
 * tables hold the environment inventory and the deployment/runbook records the
 * portal reads and writes at runtime.
 */

export const environments = pgTable("environments", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  awsAccount: text("aws_account").notNull(),
  region: text("region").notNull(),
  vpcCidr: text("vpc_cidr").notNull(),
  clusterName: text("cluster_name").notNull(),
  stateKey: text("state_key").notNull(),
  natGateways: integer("nat_gateways").notNull(),
  wildflyCapacity: text("wildfly_capacity").notNull(),
  eksCapacity: text("eks_capacity").notNull(),
  monitoring: text("monitoring").notNull(),
  endpointAccess: text("endpoint_access").notNull(),
  terraformRole: text("terraform_role").notNull(),
  notes: text("notes").notNull(),
});

export const components = pgTable("components", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // wildfly | spring | consumer
  runtime: text("runtime").notNull(),
  namespace: text("namespace").notNull(),
  artifact: text("artifact").notNull(),
  critical: boolean("critical").notNull().default(true),
  replicasUat: text("replicas_uat").notNull(),
  replicasProd: text("replicas_prod").notNull(),
  description: text("description").notNull(),
});

export const deployments = pgTable("deployments", {
  id: serial("id").primaryKey(),
  componentId: integer("component_id")
    .notNull()
    .references(() => components.id, { onDelete: "cascade" }),
  environmentId: integer("environment_id")
    .notNull()
    .references(() => environments.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  imageTag: text("image_tag").notNull(),
  status: text("status").notNull(), // succeeded | failed | rolled_back
  actor: text("actor").notNull(),
  pipeline: text("pipeline").notNull(),
  changeId: text("change_id"),
  durationSeconds: integer("duration_seconds").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
});

export const runbooks = pgTable("runbooks", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  severity: text("severity").notNull(), // critical | high | medium
  scope: text("scope").notNull(),
  symptom: text("symptom").notNull(),
  likelyCause: text("likely_cause").notNull(),
  commands: text("commands").notNull(),
  correctiveAction: text("corrective_action").notNull(),
});

export const manifests = pgTable("manifests", {
  id: serial("id").primaryKey(),
  path: text("path").notNull().unique(),
  kind: text("kind").notNull(),
  purpose: text("purpose").notNull(),
  explanation: text("explanation").notNull(),
  snippet: text("snippet").notNull(),
});

export const secretInventory = pgTable("secret_inventory", {
  id: serial("id").primaryKey(),
  path: text("path").notNull().unique(),
  consumer: text("consumer").notNull(),
  payload: text("payload").notNull(),
  owner: text("owner").notNull(),
  rotation: text("rotation").notNull(),
  accessPath: text("access_path").notNull(),
});

export const artifacts = pgTable(
  "artifacts",
  {
    id: serial("id").primaryKey(),
    path: text("path").notNull(),
    category: text("category").notNull(),
    purpose: text("purpose").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [uniqueIndex("artifacts_path_idx").on(table.path)],
);

export type Environment = typeof environments.$inferSelect;
export type Component = typeof components.$inferSelect;
export type Deployment = typeof deployments.$inferSelect;
export type Runbook = typeof runbooks.$inferSelect;
export type Manifest = typeof manifests.$inferSelect;
export type SecretRecord = typeof secretInventory.$inferSelect;
export type Artifact = typeof artifacts.$inferSelect;
