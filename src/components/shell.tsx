"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const nav = [
  {
    heading: "Platform",
    items: [
      { href: "/", label: "Overview", hint: "topology" },
      { href: "/infrastructure", label: "Infrastructure", hint: "terraform" },
      { href: "/kubernetes", label: "Kubernetes", hint: "workloads" },
    ],
  },
  {
    heading: "Delivery",
    items: [
      { href: "/pipelines", label: "Pipelines", hint: "jenkins" },
      { href: "/monitoring", label: "Monitoring", hint: "uat / prod" },
    ],
  },
  {
    heading: "Operations",
    items: [
      { href: "/secrets", label: "Secrets & IAM", hint: "access" },
      { href: "/runbook", label: "Runbook", hint: "13 issues" },
    ],
  },
];

const titleByPath: Record<string, string> = {
  "/": "Overview",
  "/infrastructure": "Infrastructure",
  "/kubernetes": "Kubernetes",
  "/pipelines": "Pipelines",
  "/monitoring": "Monitoring",
  "/secrets": "Secrets & IAM",
  "/runbook": "Runbook",
};

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col lg:flex-row">
      <aside className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur lg:h-screen lg:w-[248px] lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-4 py-4 lg:px-5 lg:py-5">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-md border border-accent/40 bg-accent/10 text-[12px] font-bold text-accent mono">
              EH
            </span>
            <span className="leading-tight">
              <span className="mono block text-[11px] font-semibold uppercase tracking-[0.18em] text-text">
                enterprise-hybrid
              </span>
              <span className="mono block text-[10px] uppercase tracking-[0.22em] text-muted">
                devops control plane
              </span>
            </span>
          </Link>
          <span className="mono rounded border border-line px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-muted lg:hidden">
            v1.0
          </span>
        </div>

        <nav className="flex gap-6 overflow-x-auto border-t border-line-soft px-4 py-3 lg:flex-col lg:gap-6 lg:overflow-visible lg:border-t-0 lg:px-3 lg:py-2">
          {nav.map((group) => (
            <div key={group.heading} className="min-w-max lg:min-w-0">
              <p className="mono hidden px-2 pb-1.5 text-[9px] uppercase tracking-[0.22em] text-muted/70 lg:block">
                {group.heading}
              </p>
              <ul className="flex gap-1 lg:flex-col">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors ${
                          active
                            ? "bg-panel-2 text-text shadow-[inset_2px_0_0_0_var(--color-accent)]"
                            : "text-muted hover:bg-panel/70 hover:text-text"
                        }`}
                      >
                        <span className="whitespace-nowrap">{item.label}</span>
                        <span className="mono hidden text-[9px] uppercase tracking-[0.12em] text-muted/60 lg:inline">
                          {item.hint}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mono hidden px-4 pb-6 pt-8 text-[10px] leading-relaxed text-muted/70 lg:block">
          <p className="text-muted/90">aws · eu-west-1</p>
          <p>7 terraform modules</p>
          <p>3 jenkins pipelines</p>
          <p className="mt-3 text-accent/70">● uat · prometheus</p>
          <p className="text-cyan/70">● prod · dynatrace</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-ink/85 px-4 py-2.5 backdrop-blur sm:px-6">
          <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted">
            <span className="text-muted/60">ehd</span>
            <span className="text-muted/40">/</span>
            <span className="text-text">{titleByPath[pathname] ?? "Console"}</span>
          </div>
          <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-[0.12em]">
            <span className="hidden items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-muted sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              uat
            </span>
            <span className="hidden items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-muted sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
              prod
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-accent">
              repo synced
            </span>
          </div>
        </div>
        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        <footer className="mono flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-4 text-[10px] uppercase tracking-[0.14em] text-muted/70 sm:px-6 lg:px-8">
          <span>enterprise-hybrid-devops · interview reference implementation</span>
          <span>terraform · jenkins · eks · wildfly</span>
        </footer>
      </div>
    </div>
  );
}
