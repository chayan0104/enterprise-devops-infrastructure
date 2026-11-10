import Link from "next/link";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { getRunbookCategories, getRunbooks } from "@/lib/queries";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string | string[]; category?: string | string[] }>;

const severityTone = (severity: string) =>
  severity === "critical" ? "bad" : severity === "high" ? "warn" : "info";

export default async function RunbookPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const rawQuery = params.q;
  const rawCategory = params.category;
  const q = typeof rawQuery === "string" ? rawQuery : "";
  const category = typeof rawCategory === "string" ? rawCategory : "all";

  const [entries, categories] = await Promise.all([
    getRunbooks({ q, category }),
    getRunbookCategories(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations · runbook"
        title="Symptom → likely cause → commands → corrective action."
        description="Searchable from Postgres. Each entry is the short version of docs/TROUBLESHOOTING.md: enough to triage in an incident channel without opening the repository."
        right={<Badge tone="info">{entries.length} entries</Badge>}
      />

      <Panel padded={false}>
        <div className="border-b border-line-soft px-4 py-3 sm:px-5">
          <form method="get" action="/runbook" className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="search: 502, crashloop, oracle, assume role, sslhandshake…"
              className="mono min-w-[220px] flex-1 rounded-md border border-line bg-ink px-3 py-2 text-[12px] text-text placeholder:text-muted/50 outline-none focus:border-accent/50"
            />
            {category !== "all" && <input type="hidden" name="category" value={category} />}
            <button
              type="submit"
              className="mono rounded-md border border-accent/40 bg-accent/15 px-3 py-2 text-[10.5px] uppercase tracking-[0.12em] text-accent hover:bg-accent/25"
            >
              search
            </button>
            {(q || category !== "all") && (
              <Link
                href="/runbook"
                className="mono rounded-md border border-line px-3 py-2 text-[10.5px] uppercase tracking-[0.12em] text-muted hover:text-text"
              >
                reset
              </Link>
            )}
          </form>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <Link
              href={q ? `/runbook?q=${encodeURIComponent(q)}` : "/runbook"}
              className={`mono rounded border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${
                category === "all"
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-line bg-panel-2 text-muted hover:text-text"
              }`}
            >
              all
            </Link>
            {categories.map((item) => {
              const href = `/runbook?category=${encodeURIComponent(item)}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
              const active = category === item;
              return (
                <Link
                  key={item}
                  href={href}
                  className={`mono rounded border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${
                    active
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-line bg-panel-2 text-muted hover:text-text"
                  }`}
                >
                  {item}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="divide-y divide-line-soft">
          {entries.length === 0 && (
            <p className="px-5 py-8 text-center text-[12px] text-muted">
              No runbook entry matches that search. Try a port, an error class or a component name.
            </p>
          )}

          {entries.map((entry) => (
            <details key={entry.id} className="group px-4 py-3 sm:px-5">
              <summary className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mono mt-0.5 text-[10px] text-muted/70 transition-colors group-open:text-accent">
                    ▸
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-text">{entry.title}</p>
                    <p className="mono mt-0.5 text-[9.5px] uppercase tracking-[0.12em] text-muted">
                      {entry.category} · {entry.scope}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge tone={severityTone(entry.severity)}>{entry.severity}</Badge>
                </div>
              </summary>

              <div className="mt-3 grid gap-3 lg:grid-cols-[1.15fr_1fr]">
                <div className="space-y-2.5">
                  <div>
                    <p className="mono text-[9px] uppercase tracking-[0.16em] text-cyan">symptom</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-text">{entry.symptom}</p>
                  </div>
                  <div>
                    <p className="mono text-[9px] uppercase tracking-[0.16em] text-cyan">likely cause</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted">{entry.likelyCause}</p>
                  </div>
                  <div>
                    <p className="mono text-[9px] uppercase tracking-[0.16em] text-accent">corrective action</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted">{entry.correctiveAction}</p>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="mono mb-1 text-[9px] uppercase tracking-[0.16em] text-muted">commands</p>
                  <pre className="mono max-h-[320px] overflow-auto rounded-lg border border-line-soft bg-[#060b12] px-3 py-2.5 text-[11px] leading-relaxed text-[#c8f08a]">
                    <code>{entry.commands}</code>
                  </pre>
                </div>
              </div>
            </details>
          ))}
        </div>
      </Panel>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          {
            title: "Scope first",
            body: "aws sts get-caller-identity and kubectl config current-context. Most incidents are the wrong account, region or cluster.",
          },
          {
            title: "Platform vs application",
            body: "Target health and endpointslices separate a routing problem from an application failure before you read a log line.",
          },
          {
            title: "Restore, then fix",
            body: "Roll back to the last immutable artifact, then investigate. Never debug forward on a degraded production service.",
          },
        ].map((card) => (
          <div key={card.title} className="rounded-xl border border-line bg-panel/70 p-4">
            <p className="mono text-[10px] uppercase tracking-[0.16em] text-accent">{card.title}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{card.body}</p>
          </div>
        ))}
      </div>

      <p className="mono text-[10px] uppercase tracking-[0.12em] text-muted/70">
        json api: <span className="text-cyan">GET /api/runbook?q=oracle&amp;category=Dependencies</span>
      </p>
    </div>
  );
}
