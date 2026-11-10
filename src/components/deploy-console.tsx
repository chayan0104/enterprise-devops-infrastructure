"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { DeploymentView } from "@/lib/queries";
import { Badge, StatusPill } from "@/components/ui";
import { formatDuration, formatUtc } from "@/lib/format";

type Option = { slug: string; name: string };

export function DeployConsole({
  components,
  environments,
  deployments,
}: {
  components: Option[];
  environments: Option[];
  deployments: DeploymentView[];
}) {
  const router = useRouter();
  const [componentSlug, setComponentSlug] = useState(components[0]?.slug ?? "");
  const [environmentSlug, setEnvironmentSlug] = useState("uat");
  const [version, setVersion] = useState("");
  const [changeId, setChangeId] = useState("");
  const [actor, setActor] = useState("console/operator");
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad" | "warn"; text: string } | null>(null);

  const selectedComponent = useMemo(
    () => components.find((component) => component.slug === componentSlug),
    [components, componentSlug],
  );

  const isProd = environmentSlug === "prod";

  async function deploy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentSlug, environmentSlug, version, changeId, actor }),
      });
      const payload: { error?: string; deployment?: DeploymentView } = await response.json();

      if (!response.ok) {
        setMessage({ tone: "bad", text: payload.error ?? "Deployment rejected" });
        return;
      }

      setMessage({
        tone: "ok",
        text: `${payload.deployment?.componentName}:${payload.deployment?.version} deployed to ${payload.deployment?.environmentSlug.toUpperCase()} · image ${payload.deployment?.imageTag}`,
      });
      setVersion("");
      router.refresh();
    } catch {
      setMessage({ tone: "bad", text: "Request failed — check the server log." });
    } finally {
      setPending(false);
    }
  }

  async function rollback(id: number) {
    setBusyId(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/deployments/${id}/rollback`, { method: "POST" });
      const payload: { error?: string; deployment?: DeploymentView } = await response.json();
      if (!response.ok) {
        setMessage({ tone: "bad", text: payload.error ?? "Rollback failed" });
        return;
      }
      setMessage({
        tone: "warn",
        text: `Rolled back ${payload.deployment?.componentName} on ${payload.deployment?.environmentSlug.toUpperCase()} → restored ${payload.deployment?.version}`,
      });
      router.refresh();
    } catch {
      setMessage({ tone: "bad", text: "Rollback request failed." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <form
        onSubmit={deploy}
        className="space-y-3 rounded-lg border border-line-soft bg-panel-2/50 p-4"
      >
        <div>
          <p className="mono text-[10px] uppercase tracking-[0.16em] text-accent">simulate a pipeline run</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            Writes a deployment record the same way the Jenkinsfile does, including the production change-reference
            rule. No AWS calls are made from this console.
          </p>
        </div>

        <label className="block">
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-muted">component</span>
          <select
            value={componentSlug}
            onChange={(event) => setComponentSlug(event.target.value)}
            className="mono mt-1 w-full rounded-md border border-line bg-ink px-2.5 py-2 text-[12px] text-text outline-none focus:border-accent/50"
          >
            {components.map((component) => (
              <option key={component.slug} value={component.slug}>
                {component.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-muted">environment</span>
          <select
            value={environmentSlug}
            onChange={(event) => setEnvironmentSlug(event.target.value)}
            className="mono mt-1 w-full rounded-md border border-line bg-ink px-2.5 py-2 text-[12px] text-text outline-none focus:border-accent/50"
          >
            {environments.map((environment) => (
              <option key={environment.slug} value={environment.slug}>
                {environment.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-muted">version</span>
          <input
            value={version}
            onChange={(event) => setVersion(event.target.value)}
            placeholder={selectedComponent?.slug === "main-app" ? "3.4.2" : "1.8.4"}
            className="mono mt-1 w-full rounded-md border border-line bg-ink px-2.5 py-2 text-[12px] text-text placeholder:text-muted/50 outline-none focus:border-accent/50"
          />
        </label>

        <label className="block">
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-muted">
            change id {isProd ? <span className="text-amber">(required for prod)</span> : "(optional)"}
          </span>
          <input
            value={changeId}
            onChange={(event) => setChangeId(event.target.value)}
            placeholder="CHG0045341"
            className="mono mt-1 w-full rounded-md border border-line bg-ink px-2.5 py-2 text-[12px] text-text placeholder:text-muted/50 outline-none focus:border-accent/50"
          />
        </label>

        <label className="block">
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-muted">approved by</span>
          <input
            value={actor}
            onChange={(event) => setActor(event.target.value)}
            className="mono mt-1 w-full rounded-md border border-line bg-ink px-2.5 py-2 text-[12px] text-text outline-none focus:border-accent/50"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="mono w-full rounded-md border border-accent/40 bg-accent/15 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-accent transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "running stages…" : "run deploy"}
        </button>

        {message && (
          <p
            className={`rounded-md border px-2.5 py-2 text-[11px] leading-relaxed ${
              message.tone === "ok"
                ? "border-accent/30 bg-accent/10 text-accent"
                : message.tone === "warn"
                  ? "border-amber/30 bg-amber/10 text-amber"
                  : "border-danger/30 bg-danger/10 text-danger"
            }`}
          >
            {message.text}
          </p>
        )}

        <p className="text-[10.5px] leading-relaxed text-muted/80">
          Real pipeline roles: <span className="mono text-cyan">ehd-app-deploy</span> for applications,
          <span className="mono text-cyan"> ehd-&lt;env&gt;-terraform-deploy</span> for infrastructure.
        </p>
      </form>

      <div className="min-w-0 overflow-hidden rounded-lg border border-line-soft">
        <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
          <span className="mono text-[10px] uppercase tracking-[0.16em] text-muted">deployment history</span>
          <Badge tone="neutral">{deployments.length} records</Badge>
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="mono sticky top-0 bg-panel-2 text-[9px] uppercase tracking-[0.14em] text-muted">
              <tr>
                <th className="px-3 py-2 font-normal">component</th>
                <th className="px-2 py-2 font-normal">env</th>
                <th className="px-2 py-2 font-normal">version / tag</th>
                <th className="px-2 py-2 font-normal">status</th>
                <th className="px-2 py-2 font-normal">when · dur</th>
                <th className="px-2 py-2 font-normal">action</th>
              </tr>
            </thead>
            <tbody>
              {deployments.map((deployment) => (
                <tr key={deployment.id} className="border-t border-line-soft text-[12px]">
                  <td className="px-3 py-2">
                    <span className="text-text">{deployment.componentName}</span>
                    <span className="mono block text-[9.5px] text-muted">{deployment.actor}</span>
                  </td>
                  <td className="mono px-2 py-2 text-[10px] uppercase text-muted">{deployment.environmentSlug}</td>
                  <td className="mono px-2 py-2 text-[10.5px] text-text">
                    {deployment.version}
                    <span className="block text-muted">{deployment.imageTag}</span>
                  </td>
                  <td className="px-2 py-2">
                    <StatusPill status={deployment.status} />
                  </td>
                  <td className="mono px-2 py-2 text-[10px] text-muted">
                    {formatUtc(deployment.startedAt)}
                    <span className="block">{formatDuration(deployment.durationSeconds)}</span>
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => rollback(deployment.id)}
                      disabled={busyId === deployment.id}
                      className="mono rounded border border-line px-2 py-1 text-[9.5px] uppercase tracking-[0.1em] text-muted transition-colors hover:border-amber/40 hover:text-amber disabled:opacity-40"
                    >
                      {busyId === deployment.id ? "…" : "rollback"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
