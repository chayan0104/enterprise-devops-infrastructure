/** Types used by the seed data so the inserts stay type-checked. */

export type EnvironmentSeed = {
  slug: string;
  name: string;
  awsAccount: string;
  region: string;
  vpcCidr: string;
  clusterName: string;
  stateKey: string;
  natGateways: number;
  wildflyCapacity: string;
  eksCapacity: string;
  monitoring: string;
  endpointAccess: string;
  terraformRole: string;
  notes: string;
};

export type ComponentSeed = {
  slug: string;
  name: string;
  kind: string;
  runtime: string;
  namespace: string;
  artifact: string;
  replicasUat: string;
  replicasProd: string;
  description: string;
};

export type DeploymentSeed = {
  component: string;
  environment: string;
  version: string;
  imageTag: string;
  status: "succeeded" | "failed" | "rolled_back";
  actor: string;
  pipeline: string;
  changeId: string | null;
  durationSeconds: number;
  startedAt: Date;
  notes: string | null;
};

export type RunbookSeed = {
  slug: string;
  category: string;
  title: string;
  severity: "critical" | "high" | "medium";
  scope: string;
  symptom: string;
  likelyCause: string;
  commands: string;
  correctiveAction: string;
};

export type ManifestSeed = {
  path: string;
  kind: string;
  purpose: string;
  explanation: string;
  snippet: string;
};

export type SecretSeed = {
  path: string;
  consumer: string;
  payload: string;
  owner: string;
  rotation: string;
  accessPath: string;
};

export type Artifact = {
  id: number;
  path: string;
  category: string;
  purpose: string;
  sortOrder: number;
};
