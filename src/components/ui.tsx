import type { ReactNode } from "react";

export function Panel({
  title,
  kicker,
  actions,
  children,
  className = "",
  padded = true,
}: {
  title?: string;
  kicker?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-panel/80 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.9)] backdrop-blur-[2px] ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-4 py-3 sm:px-5">
          <div>
            {kicker && (
              <p className="mono text-[10px] uppercase tracking-[0.18em] text-muted">{kicker}</p>
            )}
            {title && <h2 className="mt-0.5 text-sm font-semibold tracking-tight text-text">{title}</h2>}
          </div>
          {actions}
        </header>
      )}
      <div className={padded ? "px-4 py-4 sm:px-5" : ""}>{children}</div>
    </section>
  );
}

const toneMap: Record<string, string> = {
  ok: "border-accent/35 bg-accent/10 text-accent",
  warn: "border-amber/35 bg-amber/10 text-amber",
  bad: "border-danger/35 bg-danger/10 text-danger",
  info: "border-cyan/35 bg-cyan/10 text-cyan",
  neutral: "border-line bg-panel-2 text-muted",
};

export type Tone = keyof typeof toneMap;

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`mono inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] ${toneMap[tone] ?? toneMap.neutral} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusDot({ tone = "neutral" }: { tone?: Tone }) {
  const color =
    tone === "ok"
      ? "bg-accent"
      : tone === "warn"
        ? "bg-amber"
        : tone === "bad"
          ? "bg-danger"
          : tone === "info"
            ? "bg-cyan"
            : "bg-muted";
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className={`absolute inset-0 rounded-full ${color} opacity-70`} />
      <span className={`relative m-auto h-1.5 w-1.5 rounded-full ${color}`} />
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone: Tone =
    normalized === "succeeded" || normalized === "healthy" || normalized === "active"
      ? "ok"
      : normalized === "rolled_back" || normalized === "degraded"
        ? "warn"
        : normalized === "failed" || normalized === "critical"
          ? "bad"
          : "neutral";
  return (
    <span
      className={`mono inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${toneMap[tone]}`}
    >
      <StatusDot tone={tone} />
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel/70 px-4 py-3.5">
      <p className="mono text-[10px] uppercase tracking-[0.16em] text-muted">{label}</p>
      <p
        className={`mono mt-1.5 text-2xl font-medium tabular-nums ${
          tone === "ok" ? "text-accent" : tone === "bad" ? "text-danger" : tone === "warn" ? "text-amber" : "text-text"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

export function Command({ children, label }: { children: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line-soft bg-[#060b12]">
      {label && (
        <div className="mono border-b border-line-soft px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-muted">
          {label}
        </div>
      )}
      <pre className="mono overflow-x-auto px-3 py-2.5 text-[11.5px] leading-relaxed text-[#c8f08a]">
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <span className="mono text-[10px] uppercase tracking-[0.14em] text-muted">{label}</span>
      <span className="text-[13px] leading-snug text-text">{children}</span>
    </div>
  );
}

export function Arrow() {
  return <span className="mono text-muted">→</span>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow: string;
  title: string;
  description: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div className="max-w-3xl">
        <p className="mono text-[10px] uppercase tracking-[0.22em] text-accent">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text sm:text-[28px]">{title}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{description}</p>
      </div>
      {right}
    </header>
  );
}
