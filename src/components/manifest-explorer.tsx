"use client";

import { useState } from "react";
import type { Manifest } from "@/db/schema";

export function ManifestExplorer({ manifests }: { manifests: Manifest[] }) {
  const [selectedPath, setSelectedPath] = useState(manifests[0]?.path ?? "");
  const selected = manifests.find((manifest) => manifest.path === selectedPath) ?? manifests[0];

  if (!selected) {
    return <p className="text-[12px] text-muted">No manifests loaded.</p>;
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
      <div className="space-y-1">
        {manifests.map((manifest) => {
          const active = manifest.path === selected.path;
          return (
            <button
              key={manifest.path}
              type="button"
              onClick={() => setSelectedPath(manifest.path)}
              className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                active
                  ? "border-accent/40 bg-accent/10"
                  : "border-line-soft bg-panel-2/40 hover:border-line hover:bg-panel-2/80"
              }`}
            >
              <span className={`mono block text-[10.5px] leading-snug ${active ? "text-accent" : "text-text"}`}>
                {manifest.path.replace("kubernetes/", "")}
              </span>
              <span className="mt-0.5 block text-[10px] uppercase tracking-[0.1em] text-muted">{manifest.kind}</span>
            </button>
          );
        })}
      </div>

      <div className="min-w-0 rounded-lg border border-line-soft bg-panel-2/40">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5">
          <span className="mono text-[11px] text-text">{selected.path}</span>
          <span className="mono rounded border border-cyan/30 bg-cyan/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-cyan">
            {selected.kind}
          </span>
        </div>
        <div className="space-y-3 px-4 py-3">
          <div>
            <p className="mono text-[9px] uppercase tracking-[0.16em] text-muted">why it exists</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-text">{selected.purpose}</p>
          </div>
          <div>
            <p className="mono text-[9px] uppercase tracking-[0.16em] text-muted">in plain language</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">{selected.explanation}</p>
          </div>
          <pre className="mono overflow-x-auto rounded-lg border border-line-soft bg-[#060b12] px-3 py-2.5 text-[11px] leading-relaxed text-[#c8f08a]">
            <code>{selected.snippet}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
