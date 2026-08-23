// Ported from js/modules/mindmap.js — same node types, same radial-ring layout math.
// Phase 1 scope covers company/project/person/task/approval/agent rings only (the
// entities with real Phase 1 tables); sales/memory/document/product/inventory/quote
// rings return in Phase 2 once those modules exist, per the rewrite plan.
export type NodeType =
  | "center"
  | "company"
  | "project"
  | "person"
  | "task"
  | "approval"
  | "agent";

export type GraphNode = {
  id: string;
  label: string;
  type: NodeType;
  sub?: string;
  risk?: string | number | null;
  x?: number;
  y?: number;
};

export type GraphEdge = { from: string; to: string; label: string };

export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

export const COLOR_FOR: Record<NodeType, string> = {
  center: "#0f172a",
  company: "#f59e0b",
  project: "#3b82f6",
  person: "#22c55e",
  task: "#8b5cf6",
  approval: "#ef4444",
  agent: "#06b6d4",
};

const RINGS: Array<[NodeType, number]> = [
  ["company", 150],
  ["project", 220],
  ["person", 285],
  ["agent", 345],
  ["task", 395],
  ["approval", 440],
];

export function layout(nodes: GraphNode[]): GraphNode[] {
  const center = { x: 520, y: 300 };
  const buckets: Record<string, GraphNode[]> = {
    company: [],
    project: [],
    person: [],
    task: [],
    approval: [],
    agent: [],
  };

  nodes.forEach((n) => {
    if (n.type === "center") {
      n.x = center.x;
      n.y = center.y;
    } else {
      (buckets[n.type] || buckets.task).push(n);
    }
  });

  RINGS.forEach(([type, r], ringIdx) => {
    const arr = buckets[type] || [];
    const start = ((-70 + ringIdx * 17) * Math.PI) / 180;
    arr.forEach((n, i) => {
      const angle = start + 2 * Math.PI * (i / (arr.length || 1));
      n.x = center.x + Math.cos(angle) * r;
      n.y = center.y + Math.sin(angle) * Math.min(r, 260);
    });
  });

  return nodes;
}
