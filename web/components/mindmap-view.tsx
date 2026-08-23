"use client";

import { useMemo, useState } from "react";
import { layout, COLOR_FOR, type Graph } from "@/lib/mindmap/graph";

function esc(v: string) {
  return v.replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c] || c);
}

export function MindmapView({ graph }: { graph: Graph }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const nodes = useMemo(() => layout(graph.nodes.map((n) => ({ ...n }))), [graph.nodes]);
  const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const selected = selectedId ? nodeById[selectedId] : null;
  const connections = selectedId
    ? graph.edges.filter((e) => e.from === selectedId || e.to === selectedId)
    : [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <div className="overflow-auto rounded-xl border border-border/60 bg-card/60">
        <svg viewBox="0 0 1040 620" role="img" aria-label="SEM Brain operating mindmap" className="w-full">
          {graph.edges.map((e, i) => {
            const a = nodeById[e.from];
            const b = nodeById[e.to];
            if (!a || !b) return null;
            return (
              <g key={i}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#94a3b8" strokeWidth={1.4} opacity={0.4} />
                <text x={(a.x! + b.x!) / 2} y={(a.y! + b.y!) / 2} fontSize={8} fill="#64748b" opacity={0.7}>
                  {e.label}
                </text>
              </g>
            );
          })}
          {nodes.map((n) => {
            const r = n.type === "center" ? 42 : 24;
            const label = n.label.length > 30 ? n.label.slice(0, 30) + "…" : n.label;
            return (
              <g
                key={n.id}
                className="cursor-pointer"
                onClick={() => setSelectedId(n.id)}
              >
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={r}
                  fill={COLOR_FOR[n.type]}
                  stroke={selectedId === n.id ? "#0f172a" : "white"}
                  strokeWidth={selectedId === n.id ? 4 : 3}
                />
                <text x={n.x} y={n.y! + (n.type === "center" ? 3 : -2)} textAnchor="middle" fontSize={10} fontWeight={900} fill="white">
                  {esc(label)}
                </text>
                <text x={n.x} y={n.y! + r + 15} textAnchor="middle" fontSize={9} fontWeight={800} fill="#334155">
                  {esc(n.sub || n.type)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/80 p-4">
        <h3 className="mb-2 text-sm font-bold">Node inspector</h3>
        {selected ? (
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <b>{selected.label}</b>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{selected.type}</span>
            </div>
            {selected.sub && <p className="text-muted-foreground">{selected.sub}</p>}
            <h4 className="mt-2 text-xs font-bold text-muted-foreground">Connections</h4>
            <ul className="flex flex-col gap-1 text-xs">
              {connections.length === 0 && <li className="text-muted-foreground">No connections</li>}
              {connections.map((c, i) => (
                <li key={i}>
                  {c.from === selectedId ? "→" : "←"} {c.label || "linked"}{" "}
                  {nodeById[c.from === selectedId ? c.to : c.from]?.label ?? (c.from === selectedId ? c.to : c.from)}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Click any node to inspect context and links.</p>
        )}
      </div>
    </div>
  );
}
